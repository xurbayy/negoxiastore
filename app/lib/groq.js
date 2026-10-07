// ==========================================
// app/lib/groq.js -> AI Klien (multi-provider)
// ==========================================
//
// Mendukung TIGA provider AI:
//   1. Groq (default)      - https://api.groq.com/openai/v1
//   2. OpenRouter           - https://openrouter.ai/api/v1
//   3. Endpoint custom      - lewat env AI_BASE_URL
//
// Provider bisa dipilih dari panel admin (toggle) atau env variable.
// Kunci disimpan di env: OPENROUTER_API_KEY / GROQ_API_KEY / AI_API_KEY.
//
// KEAMANAN:
//   - Kunci HANYA dibaca di server (file ini tidak pernah diimpor komponen
//     klien). Jangan pernah menaruhnya di variabel NEXT_PUBLIC_*.
//   - Kunci TIDAK PERNAH dikembalikan ke pemanggil, apalagi ke browser.
//   - Pesan error disaring supaya kunci tidak bocor.

// Import STATIS (bukan dynamic) - dynamic import './db' pernah gagal senyap
// di runtime serverless sehingga provider kustom tak terbaca (fix 2026-10-02).
// File ini hanya diimpor route server, jadi aman.
import { getDb, schemaReady } from './db';
import { dekripsiKunci } from './aiCrypto';
import { catatUsage } from './aiUsage';

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    envModel: 'GROQ_MODEL',
    defaultModel: 'openai/gpt-oss-120b',
    label: 'Groq',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    envModel: 'OPENROUTER_MODEL',
    defaultModel: 'qwen/qwen3.8-27b:free',
    label: 'OpenRouter',
  },
  custom: {
    url: '', // dari AI_BASE_URL
    envKey: 'AI_API_KEY',
    envModel: 'AI_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    label: 'Custom',
  },
};

function resolveProvider(nama) {
  // 1) Provider pilihan UI (paling prioritas). Boleh provider bawaan ATAU
  //    slug provider kustom (tidak ada di PROVIDERS - ditangani pemanggil).
  if (nama && String(nama).trim()) return String(nama).trim();
  // 2) AI_PROVIDER env - TAPI hanya kalau nilainya masuk akal (bawaan atau
  //    tidak kosong). Nilai ngawur (mis. spasi) jangan sampai bikin mentok.
  const envProv = String(process.env.AI_PROVIDER || '').trim();
  if (envProv) return envProv;
  // 3) Custom HANYA kalau AI_BASE_URL benar-benar diisi.
  if (process.env.AI_BASE_URL && String(process.env.AI_BASE_URL).trim()) return 'custom';
  // 4) Default: groq (atau openrouter kalau GROQ_API_KEY kosong tapi
  //    OPENROUTER_API_KEY ada).
  if (!process.env.GROQ_API_KEY && process.env.OPENROUTER_API_KEY) return 'openrouter';
  return 'groq';
}

/**
 * Ambil definisi provider. Provider BAWAAN dari PROVIDERS; provider KUSTOM
 * (slug tidak dikenal) diambil dari tabel ai_providers (key didekripsi).
 * @param {string} namaProvider
 * @returns {Promise<{url:string, envKey:string, label:string, kunci:string[], model:string, kustom?:boolean}|null>}
 */
export async function providerInfo(namaProvider) {
  const nama = resolveProvider(namaProvider);
  const bawaan = PROVIDERS[nama];
  if (bawaan) {
    return {
      slug: nama,
      url: baseUrl(nama),
      envKey: bawaan.envKey,
      label: bawaan.label,
      kunci: daftarKunci(nama),
      model: modelDipakai(nama),
    };
  }
  // Provider kustom dari DB.
  try {
    await schemaReady();
    const db = getDb();
    const res = await db.execute({
      sql: 'SELECT nama, slug, base_url, api_key_enc, env_key FROM ai_providers WHERE slug = ? LIMIT 1',
      args: [nama],
    });
    const row = res.rows?.[0];
    if (!row) return null;
    // URL disimpan TANPA /chat/completions - tambahkan di sini (sama seperti
    // provider bawaan yang menyimpan URL penuh).
    const base = String(row.base_url || '').replace(/\/+$/, '');
    const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
    const kunci = [];
    const dek = dekripsiKunci(row.api_key_enc);
    if (dek) kunci.push(...String(dek).split(',').map((k) => k.trim()).filter(Boolean));
    return {
      slug: row.slug,
      url,
      envKey: row.env_key || 'API_KEY',
      label: row.nama,
      kunci,
      model: '',
      kustom: true,
    };
  } catch {
    return null;
  }
}

function baseUrl(namaProvider) {
  const p = PROVIDERS[namaProvider];
  if (namaProvider === 'custom') {
    const custom = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
    return custom ? `${custom}/chat/completions` : '';
  }
  return p?.url || '';
}

function daftarKunci(namaProvider) {
  const p = PROVIDERS[namaProvider];
  if (!p) return [];
  const env = process.env[p.envKey] || '';
  return env.split(',').map((k) => k.trim()).filter(Boolean);
}

function modelDipakai(namaProvider, override) {
  if (override && override.trim()) return override.trim();
  const p = PROVIDERS[namaProvider];
  return process.env[p.envModel] || p.defaultModel;
}

/**
 * Versi lengkap: provider bawaan + provider kustom dari DB + model tersimpan.
 * Dipakai panel admin (async karena membaca DB).
 */
