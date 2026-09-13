import Navbar from '../components/Navbar';
import { getSession } from '../lib/session';
import { getLatestSnapshot, userHasPremium } from '../lib/snapshot';
import Footer from '../components/Footer';
import MeClient from '../components/MeClient';

export const metadata = {
  title: 'Profil Saya',
  description: 'Profil NEXO Games kamu: poin, level, streak, inventori, misi harian, dan riwayat game. Login dengan Discord.',
  robots: { index: false },
};

export default async function MePage() {
  const session = await getSession();
  const snap = session ? await getLatestSnapshot() : null;
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <main className="relative mx-auto max-w-3xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <div className="relative">
          <MeClient betaGames={snap?.betaGames || null} />
        </div>
      </main>
      <Footer />
    </>
  );
}
