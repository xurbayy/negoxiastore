import { getSession } from './lib/session';
import { userHasPremium } from './lib/snapshot';
import ScrollProgress from './components/ScrollProgress';
import Navbar from './components/Navbar';
import AdUnit from './components/AdUnit';
import Hero from './components/Hero';
import LiveSnapshot from './components/LiveSnapshot';
import Games from './components/Games';
import Features from './components/Features';
import HowToPlay from './components/HowToPlay';
import Faq from './components/Faq';
import Footer from './components/Footer';
import AutoRefresh from './components/AutoRefresh';
import ScrollKeAnchor from './components/ScrollKeAnchor';
import WelcomeBack from './components/WelcomeBack';

// Landing pintar: halaman pertama tetap landing page, tapi isinya menyesuaikan
// status login. Belum login = fokus onboarding (Cara Main + CTA invite).
// Sudah login = skip onboarding, langsung fokus game, status live, dan profil.
export default async function Page() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const loggedIn = Boolean(session);

  return (
    <>
      <ScrollProgress />
      <AutoRefresh />
      <ScrollKeAnchor />
      <Navbar session={session} premiumActive={premiumActive} />
      <main>
        <Hero loggedIn={loggedIn} />
        {loggedIn && <WelcomeBack username={session.username} />}
        <LiveSnapshot />
        <Games />
        <Features />
        {/* "Cara Main" dan "FAQ" dulu HANYA dirender untuk tamu. Akibatnya
            link navbar /#cara-main gagal untuk member: section-nya tidak ada,
            jadi browser cuma pindah halaman lalu berhenti di atas - terlihat
            seperti "ke halaman game yang awal", bukan ke Cara Main.

            Sekarang selalu dirender. Isinya memang lebih relevan untuk
            pemain baru, tapi member pun sesekali perlu mengeceknya - dan yang
            lebih penting: tautan yang ada di UI TIDAK BOLEH menuju ke tempat
            yang tidak ada. */}
        <HowToPlay />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