export async function infoProviderLengkap(providerTerpilih) {
  let _errorDb = null;
  const aktif = resolveProvider(providerTerpilih || process.env.AI_PROVIDER);
  const bawaan = Object.keys(PROVIDERS).filter(
    (k) => k !== 'custom' || Boolean(process.env.AI_BASE_URL)
  );
  const tersedia = bawaan.map((k) => ({
    id: k,
    label: PROVIDERS[k].label,
    model: modelDipakai(k),
    kunci: daftarKunci(k).length,
    kustom: false,
  }));

  let modelTersimpan = [];
  try {
    await schemaReady();
    const db = getDb();
    const [prov, mod] = await Promise.all([
      db.execute('SELECT slug, nama, base_url, env_key, api_key_enc FROM ai_providers ORDER BY nama ASC'),
      db.execute('SELECT id, label, model, provider, max_tokens, kecerdasan FROM ai_models ORDER BY label ASC'),
    ]);
    for (const r of (prov.rows || [])) {
      tersedia.push({
        id: r.slug,
        label: r.nama,
        model: '',
        kunci: r.api_key_enc ? 1 : 0,
        kustom: true,
      });
    }
    modelTersimpan = (mod.rows || []).map((r) => ({
      id: Number(r.id),
      label: r.label,
      model: r.model,
      provider: r.provider,
      maxTokens: r.max_tokens == null ? null : Number(r.max_tokens),
      kecerdasan: r.kecerdasan == null ? null : Number(r.kecerdasan),
    }));
  } catch (e) {
    // JANGAN telan senyap - ini yang bikin "provider tidak terbaca" tanpa jejak.
    console.error('[AI] Gagal baca provider kustom dari DB:', e?.message || e);
    _errorDb = e?.message || String(e);
  }

  // Info provider aktif (bisa kustom).
  const aktifInfo = await providerInfo(aktif);
  // "siap" = ADA provider mana pun yang punya kunci (bawaan atau kustom).
  // PENTING: dulu `aktif` hanya cek provider default (AI_PROVIDER). Kalau
  // default-nya Groq tanpa kunci tapi pemilik pakai provider kustom, panel
  // salah bilang "belum aktif". Sekarang dicek menyeluruh.
  const adaKunciBawaan = ['groq', 'openrouter'].some((k) => daftarKunci(k).length > 0);
  const adaKunciKustom = tersedia.some((t) => t.kustom && t.kunci > 0);
  return {
    aktif,
    label: aktifInfo?.label || aktif,
    model: modelDipakai(aktif),
    kunci: (aktifInfo?.kunci || []).length,
    siap: (aktifInfo?.kunci || []).length > 0 || adaKunciBawaan || adaKunciKustom,
    tersedia,
    models: modelTersimpan,
    errorDb: _errorDb,
  };
}

/**
 * Cek apakah sebuah MODEL benar-benar ada di provider (permintaan pemilik
 * 2026-10-02: "kasih validasi kalo model itu gada di providernya").
 *
 * Cara: panggil endpoint /models milik provider (OpenAI-compatible) lalu cari
 * id model yang cocok. Provider yang tidak punya endpoint /models (atau
 * menolak) tidak bisa divalidasi - dikembalikan { ok: false, tidakDidukung }.
 *
 * @returns {Promise<{ok:boolean, ada?:boolean, tersedia?:string[], label?:string, error?:string, tidakDidukung?:boolean}>}
 */
/**
 * Tes koneksi mentah (nama/URL/key belum tentu tersimpan). Dipakai tombol
 * "Tes koneksi" di form tambah provider - supaya URL base & API key bisa
 * divalidasi SEBELUM disimpan.
 * @returns {Promise<{ok:boolean, pesan:string, urlDicek?:string, jumlah?:number, contoh?:string[]}>}
 */
export async function tesKoneksi({ baseUrl, apiKey }) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return { ok: false, pesan: 'URL base kosong.' };
  if (!/^https?:\/\//i.test(base)) {
    return { ok: false, pesan: 'URL base harus dimulai dengan http:// atau https://' };
  }
  const kunci = String(apiKey || '').trim();
  if (!kunci) return { ok: false, pesan: 'API key kosong.' };

  const urlModels = base.replace(/\/chat\/completions\/?$/, '') + '/models';
  try {
    const res = await fetch(urlModels, {
      headers: { Authorization: `Bearer ${kunci}` },
      signal: AbortSignal.timeout(20000),
    });
    let pesanApi = '';
    if (!res.ok) {
      try { const j = await res.json().catch(() => ({})); pesanApi = j?.error?.message || j?.message || ''; } catch { /* bukan JSON */ }
    }
    if (res.status === 404) {
      return { ok: false, urlDicek: urlModels, pesan: `URL base sepertinya salah - endpoint ${urlModels} tidak ditemukan (404). Untuk OpenAI-compatible biasanya berakhir dengan /v1.` };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, urlDicek: urlModels, pesan: `API key ditolak (HTTP ${res.status})${pesanApi ? ': ' + pesanApi : ''}.` };
    }
    if (!res.ok) {
      return { ok: false, urlDicek: urlModels, pesan: `Server membalas HTTP ${res.status}${pesanApi ? ': ' + pesanApi : ''}. Cek URL base & key.` };
    }
    const data = await res.json().catch(() => null);
    const list = data?.data || data?.models || [];
    if (!Array.isArray(list) || list.length === 0) {
      return { ok: false, urlDicek: urlModels, pesan: `Koneksi berhasil tapi tidak ada daftar model. URL base mungkin kurang tepat (${urlModels}).` };
    }
    const contoh = list.slice(0, 5).map((m) => String(m?.id || m?.name || '')).filter(Boolean);
    return { ok: true, urlDicek: urlModels, jumlah: list.length, contoh, pesan: `Terhubung. ${list.length} model tersedia.` };
  } catch (e) {
    const pesan = e?.name === 'TimeoutError'
      ? `Tidak merespons dalam 20 detik. URL base kemungkinan salah: ${urlModels}`
      : `Tidak bisa terhubung ke ${urlModels} - kemungkinan URL base salah atau server mati. (${e?.message || e})`;
    return { ok: false, urlDicek: urlModels, pesan };
  }
}

