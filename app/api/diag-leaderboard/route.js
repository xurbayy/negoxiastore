import { json } from '../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// Diagnostik leaderboard: uji fungsi live langsung + tampilkan error asli.
export async function GET() {
  const out = { langkah: [] };
  try {
    const mod = await import('../../lib/snapshot');
    out.langkah.push('import snapshot OK');
    out.ada_getLiveLeaderboard = typeof mod.getLiveLeaderboard === 'function';
    out.ada_getLiveGuildBoard = typeof mod.getLiveGuildBoard === 'function';
    out.ada_getLiveStats = typeof mod.getLiveStats === 'function';

    if (typeof mod.getLiveLeaderboard === 'function') {
      const t0 = Date.now();
      const players = await mod.getLiveLeaderboard(10);
      out.ms = Date.now() - t0;
      out.jumlah_pemain = Array.isArray(players) ? players.length : -1;
      out.contoh = Array.isArray(players) ? players.slice(0, 3).map((p) => p.username) : null;
      out.langkah.push('getLiveLeaderboard OK');
    }

    if (typeof mod.getLiveGuildBoard === 'function') {
      const guilds = await mod.getLiveGuildBoard(10);
      out.jumlah_guild = Array.isArray(guilds) ? guilds.length : -1;
      out.langkah.push('getLiveGuildBoard OK');
    }

    if (typeof mod.getLiveStats === 'function') {
      const st = await mod.getLiveStats();
      out.live_stats = st;
      out.langkah.push('getLiveStats OK');
    }

    out.safe_error_terakhir = mod._lastSafeError;
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e?.message || e);
    out.stack = String(e?.stack || '').split('\n').slice(0, 4);
  }
  return json(out, out.ok ? 200 : 500);
}
