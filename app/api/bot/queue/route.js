import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { hasRecentActivity } from '../../../lib/activity';
import { getDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// GET /api/bot/queue - bot tarik antrean tiap 15 detik.
//
// CLAIM ATOMIK (perbaikan race condition):
//   Dulu status TIDAK diubah saat pengambilan (baru diubah di ack). Akibatnya
//   ada jendela antara "poll" dan "ack" di mana perintah masih 'pending':
//     - bot restart di tengah eksekusi -> perintah diambil & dijalankan LAGI
//     - dua bot jalan bersamaan -> keduanya mengambil perintah yang SAMA
//   Itu berbahaya untuk perintah yang TIDAK aman diulang (grant_premium,
//   transfer poin): user bisa menerima 2x.
//
//   Sekarang perintah di-CLAIM dengan status 'processing' + lease (claimed_at).
//   - Bot lain tidak akan mengambil baris yang sama (status bukan 'pending').
//   - Kalau bot mati di tengah, lease kedaluwarsa -> perintah kembali 'pending'
//     sehingga pekerjaan tidak hilang selamanya.

// Berapa lama sebuah claim dianggap hidup sebelum boleh direbut ulang.
// Render/eksekusi bot normal < 30 detik; 2 menit memberi ruang aman
// sekaligus memastikan perintah yang nyangkut tidak menggantung selamanya.
const LEASE_MS = 2 * 60 * 1000;

export async function GET(request) {
  const denied = verifyBearer(request);
  if (denied) return denied;

  await ready();
  const db = getDb();

  const now = Date.now();

  // 1) Kembalikan claim yang lease-nya kedaluwarsa (bot mati / crash) supaya
  //    perintah tidak nyangkut permanen. Dibatasi supaya tidak berat.
  try {
    await db.execute({
      sql: "UPDATE bot_commands SET status = 'pending', claimed_at = NULL WHERE status = 'processing' AND (claimed_at IS NULL OR claimed_at < ?)",
      args: [now - LEASE_MS],
    });
  } catch {
    // Kolom claimed_at mungkin belum ada (DB lama) -> diabaikan; claim di
    // bawah tetap berjalan lewat status 'processing'.
  }

  // 2) Ambil kandidat (belum diklaim), urut prioritas seperti semula.
  const candidates = await db.execute(
    "SELECT id, action, payload, actor_id FROM bot_commands WHERE status = 'pending' ORDER BY CASE WHEN action IN ('grant_premium', 'redeem_promo_web') THEN 0 ELSE 1 END, created_at ASC LIMIT 50"
  );

  // 3) CLAIM ATOMIK: tandai 'processing' HANYA kalau statusnya masih 'pending'.
  //    Kalau bot lain sudah lebih dulu mengklaim, UPDATE ini tidak mengenai
  //    baris itu (changes=0) -> perintah tidak diambil dua kali.
  const claimed = [];
  for (const r of candidates.rows) {
    try {
      const res = await db.execute({
        sql: "UPDATE bot_commands SET status = 'processing', claimed_at = ? WHERE id = ? AND status = 'pending'",
        args: [now, r.id],
      });
      if (res.rowsAffected > 0) claimed.push(r);
    } catch {
      // Kalau kolom claimed_at belum ada, coba tanpa kolom itu.
      try {
        const res = await db.execute({
          sql: "UPDATE bot_commands SET status = 'processing' WHERE id = ? AND status = 'pending'",
          args: [r.id],
        });
        if (res.rowsAffected > 0) claimed.push(r);
      } catch {}
    }
  }

  // 4) Data request: pola sama (claim atomik + lease).
  try {
    await db.execute({
      sql: "UPDATE data_requests SET status = 'pending', claimed_at = NULL WHERE status = 'processing' AND (claimed_at IS NULL OR claimed_at < ?)",
      args: [now - LEASE_MS],
    });
  } catch {}

  const reqCandidates = await db.execute(
    "SELECT id, discord_id FROM data_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20"
  );

  const claimedReqs = [];
  for (const r of reqCandidates.rows) {
    try {
      const res = await db.execute({
        sql: "UPDATE data_requests SET status = 'processing', claimed_at = ? WHERE id = ? AND status = 'pending'",
        args: [now, r.id],
      });
      if (res.rowsAffected > 0) claimedReqs.push(r);
    } catch {
      try {
        const res = await db.execute({
          sql: "UPDATE data_requests SET status = 'processing' WHERE id = ? AND status = 'pending'",
          args: [r.id],
        });
        if (res.rowsAffected > 0) claimedReqs.push(r);
      } catch {}
    }
  }

  const hasUrgent = claimed.some((r) => r.action === 'grant_premium' || r.action === 'redeem_promo_web');
  const urgentHint = hasUrgent ? 1000 : (await hasRecentActivity(5000) ? 1000 : undefined);

  return json({
    nextPollMs: urgentHint,
    commands: claimed.map((r) => ({
      id: Number(r.id),
      action: r.action,
      payload: safeParse(r.payload, {}),
      actorId: r.actor_id,
    })),
    dataRequests: claimedReqs.map((r) => ({
      id: Number(r.id),
      discordId: r.discord_id,
    })),
  });
}

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
