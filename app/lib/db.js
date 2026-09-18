import { createClient } from '@libsql/client';

// Turso (libsql) client - singleton.
// Kalau TURSO_URL tidak diset (dev tanpa DB), pakai file SQLite lokal
// di .data/ supaya semua halaman tetap bisa dites tanpa akun Turso.
let _db = null;

// Blip jaringan ke region Turso (ConnectTimeout/fetch failed/ECONNRESET)
// sering cuma sekali lewat. Retry 1x dengan jeda 300ms di SEMUA execute()
// supaya satu timeout tidak langsung jadi 500 / crash di tiap halaman.
const TRANSIENT = /ConnectTimeout|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i;
function withTransientRetry(client) {
  const wrap = (name) => {
    const orig = client[name].bind(client);
    client[name] = async (stmt) => {
      for (let i = 0; i < 2; i++) {
        try {
          return await orig(stmt);
        } catch (e) {
          if (i === 1 || !TRANSIENT.test(String(e?.message) + ' ' + String(e?.cause?.message))) throw e;
          await new Promise((res) => setTimeout(res, 300));
        }
      }
    };
  };
  wrap('execute');
  wrap('executeMultiple');
  return client;
}

export function getDb() {
  if (_db) return _db;
  const url = process.env.TURSO_URL;
  const token = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN;

  if (!url) {
    // fallback lokal (dev / preview tanpa Turso)
    _db = withTransientRetry(createClient({ url: 'file:.data/nexo-web.db' }));
  } else {
    _db = withTransientRetry(createClient({ url, authToken: token }));
  }
  return _db;
}

export async function ensureSchema() {
  const db = getDb();
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        avatar TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        result TEXT,
        created_at INTEGER NOT NULL,
        executed_at INTEGER,
        claimed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_bc_status ON bot_commands(status, created_at);
    CREATE TABLE IF NOT EXISTS data_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        data TEXT,
        created_at INTEGER NOT NULL,
        filled_at INTEGER,
        claimed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_dr_status ON data_requests(status, created_at);
    CREATE TABLE IF NOT EXISTS monitor_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ms_ts ON monitor_snapshots(ts);
    CREATE TABLE IF NOT EXISTS web_redeem_claims (
        discord_id TEXT NOT NULL,
        code TEXT NOT NULL,
        claimed_at INTEGER NOT NULL,
        command_id INTEGER,
        status TEXT DEFAULT 'pending',
        fail_reason TEXT,
        PRIMARY KEY (discord_id, code)
    );
    CREATE TABLE IF NOT EXISTS web_promo_cache (
        code TEXT PRIMARY KEY,
        rewardType TEXT,
        rewardValue TEXT,
        quota INTEGER NOT NULL DEFAULT 0,
        reserved INTEGER NOT NULL DEFAULT 0,
        exhausted INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        plan TEXT NOT NULL,
        amount INTEGER NOT NULL,
        gateway TEXT,
        gateway_ref TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        paid_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
    CREATE TABLE IF NOT EXISTS webhook_events (
        event_id TEXT PRIMARY KEY,
        gateway TEXT NOT NULL,
        payload TEXT NOT NULL,
        processed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS web_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        code TEXT,
        created_at INTEGER NOT NULL,
        read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_wn_user ON web_notifications(discord_id, created_at);
    CREATE TABLE IF NOT EXISTS emoji_registry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        emoji_name TEXT,
        emoji_id TEXT NOT NULL,
        emoji_url TEXT NOT NULL,
        seen_at INTEGER NOT NULL,
        removed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_er_user ON emoji_registry(discord_id, removed_at);
    CREATE TABLE IF NOT EXISTS notif_reads (
        discord_id TEXT NOT NULL,
        notification_id INTEGER NOT NULL,
        read_at INTEGER NOT NULL,
        PRIMARY KEY (discord_id, notification_id)
    );
    CREATE TABLE IF NOT EXISTS web_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        username TEXT,
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        page TEXT,
        delivered INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS web_notif_dismiss (
        discord_id TEXT NOT NULL,
        key TEXT NOT NULL,
        dismissed_at INTEGER NOT NULL,
        PRIMARY KEY (discord_id, key)
    );
  `);

  // Migrasi aman: kolom/tabel baru pada DB lama (lewatii error "duplicate column")
  try {
    await db.execute('ALTER TABLE users ADD COLUMN was_premium INTEGER DEFAULT 0');
  } catch {}
  try {
    await db.execute('ALTER TABLE users ADD COLUMN avatar_fresh TEXT');
  } catch {}
  try {
    await db.execute('ALTER TABLE web_redeem_claims ADD COLUMN command_id INTEGER');
  } catch {}
  try {
    await db.execute("ALTER TABLE web_redeem_claims ADD COLUMN status TEXT DEFAULT 'pending'");
  } catch {}
  try {
    await db.execute('ALTER TABLE web_redeem_claims ADD COLUMN fail_reason TEXT');
  } catch {}

  // claimed_at: dipakai claim atomik antrean (cegah perintah dieksekusi 2x
  // saat bot restart / ada 2 bot). Lihat app/api/bot/queue/route.js.
  try {
    await db.execute('ALTER TABLE bot_commands ADD COLUMN claimed_at INTEGER');
  } catch {}
  try {
    await db.execute('ALTER TABLE data_requests ADD COLUMN claimed_at INTEGER');
  } catch {}
}

let _schemaReady = null;
export function schemaReady() {
  if (!_schemaReady) _schemaReady = ensureSchema().catch((e) => { _schemaReady = null; throw e; });
  return _schemaReady;
}
