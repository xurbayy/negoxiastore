// HINT CEPAT (spec v4): web mencatat waktu "aksi terakhir" (admin tekan tombol,
// user redeem, order premium dibayar). Selama <=5 detik setelah aksi,
// /api/bot/queue menjawab nextPollMs:1000 supaya bot yang lagi idle ngebut.
// Disimpan di tabel web_meta -> tahan lintas instance serverless.
import { getDb, schemaReady } from './db';

export const ACTIVITY_KEY = 'last_act…y_ms';

async function ensureMeta(db) {
  try {
    await db.execute('CREATE TABLE IF NOT EXISTS web_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  } catch {}
}

export async function touchActivity() {
  try {
    await schemaReady();
    const db = getDb();
    await ensureMeta(db);
    await db.execute({
      sql: 'INSERT INTO web_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      args: [ACTIVITY_KEY, String(Date.now())],
    });
  } catch {}
}

// true kalau ada aksi < windowMs lalu (default 5 detik sesuai spec).
export async function hasRecentActivity(windowMs = 5000) {
  try {
    const db = getDb();
    await ensureMeta(db);
    const res = await db.execute({ sql: 'SELECT value FROM web_meta WHERE key = ?', args: [ACTIVITY_KEY] });
    if (!res.rows.length) return false;
    return Date.now() - Number(res.rows[0].value) < windowMs;
  } catch {
    return false;
  }
}
