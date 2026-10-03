import { getLatestSnapshot } from '../lib/snapshot';
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
  // KATALOG LANGSUNG DARI DB BOT (2026-10-03): tidak menunggu push bot.
  // Fallback ke snapshot kalau query DB gagal.
  const { getLiveShop } = await import('../lib/liveCatalog');
  const live = await getLiveShop();
  const snap = live ? null : await getLatestSnapshot();
  const items = live?.shopItems || snap?.shopItems || [];
  const cats = live?.shopCategories || snap?.shopCategories || [];
  const titles = snap?.titleCatalog || [];
  const discounts = live?.discounts || snap?.discounts || [];
  // Normalisasi bentuk diskon dari DUA sumber: liveCatalog (camelCase:
  // { itemKey, discountPrice, originalPrice, expiresAt }) dan snapshot lama
  // (snake_case: { item_key, discount_price, original_price, expires_at }).
  // Bentuk kanonik: { itemKey, hargaDiskon, hargaAsli, berakhirPada }.
  const discountMap = {};
  for (const d of discounts) {
    const key = d.itemKey || d.item_key;
    if (!key) continue;
    discountMap[key] = {
      itemKey: key,
      hargaDiskon: Number(d.discountPrice ?? d.discount_price ?? 0),
      hargaAsli: Number(d.originalPrice ?? d.original_price ?? 0) || null,
      berakhirPada: Number(d.expiresAt ?? d.expires_at ?? 0) || null,
    };
  }
  // Sumber kedua: tiap item live SUDAH membawa originalPrice/discountExpiresAt
  // (diambil dari JOIN tabel diskon). Dipakai kalau array `discounts` kosong
  // atau bentuknya tak terduga, supaya badge tetap muncul.
  for (const it of items) {
    if (discountMap[it.itemKey]) continue;
    if (it.discountPrice === null || it.discountPrice === undefined) continue;
    discountMap[it.itemKey] = {
      itemKey: it.itemKey,
      hargaDiskon: Number(it.discountPrice),
      // harga asli dari kolom original_price; kalau kosong, StoreClient akan
      // jatuh ke it.price secara hati-hati (lihat ItemCard).
      hargaAsli: Number(it.originalPrice ?? 0) || null,
      berakhirPada: Number(it.discountExpiresAt ?? 0) || null,
    };
  }

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
          {/* Peringatan "Bot belum mengirim katalog" DIHAPUS (2026-10-03):
              katalog dibaca LANGSUNG dari database, tidak lagi bergantung push. */}

          <ShopClient items={items} cats={cats} titles={titles} discountMap={discountMap} />

          {items.length === 0 && titles.length === 0 && (
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
