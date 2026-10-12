import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { DUITKU_DILARANG, kategoriDuitku } from '../../../../lib/duitkuMethods';

export const dynamic = 'force-dynamic';

// ==========================================
// GET /api/payment/duitku/methods — daftar metode pembayaran AKTIF
// ==========================================
// Ambil dari API Duitku (getpaymentmethod) supaya daftar selalu sinkron
// dengan yang benar-benar aktif di merchant portal. Signature endpoint ini
// BUKAN MD5 seperti inquiry, tapi HMAC-SHA256(merchantCode + amount + datetime,
// apiKey) — terverifikasi live 2026-10-12.
//
// Cache 1 JAM di memori instance: daftar channel jarang berubah, jangan
// panggil Duitku tiap render form. Kalau gagal -> fallback ke daftar statis
// (lib/duitkuMethods) supaya dropdown tetap terisi.
const CACHE_MS = 60 * 60 * 1000;
let _cache = { at: 0, data: null };

function fallbackList() {
  // Salinan daftar terverifikasi (tanpa channel yang dilarang).
  return [
    { code: 'NQ', name: 'Nobu QRIS', kategori: 'QRIS' },
    { code: 'SP', name: 'ShopeePay QRIS', kategori: 'QRIS' },
    { code: 'OV', name: 'OVO', kategori: 'E-Wallet' },
    { code: 'DA', name: 'DANA', kategori: 'E-Wallet' },
    { code: 'SA', name: 'ShopeePay', kategori: 'E-Wallet' },
    { code: 'LA', name: 'LinkAja', kategori: 'E-Wallet' },
    { code: 'JP', name: 'Jenius Pay', kategori: 'E-Wallet' },
    { code: 'BC', name: 'BCA VA', kategori: 'Virtual Account' },
    { code: 'VA', name: 'Maybank VA', kategori: 'Virtual Account' },
    { code: 'BT', name: 'Permata VA', kategori: 'Virtual Account' },
    { code: 'B1', name: 'CIMB Niaga VA', kategori: 'Virtual Account' },
    { code: 'A1', name: 'ATM Bersama VA', kategori: 'Virtual Account' },
    { code: 'I1', name: 'BNI VA', kategori: 'Virtual Account' },
    { code: 'M2', name: 'Mandiri VA', kategori: 'Virtual Account' },
    { code: 'AG', name: 'Artha Graha VA', kategori: 'Virtual Account' },
    { code: 'S1', name: 'Sampoerna VA', kategori: 'Virtual Account' },
    { code: 'BR', name: 'BRI VA', kategori: 'Virtual Account' },
    { code: 'NC', name: 'BNC VA', kategori: 'Virtual Account' },
    { code: 'BV', name: 'BSI VA', kategori: 'Virtual Account' },
    { code: 'FT', name: 'Gerai Retail', kategori: 'Gerai Retail' },
    { code: 'IR', name: 'Indomaret', kategori: 'Gerai Retail' },
    { code: 'VC', name: 'Kartu Kredit', kategori: 'Kartu Kredit' },
  ];
}

export async function GET() {
  if (_cache.data && Date.now() - _cache.at < CACHE_MS) {
    return NextResponse.json({ ok: true, methods: _cache.data, cached: true });
  }

  const merchantCode = process.env.DUITKU_MERCHANT_CODE;
  const apiKey = process.env.DUITKU_API_KEY;
  if (!merchantCode || !apiKey) {
    return NextResponse.json({ ok: true, methods: fallbackList(), fallback: true });
  }

  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const amount = 20000;
    // getpaymentmethod: HMAC-SHA256(merchantCode + amount + datetime, apiKey)
    const signature = crypto.createHmac('sha256', apiKey).update(`${merchantCode}${amount}${datetime}`).digest('hex');
    const isProd = String(process.env.DUITKU_IS_PRODUCTION || '').toLowerCase() === 'true';
    const url = isProd
      ? 'https://passport.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod'
      : 'https://sandbox.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod';

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantcode: merchantCode, amount, datetime, signature }),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(t);
    const d = await r.json().catch(() => null);

    if (d?.paymentFee && Array.isArray(d.paymentFee)) {
      // Buang channel yang terverifikasi gagal + yang tidak punya nama.
      const methods = d.paymentFee
        .filter((m) => m?.paymentMethod && m?.paymentName && !DUITKU_DILARANG.has(String(m.paymentMethod).toUpperCase()))
        .map((m) => ({
          code: String(m.paymentMethod).toUpperCase(),
          name: String(m.paymentName),
          kategori: kategoriDuitku(m.paymentName),
          fee: m.totalFee ? String(m.totalFee) : '0',
        }));
      if (methods.length) {
        _cache = { at: Date.now(), data: methods };
        return NextResponse.json({ ok: true, methods });
      }
    }
    console.warn('[duitku-methods] respons tidak terduga:', JSON.stringify(d || {}).slice(0, 200));
  } catch (e) {
    console.warn('[duitku-methods] gagal ambil daftar:', e?.message || e);
  }

  // Gagal / respons aneh -> fallback statis (jangan sampai dropdown kosong).
  return NextResponse.json({ ok: true, methods: fallbackList(), fallback: true });
}
