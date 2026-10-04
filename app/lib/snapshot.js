import { getDb, schemaReady } from './db';

// Aturan spec: SEMUA halaman harus tetap render walau bot/database sedang
// tidak bisa dihubungi. Jadi error koneksi \(timeout, dns, dsb\) ditelan + cache
// snapshot terakhir yang sukses dipakai sementara.
let _lastGood = null; // { snap, series, at }
// Error terakhir dari safeQuery (untuk diagnostik /api/diag-leaderboard).
export let _lastSafeError = null;

// ==========================================
// CACHE LIVE SINGKAT (optimasi latensi region 2026-10-04)
// ==========================================
// Vercel (Singapura) <-> Supabase (Jerman) = ~174ms PER QUERY. Query live
// (stats/leaderboard/bank) dipanggil tiap load halaman + polling admin ->
// tanpa cache, tiap load kena 174ms x banyak query. Cache 12 dtk: data cukup
// segar (halaman AutoRefresh), tapi round-trip DB berkurang drastis. Hasil
// null (error) tidak di-cache supaya retry langsung query ulang.
const _live = new Map(); // key -> { val, at }
const LIVE_TTL_MS = 12_000;
async function live(key, fn) {
  const now = Date.now();
  const hit = _live.get(key);
  if (hit && now - hit.at < LIVE_TTL_MS) return hit.val;
  const val = await fn();
  if (val !== null && val !== undefined) _live.set(key, { val, at: now });
  return val;
}

// ==========================================
// CACHE BACA SNAPSHOT 45 DETIK (optimasi egress 2026-10-04)
// ==========================================
// Supabase Free punya batas EGRESS 5 GB/bulan dan terpakai 92% (4,62 GB) di
// awal siklus. Penyebab terbesar: getLatestSnapshot() membaca payload penuh
// (128 KB) dari tabel monitor_snapshots di SETIAP panggilan - dan panel admin
// memanggilnya tiap 5 detik (polling /api/admin/data) -> ratusan MB/hari.
//
// KUNCI: snapshot yang disimpan HANYA berubah tiap 10 menit (throttle di
// /api/bot/stats). Jadi membaca ulang payload yang SAMA 12x per menit adalah
// pemborosan murni. Cache 45 detik mengembalikan data IDENTIK (snapshot belum
// sempat berubah), tapi memangkas baca DB ~9x -> egress jatuh drastis.
//
// Angka REAL-TIME (getLiveStats, getBotHeartbeat, getLiveShop, dst) TIDAK
// memakai cache ini - mereka query tabel public.* langsung tiap panggilan,
// jadi dashboard/shop tetap live. Cache ini HANYA untuk snapshot push bot
// yang memang statis antar-push.
const SNAP_CACHE_MS = 45_000;
let _snapCache = null; // { snap, at }

async function safeQuery(fn) {
  // Blip jaringan (ConnectTimeout/dns) sering cuma sekali lewat -> retry 1x
  // dengan jeda pendek sebelum nyerah. Error TERAKHIR dicatat supaya bisa
  // dilihat lewat endpoint diagnostik (jangan sampai gagal senyap).
  for (let i = 0; i < 2; i++) {
    try {
      return await fn();
    } catch (e) {
      _lastSafeError = { pesan: String(e?.message || e), code: e?.code || null, waktu: Date.now() };
      if (i === 0) await new Promise((res) => setTimeout(res, 250));
    }
  }
  return null;
}

// Snapshot monitor terbaru dari bot (null kalau belum pernah push / DB mati).
export async function getLatestSnapshot() {
  const kini = Date.now();
  // Cache baca 45 dtk: snapshot yang disimpan hanya berubah tiap 10 menit
  // (throttle), jadi hasil cache = data yang sama dengan query segar. Memangkas
  // egress Supabase drastis (lihat SNAP_CACHE_MS di atas). Data real-time tidak
  // lewat sini - mereka query tabel public.* langsung.
  if (_snapCache && kini - _snapCache.at < SNAP_CACHE_MS) return _snapCache.snap;
  const r = await safeQuery(async () => {
    await schemaReady();
    const db = getDb();
    const res = await db.execute('SELECT ts, data FROM monitor_snapshots ORDER BY ts DESC LIMIT 1');
    if (!res.rows.length) return null;
    return JSON.parse(res.rows[0].data);
  });
  if (r) {
    _lastGood = { ...(_lastGood || {}), snap: r, at: kini, snapAt: kini };
    _snapCache = { snap: r, at: kini };
    return r;
  }
  // DB error: pakai cadangan proses (maks 5 menit) supaya halaman tetap hidup.
  if (_lastGood?.snap && Date.now() - _lastGood.at < 5 * 60_000) return _lastGood.snap;
  return null;
}

