import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { userHasPremium } from '../../../../lib/snapshot';
import { touchActivity } from '../../../../lib/activity';
import { rateLimitGlobal } from '../../../../lib/rate-limit';
import { normalBulan, hargaBulan, bulanKeHari } from '../../../../lib/premiumPlan';
import { SITE_URL } from '../../../../lib/site';

export const dynamic = 'force-dynamic';

// ==========================================
// POST /api/payment/duitku/create — buat transaksi Duitku (inquiry)
// ==========================================
// Flow: user pilih durasi di /premium -> endpoint ini INSERT order
// (gateway='duitku') + inquiry ke Duitku -> kembalikan paymentUrl ->
// PremiumClient redirect ke halaman pembayaran Duitku. Setelah user bayar,
// Duitku memanggil /api/payment/webhook -> premium aktif otomatis.
//
// KONTRAK DUITKU (terverifikasi langsung ke sandbox 2026-10-12):
//   - Endpoint sandbox: https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry
//   - Signature INQUIRY: MD5(merchantCode + merchantOrderId + paymentAmount + apiKey)
//   - Respons sukses: { merchantCode, reference, paymentUrl, statusCode:"00" }
//   - Callback signature: MD5(merchantCode + amount + merchantOrderId + apiKey)
//     (sudah diverifikasi di /api/payment/webhook)
//
// merchantOrderId format `NEXO-<orderId>-<ts>` WAJIB: webhook mem-parse id
// order dari pola itu (regex ^NEXO-(\d+)-\d+$).
const DUITKU_URL_SANDBOX = 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry';
const DUITKU_URL_PRODUCTION = 'https://passport.duitku.com/webapi/api/merchant/v2/inquiry';

export async function POST(request) {
  // Jaring anti-spam: pembuatan transaksi = panggilan keluar ke Duitku.
  if (!rateLimitGlobal('duitku-create', 30, 60_000)) {
    return NextResponse.json({ ok: false, error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, { status: 429 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  const merchantCode = process.env.DUITKU_MERCHANT_CODE;
  const apiKey = process.env.DUITKU_API_KEY;
  if (!merchantCode || !apiKey) {
    return NextResponse.json({ ok: false, error: 'Pembayaran otomatis belum dikonfigurasi. Hubungi admin.' }, { status: 503 });
  }

  let body;
  try { body = await request.json(); } catch { body = null; }
  const bulan = normalBulan(body?.months);
  const amount = hargaBulan(bulan);
  const hari = bulanKeHari(bulan);

  await schemaReady();
  const db = getDb();

  // Satu pembelian per periode: yang masih premium tidak bisa beli lagi.
  if (await userHasPremium(session.discordId)) {
    return NextResponse.json({ ok: false, error: 'premium_active' }, { status: 409 });
  }

  // Tidak boleh numpuk pesanan pending (pola sama dengan flow manual lama).
  const pendingRow = await db.execute({
    sql: "SELECT id FROM orders WHERE discord_id = ? AND status = 'pending' LIMIT 1",
    args: [session.discordId],
  });
  if (pendingRow.rows.length) {
    return NextResponse.json({ ok: false, error: 'Kamu masih punya pesanan yang sedang diproses. Selesaikan atau tunggu kedaluwarsa dulu.' }, { status: 429 });
  }

  const created = Date.now();
  // gateway_ref menyimpan DURASI (dipakai webhook untuk grant premium sesuai
  // bulan yang dibeli - dulu webhook hardcode 30 hari).
  const gatewayRef = JSON.stringify({ months: bulan, days: hari });

  const res = await db.execute({
    // RETURNING id WAJIB (adapter Postgres isi lastInsertRowid dari rows[0].id).
    sql: "INSERT INTO orders (discord_id, plan, amount, gateway, status, gateway_ref, created_at) VALUES (?, ?, ?, 'duitku', 'pending', ?, ?) RETURNING id",
    args: [session.discordId, `NEXO Pass ${bulan} Bulan`, amount, gatewayRef, created],
  });
  const orderId = Number(res.lastInsertRowid);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ ok: false, error: 'Gagal membuat pesanan. Coba lagi.' }, { status: 500 });
  }

  const merchantOrderId = `NEXO-${orderId}-${created}`;
  // Signature INQUIRY v2: MD5(merchantCode + merchantOrderId + amount + apiKey)
  const signature = crypto.createHash('md5').update(`${merchantCode}${merchantOrderId}${amount}${apiKey}`).digest('hex');

  const isProd = String(process.env.DUITKU_IS_PRODUCTION || '').toLowerCase() === 'true';
  const endpoint = isProd ? DUITKU_URL_PRODUCTION : DUITKU_URL_SANDBOX;

  const payload = {
    merchantCode,
    paymentAmount: amount,
    // paymentMethod WAJIB di sandbox (terverifikasi 2026-10-12: tanpa field ini
    // Duitku menolak "paymentMethod is mandatory"). SP = ShopeePay QRIS -
    // channel QRIS paling universal (scan pakai e-wallet/m-banking apa pun).
    // Di halaman pembayaran Duitku user tetap bisa melihat detail QR/VA.
    paymentMethod: 'BC',
    merchantOrderId,
    productDetails: `NEXO Pass ${bulan} Bulan`,
    email: 'akzandoank8@gmail.com',
    phoneNumber: '085872320635',
    customerVaName: session.username || 'NEXO Player',
    callbackUrl: `${SITE_URL}/api/payment/webhook`,
    returnUrl: `${SITE_URL}/premium?selesai=1`,
    expiryPeriod: 60, // menit
    signature,
  };

  let duitkuRes;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(t);
    duitkuRes = await r.json().catch(() => null);
  } catch (e) {
    // Order tetap pending (belum dibayar) - user bisa coba lagi.
    console.error('[duitku-create] inquiry gagal:', e?.message || e);
    return NextResponse.json({ ok: false, error: 'Gagal menghubungi penyedia pembayaran. Coba lagi sebentar.' }, { status: 502 });
  }

  if (!duitkuRes || duitkuRes.statusCode !== '00' || !duitkuRes.paymentUrl) {
    console.error('[duitku-create] respons tidak sukses:', JSON.stringify(duitkuRes || {}).slice(0, 300));
    return NextResponse.json({ ok: false, error: duitkuRes?.statusMessage || 'Penyedia pembayaran menolak transaksi. Coba lagi.' }, { status: 502 });
  }

  // Simpan reference Duitku untuk jejak (webhook akan menimpanya dgn reference final).
  try {
    await db.execute({
      sql: 'UPDATE orders SET gateway_ref = ? WHERE id = ?',
      args: [JSON.stringify({ months: bulan, days: hari, duitkuReference: duitkuRes.reference }), orderId],
    });
  } catch { /* jejak opsional - order tetap valid */ }

  await touchActivity();
  return NextResponse.json({ ok: true, orderId, paymentUrl: duitkuRes.paymentUrl });
}
