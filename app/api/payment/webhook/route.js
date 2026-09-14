import crypto from 'crypto';
import { getDb, schemaReady } from '../../../lib/db';
import { getLatestSnapshot } from '../../../lib/snapshot';
import { touchActivity } from '../../../lib/activity';

export const dynamic = 'force-dynamic';

// POST /api/payment/webhook - webhook Duitku (PUBLIK, tanpa Bearer).
// Wajib verifikasi signature MD5 + idempotency via webhook_events.
// Duitku mengirim body sebagai application/x-www-form-urlencoded ATAU JSON.
export async function POST(request) {
  const merchantCode = process.env.DUITKU_MERCHANT_CODE;
  const apiKey = process.env.DUITKU_API_KEY;
  if (!merchantCode || !apiKey) return new Response('OK', { status: 503 });

  // Parse body - Duitku bisa kirim form-urlencoded atau JSON
  let body;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      // application/x-www-form-urlencoded
      const text = await request.text();
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch {
    return new Response('OK', { status: 400 });
  }

  const {
    merchantOrderId, amount, resultCode, signature,
    reference,
  } = body || {};
  if (!merchantOrderId || !signature) return new Response('OK', { status: 400 });

  // 1. Verifikasi signature: MD5(merchantCode + amount + merchantOrderId + apiKey)
  const expected = crypto
    .createHash('md5')
    .update(`${merchantCode}${amount}${merchantOrderId}${apiKey}`)
    .digest('hex');
  if (signature !== expected) {
    console.warn('[duitku-webhook] invalid signature', merchantOrderId);
    return new Response('Invalid Signature', { status: 403 });
  }

  // 2. Idempotency: event_id = md5(signature + resultCode)
  const eventId = crypto.createHash('md5').update(`${signature}${resultCode}`).digest('hex');
  await schemaReady();
  const db = getDb();

  const seen = await db.execute({
    sql: 'SELECT 1 as x FROM webhook_events WHERE event_id = ?',
    args: [eventId],
  });
  if (seen.rows.length) {
    return new Response('OK', { status: 200 });
  }

  // 3. Cari order berdasarkan merchantOrderId (format NEXO-<id>-<ts> -> ambil id tengah)
  const m = /^NEXO-(\d+)-\d+$/.exec(String(merchantOrderId));
  if (!m) {
    await db.execute({
      sql: 'INSERT INTO webhook_events (event_id, gateway, payload, processed_at) VALUES (?, ?, ?, ?)',
      args: [eventId, 'duitku', JSON.stringify(body), Date.now()],
    });
    return new Response('OK', { status: 200 });
  }
  const orderId = Number(m[1]);

  // 4. Tentukan status dari resultCode
  //    "00" = Success/Lunas, "01" = Pending/Gagal, "02" = Expired/Batal
  const paid = String(resultCode) === '00';
  const failed = String(resultCode) === '02';

  // Krusial: uang masuk TAPI bot sedang mati -> JANGAN tandai paid, JANGAN catat
  // event, dan balas 500 supaya Duitku RETRY webhook-nya sendiri.
  if (paid) {
    const liveSnap = await getLatestSnapshot();
    if (!liveSnap || Date.now() - Number(liveSnap.ts) > 3 * 60 * 1000) {
      return new Response('bot offline, retry later', { status: 500 });
    }
  }

  if (paid) {
    const now = Date.now();
    // TRANSISI ATOMIK: hanya pemenang UPDATE yang enqueue grant (poll 2 dtk
    // & webhook tidak dobel antrean). Amount harus = harga order.
    const order = await db.execute({
      sql: 'SELECT discord_id, amount FROM orders WHERE id = ?',
      args: [orderId],
    });
    const orow = order.rows[0];
    // Bandingkan NUMERIK - Duitku kadang kirim "20000.00"
    if (orow && Number(amount) === Number(orow.amount)) {
      const flip = await db.execute({
        sql: "UPDATE orders SET status = 'paid', paid_at = ?, gateway_ref = ? WHERE id = ? AND status IN ('pending', 'canceled', 'expired')",
        args: [now, String(reference || merchantOrderId), orderId],
      });
      if (flip.rowsAffected > 0 && orow.discord_id) {
        await db.execute({
          sql: "INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES ('grant_premium', ?, 'duitku', 'pending', ?)",
          args: [JSON.stringify({ userId: orow.discord_id, tier: 'pro', days: 30 }), now],
        });
        await db.execute({
          sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
          args: [orow.discord_id, now],
        });
      }
    }
  } else if (failed) {
    await db.execute({
      sql: 'UPDATE orders SET status = ? WHERE id = ? AND status = ?',
      args: ['expired', orderId, 'pending'],
    });
  }

  // 5. Catat event (semua kasus)
  await db.execute({
    sql: 'INSERT INTO webhook_events (event_id, gateway, payload, processed_at) VALUES (?, ?, ?, ?)',
    args: [eventId, 'duitku', JSON.stringify(body), Date.now()],
  });

  await touchActivity().catch(() => {});
  // Duitku mengharapkan response text "OK" dengan HTTP 200
  return new Response('OK', { status: 200 });
}
