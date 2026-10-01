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
  if (nama && PROVIDERS[nama]) return nama;
  if (process.env.AI_BASE_URL) return 'custom';
  return 'groq';
}

function baseUrl(namaProvider) {
  const p = PROVIDERS[namaProvider];
  if (namaProvider === 'custom') {
    const custom = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
    return custom ? `${custom}/chat/completions` : '';
  }
  return p.url;
}

function daftarKunci(namaProvider) {
  const p = PROVIDERS[namaProvider];
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

export function infoProvider() {
  const aktif = resolveProvider(process.env.AI_PROVIDER);
  return {
    aktif,
    label: PROVIDERS[aktif].label,
    model: modelDipakai(aktif),
    kunci: daftarKunci(aktif).length,
    tersedia: Object.keys(PROVIDERS).map((k) => ({
      id: k,
      label: PROVIDERS[k].label,
      model: modelDipakai(k),
      kunci: daftarKunci(k).length,
    })),
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
  const kunci = daftarKunci(namaProvider);
  const url = baseUrl(namaProvider);
  const model = modelDipakai(namaProvider, opsi.model);

  if (!kunci.length) {
    return { ok: false, error: `Kunci ${PROVIDERS[namaProvider].label} belum diisi. Cek environment variable ${PROVIDERS[namaProvider].envKey}.` };
  }
  if (!url) {
    return { ok: false, error: 'AI_BASE_URL belum diisi.' };
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
          if (teksSse) return { ok: true, teks: teksSse, kunciDipakai: i + 1, provider: namaProvider, model };
          terakhir = { kode: res.status, error: 'AI mengembalikan stream kosong.' };
          continue;
        }

        let data;
        try { data = await res.json(); } catch (_) { data = null; }

        const teks = data?.choices?.[0]?.message?.content;
        if (teks) return { ok: true, teks, kunciDipakai: i + 1, provider: namaProvider, model };

        if (!data?.choices) {
          const teksSse = await bacaSSE(res);
          if (teksSse) return { ok: true, teks: teksSse, kunciDipakai: i + 1, provider: namaProvider, model };
        }

        terakhir = { kode: res.status, error: 'AI mengirim balasan kosong.' };
        continue;
      }

      let pesanErr = '';
      try { const j = await res.json(); pesanErr = j?.error?.message || JSON.stringify(j); } catch { pesanErr = ''; }

      const kode = res.status;
      let rangkai = pesanErr || ('HTTP ' + kode);
      if (/too large|TPM|tokens per minute/i.test(rangkai)) {
        rangkai = `Data terlalu panjang untuk batas kuota ${PROVIDERS[namaProvider].label}. Coba lagi sebentar.`;
      } else if (kode === 403) {
        rangkai += ` [kunci ditolak atau nama MODEL salah. Cek model: ${model}]`;
      } else if (kode === 401) {
        rangkai += ` [kunci ditolak: periksa ${PROVIDERS[namaProvider].envKey}]`;
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
    error: (terakhir?.error || `Gagal menghubungi ${PROVIDERS[namaProvider].label}.`) + semuaDicoba,
    model,
    provider: namaProvider,
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
