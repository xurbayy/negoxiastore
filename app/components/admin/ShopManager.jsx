'use client';

import { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import { fmt } from '../../lib/formatClient';

export default function ShopManager({ send, data }) {
  const items = data.snapshot?.shopItems || [];
  const discounts = data.snapshot?.discounts || [];
  const discMap = {};
  for (const d of discounts) discMap[d.item_key] = d;

  // Emoji item: URL custom dulu (sama seperti halaman /shop publik) - token
  // <:uang:...> mentah JANGAN pernah ditulis apa adanya ke browser.
  function ItemEmoji({ item }) {
    if (item.emojiUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.emojiUrl} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0" />
      );
    }
    if (item.emoji && !item.emoji.startsWith('<')) {
      return <span className="shrink-0" aria-hidden="true">{item.emoji}</span>;
    }
    return (
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-accent/15 text-[0.6rem] font-bold text-accent-hover" aria-hidden="true">
        {String(item.name || item.itemKey || '?').slice(0, 2).toUpperCase()}
      </span>
    );
  }

  const [confirm, setConfirm] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  async function doSend(action, payload) {
    setBusy(true);
    try {
      const out = await send(action, payload);
      setFeedback(out.ok ? { ok: true, text: `${action} masuk antrean (#${out.id}).` } : { ok: false, text: out.error || 'Gagal.' });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ink">Shop Manager ({items.length} item)</h2>
        <button
          type="button"
          onClick={() => setConfirm({ action: 'restock_all', payload: {} })}
          className="btn-ghost px-4! py-2! text-sm cursor-pointer"
        >
          Restock Semua
        </button>
      </div>

      {feedback && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{feedback.text}</p>
      )}

      <div className="nx-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">Harga</th>
              <th className="px-4 py-3 text-right">Stok</th>
              <th className="px-4 py-3">Diskon</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-ink-muted">Belum ada data item dari bot.</td></tr>
            )}
            {items.map((it) => {
              const disc = discMap[it.itemKey];
              return (
                <tr key={it.itemKey} className="border-b border-border-soft/60 align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold text-ink">
                      <ItemEmoji item={it} />
                      {it.name}
                    </div>
                    <code className="text-xs text-ink-muted">{it.itemKey}</code>
                  </td>
                  <td className="px-4 py-3 text-right text-ink">{fmt(it.price)}</td>
                  <td className="px-4 py-3 text-right text-ink-muted">{it.stock}</td>
                  <td className="px-4 py-3">
                    {disc ? (
                      <span className="rounded bg-bg-soft px-2 py-0.5 text-xs font-bold text-danger line-through decoration-2">{fmt(disc.original_price)}</span>
                    ) : (
                      <span className="text-xs text-ink-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <RowActions itemKey={it.itemKey} hasDiscount={Boolean(disc)} onSend={doSend} busy={busy} setConfirm={setConfirm} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmModal
          title="Restock semua item?"
          body="Semua item akan di-restock ke jumlah default di bot. Lanjutkan?"
          onCancel={() => setConfirm(null)}
          onConfirm={() => doSend('restock_all', {})}
          busy={busy}
        />
      )}
    </div>
  );
}

function RowActions({ itemKey, hasDiscount, onSend, busy }) {
  const [open, setOpen] = useState(null); // 'restock' | 'price' | 'discount' | null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <MiniBtn onClick={() => setOpen(open === 'restock' ? null : 'restock')}>Restock</MiniBtn>
        <MiniBtn onClick={() => setOpen(open === 'price' ? null : 'price')}>Harga</MiniBtn>
        <MiniBtn onClick={() => setOpen(open === 'discount' ? null : 'discount')}>Diskon</MiniBtn>
        {hasDiscount && (
          <MiniBtn danger onClick={() => onSend('remove_discount', { itemKey })}>Hapus Diskon</MiniBtn>
        )}
      </div>
      {open === 'restock' && (
        <NumRow placeholder="amount (kosong = default)" onSubmit={(v) => { onSend('restock_item', { itemKey, amount: v ?? undefined }); setOpen(null); }} busy={busy} optional />
      )}
      {open === 'price' && (
        <NumRow placeholder="harga baru" onSubmit={(v) => { onSend('set_price', { itemKey, price: v }); setOpen(null); }} busy={busy} />
      )}
      {open === 'discount' && (
        <DiscountRow onSubmit={(price, hours) => { onSend('set_discount', { itemKey, discountPrice: price, durationHours: hours }); setOpen(null); }} busy={busy} />
      )}
    </div>
  );
}

function MiniBtn({ children, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-sm transition hover:-translate-y-px active:translate-y-0 cursor-pointer ${
        danger ? 'border-danger/40 bg-white text-danger hover:bg-danger hover:text-white' : 'border-border-soft bg-white text-ink hover:border-accent hover:bg-accent/10'
      }`}
    >
      {children}
    </button>
  );
}

function NumRow({ placeholder, onSubmit, busy, optional }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="w-40 rounded-md border border-border-soft bg-bg-soft px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none" />
      <button type="button" disabled={busy || (!optional && !v)} onClick={() => { onSubmit(v ? parseInt(v, 10) : null); setV(''); }} className="rounded-lg bg-accent text-ink! px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-95 active:translate-y-px disabled:opacity-40 cursor-pointer">OK</button>
    </div>
  );
}

function DiscountRow({ onSubmit, busy }) {
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState('');
  return (
    <div className="flex gap-1.5">
      <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="harga diskon" className="w-28 rounded-md border border-border-soft bg-bg-soft px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none" />
      <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="jam (1-720)" className="w-24 rounded-md border border-border-soft bg-bg-soft px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none" />
      <button type="button" disabled={busy || !price || !hours} onClick={() => { onSubmit(parseInt(price, 10), parseInt(hours, 10)); setPrice(''); setHours(''); }} className="rounded-lg bg-accent text-ink! px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-95 active:translate-y-px disabled:opacity-40 cursor-pointer">OK</button>
    </div>
  );
}
