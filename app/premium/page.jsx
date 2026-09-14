import Script from 'next/script';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import { getLatestSnapshot } from '../lib/snapshot';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';
import PremiumClient from '../components/PremiumClient';
import { emojiSrc } from '../lib/emojis';

function isBotOnline(snap) {
  return Boolean(snap && Date.now() - Number(snap.ts) <= 3 * 60 * 1000);
}

export const metadata = {
  title: 'NEXO Pass Premium',
  description:
    'NEXO Pass: kuota main ekstra, inventori unlimited, bunga bank +10%, prioritas render, dan akses game beta. Rp 20.000/bulan.',
  alternates: { canonical: '/premium' },
};

export default async function PremiumPage({ searchParams }) {
  const sp = await searchParams; // Next 16: searchParams adalah Promise
  const payment = typeof sp?.payment === 'string' ? sp.payment : '';
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const snap = await getLatestSnapshot();
  const botOnline = isBotOnline(snap);

  let initialOrder = null;
  if (session) {
    const { getDb, schemaReady } = await import('../lib/db');
    await schemaReady();
    const db = getDb();
    const res = await db.execute({
      sql: 'SELECT id, status, paid_at FROM orders WHERE discord_id = ? ORDER BY created_at DESC LIMIT 1',
      args: [session.discordId],
    });
    if (res.rows.length) {
      initialOrder = { 
        id: Number(res.rows[0].id),
        status: res.rows[0].status,
        paidAt: res.rows[0].paid_at ? Number(res.rows[0].paid_at) : null
      };
    }
  }

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <AutoRefresh />
      <main className="relative mx-auto max-w-4xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <div className="relative text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-ink">
            {emojiSrc('download3') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emojiSrc('download3')} alt="" width={16} height={16} className="h-4 w-4" />
            )}
            NEXO Pass
          </div>
          <h1 className="mt-5 font-display text-3xl text-ink md:text-5xl">
            Satu Pass, <span className="font-display text-ink">Semua Perk</span>
          </h1>
          <div className="mt-5 flex items-end justify-center gap-2">
            <span className="font-display text-4xl text-ink md:text-6xl">Rp 20.000</span>
            <span className="pb-2 text-ink-muted">/bulan</span>
          </div>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">
            NEXO Pass, satu paket tanpa tingkatan. Bayar pakai QRIS, e-wallet (GoPay, OVO, DANA,
            ShopeePay), atau virtual account bank. Aktif otomatis beberapa detik setelah
            pembayaran terkonfirmasi.
          </p>

        <PremiumClient 
          loggedIn={Boolean(session)} 
          botOnline={botOnline} 
          initialPremiumActive={premiumActive}
          initialOrder={initialOrder}
        />
        </div>
      </main>
      <Footer />
    </>
  );
}
