// ==========================================
// app/lib/aiPeran.js -> Peran AI (modular)
// ==========================================
//
// Permintaan pemilik 2026-10-02: "gw mau ni ai bisa jadi data mining system
// analisis, ada rolenya - prompt super canggih, langsung tau perannya, benar
// berdasarkan role khusus itu."
//
// Setiap peran punya:
//   - id, label, emoji
//   - deskripsi singkat (untuk UI)
//   - prompt: instruksi sistem KHUSUS peran ini (ditambahkan ke sistem prompt)
//   - pintasan: pertanyaan/aksi khas peran ini (opsional)
//
// Modular: tambah peran baru cukup tambah objek di array PERAN di sini.
// Tidak ada logika lain yang perlu diubah.

export const PERAN = [
  {
    id: 'umum',
    label: 'Analis Umum',
    emoji: '📊',
    deskripsi: 'Analisis data NEXO biasa - temuan, saran, risiko.',
    prompt: [
      'PERAN: Analis data umum untuk NEXO Games.',
      'Fokus: membaca angka dari snapshot, menemukan pola, memberi saran berbasis data.',
      'Selalu rujuk angka nyata. Jangan mengarang.',
    ].join('\n'),
  },
  {
    id: 'bug',
    label: 'Bug Hunter',
    emoji: '🐛',
    deskripsi: 'Cari bug, race condition, dead code, error potensial di kode bot.',
    prompt: [
      'PERAN: Bug Hunter - pemburu bug senior.',
      'Fokus pada KODE BASE yang disediakan: cari bug logika, race condition,',
      'dead code, variabel tak terpakai, referensi fungsi yang hilang, error',
      'runtime potensial (null/undefined), janji yang tidak ditangani async,',
      'guard yang bolong, dan kondisi balapan (race).',
      'Untuk setiap temuan sebutkan: nama file/fungsi, MASALAHNYA, DAMPAKNYA,',
      'dan SARAN PERBAIKAN konkret (potongan kode kalau perlu).',
      'Urutkan dari yang paling berbahaya. Kalau tidak yakin, katakan tidak yakin.',
    ].join('\n'),
  },
  {
    id: 'security',
    label: 'Cyber Security',
    emoji: '🛡️',
    deskripsi: 'Audit keamanan: injection, auth bypass, kredensial bocor.',
    prompt: [
      'PERAN: Auditor Keamanan Siber (defensif, untuk memperbaiki).',
      'Fokus: celah keamanan di kode & sistem yang disediakan -',
      'SQL/command injection, auth bypass, validasi input kurang, rate limit',
      'bolong, kredensial bocor ke log/response, path traversal, XSS/CSP,',
      'role/permission salah, timing attack, data sensitif tanpa enkripsi.',
      'Untuk setiap celah: lokasi, TINGKAT BAHAYA (rendah/sedang/tinggi/kritis),',
      'cara dieksploitasi (ringkas, untuk verifikasi), dan CARA MEMPERBAIKI.',
      'Ini audit DEFENSIF - bantu pemilik menutup celah, bukan menyerang pihak lain.',
    ].join('\n'),
  },
  {
    id: 'exploit',
    label: 'Exploit Ekonomi',
    emoji: '💰',
    deskripsi: 'Cari celah curang: duplikasi reward, bypass limit, eksploitasi game.',
    prompt: [
      'PERAN: Penguji Ekonomi & Anti-Cheat.',
      'Fokus: cara pemain bisa CURANG di sistem ekonomi game NEXO -',
      'duplikasi reward (double payout), bypass limit harian, race condition',
      'saat klaim, eksploitasi refund, item/poin gratis tanpa hak, manipulasi',
      'taruhan, celah pada redeem/promo/premium.',
      'Untuk setiap celah: LANGKAH pemain mengeksploitasinya (urut), DAMPAK',
      'ekonomi (perkiraan), dan CARA MENUTUP celahnya.',
      'Dasarkan pada KODE yang ada, bukan dugaan. Kalau butuh data tambahan, sebutkan.',
    ].join('\n'),
  },
  {
    id: 'analyst',
    label: 'System Analyst',
    emoji: '⚙️',
    deskripsi: 'Arsitektur, performa, query boros, memory leak, modularitas.',
    prompt: [
      'PERAN: System Analyst senior.',
      'Fokus: arsitektur & performa - query database boros/N+1, memory leak,',
      'loop tak efisien, struktur kode berbelit/duplikat, file kepanjangan,',
      'ketergantungan melingkar, error handling kurang, modularitas.',
      'Untuk setiap temuan: bagian mana, KENAPA masalah, DAMPAK (performa/',
      'perawatan), dan SARAN refactor konkret.',
      'Utamakan yang berdampak paling besar.',
    ].join('\n'),
  },
];

