// ==========================================
// app/lib/adminNotif.js
// Notifikasi khusus PANEL ADMIN (pintar):
//   - pembelian NEXO Pass (order paid/grant)
//   - alert VPS (CPU/RAM/disk >= 80%)
//   - laporan agen AI
//   - aksi admin lain yang perlu diketahui pemilik
// ==========================================
// KENAPA TABEL SENDIRI (bukan web_notifications):
//   web_notifications = notif untuk USER (lonceng member). Admin punya
//   kebutuhan beda: tanggalnya per admin, tidak dibaca user, tidak ikut
//   dibersihkan prune user. Jadi `web.admin_notifications` terpisah.
//
// PUSH: dipakai push_subscriptions yang SAMA (perangkat). Admin menyalakan
// toggle "Notif perangkat" di panel -> perangkat itu masuk push_subscriptions
// dengan penanda admin (web.admin_push_devices) supaya notif ADMIN tidak
// dikirim ke semua user dan sebaliknya.
import { getDb } from './db';
import { kirimPush } from './pushNotif';

const TIPE_SAH = new Set(['premium', 'vps', 'agen', 'order', 'info']);

/**
 * Sisip notif panel admin + push ke perangkat admin (best-effort).
 * @param {object} o
 * @param {string} o.tipe    'premium'|'vps'|'agen'|'order'|'info'
 * @param {string} o.judul
 * @param {string} [o.isi]
 * @param {string} [o.url]   tujuan klik (default '/admin')
 * @param {string} [o.tag]   tag push (default nexo-admin-<tipe>)
 * @param {boolean} [o.push] kirim push? (default true)
 */
export async function sisipNotifAdmin({ tipe = 'info', judul, isi = null, url = '/admin', tag = null, push = true, db } = {}) {
  const d = db || getDb();
  const t = TIPE_SAH.has(tipe) ? tipe : 'info';
  let notifId = null;
  try {
    const r = await d.execute({
      sql: 'INSERT INTO web.admin_notifications (tipe, judul, isi, url, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
      args: [t, String(judul), isi ? String(isi) : null, url ? String(url) : null, Date.now()],
    });
    notifId = Number(r.rows?.[0]?.id ?? r.lastInsertRowid ?? 0) || null;
  } catch (e) {
    // Tabel belum dibuat (mis. migrasi belum jalan) -> tetap coba push.
  }
  if (push) {
    try {
      const perangkat = await daftarPerangkatAdmin(d);
      for (const p of perangkat) {
        await kirimPush(p.discord_id, { title: judul, body: isi || '', url: url || '/admin', tag: tag || 'nexo-admin-' + t }).catch(() => {});
      }
    } catch { /* push opsional */ }
  }
  return { ok: true, id: notifId };
}

/** Daftar perangkat admin (dari tabel admin_push_devices) - distinct user. */
export async function daftarPerangkatAdmin(db) {
  const d = db || getDb();
  try {
    const r = await d.execute({ sql: 'SELECT DISTINCT discord_id FROM web.admin_push_devices', args: [] });
    return (r.rows || []).map((x) => ({ discord_id: String(x.discord_id) }));
  } catch { return []; }
}
