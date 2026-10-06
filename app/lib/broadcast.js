// ==========================================
// app/lib/broadcast.js
// Siarkan notifikasi ke SEMUA pengguna ber-perangkat (bell + push sekaligus).
// ==========================================
// KENAPA ADA (audit notif 2026-10-06):
//   Notif TURUNAN (flash sale, pengumuman, promo toko) dulu HANYA muncul di
//   lonceng web yang dihitung on-the-fly saat user MEMBUKA web. Artinya user
//   yang menutup web TIDAK PERNAH mendapat pemberitahuan flash sale/pengumuman
//   di perangkat. Sekarang tiap kali admin membuat flash sale / memasang
//   pengumuman, kita SISIPKAN baris notif broadcast (lonceng) + PUSH ke semua
//   perangkat yang subscribe.
//
// PENTING (anti-duplikat): lonceng sudah punya notif TURUNAN untuk flash sale
// (id `d:flash:...`). Baris broadcast di sini memakai `code`/penanda agar user
// tidak melihat dua entri kembar. Karena notif turunan di-dismiss permanen
// per user, sedangkan broadcast punya `id` DB sendiri, kita TIDAK memakai
// broadcast untuk flash sale yang sudah punya turunan - fokusnya PUSH
// (pemberitahuan perangkat); lonceng tetap dari turunan supaya tidak dobel.
import { getDb } from './db';
import { kirimPush } from './pushNotif';

/** Daftar userId unik yang punya perangkat ter-subscribe. */
export async function penerimaPerangkat(db) {
  const d = db || getDb();
  try {
    const r = await d.execute({ sql: 'SELECT DISTINCT discord_id FROM push_subscriptions', args: [] });
    return (r.rows || []).map((row) => String(row.discord_id)).filter(Boolean);
  } catch { return []; }
}

/**
 * Kirim PUSH ke semua pengguna ber-perangkat (tanpa insert lonceng baru).
 * Dipakai untuk notif yang loncengnya sudah punya sumber turunan (flash sale,
 * pengumuman) - yang kurang hanyalah pemberitahuan perangkat.
 */
export async function pushKeSemuaPerangkat({ title, body, url, tag } = {}) {
  const daftar = await penerimaPerangkat();
  let terkirim = 0;
  for (let i = 0; i < daftar.length; i += 25) {
    const batch = daftar.slice(i, i + 25);
    const hasil = await Promise.all(batch.map((uid) =>
      kirimPush(uid, { title, body, url: url || '/me', tag: tag || 'nexo-broadcast' }).catch(() => ({ ok: false }))
    ));
    terkirim += hasil.filter((h) => h && h.ok).length;
  }
  return { ok: true, penerima: daftar.length, terkirim };
}

/**
 * Siarkan notif LONCENG + PUSH ke semua pengguna (target broadcast).
 * Insert satu baris web_notifications dengan discord_id NULL (dibaca semua
 * user lewat /api/me/notifications) lalu push ke semua perangkat.
 */
export async function siarkanBroadcast({ type = 'info', title, body, code = null, url = '/me', tag = 'nexo-broadcast', db } = {}) {
  const d = db || getDb();
  try {
    if (code != null) {
      await d.execute({
        sql: 'INSERT INTO web_notifications (discord_id, type, title, body, code, created_at) VALUES (NULL, ?, ?, ?, ?, ?)',
        args: [String(type), String(title), body ? String(body) : null, String(code), Date.now()],
      });
    } else {
      await d.execute({
        sql: 'INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (NULL, ?, ?, ?, ?)',
        args: [String(type), String(title), body ? String(body) : null, Date.now()],
      });
    }
  } catch { /* insert lonceng gagal -> tetap coba push */ }
  const push = await pushKeSemuaPerangkat({ title, body, url, tag }).catch(() => ({ ok: false }));
  return { ok: true, push };
}
