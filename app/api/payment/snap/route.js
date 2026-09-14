import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { getLatestSnapshot } from '../../../lib/snapshot';
import { touchActivity } from '../../../lib/activity';
import { SITE_URL } from '../../../lib/site';

export const dynamic = 'force-dynamic';

const PRICE = 20000; // konstanta server - harga NEXO Pass (jangan expose ke client)
const IS_PROD = () => process.env.MIDTRANS_IS_PRODUCTION === 'true';

// Order_id Midtrans deterministik dari baris orders -> status bisa dicek ulang
// kapan pun tanpa kolom tambahan (webhook tidak selalu bisa reached, mis. dev).
function midtransOrderId(row) {
  return `NEXO-${row.id}-${row.created_at}`;
}

// Cek status transaksi ke Midtrans Core API v2 (Server Key, Basic auth).
// Docs: https://docs.midtrans.com/reference/get-transaction-status
async function midtransStatus(orderId) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey || !orderId) return null;
  const base = IS_PROD() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  const url = `${base}/v2/${encodeURIComponent(orderId)}/status`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: 'Basic ' + Buffer.from(serverKey + ':').toString('base64') },
    });
    if (res.status === 404) {
      // 404 ASLI Midtrans selalu ada body JSON (mis. error_code 4041).
      // 404 BODY KOSONG = bukan Midtrans - biasanya WAF/proxy jaringan yang
      // memblokir endpoint status (pernah terbukti bikin order berbayar
      // dianggap hantu lalu expired sepihak). Anggap error sementara.
      try { await res.json(); return { http: 404 }; } catch { return null; }
    }
    if (!res.ok) {
      console.warn('[midtrans-status] non-ok response', res.status, orderId);
      return null;
    }
    const body = await res.json();
    console.log('[midtrans-status]', orderId, body.transaction_status);
    // GOTCHA (fix 2026-09-14): Midtrans membalas HTTP 200 + body
    // { status_code: "404", status_message: "Transaction doesn't exist." }
    // untuk transaksi yang popup-nya dibuka tapi tidak pernah dibayar.
    // Dulu hanya HTTP 404 yang dikenali -> order 'pending' NYANGKUT selamanya
    // (user melihat "jangan bayar dua kali" padahal transaksinya tidak ada).
    // Perlakukan sama seperti HTTP 404: transaksi tidak ada.
    if (String(body.status_code) === '404') return { http: 404, notFound: true };
    return { http: res.status, ...body, transaction_status: Array.isArray(body.transaction_status) ? body.transaction_status[0] : body.transaction_status };
  } catch (err) {
    console.warn('[midtrans-status] fetch error', orderId, err.message);
    return null;
  }
}

// Verifikasi isi respons Midtrans - JANGAN percaya status doang:
// nominal harus persis = harga order, order_id harus milik order ini,
// fraud_status wajib accept.
function isTrulyPaid(st, row) {
  const tx = st.transaction_status;
  if (tx !== 'settlement' && tx !== 'capture') return false;
  if (st.fraud_status && st.fraud_status !== 'accept') return false;
  // FIX (2026-09-14): bandingkan NUMERIK - Midtrans kadang kirim "20000.00"
  // (desimal) dan kadang "20000"; perbandingan string bikin pembayaran sah
  // dianggap tidak cocok (order tidak pernah di-flip ke paid).
  if (Number(st.gross_amount) !== Number(row.amount)) return false;
  if (st.transaction_id && String(st.order_id || '') !== midtransOrderId(row)) return false;
  return true;
}

