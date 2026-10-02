// ==========================================
// app/lib/kodeBase.js -> Konteks KODE BASE untuk AI
// ==========================================
//
// Permintaan pemilik 2026-10-02: "gw mau si ai tu bisa baca seluruh kode base
// botnya, jadi bisa kasih tau potensi error".
//
// CARA KERJA (pilihan "ringkasan + cuplikan"):
//   - BOT yang membaca file-nya sendiri (karena file ada di server bot), lalu
//     mengirim RINGKASAN ke web: daftar file, jumlah baris, daftar fungsi, dan
//     cuplikan bagian yang rawan (query DB, auth, reward, refund).
//   - Ringkasan dikirim lewat snapshot (field `kodeBase`) - lihat webBridge bot.
//   - Fungsi di sini mengubah ringkasan itu menjadi teks konteks untuk AI.
//
// KEAMANAN: yang dikirim HANYA struktur + cuplikan singkat, BUKAN isi file
// lengkap. Kredensial (.env) TIDAK pernah dibaca. Ini menjaga payload tetap
// kecil & aman.

const BATAS_KODE = 6000; // batas karakter konteks kode (hemat token, respons cepat)

/**
 * Bentuk konteks kode base dari ringkasan yang dikirim bot.
 * @param {object} kodeBase - { files: [{ path, lines, funcs: [], cuplikan: [] }], ringkas }
 * @returns {string}
 */
export function susunKonteksKode(kodeBase) {
  if (!kodeBase || !Array.isArray(kodeBase.files) || !kodeBase.files.length) {
    return [
      '',
      '### KODE BASE BOT',
      '(Bot belum mengirim ringkasan kode. Minta pemilik memastikan bot versi terbaru & bridge aktif.',
      'Kalau bot tidak mengirim, analisis kode tidak bisa dilakukan - katakan apa adanya.)',
    ].join('\n');
  }

  const L = ['', '### KODE BASE BOT (ringkasan dari bot)'];
  if (kodeBase.ringkas) L.push(kodeBase.ringkas);
  L.push(`Total file dikirim: ${kodeBase.files.length}`);

  // Daftar file + fungsi (ringkas).
  L.push('');
  L.push('Daftar file (path | baris | fungsi):');
  for (const f of kodeBase.files) {
    const funcs = Array.isArray(f.funcs) ? f.funcs.slice(0, 30).join(', ') : '';
    L.push(`- ${f.path} | ${f.lines || '?'} baris | ${funcs}`);
  }

  // Cuplikan rawan (kalau ada) - ini yang paling berguna untuk bug/security.
  const adaCuplikan = kodeBase.files.some((f) => Array.isArray(f.cuplikan) && f.cuplikan.length);
  if (adaCuplikan) {
    L.push('');
    L.push('CUPLIKAN BAGIAN RAWAN (query DB, auth, reward, refund, dsb):');
    for (const f of kodeBase.files) {
      if (!Array.isArray(f.cuplikan)) continue;
      for (const c of f.cuplikan) {
        L.push('');
        L.push(`- ${f.path} :: ${c.lokasi || '?'}`);
        if (c.kode) L.push(String(c.kode).split('\n').map((x) => '  ' + x).join('\n'));
      }
    }
  }

  let teks = L.join('\n');
  if (teks.length > BATAS_KODE) {
    teks = teks.slice(0, BATAS_KODE) + '\n\n(Cuplikan kode dipangkas karena terlalu panjang. Kalau perlu detail bagian tertentu, minta pemilik menyebut file/fungsinya.)';
  }
  return teks;
}

/** Apakah ringkasan kode tersedia? */
export function adaKodeBase(kodeBase) {
  return Boolean(kodeBase && Array.isArray(kodeBase.files) && kodeBase.files.length);
}
