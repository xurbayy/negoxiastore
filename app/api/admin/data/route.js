import { getSession, getAdminSession } from '../../../lib/session';
import { getDb } from '../../../lib/db';
import { getSnapshotSeries, getLatestSnapshot, getBotHeartbeat, getLiveStats } from '../../../lib/snapshot';
import { getPromoCache } from '../../../lib/promo-cache';
import { json, ready } from '../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// CACHE DATA ADMIN 8 DETIK (optimasi egress 2026-10-04)
// ==========================================
// Panel admin poll endpoint ini tiap 5 detik, dan tiap poll menjalankan 14
// query langsung ke Supabase (orders, log, feedback, promo, bank, premium,
// banned, title, topGames, dll). Tiap query = round-trip (~174ms) + EGRESS.
// Cache 8 detik: poll 5 dtk hanya kena DB tiap 8 dtk (bukan tiap poll) ->
// baca DB berkurang ~40% tanpa mengurangi kesegaran data secara nyata.
const _cache = { data: null, at: 0 };
const DATA_TTL_MS = 8_000;

// Invalidasi on-write (fix 2026-10-04): dipanggil route tulis (command/shop)
// SETELAH menulis DB supaya Activity Log & data panel langsung segar.
export function invalidateDataCache() {
  _cache.data = null;
  _cache.at = 0;
}

