import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { getLatestSnapshot, userHasPremium } from '../../../lib/snapshot';
import { touchActivity } from '../../../lib/activity';
import { SITE_URL } from '../../../lib/site';

export const dynamic = 'force-dynamic';

const PRICE = 20000; // konstanta server - harga NEXO Pass (jangan expose ke client)
const IS_PROD = () => process.env.DUITKU_IS_PRODUCTION === 'true';

// Order_id deterministik dari baris orders -> status bisa dicek ulang
// kapan pun tanpa kolom tambahan (webhook tidak selalu bisa reached, mis. dev).
function duitkuOrderId(row) {
  return `NEXO-${row.id}-${row.created_at}`;
}

// MD5 signature helper
function md5(...parts) {
  return crypto.createHash('md5').update(parts.join('')).digest('hex');
}

// Cek status transaksi ke Duitku API.
// Docs: https://docs.duitku.com
async function duitkuStatus(orderId) {
  const merchantCode = process.env.DUITKU_MERCHANT_CODE;
  const apiKey = process.env.DUITKU_API_KEY;
  if (!merchantCode || !apiKey || !orderId) return null;

  const base = IS_PROD()
    ? 'https://passport.duitku.com/webapi/api/merchant/transactionStatus'
    : 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus';

  const signature = md5(merchantCode, orderId, apiKey);

  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantCode,
        merchantOrderId: orderId,
        signature,
      }),
    });
    if (!res.ok) {
      console.warn('[duitku-status] non-ok response', res.status, orderId);
      return null;
    }
    const body = await res.json();
    console.log('[duitku-status]', orderId, body.statusCode, body.statusMessage);

    // statusCode: "00" = Success, "01" = Pending, "02" = Canceled/Expired
    if (String(body.statusCode) === '00') {
      return { http: 200, transaction_status: 'settlement', amount: body.amount, reference: body.reference };
    }
    if (String(body.statusCode) === '02') {
      return { http: 200, transaction_status: 'expire' };
    }
    // "01" = masih pending
    return { http: 200, transaction_status: 'pending' };
  } catch (err) {
    console.warn('[duitku-status] fetch error', orderId, err.message);
    return null;
  }
}

// Verifikasi isi respons Duitku - nominal harus persis = harga order.
function isTrulyPaid(st, row) {
  if (st.transaction_status !== 'settlement') return false;
  // Bandingkan NUMERIK — Duitku kadang kirim "20000.00"
  if (st.amount != null && Number(st.amount) !== Number(row.amount)) return false;
  return true;
}

// Terapkan status Duitku ke order (persis logika webhook + grant_premium).
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
        sql: "INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES ('grant_premium', ?, 'duitku', 'pending', ?)",
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
  if (st.transaction_status === 'expire') {
    await db.execute({
      sql: 'UPDATE orders SET status = ? WHERE id = ? AND status = ?',
      args: ['expired', Number(row.id), 'pending'],
    });
    return 'expired';
  }
  return null;
}

// Aturan anti-nyangkut: order pending yang umurnya lewat 24 jam (batas token)
// atau transaksinya tidak pernah muncul di Duitku setelah 10 menit
// -> dianggap expired, user langsung bisa beli lagi.
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_NO_TX_MS = 10 * 60 * 1000;
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

