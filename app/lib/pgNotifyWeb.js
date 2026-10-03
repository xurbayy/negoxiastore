// ==========================================
// app/lib/pgNotifyWeb.js
// Helper NOTIFY Postgres - pemicu INSTAN antrean web->bot (2026-10-03).
// ==========================================
// Web tidak perlu koneksi persist: cukup kirim `SELECT pg_notify(...)` lewat
// koneksi pool yang sudah ada. Postgres menyalurkan notifikasi ke SEMUA
// listener aktif (termasuk listener bot di utils/pgNotify.js).
//
// Payload: daftar action yang masuk antrean ('grant_premium', dst) supaya
// log bot informatif. Payload NOTIFY maksimal 8000 byte - cukup untuk nama
// action, bukan data.
//
// GAGAL AMAN: kalau NOTIFY gagal (koneksi sesaat), bot tetap menarik antrean
// lewat poll berkala - notifikasi hanya percepat, bukan satu-satunya jalur.

import { getDb } from './db';

export async function notifyQueue(actions) {
  try {
    const daftar = Array.isArray(actions) ? actions.filter(Boolean).slice(0, 10) : [];
    if (!daftar.length) return true;
    const payload = `queue:${daftar.join(',')}`;
    const db = getDb();
    // pg_notify(text, text) - payload max 8000 byte (kita kirim max ~100 byte)
    await db.execute({
      sql: 'SELECT pg_notify($1, $2)',
      args: ['nexo_queue', payload],
    });
    return true;
  } catch {
    // Tidak fatal - poll berkala tetap menarik antrean.
    return false;
  }
}
