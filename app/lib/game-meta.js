// Nama resmi + emoji per game_type (history/monitor). Sumber: daftar game
// publik Games.jsx (sama dengan bot). betaGames TIDAK di sini - namanya
// diambil dinamis dari payload snapshot bot (beta bisa nambah tanpa deploy).
// { name, emoji, fb } - fb = fallback kalau emoji utama belum ada di registry.
//
// CATATAN emoji (fix 2026-09-14): nama di `emoji` HARUS emoji milik game ini
// sendiri. Sebelumnya `riddle` memakai 'Nos_Rubikcube' yang di registry justru
// milik Memory Match, dan `bombsquad` memakai 'Bomb' yang usage-nya bukan Bomb
// Squad. Karena resolve-nya "coba emoji dulu baru fb", emoji yang SALAH TAPI
// ADA akan tetap dipakai -> ikon game tertukar. Sekarang memakai emoji resmi
// per game dari field `usage` di web-emojis.json.
export const GAME_META = {
  coinflip: { name: 'Coin Flip', emoji: 'coin', fb: 'coin' },
  guess: { name: 'Number Guess', emoji: 'numwar', fb: 'numwar' },
  hangman: { name: 'Hangman', emoji: 'knot', fb: 'knot' },
  math: { name: 'Math Quiz', emoji: 'brain', fb: 'brain' },
  memory: { name: 'Memory Match', emoji: 'Nos_Rubikcube', fb: 'Nos_Rubikcube' },
  riddle: { name: 'Fun Riddle', emoji: 'puzzle', fb: 'puzzle' },
  rpg: { name: 'RPG Battle', emoji: 'rpg', fb: 'rpg' },
  slot: { name: 'Slot Machine', emoji: 'slot', fb: 'slot' },
  trivia: { name: 'Trivia Challenge', emoji: 'question', fb: 'question' },
  word: { name: 'Word Builder', emoji: 'word', fb: 'word' },
  blackjack: { name: 'Blackjack', emoji: 'blackjack', fb: 'blackjack' },
  autochess: { name: 'Auto Chess', emoji: 'autochess', fb: 'autochess' },
  monopoly: { name: 'Monopoly NEXO', emoji: 'monopoly', fb: 'monopoly' },
  musicalchairs: { name: 'Musical Chairs', emoji: 'chair', fb: 'chair' },
  numwar: { name: 'Number War', emoji: 'numwar', fb: 'numwar' },
  quickdraw: { name: 'Quick Draw', emoji: 'quickdraw', fb: 'quickdraw' },
  racing: { name: 'Racing', emoji: 'racing', fb: 'racing' },
  rps: { name: 'Rock Paper Scissors', emoji: 'rps', fb: 'rps' },
  russianroulette: { name: 'Russian Roulette', emoji: 'rr', fb: 'rr' },
  snakeladder: { name: 'Snakes & Ladders', emoji: 'sl', fb: 'sl' },
  bombsquad: { name: 'Bomb Squad', emoji: 'bombsquad', fb: 'bombsquad' },
  bossraid: { name: 'Boss Raid', emoji: 'bossraid', fb: 'bossraid' },
  dungeoncrawler: { name: 'Dungeon Crawler', emoji: 'dungeon', fb: 'dungeon' },
  dungeon: { name: 'Dungeon Crawler', emoji: 'dungeon', fb: 'dungeon' },
  heist: { name: 'Bank Heist', emoji: 'heist', fb: 'heist' },
  zombiesurvival: { name: 'Zombie Survival', emoji: 'zombie', fb: 'zombie' },
};
