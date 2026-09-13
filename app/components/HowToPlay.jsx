import Reveal from './Reveal';

const STEPS = [
  {
    num: '01',
    title: 'Invite NEXO Games',
    desc: 'Klik tombol "Tambahkan ke Discord", pilih server kamu, selesai. Bot butuh izin kirim pesan, embed, dan lampiran untuk render visual game.',
    code: null,
  },
  {
    num: '02',
    title: 'Daftar & Klaim Daily',
    desc: 'Ketik nxme untuk membuat profil, lalu nxdaily tiap hari untuk poin gratis. Streak harian bikin bonus makin besar.',
    code: 'nxdaily',
  },
  {
    num: '03',
    title: 'Main Game Favoritmu',
    desc: 'np untuk solo, nb untuk PvP betting, nc untuk co-op mission. Contoh: np slot, nb autochess, nc bossraid.',
    code: 'np slot',
  },
  {
    num: '04',
    title: 'Naik Rank, Bangun Guild',
    desc: 'Kumpulkan poin, belanja di nxshop, buat guild lewat nxguild, dan taklukkan leaderboard nxlb.',
    code: 'nxlb',
  },
];

export default function HowToPlay() {
  return (
    <section id="cara-main" className="relative scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-ink md:text-4xl">
            Cara Main.
          </h2>
          <div className="accent-bar mx-auto mt-4" aria-hidden="true" />
        </Reveal>

        <ol className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.num} delay={i * 90} as="li">
              <div className="nx-card relative h-full overflow-hidden px-6 py-6">
                <span className="font-display absolute -right-2 -top-4 text-6xl text-accent/15" aria-hidden="true">
                  {s.num}
                </span>
                <h3 className="font-display text-lg text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.desc}</p>
                {s.code && (
                  <code className="mt-4 inline-block rounded-lg border border-accent/40 bg-accent/15 px-3 py-1.5 font-mono text-sm text-ink">
                    {s.code}
                  </code>
                )}
              </div>
            </Reveal>
          ))}
        </ol>

        {/* Prefix table */}
        <Reveal className="mt-10">
          <div className="nx-card overflow-hidden">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Daftar prefix perintah NEXO Games</caption>
              <thead>
                <tr className="border-b border-border-soft bg-card-cream text-xs uppercase tracking-wider text-ink-muted">
                  <th scope="col" className="px-5 py-3">Prefix</th>
                  <th scope="col" className="px-5 py-3">Fungsi</th>
                  <th scope="col" className="hidden px-5 py-3 sm:table-cell">Contoh</th>
                </tr>
              </thead>
              <tbody className="text-ink-muted">
                {[
                  ['nx', 'Ekonomi, profil, shop, guild, leaderboard', 'nxdaily · nxshop · nxlb'],
                  ['np', 'Main game solo', 'np slot · np riddle'],
                  ['nb', 'Main game multiplayer / betting', 'nb autochess · nb rps'],
                  ['nc', 'Main game co-op bareng tim', 'nc bossraid · nc heist'],
                  ['nxadmin', 'Panel admin server (khusus admin)', 'nxadmin add'],
                ].map(([p, f, e]) => (
                  <tr key={p} className="border-b border-border-soft/60 last:border-0 hover:bg-card-cream/60">
                    <td className="px-5 py-3.5">
                      <code className="rounded bg-accent/15 px-2 py-1 font-mono text-ink">{p}</code>
                    </td>
                    <td className="px-5 py-3.5">{f}</td>
                    <td className="hidden px-5 py-3.5 font-mono text-xs sm:table-cell">{e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