// Series snapshot untuk grafik admin (7 hari terakhir).
// HEMAT (audit E1): dulu query ini narik SEMUA baris (±10.000 payload penuh
// 20-60KB = ratusan MB + parse JSON segunanya tiap poll 5 detik). Sekarang:
// sampling 1 titik per jam (maks 168 titik) + agregat di DB.
// FIX (migrasi Postgres 2026-10-03): json_extract() itu fungsi SQLite - TIDAK
// ada di Postgres (error 42883 -> grafik admin kosong). Ganti dengan cast
// jsonb: data::jsonb #>> '{monitor,gamesToday}' (hasil TEXT, sama persis).
export async function getSnapshotSeries(days = 7) {
  const since = Date.now() - days * 86400000;
  const rows = await safeQuery(async () => {
    await schemaReady();
    const db = getDb();
    const res = await db.execute({
      sql: `SELECT ts,
                   (data::jsonb #>> '{monitor,gamesToday}')  AS gamesToday,
                   (data::jsonb #>> '{monitor,totalMoney}')  AS totalMoney,
                   (data::jsonb #>> '{monitor,totalUsers}')  AS totalUsers
            FROM monitor_snapshots
            WHERE ts >= ? AND id IN (SELECT MAX(id) FROM monitor_snapshots WHERE ts >= ? GROUP BY ts / 3600000)
            ORDER BY ts ASC`,
      args: [since, since],
    });
    return res.rows;
  });
  let series = null;
  if (rows) {
    // FIX 2026-10-03: Postgres melowercase alias ("AS gamesToday" ->
    // "gamestoday"), sehingga mapping r.gamesToday selalu undefined -> semua
    // titik null -> grafik "Belum cukup data". Baca key CASE-INSENSITIVE.
    const get = (r, name) => {
      if (r[name] != null) return r[name];
      const lower = name.toLowerCase();
      if (r[lower] != null) return r[lower];
      const upper = name.toUpperCase();
      if (r[upper] != null) return r[upper];
      return null;
    };
    series = rows.map((r) => ({
      ts: Number(r.ts),
      gamesToday: get(r, 'gamesToday') == null ? null : Number(get(r, 'gamesToday')),
      totalMoney: get(r, 'totalMoney') == null ? null : Number(get(r, 'totalMoney')),
      totalUsers: get(r, 'totalUsers') == null ? null : Number(get(r, 'totalUsers')),
    }));
    _lastGood = _lastGood ? { ..._lastGood, series, at: Date.now() } : { snap: null, series, at: Date.now() };
    return series;
  }
  if (_lastGood?.series && Date.now() - _lastGood.at < 5 * 60_000) return _lastGood.series;
  return [];
}

// ==========================================
// LIVE STATS LANGSUNG DARI DATABASE BOT (2026-10-03)
// ==========================================
// Setelah migrasi ke SATU database PostgreSQL (Supabase), web TIDAK perlu
// menunggu bot "push" snapshot. Web bisa menghitung statistik LANGSUNG dari
// tabel bot (public.users, public.premium, public.game_scores). Ini membuat:
//   - angka selalu real-time (bukan data terakhir bot push)
//   - web tetap hidup walau bot sedang mati/restart (tidak ada "bot offline")
// Tabel bot ada di schema 'public' (web ada di schema 'web').
export async function getLiveStats() {
  // Cache 12 dtk (lihat LIVE_TTL_MS): query ini dipanggil dashboard + health
  // + AI tiap load - tanpa cache kena 174ms round-trip Jerman tiap kali.
  return live('stats', async () => {
    const kini = Date.now();
    const r = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      // Query ke schema public (tabel bot) - beri prefix public. eksplisit
      // supaya tidak terpengaruh search_path web.
      const res = await db.execute(`
        SELECT
          (SELECT COUNT(*) FROM public.users)                        AS totalUsers,
          (SELECT COALESCE(SUM(points), 0) FROM public.users)        AS totalMoney,
          (SELECT COUNT(*) FROM public.premium WHERE expires_at > ?) AS premiumCount,
          (SELECT COUNT(*) FROM public.game_scores
             WHERE played_at >= ?)                                   AS gamesToday,
          (SELECT COUNT(*) FROM public.playing_users)                AS inGameNow
      `, [kini, kini - 86400000]);
      const row = res.rows[0] || {};
      return {
        totalUsers: Number(row.totalusers ?? row.totalUsers ?? 0),
        totalMoney: Number(row.totalmoney ?? row.totalMoney ?? 0),
        premiumCount: Number(row.premiumcount ?? row.premiumCount ?? 0),
        gamesToday: Number(row.gamestoday ?? row.gamesToday ?? 0),
        // PEMAIN SEDANG IN-GAME (real-time): jumlah baris playing_users.
        // Pengganti kartu "Game 7 Hari" (permintaan pemilik 2026-10-03).
        inGameNow: Number(row.ingamenow ?? row.inGameNow ?? 0),
      };
    });
    if (r) {
      _lastGood = { ...(_lastGood || {}), live: r, liveAt: Date.now() };
      return r;
    }
    // DB error: pakai cache proses (maks 5 menit) supaya halaman tetap hidup.
    if (_lastGood?.live && Date.now() - _lastGood.liveAt < 5 * 60_000) return _lastGood.live;
    return null;
  });
}

