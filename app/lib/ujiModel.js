// ==========================================
// app/lib/ujiModel.js -> Uji nyata apakah model bisa dipakai
// ==========================================
//
// Permintaan pemilik 2026-10-02: "sebelum list semua model, cek/test dulu bisa
// apa engga. Yang ga bisa ga usah ditampilkan - jadi daftar itu beneran model
// yang bisa gw pakai."
//
// Cara: untuk tiap model, kirim 1 request CHAT sangat kecil (max_tokens 1-5,
// pesan "hi"). Kalau provider balas 200 -> OK. Kalau error -> tandai gagal
// beserta alasannya (subscription, model hilang, agentic-only, dsb).
//
// Hasil di-CACHE di tabel ai_model_uji (kunci = provider+model) selama 24 jam
// supaya tidak menguji ulang tiap kali. Kurangi beban kuota.
//
// PENTING: kuota bisa terpakai sedikit. Karena itu HANYA dijalankan saat
// pemilik menekan tombol "Uji semua" - tidak otomatis.

import { providerInfo } from './groq';
import { getDb, schemaReady } from './db';

const CACHE_MS = 24 * 60 * 60 * 1000; // 24 jam
const MAKS_UJI = 120; // batas per batch (hasil di-cache, jadi batch berikut cepat)

/** Baca cache uji. */
async function bacaCache(provider, model) {
  try {
    await schemaReady();
    const db = getDb();
    const r = await db.execute({
      sql: 'SELECT ok, alasan, diuji_at FROM ai_model_uji WHERE provider = ? AND model = ? LIMIT 1',
      args: [provider, model],
    });
    const row = r.rows?.[0];
    if (!row) return null;
    if (Date.now() - Number(row.diuji_at) > CACHE_MS) return null; // kadaluarsa
    return { ok: Number(row.ok) === 1, alasan: row.alasan || '', diujiAt: Number(row.diuji_at) };
  } catch { return null; }
}

/** Tulis cache uji. */
async function tulisCache(provider, model, ok, alasan) {
  try {
    await schemaReady();
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO ai_model_uji (provider, model, ok, alasan, diuji_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(provider, model) DO UPDATE SET ok = excluded.ok, alasan = excluded.alasan, diuji_at = excluded.diuji_at`,
      args: [provider, model, ok ? 1 : 0, String(alasan || '').slice(0, 300), Date.now()],
    });
  } catch { /* cache gagal - tidak fatal */ }
}

/** Uji satu model dengan request chat sangat kecil. */
async function ujiSatu(info, model) {
  const kunci = info.kunci?.[0];
  if (!kunci) return { ok: false, alasan: 'provider tanpa kunci' };
  try {
    const res = await fetch(info.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kunci}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) return { ok: true, alasan: '' };
    let pesan = '';
    try { const j = await res.json(); pesan = j?.error?.message || j?.message || ''; } catch { /* bukan JSON */ }
    if (/agentic harness/i.test(pesan)) return { ok: false, alasan: 'hanya untuk coding agent' };
    if (/subscription/i.test(pesan)) return { ok: false, alasan: 'butuh langganan' };
    if (/not found|does not exist|no model/i.test(pesan)) return { ok: false, alasan: 'model tidak ada' };
    if (res.status === 429) return { ok: false, alasan: 'rate limit' };
    return { ok: false, alasan: `HTTP ${res.status}${pesan ? ': ' + pesan.slice(0, 100) : ''}` };
  } catch (e) {
    return { ok: false, alasan: e?.name === 'TimeoutError' ? 'timeout' : (e?.message || String(e)).slice(0, 100) };
  }
}

/**
 * Uji sekumpulan model provider (batch). Pakai cache bila masih segar.
 * @returns {Promise<{ok:boolean, hasil:Array<{model,ok,alasan,cached}>, error?:string}>}
 */
export async function ujiModelProvider(namaProvider, daftarModel) {
  const info = await providerInfo(namaProvider);
  if (!info) return { ok: false, error: `Provider "${namaProvider}" tidak ditemukan.`, hasil: [] };
  if (!info.kunci?.length) return { ok: false, error: `Kunci ${info.label} belum diisi.`, hasil: [] };
  if (!info.url) return { ok: false, error: `URL ${info.label} belum diisi.`, hasil: [] };

  const model = (Array.isArray(daftarModel) ? daftarModel : []).slice(0, MAKS_UJI);
  const hasil = [];
  for (const m of model) {
    const cached = await bacaCache(namaProvider, m);
    if (cached) { hasil.push({ model: m, ok: cached.ok, alasan: cached.alasan, cached: true }); continue; }
    const r = await ujiSatu(info, m);
    await tulisCache(namaProvider, m, r.ok, r.alasan);
    hasil.push({ model: m, ok: r.ok, alasan: r.alasan, cached: false });
  }
  return { ok: true, hasil };
}
