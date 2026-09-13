import { getLatestSnapshot } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import { emojiSrc } from '../lib/emojis';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';

export const metadata = {
  title: 'Shop',
  description:
    'Katalog item NEXO Games: booster, gelar profil eksklusif, dan item per game beserta harganya. Kategori persis seperti nxshop di Discord.',
  alternates: { canonical: '/shop' },
};

export const dynamic = 'force-dynamic';

// Emoji item: WAJIB dari payload (emojiUrl custom / emoji unicode) -
// dilarang mengarang emoji sendiri. Token Discord mentah (":nama:id:") tanpa
// emojiUrl tidak bisa dirender browser -> jangan pernah dimunculkan apa adanya.
function ItemEmoji({ item }) {
  if (item.emojiUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.emojiUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
    );
  }
  if (item.emoji && !String(item.emoji).startsWith('<')) {
    return <span className="text-2xl shrink-0" aria-hidden="true">{item.emoji}</span>;
  }
  return null;
}

// Unicode saja untuk kategori/tabs; token mentah dilewati (URL sudah dicek duluan).
function PlainEmoji({ value, className = '' }) {
  if (!value || String(value).startsWith('<')) return null;
  return <span className={className} aria-hidden="true">{value}</span>;
}

function ItemCard({ it, discount }) {
  const disc = discount[it.itemKey];
  const hasDisc = disc && Number(disc.original_price) !== Number(it.price);
  return (
    <li className="nx-card relative px-5 py-5">
      {hasDisc && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-danger px-3 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-white">
          Flash Sale
        </span>
      )}
      <div className="flex items-start gap-3">
        <ItemEmoji item={it} />
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{it.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{it.description}</p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          {hasDisc && (
            <span className="mr-2 text-xs text-ink-muted line-through">
              {Number(disc.original_price).toLocaleString('id-ID')}
            </span>
          )}
          <span className={`font-display ${hasDisc ? 'text-danger' : 'text-ink'}`}>
            {Number(it.price).toLocaleString('id-ID')}
          </span>
          {emojiSrc('goldcoin') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emojiSrc('goldcoin')} alt="poin" width={14} height={14} className="ml-1 inline h-3.5 w-3.5" />
          )}
        </div>
        <span className="text-xs text-ink-muted">Stok {it.stock}</span>
      </div>
    </li>
  );
}

// Kartu title dari titleCatalog: label = "<:emoji:id> NAME" -> pisah emoji+teks,
// itemKey = title_<key> (kode yang sama dipakai nxshop di Discord).
function TitleCard({ t }) {
  const m = /^(<a?:[A-Za-z0-9_]+:\d+>)\s*(.*)$/.exec(String(t.emoji || t.label || ''));
  const label = m ? m[2] : String(t.label || t.key);
  const url = t.emojiUrl;
  return (
    <li className="nx-card relative px-5 py-5" style={t.color ? { borderColor: `${t.color}55` } : undefined}>
      <div className="flex items-start gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
        ) : (
          <PlainEmoji value={t.emoji} className="text-2xl shrink-0" />
        )}
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{label} Title</h3>
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">Gelar profil permanen di nxprofile Discord.</p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <span className="font-display text-ink">{Number(t.price).toLocaleString('id-ID')}</span>
          {emojiSrc('goldcoin') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emojiSrc('goldcoin')} alt="poin" width={14} height={14} className="ml-1 inline h-3.5 w-3.5" />
          )}
        </div>
        <code className="text-[0.65rem] text-[#A99C8E]">title_{String(t.key).toLowerCase()}</code>
      </div>
    </li>
  );
}

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

  // Kelompokkan item via field category (web tidak menebak).
  const byCat = {};
  for (const it of items) {
    const k = it.category || 'other';
    (byCat[k] = byCat[k] || []).push(it);
  }

  // Urut kategori: sesuai daftar payload, 'other' belakangan.
  const ordered = [...cats.filter((c) => c.value !== 'other'), ...(cats.filter((c) => c.value === 'other'))];
  const shownCats = ordered.filter((c) => c.value === 'titles' ? titles.length > 0 : (byCat[c.value] || []).length > 0);
  // Kategori yang ada itemnya tapi tidak ada di daftar payload -> Others
  const known = new Set(cats.map((c) => c.value));
  const leftovers = Object.keys(byCat).filter((k) => !known.has(k) && (byCat[k] || []).length);

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

          {/* Tab kategori (anchor scroll) */}
          {shownCats.length > 0 && (
            <nav aria-label="Kategori toko" className="mt-6 flex gap-2 overflow-x-auto pb-2">
              {shownCats.map((c) => (
                <a
                  key={c.value}
                  href={`#cat-${c.value}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-soft bg-card-cream px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-bg-soft cursor-pointer"
                >
                  {c.emojiUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.emojiUrl} alt="" width={16} height={16} className="h-4 w-4" />
                  ) : (
                    <PlainEmoji value={c.emoji} />
                  )}
                  {c.label}
                </a>
              ))}
            </nav>
          )}

          {shownCats.map((c) => {
            const isTitles = c.value === 'titles';
            const list = isTitles ? titles : byCat[c.value] || [];
            if (list.length === 0) return null;
            return (
              <section key={c.value} id={`cat-${c.value}`} className="mt-12 scroll-mt-28">
                <div className="mb-5 flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: `${(c.color || '#F19A1A')}22`, border: `1px solid ${(c.color || '#F19A1A')}55` }}
                  >
                    {c.emojiUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.emojiUrl} alt="" width={20} height={20} className="h-5 w-5" />
                    ) : (
                      <PlainEmoji value={c.emoji} className="text-lg" />
                    )}
                  </span>
                  <div>
                    <h2 className="font-display text-lg text-ink">{c.label}</h2>
                    {c.description && <p className="text-xs text-ink-muted">{c.description}</p>}
                  </div>
                  <span className="ml-auto rounded-full bg-bg-soft px-2.5 py-1 text-xs font-semibold text-ink-muted">{list.length}</span>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {isTitles
                    ? titles.map((t) => <TitleCard key={t.key} t={t} />)
                    : list.map((it) => <ItemCard key={it.itemKey} it={it} discount={discountMap} />)}
                </ul>
              </section>
            );
          })}

          {leftovers.map((k) => (
            <section key={k} id={`cat-${k}`} className="mt-12 scroll-mt-28">
              <h2 className="mb-5 font-display text-lg text-ink">Lainnya</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {byCat[k].map((it) => <ItemCard key={it.itemKey} it={it} discount={discountMap} />)}
              </ul>
            </section>
          ))}

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

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 0) return 'baru saja';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} detik lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  return `${Math.floor(m / 60)} jam lalu`;
}
