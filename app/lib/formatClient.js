// Helper format versi client (tanpa import db).
export function fmt(n) {
  if (n === null || n === undefined) return '-';
  return Number(n).toLocaleString('id-ID');
}

/**
 * Format angka RINGKAS - dipakai di SEMUA tampilan angka pemain di web.
 *
 * KENAPA: angka poin bisa panjang (ratusan juta / miliaran). Di kartu & sel grid
 * yang sempit, angka penuh jadi terpotong "10.000.000…" sehingga pemain tidak
 * tahu angka aslinya. Versi ringkas ini selalu muat dan tetap jujur.
 *
 * ATURAN (singkatan - hemat ruang, dipakai juga di kartu share gambar):
 *   < 10.000         -> angka apa adanya        (7.500)
 *   >= 10.000        -> "12,5 rb"               (12.500)
 *   >= 1.000.000     -> "1,2 jt"                (1.234.567)
 *   >= 1.000.000.000 -> "1,2 m"                 (1.234.567.890)
 *   >= 1e12          -> "1,2 t"
 *
 * MAKSIMAL 1 desimal supaya lebarnya bisa diprediksi, koma sebagai desimal
 * (id-ID). Nilai penuh tetap bisa dilihat lewat tooltip (fmtPenuh).
 *
 * CATATAN PENTING: ini HANYA untuk tampilan. Jangan pakai hasilnya untuk
 * perhitungan atau pengiriman ke API - selalu kirim angka mentahnya.
 */
export function fmtRingkas(n) {
  if (n === null || n === undefined) return '-';
  const num = Number(n);
  if (!Number.isFinite(num)) return '-';

  // -0 dan 0 diperlakukan sama ("-0" membingungkan).
  if (num === 0) return '0';

  const abs = Math.abs(num);
  const tanda = num < 0 ? '-' : '';

  // Susun satuan dari besar ke kecil; 1 desimal, buang ",0" yang mubazir.
  // PENTING: kalau hasil pembulatan menyentuh 1000 (mis. 999.999.999 -> "1000,0"
  // pada satuan juta), NAIKKAN ke satuan berikutnya. Tanpa ini hasilnya
  // "1.000 jt" - titik ribuan itu terbaca seperti "seribu juta" dan menyesatkan.
  const satuans = [
    { batas: 1e12, bagi: 1e12, label: '\u00A0t' },
    { batas: 1e9, bagi: 1e9, label: '\u00A0m' },
    { batas: 1e6, bagi: 1e6, label: '\u00A0jt' },
    { batas: 1e4, bagi: 1e3, label: '\u00A0rb' },
  ];
  for (let i = 0; i < satuans.length; i++) {
    const s = satuans[i];
    if (abs < s.batas) continue;
    const v = abs / s.bagi;
    // Cek apakah pembulatan 1 desimal akan mencapai 1000.
    if (v >= 999.95) {
      const naik = satuans[i - 1]; // satuan yang lebih besar (ada karena i>0 saat v>=999.95)
      if (naik) {
        const vn = abs / naik.bagi;
        const tn = vn.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
        return `${tanda}${tn}${naik.label}`;
      }
      // Satuan TERBESAR (t) dan sudah >= 1000: jangan pakai pemisah ribuan
      // ("1.000 t" terbaca ambigu). Pakai bentuk polos.
      return `${tanda}${Math.round(v)}${s.label}`;
    }
    const teks = v.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    return `${tanda}${teks}${s.label}`;
  }
  return fmt(num);
}

/**
 * Angka penuh bertitik untuk tooltip (title) - supaya pemain yang mau tahu
 * nilai persisnya tetap bisa lihat. Pakai di atribut title elemen yang
 * menampilkan fmtRingkas().
 */
export function fmtPenuh(n) {
  if (n === null || n === undefined) return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return `${fmt(num)} poin`;
}

export function fmtUptime(sec) {
  if (!sec && sec !== 0) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Waktu relatif "x lalu".
// Dulu ada 4 salinan fungsi ini (di sini, lib/snapshot.js, dan masing-masing di
// halaman bank/leaderboard/shop) dengan perilaku BERBEDA - dua versi berhenti di
// satuan jam sehingga umur >24 jam tampil "30 jam lalu". Sekarang SATU versi
// saja yang sudah menangani hari.
export function timeAgo(ts) {
  if (!ts) return 'belum pernah';
  const diff = Date.now() - ts;
  if (diff < 0) return 'baru saja';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} detik lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

// SATU-SATUNYA sumber nama game untuk web (kanonik).
// Dulu ada 3 salinan daftar ini (file ini, components/MeClient.jsx, dan
// lib/snapshot.js) dan isinya BERBEDA - snapshot.js masih memakai nama lama
// ("Riddle", "Math Challenge", "RPG Dungeon", "Heist", "Snake & Ladder")
// sehingga nama game bisa tampil beda antar halaman. Sekarang semua halaman
// memakai daftar ini. Pakai nama dari rename pass 2 (Title Case).
const GAME_NAMES = {
  coinflip: 'Coinflip', guess: 'Number Guess', hangman: 'Hangman', math: 'Math Quiz',
  memory: 'Memory Match', riddle: 'Fun Riddle', rpg: 'RPG Battle', slot: 'Slot Machine',
  trivia: 'Trivia Challenge', word: 'Word Builder', autochess: 'Autochess', blackjack: 'Blackjack',
  guildwar: 'Guild War', monopoly: 'Monopoly', musicalchairs: 'Musical Chairs',
  numwar: 'Number War', quickdraw: 'Quickdraw', racing: 'Racing', rps: 'Rock Paper Scissors',
  russianroulette: 'Russian Roulette', snakeladder: 'Snakes & Ladders', bombsquad: 'Bomb Squad',
  bossraid: 'Boss Raid', dungeoncrawler: 'Dungeon Crawler', heist: 'Bank Heist',
  zombiesurvival: 'Zombie Survival',
  // Alias nama lama / varian gameType dari bot, supaya tetap terbaca benar.
  dungeon: 'Dungeon Crawler', zombie: 'Zombie Survival', rr: 'Russian Roulette',
  autochest: 'Autochess', snake: 'Snakes & Ladders', snakeandladder: 'Snakes & Ladders',
};

export function gameName(key) {
  const k = String(key || '').toLowerCase();
  return GAME_NAMES[k] || key || '-';
}

/**
 * Nama plan order untuk TAMPILAN.
 * Order lama tersimpan sebagai 'nexo_pass_monthly' (nilai DB), order baru
 * 'NEXO Pass'. Ditampilkan seragam supaya admin tidak melihat dua ejaan
 * berbeda untuk produk yang sama. Nilai di DB TIDAK diubah (data historis
 * aman) - hanya terjemahan saat dirender.
 */
export function planName(plan) {
  const p = String(plan || '').trim();
  if (!p) return '-';
  if (/^nexo[ _]?pass/i.test(p)) return 'NEXO Pass';
  return p;
}
