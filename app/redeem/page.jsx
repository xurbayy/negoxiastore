import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import { redirect } from 'next/navigation';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import RedeemClient from '../components/RedeemClient';

export const metadata = {
  title: 'Redeem Kode',
  description: 'Tukar kode promo NEXO Games: hadiah poin atau item langsung masuk ke akun Discord kamu dalam 15-30 detik.',
  alternates: { canonical: '/redeem' },
};

export default async function RedeemPage({ searchParams }) {
  const sp = await searchParams; // Next 16: searchParams adalah Promise
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const prefillCode = typeof sp?.code === 'string' ? sp.code.toUpperCase() : '';
  if (!session) redirect('/login');

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <main className="relative mx-auto max-w-2xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <div className="relative text-center">
          <h1 className="mt-3 font-display text-3xl text-ink md:text-4xl">
            Redeem <span className="font-display text-ink">Hadiah</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-ink-muted">
            Masukkan kode promo dari event/giveaway NEXO. Hadiah langsung diproses ke akun Discord-mu.
          </p>
          <div className="mt-10 text-left">
            <RedeemClient loggedIn={Boolean(session)} prefillCode={prefillCode} />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
