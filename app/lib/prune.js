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
// CATATAN (fix 2026-10-04): nama key ini sempat TERKORUPSI (ada karakter
// ellipsis U+2026 di tengah). Sekarang nama bersih; key rusak lama dibersihkan.
const PRUNE_KEY = 'prune:last_done_at';
const PRUNE_EVERY_MS = 10 * 60_000;

async function tryExec(db, sql, args = []) {
  try { await db.execute({ sql, args }); return true; } catch { return false; }
}

// DELETE dengan LIMIT tidak didukung SQLite murni -> pakai subquery id.
// PostgreSQL (2026-10-03): webhook_events sudah punya kolom id, dan rowid
// TIDAK ADA di Postgres. deleteLimitedByRowid jadi fallback 2 tahap: coba
// id dulu (jalan di PG), kalau gagal baru rowid (SQLite lama).
async function deleteLimited(db, table, whereSql, args, limit = 5000) {
  await tryExec(
    db,
    `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${whereSql} ORDER BY id ASC LIMIT ${Number(limit)})`,
    args
  );
}

async function deleteLimitedByRowid(db, table, whereSql, args, limit = 5000) {
  // Jalur utama (Postgres): webhook_events punya kolom id.
  const ok = await tryExec(
    db,
    `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE ${whereSql} ORDER BY id ASC LIMIT ${Number(limit)})`,
    args
  );
  if (!ok) {
    // Jalur lama (SQLite): tabel tanpa kolom id -> rowid.
    await tryExec(
      db,
      `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${whereSql} ORDER BY rowid ASC LIMIT ${Number(limit)})`,
      args
    );
  }
}

