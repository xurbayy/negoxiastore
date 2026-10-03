import { getDb, schemaReady } from './db';

// Aturan spec: SEMUA halaman harus tetap render walau bot/database sedang
// tidak bisa dihubungi. Jadi error Turso (timeout, dns, dsb) ditelan + cache
// snapshot terakhir yang sukses dipakai sementara.
let _lastGood = null; // { snap, series, at }

async function safeQuery(fn) {
  // Blip jaringan ke Turso (ConnectTimeout) sering cuma sekali lewat ->
  // retry 1x dengan jeda pendek sebelum nyerah ke cache.
  for (let i = 0; i < 2; i++) {
    try {
      return await fn();
    } catch {
      if (i === 0) await new Promise((res) => setTimeout(res, 250));
    }
  }
  return null;
}

// Snapshot monitor terbaru dari bot (null kalau belum pernah push / DB mati).
export async function getLatestSnapshot() {
  // CACHE MEMORI 10 DETIK: beberapa pemanggilan berturutan (mis. router.refresh
  // dari beberapa tab, atau beberapa komponen dalam satu render) tidak perlu
  // query DB + parse JSON besar berulang. Memotong beban CPU & bandwidth.
  const kini = Date.now();
  if (_lastGood?.snap && _lastGood.snapAt && kini - _lastGood.snapAt < 10_000) {
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
// sampling 1 titik per jam (maks 168 titik) + json_extract agregat di DB,
// payload penuh tidak pernah keluar dari Turso.
export async function getSnapshotSeries(days = 7) {
  const since = Date.now() - days * 86400000;
  const rows = await safeQuery(async () => {
    await schemaReady();
    const db = getDb();
    const res = await db.execute({
      sql: `SELECT ts,
                   json_extract(data, '$.monitor.gamesToday')  AS gamesToday,
                   json_extract(data, '$.monitor.totalMoney')  AS totalMoney,
                   json_extract(data, '$.monitor.totalUsers')  AS totalUsers
            FROM monitor_snapshots
            WHERE id IN (SELECT MAX(id) FROM monitor_snapshots WHERE ts >= ? GROUP BY ts / 3600000)
            ORDER BY ts ASC`,
      args: [since],
    });
    return res.rows;
  });
  let series = null;
  if (rows) {
    series = rows.map((r) => ({
      ts: Number(r.ts),
      gamesToday: r.gamesToday == null ? null : Number(r.gamesToday),
      totalMoney: r.totalMoney == null ? null : Number(r.totalMoney),
      totalUsers: r.totalUsers == null ? null : Number(r.totalUsers),
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
           WHERE played_at >= ?)                                   AS gamesToday
    `, [kini, kini - 86400000]);
    const row = res.rows[0] || {};
    return {
      totalUsers: Number(row.totalusers ?? row.totalUsers ?? 0),
      totalMoney: Number(row.totalmoney ?? row.totalMoney ?? 0),
      premiumCount: Number(row.premiumcount ?? row.premiumCount ?? 0),
      gamesToday: Number(row.gamestoday ?? row.gamesToday ?? 0),
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