// GET /api/admin/data - semua data untuk admin panel (dashboard + log).
// Jalur akses: session admin (username+password) ATAU member di ADMIN_DISCORD_IDS.
export async function GET() {
  const admin = await getAdminSession();
  const session = await getSession(); // HARUS di scope fungsi: dipakai lagi di actorId di bawah
  let authorized = Boolean(admin);
  if (!authorized && session) {
    const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    authorized = adminIds.includes(session.discordId);
  }
  if (!authorized) return json({ ok: false, error: 'forbidden' }, 403);

  await ready();
  const db = getDb();

  // ==========================================
  // PARALEL (permintaan pemilik 2026-10-04: "optimalkan")
  // ==========================================
  // Dulu 14 query dijalankan BERURUTAN (await satu-satu) -> ~2,5-4 detik per
  // request. Padahal semuanya INDEPENDEN. Sekarang satu Promise.all: latensi
  // ditentukan query TERLAMBAT (~200-400ms), bukan jumlahnya.
  // CACHE 8 DTK (lihat DATA_TTL_MS): poll 5 dtk tidak query ulang tiap kali.
  let _hasil;
  if (_cache.data && Date.now() - _cache.at < DATA_TTL_MS) {
    _hasil = _cache.data;
  } else {
  _hasil = await Promise.all([
    getLatestSnapshot(),
    getSnapshotSeries(7),
    // Heartbeat + statistik LANGSUNG dari DB bot (Supabase) - tidak bergantung
    // snapshot push, jadi status bot akurat walau bridge push belum jalan.
    getBotHeartbeat(),
    getLiveStats(),
    db.execute(
      // BATAS 50 (permintaan pemilik 2026-10-04): seragam dengan semua history.
      'SELECT id, discord_id, plan, amount, gateway, gateway_ref, status, created_at, paid_at FROM orders ORDER BY created_at DESC LIMIT 50'
    ).catch(() => ({ rows: [] })),
    db.execute(
      // BATAS 50 (permintaan pemilik 2026-10-04): seragam dengan semua history.
      'SELECT id, action, payload, actor_id, status, result, created_at, executed_at FROM bot_commands ORDER BY created_at DESC LIMIT 50'
    ).catch(() => ({ rows: [] })),
    getPromoCache().catch(() => []),
    // BANK LOANS LANGSUNG DARI DB BOT (2026-10-03): BankManager dulu membaca
    // dari snapshot push (umur bisa 60+ dtk) sehingga setelah pemutihan daftar
    // masih menampilkan hutang lama -> admin mengira harus clear 2x.
    db.execute(`
      SELECT b.user_id, b.total_due, b.due_date,
             (SELECT u.username FROM public.users u WHERE u.user_id = b.user_id) AS username
      FROM public.bank_loans b
      ORDER BY b.due_date ASC
    `).catch(() => ({ rows: [] })),
    db.execute(
      'SELECT id, discord_id, username, kind, message, page, created_at FROM web_feedback ORDER BY created_at DESC LIMIT 50'
    ).catch(() => ({ rows: [] })),
    // ==========================================
    // DATA LANGSUNG DARI DB (permintaan pemilik 2026-10-03)
    // ==========================================
    // Dulu Promo/Redeem, NEXO Pass, Moderasi, dan Admin Title membaca dari
    // SNAPSHOT PUSH BOT (bisa basi 60+ dtk) -> admin mengira perintah/tombol
    // gagal padahal cuma telat. Sekarang diambil LANGSUNG dari tabel bot,
    // sama seperti BankManager & ManualOrders. Snapshot tetap dikirim sebagai
    // cadangan kalau query DB gagal.
    db.execute(
      `SELECT code, reward_type, reward_value, quota, claimed_count, created_at
         FROM public.promo_codes ORDER BY created_at DESC`
    ).catch(() => ({ rows: [] })),
    db.execute(
      // Daftar member NEXO Pass aktif: cukup 50 teratas (yang paling dekat
      // kedaluwarsa). Jumlah TOTAL dikirim terpisah (premiumTotal) supaya
      // judul panel tetap jujur walau daftarnya dipotong.
      `SELECT p.user_id, p.tier, p.expires_at, p.granted_by,
              (SELECT u.username FROM public.users u WHERE u.user_id = p.user_id) AS username
         FROM public.premium p
        WHERE p.expires_at > ?
        ORDER BY p.expires_at ASC LIMIT 50`,
      [Date.now()]
    ).catch(() => ({ rows: [] })),
    db.execute(
      `SELECT b.user_id, b.reason, b.banned_at, b.timeout_until,
              (SELECT u.username FROM public.users u WHERE u.user_id = b.user_id) AS username
         FROM public.banned_users b ORDER BY b.banned_at DESC`
    ).catch(() => ({ rows: [] })),
    db.execute(
      `SELECT user_id, username, admin_title FROM public.users
        WHERE admin_title IS NOT NULL ORDER BY username ASC`
    ).catch(() => ({ rows: [] })),
    // TOP GAME SEPANJANG MASA (permintaan pemilik 2026-10-04: kartu admin
    // "Total Users (all)" diganti jadi top game sepanjang masa - nama + emoji +
    // poin yang dihasilkan). Grup SELURUH game_scores (bukan cuma hari ini).
    db.execute(`SELECT game_type, COUNT(*) AS plays, COALESCE(SUM(points),0) AS points
                  FROM public.game_scores GROUP BY game_type ORDER BY plays DESC LIMIT 10`)
      .catch(() => ({ rows: [] })),
  ]);
  // Simpan ke cache 8 dtk - poll berikutnya tidak query 14 tabel lagi.
  _cache.data = _hasil;
  _cache.at = Date.now();
  }
  const [
    snap, series, heartbeat, liveStats, orders, log, promoCache, bankLoans,
    feedback, promoCodes, premiumMembers, bannedUsers, adminTitleHolders, topGamesAll,
  ] = _hasil;

    return json({
      ok: true,
      promoCache,
      actorId: admin ? `admin:${admin.adminUsername}` : session?.discordId,
      snapshot: snap,
      bankLoans: bankLoans.rows.map((r) => ({
        userId: String(r.user_id),
        username: r.username || null,
        totalDue: Number(r.total_due || 0),
        dueDate: r.due_date ? Number(r.due_date) : null,
      })),
      series,
      botHeartbeat: heartbeat,
      liveStats,
      feedback: feedback.rows.map((r) => ({
        id: Number(r.id),
        discordId: r.discord_id,
        username: r.username,
        kind: r.kind,
        message: r.message,
        page: r.page,
        createdAt: Number(r.created_at),
      })),
      // PENTING - JANGAN kirim gambar bukti transfer di sini (permintaan pemilik
      // 2026-10-04: "optimalkan jangan ada yang bocor").
      // Dulu `gatewayRef` dikirim APA ADANYA - dan untuk order manual isinya
      // { senderName, receiptBase64 } dengan gambar base64 ~18 KB per order.
      // 29 order = 519 KB (62% dari seluruh payload 815 KB!) yang didownload
      // panel TIAP 5 DETIK. Sekarang hanya metadata kecil (pengirim + flag ada
      // gambar); gambarnya diambil lewat /api/admin/manual-order/[id] saat
      // admin benar-benar membuka detail.
      orders: orders.rows.map((r) => {
        let ref = null;
        try {
          const p = JSON.parse(r.gateway_ref || 'null');
          if (p && typeof p === 'object') {
            ref = {
              senderName: p.senderName || null,
              adaBukti: Boolean(p.receiptBase64),
              // DURASI order (permintaan pemilik 2026-10-08) - panel memakai
              // ini untuk menampilkan "3 bulan (90 hari)" & nominal yang benar.
              months: Number.isFinite(Number(p.months)) ? Number(p.months) : null,
              days: Number.isFinite(Number(p.days)) ? Number(p.days) : null,
              // Penanda versi agar UI tahu ini metadata, bukan data lama.
              ringkas: true,
            };
          }
        } catch { ref = null; }
        return {
          id: Number(r.id),
          discordId: r.discord_id,
          plan: r.plan,
          amount: Number(r.amount),
          gateway: r.gateway,
          gatewayRef: ref,
          status: r.status,
          createdAt: Number(r.created_at),
          paidAt: r.paid_at ? Number(r.paid_at) : null,
        };
      }),
      // Data LIVE dari DB (menggantikan snapshot yang bisa basi).
      promoCodes: promoCodes.rows.map((r) => ({
        code: r.code,
        rewardType: r.reward_type,
        rewardValue: r.reward_value,
        quota: Number(r.quota || 0),
        claimed: Number(r.claimed_count || 0),
        createdAtMs: Number(r.created_at || 0) * 1000,
      })),
      premiumMembers: premiumMembers.rows.map((r) => ({
        userId: String(r.user_id),
        username: r.username || null,
        tier: r.tier,
        expiresAt: r.expires_at ? Number(r.expires_at) : null,
        grantedBy: r.granted_by || null,
      })),
      // Jumlah TOTAL member aktif (bukan hanya yang tampil di daftar 50).
      premiumTotal: Number(liveStats?.premiumCount || premiumMembers.rows.length),
      bannedUsers: bannedUsers.rows.map((r) => ({
        userId: String(r.user_id),
        username: r.username || null,
        reason: r.reason,
        bannedAt: r.banned_at ? Number(r.banned_at) : null,
        timeoutUntil: r.timeout_until ? Number(r.timeout_until) : null,
      })),
      adminTitleHolders: adminTitleHolders.rows.map((r) => ({
        userId: String(r.user_id),
        username: r.username || null,
        adminTitle: r.admin_title,
      })),
      // Top game sepanjang masa (untuk kartu admin) - nama+emoji diresolve
      // di komponen Dashboard via gameDisplay().
      topGamesAll: topGamesAll.rows.map((r) => ({
        game: r.game_type,
        plays: Number(r.plays || 0),
        points: Number(r.points || 0),
      })),
      log: log.rows.map((r) => {
        const p = safeParse(r.payload);
        // BUANG base64 dari log (permintaan pemilik 2026-10-04: "optimalkan
        // jangan ada yang bocor"). Aksi dm_admin membawa fileBase64 gambar
        // bukti (~67 KB per baris!) - dan Activity Log TIDAK menampilkan
        // gambar itu, jadi ikut terkirim tiap poll 5 dtk tanpa manfaat.
        if (p && typeof p === 'object') {
          if ('fileBase64' in p) {
            p.fileBase64 = null;
            p.adaLampiran = true;
          }
          // payload panjang lain juga dipotong (mis. pesan sangat panjang).
          if (typeof p.message === 'string' && p.message.length > 500) {
            p.message = p.message.slice(0, 500) + '...';
          }
        }
        return {
          id: Number(r.id),
          action: r.action,
          payload: p,
          actorId: r.actor_id,
          status: r.status,
          result: r.result,
          createdAt: Number(r.created_at),
          executedAt: r.executed_at ? Number(r.executed_at) : null,
        };
      }),
    });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
