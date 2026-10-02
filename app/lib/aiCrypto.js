// ==========================================
// app/lib/aiCrypto.js -> Enkripsi API key provider
// ==========================================
//
// API key provider kustom TIDAK disimpan polos di database. Dipakai
// AES-256-GCM dengan kunci yang diturunkan dari SESSION_SECRET (secret acak
// yang sudah wajib di production).
//
// FORMAT yang disimpan: "v1|<ivBase64>|<tagBase64>|<cipherBase64>"
//   - Versi "v1" ditulis di depan supaya format bisa berubah nanti tanpa
//     membingungkan data lama.
//   - GCM dipilih karena memberi autentikasi (tag) - data yang diubah di DB
//     akan GAGAL didekripsi, bukan menghasilkan kunci sampah.
//
// KEAMANAN:
//   - Kunci HARUS ada. Tanpa SESSION_SECRET (production), enkripsi gagal
//     keras - lebih baik provider tidak tersimpan daripada tersimpan polos.
//   - Fungsi ini hanya dipakai di server (route API). JANGAN diimpor komponen
//     klien.

import crypto from 'crypto';

const VERSI = 'v1';

/** Turunkan kunci 32-byte dari SESSION_SECRET (SHA-256). */
function kunci() {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error('SESSION_SECRET belum diset - tidak bisa mengenkripsi API key.');
  }
  return crypto.createHash('sha256').update(String(s)).digest();
}

/** Enkripsi teks -> string tersimpan. Mengembalikan null kalau input kosong. */
export function enkripsiKunci(teks) {
  if (!teks) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kunci(), iv);
  const enc = Buffer.concat([cipher.update(String(teks), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSI}|${iv.toString('base64')}|${tag.toString('base64')}|${enc.toString('base64')}`;
}

/** Dekripsi string tersimpan -> teks asli. Mengembalikan null kalau gagal/kosong. */
export function dekripsiKunci(disimpan) {
  if (!disimpan) return null;
  try {
    const [versi, ivB, tagB, dataB] = String(disimpan).split('|');
    if (versi !== VERSI || !ivB || !tagB || !dataB) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', kunci(), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    // Data rusak / SESSION_SECRET berubah -> anggap tidak ada.
    return null;
  }
}

/**
 * Tersamarkan untuk ditampilkan di UI - TIDAK pernah mengembalikan kunci asli.
 * Contoh: "sk-or-v1-abcd1234..." -> "sk-or...1234".
 */
export function samarkanKunci(teks) {
  if (!teks) return '';
  const s = String(teks);
  if (s.length <= 10) return '••••';
  return `${s.slice(0, 5)}...${s.slice(-4)}`;
}