// POST /api/payment/snap - buat order + Duitku Pop reference (user login member).
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'unauthenticated', returnTo: '/premium' }, { status: 401 });
  }

  const merchantCode = process.env.DUITKU_MERCHANT_CODE;
  const apiKey = process.env.DUITKU_API_KEY;
  if (!merchantCode || !apiKey) {
    return NextResponse.json(
      { ok: false, error: 'Pembayaran belum dikonfigurasi (DUITKU_MERCHANT_CODE / DUITKU_API_KEY kosong).' },
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
  // Guard: user yang sudah premium tidak bisa beli lagi (cek profil bot terbaru).
  const isPremium = await userHasPremium(session.discordId);
  if (isPremium) {
    return NextResponse.json(
      { ok: false, error: 'premium_active' },
      { status: 409 }
    );
  }

  // Guard ANTI-NUMPUK: user hanya boleh punya SATU order pending.
  //  - Order pending yang masih hidup (< 10 menit) -> pakai ulang reference-nya.
  //  - Order pending yang sudah lewat 10 menit (user tidak melanjutkan bayar)
  //    -> di-EXPIRE dulu, baru boleh buat order baru.
  const pendingRow = await db.execute({
    sql: "SELECT id, gateway_ref, created_at FROM orders WHERE discord_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    args: [session.discordId],
  });
  if (pendingRow.rows.length) {
    const pr = pendingRow.rows[0];
    const age = Date.now() - Number(pr.created_at);
    const reference = pr.gateway_ref && !String(pr.gateway_ref).startsWith('duitku error') ? String(pr.gateway_ref) : null;
    if (reference && age < 10 * 60 * 1000) {
      await touchActivity().catch(() => {});
      return NextResponse.json({ ok: true, reference, sandbox: !IS_PROD(), reused: true });
    }
    // Lewat 10 menit / reference tidak ada -> tutup order lama SEBELUM bikin baru.
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
    sql: "INSERT INTO orders (discord_id, plan, amount, gateway, status, created_at) VALUES (?, 'nexo_pass_monthly', ?, 'duitku', 'pending', ?)",
    args: [session.discordId, PRICE, created],
  });
  const orderId = Number(res.lastInsertRowid);
  const merchantOrderId = `NEXO-${orderId}-${created}`;

  // Duitku createinvoice: signature = MD5(merchantCode + merchantOrderId + paymentAmount + apiKey)
  const signature = md5(merchantCode, merchantOrderId, String(PRICE), apiKey);

  const endpoint = IS_PROD()
    ? 'https://api.duitku.com/api/merchant/createinvoice'
    : 'https://api-sandbox.duitku.com/api/merchant/createinvoice';

  const invoiceRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentAmount: PRICE,
      merchantOrderId,
      productDetails: 'NEXO Pass Monthly',
      email: `${session.discordId}@nexogames.local`,
      merchantUserInfo: session.discordId,
      customerVaName: session.username || 'NEXO Player',
      callbackUrl: `${SITE_URL}/api/payment/webhook`,
      returnUrl: `${SITE_URL}/premium?payment=done`,
      expiryPeriod: 1440, // 24 jam dalam menit
      signature,
      paymentMethod: '', // kosong = tampilkan semua metode
    }),
  });

  if (!invoiceRes.ok) {
    const detail = await invoiceRes.text().catch(() => '');
    console.error('[duitku-create] error', invoiceRes.status, detail);
    await db.execute({
      sql: "UPDATE orders SET status = 'failed', gateway_ref = ? WHERE id = ?",
      args: [`duitku error ${invoiceRes.status}: ${detail.slice(0, 120)}`, orderId],
    });
    return NextResponse.json({ ok: false, error: 'Gagal membuat transaksi pembayaran.' }, { status: 502 });
  }
  const invoiceJson = await invoiceRes.json();

  if (invoiceJson.statusCode !== '00' && invoiceJson.statusCode !== undefined) {
    console.error('[duitku-create] statusCode not 00', invoiceJson);
    await db.execute({
      sql: "UPDATE orders SET status = 'failed', gateway_ref = ? WHERE id = ?",
      args: [`duitku error: ${invoiceJson.statusMessage || 'unknown'}`, orderId],
    });
    return NextResponse.json({ ok: false, error: 'Gagal membuat transaksi pembayaran.' }, { status: 502 });
  }

  await db.execute({
    sql: 'UPDATE orders SET gateway_ref = ? WHERE id = ?',
    args: [invoiceJson.reference, orderId],
  });

  await touchActivity();
  return NextResponse.json({ ok: true, reference: invoiceJson.reference, paymentUrl: invoiceJson.paymentUrl, sandbox: !IS_PROD() });
}

// GET /api/payment/snap - status order user; order pending disinkron aktif
// dari Duitku (webhook tidak selalu bisa reached, mis. dev localhost).
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
  if (['pending', 'canceled', 'expired'].includes(row.status) && withinRecheck && process.env.DUITKU_API_KEY) {
    const st = await duitkuStatus(duitkuOrderId(row));
    let applied = null;
    if (st && st.transaction_status === 'expire') applied = await expireStuck(db, row, false);
    else if (st && st.transaction_status === 'settlement') applied = await applyStatus(db, row, st);
    else if (!st) applied = await expireStuck(db, row, true);
    else applied = await expireStuck(db, row, false);
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
      reference: row.status === 'pending' ? row.gateway_ref : null,
      createdAt: Number(row.created_at),
      paidAt: row.paid_at ? Number(row.paid_at) : null,
    },
  });
}
