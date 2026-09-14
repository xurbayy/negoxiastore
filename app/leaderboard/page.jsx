import { getLatestSnapshot, stripEmojiToken } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import { emojiSrc } from '../lib/emojis';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';
import LeaderboardClient from '../leaderboard/LeaderboardClient';

export const metadata = {
  title: 'Leaderboard',
  description:
    'Leaderboard NEXO Games: top 10 pemain dengan poin tertinggi dan guild terkuat di NEXO. Data live dari bot.',
  alternates: { canonical: '/leaderboard' },
};

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const snap = await getLatestSnapshot();
  const players = snap?.leaderboard || [];
  const guilds = snap?.guildBoard || [];
  // Pemegang NEXO Pass aktif (dari premiumMembers snapshot bot) -> badge logo
  // kecil di ujung nama pemain yang beli pass.
  const premiumIds = (snap?.premiumMembers || []).map((m) => String(m.userId));

  // Highlight baris milik user yang sedang login (bandingkan via userId)
  // - logika isMe pindah ke LeaderboardClient (client component).
  const myId = session?.discordId || null;

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

          {/* Pemain -> Guild (client: baris pemain bisa diklik ->
              kartu profil + PP fresh; guild tetap server component) */}
          <LeaderboardClient players={players} myId={myId} loggedIn={Boolean(session)} premiumIds={premiumIds}>

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
          </LeaderboardClient>
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
