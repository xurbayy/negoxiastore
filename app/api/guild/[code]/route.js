import { getLiveGuildDetail } from '../../../lib/snapshot';
import { json } from '../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// GET /api/guild/[code] - detail guild untuk modal & kartu share
// ==========================================
// Permintaan pemilik 2026-10-07: nama guild di leaderboard bisa DIKLIK ->
// muncul detail (owner, admin, member + poin masing-masing) supaya transparan
// "kok total poinnya segini". Data dibaca LANGSUNG dari DB bot (bukan snapshot
// push) - sama seperti getLiveLeaderboard/getLiveGuildBoard.
//
// PUBLIK (tanpa login): halaman leaderboard & data guild memang publik di bot
// (`nxguild` bisa dilihat siapa saja). Yang butuh login hanya tombol SHARE
// (dicek di sisi klien, pola sama dengan ShareCardButton pemain).
export async function GET(request, ctx) {
  const { code } = await ctx.params; // Next.js 16: params WAJIB di-await
  try {
    const guild = await getLiveGuildDetail(code);
    if (!guild) return json({ ok: false, error: 'Guild tidak ditemukan.' }, 404);
    return json({ ok: true, guild });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e) }, 500);
  }
}
