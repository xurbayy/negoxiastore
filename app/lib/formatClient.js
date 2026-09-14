// Helper format versi client (tanpa import db).
export function fmt(n) {
  if (n === null || n === undefined) return '-';
  return Number(n).toLocaleString('id-ID');
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