// Terapkan status Midtrans ke order (persis logika webhook + grant_premium).
async function applyStatus(db, row, st) {
  const now = Date.now();
  const paid = isTrulyPaid(st, row);
  if (paid) {
    // TRANSISI ATOMIK: hanya pemenang UPDATE yang boleh enqueue grant -
    // poll-2-detik dan webhook tidak pernah dobel antrean.
    const flip = await db.execute({
      sql: "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status IN ('pending', 'canceled', 'expired')",
      args: [now, Number(row.id)],
    });
    if (flip.rowsAffected > 0) {
      await db.execute({
        sql: "INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES ('grant_premium', ?, 'midtrans', 'pending', ?)",
        args: [JSON.stringify({ userId: row.discord_id, tier: 'pro', days: 30 }), now],
      });
      await db.execute({
        sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
        args: [row.discord_id, now],
      });
      await touchActivity().catch(() => {});
    }
    return 'paid';
  }
  if (['expire', 'cancel', 'deny'].includes(st.transaction_status)) {
    const s = st.transaction_status === 'expire' ? 'expired' : st.transaction_status === 'cancel' ? 'canceled' : 'failed';
    await db.execute({
      sql: 'UPDATE orders SET status = ? WHERE id = ? AND status = ?',
      args: [s, Number(row.id), 'pending'],
    });
    return s;
  }
  return null;
}

// Aturan anti-nyangkut: order pending yang umurnya lewat 24 jam (batas token
// Snap) atau transaksinya tidak pernah muncul di Midtrans (404) setelah 1 jam
// -> dianggap expired, user langsung bisa beli lagi.
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_NO_TX_MS = 10 * 60 * 1000; // 10 menit: popup 404 = hantu, jangan menunggu 1 jam
async function expireStuck(db, row, missingTx) {
  const age = Date.now() - Number(row.created_at);
  const shouldExpire = age > DAY_MS || (missingTx && age > STALE_NO_TX_MS);
  if (!shouldExpire) return null;
  await db.execute({
    sql: "UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending'",
    args: [Number(row.id)],
  });
  return 'expired';
}

// POST /api/payment/snap - buat order + Snap token Midtrans (user login member).
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'unauthenticated', returnTo: '/premium' }, { status: 401 });
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return NextResponse.json(
      { ok: false, error: 'Pembayaran belum dikonfigurasi (MIDTRANS_SERVER_KEY kosong).' },
      { status: 503 }
    );
  }

  await schemaReady();
  const db = getDb();

  // Guard KRUSIAL: bot harus hidup (snapshot < 3 menit). Kalau bot mati,
  // pembayaran tidak akan pernah sampai -> tidak boleh ada yang bisa beli.
  const snap = await getLatestSnapshot();
  if (!snap || Date.now() - Number(snap.ts) > 3 * 60 * 1000) {
    return NextResponse.json(
      { ok: false, error: 'bot_offline' },
      { status: 503 }
    );
  }
  // Guard: user yang sudah premium tidak bisa beli lagi (cek profil bot terakhir).
  const premiumMember = (snap?.premiumMembers || []).find((m) => m.userId === session.discordId);
  if (premiumMember) {
    return NextResponse.json(
      { ok: false, error: 'premium_active', expiresAt: premiumMember.expiresAt },
      { status: 409 }
    );
  }

  // Guard ANTI-NUMPUK: user hanya boleh punya SATU order pending.
  //  - Order pending yang masih hidup (< 10 menit) -> pakai ulang tokennya.
  //  - Order pending yang sudah lewat 10 menit (user tidak melanjutkan bayar)
  //    -> di-EXPIRE dulu, baru boleh buat order baru.
  // Dulu tiap klik "Beli" bikin order baru -> riwayat penuh expired dan user
  // bisa bayar token lama yang webhook-nya sudah tidak nyambung. Sekarang
  // TIDAK MUNGKIN ada 2 order pending numpuk untuk satu user.
  const pendingRow = await db.execute({
    sql: "SELECT id, gateway_ref, created_at FROM orders WHERE discord_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    args: [session.discordId],
  });
  if (pendingRow.rows.length) {
    const pr = pendingRow.rows[0];
    const age = Date.now() - Number(pr.created_at);
    const snapToken = pr.gateway_ref && !String(pr.gateway_ref).startsWith('snap error') ? String(pr.gateway_ref) : null;
    if (snapToken && age < 10 * 60 * 1000) {
      await touchActivity().catch(() => {});
      return NextResponse.json({ ok: true, token: snapToken, clientKey: process.env.MIDTRANS_CLIENT_KEY || null, sandbox: !IS_PROD(), reused: true });
    }
    // Lewat 10 menit / token tidak ada -> tutup order lama SEBELUM bikin baru.
    await db.execute({
      sql: "UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending'",
      args: [Number(pr.id)],
    });
  }

  // Bersihkan sisa pending lain (kalau ada dari versi lama yang numpuk) -
  // jaminan: satu user maksimal SATU order pending.
  await db.execute({
    sql: "UPDATE orders SET status = 'expired' WHERE discord_id = ? AND status = 'pending'",
    args: [session.discordId],
  });

  const created = Date.now();
  const res = await db.execute({
    sql: "INSERT INTO orders (discord_id, plan, amount, gateway, status, created_at) VALUES (?, 'nexo_pass_monthly', ?, 'midtrans', 'pending', ?)",
    args: [session.discordId, PRICE, created],
  });
  const orderId = Number(res.lastInsertRowid);
  const midtransId = `NEXO-${orderId}-${created}`;

  const auth = Buffer.from(`${serverKey}:`).toString('base64');
  const endpoint = IS_PROD()
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

  const snapRes = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transaction_details: { order_id: midtransId, gross_amount: PRICE },
      customer_details: { customer_id: session.discordId, first_name: session.username },
      // Parameter RESMI Snap API: setelah user selesai/pagal bayar, browser
      // diarahkan ke URL ini (bukan example.com default dari dashboard).
      // 'pending' dipisah: uang belum settle -> jangan klaim "berhasil".
      callbacks: {
        finish: `${SITE_URL}/premium?payment=done`,
        pending: `${SITE_URL}/premium?payment=pending`,
        error: `${SITE_URL}/premium?payment=gagal`,
        unset: `${SITE_URL}/premium`,
      },
    }),
  });
  if (!snapRes.ok) {
    const detail = await snapRes.text().catch(() => '');
    await db.execute({
      sql: "UPDATE orders SET status = 'failed', gateway_ref = ? WHERE id = ?",
      args: [`snap error ${snapRes.status}: ${detail.slice(0, 120)}`, orderId],
    });
    return NextResponse.json({ ok: false, error: 'Gagal membuat transaksi pembayaran.' }, { status: 502 });
  }
  const snapJson = await snapRes.json();

  await db.execute({
    sql: 'UPDATE orders SET gateway_ref = ? WHERE id = ?',
    args: [snapJson.token, orderId],
  });

  await touchActivity();
  return NextResponse.json({ ok: true, token: snapJson.token, clientKey: process.env.MIDTRANS_CLIENT_KEY || null, sandbox: !IS_PROD() });
}

