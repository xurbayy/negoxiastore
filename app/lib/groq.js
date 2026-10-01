// ==========================================
// app/lib/groq.js
// Klien Groq dengan ROTASI KUNCI otomatis.
// ==========================================
//
// KENAPA BANYAK KUNCI:
//   Kuota Groq dihitung PER KUNCI. Satu kunci cepat mentok (HTTP 429) kalau
//   dipakai sering. Di sini kunci dicoba berurutan: kena 429 / limit -> pindah
//   ke kunci berikutnya, bukan langsung gagal.
//
// KEAMANAN:
//   - Kunci HANYA dibaca di server (file ini tidak pernah diimpor komponen
//     klien). Jangan pernah menaruhnya di variabel NEXT_PUBLIC_*.
//   - Kunci TIDAK PERNAH dikembalikan ke pemanggil, apalagi ke browser.
//   - Pesan error dari Groq bisa memuat cuplikan kunci -> disaring dulu.
//
// Semua fungsi di sini server-only.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Daftar kunci dari env (dipisah koma), dibersihkan dari kosong/spasi. */
function daftarKunci() {
  const mentah = process.env.GROQ_API_KEY || '';
  return mentah.split(',').map((k) => k.trim()).filter(Boolean);
}

export function adaGroq() {
  return daftarKunci().length > 0;
}

export function jumlahKunci() {
  return daftarKunci().length;
}

export function modelGroq() {
  return process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
}

function maksToken() {
  const n = parseInt(process.env.GROQ_MAX_TOKENS, 10);
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

/**
 * Buang kunci kalau tidak sengaja ikut muncul di pesan error.
 * Pesan error Groq kadang menyertakan header permintaan.
 */
function bersihkanPesan(teks) {
  let out = String(teks || '');
  for (const k of daftarKunci()) {
    if (k) out = out.split(k).join('[kunci-disembunyikan]');
  }
  // Pola umum kunci Groq yang mungkin lolos.
  return out.replace(/gsk_[A-Za-z0-9]{20,}/g, '[kunci-disembunyikan]');
}

/**
 * Kirim permintaan ke Groq, mencoba tiap kunci sampai ada yang berhasil.
 *
 * @param {Array<{role:string, content:string}>} pesan
 * @returns {Promise<{ok:boolean, teks?:string, error?:string, kode?:number, kunciDipakai?:number}>}
 */
export async function tanyaGroq(pesan) {
  const kunci = daftarKunci();
  if (!kunci.length) {
    return { ok: false, error: 'GROQ_API_KEY belum diisi di environment.' };
  }

  let terakhir = null;

  for (let i = 0; i < kunci.length; i++) {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${kunci[i]}`,
        },
        body: JSON.stringify({
          model: modelGroq(),
          messages: pesan,
          max_tokens: maksToken(),
          temperature: 0.4, // agak rendah: analisis data harus konsisten, bukan kreatif
        }),
        // 60 detik: analisis panjang butuh waktu, tapi jangan menggantung selamanya.
        signal: AbortSignal.timeout(60000),
      });

      if (res.ok) {
        const data = await res.json();
        const teks = data?.choices?.[0]?.message?.content;
        if (!teks) {
          terakhir = { kode: res.status, error: 'Groq mengirim balasan kosong.' };
          continue; // coba kunci berikutnya
        }
        return { ok: true, teks, kunciDipakai: i + 1 };
      }

      // Baca pesan error Groq untuk diagnosa.
      let pesanErr = '';
      try {
        const j = await res.json();
        pesanErr = j?.error?.message || JSON.stringify(j);
      } catch {
        pesanErr = '';
      }

      // ---------------------------------------------------------------
      // RANGKAI PESAN YANG MENYEBUTKAN KODE HTTP (fix 2026-09-30)
      // ---------------------------------------------------------------
      // Keluhan nyata: pesan "Invalid API Key" muncul padahal kuncinya VALID
      // (diuji langsung ke api.groq.com, kelima kunci balas normal).
      //
      // Sebabnya Groq memakai 403 dengan pesan generik untuk beberapa kondisi
      // berbeda, dan satu di antaranya adalah MODEL yang tidak dikenal. Kalau
      // pesan Groq diteruskan mentah-mentah, admin dikirim mengejar masalah
      // yang salah (memeriksa kunci) padahal yang perlu diperbaiki nama model.
      //
      // Karena itu kode HTTP selalu ditulis, dan untuk 403 ditambah pengingat
      // bahwa penyebabnya bisa model - bukan cuma kunci.
      const kode = res.status;
      let rangkai = pesanErr || ('HTTP ' + kode);
      if (kode === 403) {
        rangkai += ' [penyebab lazim: nama MODEL tidak dikenal. Cek GROQ_MODEL - ' +
          'daftar model yang tersedia untuk akun ini bisa dilihat di console.groq.com]';
      } else if (kode === 401) {
        rangkai += ' [kunci ditolak: periksa nama variabel GROQ_API_KEY dan pastikan ' +
          'nilainya tidak terpotong]';
      } else if (kode === 429) {
        rangkai += ' [kuota kunci ini habis]';
      }
      terakhir = { kode, error: bersihkanPesan(rangkai) };

      // 400/404 = permintaan salah (termasuk model tidak ada) -> kunci lain
      // tidak akan menolong, hentikan supaya tidak menghabiskan kuota.
      if (kode === 400 || kode === 404) break;
    } catch (e) {
      // Termasuk AbortError (timeout) dan gangguan jaringan.
      const pesan = e?.name === 'TimeoutError'
        ? 'Permintaan ke Groq melewati 60 detik.'
        : bersihkanPesan(e?.message || e);
      terakhir = { kode: 0, error: pesan };
    }
  }

  const semuaDicoba = kunci.length > 1 ? ` (${kunci.length} kunci dicoba)` : '';
  return {
    ok: false,
    kode: terakhir?.kode || 0,
    error: (terakhir?.error || 'Gagal menghubungi Groq.') + semuaDicoba,
    // Nama model ikut dilaporkan: kesalahan paling sering justru di sini,
    // dan tanpa ini admin harus menebak-nebak dari pesan Groq.
    model: modelGroq(),
  };
}
