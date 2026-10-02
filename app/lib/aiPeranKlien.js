// ==========================================
// app/lib/aiPeranKlien.js -> Peran AI untuk KLIEN (fallback)
// ==========================================
//
// Salinan RINGKAS definisi peran dari app/lib/aiPeran.js (server) supaya panel
// tetap punya tombol & pintasan peran walau server belum mengirim daftarnya
// (mis. GET /ai gagal / versi server lama). Prompt LENGKAP tetap dari server;
// yang di sini hanya label + pintasan untuk UI.
//
// Modular: tambah peran cukup tambah objek di sini + di aiPeran.js.

export const PERAN_KLIEN = [
  { id: 'umum', label: 'Analis Umum', deskripsi: 'Analisis data NEXO biasa.' },
  { id: 'bug', label: 'Bug Hunter', deskripsi: 'Cari bug, race condition, dead code.' },
  { id: 'security', label: 'Cyber Security', deskripsi: 'Audit keamanan: injection, auth, kredensial.' },
  { id: 'exploit', label: 'Exploit Ekonomi', deskripsi: 'Cari celah curang & duplikasi reward.' },
  { id: 'analyst', label: 'System Analyst', deskripsi: 'Arsitektur, performa, modularitas.' },
];

// Pintasan khusus per peran (label saja). tanya = teks yang dikirim ke server.
export const PINTASAN_PERAN_KLIEN = {
  bug: [
    { id: 'bug-race', label: 'Cari race condition', tanya: 'Telusuri kode base untuk mencari RACE CONDITION (dua proses/aksi yang bisa bentrok, khususnya saat klaim reward, simpan state, atau update database). Sebutkan lokasi, dampak, dan perbaikan.' },
    { id: 'bug-null', label: 'Error null/undefined', tanya: 'Cari tempat di kode base yang berpotensi error null/undefined (properti diakses tanpa cek, async tanpa guard). Urutkan dari yang paling mungkin terjadi.' },
    { id: 'bug-dead', label: 'Dead code & sisa', tanya: 'Cari dead code, fungsi tak terpakai, variabel menganggur, dan import yang tidak dipakai di kode base. Sebutkan file dan fungsi.' },
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

/** Daftar peran untuk UI (fallback kalau server tak kirim). */
export function daftarPeranKlien() {
  return PERAN_KLIEN;
}

/** Pintasan per peran (fallback). */
export function pintasanPeranKlien(peranId) {
  return PINTASAN_PERAN_KLIEN[peranId] || [];
}
