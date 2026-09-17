'use client';

import { useState } from 'react';
import { emojiSrc } from '../lib/emojisClient';
import { fmtRingkas, fmtPenuh } from '../lib/formatClient';

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
              {fmtRingkas(disc.original_price)}
            </span>
          )}
          <span className={`font-display ${hasDisc ? 'text-danger' : 'text-ink'}`}>
            {fmtRingkas(it.price)}
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
          <span className="font-display text-ink" title={fmtPenuh(t.price)}>{fmtRingkas(t.price)}</span>
          {emojiSrc('goldcoin') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emojiSrc('goldcoin')} alt="poin" width={14} height={14} className="ml-1 inline h-3.5 w-3.5" />
          )}
        </div>
        <code className="text-[0.65rem] text-ink-faint">title_{String(t.key).toLowerCase()}</code>
      </div>
    </li>
  );
}

export default function ShopClient({ items, cats, titles, discountMap }) {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase().trim();

  const catLabelMap = {};
  for (const c of cats) {
    catLabelMap[c.value] = (c.label || '').toLowerCase();
  }

  // Filter items
  const filteredItems = items.filter(it => {
    if (!q) return true;
    const matchName = it.name.toLowerCase().includes(q);
    const catLabel = catLabelMap[it.category || 'other'] || '';
    const matchCat = catLabel.includes(q);
    return matchName || matchCat;
  });
  
  // Filter titles
  const titlesCatLabel = catLabelMap['titles'] || 'gelar profil';
  const filteredTitles = titles.filter(t => {
    if (!q) return true;
    const m = /^(<a?:[A-Za-z0-9_]+:\d+>)\s*(.*)$/.exec(String(t.emoji || t.label || ''));
    const label = (m ? m[2] : String(t.label || t.key)).toLowerCase();
    return label.includes(q) || titlesCatLabel.includes(q);
  });

  const byCat = {};
  for (const it of filteredItems) {
    const k = it.category || 'other';
    (byCat[k] = byCat[k] || []).push(it);
  }

  const ordered = [...cats.filter((c) => c.value !== 'other'), ...(cats.filter((c) => c.value === 'other'))];
  const shownCats = ordered.filter((c) => c.value === 'titles' ? filteredTitles.length > 0 : (byCat[c.value] || []).length > 0);
  
  const known = new Set(cats.map((c) => c.value));
  const leftovers = Object.keys(byCat).filter((k) => !known.has(k) && (byCat[k] || []).length);

  return (
    <>
      <div className="relative mt-8 max-w-sm">
        <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="Cari item atau gelar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-border-soft bg-card-cream py-2.5 pl-10 pr-10 text-sm font-semibold text-ink placeholder:font-medium placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition cursor-pointer"
            aria-label="Hapus pencarian"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {shownCats.length > 0 && !q && (
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

      {shownCats.length === 0 && leftovers.length === 0 && q && (
        <div className="nx-card mt-8 px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bg-soft">
            <svg className="h-6 w-6 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <h3 className="font-semibold text-ink">Tidak ditemukan</h3>
          <p className="mt-1 text-sm text-ink-muted">Tidak ada item yang cocok dengan pencarian &quot;{search}&quot;</p>
        </div>
      )}

      {shownCats.map((c) => {
        const isTitles = c.value === 'titles';
        const list = isTitles ? filteredTitles : byCat[c.value] || [];
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
                {c.description && !q && <p className="text-xs text-ink-muted">{c.description}</p>}
              </div>
              <span className="ml-auto rounded-full bg-bg-soft px-2.5 py-1 text-xs font-semibold text-ink-muted">{list.length}</span>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {isTitles
                ? list.map((t) => <TitleCard key={t.key} t={t} />)
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
    </>
  );
}