// Daftar userId premium AKTIF langsung dari tabel bot (untuk badge).
export async function getLivePremiumIds() {
  // Cache 12 dtk: dipanggil leaderboard tiap load - hemat round-trip.
  return live('premIds', async () => {
    const r = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      const res = await db.execute('SELECT user_id FROM public.premium WHERE expires_at > ?', [Date.now()]);
      return res.rows.map((x) => String(x.user_id));
    });
    return r || [];
  });
}

// Heartbeat bot LANGSUNG dari tabel bot (public.bridge_meta.last_seen).
// Dipakai untuk status "bot online/offline" tanpa bergantung snapshot push.
export async function getBotHeartbeat() {
  // Cache 12 dtk: dipanggil health + dashboard tiap load - hemat round-trip.
  return live('hb', async () => {
    const r = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      const res = await db.execute("SELECT value FROM public.bridge_meta WHERE key = 'last_seen'");
      return res.rows.length ? Number(res.rows[0].value) : null;
    });
    return r;
  });
}

// ==========================================
// LEADERBOARD LANGSUNG DARI DB BOT (2026-10-03)
// ==========================================
// Dulu leaderboard menunggu snapshot push bot. Sekarang baca LANGSUNG dari
// tabel bot (public.users) - selalu ada data walau bot sedang restart.
// Bentuk hasil SAMA dengan snapshot.leaderboard supaya UI tidak perlu diubah.
export async function getLiveLeaderboard(limit = 10) {
  // Cache 12 dtk per limit: halaman leaderboard dipanggil tiap load.
  return live('lb:' + limit, async () => {
    const r = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      const res = await db.execute(
        `SELECT user_id, username, points, level, xp, avatar_url
           FROM public.users
          ORDER BY points DESC
          LIMIT ?`,
        [limit]
      );
      return res.rows.map((row, i) => ({
        rank: i + 1,
        userId: String(row.user_id),
        username: row.username || 'Pemain',
        points: Number(row.points || 0),
        level: Number(row.level || 1),
        xp: Number(row.xp || 0),
        avatarUrl: row.avatar_url || null,
      }));
    });
    return r || [];
  });
}

// Leaderboard GUILD langsung dari DB bot (public.guilds + jumlah member).
export async function getLiveGuildBoard(limit = 10) {
  // Cache 12 dtk per limit: halaman komunitas/leaderboard panggil ini.
  return live('gb:' + limit, async () => {
    const r = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      const res = await db.execute(
        `SELECT g.guild_code, g.name, g.total_points,
                (SELECT COUNT(*) FROM public.guild_members m WHERE m.guild_code = g.guild_code) AS members
           FROM public.guilds g
          ORDER BY g.total_points DESC
          LIMIT ?`,
        [limit]
      );
      return res.rows.map((row, i) => ({
        rank: i + 1,
        code: row.guild_code,
        name: row.name || 'Guild',
        points: Number(row.total_points || 0),
        members: Number(row.members || 0),
      }));
    });
    return r || [];
  });
}

