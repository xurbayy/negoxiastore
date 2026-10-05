// ==========================================
// app/lib/notif.js
// Helper terpusat: sisip notifikasi bell + kirim Web Push.
// ==========================================
// Semua titik yang membuat notifikasi HARUS lewat sini supaya:
//   1. Isi bell konsisten (web_notifications).
//   2. Push ke perangkat otomatis terkirim (kalau user menyalakannya).
// Push TIDAK memblokir: insert tetap sukses walau push gagal/mati.
import { getDb } from './db';
import { kirimPush } from './pushNotif';

/**
 * Sisip notifikasi + kirim push (best-effort).
 * @param {object} o
 * @param {string} o.userId   discord id penerima
 * @param {string} o.type     'info' | 'event' | 'promo' | ...
 * @param {string} o.title    judul
 * @param {string} [o.body]   isi
 * @param {string} [o.code]   kode (opsional, utk promo/redeem)
 * @param {string} [o.url]    tujuan klik notifikasi (default /me)
 * @param {object} [o.db]     handle DB (opsional; kalau tak ada pakai getDb())
 * @returns {Promise<{ok:true}>}
 */
export async function sisipNotif({ userId, type, title, body, code, url, db }) {
  const d = db || getDb();
  const args = [String(userId), String(type), String(title), body ? String(body) : null];
  let sql;
  if (code != null) {
    sql = 'INSERT INTO web_notifications (discord_id, type, title, body, code, created_at) VALUES (?, ?, ?, ?, ?, ?)';
    args.push(String(code), Date.now());
  } else {
    sql = 'INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?)';
    args.push(Date.now());
  }
  await d.execute({ sql, args });

  // Push best-effort - jangan pernah menggagalkan insert.
  try {
    await kirimPush(userId, { title, body, url: url || '/me', tag: 'nexo-' + String(type || 'info') });
  } catch { /* diabaikan */ }

  return { ok: true };
}
