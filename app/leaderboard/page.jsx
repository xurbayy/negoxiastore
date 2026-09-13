import { getLatestSnapshot, stripEmojiToken } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import { emojiSrc } from '../lib/emojis';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';

export const metadata = {
  title: 'Leaderboard',
  description:
    'Leaderboard NEXO Games: top 10 pemain dengan poin tertinggi, guild terkuat, dan para terkaya di ekonomi NEXO. Data live dari bot.',
  alternates: { canonical: '/leaderboard' },
};

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const snap = await getLatestSnapshot();
  const players = snap?.leaderboard || [];
  const guilds = snap?.guildBoard || [];
  const richest = snap?.monitor?.richest || [];

  // Highlight baris milik user yang sedang login (bandingkan via userId).
  const myId = session?.discordId || null;
  const isMe = (id) => myId && String(id) === myId;
  const rowMe = "bg-accent/15 border-l-4 border-l-accent";

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <AutoRefresh />
      <main className="relative mx-auto max-w-4xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <div className="relative">
          <h1 className="mt-3 font-display text-3xl text-ink md:text-4xl">
            Leaderboard <span className="font-display text-ink">NEXO</span>
          </h1>
          {snap ? (
            <p className="mt-2 text-sm text-ink-muted">
              Diperbarui {timeAgo(snap.ts)} · data live dari bot
            </p>
          ) : (
            <p className="mt-2 text-sm text-danger">
              ⚠ Bot belum mengirim data. Leaderboard akan muncul setelah bot online.
            </p>
          )}

          {/* Pemain */}
          <section className="mt-10" aria-labelledby="lb-pemain">
            <h2 id="lb-pemain" className="font-display text-xl text-ink">
            {emojiSrc('trophy') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emojiSrc('trophy')} alt="" width={20} height={20} className="mr-2 inline h-5 w-5 align-middle" />
            )}Top 10 Pemain
          </h2>
            <div className="nx-card mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
                    <th scope="col" className="px-4 py-3">#</th>
                    <th scope="col" className="px-4 py-3">Pemain</th>
                    <th scope="col" className="px-4 py-3 text-right">Poin</th>
                    <th scope="col" className="px-4 py-3 text-right">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {players.length === 0 && (
                    <tr><td colSpan="4" className="px-4 py-6 text-center text-ink-muted">Belum ada data.</td></tr>
                  )}
                  {players.map((p) => (
                    <tr
                      key={p.userId}
                      className={`border-b border-border-soft/60 last:border-0 ${isMe(p.userId) ? rowMe : 'hover:bg-card-cream/60'}`}
                    >
                      <td className="px-4 py-3 font-display text-ink">
                        {Number(p.rank) === 1 && emojiSrc('crown') && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc('crown')} alt="" width={18} height={18} className="mr-1 inline h-4 w-4 align-middle" />
                      )}
                      {Number(p.rank) > 1 && Number(p.rank) <= 3 && emojiSrc('medal') && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc('medal')} alt="" width={16} height={16} className="mr-1 inline h-4 w-4 align-middle" />
                      )}
                        {p.rank}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">
                        {p.username}
                        {isMe(p.userId) && (
                          <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Kamu</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {emojiSrc('goldcoin') && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={emojiSrc('goldcoin')} alt="" width={16} height={16} className="inline h-4 w-4" />
                          )}
                          {Number(p.points).toLocaleString('id-ID')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-muted">{p.level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Guild */}
          <section className="mt-12" aria-labelledby="lb-guild">
            <h2 id="lb-guild" className="font-display text-xl text-ink">
            {emojiSrc('castle') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emojiSrc('castle')} alt="" width={20} height={20} className="mr-2 inline h-5 w-5 align-middle" />
            )}Guild Terkuat
          </h2>
            <div className="nx-card mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
                    <th scope="col" className="px-4 py-3">#</th>
                    <th scope="col" className="px-4 py-3">Guild</th>
                    <th scope="col" className="px-4 py-3 text-right">Total Poin</th>
                    <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">War Wins</th>
                    <th scope="col" className="px-4 py-3 text-right">Member</th>
                  </tr>
                </thead>
                <tbody>
                  {guilds.length === 0 && (
                    <tr><td colSpan="5" className="px-4 py-6 text-center text-ink-muted">Belum ada guild terdaftar.</td></tr>
                  )}
                  {guilds.map((g) => (
                    <tr key={g.rank + g.name} className="border-b border-border-soft/60 last:border-0 hover:bg-card-cream/60">
                      <td className="px-4 py-3 font-display text-ink">{g.rank}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{stripEmojiToken(g.name)}</td>
                      <td className="px-4 py-3 text-right">{Number(g.points).toLocaleString('id-ID')}</td>
                      <td className="hidden px-4 py-3 text-right text-ink-muted sm:table-cell">{g.warWins}</td>
                      <td className="px-4 py-3 text-right text-ink-muted">{g.members}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Terkaya */}
          <section className="mt-12" aria-labelledby="lb-kaya">
            <h2 id="lb-kaya" className="font-display text-xl text-ink">
            {emojiSrc('diamond') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emojiSrc('diamond')} alt="" width={20} height={20} className="mr-2 inline h-5 w-5 align-middle" />
            )}Para Terkaya
          </h2>
            <div className="nx-card mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
                    <th scope="col" className="px-4 py-3">#</th>
                    <th scope="col" className="px-4 py-3">Pemain</th>
                    <th scope="col" className="px-4 py-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {richest.length === 0 && (
                    <tr><td colSpan="3" className="px-4 py-6 text-center text-ink-muted">Belum ada data.</td></tr>
                  )}
                  {richest.map((r, i) => (
                    <tr
                      key={r.userId}
                      className={`border-b border-border-soft/60 last:border-0 ${isMe(r.userId) ? rowMe : 'hover:bg-card-cream/60'}`}
                    >
                      <td className="px-4 py-3 font-display text-ink">
                        {Number(i + 1) === 1 && emojiSrc('crown') && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc('crown')} alt="" width={18} height={18} className="mr-1 inline h-4 w-4 align-middle" />
                      )}
                      {Number(i + 1) > 1 && Number(i + 1) <= 3 && emojiSrc('medal') && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc('medal')} alt="" width={16} height={16} className="mr-1 inline h-4 w-4 align-middle" />
                      )}
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">
                        {r.username}
                        {isMe(r.userId) && (
                          <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Kamu</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {emojiSrc('goldcoin') && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={emojiSrc('goldcoin')} alt="" width={16} height={16} className="inline h-4 w-4" />
                          )}
                          {Number(r.points).toLocaleString('id-ID')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 0) return 'baru saja';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} detik lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  return `${Math.floor(m / 60)} jam lalu`;
}