// BANK langsung dari DB bot (public.bank_loans) - 2026-10-03.
// Bentuk hasil SAMA dengan snapshot.loans / snapshot.monitor.loans.
export async function getLiveBank() {
  // Cache 12 dtk: halaman bank panggil ini tiap load - hemat round-trip.
  return live('bank', async () => {
    const r = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      const now = Date.now();
      const [rows, ringkas] = await Promise.all([
        db.execute(
          `SELECT b.user_id, u.username, b.amount, b.total_due, b.due_date
             FROM public.bank_loans b LEFT JOIN public.users u ON u.user_id = b.user_id
            ORDER BY b.total_due DESC LIMIT 50`
        ),
        db.execute(
          `SELECT COUNT(*) AS count,
                  COUNT(*) FILTER (WHERE due_date < ?) AS overdue,
                  COALESCE(SUM(total_due),0) AS owed
             FROM public.bank_loans`,
          [now]
        ),
      ]);
      const s = ringkas.rows[0] || {};
      return {
        loans: rows.rows.map((l) => ({
          userId: String(l.user_id), username: l.username || 'Unknown',
          amount: Number(l.amount || 0), totalDue: Number(l.total_due || 0),
          dueDate: Number(l.due_date || 0), overdue: Number(l.due_date) < now,
        })),
        monitor: { count: Number(s.count || 0), overdue: Number(s.overdue || 0), owed: Number(s.owed || 0) },
      };
    });
    return r;
  });
}

// Format angka gaya id-ID (1.234.567) dan uptime - lihat lib/formatClient.js
// (SATU sumber). Dulu file ini punya salinan sendiri.
export { fmt, fmtUptime } from './formatClient';

// Waktu relatif "x lalu" - lihat lib/formatClient.js (SATU sumber, sudah
// menangani satuan hari). Dulu file ini punya salinan sendiri.
export { timeAgo } from './formatClient';

// Nama game dari gameType (history/missions).
// Daftar nama SUDAH dipindah ke lib/formatClient.js supaya cuma ada SATU sumber.
// Dulu fungsi ini punya daftar sendiri yang ketinggalan (masih "Riddle",
// "Math Challenge", "RPG Dungeon", "Heist", "Snake & Ladder") sehingga nama game
// bisa beda antar halaman. Sekarang meneruskan ke sumber kanonik itu.
export { gameName } from './formatClient';

// Buang token emoji Discord - DIPINDAH ke textUtil.js (client-safe) supaya
// Client Component tak ikut menarik DB. Re-export di sini agar import lama tetap jalan.
export { stripEmojiToken } from './textUtil';

