import { getSession } from './lib/session';
import { userHasPremium } from './lib/snapshot';
import ScrollProgress from './components/ScrollProgress';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import LiveSnapshot from './components/LiveSnapshot';
import Games from './components/Games';
import Features from './components/Features';
import HowToPlay from './components/HowToPlay';
import Faq from './components/Faq';
import Footer from './components/Footer';
import AutoRefresh from './components/AutoRefresh';
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
      <Navbar session={session} premiumActive={premiumActive} />
      <main>
        <Hero loggedIn={loggedIn} />
        {loggedIn && <WelcomeBack username={session.username} />}
        <LiveSnapshot />
        <Games />
        <Features />
        {!loggedIn && <HowToPlay />}
        {!loggedIn && <Faq />}
      </main>
      <Footer />
    </>
  );
}
