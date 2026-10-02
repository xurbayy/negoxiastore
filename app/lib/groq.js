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
  if (nama) return nama;
  // 2) AI_PROVIDER env.
  if (process.env.AI_PROVIDER) return process.env.AI_PROVIDER;
  // 3) Custom HANYA kalau AI_BASE_URL diisi (legacy).
  if (process.env.AI_BASE_URL) return 'custom';
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
    const { getDb, schemaReady } = await import('./db');
    const { dekripsiKunci } = await import('./aiCrypto');
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
    // Env key opsional sebagai alternatif (mis. kalau key tidak disimpan di DB).
    if (!kunci.length && row.env_key && process.env[row.env_key]) {
      kunci.push(...String(process.env[row.env_key]).split(',').map((k) => k.trim()).filter(Boolean));
    }
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

export function namaProviderAktif() {
  return resolveProvider(process.env.AI_PROVIDER);
}

// Catatan: infoProvider() TETAP sinkron & murah (dipakai jalur lama), tapi
// versi lengkap dengan provider kustom + model tersimpan ada di
// infoProviderLengkap() (async, membaca DB).
export function infoProvider() {
  const aktif = resolveProvider(process.env.AI_PROVIDER);
  // Custom hanya ditawarkan kalau AI_BASE_URL benar-benar diisi. Tanpa ini,
  // tombol Custom muncul terus padahal tidak bisa dipakai (bingung pemilik).
  const daftar = Object.keys(PROVIDERS).filter(
    (k) => k !== 'custom' || Boolean(process.env.AI_BASE_URL)
  );
  return {
    aktif,
    label: PROVIDERS[aktif]?.label || aktif,
    model: modelDipakai(aktif),
    kunci: daftarKunci(aktif).length,
    tersedia: daftar.map((k) => ({
      id: k,
      label: PROVIDERS[k].label,
      model: modelDipakai(k),
      kunci: daftarKunci(k).length,
    })),
  };
}

/**
 * Versi lengkap: provider bawaan + provider kustom dari DB + model tersimpan.
 * Dipakai panel admin (async karena membaca DB).
 */
export async function infoProviderLengkap(providerTerpilih) {
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
    const { getDb, schemaReady } = await import('./db');
    await schemaReady();
    const db = getDb();
    const [prov, mod] = await Promise.all([
      db.execute('SELECT slug, nama, base_url, env_key, api_key_enc FROM ai_providers ORDER BY nama ASC'),
      db.execute('SELECT id, label, model, provider FROM ai_models ORDER BY label ASC'),
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
    }));
  } catch { /* DB tidak siap - tampilkan provider bawaan saja */ }

  // Info provider aktif (bisa kustom).
  const aktifInfo = await providerInfo(aktif);
  return {
    aktif,
    label: aktifInfo?.label || aktif,
    model: modelDipakai(aktif),
    kunci: (aktifInfo?.kunci || []).length,
    tersedia,
    models: modelTersimpan,
  };
}

export function adaGroq() {
  return daftarKunci(namaProviderAktif()).length > 0;
}

export function jumlahKunci() {
  return daftarKunci(namaProviderAktif()).length;
}

export function modelGroq() {
  return modelDipakai(namaProviderAktif());
}

function maksToken() {
  const n = parseInt(process.env.AI_MAX_TOKENS || process.env.GROQ_MAX_TOKENS, 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
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

  if (!kunci.length) {
    return { ok: false, error: `Kunci ${label} belum diisi. Cek environment variable ${info.envKey} atau isi API key di panel provider.`, provider: namaProvider, providerLabel: label, envKey: info.envKey };
  }
  if (!url) {
    return { ok: false, error: `URL provider ${label} belum diisi.`, provider: namaProvider, providerLabel: label, envKey: info.envKey };
  }

  let terakhir = null;

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
          messages: pesan,
          max_tokens: maksToken(),
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/event-stream') || ct.includes('stream')) {
          const teksSse = await bacaSSE(res);
          if (teksSse) return { ok: true, teks: teksSse, kunciDipakai: i + 1, provider: namaProvider, providerLabel: label, model };
          terakhir = { kode: res.status, error: 'AI mengembalikan stream kosong.' };
          continue;
        }

        let data;
        try { data = await res.json(); } catch (_) { data = null; }

        const teks = data?.choices?.[0]?.message?.content;
        if (teks) return { ok: true, teks, kunciDipakai: i + 1, provider: namaProvider, providerLabel: label, model };

        if (!data?.choices) {
          const teksSse = await bacaSSE(res);
          if (teksSse) return { ok: true, teks: teksSse, kunciDipakai: i + 1, provider: namaProvider, providerLabel: label, model };
        }

        terakhir = { kode: res.status, error: 'AI mengirim balasan kosong.' };
        continue;
      }

      let pesanErr = '';
      try { const j = await res.json(); pesanErr = j?.error?.message || JSON.stringify(j); } catch { pesanErr = ''; }

      const kode = res.status;
      let rangkai = pesanErr || ('HTTP ' + kode);
      if (/too large|TPM|tokens per minute/i.test(rangkai)) {
        rangkai = `Data terlalu panjang untuk batas kuota ${label}. Coba lagi sebentar.`;
      } else if (kode === 403) {
        rangkai += ` [kunci ditolak atau nama MODEL salah. Cek model: ${model}]`;
      } else if (kode === 401) {
        rangkai += ` [kunci ditolak: periksa ${info.envKey} atau API key provider]`;
      } else if (kode === 429) {
        rangkai += ' [kuota kunci ini habis - coba lagi nanti]';
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
    for (const b of isi.split('\n')) {
      if (!b.startsWith('data: ')) continue;
      const jsonStr = b.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const obj = JSON.parse(jsonStr);
        const delta = obj?.choices?.[0]?.delta?.content;
        if (delta) teks += delta;
      } catch (_) { /* bukan JSON valid */ }
    }
    return teks.trim() || null;
  } catch { return null; }
}
