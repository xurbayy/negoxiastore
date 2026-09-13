// PRUNING (audit E2): tabel web dulu tumbuh selamanya. Dibersihkan tiap bot
// push stats (di-throttle 1x per 10 menit lewat web_meta).
//
// Aturan aman untuk Rekonsiliasi Premium:
//  - orders 'paid' TIDAK PERNAH dihapus (sumber expected expiry).
//  - bot_commands 'done' grant_premium disimpan selama masa aktifnya belum
//    habis; revoke_premium 'done' disimpan selamanya (niat admin).
//  - Sisanya (data_requests done, command lama, klaim lama, notif read lama,
//    webhook event, emoji_registry removed, snapshot) di-prune per umur.
import { schemaReady } from './db';

const DAY = 86_400_000;
const PRUNE_KEY = 'prune:last…d_at';
const PRUNE_EVERY_MS = 10 * 60_000;

async function tryExec(db, sql, args = []) {
  try { await db.execute({ sql, args }); } catch {}
}

// DELETE dengan LIMIT tidak didukung SQLite murni -> pakai subquery id.
// Untuk tabel tanpa kolom id (webhook_events), pakai rowid.
async function deleteLimited(db, table, whereSql, args, limit = 5000) {
  await tryExec(
    db,
    `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${whereSql} ORDER BY id ASC LIMIT ${Number(limit)})`,
    args
  );
}

async function deleteLimitedByRowid(db, table, whereSql, args, limit = 5000) {
  await tryExec(
    db,
    `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${whereSql} ORDER BY rowid ASC LIMIT ${Number(limit)})`,
    args
  );
}

async function pruneNow(db, now) {
  // Snapshot: 30 hari (sudah ada juga di stats route; biarkan sebagai cadangan).
  await tryExec(db, 'DELETE FROM monitor_snapshots WHERE ts < ?', [now - 30 * DAY]);

  // Permintaan profil: done >7 hari tidak dipakai lagi; pending >3 hari = mati.
  await deleteLimited(db, 'data_requests', "status = 'done' AND created_at < ?", [now - 7 * DAY]);
  await deleteLimited(db, 'data_requests', "status = 'pending' AND created_at < ?", [now - 3 * DAY]);

  // Command: gagal/done yang sudah tidak relevan.
  await deleteLimited(db, 'bot_commands', "status IN ('done','failed') AND action NOT IN ('grant_premium','revoke_premium') AND created_at < ?", [now - 30 * DAY]);
  await deleteLimited(db, 'bot_commands', "status = 'failed' AND action IN ('grant_premium','revoke_premium') AND created_at < ?", [now - 30 * DAY]);
  // grant/revoke DONE disimpan lama: jadi dasar rekonsiliasi (grant lifetime
  // = max 3650 hari). Baru boleh hapus setelah 11 tahun = pasti kedaluwarsa.
  await deleteLimited(db, 'bot_commands', "status = 'done' AND action = 'grant_premium' AND created_at < ?", [now - 3660 * DAY]);
  // revoke_premium done TIDAK pernah dihapus (niat admin permanen).

  // Klaim redeem: delivered/failed >90 hari (pending ditangani sweepStaleClaims).
  await deleteLimitedByRowid(db, 'web_redeem_claims', "status IN ('delivered','failed') AND claimed_at < ?", [now - 90 * DAY]);

  // Notifikasi personal yang sudah dibaca >30 hari (broadcast NULL dipertahankan).
  await deleteLimited(db, 'web_notifications', 'discord_id IS NOT NULL AND read_at IS NOT NULL AND created_at < ?', [now - 30 * DAY]);
  // Notifikasi personal basi yang gak pernah dibaca: 90 hari.
  await deleteLimited(db, 'web_notifications', 'discord_id IS NOT NULL AND created_at < ?', [now - 90 * DAY]);
  // Jejak baca broadcast (B1): bersihkan untuk notif yang udah gak aktif
  await tryExec(db, 'DELETE FROM notif_reads WHERE notification_id NOT IN (SELECT id FROM web_notifications WHERE discord_id IS NULL)');

  // Webhook events >30 hari (tabel ini tanpa kolom id -> rowid).
  await deleteLimitedByRowid(db, 'webhook_events', 'processed_at < ?', [now - 30 * DAY]);

  // Emoji registry: yang sudah removed >90 hari.
  await deleteLimited(db, 'emoji_registry', 'removed_at IS NOT NULL AND removed_at < ?', [now - 90 * DAY]);
}

export async function pruneOldData(db) {
  try {
    await schemaReady();
    const now = Date.now();
    try {
      await db.execute('CREATE TABLE IF NOT EXISTS web_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    } catch {}
    const last = await db.execute({ sql: 'SELECT value FROM web_meta WHERE key = ?', args: [PRUNE_KEY] }).catch(() => null);
    if (last && last.rows.length && now - Number(last.rows[0].value) < PRUNE_EVERY_MS) return;
    await tryExec(db, 'INSERT INTO web_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [PRUNE_KEY, String(now)]);
    await pruneNow(db, now);
  } catch {}
}