/**
 * Ambil daftar ALL model dari provider + tandai mana yang GRATIS.
 * Permintaan pemilik (2026-10-02): "bakal muncul semua nama modelnya yang free
 * saja".
 *
 * Cara deteksi gratis (heuristik, karena tiap provider beda format):
 *   1. Nama berakhiran ':free' (OpenRouter) -> gratis.
 *   2. pricing.prompt === '0' atau 0 (OpenRouter & beberapa provider).
 *   3. Field id/nama mengandung kata 'free'.
 *   4. Provider tanpa info harga -> semua dianggap TIDAK diketahui (gratis: null).
 *
 * @returns {Promise<{ok:boolean, gratis:Array, semua:Array, label?:string, error?:string, urlDicek?:string}>}
 */
/**
 * Ambil daftar mentah model dari provider (endpoint /models).
 * Dipakai bersama oleh daftarModelProvider() dan cekModelAda() - supaya logika
 * error (404/401/timeout) TIDAK ditulis dua kali (anti tumpang-tindih).
 * @returns {Promise<{ok:boolean, list?:any[], data?:any, urlModels:string, label:string, error?:string, tidakDidukung?:boolean}>}
 */
async function ambilDaftarModel(info) {
  const urlModels = info.url.replace(/\/chat\/completions\/?$/, '/models');
  try {
    const res = await fetch(urlModels, {
      headers: { Authorization: `Bearer ${info.kunci[0]}` },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404) {
      return { ok: false, urlModels, label: info.label, tidakDidukung: true, error: `URL base sepertinya salah. Endpoint ${urlModels} tidak ditemukan (404). Pastikan URL base benar, contoh: https://api.openrouter.ai/api/v1` };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, urlModels, label: info.label, error: `API key ditolak (HTTP ${res.status}). Periksa kunci provider ${info.label}.` };
    }
    if (!res.ok) {
      return { ok: false, urlModels, label: info.label, error: `Gagal mengambil daftar model (HTTP ${res.status}). Cek URL base & kunci.` };
    }
    const data = await res.json().catch(() => null);
    const list = data?.data || data?.models || [];
    if (!Array.isArray(list) || list.length === 0) {
      return { ok: false, urlModels, label: info.label, tidakDidukung: true, error: `Provider ${info.label} membalas tapi tidak mengembalikan daftar model. URL base mungkin kurang tepat (${urlModels}).` };
    }
    return { ok: true, list, data, urlModels, label: info.label };
  } catch (e) {
    const pesan = e?.name === 'TimeoutError'
      ? `Tidak merespons dalam 20 detik. URL: ${urlModels}`
      : `Tidak bisa terhubung ke ${urlModels} - kemungkinan URL base salah. (${e?.message || e})`;
    return { ok: false, urlModels, label: info.label, error: pesan };
  }
}

export async function daftarModelProvider(namaProvider) {
  const nama = resolveProvider(namaProvider);
  const info = await providerInfo(nama);
  if (!info) return { ok: false, error: `Provider "${nama}" tidak ditemukan.` };
  if (!info.kunci.length) return { ok: false, error: `Kunci ${info.label} belum diisi.` };
  if (!info.url) return { ok: false, error: `URL ${info.label} belum diisi.` };

  const ambil = await ambilDaftarModel(info);
  if (!ambil.ok) return { ok: false, urlDicek: ambil.urlModels, label: info.label, error: ambil.error, tidakDidukung: ambil.tidakDidukung };
  const list = ambil.list;
  const urlModels = ambil.urlModels;
  const normal = list.map((m) => {
      const id = String(m?.id || m?.name || '');
      if (!id) return null;

      // ==========================================
      // DETEKSI GRATIS - HANYA PERCAYA DATA HARGA RESMI
      // ==========================================
      // PENTING (fix 2026-10-02): nama model berakhiran "free" BUKAN jaminan
      // gratis. Contoh nyata: Apinex menamai model "free/deepseek-v4.1-flash"
      // tapi sebenarnya butuh LANGGANAN berbayar. Kalau kita percaya nama,
      // pemilik terkecoh dan request-nya gagal.
      //
      // Aturan baru:
      //   - Ada data harga (pricing) -> pakai itu (0 = gratis, >0 = berbayar).
      //   - Tidak ada data harga -> null (TIDAK DIKETAHUI). Jangan tebak dari
      //     nama. Nama ":free" hanya jadi PETUNJUK lemah kalau tidak ada harga
      //     sama sekali DAN id berakhiran ":free" persis (konvensi OpenRouter).
      let gratis = null;
      const hargaRaw = m?.pricing?.prompt ?? m?.pricing?.input ?? m?.price ?? m?.harga;
      let adaHarga = false;
      if (hargaRaw !== undefined && hargaRaw !== null && hargaRaw !== '') {
        const n = parseFloat(String(hargaRaw).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(n)) { gratis = n === 0; adaHarga = true; }
      }
      if (!adaHarga) {
        // Konvensi OpenRouter: id diakhiri ":free" -> gratis. Provider lain
        // (mis. Apinex) TIDAK memakai konvensi ini, jadi JANGAN percaya
        // kata "free" di tengah/awal nama.
        if (/:free$/i.test(id)) gratis = true;
      }

      // Deteksi kemampuan (permintaan pemilik 2026-10-02: "test model bisa
      // vision atau reasoning, biar gw bisa tentuin mana yang bisa liat").
      const arch = m?.architecture || {};
      const inputMod = Array.isArray(arch.input_modalities) ? arch.input_modalities : [];
      const modality = String(arch.modality || '');
      const params = Array.isArray(m?.supported_parameters) ? m.supported_parameters : [];
      // VISION: bisa terima gambar (input_modalities berisi 'image', atau
      // modality mengandung 'image').
      const vision = inputMod.includes('image') || /image/i.test(modality)
        || /\bvl\b|-vl|vision|llava|pixtral|gemini|gpt-4o|gpt-4\.1|claude-3|claude-4|qwen.*vl/i.test(id);
      // FILE: bisa terima dokumen.
      const file = inputMod.includes('file') || /file/i.test(modality);
      // REASONING: model punya parameter penalaran (reasoning/think).
      const reasoning = params.some((p) => /reason/i.test(String(p)))
        || /reasoning|\bthink|o1|o3|deepseek-r|qwq/i.test(id);
      return {
        id,
        nama: m?.name || id,
        gratis,           // true=gratis, false=berbayar, null=tidak diketahui
        adaHarga,
        konteks: m?.context_length || m?.context || null,
        vision,
        file,
        reasoning,
      };
    }).filter(Boolean);

    const gratis = normal.filter((m) => m.gratis === true);
    // Provider yang tidak mengirim data harga SAMA SEKALI -> tidak bisa
    // memastikan mana yang gratis. UI harus jujur soal ini.
    const bisaPastikan = normal.some((m) => m.adaHarga) || normal.some((m) => m.gratis === true);
    return { ok: true, gratis, semua: normal, label: info.label, urlDicek: urlModels, jumlah: normal.length, jumlahGratis: gratis.length, bisaPastikan };
}

