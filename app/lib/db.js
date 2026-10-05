import { createPgClient } from './pgAdapter.js';
import { createDbProxyClient, PROXY_AKTIF } from './dbProxy.js';

// PostgreSQL (Supabase) client - singleton async via pg Pool (max 5).
// Antarmuka dipertahankan: db.execute({sql,args}) +
// res.rows / res.rowsAffected / res.lastInsertRowid tanpa perubahan.
//
// MIGRASI 2026-10-03: Sekarang Postgres murni (async) supaya
// bot + web memakai SATU database (tanpa sinkronisasi bridge).
let _db = null;

// Blip jaringan sering sekali lewat. Retry dengan jeda di SEMUA execute()
// supaya satu gangguan tidak langsung jadi 500 / "Gangguan" (kedip-kedip).
//
// FIX 2026-10-04 (kedip-kedip Status Sistem Database Operational<->Gangguan):
// pooler Supabase session mode kadang menolak koneksi baru dengan
// "(EMAXCONNSESSION) max clients reached in session mode". Dulu error ini
// TIDAK tertangkap retry -> sekali penuh langsung error -> health check gagal
// -> tampil "Gangguan", lalu slot lepas -> "Operational" (kedip-kedip).
// Sekarang error pooler-full DITANGKAP + retry dengan jeda LEBIH PANJANG
// (700ms) - slot pooler cepat lepas begitu query lain selesai, jadi retry
// hampir selalu berhasil dan status stabil "Operational".
const TRANSIENT = /ConnectTimeout|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|Connection terminated|timeout|EMAXCONNSESSION|max clients reached|too many connections/i;
// Error pooler-full butuh jeda lebih panjang (tunggu slot lepas).
const isPoolFull = (msg) => /EMAXCONNSESSION|max clients reached|too many connections/i.test(msg);
function withTransientRetry(client) {
  const wrap = (name) => {
    const orig = client[name].bind(client);
    // PENTING: teruskan SEMUA argumen (stmt, args). Dulu hanya `stmt` yang
    // diteruskan -> args terbuang -> PG error 'there is no parameter $1'
    // (semua query ber-parameter gagal senyap).
    client[name] = async (...args) => {
      // 3 percobaan (2 retry) supaya blip pooler-full tertangani.
      for (let i = 0; i < 3; i++) {
        try {
          return await orig(...args);
        } catch (e) {
          const msg = String(e?.message) + ' ' + String(e?.cause?.message);
          if (i === 2 || !TRANSIENT.test(msg)) throw e;
          // Tunggu lebih lama kalau pooler penuh (slot lepas saat query lain
          // selesai), lebih cepat untuk blip jaringan biasa.
          await new Promise((res) => setTimeout(res, isPoolFull(msg) ? 700 : 300));
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
  // PRIORITAS PROXY BOT (2026-10-05): kalau BOT_API_URL diset, semua query
  // lewat bot VPS (DB lokal, cepat, port DB tidak dibuka ke internet).
  // Kalau tidak diset -> fallback Postgres langsung (dev lokal / Supabase).
  if (PROXY_AKTIF) {
    _db = withTransientRetry(createDbProxyClient());
    return _db;
  }
  _db = withTransientRetry(createPgClient());
  return _db;
}

export async function ensureSchema() {
  // PROXY MODE (2026-10-05): saat web lewat bot (BOT_API_URL), SKEMA SUDAH ADA
  // di PostgreSQL VPS. Menjalankan CREATE TABLE lewat proxy = DIBLOKIR 403
  // (proxy melarang DDL) -> SEMUA endpoint gagal (web lemot + data kosong).
  // Jadi di mode proxy, ensureSchema = no-op (skema sudah pasti ada).
  if (PROXY_AKTIF) return;
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

    -- RATE LIMIT PERSISTENT (audit keamanan 2026-10-01).
    -- Sebelumnya rate limiter hanya di MEMORI proses. Di Vercel, satu request
    -- bisa mendarat di instance berbeda sehingga hitungannya terpisah -
    -- penyerang yang "beruntung" bisa melewati batas karena tiap instance
    -- menganggap dirinya baru menerima 1 request.
    --
    -- Tabel ini menyimpan hitungan di DB (dibagi semua instance), khusus untuk
    -- endpoint PALING sensitif: login admin (brute force) dan redeem kode
    -- (penebakan kode). Endpoint lain tetap pakai in-memory (lebih murah,
    -- dan risikonya kecil).
    CREATE TABLE IF NOT EXISTS rate_limit (
        bucket       TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        hits         INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket, window_start)
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit(window_start);

    -- ARSIP JAWABAN AI (permintaan pemilik 2026-10-01).
    -- Pemilik ingin MENYIMPAN jawaban AI yang bagus supaya bisa dibaca lagi
    -- kapan saja, dan MENGHAPUS yang sudah tidak relevan. Tanpa tabel ini,
    -- jawaban hanya ada di layar lalu hilang begitu panel ditutup.
    --
    -- Yang disimpan: pertanyaan, jawaban, dan label sumbernya (pintasan/chat)
    -- supaya mudah dicari. TIDAK menyimpan data pemain atau kunci apa pun.
    CREATE TABLE IF NOT EXISTS ai_notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        judul      TEXT NOT NULL,
        pertanyaan TEXT,
        jawaban    TEXT NOT NULL,
        sumber     TEXT DEFAULT 'chat',
        model      TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_notes_created ON ai_notes(created_at DESC);

    -- PENGINGAT DARI AI (permintaan pemilik 2026-10-01).
    -- Pemilik bisa menyuruh AI: "ingetin gw pas Halloween mau masang promo".
    -- AI mengekstrak tanggalnya, baris ini menyimpan pengingatnya, dan panel
    -- menampilkannya sebagai notifikasi sampai ditandai selesai.
    --
    -- waktu_ingat disimpan sebagai epoch ms (WIB dikonversi ke UTC oleh
    -- server) supaya perbandingan waktu tidak bergantung zona server.
    CREATE TABLE IF NOT EXISTS ai_reminders (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        teks        TEXT NOT NULL,
        waktu_ingat INTEGER NOT NULL,
        selesai     INTEGER DEFAULT 0,
        dibuat_at   INTEGER NOT NULL,
        selesai_at  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ai_reminders_waktu ON ai_reminders(selesai, waktu_ingat);

    -- DISKUSI TERSIMPAN (permintaan pemilik 2026-10-02).
    -- "gw mau diskusi juga bisa gw save, bisa gw hapus, jadi bisa lanjutkan
    -- diskusi kemarin." Menyimpan seluruh percakapan (JSON) dengan judul,
    -- supaya bisa dibuka lagi & dilanjutkan kapan saja dari perangkat mana pun.
    CREATE TABLE IF NOT EXISTS ai_diskusi (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        judul      TEXT NOT NULL,
        pesan      TEXT NOT NULL,
        model      TEXT,
        provider   TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ai_diskusi_updated ON ai_diskusi(updated_at DESC);

    -- HASIL UJI MODEL (permintaan pemilik 2026-10-02).
    -- Menyimpan apakah sebuah model BENAR-BENAR bisa dipakai (hasil 1 request
    -- kecil). Dipakai agar daftar model hanya menampilkan yang valid.
    -- Di-cache 24 jam supaya tidak menguji ulang tiap kali.
    CREATE TABLE IF NOT EXISTS ai_model_uji (
        provider TEXT NOT NULL,
        model    TEXT NOT NULL,
        ok       INTEGER NOT NULL DEFAULT 0,
        alasan   TEXT,
        diuji_at INTEGER NOT NULL,
        PRIMARY KEY (provider, model)
    );

    -- AGEN AI (permintaan pemilik 2026-10-02).
    -- Agen memantau data & memberi LAPORAN + USULAN AKSI berkala. Setiap usulan
    -- punya: alasan, risiko, dan aksi yang akan dijalankan. Aksi TIDAK dijalankan
    -- otomatis - menunggu persetujuan pemilik (status 'menunggu').
    CREATE TABLE IF NOT EXISTS ai_agen (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tanggal     TEXT NOT NULL,
        ringkasan   TEXT NOT NULL,
        temuan      TEXT,
        usulan      TEXT,
        model       TEXT,
        provider    TEXT,
        dibuat_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_agen_tanggal ON ai_agen(tanggal);

    -- USULAN AKSI AGEN (menunggu persetujuan pemilik).
    CREATE TABLE IF NOT EXISTS ai_agen_usulan (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        agen_id     INTEGER NOT NULL,
        judul       TEXT NOT NULL,
        aksi        TEXT NOT NULL,
        payload     TEXT,
        alasan      TEXT,
        risiko      TEXT,
        status      TEXT DEFAULT 'menunggu',
        hasil       TEXT,
        dibuat_at   INTEGER NOT NULL,
        diputus_at  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ai_agen_usulan_status ON ai_agen_usulan(status, dibuat_at DESC);

    -- SARAN AGEN PER PERAN (permintaan pemilik 2026-10-02).
    -- Kartu saran di panel (Analisis Cepat + Saran Diskusi) diambil dari sini -
    -- hasil cek agen (kode + data), bukan daftar statis.
    CREATE TABLE IF NOT EXISTS ai_agen_saran (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        peran      TEXT NOT NULL,
        saran      TEXT NOT NULL,
        dibuat_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_agen_saran_peran ON ai_agen_saran(peran, dibuat_at DESC);

    -- PROVIDER AI KUSTOM (permintaan pemilik 2026-10-02).
    -- Pemilik ingin bisa MENAMBAH provider sendiri (nama + URL + api key),
    -- lalu menyimpan & mengelola MODEL yang dipakai. Provider bawaan
    -- (groq/openrouter) tetap ada di kode; tabel ini untuk TAMBAHAN.
    --
    -- api_key_enc disimpan TERENKRIPSI (AES-256-GCM, kunci dari SESSION_SECRET).
    -- Tidak pernah dikirim balik ke browser - UI hanya menampilkan versi
    -- tersamar (sk-...abcd).
    CREATE TABLE IF NOT EXISTS ai_providers (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        nama         TEXT NOT NULL,
        slug         TEXT NOT NULL UNIQUE,
        base_url     TEXT NOT NULL,
        api_key_enc  TEXT,
        env_key      TEXT,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER
    );

    -- MODEL AI yang DISIMPAN (permintaan pemilik 2026-10-02).
    -- Satu daftar tersendiri: label ramah + nama model asli + provider
    -- (slug provider bawaan 'groq'/'openrouter' ATAU slug provider kustom).
    CREATE TABLE IF NOT EXISTS ai_models (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        label       TEXT NOT NULL,
        model       TEXT NOT NULL,
        provider    TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider);

    -- ==========================================
    -- PEMAKAIAN AI (permintaan pemilik 2026-10-04)
    -- ==========================================
    -- "gw mau juga ada usage seperti [total requests, input/cached/output
    -- tokens, est cost, recent requests] ... real ga halu berdasarkan data".
    --
    -- Data DIAMBIL DARI RESPONSE PROVIDER (field usage yang dikirim API),
    -- bukan tebakan. Kalau provider tidak menyertakan usage, baris tetap
    -- dicatat (untuk hitungan request) dengan token 0.
    --
    --   ai_usage        : log MENTAH per permintaan (untuk grafik per jam
    --                     24 jam terakhir + daftar "Recent Requests").
    --                     Di-prune setelah 7 hari (rawat jalan).
    --   ai_usage_harian : ROLLUP per hari+provider+model - akumulasi TOTAL
    --                     seumur hidup (untuk Total Requests/Tokens/Cost).
    --                     Kecil dan tidak pernah dihapus, jadi angka total
    --                     tetap utuh walau log mentah dibersihkan.
    CREATE TABLE IF NOT EXISTS ai_usage (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        ts                INTEGER NOT NULL,
        provider          TEXT,
        model             TEXT,
        prompt_tokens     INTEGER DEFAULT 0,
        cached_tokens     INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens      INTEGER DEFAULT 0,
        ok                INTEGER DEFAULT 1,
        durasi_ms         INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ai_usage_ts ON ai_usage(ts);

    CREATE TABLE IF NOT EXISTS ai_usage_harian (
        day               TEXT NOT NULL,
        provider          TEXT NOT NULL DEFAULT '',
        model             TEXT NOT NULL DEFAULT '',
        requests          INTEGER DEFAULT 0,
        ok_requests       INTEGER DEFAULT 0,
        input_tokens      INTEGER DEFAULT 0,
        cached_tokens     INTEGER DEFAULT 0,
        output_tokens     INTEGER DEFAULT 0,
        PRIMARY KEY (day, provider, model)
    );
  `);

  // Migrasi kolom pengaturan per-model (permintaan pemilik 2026-10-02):
  // "gw mau bisa custom per model dari berapa banyak max text yang bisa dikasih
  // sama ai itu dan kecerdasannya pake takaran 1-10".
  //   max_tokens  : batas panjang jawaban AI (default 2000).
  //   kecerdasan  : 1-10 -> memengaruhi temperature + instruksi kedalaman.
  try {
    await db.execute('ALTER TABLE ai_models ADD COLUMN max_tokens INTEGER');
  } catch {}
  try {
    await db.execute('ALTER TABLE ai_models ADD COLUMN kecerdasan INTEGER');
  } catch {}
  try {
    await db.execute('ALTER TABLE ai_models ADD COLUMN catatan TEXT');
  } catch {}

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

  // PREFS ADMIN AI (permintaan pemilik 2026-10-02: "model harusnya kesimpan
  // walau logout / pindah device"). Key-value sederhana: provider, model,
  // mode, peran, maxTokens, kecerdasan. Satu baris per admin (discord_id).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_ai_prefs (
      discord_id  TEXT PRIMARY KEY,
      prefs       TEXT NOT NULL DEFAULT '{}',
      updated_at  INTEGER NOT NULL
    )
  `);

  // OAUTH PROVIDER (permintaan pemilik 2026-10-02: "login akun - OpenRouter
  // OAuth PKCE"). Menyimpan token OAuth: access_token, refresh_token,
  // expiry, dsb. Satu baris per admin+provider.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ai_oauth (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id     TEXT NOT NULL,
      provider       TEXT NOT NULL,
      access_token   TEXT,
      refresh_token  TEXT,
      expires_at     INTEGER,
      extra          TEXT,
      label          TEXT,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL,
      UNIQUE(discord_id, provider)
    )
  `);
  // Token PKCE sementara saat proses login (state -> verifier).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ai_oauth_state (
      state      TEXT PRIMARY KEY,
      discord_id TEXT NOT NULL,
      provider   TEXT NOT NULL,
      verifier   TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}

let _schemaReady = null;
export function schemaReady() {
  if (!_schemaReady) _schemaReady = ensureSchema().catch((e) => { _schemaReady = null; throw e; });
  return _schemaReady;
}

// Re-export supaya modul lain (activity.js, emojisServer.js, dll) tahu apakah
// web sedang lewat proxy bot -> skip DDL (CREATE TABLE) yang diblokir proxy.
export { PROXY_AKTIF };
