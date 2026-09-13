import Reveal from './Reveal';
import { emojiSrc } from '../lib/emojis';

// Semua game nyata dari repo bot. `emoji` = emoji resmi terbaru di server
// Discord; `fb` = fallback dari web-emojis.json saat yang baru belum ada.
const GAME_GROUPS = [
  {
    id: 'solo',
    title: 'Solo Games',
    desc: 'Ngejar high score sendiri, kumpulin poin dari coinflip sampai tebak-tebakan.',
    games: [
      { name: 'Coin Flip', cmd: 'np coinflip', alias: 'cf, coin', emoji: 'coin_flip', fb: 'coin' },
      { name: 'Number Guess', cmd: 'np guess', alias: 'g, tebak', emoji: 'Numbers', fb: 'numwar' },
      { name: 'Hangman', cmd: 'np hangman', alias: '', emoji: 'blob_hang', fb: 'knot' },
      { name: 'Math Quiz', cmd: 'np math', alias: '', emoji: 'cerebralassassin', fb: 'brain' },
      { name: 'Memory Match', cmd: 'np memory', alias: '', emoji: 'brain_shrink36~1', fb: 'Nos_Rubikcube' },
      { name: 'Fun Riddle', cmd: 'np riddle', alias: '', emoji: 'Nos_Rubikcube', fb: 'puzzle' },
      { name: 'RPG Battle', cmd: 'np rpg', alias: '', emoji: 'roleiconpirate87', fb: 'rpg' },
      { name: 'Slot Machine', cmd: 'np slot', alias: 's, sc, jackpot', emoji: 'sanic_slot_eyes1', fb: 'slot' },
      { name: 'Trivia Challenge', cmd: 'np trivia', alias: 'tr, kuis', emoji: 'nequestion', fb: 'question' },
      { name: 'Word Builder', cmd: 'np word', alias: 'w, kata', emoji: 'word1002', fb: 'word' },
    ],
  },
  {
    id: 'multiplayer',
    title: 'Multiplayer PvP',
    desc: 'Tantang teman dengan taruhan poin. Yang menang bawa pulang semuanya.',
    games: [
      { name: 'Blackjack', cmd: 'nb blackjack', alias: 'bj, 21', emoji: 'poker_cards', fb: 'blackjack' },
      { name: 'Auto Chess', cmd: 'nb autochess', alias: 'ac', emoji: 'Chess99', fb: 'autochess' },
      { name: 'Monopoly NEXO', cmd: 'nb monopoly', alias: 'mono, mp, monopoli', emoji: 'jail25', fb: 'monopoly' },
      { name: 'Musical Chairs', cmd: 'nb musicalchairs', alias: 'mc, kursi', emoji: 'a_ZEM_stim_chair_spin', fb: 'chair' },
      { name: 'Number War', cmd: 'nb numwar', alias: 'nw', emoji: 'Numbers', fb: 'numwar' },
      { name: 'Quick Draw', cmd: 'nb quickdraw', alias: '', emoji: 'wumpuscoding65', fb: 'quickdraw' },
      { name: 'Racing', cmd: 'nb racing', alias: '', emoji: 'chopper60', fb: 'racing' },
      { name: 'Rock Paper Scissors', cmd: 'nb rps', alias: '', emoji: 'op_fist_luffy', fb: 'rps' },
      { name: 'Russian Roulette', cmd: 'nb russianroulette', alias: 'rr, roulette', emoji: 'gun~1', fb: 'rr' },
      { name: 'Snakes & Ladders', cmd: 'nb snakeladder', alias: 'sl, snl, ular', emoji: 'worm_dance', fb: 'sl' },
    ],
  },
  {
    id: 'coop',
    title: 'Co-op Missions',
    desc: 'Rame-rame lawan bos dan selamatkan tim dari bencana.',
    games: [
      { name: 'Bomb Squad', cmd: 'nc bombsquad', alias: 'bomb, defuse, ktane', emoji: 'Bomb', fb: 'bombsquad' },
      { name: 'Boss Raid', cmd: 'nc bossraid', alias: 'raid, boss, team', emoji: 'boss', fb: 'bossraid' },
      { name: 'Dungeon Crawler', cmd: 'nc dungeoncrawler', alias: 'dungeon, crawl, maze', emoji: 'icon_chaos_dungeon', fb: 'dungeon' },
      { name: 'Bank Heist', cmd: 'nc heist', alias: 'bank, rob, robbery', emoji: 'Trophy_thief', fb: 'heist' },
      { name: 'Zombie Survival', cmd: 'nc zombiesurvival', alias: 'zombie, survival, defense', emoji: 'Zombies', fb: 'zombie' },
    ],
  },
];

// Emoji group: coba nama terbaru dulu, fallback ke emoji resmi existing.
const GROUP_EMOJI = {
  solo: { emoji: 'game', fb: 'controller' },
  multiplayer: { emoji: 'loadingbox', fb: 'mp' },
  coop: { emoji: '399536hd2hellvictory', fb: 'coop' },
};

function groupIcon(id) {
  const { emoji, fb } = GROUP_EMOJI[id];
  return emojiSrc(emoji) || emojiSrc(fb);
}

export default function Games() {
  return (
    <section id="games" className="relative scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-ink md:text-4xl">
            25+ Game Seru.
          </h2>
          <div className="accent-bar mx-auto mt-4" aria-hidden="true" />
          <p className="mx-auto mt-4 max-w-2xl text-ink-muted">
            Mulai dari santai sampai kompetitif. Semua game punya visual canvas animasi
            dan sistem poin yang tersimpan otomatis.
          </p>
        </Reveal>

        {GAME_GROUPS.map((group) => (
          <Reveal key={group.id} className="mt-14">
            <div className="mb-6 flex items-center gap-3">
              {groupIcon(group.id) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={groupIcon(group.id)} alt="" width={30} height={30} className="h-[30px] w-[30px]" />
              )}
              <div>
                <h3 className="font-display text-xl text-ink">{group.title}</h3>
                <p className="text-sm text-ink-muted">{group.desc}</p>
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.games.map((g) => {
                const icon = emojiSrc(g.emoji) || emojiSrc(g.fb);
                return (
                  <li key={g.cmd} className="nx-card flex items-center gap-3 px-4 py-3.5">
                    {icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon} alt="" width={26} height={26} loading="lazy" className="h-[26px] w-[26px] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{g.name}</div>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs text-accent-hover">{g.cmd}</code>
                        {g.alias && <span className="truncate text-[0.65rem] text-[#A99C8E]">({g.alias})</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
