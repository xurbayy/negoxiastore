// ==========================================
// PENCATAT PEMAKAIAN AI (permintaan pemilik 2026-10-04)
// ==========================================
// "gw mau ada usage seperti [Total Requests, Input/Cached/Output Tokens,
//  Est. Cost, Recent Requests] ... real ga halu berdasarkan data".
//
// PRINSIP KEJUJURAN DATA:
//   - Angka HANYA diambil dari field `usage` yang DIKIRIM PROVIDER di response
//     API-nya. Tidak ada estimasi karakter -> token.
//   - Kalau provider tidak menyertakan usage (beberapa model gratis), baris
//     tetap dicatat untuk hitungan REQUEST, tokennya 0 - dan panel menandai
//     "tanpa data token" supaya tidak menyesatkan.
//   - Cached tokens dibaca dari beberapa format resmi provider:
//       OpenAI/OpenRouter : prompt_tokens_details.cached_tokens
//       DeepSeek          : prompt_cache_hit_tokens
//       Anthropic         : cache_read_input_tokens
//
// DUA LAPIS PENYIMPANAN:
//   ai_usage        : log mentah per permintaan (grafik 24 jam + daftar
//                     recent). Di-prune otomatis setelah 7 hari.
//   ai_usage_harian : rollup per hari+provider+model, TIDAK pernah dihapus ->
//                     Total Requests/Tokens seumur hidup tetap utuh.
//
// Semua fungsi di file ini TIDAK PERNAH melempar error ke pemanggil -
// pencatatan usage tidak boleh menjatuhkan permintaan AI.
import { getDb, schemaReady } from './db';

// Normalisasi objek usage dari berbagai bentuk provider -> field seragam.
// Mengembalikan null kalau provider memang tidak mengirim usage.
export function normalisasiUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  // Cached: coba semua format yang dikenal, mana yang ada.
  const cached =
    Number(usage.prompt_tokens_details?.cached_tokens) ||
    Number(usage.prompt_cache_hit_tokens) ||
    Number(usage.cache_read_input_tokens) ||
    Number(usage.cached_tokens) ||
    0;
  const total = Number(usage.total_tokens) || (prompt + completion);
  if (!prompt && !completion && !total && !cached) return null;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    cachedTokens: cached,
    totalTokens: total,
  };
}

// Catat SATU permintaan AI. Fire-and-forget: panggil TANPA await dari jalur
// permintaan (atau await dengan .catch sudah ditangani di dalam).
//   { provider, model, usage, ok, durasiMs }
export async function catatUsage({ provider, model, usage, ok = true, durasiMs = null }) {
  try {
    await schemaReady();
    const db = getDb();
    const now = Date.now();
    const u = normalisasiUsage(usage);
    const prompt = u?.promptTokens || 0;
    const completion = u?.completionTokens || 0;
    const cached = u?.cachedTokens || 0;
    const total = u?.totalTokens || 0;

    // 1) Log mentah (grafik + recent). Kalau DB sedang sibuk, kegagalan di
    //    sini tidak fatal - dicatat best-effort.
    await db.execute({
      sql: `INSERT INTO ai_usage (ts, provider, model, prompt_tokens, cached_tokens, completion_tokens, total_tokens, ok, durasi_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [now, String(provider || ''), String(model || ''), prompt, cached, completion, total, ok ? 1 : 0, durasiMs == null ? null : Math.round(durasiMs)],
    });

    // 2) Rollup harian (akumulasi seumur hidup). Tanggal WIB supaya "hari"
    //    sesuai pandangan pemilik (server Vercel UTC).
    const day = tanggalWib(now);
    await db.execute({
      sql: `INSERT INTO ai_usage_harian (day, provider, model, requests, ok_requests, input_tokens, cached_tokens, output_tokens)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?)
            ON CONFLICT (day, provider, model) DO UPDATE SET
              requests      = ai_usage_harian.requests + 1,
              ok_requests   = ai_usage_harian.ok_requests + EXCLUDED.ok_requests,
              input_tokens  = ai_usage_harian.input_tokens + EXCLUDED.input_tokens,
              cached_tokens = ai_usage_harian.cached_tokens + EXCLUDED.cached_tokens,
              output_tokens = ai_usage_harian.output_tokens + EXCLUDED.output_tokens`,
      args: [day, String(provider || ''), String(model || ''), ok ? 1 : 0, prompt, cached, completion],
    });
  } catch {
    // Pencatatan usage TIDAK boleh mengganggu permintaan AI.
  }
}

// Tanggal format YYYY-MM-DD menurut WIB (UTC+7) - konsisten dengan panel.
function tanggalWib(ms) {
  const d = new Date(ms + 7 * 3600_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ==========================================
// ESTIMASI BIAYA (permintaan pemilik 2026-10-04)
// ==========================================
// "Est. Cost ~$5.35 / Estimated, not actual billing".
//
// JUJUR SOAL BATASAN: kita TIDAK punya tagihan asli provider - ini ESTIMASI
// dari jumlah token x tarif publik per model. Kebanyakan model yang dipakai
// NEXO (Groq / OpenRouter gratis) berbiaya $0. Model berbayar (mis. deepseek)
// dihitung dari tarif per 1 JUTA token. Angka ini perkiraan, bukan tagihan.
//
// Tarif USD per 1M token: { input, cached, output }. Default 0 (model gratis
// / tidak dikenal). Cocokkan nama model (substring, huruf kecil).
const TARIF_PER_JUTA_TOKEN = [
  // DeepSeek (dipakai pemilik - lihat contoh usage "deepseek-v4.1-flash").
  { pola: 'deepseek', input: 0.27, cached: 0.07, output: 1.10 },
  // Contoh model berbayar populer (kalau suatu saat dipakai).
  { pola: 'gpt-4o', input: 2.5, cached: 1.25, output: 10.0 },
  { pola: 'gpt-4.1', input: 2.0, cached: 0.5, output: 8.0 },
  { pola: 'claude', input: 3.0, cached: 0.3, output: 15.0 },
  { pola: 'gemini-pro', input: 1.25, cached: 0.31, output: 5.0 },
  // Groq & OpenRouter model gratis -> biaya 0 (tidak perlu daftar; default 0).
];

function cariTarif(model) {
  const m = String(model || '').toLowerCase();
  for (const t of TARIF_PER_JUTA_TOKEN) {
    if (m.includes(t.pola)) return t;
  }
  return { input: 0, cached: 0, output: 0 };
}

// Estimasi biaya USD untuk SATU permintaan (token -> dolar).
export function estimasiBiaya(model, promptTokens = 0, cachedTokens = 0, outputTokens = 0) {
  const t = cariTarif(model);
  const input = Math.max(0, promptTokens - cachedTokens); // non-cached
  const cached = Math.max(0, cachedTokens);
  const output = Math.max(0, outputTokens);
  return (input * t.input + cached * t.cached + output * t.output) / 1_000_000;
}

// Apakah model ini dikenal berbayar (untuk menandai estimasi di UI)?
export function modelBerbayar(model) {
  return cariTarif(model).input > 0 || cariTarif(model).output > 0;
}

// Bersihkan log mentah >7 hari. Rollup harian TIDAK disentuh.
export async function pruneUsageMentah(hariSimpan = 7) {
  try {
    const db = getDb();
    await db.execute({
      sql: 'DELETE FROM ai_usage WHERE ts < ?',
      args: [Date.now() - hariSimpan * 86_400_000],
    });
  } catch { /* best-effort */ }
}
