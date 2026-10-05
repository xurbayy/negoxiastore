// ==========================================
// app/lib/pushNotif.js
// Web Push: kirim notifikasi ke perangkat user (HP/laptop) walau web tutup.
// ==========================================
// ALUR:
//   1. User menyalakan toggle -> browser bikin langganan (endpoint+kunci) ->
//      disimpan di tabel web.push_subscriptions (per perangkat).
//   2. Saat ada notif baru (bell), panggil kirimPush(userId, {...}) -> semua
//      perangkat user itu menerima notifikasi sistem.
//   3. Hormati toggle: kalau web.push_prefs.enabled != 1 -> tidak dikirim.
//
// File ini SERVER-ONLY (pakai web-push + DB). Jangan diimpor dari komponen
// client. Endpoint /api/push/subscribe & helper ini yang menyentuhnya.

import webpush from 'web-push';
import { getDb } from './db';

let _siap = false;
function _init() {
  if (_siap) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@nexogames.site', pub, priv);
    _siap = true;
    return true;
  } catch { return false; }
}

export function pushTersedia() {
  return _init();
}

export function vapidPublic() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** Apakah user menyalakan notifikasi push? */
export async function pushAktif(userId) {
  try {
    const db = getDb();
    const r = await db.execute({ sql: 'SELECT enabled FROM push_prefs WHERE discord_id = ?', args: [String(userId)] });
    return Number(r.rows?.[0]?.enabled || 0) === 1;
  } catch { return false; }
}

/** Simpan/perbarui langganan satu perangkat. */
export async function simpanLangganan(userId, sub, ua) {
  const db = getDb();
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error('langganan tidak lengkap');
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, discord_id, p256dh, auth, ua, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET discord_id = excluded.discord_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua`,
    args: [endpoint, String(userId), p256dh, auth, ua ? String(ua).slice(0, 200) : null, Date.now()],
  });
}

/** Hapus langganan (saat user matikan notifikasi / langganan mati). */
export async function hapusLangganan(userId, endpoint) {
  const db = getDb();
  if (endpoint) {
    await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ? AND discord_id = ?', args: [endpoint, String(userId)] });
  } else {
    await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE discord_id = ?', args: [String(userId)] });
  }
}

/** Set toggle on/off. Matikan juga menghapus langganan tersimpan. */
export async function setPref(userId, enabled) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO push_prefs (discord_id, enabled, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(discord_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
    args: [String(userId), enabled ? 1 : 0, Date.now()],
  });
  if (!enabled) await hapusLangganan(userId, null);
}

/** Hitung perangkat yang terdaftar (untuk info UI). */
export async function jumlahPerangkat(userId) {
  try {
    const db = getDb();
    const r = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM push_subscriptions WHERE discord_id = ?', args: [String(userId)] });
    return Number(r.rows?.[0]?.c || 0);
  } catch { return 0; }
}

/**
 * Kirim push ke semua perangkat user. Tidak melempar error - kegagalan push
 * tidak boleh menggagalkan alur utama (insert notif). Langganan mati (410/404)
 * otomatis dibersihkan.
 */
export async function kirimPush(userId, { title, body, url, tag } = {}) {
  try {
    if (!_init()) return { ok: false, alasan: 'vapid_belum_diset' };
    if (!(await pushAktif(userId))) return { ok: false, alasan: 'push_mati' };
    const db = getDb();
    const r = await db.execute({ sql: 'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE discord_id = ?', args: [String(userId)] });
    const subs = r.rows || [];
    if (!subs.length) return { ok: false, alasan: 'tak_ada_perangkat' };

    const payload = JSON.stringify({
      title: title || 'NEXO Games',
      body: body || '',
      url: url || '/me',
      tag: tag || 'nexo-notif',
    });

    let terkirim = 0, mati = [];
    await Promise.all(subs.map(async (s) => {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(subscription, payload);
        terkirim++;
      } catch (e) {
        // 404/410 = langganan sudah tidak valid -> hapus
        if (e && (e.statusCode === 404 || e.statusCode === 410)) mati.push(s.endpoint);
      }
    }));
    for (const ep of mati) {
      try { await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?', args: [ep] }); } catch {}
    }
    return { ok: true, terkirim, dibersihkan: mati.length };
  } catch (e) {
    return { ok: false, alasan: String(e?.message || e) };
  }
}
