import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { userHasPremium } from '../../../../lib/snapshot';
import { touchActivity } from '../../../../lib/activity';
import { rateLimitGlobal } from '../../../../lib/rate-limit';
import { normalBulan, hargaBulan, bulanKeHari } from '../../../../lib/premiumPlan';
import { DUITKU_METODE, DUITKU_DILARANG } from '../../../../lib/duitkuMethods';
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

  // METODE PEMBAYARAN (permintaan pemilik 2026-10-12: "semua pembayaran aja
  // gw maunya dan pake dropdown"): user memilih dari dropdown yang berisi
  // SEMUA channel aktif merchant (endpoint /api/payment/duitku/methods).
  // Duitku inquiry WAJIB satu kode channel. Kode divalidasi terhadap daftar
  // resmi lib/duitkuMethods (channel yang terbukti gagal dilarang).
  const mintaKode = String(body?.method || 'NQ').toUpperCase();
  if (DUITKU_DILARANG.has(mintaKode)) {
    return NextResponse.json({ ok: false, error: 'Metode pembayaran itu sedang tidak tersedia. Pilih metode lain.' }, { status: 400 });
  }
  const metodeKode = DUITKU_METODE[mintaKode] ? mintaKode : 'NQ';
  const metodeLabel = DUITKU_METODE[metodeKode];

  await schemaReady();
  const db = getDb();

  // Satu pembelian per periode: yang masih premium tidak bisa beli lagi.
  if (await userHasPremium(session.discordId)) {
    return NextResponse.json({ ok: false, error: 'premium_active' }, { status: 409 });
  }

  // Cek pesanan pending yang belum selesai.
  //
  // FIX 2026-10-12 (keluhan pemilik: "kenapa masih punya pesanan pending,
  // padahal cuma belum sempat bayar"): sebelumnya SEMUA pending memblokir
  // pembelian baru sampai 24 jam - padahal expiry Duitku cuma 60 MENIT.
  // Pemain yang menutup halaman pembayaran terjebak: tidak bisa buat order
  // baru, order lama juga sudah mati di sisi Duitku.
  //
  // Sekarang:
  //   - Pending MASIH BERLAKU (<60 menit, ada paymentUrl tersimpan) -> LANJUTKAN
  //     pembayaran yang sama (kembalikan paymentUrl lama, resumed:true).
  //   - Pending sudah lewat 60 menit -> tandai 'expired' otomatis, buat baru.
  const pendingRow = await db.execute({
    sql: "SELECT id, created_at, gateway_ref FROM orders WHERE discord_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    args: [session.discordId],
  });
  if (pendingRow.rows.length) {
    const p = pendingRow.rows[0];
    const umurMs = Date.now() - Number(p.created_at);
    const BATAS_MS = 60 * 60 * 1000; // 60 menit - sama dengan expiryPeriod Duitku
    let ref = null;
    try { ref = JSON.parse(p.gateway_ref || 'null'); } catch { ref = null; }
    // Metode order lama harus SAMA dengan yang dipilih sekarang. Kalau beda
    // (misal order lama BCA VA, sekarang pilih QRIS), jangan resume paksa
    // metode lama - kedaluwarsakan lalu buat order baru.
    // Bandingkan KODE (methodCode), bukan label - label bisa berubah teks.
    // Order lama tanpa methodCode = era sebelum dropdown (QRIS/BVA saja).
    const refCode = ref?.methodCode || (ref?.method === 'BCA VA' ? 'BC' : ref?.method ? 'NQ' : 'BC');
    if (umurMs < BATAS_MS && ref?.paymentUrl && refCode === metodeKode) {
      // Lanjutkan pembayaran yang sama - tidak perlu bikin order baru.
      return NextResponse.json({ ok: true, orderId: Number(p.id), paymentUrl: ref.paymentUrl, resumed: true });
    }
    // Kedaluwarsa / ganti metode / tidak ada URL tersimpan -> tandai expired, lanjut buat baru.
    await db.execute({
      sql: "UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending'",
      args: [Number(p.id)],
    });
  }

  const created = Date.now();
  // gateway_ref menyimpan DURASI (dipakai webhook untuk grant premium sesuai
  // bulan yang dibeli - dulu webhook hardcode 30 hari).
  const gatewayRef = JSON.stringify({ months: bulan, days: hari, method: metodeLabel, methodCode: metodeKode });

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
    // paymentMethod WAJIB (terverifikasi 2026-10-12). Kode channel dipilih
    // user di form (QRIS default / BCA VA). Lihat komentar metodeKode di atas.
    paymentMethod: metodeKode,
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
    // FIX 2026-10-12 (order nyangkut "Penyedia pembayaran menolak transaksi"):
    // order yang inquiry-nya GAGAL tidak boleh dibiarkan 'pending' - tanpa
    // paymentUrl ia memblokir pembelian baru dan bikin loop "Lanjutkan".
    // Tandai 'failed' supaya bersih; user tinggal klik bayar lagi.
    console.error('[duitku-create] inquiry gagal:', e?.message || e);
    try {
      await db.execute({ sql: "UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'pending'", args: [orderId] });
    } catch { /* pembersihan best-effort */ }
    return NextResponse.json({ ok: false, error: 'Gagal menghubungi penyedia pembayaran. Coba lagi sebentar.' }, { status: 502 });
  }

  if (!duitkuRes || duitkuRes.statusCode !== '00' || !duitkuRes.paymentUrl) {
    // Sama seperti di atas: order gagal jangan nyangkut pending.
    console.error('[duitku-create] respons tidak sukses:', JSON.stringify(duitkuRes || {}).slice(0, 300));
    try {
      await db.execute({ sql: "UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'pending'", args: [orderId] });
    } catch { /* pembersihan best-effort */ }
    return NextResponse.json({ ok: false, error: duitkuRes?.statusMessage || 'Penyedia pembayaran menolak transaksi. Coba lagi.' }, { status: 502 });
  }

  // Simpan reference + paymentUrl Duitku. paymentUrl WAJIB disimpan supaya
  // kalau user menutup halaman lalu balik lagi (<60 menit), dia bisa
  // MELANJUTKAN pembayaran yang sama tanpa bikin order baru (fix 2026-10-12).
  try {
    await db.execute({
      sql: 'UPDATE orders SET gateway_ref = ? WHERE id = ?',
      args: [JSON.stringify({ months: bulan, days: hari, method: metodeLabel, methodCode: metodeKode, duitkuReference: duitkuRes.reference, paymentUrl: duitkuRes.paymentUrl }), orderId],
    });
  } catch { /* jejak opsional - order tetap valid */ }

  await touchActivity();
  return NextResponse.json({ ok: true, orderId, paymentUrl: duitkuRes.paymentUrl });
}
