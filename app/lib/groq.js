// ==========================================
// app/lib/groq.js -> AI Klien (OpenAI-compatible)
// ==========================================
//
// Mendukung DUA penyedia:
//   1. Groq (default) - https://api.groq.com/openai/v1
//   2. Endpoint custom - lewat env AI_BASE_URL (mis. proxy lokal Gemini)
//
// PEMILIHAN OTOMATIS: kalau AI_BASE_URL di-set, pakai itu. Kalau tidak, pakai
// Groq (kembali ke perilaku lama).
//
// KUNCI: AI_API_KEY untuk provider baru, GROQ_API_KEY untuk Groq (bisa multi
// dipisah koma untuk rotasi).
//
// KEAMANAN:
//   - Kunci HANYA dibaca di server (file ini tidak pernah diimpor komponen
//     klien). Jangan pernah menaruhnya di variabel NEXT_PUBLIC_*.
//   - Kunci TIDAK PERNAH dikembalikan ke pemanggil, apalagi ke browser.
//   - Pesan error disaring supaya kunci tidak bocor.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** URL endpoint yang dipakai. */
function baseUrl() {
  const custom = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  if (custom) return `${custom}/chat/completions`;
  return GROQ_URL;
}

/** Daftar kunci dari env. Provider custom: AI_API_KEY. Groq: GROQ_API_KEY. */
function daftarKunci() {
  const custom = process.env.AI_API_KEY;
  if (custom && custom.trim()) return custom.split(',').map((k) => k.trim()).filter(Boolean);
  const groq = process.env.GROQ_API_KEY || '';
  return groq.split(',').map((k) => k.trim()).filter(Boolean);
}

/** Model yang dipakai. Provider custom: AI_MODEL. Groq: GROQ_MODEL. */
function modelAI() {
  return process.env.AI_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
}

/** Nama provider (untuk tampilan di panel admin). */
function namaProvider() {
  if (process.env.AI_BASE_URL) {
    try { return new URL(process.env.AI_BASE_URL).hostname; } catch (_) { return 'custom'; }
  }
  return 'groq';
}

export function adaGroq() {
  return daftarKunci().length > 0;
}

export function jumlahKunci() {
  return daftarKunci().length;
}

export function modelGroq() {
  return modelAI();
}

export function providerInfo() {
  return { nama: namaProvider(), model: modelAI(), kunci: jumlahKunci() };
}

// Batas token OUTPUT. Default 2000 supaya total request tetap di bawah
// batas kuota provider (Groq 8000 TPM; provider lain biasanya lebih besar).
function maksToken() {
  const n = parseInt(process.env.AI_MAX_TOKENS || process.env.GROQ_MAX_TOKENS, 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}

/**
 * Buang kunci kalau tidak sengaja ikut muncul di pesan error.
 */
function bersihkanPesan(teks) {
  let out = String(teks || '');
  for (const k of daftarKunci()) {
    if (k) out = out.split(k).join('[kunci-disembunyikan]');
  }
  return out
    .replace(/gsk_[A-Za-z0-9]{20,}/g, '[kunci-disembunyikan]')
    .replace(/sk-[A-Za-z0-9\-]{20,}/g, '[kunci-disembunyikan]');
}

/**
 * Kirim permintaan ke AI provider, mencoba tiap kunci sampai ada yang berhasil.
 *
 * @param {Array<{role:string, content:string}>} pesan
 * @returns {Promise<{ok:boolean, teks?:string, error?:string, kode?:number, kunciDipakai?:number}>}
 */
export async function tanyaGroq(pesan) {
  const kunci = daftarKunci();
  if (!kunci.length) {
    return { ok: false, error: 'AI_API_KEY / GROQ_API_KEY belum diisi di environment.' };
  }

  const url = baseUrl();
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
          model: modelAI(),
          messages: pesan,
          max_tokens: maksToken(),
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (res.ok) {
        // Deteksi SSE dari content-type header (provider seperti 9router/Gemini
        // mengembalikan text/event-stream, bukan application/json).
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/event-stream') || ct.includes('stream')) {
          const teksSse = await bacaSSE(res);
          if (teksSse) return { ok: true, teks: teksSse, kunciDipakai: i + 1 };
          terakhir = { kode: res.status, error: 'AI mengembalikan stream kosong.' };
          continue;
        }

        // Response JSON biasa (Groq dan beberapa provider lain).
        let data;
        try { data = await res.json(); } catch (_) { data = null; }

        const teks = data?.choices?.[0]?.message?.content;
        if (teks) return { ok: true, teks, kunciDipakai: i + 1 };

        // Fallback: kalau response bukan JSON valid, coba baca sebagai SSE.
        if (!data?.choices) {
          const teksSse = await bacaSSE(res);
          if (teksSse) return { ok: true, teks: teksSse, kunciDipakai: i + 1 };
        }

        terakhir = { kode: res.status, error: 'AI mengirim balasan kosong.' };
        continue;
      }

      let pesanErr = '';
      try { const j = await res.json(); pesanErr = j?.error?.message || JSON.stringify(j); } catch { pesanErr = ''; }

      const kode = res.status;
      let rangkai = pesanErr || ('HTTP ' + kode);
      if (/too large|TPM|tokens per minute/i.test(rangkai)) {
        rangkai = 'Data terlalu panjang untuk batas kuota provider. Konteks sudah dipangkas otomatis; coba lagi sebentar.';
      } else if (kode === 403) {
        rangkai += ' [kunci ditolak atau nama MODEL salah. Cek AI_MODEL/GROQ_MODEL]';
      } else if (kode === 401) {
        rangkai += ' [kunci ditolak: periksa AI_API_KEY]';
      } else if (kode === 429) {
        rangkai += ' [kuota kunci ini habis - coba lagi nanti]';
      }
      terakhir = { kode, error: bersihkanPesan(rangkai) };
      if (kode === 400 || kode === 404) break;
    } catch (e) {
      const pesan = e?.name === 'TimeoutError'
        ? 'Permintaan ke AI melewati 60 detik.'
        : bersihkanPesan(e?.message || e);
      terakhir = { kode: 0, error: pesan };
    }
  }

  const semuaDicoba = kunci.length > 1 ? ` (${kunci.length} kunci dicoba)` : '';
  return {
    ok: false,
    kode: terakhir?.kode || 0,
    error: (terakhir?.error || 'Gagal menghubungi AI.') + semuaDicoba,
    model: modelAI(),
  };
}

/** Baca balasan SSE (Server-Sent Events) - dipakai provider yang streaming. */
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
    // Ekstrak konten dari format SSE: data: {"choices":[{"delta":{"content":"..."}}]}
    const baris = isi.split('\n');
    let teks = '';
    for (const b of baris) {
      if (!b.startsWith('data: ')) continue;
      const jsonStr = b.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const obj = JSON.parse(jsonStr);
        const delta = obj?.choices?.[0]?.delta?.content;
        if (delta) teks += delta;
      } catch (_) { /* baris bukan JSON valid - lewati */ }
    }
    return teks.trim() || null;
  } catch {
    return null;
  }
}
