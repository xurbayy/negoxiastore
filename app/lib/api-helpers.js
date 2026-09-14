import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { schemaReady } from './db';
import { rateLimitGlobal } from './rate-limit';

// Perbandingan string CONSTANT-TIME.
// Kenapa: `a !== b` biasa berhenti di karakter pertama yang beda, sehingga
// panjang waktu eksekusinya membocorkan seberapa banyak prefix yang benar
// (timing attack). Di sini kedua nilai di-hash dulu ke panjang tetap supaya
// perbandingannya selalu memakan waktu sama.
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// Auth Bearer untuk /api/bot/*.
// Termasuk rate limit GLOBAL (lintas IP) sebagai jaring anti-DDoS: endpoint ini
// publik (tanpa login) dan dipakai bot, jadi harus dibatasi total requestnya.
// Bot sendiri hanya poll ~5-30 detik sekali dan push ~60 detik sekali, jadi
// batas 3000/menit sangat longgar untuk pemakaian sah tapi memotong banjir.
export function verifyBearer(request) {
  const expected = process.env.BOT_API_KEY;
  const got = request.headers.get('authorization') || '';

  if (!rateLimitGlobal('bot-api', 3000, 60_000)) {
    return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 });
  }
  if (!expected || !safeEqual(got, `Bearer ${expected}`)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

// Pastikan skema sudah dibuat sebelum query pertama.
export async function ready() {
  await schemaReady();
}
