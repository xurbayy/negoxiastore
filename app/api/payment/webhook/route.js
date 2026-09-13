import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb, schemaReady } from '../../../lib/db';
import { getLatestSnapshot } from '../../../lib/snapshot';
import { touchActivity } from '../../../lib/activity';

export const dynamic = 'force-dynamic';

// POST /api/payment/webhook - webhook Midtrans (PUBLIK, tanpa Bearer).
// Wajib verifikasi signature + idempotency via webhook_events.
export async function POST(request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ ok: false }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const {
    order_id, status_code, gross_amount, signature_key,
    transaction_status, fraud_status,
  } = body || {};
  if (!order_id || !signature_key) return NextResponse.json({ ok: false }, { status: 400 });

  // 1. Verifikasi signature: sha512(order_id + status_code + gross_amount + ServerKey)
  const expected = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest('hex');
  if (signature_key !== expected) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 403 });
  }

  // 2. Idempotency: event_id = sha512(signature_key + transaction_status)
  const eventId = crypto.createHash('sha512').update(`${signature_key}${transaction_status}`).digest('hex');
  await schemaReady();
  const db = getDb();

  const seen = await db.execute({
    sql: 'SELECT 1 as x FROM webhook_events WHERE event_id = ?',
    args: [eventId],
  });
  if (seen.rows.length) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // 3. Cari order berdasarkan order_id Midtrans (kolom gateway_ref saat pending = snap token;
  //    order_id Midtrans format NEXO-<id>-<ts> -> ambil id tengah)
  const m = /^NEXO-(\d+)-\d+$/.exec(String(order_id));
  if (!m) {
    await db.execute({
      sql: 'INSERT INTO webhook_events (event_id, gateway, payload, processed_at) VALUES (?, ?, ?, ?)',
      args: [eventId, 'midtrans', JSON.stringify(body), Date.now()],
    });
    return NextResponse.json({ ok: true, unknown_order: true });
  }
  const orderId = Number(m[1]);

  // 4. Update status sesuai transaction_status
  const txStatus = Array.isArray(transaction_status) ? transaction_status[0] : transaction_status;
  const paid = status_code === '200' && (txStatus === 'settlement' || txStatus === 'capture') && (!fraud_status || fraud_status === 'accept');
  const failed = txStatus === 'expire' || txStatus === 'cancel' || txStatus === 'deny';

  // Krusial: uang masuk TAPI bot sedang mati -> JANGAN tandai paid, JANGAN catat
  // event, dan balas 500 supaya Midtrans RETRY webhook-nya sendiri. (Dulu balas
  // 200 deferred: Midtrans berhenti retry dan settlement menggantung sampai user
  // buka /premium lagi - uang masuk tanpa jejak. Idempotensi juga tidak boleh
  // keburu tercatat, karena retry dengan event_id sama akan dianggap duplicate.)
  // Cadangan tetap: poll GET /api/payment/snap + rekonsiliasi premium.
  if (paid) {
    const liveSnap = await getLatestSnapshot();
    if (!liveSnap || Date.now() - Number(liveSnap.ts) > 3 * 60 * 1000) {
      return NextResponse.json({ ok: false, error: 'bot offline, coba ulang' }, { status: 500 });
    }
  }

  if (paid) {
    const now = Date.now();
    // TRANSISI ATOMIK: hanya pemenang UPDATE yang enqueue grant (poll 2 dtk
    // & webhook tidak dobel antrean). Gross amount harus = harga order.
    const order = await db.execute({
      sql: 'SELECT discord_id, amount FROM orders WHERE id = ?',
      args: [orderId],
    });
    const orow = order.rows[0];
    if (orow && String(gross_amount) === String(Number(orow.amount))) {
      const flip = await db.execute({
        sql: "UPDATE orders SET status = 'paid', paid_at = ?, gateway_ref = ? WHERE id = ? AND status IN ('pending', 'canceled', 'expired')",
        args: [now, String(order_id), orderId],
      });
      if (flip.rowsAffected > 0 && orow.discord_id) {
        await db.execute({
          sql: "INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES ('grant_premium', ?, 'midtrans', 'pending', ?)",
          args: [JSON.stringify({ userId: orow.discord_id, tier: 'pro', days: 30 }), now],
        });
        await db.execute({
          sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
          args: [orow.discord_id, now],
        });
      }
    }
  } else if (failed) {
    const status = transaction_status === 'expire' ? 'expired' : transaction_status === 'cancel' ? 'canceled' : 'failed';
    await db.execute({
      sql: 'UPDATE orders SET status = ? WHERE id = ? AND status = ?',
      args: [status, orderId, 'pending'],
    });
  }

  // 5. Catat event (semua kasus)
  await db.execute({
    sql: 'INSERT INTO webhook_events (event_id, gateway, payload, processed_at) VALUES (?, ?, ?, ?)',
    args: [eventId, 'midtrans', JSON.stringify(body), Date.now()],
  });

  await touchActivity().catch(() => {});
  return NextResponse.json({ ok: true });
}
