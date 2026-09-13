import Reveal from './Reveal';
import { emojiSrc } from '../lib/emojis';

const FEATURES = [
  {
    emoji: 'goldcoin',
    title: 'Ekonomi Poin Lengkap',
    desc: 'Daily claim, transfer, betting, sampai pinjaman bank dengan bunga. Poin tersimpan aman di database terenkripsi AES-256.',
  },
  {
    emoji: 'bank',
    title: 'Bank & Bunga',
    desc: 'Nabung dapat bunga dan pinjam saat bokek. Hati-hati: telat bayar masuk daftar Bank Watch.',
  },
  {
    emoji: 'castle',
    title: 'Guild & Guild War',
    desc: 'Bangun guild, rekrut member, kumpulkan poin guild, dan taklukkan server lain di Guild War.',
  },
  {
    emoji: 'trophy',
    title: 'Leaderboard Global',
    desc: 'Naik ke puncak ranking poin, winstreak, dan level. Tunjukkan siapa bos di server-mu.',
  },
  {
    emoji: 'keranjang',
    title: 'Shop & Inventori',
    desc: 'Belanja item, koleksi title eksklusif, flash sale berkala. Non-premium kapasitas 5 per item, premium unlimited.',
  },
  {
    emoji: 'misi',
    title: 'Misi Harian',
    desc: 'Misi baru tiap hari dengan reward poin dan item. Bonus kuota ekstra untuk member premium.',
  },
  {
    emoji: '267042fire',
    title: 'Streak & Winstreak',
    desc: 'Rantai kemenangan dan daily streak memberi bonus makin gede. Jangan sampai putus!',
  },
  {
    emoji: 'shield',
    title: 'Aman & Anti-Cheat',
    desc: 'Validasi berlapis, batas aman transaksi, dan database terenkripsi. Data game-mu tidak dijual ke siapa pun.',
  },
];

export default function Features() {
  return (
    <section id="fitur" className="relative scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-ink md:text-4xl">
            Bukan Sekadar Game Bot.
          </h2>
          <div className="accent-bar mx-auto mt-4" aria-hidden="true" />
          <p className="mx-auto mt-4 max-w-2xl text-ink-muted">
            Ekosistem lengkap: ekonomi, sosial, dan kompetisi berjalan otomatis di server Discord kamu.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <article className="nx-card h-full px-6 py-6">
                {emojiSrc(f.emoji) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={emojiSrc(f.emoji)} alt="" width={40} height={40} loading="lazy" className="mb-4 h-10 w-10" />
                )}
                <h3 className="font-display text-lg text-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