async function pruneNow(db, now) {
  // INDEX TAMBAHAN (fix 2026-10-04): tabel yang sering di-query tapi belum
  // punya index selain primary key -> query jadi lambat seiring data bertambah.
  await tryExec(db, 'CREATE INDEX IF NOT EXISTS idx_emoji_catalog_name ON web.emoji_catalog (name)');
  await tryExec(db, 'CREATE INDEX IF NOT EXISTS idx_snapshots_ts_desc ON web.monitor_snapshots (ts DESC)');
  await tryExec(db, 'CREATE INDEX IF NOT EXISTS idx_missions_user ON public.daily_missions (user_id)');

  // Snapshot: 14 hari (DITURUNKAN dari 30, fix 2026-10-04).
  // Dengan simpan 1x/10 menit = 144 baris/hari, 14 hari = ~2.016 baris
  // (~130 MB payload). Sebelumnya 30 hari x 1.188 baris = 2,3 GB - itulah
  // sebab DB membengkak ke 109 MB (79% tabel ini) & query melambat.
  await tryExec(db, 'DELETE FROM monitor_snapshots WHERE ts < ?', [now - 14 * DAY]);

  // ==========================================
  // TRIM PAYLOAD SNAPSHOT TUA (fix 2026-10-04 lanjutan)
  // ==========================================
  // Payload penuh ±131 KB per baris (berisi daftar pemain, kode, dll).
  // Baris >12 jam TIDAK PERNAH dibaca sebagai "snapshot terkini" - satu-satunya
  // pembaca baris lama adalah getSnapshotSeries() yang hanya butuh 3 angka
  // (gamesToday, totalMoney, totalUsers). Jadi payload tua dipangkas ke bentuk
  // minimal itu: 131 KB -> ~120 byte per baris.
  // PENTING: baris TERBARU selalu dikecualikan - kalau bot mati >12 jam,
  // getLatestSnapshot() masih butuh payload penuhnya untuk fallback halaman.
  // Efek: 14 hari retensi turun dari ~264 MB menjadi ~10 MB (payload penuh
  // hanya disimpan 12 jam terakhir).
  await tryExec(db, `
    UPDATE monitor_snapshots
       SET data = jsonb_build_object(
             'ts', ts,
             'monitor', jsonb_build_object(
               'gamesToday', (data::jsonb #>> '{monitor,gamesToday}'),
               'totalMoney', (data::jsonb #>> '{monitor,totalMoney}'),
               'totalUsers', (data::jsonb #>> '{monitor,totalUsers}')
             )
           )::text
     WHERE id IN (
       SELECT id FROM monitor_snapshots
        WHERE ts < ? AND length(data) > 500
          AND id <> (SELECT id FROM monitor_snapshots ORDER BY ts DESC LIMIT 1)
        ORDER BY id ASC LIMIT 500
     )
  `, [now - 12 * 60 * 60_000]);

  // Rate limit: window sudah lewat >1 jam tidak dipakai lagi.
  await tryExec(db, 'DELETE FROM rate_limit WHERE window_start < ?', [now - 60 * 60_000]);

  // Saran agen AI (tabel legacy, tak ada penulis baru): simpan 30 hari.
  await tryExec(db, 'DELETE FROM ai_agen_saran WHERE dibuat_at < ?', [now - 30 * DAY]);

  // Meta rusak dari masa lalu (nama key terkorupsi karakter ellipsis U+2026).
  // Kode sekarang memakai nama bersih; baris rusak dibersihkan sekali di sini.
  await tryExec(db, "DELETE FROM web_meta WHERE key LIKE '%\u2026%'");

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
  // Cap 50 terbaru total: idempotensi webhook hanya butuh event beberapa jam
  // terakhir; menyimpan ribuan event lama = beban tanpa manfaat.
  await tryExec(db, `
    DELETE FROM webhook_events WHERE event_id IN (
      SELECT event_id FROM (
        SELECT event_id, ROW_NUMBER() OVER (ORDER BY processed_at DESC) AS rn
        FROM webhook_events
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // Order pending TELANTAR: user buka popup Snap lalu pergi tanpa melanjutkan.
  // Tanpa ini order menggantung 'pending' selamanya (dan bisa numpuk kalau user
  // klik Beli lagi). 30 menit = token Snap sudah tidak relevan; order lama
  // ditutup supaya user selalu mulai dari keadaan bersih.
  await tryExec(db, "UPDATE orders SET status = 'expired' WHERE status = 'pending' AND created_at < ?", [now - 30 * 60_000]);

  // Emoji registry: yang sudah removed >90 hari.
  await deleteLimited(db, 'emoji_registry', 'removed_at IS NOT NULL AND removed_at < ?', [now - 90 * DAY]);

  // ==========================================
  // BATAS MAKSIMAL HISTORY = 50 PER ENTITAS (permintaan pemilik 2026-10-04)
  // ==========================================
  // "gw mau ada batas maksimal penyimpanan history yaitu 50 history dari
  //  semuanya... biar database aman walau bot udah bertahun-tahun".
  //
  // Aturan: setiap tabel history menyimpan MAKSIMAL 50 baris per pemain
  // (atau per action untuk log error). Yang lebih lama dibuang, terbaru
  // selalu dipertahankan. Batch dibatasi supaya prune tidak pernah lama.
  //
  // CATATAN PENTING - yang TIDAK ikut aturan ini karena sudah punya batas
  // sendiri atau bukan history:
  //  - orders: riwayat pembayaran = data keuangan, TIDAK PERNAH dihapus.
  //  - bot_commands grant/revoke done: bahan rekonsiliasi premium (aturan
  //    umur sendiri di atas).
  //  - web_notifications broadcast (discord_id NULL): pengumuman, bukan
  //    history personal.
  //  - emoji_catalog: katalog (bukan history), di-upsert oleh bot.
  await tryExec(db, `
    DELETE FROM data_requests WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY discord_id ORDER BY id DESC) AS rn
        FROM data_requests WHERE status != 'pending'
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // web_redeem_claims: cap 50/user TAPI hanya untuk kode yang SUDAH TIDAK
  // AKTIF. Klaim kode aktif = penanda "sudah pernah klaim" (mencegah klaim
  // dobel) dan klaim pending = sedang diproses bot - dua-duanya TIDAK BOLEH
  // dihapus. Kode exhausted/tidak ada di cache toh sudah ditolak /api/redeem,
  // jadi baris klaimnya aman dianggap riwayat.
  await tryExec(db, `
    DELETE FROM web_redeem_claims WHERE (discord_id, code) IN (
      SELECT discord_id, code FROM (
        SELECT discord_id, code, ROW_NUMBER() OVER (PARTITION BY discord_id ORDER BY claimed_at DESC) AS rn
        FROM web_redeem_claims
        WHERE status != 'pending'
          AND code NOT IN (SELECT code FROM web_promo_cache WHERE exhausted = 0)
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  await tryExec(db, `
    DELETE FROM web_notifications WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY discord_id ORDER BY id DESC) AS rn
        FROM web_notifications WHERE discord_id IS NOT NULL
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // Feedback user: simpan 50 terbaru per pengirim.
  await tryExec(db, `
    DELETE FROM web_feedback WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY discord_id ORDER BY id DESC) AS rn
        FROM web_feedback
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // Log error berulang (failed/rejected) - cukup 50 terbaru per action.
  // Tanpa ini, satu bug yang terulang (mis. 151x grant_premium gagal) bisa
  // membanjiri Activity Log selama 30 hari sebelum aturan umur di atas
  // sempat membuangnya. Status done TIDAK disentuh di sini.
  await tryExec(db, `
    DELETE FROM bot_commands WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY action ORDER BY id DESC) AS rn
        FROM bot_commands WHERE status IN ('failed','rejected')
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // Log sukses (done) - cukup 50 terbaru per action, KECUALI grant/revoke
  // premium yang jadi bahan rekonsiliasi (aturan umurnya sendiri di atas).
  // Kalau grant done ikut dipotong, rekonsiliasi bisa mengira premium hilang
  // lalu grant ULANG -> expiry user molor tanpa sebab.
  await tryExec(db, `
    DELETE FROM bot_commands WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY action ORDER BY id DESC) AS rn
        FROM bot_commands WHERE status = 'done'
          AND action NOT IN ('grant_premium','revoke_premium')
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // State OAuth PKCE yang telantar (proses login tidak pernah selesai).
  await tryExec(db, 'DELETE FROM ai_oauth_state WHERE created_at < ?', [now - DAY]);

  // Penutupan notifikasi per user: cukup 50 terbaru.
  await tryExec(db, `
    DELETE FROM web_notif_dismiss WHERE (discord_id, key) IN (
      SELECT discord_id, key FROM (
        SELECT discord_id, key, ROW_NUMBER() OVER (PARTITION BY discord_id ORDER BY dismissed_at DESC) AS rn
        FROM web_notif_dismiss
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // Broadcast (discord_id NULL) bukan milik siapa pun -> cukup 50 terbaru total.
  await tryExec(db, `
    DELETE FROM web_notifications WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY id DESC) AS rn
        FROM web_notifications WHERE discord_id IS NULL
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // Saran agen AI: cukup 50 terbaru per peran.
  await tryExec(db, `
    DELETE FROM ai_agen_saran WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY peran ORDER BY dibuat_at DESC, id DESC) AS rn
        FROM ai_agen_saran
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // Diskusi tersimpan / catatan AI / pengingat: cukup 50 terbaru.
  await tryExec(db, `
    DELETE FROM ai_diskusi WHERE id IN (
      SELECT id FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(updated_at, created_at) DESC) AS rn FROM ai_diskusi) t WHERE rn > 50 LIMIT 5000
    )`);
  await tryExec(db, `
    DELETE FROM ai_notes WHERE id IN (
      SELECT id FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn FROM ai_notes) t WHERE rn > 50 LIMIT 5000
    )`);
  await tryExec(db, `
    DELETE FROM ai_reminders WHERE id IN (
      SELECT id FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY dibuat_at DESC) AS rn FROM ai_reminders) t WHERE rn > 50 LIMIT 5000
    )`);

  // Log mentah pemakaian AI >7 hari (permintaan pemilik 2026-10-04). Rollup
  // ai_usage_harian TIDAK disentuh (akumulasi total seumur hidup). Baris
  // >7 hari hanya dipakai grafik 24 jam yang sudah lewat, jadi aman dibuang.
  await tryExec(db, 'DELETE FROM ai_usage WHERE ts < ?', [now - 7 * DAY]);

  // ==========================================
  // TABEL BOT (public.*) - BATAS 50 PER PEMAIN (permintaan pemilik 2026-10-04)
  // ==========================================
  // Tabel-tabel ini tumbuh tiap game/transaksi tanpa batas. Semuanya = riwayat
  // (bukan data keuangan yang dipertahankan), jadi cukup 50 terbaru per pemain.
  // PENTING: yang TIDAK disentuh - users, premium, inventory, bank_loans,
  // user_titles (state aktif, bukan riwayat) dan promo_claims (sudah dibatasi
  // PK user+code dari jumlah kode yang ada).
  //
  // PENGECUALIAN PENTING (fix 2026-10-04): transactions yang punya item_key
  // (pembelian item) TIDAK ikut dipotong - itu CATATAN PENJUALAN (metrik
  // bisnis "Item Paling Sering Dibeli" di dashboard), bukan history pemain.
  // Jumlahnya kecil (belasan-ratusan) dan tetap tumbuh lambat, jadi tidak
  // membahayakan ukuran DB.
  await tryExec(db, `
    DELETE FROM public.game_scores WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY played_at DESC, id DESC) AS rn
        FROM public.game_scores
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  await tryExec(db, `
    DELETE FROM public.transactions WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC) AS rn
        FROM public.transactions
        WHERE item_key IS NULL
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  await tryExec(db, `
    DELETE FROM public.daily_missions WHERE (user_id, day) IN (
      SELECT user_id, day FROM (
        SELECT user_id, day, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day DESC) AS rn
        FROM public.daily_missions
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  await tryExec(db, `
    DELETE FROM public.shop_restock_log WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY item_key ORDER BY restocked_at DESC, id DESC) AS rn
        FROM public.shop_restock_log
      ) t WHERE rn > 50 LIMIT 5000
    )`);

  // Progres RPG per musim: cukup 50 musim terbaru per pemain (4+ tahun).
  await tryExec(db, `
    DELETE FROM public.rpg_progress WHERE (user_id, season) IN (
      SELECT user_id, season FROM (
        SELECT user_id, season, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY season DESC) AS rn
        FROM public.rpg_progress
      ) t WHERE rn > 50 LIMIT 5000
    )`);
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
