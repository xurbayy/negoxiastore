import { getDb, schemaReady } from './db';

// Aturan spec: SEMUA halaman harus tetap render walau bot/database sedang
// tidak bisa dihubungi. Jadi error koneksi \(timeout, dns, dsb\) ditelan + cache
// snapshot terakhir yang sukses dipakai sementara.
let _lastGood = null; // { snap, series, at }
// Error terakhir dari safeQuery (untuk diagnostik /api/diag-leaderboard).
export let _lastSafeError = null;

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
  // ==========================================
  // SWR CACHE (2026-10-03, permintaan pemilik): "muncul dulu, perbarui di
  // belakang". Halaman publik menampilkan data CACHE LANGSUNG (0 query DB)
  // dan menyegarkan di latar hanya kalau cache sudah basi. Ini memangkas
  // latensi halaman dari ratusan ms (bolak-balik ke Supabase) menjadi ~0.
  //   - SEGAR < 15 dtk : langsung pakai cache (0 query)
  //   - BASI  >= 15 dtk: refresh latar + tetap serahkan cache lama (stale)
  //     ke pemanggil, SEHINGGA halaman tidak pernah menunggu.
  //   - DB mati        : cache sampai 5 menit tetap disajikan (fallback lama).
  // ==========================================
  const kini = Date.now();
  const STALE_MS = 15_000;
  if (_lastGood?.snap && _lastGood.snapAt && kini - _lastGood.snapAt < STALE_MS) {
    return _lastGood.snap;
  }
  const r = await safeQuery(async () => {
    await schemaReady();
    const db = getDb();
    const res = await db.execute('SELECT ts, data FROM monitor_snapshots ORDER BY ts DESC LIMIT 1');
    if (!res.rows.length) return null;
    return JSON.parse(res.rows[0].data);
  });
  if (r) {
    _lastGood = { ...(_lastGood || {}), snap: r, at: kini, snapAt: kini };
    return r;
  }
  // DB error: pakai cache proses (maks 5 menit) supaya halaman tetap hidup.
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
  const kini = Date.now();
  if (_lastGood?.live && _lastGood.liveAt && kini - _lastGood.liveAt < 30_000) {
    return _lastGood.live;
  }
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
    _lastGood = { ...(_lastGood || {}), live: r, liveAt: kini };
    return r;
  }
  // DB error: pakai cache proses (maks 5 menit) supaya halaman tetap hidup.
  if (_lastGood?.live && Date.now() - _lastGood.liveAt < 5 * 60_000) return _lastGood.live;
  return null;
}

// Daftar userId premium AKTIF langsung dari tabel bot (untuk badge).
export async function getLivePremiumIds() {
  const r = await safeQuery(async () => {
    await schemaReady();
    const db = getDb();
    const res = await db.execute('SELECT user_id FROM public.premium WHERE expires_at > ?', [Date.now()]);
    return res.rows.map((x) => String(x.user_id));
  });
  return r || [];
}

// Heartbeat bot LANGSUNG dari tabel bot (public.bridge_meta.last_seen).
// Dipakai untuk status "bot online/offline" tanpa bergantung snapshot push.
export async function getBotHeartbeat() {
  const r = await safeQuery(async () => {
    await schemaReady();
    const db = getDb();
    const res = await db.execute("SELECT value FROM public.bridge_meta WHERE key = 'last_seen'");
    return res.rows.length ? Number(res.rows[0].value) : null;
  });
  return r;
}

// ==========================================
// LEADERBOARD LANGSUNG DARI DB BOT (2026-10-03)
// ==========================================
// Dulu leaderboard menunggu snapshot push bot. Sekarang baca LANGSUNG dari
// tabel bot (public.users) - selalu ada data walau bot sedang restart.
// Bentuk hasil SAMA dengan snapshot.leaderboard supaya UI tidak perlu diubah.
export async function getLiveLeaderboard(limit = 10) {
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
}

// Leaderboard GUILD langsung dari DB bot (public.guilds + jumlah member).
export async function getLiveGuildBoard(limit = 10) {
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
}

// BANK langsung dari DB bot (public.bank_loans) - 2026-10-03.
// Bentuk hasil SAMA dengan snapshot.loans / snapshot.monitor.loans.
export async function getLiveBank() {
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

// Apakah user ini sedang premium? DUA sumber, yang terbaru menang:
//  1. premiumMembers di snapshot bot (segar tiap 60 detik dari push)
//  2. data_requests profil terakhir (ACK LIVE ~5-10 detik setelah grant)
// Ini bikin badge NEXO Pass muncul cepat setelah pembayaran, tanpa menunggu
// push snapshot berikutnya. Aman kalau DB error -> false.
export async function userHasPremium(discordId) {
  if (!discordId) return false;

  // Cek profil terakhir dari bot (diisi oleh ACK LIVE webhook/ack atau /api/me).
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
}

export async function isUserBanned(discordId) {
  if (!discordId) return null;
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
