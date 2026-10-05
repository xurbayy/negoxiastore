// ==========================================
// app/lib/vpsBridge.js
// Jembatan web -> VPS: AGENT dulu, BOT sebagai fallback.
// ==========================================
// KENAPA (insiden bot beku 2026-10-05): dulu semua perintah terminal web
// dikirim ke BOT (/vps/*). Kalau bot beku/mati, perintah tidak pernah sampai
// (HTTP nyangkut) - restart mustahil, uptime tidak reset.
//
// Sekarang VPS menjalankan service AGENT mandiri (nexo-agent.service, port
// 3002, nginx proxy /agent/). Agent hidup di cgroup sendiri - tetap responsif
// walau bot beku - dan bisa membunuh + menghidupkan bot kapan pun.
//
// Urutan: coba AGENT (timeout 10 dtk) -> kalau gagal, coba BOT (timeout 10 dtk).
// Respons agent menyertakan `sumber: 'agent'` + `bot.responsif` supaya UI tahu
// apakah data dari agent (bot mungkin beku) atau dari bot langsung.
const URL_BASE = (process.env.BOT_API_URL || '').replace(/\/+$/, '');
const KEY = process.env.BOT_API_KEY || '';

export function vpsTersedia() {
  return Boolean(URL_BASE && KEY);
}

async function _panggil(base, path, method, body, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const d = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    return d;
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (e?.message || 'network error') };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Panggil endpoint VPS. Agent dulu (selalu hidup), fallback ke bot.
 * @param {string} path  '/vps/status' | '/vps/kontrol' | '/vps/terminal' | '/vps/terminal/riwayat' | '/vps/log'
 * @param {'GET'|'POST'} method
 * @param {object} [body]
 */
export async function panggilVps(path, method = 'GET', body = null) {
  if (!vpsTersedia()) {
    return { ok: false, error: 'BOT_API_URL belum diset di lingkungan ini.' };
  }
  // 1) AGENT (mandiri - tetap hidup walau bot mati/beku).
  const viaAgent = await _panggil(`${URL_BASE}/agent`, path, method, body, 12000);
  if (viaAgent && viaAgent.ok) return { ...viaAgent, lewat: 'agent' };

  // 2) BOT (fallback - dipakai kalau agent belum terpasang/di-reload).
  const viaBot = await _panggil(URL_BASE, path, method, body, 12000);
  if (viaBot && viaBot.ok) return { ...viaBot, lewat: 'bot' };

  // Keduanya gagal: kembalikan error yang paling informatif (prioritas agent).
  const errAgent = viaAgent?.error || 'agent tidak merespons';
  const errBot = viaBot?.error || 'bot tidak merespons';
  return { ok: false, error: `Agent: ${errAgent} | Bot: ${errBot}`, lewat: null };
}
