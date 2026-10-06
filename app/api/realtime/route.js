import { getSession } from '../../lib/session';
import { json } from '../../lib/api-helpers';

export const dynamic = 'force-dynamic';
// Long-poll menahan koneksi sampai ~20 dtk - naikkan batas fungsi Vercel.
export const maxDuration = 30;

// ==========================================
// /api/realtime  —  versi data + long-poll (LISTEN/NOTIFY via bot)
// ==========================================
// GET            -> versi data sekarang (instan, dari memori bot/agent)
// GET ?sejak=N   -> LONG-POLL: ditahan sampai versi > N atau timeout (~20 dtk)
//
// KENAPA: dashboard admin, komunitas, leaderboard, /me dulu polling buta
// tiap 20-30 dtk - data berubah tapi web baru tahu belakangan, dan kalau
// tidak ada perubahan tetap ada request terbuang. Sekarang trigger Postgres
// (pg_notify 'nexo_data') -> bot/agent menaikkan versi -> long-poll langsung
// balas -> web refresh SEKETIKA saat ada perubahan nyata.
//
// Jalur: web -> AGENT (mandiri, tetap hidup walau bot beku) -> bot -> versi.
// Auth: cukup session login (data yang disegarkan memang halaman publik/user).
const URL_BASE = (process.env.BOT_API_URL || '').replace(/\/+$/, '');
const KEY = process.env.BOT_API_KEY || '';

async function _panggil(base, path, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const d = await res.json().catch(() => null);
    return d && d.ok ? d : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export async function GET(request) {
  const session = await getSession();
  if (!session) return json({ ok: false, error: 'forbidden' }, 403);
  if (!URL_BASE) return json({ ok: false, error: 'BOT_API_URL belum diset' }, 503);

  const params = new URL(request.url).searchParams;
  const sejak = params.get('sejak');
  const isWatch = sejak !== null && sejak !== '';

  // Long-poll: agent dulu (mandiri). Timeout web 25 dtk, agent diminta
  // 21 dtk supaya fallback bot masih sempat sebelum web menyerah.
  if (isWatch) {
    const s = Number(sejak) || 0;
    const viaAgent = await _panggil(`${URL_BASE}/agent`, `/data/watch?sejak=${s}&timeout=21000`, 25000);
    if (viaAgent) return json(viaAgent);
    const viaBot = await _panggil(URL_BASE, `/data/watch?sejak=${s}&timeout=21000`, 25000);
    if (viaBot) return json(viaBot);
    // Keduanya diam -> balas versi terakhir yang diketahui supaya klien tidak
    // menggantung; klien akan mencoba lagi (fallback poll tetap jalan).
    return json({ ok: false, error: 'tidak ada respons dari bot/agent', versi: s, berubah: false, timeout: true });
  }

  // Versi instan: agent dulu (tanpa bot), fallback bot.
  const viaAgent = await _panggil(`${URL_BASE}/agent`, '/data/versi', 8000);
  if (viaAgent) return json(viaAgent);
  const viaBot = await _panggil(URL_BASE, '/data/versi', 8000);
  if (viaBot) return json(viaBot);
  return json({ ok: false, error: 'tidak ada respons dari bot/agent' }, 200);
}
