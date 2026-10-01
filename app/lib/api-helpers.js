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

// ==========================================
// SCOPE API BOT (audit keamanan 2026-10-01)
// ==========================================
//
// MASALAH YANG DIPERBAIKI:
//   Dulu hanya ada SATU kunci (BOT_API_KEY) dengan otoritas penuh. Kalau kunci
//   itu bocor (mis. dari log hosting), penyerang bisa memanggil SEMUA endpoint
//   bot - termasuk stats yang memuat data seluruh pemain.
//
//   Juga: tidak ada cara mengganti kunci tanpa downtime. Ganti kunci = bot
//   langsung 401 sampai hosting ikut diperbarui.
//
// SOLUSI (dua bagian):
//
// 1. DUAL-KEY (rotasi tanpa downtime)
//    Web menerima BOT_API_KEY (kunci aktif) DAN BOT_API_KEY_NEXT (kunci baru
//    yang disiapkan). Keduanya valid. Prosedur rotasi:
//      a. Set BOT_API_KEY_NEXT di Vercel DAN di bot. Restart bot.
//      b. Bot memakai NEXT kalau ada (lihat webBridge: pilih kunci terbaru).
//      c. Setelah semua trafik pakai NEXT, tukar: jadikan NEXT sebagai
//        BOT_API_KEY, hapus NEXT. Restart bot.
//    Tidak ada momen 401 karena kedua sisi selalu punya kunci yang cocok.
//
// 2. SCOPE (izin bertingkat)
//    Endpoint dikelompokkan:
//      - 'write' : push stats, notify  -> butuh kunci utama (paling sensitif)
//      - 'read'  : ambil antrean command -> cukup kunci mana pun
//    Kunci bisa dibatasi lewat BOT_API_KEY_SCOPE (mis. "read" saja) untuk
//    deployment yang hanya perlu polling.

// Kumpulan kunci yang VALID beserta scope-nya.
// Diisi dari env: BOT_API_KEY (+ opsional BOT_API_KEY_NEXT).
function daftarKunciValid() {
  const hasil = [];
  const utama = process.env.BOT_API_KEY;
  const berikut = process.env.BOT_API_KEY_NEXT;
  const scopeUtama = (process.env.BOT_API_KEY_SCOPE || 'read,write').toLowerCase();
  const scopeBerikut = (process.env.BOT_API_KEY_NEXT_SCOPE || 'read,write').toLowerCase();
  if (utama) hasil.push({ key: utama, scope: scopeUtama.split(',').map((s) => s.trim()).filter(Boolean) });
  if (berikut) hasil.push({ key: berikut, scope: scopeBerikut.split(',').map((s) => s.trim()).filter(Boolean) });
  return hasil;
}

/**
 * Verifikasi Bearer token + scope.
 * @param {Request} request
 * @param {'read'|'write'} perluScope - scope minimal yang dibutuhkan endpoint
 * @returns {NextResponse|null} null kalau lolos, response error kalau tidak
 */
export function verifyBearer(request, perluScope = 'read') {
  const got = request.headers.get('authorization') || '';

  // Rate limit GLOBAL (lintas IP) sebagai jaring anti-DDoS: endpoint ini
  // publik (tanpa login) dan dipakai bot, jadi harus dibatasi total requestnya.
  if (!rateLimitGlobal('bot-api', 3000, 60_000)) {
    return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 });
  }

  const kandidat = daftarKunciValid();
  if (!kandidat.length) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Cocokkan dengan SEMUA kunci valid (constant-time per kunci).
  // Tidak early-return saat ketemu supaya waktu eksekusi tidak membocorkan
  // kunci mana yang cocok.
  let cocok = null;
  for (const k of kandidat) {
    if (safeEqual(got, `Bearer ${k.key}`)) cocok = k;
  }

  if (!cocok) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Cek scope: endpoint 'write' menolak kunci yang hanya punya 'read'.
  if (!cocok.scope.includes(perluScope)) {
    return NextResponse.json({ ok: false, error: 'forbidden scope' }, { status: 403 });
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