// GET /api/payment/snap - status order user; order pending disinkron aktif
// dari Midtrans (webhook tidak selalu bisa reached, mis. dev localhost).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  await schemaReady();
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT id, discord_id, plan, amount, status, gateway_ref, created_at, paid_at FROM orders WHERE discord_id = ? ORDER BY created_at DESC LIMIT 1',
    args: [session.discordId],
  });
  const liveSnap = await getLatestSnapshot();
  const botOnline = Boolean(liveSnap && Date.now() - Number(liveSnap.ts) <= 3 * 60 * 1000);
  if (!res.rows.length) return NextResponse.json({ ok: true, order: null, botOnline });

  let row = res.rows[0];

  const withinRecheck = row.status === 'pending'
    || (Date.now() - Number(row.created_at) < 72 * 60 * 60 * 1000);
  if (['pending', 'canceled', 'expired'].includes(row.status) && withinRecheck && process.env.MIDTRANS_SERVER_KEY) {
    const st = await midtransStatus(midtransOrderId(row));
    let applied = null;
    if (st && st.http === 404) applied = await expireStuck(db, row, true);
    else if (st) applied = await applyStatus(db, row, st);
    else applied = await expireStuck(db, row, false); // cek status gagal: tetap batasi umur
    if (applied) row = { ...row, status: applied };
  }

  return NextResponse.json({
    ok: true,
    botOnline,
    order: {
      id: Number(row.id),
      plan: row.plan,
      amount: Number(row.amount),
      status: row.status,
      snapToken: row.status === 'pending' ? row.gateway_ref : null,
      createdAt: Number(row.created_at),
      paidAt: row.paid_at ? Number(row.paid_at) : null,
    },
  });
}