/** Ambil definisi peran berdasarkan id; fallback ke 'umum'. */
export function ambilPeran(id) {
  return PERAN.find((p) => p.id === id) || PERAN[0];
}

/** Daftar peran ringkas untuk UI (tanpa prompt). */
export function daftarPeran() {
  return PERAN.map((p) => ({ id: p.id, label: p.label, emoji: p.emoji, deskripsi: p.deskripsi }));
}

/**
 * Pintasan khusus per peran. Dipakai tombol cepat di mode analisis saat peran
 * bukan 'umum'. Mengembalikan array { id, label, tanya }.
 */
export function pintasanPeran(peranId) {
  const peta = {
    bug: [
      { id: 'bug-race', label: 'Cari race condition', tanya: 'Telusuri kode base untuk mencari RACE CONDITION (dua proses/aksi yang bisa bentrok, khususnya saat klaim reward, simpan state, atau update database). Sebutkan lokasi, dampak, dan perbaikan.' },
      { id: 'bug-null', label: 'Error null/undefined', tanya: 'Cari tempat di kode base yang berpotensi error null/undefined (properti diakses tanpa cek, async tanpa guard). Urutkan dari yang paling mungkin terjadi.' },
      { id: 'bug-dead', label: 'Dead code & sisa', tanya: 'Cari dead code, fungsi tak terpakai, variable menganggur, dan import yang tidak dipakai di kode base. Sebutkan file dan fungsi.' },
      { id: 'bug-async', label: 'Async tanpa await', tanya: 'Cari pemanggilan async yang tidak menunggu (await hilang) atau promise yang tidak ditangani, yang bisa membuat state tidak ter-update. Sebutkan lokasi & dampak.' },
    ],
    security: [
      { id: 'sec-inject', label: 'Injection', tanya: 'Audit kode base untuk keamanan SQL/command injection. Cek semua query & pemakaian input pengguna. Sebutkan lokasi, bahaya, dan perbaikan.' },
      { id: 'sec-auth', label: 'Auth & izin', tanya: 'Audit mekanisme autentikasi & otorisasi di kode base: apakah ada endpoint/aksi yang bisa diakses tanpa hak, rate limit bolong, atau validasi sesi lemah? Sebutkan lokasi & perbaikan.' },
      { id: 'sec-secret', label: 'Kredensial bocor', tanya: 'Cari kemungkinan kredensial/rahasia yang bocor: tercatat di log, dikirim ke response, atau disimpan polos. Sebutkan lokasi & perbaikan.' },
      { id: 'sec-validasi', label: 'Validasi input', tanya: 'Audit validasi input di kode base. Mana endpoint/aksi yang menerima input tanpa sanitasi yang cukup? Sebutkan lokasi, bahaya, dan perbaikan.' },
    ],
    exploit: [
      { id: 'exp-duplikat', label: 'Duplikasi reward', tanya: 'Cari kemungkinan DUPLIKASI REWARD di kode base (reward yang bisa diklaim/dibayar lebih dari sekali karena urutan operasi yang salah). Sebutkan langkah eksploitasi & cara menutupnya.' },
      { id: 'exp-bypass', label: 'Bypass limit', tanya: 'Cari cara pemain bisa MELEWATI batas harian/limit poin atau taruhan di kode base. Sebutkan langkah & perbaikannya.' },
      { id: 'exp-refund', label: 'Eksploitasi refund', tanya: 'Cari celah pada logika refund/taruhan (mis. refund dobel, item kembali tetapi poin juga kembali). Sebutkan lokasi & perbaikan.' },
      { id: 'exp-redeem', label: 'Celah redeem/promo', tanya: 'Cari celah pada sistem redeem dan promo: klaim melebihi kuota, satu kode dipakai berkali-kali, atau reservasi tidak atomik. Sebutkan lokasi & perbaikan.' },
    ],
    analyst: [
      { id: 'ana-query', label: 'Query boros', tanya: 'Cari query database yang boros atau pola N+1 di kode base. Sebutkan lokasi, dampak performa, dan cara optimasi.' },
      { id: 'ana-memory', label: 'Memory leak', tanya: 'Cari potensi MEMORY LEAK di kode base (listener/interval/setTimeout yang tidak dibersihkan, map yang terus tumbuh, cache tanpa batas). Sebutkan lokasi & perbaikan.' },
      { id: 'ana-modular', label: 'Struktur berbelit', tanya: 'Nilai struktur kode base: file kepanjangan, fungsi berbelit, duplikasi, ketergantungan melingkar. Beri rencana refactor modular yang konkret.' },
      { id: 'ana-error', label: 'Error handling', tanya: 'Audit error handling di kode base: tempat yang menelan error senyap, catch kosong, atau kegagalan yang tidak dilaporkan. Sebutkan lokasi & perbaikan.' },
    ],
  };
  return peta[peranId] || [];
}
