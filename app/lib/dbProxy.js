// ==========================================
// app/lib/dbProxy.js
// Adapter DB web -> BOT VPS lewat HTTPS.
// ==========================================
// LATAR: DB PostgreSQL pindah ke VPS (Jakarta) supaya cepat & gratis. Tapi
// Vercel punya IP keluar DINAMIS -> tidak bisa allowlist IP -> port DB tidak
// boleh dibuka ke publik. Solusi: web TIDAK konek DB langsung; semua query
// diteruskan ke BOT (yang punya DB lokal 127.0.0.1) lewat endpoint HTTPS
// /db/query. Bot eksekusi + balas hasil.
//
// Antarmuka SAMA dengan pgAdapter (execute/executeMultiple) supaya 361
// panggilan db.execute() di 59 file TIDAK perlu diubah.
//
// ENV (Vercel):
//   BOT_API_URL   = https://api.nexogames.site   (endpoint bot, Nginx+SSL)
//   BOT_API_KEY   = sama dengan .env bot
// Kalau BOT_API_URL kosong -> proxy TIDAK aktif (fallback ke Postgres langsung,
// mis. saat dev lokal pakai DATABASE_URL).
import { schemaReady as rawSchemaReady } from './db.js';

const URL_BASE = (process.env.BOT_API_URL || '').replace(/\/+$/, '');
const KEY = process.env.BOT_API_KEY || '';
// Timeout per request ke bot. 20 dtk terlalu lama kalau bot bermasalah ->
// halaman menggantung. 8 dtk cukup (proxy bot lokal ~300ms dari Vercel).
const TIMEOUT_MS = parseInt(process.env.BOT_API_TIMEOUT_MS || '8000', 10);

function _aktif() {
  return Boolean(URL_BASE && KEY);
}

async function _panggil(path, method, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return await res.json().catch(() => ({ ok: false, error: 'json invalid' }));
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : (e?.message || 'network error') };
  } finally {
    clearTimeout(t);
  }
}

// Retry utk blip jaringan (sama semangat dengan db.js). PENTING: error yang
// BUKAN jaringan (mis. 403 DDL-dilarang, error SQL) TIDAK diulang - kalau
// diulang, setiap request gagal jadi lambat (retry x timeout = puluhan detik).
async function _panggilRetry(path, method, body, coba = 2) {
  let last = null;
  for (let i = 0; i < coba; i++) {
    const r = await _panggil(path, method, body);
    if (r && r.ok) return r;
    last = r;
    // Hanya ulangi kalau JARINGAN (network/timeout). Error dari bot
    // (mis. 'query dilarang', 'column tidak ada') -> langsung kembalikan.
    const errStr = String((r && r.error) || '');
    const jaringan = /timeout|network error|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|EAI_AGAIN/i.test(errStr);
    if (!jaringan) return r;
    if (i < coba - 1) await new Promise((res) => setTimeout(res, 200 * (i + 1)));
  }
  return last || { ok: false, error: 'gagal' };
}

// Ubah hasil bot -> bentuk yang diharapkan kode web (rows/rowsAffected/lastInsertRowid).
function _bentuk(r) {
  if (!r || !r.ok) throw new Error((r && r.error) || 'db proxy gagal');
  if (Array.isArray(r.rows)) return { rows: r.rows, rowsAffected: r.rows.length, lastInsertRowid: undefined };
  return { rows: [], rowsAffected: r.changes || 0, lastInsertRowid: r.lastInsertRowid };
}

export function createDbProxyClient() {
  return {
    async execute(stmt, args2) {
      const sql = typeof stmt === 'string' ? stmt : stmt.sql;
      const args = typeof stmt === 'string' ? (args2 || []) : (stmt.args || []);
      const r = await _panggilRetry('/db/query', 'POST', { sql, args });
      return _bentuk(r);
    },
    // Web memakai executeMultiple untuk DDL skema. Lewat proxy kita TOLAK
    // (bot melarang DDL). Skema sudah ada di DB, jadi ini no-op aman.
    async executeMultiple() {
      return { rows: [], rowsAffected: 0 };
    },
  };
}

export const PROXY_AKTIF = _aktif();
export { rawSchemaReady };
