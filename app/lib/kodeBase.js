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

const BATAS_KODE = 9000; // batas karakter konteks kode (cukup untuk cuplikan + sebagian daftar)

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

  const kepala = ['', '### KODE BASE BOT (ringkasan dari bot)'];
  if (kodeBase.ringkas) kepala.push(kodeBase.ringkas);
  kepala.push(`Total file dikirim: ${kodeBase.files.length}`);

  // CUPLIKAN RAWAN DULUAN (paling penting untuk bug/security). Kalau total
  // kepanjangan, yang dipotong adalah DAFTAR FILE (informasi lebih ringan),
  // bukan cuplikan kode (bukti utama).
  const cuplikanL = [];
  const adaCuplikan = kodeBase.files.some((f) => Array.isArray(f.cuplikan) && f.cuplikan.length);
  if (adaCuplikan) {
    cuplikanL.push('');
    cuplikanL.push('CUPLIKAN BAGIAN RAWAN (query DB, auth, reward, refund, dsb):');
    for (const f of kodeBase.files) {
      if (!Array.isArray(f.cuplikan)) continue;
      for (const c of f.cuplikan) {
        cuplikanL.push('');
        cuplikanL.push(`- ${f.path} :: ${c.lokasi || '?'}`);
        if (c.kode) cuplikanL.push(String(c.kode).split('\n').map((x) => '  ' + x).join('\n'));
      }
    }
  }

  const daftarL = [];
  daftarL.push('');
  daftarL.push('Daftar file (path | baris | fungsi):');
  for (const f of kodeBase.files) {
    const funcs = Array.isArray(f.funcs) ? f.funcs.slice(0, 30).join(', ') : '';
    daftarL.push(`- ${f.path} | ${f.lines || '?'} baris | ${funcs}`);
  }

  const teksKepala = kepala.join('\n');
  const teksCuplikan = cuplikanL.join('\n');
  const teksDaftar = daftarL.join('\n');

  // Sisa jatah untuk daftar file setelah kepala + cuplikan.
  const sisa = BATAS_KODE - teksKepala.length - teksCuplikan.length;
  if (sisa <= 0) {
    // Cuplikan saja sudah penuh - kirim kepala + cuplikan (tanpa daftar file).
    return (teksKepala + teksCuplikan).slice(0, BATAS_KODE) +
      '\n\n(Daftar file dipangkas. Kalau perlu detail bagian tertentu, sebut nama file/fungsinya.)';
  }
  if (teksDaftar.length > sisa) {
    // Potong daftar file, pertahankan cuplikan utuh.
    return teksKepala + teksCuplikan + '\n' + teksDaftar.slice(0, Math.max(0, sisa - 80)) +
      '\n...\n(Daftar file dipangkas. Kalau perlu detail bagian tertentu, sebut nama file/fungsinya.)';
  }
  return teksKepala + teksCuplikan + teksDaftar;
}

/** Apakah ringkasan kode tersedia? */
export function adaKodeBase(kodeBase) {
  return Boolean(kodeBase && Array.isArray(kodeBase.files) && kodeBase.files.length);
}