// Apakah user ini sedang premium? TIGA sumber, yang paling akurat menang:
//  0. tabel public.premium LANGSUNG (paling murah: 1 query indexed) - BARU
//  1. data_requests profil terakhir (ACK LIVE ~5-10 detik setelah grant)
//  2. premiumMembers di snapshot bot (fallback terakhir)
// Urutan ini penting untuk PERFORMA (permintaan pemilik 2026-10-04): dulu
// selalu mulai dari data_requests, dan kalau kosong jatuh ke getLatestSnapshot()
// yang mem-PARSE payload JSON besar. Sekarang tabel premium dicek dulu - satu
// query murah yang langsung menjawab mayoritas kasus.
export async function userHasPremium(discordId) {
  if (!discordId) return false;
  // Cache 12 dtk per user: fungsi ini dipanggil SETIAP halaman (badge navbar)
  // + leaderboard. Tanpa cache kena 2-3 query round-trip Jerman tiap load.
  return live('prem:' + discordId, async () => {
  // 0) SUMBER PALING MURAH & PALING AKURAT: tabel public.premium (satu query
  //    indexed). Ini yang dipakai bot sebagai kebenaran - jadi web harus sama.
  try {
    const langsung = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      const res = await db.execute({
        sql: 'SELECT expires_at FROM public.premium WHERE user_id = ? LIMIT 1',
        args: [String(discordId)],
      });
      if (!res.rows.length) return false;
      const exp = Number(res.rows[0].expires_at || 0);
      return exp > Date.now();
    });
    if (langsung === true) return true;
    // Catatan: hasil `false` TIDAK langsung dikembalikan - bisa jadi barisnya
    // sudah dihapus bot tapi profil ACK masih segar (kasus grant yang sangat
    // baru). Kita lanjut cek sumber berikutnya supaya badge tetap muncul cepat.
  } catch { /* lanjut ke sumber berikutnya */ }

  // 1) Cek profil terakhir dari bot (diisi oleh ACK LIVE webhook/ack atau /api/me).
  // Dipakai HANYA kalau datanya masih segar (< 5 menit). Jika segar, ini adalah
  // SUMBER KEBENARAN PALING AKURAT (karena ini request spesifik untuk user ini).
  // Memperbaiki bug di mana admin mencabut premium manual, tapi snapshot global
  // terlambat update, sehingga user tidak bisa beli lagi.
  try {
    const r = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      const res = await db.execute({
        sql: "SELECT data, filled_at FROM data_requests WHERE discord_id = ? AND status = 'done' ORDER BY filled_at DESC LIMIT 1",
        args: [String(discordId)],
      });
      if (!res.rows.length) return null;
      const filledAt = Number(res.rows[0].filled_at || 0);
      if (!filledAt || Date.now() - filledAt > 5 * 60_000) return null;
      const parsed = JSON.parse(res.rows[0].data);
      // Bot mengirim premium sebagai OBJEK ({tier, expiresAt, lifetime, ...})
      // atau boolean. Strict `=== true` bikin user premium selalu kebaca false
      // selama cache profilnya segar (<5 mnt) -> tombol premium jadi tidak
      // konsisten (bug "disuruh beli lagi" padahal sudah premium).
      const p = parsed?.profile?.premium;
      if (p && typeof p === 'object') {
        if (!p.lifetime && Number(p.expiresAt) && Number(p.expiresAt) <= Date.now()) return false;
        return true;
      }
      return Boolean(p);
    });
    if (r !== null) return r; // Jika ada data segar, langsung gunakan itu! (bisa true atau false)
  } catch {}

  // Fallback ke snapshot global jika tidak ada data spesifik yang segar.
  const snap = await getLatestSnapshot();
  if ((snap?.premiumMembers || []).some((m) => String(m.userId) === String(discordId))) return true;

  return false;
  }); // tutup live()
}

export async function isUserBanned(discordId) {
  if (!discordId) return null;

  // JALUR CEPAT (permintaan pemilik 2026-10-04): baca tabel public.banned_users
  // LANGSUNG - satu query murah. Dulu fungsi ini (dipanggil di layout root,
  // artinya SETIAP halaman) membaca getLatestSnapshot() yang mem-parse payload
  // JSON besar - pemborosan terbesar untuk sekadar cek status banned 1 user.
  //
  // PENTING: safeQuery() mengembalikan null BAIK saat error MAUPUN saat hasilnya
  // kosong - jadi kita bungkus hasilnya dalam objek supaya bisa membedakan
  // "pasti tidak dibanned" dari "query gagal, coba snapshot".
  try {
    const r = await safeQuery(async () => {
      await schemaReady();
      const db = getDb();
      const res = await db.execute({
        sql: 'SELECT user_id, reason, banned_at, timeout_until FROM public.banned_users WHERE user_id = ? LIMIT 1',
        args: [String(discordId)],
      });
      return { baris: res.rows.length ? res.rows[0] : null };
    });
    if (r && typeof r === 'object' && 'baris' in r) {
      if (r.baris === null) return null; // pasti tidak dibanned
      const until = Number(r.baris.timeout_until) || 0;
      if (until > 0 && Date.now() > until) return null; // timeout lewat = bebas
      return { userId: String(r.baris.user_id), reason: r.baris.reason, bannedAt: r.baris.banned_at, timeoutUntil: until };
    }
  } catch { /* jatuh ke snapshot sebagai cadangan */ }

  // FALLBACK: snapshot bot (kalau query DB gagal / tabel tak ada).
  const snap = await getLatestSnapshot();
  // Payload bot mengirim user_id / timeout_until (snake_case, hasil SELECT mentah).
  // userId ikut dicek untuk jaga-jaga kalau format payload berubah.
  const banInfo = (snap?.monitor?.bannedUsers || []).find(
    (b) => String(b.user_id ?? b.userId) === String(discordId)
  );
  if (!banInfo) return null;
  // Timeout yang sudah lewat masa berlaku = bebas (bot baru membersihkan barisnya
  // saat dicek in-game; web tidak boleh membanned user yang sudah pulih).
  const until = Number(banInfo.timeout_until ?? banInfo.timeoutUntil) || 0;
  if (until > 0 && Date.now() > until) return null;
  return banInfo;
}