/**
 * Ambil info PEMAKAIAN / kuota provider (permintaan pemilik 2026-10-02:
 * "gw mau ada usage setiap provider jadi tau ini udah limit apa engga").
 *
 * Cara per provider:
 *   - OpenRouter: GET /credits + GET /key -> kredit, penggunaan, limit harian
 *     model gratis (free_model_daily_requests), sisa.
 *   - Groq: kirim chat completion super-pendek lalu baca header
 *     x-ratelimit-* (limit & sisa token/request + waktu reset).
 *   - Kustom: coba /credits lalu /key (kalau provider OpenAI-compatible),
 *     fallback ke rate-limit dari header /models.
 *
 * @returns {Promise<{ok:boolean, jenis:string, label?:string, error?:string, ...}>}
 */
export async function cekUsageProvider(namaProvider) {
  const nama = resolveProvider(namaProvider);
  const info = await providerInfo(nama);
  if (!info) return { ok: false, error: `Provider "${nama}" tidak ditemukan.` };
  if (!info.kunci.length) return { ok: false, error: `Kunci ${info.label} belum diisi.` };
  const kunci = info.kunci[0];
  const base = info.url.replace(/\/chat\/completions\/?$/, '');
  const label = info.label;

  // ---- OpenRouter: endpoint /credits + /key ----
  try {
    const [resKredit, resKey] = await Promise.all([
      fetch(`${base}/credits`, { headers: { Authorization: `Bearer ${kunci}` }, signal: AbortSignal.timeout(15000) }),
      fetch(`${base}/key`, { headers: { Authorization: `Bearer ${kunci}` }, signal: AbortSignal.timeout(15000) }),
    ]);
    if (resKey.ok) {
      const dk = (await resKey.json().catch(() => null))?.data || {};
      let kredit = null;
      if (resKredit.ok) kredit = (await resKredit.json().catch(() => null))?.data || null;
      const free = dk.free_model_daily_requests || null;
      return {
        ok: true, jenis: 'openrouter', label,
        kredit: kredit ? {
          total: Number(kredit.total_credits ?? 0),
          terpakai: Number(kredit.total_usage ?? 0),
          sisa: Math.max(0, Number(kredit.total_credits ?? 0) - Number(kredit.total_usage ?? 0)),
        } : null,
        kunci: {
          limit: dk.limit ?? null,
          sisaLimit: dk.limit_remaining ?? null,
          terpakai: Number(dk.usage ?? 0),
          harian: Number(dk.usage_daily ?? 0),
          bulanan: Number(dk.usage_monthly ?? 0),
          freeTier: Boolean(dk.is_free_tier),
        },
        harianGratis: free ? { terpakai: Number(free.used ?? 0), limit: Number(free.limit ?? 0), sisa: Number(free.remaining ?? 0) } : null,
      };
    }
  } catch { /* bukan OpenRouter / gagal - lanjut ke cara Groq */ }

  // ---- Groq / umum: rate-limit dari header chat completion ----
  // Butuh MODEL yang valid. Untuk provider kustom `info.model` kosong, jadi
  // ambil model pertama dari /models dulu (fix: RouterWay balas HTTP 400
  // karena model default tidak dikenali providernya).
  let modelUji = info.model;
  if (!modelUji) {
    try {
      const resM = await fetch(base + '/models', {
        headers: { Authorization: `Bearer ${kunci}` },
        signal: AbortSignal.timeout(12000),
      });
      if (resM.ok) {
        const dM = await resM.json().catch(() => null);
        const list = dM?.data || dM?.models || [];
        if (Array.isArray(list) && list.length) {
          modelUji = String(list[0]?.id || list[0]?.name || '');
        }
      }
    } catch { /* lanjut tanpa model - biar pesan error provider yang jelas */ }
  }

  if (modelUji) {
    try {
      const res = await fetch(info.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kunci}` },
        body: JSON.stringify({ model: modelUji, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        signal: AbortSignal.timeout(15000),
      });
      const h = (n) => res.headers.get(n);
      const limReq = h('x-ratelimit-limit-requests');
      const sisaReq = h('x-ratelimit-remaining-requests');
      const limTok = h('x-ratelimit-limit-tokens');
      const sisaTok = h('x-ratelimit-remaining-tokens');
      const resetTok = h('x-ratelimit-reset-tokens');
      if (limReq || limTok) {
        return {
          ok: true, jenis: 'ratelimit', label,
          rate: {
            limitRequest: limReq ? Number(limReq) : null,
            sisaRequest: sisaReq ? Number(sisaReq) : null,
            limitToken: limTok ? Number(limTok) : null,
            sisaToken: sisaTok ? Number(sisaTok) : null,
            resetToken: resetTok || null,
            status: res.status,
          },
        };
      }
      // Tidak ada header rate-limit, tapi request berhasil -> provider hidup.
      if (res.ok) return { ok: true, jenis: 'hidup', label, catatan: 'Provider merespons, tapi tidak menyediakan info kuota.' };
      // Gagal: baca pesan provider supaya jelas.
      let pesanApi = '';
      try { const j = await res.json().catch(() => ({})); pesanApi = j?.error?.message || j?.message || ''; } catch { /* bukan JSON */ }
      const teksErr = pesanApi || `HTTP ${res.status}`;
      const catatan = res.status === 429
        ? 'Kuota habis / rate limit tercapai.'
        : res.status === 401 || res.status === 403
          ? 'API key ditolak provider.'
          : `Provider menolak permintaan uji (${teksErr}). Info kuota tidak tersedia.`;
      return { ok: true, jenis: 'ratelimit', label, catatan, rate: { status: res.status } };
    } catch (e) {
      const pesan = e?.name === 'TimeoutError' ? 'Timeout saat cek kuota.' : (e?.message || String(e));
      return { ok: false, error: pesan, label };
    }
  }

  // Tidak ada /models dan tidak tahu model uji apa -> jujur saja.
  return {
    ok: true, jenis: 'hidup', label,
    catatan: 'Provider ini tidak menyediakan info kuota (tidak ada endpoint /models atau model uji).',
  };
}

export async function cekModelAda(namaProvider, modelDicari) {
  const nama = resolveProvider(namaProvider);
  const info = await providerInfo(nama);
  if (!info) return { ok: false, error: `Provider "${nama}" tidak ditemukan.` };
  if (!info.kunci.length) return { ok: false, error: `Kunci ${info.label} belum diisi.` };
  if (!info.url) return { ok: false, error: `URL ${info.label} belum diisi.` };
  const dicari = String(modelDicari || '').trim();
  if (!dicari) return { ok: false, error: 'Nama model kosong.' };

  const ambil = await ambilDaftarModel(info);
  if (!ambil.ok) return { ok: false, urlDicek: ambil.urlModels, label: info.label, error: ambil.error, tidakDidukung: ambil.tidakDidukung };

  const ids = ambil.list.map((m) => String(m?.id || m?.name || '')).filter(Boolean);
  const ada = ids.includes(dicari);
  // Saran mirip (kalau tidak ada) - pakai potongan nama.
  let mirip = [];
  if (!ada) {
    const potong = dicari.split('/').pop()?.split(':')[0]?.toLowerCase() || '';
    if (potong.length >= 3) {
      mirip = ids.filter((x) => x.toLowerCase().includes(potong)).slice(0, 8);
    }
  }
  return { ok: true, ada, tersedia: ids.slice(0, 400), mirip, label: info.label, jumlah: ids.length, urlDicek: ambil.urlModels };
}

function maksToken() {
  const n = parseInt(process.env.AI_MAX_TOKENS || process.env.GROQ_MAX_TOKENS, 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

/**
 * Buang jejak penalaran (reasoning) dari jawaban model. Sebagian model
 * (mis. minimax-m2.7, deepseek-r) menulis <think>...</think> atau baris
 * "thinking" ke CONTENT - bukan ke field reasoning. Kalau ikut tampil,
 * jawaban jadi berisi coretan proses berpikir (kejadian nyata 2026-10-02).
 */
function bersihkanJawaban(teks) {
  if (!teks) return teks;
  let out = String(teks);
  // Blok <think ...>...</think> (termasuk varian <thinking>, <reasoning>).
  out = out.replace(/<think(?:ing)?[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '');
  out = out.replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, '');
  // Kalau tag pembuka/penutup tak berpasangan, buang tag-nya saja.
  out = out.replace(/<\/?(?:think(?:ing)?|reasoning)[^>]*>/gi, '');
  // Buang karakter asing yang bocor dari model (Mandarin, Jepang, Korea,
  // Cyrillic, Arab). Diganti tanda hubung supaya kalimat tetap terbaca.
  // (Kejadian nyata: minimax menulis "tidak-解决-根本" di jawaban analisis.)
  out = out.replace(/[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF\u0600-\u06FF\uAC00-\uD7AF\u1100-\u11FF]+/g, '-');
  out = out.replace(/\s*-\s*-\s*/g, ' - ');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function bersihkanPesan(teks, kunci) {
  let out = String(teks || '');
  for (const k of (kunci || [])) {
    if (k) out = out.split(k).join('[kunci-disembunyikan]');
  }
  return out
    .replace(/gsk_[A-Za-z0-9]{20,}/g, '[kunci-disembunyikan]')
    .replace(/sk-or-v1-[A-Za-z0-9\-]{20,}/g, '[kunci-disembunyikan]')
    .replace(/sk-[A-Za-z0-9\-]{20,}/g, '[kunci-disembunyikan]');
}

/**
 * Terjemahkan pesan error provider (Inggris) ke Indonesia. Kalau tidak ada
 * pola yang cocok, kembalikan teks asli apa adanya (tidak menebak).
 * Permintaan pemilik 2026-10-02: "semua validasi ini pake bahasa indonesia".
 */
function terjemahPesan(teks) {
  const t = String(teks || '').trim();
  if (!t) return '';
  const pola = [
    [/only available on agentic|agentic harness|productivity app|plugging it into a coding/i,
      'Model ini cuma bisa dipakai lewat aplikasi coding agent tertentu (Cursor, Cline, dsb), TIDAK bisa lewat API biasa. Pilih model lain.'],
    [/only available with a subscription|buy a subscription|requires? a subscription|subscription required/i,
      'Model ini hanya tersedia lewat LANGGANAN berbayar di provider ini. Berlangganan dulu, atau pakai model lain.'],
    [/invalid api key|incorrect api key|authentication failed|unauthorized/i,
      'API key ditolak oleh provider.'],
    [/not found|does not exist|unknown model|no such model|model.*not.*found|no model found/i,
      'Model tidak ditemukan di provider ini. Pastikan model memang milik provider yang dipilih (mis. model OpenRouter harus dengan provider OpenRouter).'],
    [/rate limit|too many requests|quota exceeded|insufficient quota/i,
      'Kuota / batas permintaan provider tercapai.'],
    [/insufficient (credit|balance|funds)|payment required|no credit/i,
      'Kredit / saldo provider tidak cukup.'],
    [/context length|too many tokens|maximum context/i,
      'Data terlalu panjang untuk model ini.'],
    [/service unavailable|server error|internal error|bad gateway|overloaded/i,
      'Server provider sedang bermasalah. Coba lagi sebentar.'],
  ];
  for (const [re, id] of pola) {
    if (re.test(t)) return id + ' [pesan provider: ' + t.slice(0, 160) + ']';
  }
  // Tidak dikenal -> kembalikan asli (ditandai supaya jelas ini dari provider).
  return (t.length > 200 ? t.slice(0, 200) + '...' : t);
}

// ==========================================
// THINKING LEVELS (permintaan pemilik 2026-10-04)
// ==========================================
// Menggantikan takaran "kecerdasan 1-10". Level Thinking dipetakan ke parameter
// yang DIKENAL provider:
//   - reasoning_effort      : 'minimal'|'low'|'medium'|'high' (OpenAI/OpenRouter/Groq)
//   - thinking.budget_tokens: anggaran token berpikir (Anthropic/Claude)
// Kalau provider tidak mendukung, tetap dipetakan ke temperature + instruksi
// kedalaman supaya perilaku tidak "hilang" (gagal aman).
//
// 'auto' = biarkan provider memutuskan (tidak mengirim parameter reasoning).
export const THINKING_LEVELS = ['auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'thinking'];

// (THINKING_LABEL dipindah ke formatClient.js supaya komponen klien bisa
// memakainya tanpa mengimpor file server ini.)

// Pemetaan level -> parameter provider + temperature cadangan.
export function petaThinking(level) {
  const l = String(level || 'auto').toLowerCase();
  switch (l) {
    case 'minimal':  return { effort: 'minimal', budget: 512,   suhu: 0.15, instruksi: 'Jawab SANGAT singkat dan langsung ke inti. Hindari penjelasan panjang.' };
    case 'low':      return { effort: 'low',     budget: 1024,  suhu: 0.25, instruksi: 'Jawab singkat dan padat. Fokus ke inti saja.' };
    case 'medium':   return { effort: 'medium',  budget: 4096,  suhu: 0.40, instruksi: 'Jawab dengan cukup detail namun tetap efisien.' };
    case 'high':     return { effort: 'high',    budget: 16384, suhu: 0.60, instruksi: 'Berpikir mendalam sebelum menjawab. Pertimbangkan beberapa sudut pandang.' };
    case 'xhigh':    return { effort: 'high',    budget: 32768, suhu: 0.70, instruksi: 'Berpikir SANGAT mendalam. Periksa ulang logika & angka sebelum menyimpulkan.' };
    case 'max':      return { effort: 'high',    budget: 65536, suhu: 0.80, instruksi: 'Gunakan kapasitas berpikir maksimal. Telusuri semua kemungkinan & verifikasi tiap klaim.' };
    case 'thinking': return { effort: 'medium',  budget: 8192,  suhu: 0.50, instruksi: 'Tampilkan proses berpikirmu secara runtut sebelum kesimpulan.' };
    default:         return { effort: null,      budget: null,  suhu: 0.60, instruksi: '' }; // auto
  }
}

// Bangun field tambahan untuk body request sesuai level + kemampuan provider.
// Tidak pernah melempar - provider yang menolak parameter asing tetap aman
// karena kita hanya menambah bila level bukan 'auto'.
export function fieldThinking(level, baseUrl = '') {
  const p = petaThinking(level);
  const tambahan = {};
  if (p.effort) tambahan.reasoning_effort = p.effort;
  // Anthropic/Claude: pakai thinking budget bila endpoint-nya anthropic.
  if (p.budget && /anthropic|claude/i.test(String(baseUrl))) {
    tambahan.thinking = { type: 'enabled', budget_tokens: p.budget };
  }
  return tambahan;
}

export async function tanyaGroq(pesan, opsi = {}) {
  const namaProvider = resolveProvider(opsi.provider);
  const info = await providerInfo(namaProvider);
  if (!info) {
    return { ok: false, error: `Provider "${namaProvider}" tidak ditemukan.`, provider: namaProvider, providerLabel: namaProvider };
  }
  const kunci = info.kunci;
  const url = info.url;
  const model = (opsi.model && opsi.model.trim()) || info.model;
  const label = info.label;

  // Pengaturan per-model (permintaan pemilik 2026-10-02):
  //   maxTokens  : batas panjang jawaban.
  //   kecerdasan : 1-10 -> memetakan ke temperature (rendah = fokus/presisi,
  //                tinggi = kreatif/exploratif). Default 6.
  const batasToken = Number.isFinite(Number(opsi.maxTokens)) && Number(opsi.maxTokens) > 0
    ? Math.min(32000, Math.max(200, Number(opsi.maxTokens)))
    : maksToken();
  // THINKING LEVEL (2026-10-04): menggantikan 'kecerdasan 1-10'.
  // 'auto' = serahkan ke provider (tidak mengirim parameter reasoning).
  const thinking = String(opsi.thinking || 'auto').toLowerCase();
  const peta = petaThinking(thinking);
  const suhu = peta.suhu;
  // Instruksi kedalaman disisipkan sebagai pesan sistem tambahan (hanya bila ada).
  const pesanFinal = peta.instruksi
    ? [{ role: 'system', content: peta.instruksi }, ...pesan]
    : pesan;

  if (!kunci.length) {
    return { ok: false, error: `Kunci ${label} belum diisi. Cek environment variable ${info.envKey} atau isi API key di panel provider.`, provider: namaProvider, providerLabel: label, envKey: info.envKey };
  }
  if (!url) {
    return { ok: false, error: `URL provider ${label} belum diisi.`, provider: namaProvider, providerLabel: label, envKey: info.envKey };
  }

  let terakhir = null;

  // PENCATAT USAGE (permintaan pemilik 2026-10-04): satu helper supaya SEMUA
  // jalur return tercatat - sukses (dengan token dari provider) maupun gagal
  // (untuk hitungan request). Fire-and-forget: tidak pernah memblokir jawaban.
  const mulaiMs = Date.now();
  const catat = (ok, usage) => {
    catatUsage({ provider: namaProvider, model, usage, ok, durasiMs: Date.now() - mulaiMs }).catch(() => {});
  };

  for (let i = 0; i < kunci.length; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${kunci[i]}`,
        },
        body: JSON.stringify({
          model,
          messages: pesanFinal,
          max_tokens: batasToken,
          temperature: suhu,
          // Parameter Thinking (reasoning_effort / thinking budget) - hanya
          // ditambahkan bila level bukan 'auto'.
          ...fieldThinking(thinking, url),
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/event-stream') || ct.includes('stream')) {
          const sse = await bacaSSE(res);
          if (sse?.teks) { catat(true, sse.usage); return { ok: true, teks: bersihkanJawaban(sse.teks), kunciDipakai: i + 1, provider: namaProvider, providerLabel: label, model, usage: sse.usage }; }
          terakhir = { kode: res.status, error: 'AI mengembalikan stream kosong.' };
          continue;
        }

        let data;
        try { data = await res.json().catch(() => ({})); } catch (_) { data = null; }

        // Ambil info PEMAKAIAN TOKEN dari provider (permintaan pemilik
        // 2026-10-02: "gw mau tampilin total token yang digunakan").
        const usage = data?.usage ? {
          promptTokens: data.usage.prompt_tokens ?? null,
          completionTokens: data.usage.completion_tokens ?? null,
          totalTokens: data.usage.total_tokens ?? null,
        } : null;

        // ==========================================
        // FIX 2026-10-07 (AGEN TIDAK PERNAH KELUAR LAPORAN):
        // Model REASONING (mis. deepseek-v4-flash, o1-style) menaruh hasil
        // "berpikir" di field `reasoning` dan jawaban akhir di `content`.
        // Kalau token HABIS saat berpikir (finish_reason='length'), `content`
        // KOSONG tapi `reasoning` berisi teks panjang. Dulu kode cuma baca
        // `content` -> dianggap "balasan kosong" -> agen GAGAL SELALU walau
        // provider & kunci sehat. Sekarang: fallback ke `reasoning` (dibuang
        // kalimat "thinking"-nya lewat bersihkanJawaban) supaya laporan tetap
        // keluar walau token pas-pasan.
        const msg = data?.choices?.[0]?.message;
        const teks = msg?.content || msg?.reasoning || '';
        if (teks) { catat(true, data?.usage); return { ok: true, teks: bersihkanJawaban(teks), kunciDipakai: i + 1, provider: namaProvider, providerLabel: label, model, usage }; }

        if (!data?.choices) {
          const sse2 = await bacaSSE(res);
          if (sse2?.teks) { catat(true, sse2.usage); return { ok: true, teks: bersihkanJawaban(sse2.teks), kunciDipakai: i + 1, provider: namaProvider, providerLabel: label, model, usage: sse2.usage }; }
        }

        // Pesan error lebih informatif: sebut kalau token habis untuk reasoning.
        const finishReason = data?.choices?.[0]?.finish_reason;
        terakhir = {
          kode: res.status,
          error: finishReason === 'length'
            ? `AI kehabisan token saat berpikir (finish_reason=length). Model reasoning butuh maxTokens lebih besar - naikkan di pengaturan model atau ganti model non-reasoning.`
            : 'AI mengirim balasan kosong.',
        };
        // RETRY: model free kadang kosong saat pertama. Coba ulang sekali.
        // FIX 2026-10-04: dulu blok ini mereferensikan `h` dan `payload` yang
        // TIDAK ADA (selalu ReferenceError -> ditelan catch -> retry tidak
        // pernah benar-benar jalan). Sekarang header & body dibangun eksplisit.
        try {
          await new Promise((r) => setTimeout(r, 800));
          const res2 = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kunci[i]}` },
            body: JSON.stringify({
              model,
              messages: pesanFinal,
              max_tokens: batasToken,
              temperature: suhu,
              ...fieldThinking(thinking, url),
            }),
            signal: AbortSignal.timeout(60000),
          });
          if (res2.ok) {
            const data2 = await res2.json().catch(() => null);
            // FIX 2026-10-07: fallback ke reasoning juga di jalur retry
            // (model reasoning -> content kosong tapi reasoning berisi).
            const msg2 = data2?.choices?.[0]?.message;
            const teks2 = msg2?.content || msg2?.reasoning || '';
            if (teks2) { catat(true, data2?.usage); return { ok: true, teks: bersihkanJawaban(teks2), kunciDipakai: i + 1, provider: namaProvider, providerLabel: label, model, usage: data2?.usage || null }; }
          }
        } catch { /* retry gagal - lanjut */ }
        continue;
      }

      let pesanErr = '';
      try { const j = await res.json().catch(() => ({})); pesanErr = j?.error?.message || JSON.stringify(j); } catch { pesanErr = ''; }

      const kode = res.status;
      // Terjemahkan pesan provider (umumnya Inggris) ke Indonesia supaya
      // pemilik paham sebabnya (permintaan pemilik 2026-10-02: "semua validasi
      // ini pake bahasa indonesia").
      let rangkai = terjemahPesan(pesanErr) || ('HTTP ' + kode);
      if (/too large|TPM|tokens per minute/i.test(pesanErr || '')) {
        rangkai = `Data terlalu panjang untuk batas kuota ${label}. Coba lagi sebentar.`;
      } else if (kode === 403) {
        rangkai += ` [kunci ditolak atau nama MODEL salah. Cek model: ${model}]`;
      } else if (kode === 401) {
        rangkai += ` [kunci ditolak: periksa ${info.envKey} atau API key provider]`;
      } else if (kode === 429) {
        rangkai += ' [kuota kunci ini habis - coba lagi nanti]';
      }
      // RETRY: error 5xx (server provider bermasalah) sering SEMENTARA. Kalau
      // hanya ada 1 kunci, tanpa retry pemilik langsung gagal. Coba ulang
      // sekali (jeda 800ms) untuk error server sebelum menyerah.
      // FIX 2026-10-04: dulu `messages: pesan` (variabel tidak ada di scope ->
      // ReferenceError -> retry 5xx selalu gagal senyap). Ganti pesanFinal +
      // fieldThinking yang sudah dibangun di atas.
      if (kode >= 500) {
        try {
          await new Promise((r) => setTimeout(r, 800));
          const res2 = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${kunci[i]}` },
            body: JSON.stringify({
              model,
              messages: pesanFinal,
              max_tokens: batasToken,
              temperature: suhu,
              ...fieldThinking(thinking, url),
            }),
            signal: AbortSignal.timeout(60000),
          });
          if (res2.ok) {
            let d2;
            try { d2 = await res2.json().catch(() => ({})); } catch (_) { d2 = null; }
            const t2 = d2?.choices?.[0]?.message?.content;
            if (t2) {
              const u2 = d2?.usage ? {
                promptTokens: d2.usage.prompt_tokens ?? null,
                completionTokens: d2.usage.completion_tokens ?? null,
                totalTokens: d2.usage.total_tokens ?? null,
              } : null;
              catat(true, d2?.usage);
              return { ok: true, teks: bersihkanJawaban(t2), kunciDipakai: i + 1, provider: namaProvider, providerLabel: label, model, usage: u2 };
            }
          }
        } catch { /* retry gagal - lanjut ke kunci berikutnya / menyerah */ }
      }

      terakhir = { kode, error: bersihkanPesan(rangkai, kunci) };
      if (kode === 400 || kode === 404) break;
    } catch (e) {
      const pesan = e?.name === 'TimeoutError'
        ? 'Permintaan ke AI melewati 60 detik.'
        : bersihkanPesan(e?.message || e, kunci);
      terakhir = { kode: 0, error: pesan };
    }
  }

  const semuaDicoba = kunci.length > 1 ? ` (${kunci.length} kunci dicoba)` : '';
  // Catat permintaan GAGAL juga (hitungan request tetap akurat). Token 0
  // karena provider tidak mengirim usage saat error.
  catat(false, null);
  return {
    ok: false,
    kode: terakhir?.kode || 0,
    error: (terakhir?.error || `Gagal menghubungi ${label}.`) + semuaDicoba,
    model,
    provider: namaProvider,
    providerLabel: label,
    envKey: info.envKey,
  };
}

async function bacaSSE(res) {
  try {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let isi = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      isi += decoder.decode(value, { stream: true });
    }
    let teks = '';
    let usage = null;
    for (const b of isi.split('\n')) {
      if (!b.startsWith('data: ')) continue;
      const jsonStr = b.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const obj = JSON.parse(jsonStr);
        const delta = obj?.choices?.[0]?.delta?.content;
        if (delta) teks += delta;
        // Ambil usage kalau SSE menyertakannya (biasanya di chunk terakhir).
        if (obj?.usage) usage = {
          promptTokens: obj.usage.prompt_tokens ?? null,
          completionTokens: obj.usage.completion_tokens ?? null,
          totalTokens: obj.usage.total_tokens ?? null,
        };
      } catch (_) { /* bukan JSON valid */ }
    }
    return { teks: teks.trim() || null, usage };
  } catch { return null; }
}
