import { getLatestSnapshot, timeAgo } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';
import KomunitasClient from './KomunitasClient';

export const metadata = {
  title: 'Komunitas',
  description:
    'Temukan 100 server Discord NEXO teratas - diurutkan dari pemain terbanyak, game paling sering dimainkan, dan total poin tertinggi. Langsung gabung lewat link invite.',
  alternates: { canonical: '/komunitas' },
};

// Data selalu fresh dari bot (snapshot), jangan di-cache statis.
export const dynamic = 'force-dynamic';

/**
 * Gabungkan data server dari snapshot bot dengan invite permanennya.
 *
 * ATURAN PENTING (kebijakan pemilik): server yang TIDAK punya invite
 * permanen TIDAK ditampilkan. Jadi daftar ini sudah tersaring - setiap
 * server di sini pasti bisa di-join.
 *
 * Bot sudah mengurutkan berdasarkan: pemain -> game -> poin. Web tidak
 * mengurutkan ulang supaya peringkat konsisten dengan yang bot hitung.
 */
function siapkanServer(snap) {
  const daftar = Array.isArray(snap?.servers) ? snap.servers : [];
  const invites = snap?.invites && typeof snap.invites === 'object' ? snap.invites : {};

  return daftar
    .map((s) => {
      const inv = invites[s.guildId];
      if (!inv || !inv.url) return null; // tanpa invite -> tidak ditampilkan
      return {
        guildId: s.guildId,
        name: s.name,
        iconUrl: s.iconUrl || null,
        players: Number(s.players) || 0,
        games: Number(s.games) || 0,
        points: Number(s.points) || 0,
        members: Number(s.members) || 0,
        invite: inv.url,
      };
    })
    .filter(Boolean)
    .slice(0, 100); // maksimal 100 server
}

export default async function KomunitasPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const snap = await getLatestSnapshot();
  const servers = siapkanServer(snap);

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <AutoRefresh />
      <main className="relative mx-auto max-w-4xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />

        <div className="relative">
          <h1 className="mt-3 font-display text-3xl text-ink md:text-4xl">
            Komunitas <span className="font-display text-ink">NEXO</span>
          </h1>

          {snap ? (
            <p className="mt-3 text-xs text-ink-muted">
              Diperbarui {timeAgo(snap.ts)} · data live dari bot
            </p>
          ) : (
            <p className="mt-3 text-xs text-danger">
              ⚠ Bot belum mengirim data. Daftar akan muncul setelah bot online.
            </p>
          )}

          <KomunitasClient servers={servers} />

          {/* Catatan untuk pemilik server */}
          <div className="nx-card mt-10 p-5">
            <h2 className="font-display text-base font-bold text-ink">Punya server sendiri?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Undang bot NEXO ke servermu, dan pastikan izin{' '}
              <strong className="text-ink">Create Instant Invite</strong> aktif supaya servermu
              bisa tampil di halaman ini. Peringkat dihitung otomatis dari aktivitas pemain.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
