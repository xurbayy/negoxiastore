import { getLatestSnapshot, timeAgo } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';
import ShopClient from './ShopClient';

export const metadata = {
  title: 'Shop',
  description:
    'Katalog item NEXO Games: booster, gelar profil eksklusif, dan item per game beserta harganya. Kategori persis seperti nxshop di Discord.',
  alternates: { canonical: '/shop' },
};

export const dynamic = 'force-dynamic';

export default async function ShopPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const snap = await getLatestSnapshot();
  const items = snap?.shopItems || [];
  const cats = snap?.shopCategories || [];
  const titles = snap?.titleCatalog || [];
  const discounts = snap?.discounts || [];
  const discountMap = {};
  for (const d of discounts) discountMap[d.item_key] = d;

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <AutoRefresh />
      <main className="relative mx-auto max-w-5xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <div className="relative">
          <h1 className="font-display text-3xl tracking-tight text-ink md:text-4xl">
            NEXO Shop.
          </h1>
          <div className="accent-bar mt-4" aria-hidden="true" />
          {snap ? (
            <p className="mt-3 text-sm text-ink-muted">Kategori persis seperti nxshop Discord · diperbarui {timeAgo(snap.ts)}</p>
          ) : (
            <p className="mt-3 text-sm text-danger">⚠ Bot belum mengirim katalog. Ketik <code className="text-ink">nxshop</code> di Discord untuk melihat langsung.</p>
          )}

          <ShopClient items={items} cats={cats} titles={titles} discountMap={discountMap} />

          {items.length === 0 && titles.length === 0 && snap && (
            <div className="nx-card mt-10 px-6 py-10 text-center text-ink-muted">
              Katalog kosong. Ketik <code className="text-ink">nxshop</code> di Discord untuk melihat item langsung.
            </div>
          )}

          <p className="mt-12 text-center text-sm text-ink-muted">
            Belanja langsung di Discord, ketik <code className="rounded bg-bg-soft px-2 py-1 font-mono text-ink">nxshop</code>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
