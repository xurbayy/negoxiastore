import { getLatestSnapshot } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';
import LeaderboardClient from '../leaderboard/LeaderboardClient';
import GuildSection from '../leaderboard/GuildSection';

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

          {/* Pemain -> Guild. Baris pemain bisa diklik (kartu profil + PP
              fresh); baris GUILD juga bisa diklik (detail: owner, admin,
              member + poin masing-masing) dan punya tombol share canvas.
              Keduanya client component; data tetap dirender dari server. */}
          <LeaderboardClient players={players} myId={myId} loggedIn={Boolean(session)} premiumIds={premiumIds} />

          <GuildSection guilds={guilds} loggedIn={Boolean(session)} />
        </div>
      </main>
      <Footer />
    </>
  );
}
