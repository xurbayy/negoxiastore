// Nama resmi + emoji per game_type (history/monitor). Sumber: daftar game
// publik Games.jsx (sama dengan bot). betaGames TIDAK di sini - namanya
// diambil dinamis dari payload snapshot bot (beta bisa nambah tanpa deploy).
// { name, emoji, fb } - fb = fallback kalau emoji utama belum ada di registry.
export const GAME_META = {
  coinflip: { name: 'Coin Flip', emoji: 'coin_flip', fb: 'coin' },
  guess: { name: 'Number Guess', emoji: 'Numbers', fb: 'numwar' },
  hangman: { name: 'Hangman', emoji: 'blob_hang', fb: 'knot' },
  math: { name: 'Math Quiz', emoji: 'cerebralassassin', fb: 'brain' },
  memory: { name: 'Memory Match', emoji: 'brain_shrink36~1', fb: 'Nos_Rubikcube' },
  riddle: { name: 'Fun Riddle', emoji: 'Nos_Rubikcube', fb: 'puzzle' },
  rpg: { name: 'RPG Battle', emoji: 'roleiconpirate87', fb: 'rpg' },
  slot: { name: 'Slot Machine', emoji: 'sanic_slot_eyes1', fb: 'slot' },
  trivia: { name: 'Trivia Challenge', emoji: 'nequestion', fb: 'question' },
  word: { name: 'Word Builder', emoji: 'word1002', fb: 'word' },
  blackjack: { name: 'Blackjack', emoji: 'poker_cards', fb: 'blackjack' },
  autochess: { name: 'Auto Chess', emoji: 'Chess99', fb: 'autochess' },
  monopoly: { name: 'Monopoly NEXO', emoji: 'jail25', fb: 'monopoly' },
  musicalchairs: { name: 'Musical Chairs', emoji: 'a_ZEM_stim_chair_spin', fb: 'chair' },
  numwar: { name: 'Number War', emoji: 'Numbers', fb: 'numwar' },
  quickdraw: { name: 'Quick Draw', emoji: 'wumpuscoding65', fb: 'quickdraw' },
  racing: { name: 'Racing', emoji: 'chopper60', fb: 'racing' },
  rps: { name: 'Rock Paper Scissors', emoji: 'op_fist_luffy', fb: 'rps' },
  russianroulette: { name: 'Russian Roulette', emoji: 'gun~1', fb: 'rr' },
  snakeladder: { name: 'Snakes & Ladders', emoji: 'worm_dance', fb: 'sl' },
  bombsquad: { name: 'Bomb Squad', emoji: 'Bomb', fb: 'bombsquad' },
  bossraid: { name: 'Boss Raid', emoji: 'boss', fb: 'bossraid' },
  dungeoncrawler: { name: 'Dungeon Crawler', emoji: 'icon_chaos_dungeon', fb: 'dungeon' },
  dungeon: { name: 'Dungeon Crawler', emoji: 'icon_chaos_dungeon', fb: 'dungeon' },
  heist: { name: 'Bank Heist', emoji: 'Trophy_thief', fb: 'heist' },
  zombiesurvival: { name: 'Zombie Survival', emoji: 'Zombies', fb: 'zombie' },
};
