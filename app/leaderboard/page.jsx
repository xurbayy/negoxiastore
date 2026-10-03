import { getLatestSnapshot, stripEmojiToken } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import { emojiSrc } from '../lib/emojis';
import { fmtRingkas, fmtPenuh } from '../lib/formatClient';
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
  // LEADERBOARD LANGSUNG DARI DB BOT (2026-10-03): sejak satu database
  // (Supabase), data dibaca langsung dari public.users - tidak menunggu push
  // bot. Fallback ke snapshot kalau query DB gagal.
  const { getLiveLeaderboard, getLiveGuildBoard, getLivePremiumIds } = await import('../lib/snapshot');
  const [livePlayers, liveGuilds, livePremium] = await Promise.all([
    getLiveLeaderboard(10),
    getLiveGuildBoard(10),
    getLivePremiumIds(),
  ]);
  const snap = livePlayers.length ? null : await getLatestSnapshot();
  const players = livePlayers.length ? livePlayers : (snap?.leaderboard || []);
  const guilds = liveGuilds.length ? liveGuilds : (snap?.guildBoard || []);
  // Pemegang NEXO Pass aktif -> badge logo di ujung nama pemain.
  const premiumIds = livePremium.length
    ? livePremium
    : (snap?.premiumMembers || []).map((m) => String(m.userId));

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
          {/* Peringatan "Bot belum mengirim data" DIHAPUS (2026-10-03):
              leaderboard sekarang dibaca LANGSUNG dari database (Supabase),
              jadi tidak lagi bergantung pada bot mengirim/push data.
              Kalau memang belum ada pemain, tabel menampilkan "Belum ada data". */}

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
                      <td className="px-4 py-3 text-right" title={fmtPenuh(g.points)}>{fmtRingkas(g.points)}</td>
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
