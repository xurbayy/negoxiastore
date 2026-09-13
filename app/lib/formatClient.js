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

export function timeAgo(ts) {
  if (!ts) return 'belum pernah';
  const diff = Date.now() - ts;
  if (diff < 0) return 'baru saja';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} detik lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  return `${Math.floor(m / 60)} jam lalu`;
}

export function gameName(key) {
  const NAMES = {
    coinflip: 'Coinflip', guess: 'Number Guess', hangman: 'Hangman', math: 'Math Quiz',
    memory: 'Memory Match', riddle: 'Fun Riddle', rpg: 'RPG Battle', slot: 'Slot Machine',
    trivia: 'Trivia Challenge', word: 'Word Builder', autochess: 'Autochess', blackjack: 'Blackjack',
    guildwar: 'Guild War', monopoly: 'Monopoly', musicalchairs: 'Musical Chairs',
    numwar: 'Number War', quickdraw: 'Quickdraw', racing: 'Racing', rps: 'Rock Paper Scissors',
    russianroulette: 'Russian Roulette', snakeladder: 'Snakes & Ladders', bombsquad: 'Bomb Squad',
    bossraid: 'Boss Raid', dungeoncrawler: 'Dungeon Crawler', heist: 'Bank Heist',
    zombiesurvival: 'Zombie Survival',
  };
  return NAMES[key] || key || '-';
}
