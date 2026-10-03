'use client';

import { useCallback, useEffect, useState } from 'react';
import TabelGeser from './TabelGeser';
import ConfirmModal from './ConfirmModal';
import { fmtRingkas, fmtPenuh } from '../../lib/formatClient';

// Sisa waktu diskon (berdetak tiap detik) - sama format dengan /shop publik.
function sisaWaktu(expiresAt) {
  const ms = Number(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}j ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

// Waktu berakhir absolut dalam zona lokal (mis. "14:30").
function jamBerakhir(expiresAt) {
  const d = new Date(Number(expiresAt));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

// ==========================================
// ShopManager v2 (2026-10-03)
// ==========================================
// Sebelumnya panel ini membaca katalog dari SNAPSHOT PUSH BOT (bisa basi/kosong
// -> "Belum ada data item dari bot") dan mengirim aksi ke antrean bot (bisa
// gagal: "shopItems is not defined"). Sekarang SEMUA baca/tulis LANGSUNG ke
// database Supabase lewat /api/admin/shop, sama seperti /shop publik - jadi
// begitu diubah, web langsung ikut berubah.
export default function ShopManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [, setTick] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/admin/shop', { cache: 'no-store' });
      const d = await res.json();
      if (!d.ok) { setError(d.error || 'Gagal memuat.'); return; }
      setError(null);
      setItems(d.items || []);
    } catch (e) {
      setError(e?.message || 'Gagal memuat.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Perbarui tiap 20 detik (sinkron dengan poll panel) + tiap detik untuk
  // memutar hitungan mundur diskon tanpa memanggil server.
  useEffect(() => {
    const ivData = setInterval(() => { if (!document.hidden) load(true); }, 20000);
    const ivTick = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { clearInterval(ivData); clearInterval(ivTick); };
  }, [load]);

  const act = useCallback(async (payload) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/shop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.ok) {
        setFeedback({ ok: true, text: pesanSukses(payload, d) });
        await load(true);
      } else {
        setFeedback({ ok: false, text: d.error || 'Gagal.' });
      }
    } catch (e) {
      setFeedback({ ok: false, text: e?.message || 'Gagal.' });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">Shop Manager</h2>
          <p className="text-xs text-ink-muted">
            {loading ? 'Memuat…' : `${items.length} item · data langsung dari database`}
          </p>
        </div>
        <button type="button" onClick={() => load()} className="btn-ghost px-4! py-2! text-sm cursor-pointer">
          Perbarui
        </button>
      </div>

      {feedback && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{feedback.text}</p>
      )}
      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <TabelGeser className="nx-card px-4 py-4 sm:px-5 sm:py-5">
        <table className="w-full min-w-[720px] text-left text-sm">
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
            {!loading && items.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-ink-muted">Belum ada item di database.</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.itemKey} className="border-b border-border-soft/60 align-top last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold text-ink">
                    <ItemEmoji item={it} />
                    {it.name}
                  </div>
                  <code className="text-xs text-ink-muted">{it.itemKey}</code>
                  {!it.isActive && <span className="ml-2 rounded bg-bg-soft px-1.5 py-0.5 text-[0.6rem] font-bold text-ink-muted">NONAKTIF</span>}
                </td>
                <td className="px-4 py-3 text-right text-ink" title={fmtPenuh(it.price)}>{fmtRingkas(it.price)}</td>
                <td className="px-4 py-3 text-right text-ink-muted">{it.stock}</td>
                <td className="px-4 py-3">
                  <DiskonCell diskon={it.diskon} />
                </td>
                <td className="px-4 py-3">
                  <RowActions item={it} busy={busy} setConfirm={setConfirm} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelGeser>

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          body={confirm.body}
          onCancel={() => setConfirm(null)}
          onConfirm={() => act(confirm.payload)}
          busy={busy}
        />
      )}
    </div>
  );
}

function DiskonCell({ diskon }) {
  if (!diskon) return <span className="text-xs text-ink-muted">-</span>;
  const sisa = sisaWaktu(diskon.expiresAt);
  if (!sisa) return <span className="text-xs text-ink-muted">-</span>; // sudah habis
  return (
    <div className="space-y-0.5">
      <span className="block text-xs text-ink-muted line-through decoration-2">{fmtRingkas(diskon.originalPrice)}</span>
      <span className="block text-xs font-bold text-danger">{fmtRingkas(diskon.discountPrice)}</span>
      <span className="block text-[0.65rem] font-semibold text-danger">⏳ {sisa} · s/d {jamBerakhir(diskon.expiresAt)}</span>
    </div>
  );
}

function RowActions({ item, busy, setConfirm }) {
  const [open, setOpen] = useState(null); // 'restock' | 'price' | 'discount' | null
  const hasDiscount = Boolean(item.diskon);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <MiniBtn onClick={() => setOpen(open === 'restock' ? null : 'restock')}>Restock</MiniBtn>
        <MiniBtn onClick={() => setOpen(open === 'price' ? null : 'price')}>Harga</MiniBtn>
        <MiniBtn onClick={() => setOpen(open === 'discount' ? null : 'discount')}>Diskon</MiniBtn>
        {hasDiscount && (
          <MiniBtn danger onClick={() => setConfirm({
            title: 'Hapus diskon?',
            body: `Diskon ${item.name} akan dihapus dan harga kembali ke ${fmtRingkas(item.diskon.originalPrice)}. Lanjutkan?`,
            payload: { action: 'remove_discount', itemKey: item.itemKey },
          })}>Hapus Diskon</MiniBtn>
        )}
      </div>

      {open === 'restock' && (
        <NumRow
          placeholder="jumlah stok baru"
          busy={busy}
          onSubmit={(v) => setConfirm({
            title: 'Ubah stok?',
            body: `Stok ${item.name} jadi ${v}. Lanjutkan?`,
            payload: { action: 'restock_item', itemKey: item.itemKey, amount: v },
          })}
        />
      )}

      {open === 'price' && (
        <NumRow
          placeholder="harga normal baru"
          busy={busy}
          onSubmit={(v) => setConfirm({
            title: 'Ubah harga?',
            body: `Harga ${item.name} jadi ${Number(v).toLocaleString('id-ID')} poin.${hasDiscount ? ' Diskon yang sedang aktif akan DIHAPUS.' : ''} Lanjutkan?`,
            payload: { action: 'set_price', itemKey: item.itemKey, price: v },
          })}
        />
      )}

      {open === 'discount' && (
        <DiscountRow
          busy={busy}
          hargaNormal={item.diskon ? item.diskon.originalPrice : item.price}
          onSubmit={(price, hours) => setConfirm({
            title: 'Terapkan diskon?',
            body: `${item.name} jadi ${Number(price).toLocaleString('id-ID')} poin selama ${hours} jam. Berakhir sekitar ${jamBerakhir(Date.now() + hours * 3600000)}.${price >= (item.diskon ? item.diskon.originalPrice : item.price) ? ' PERINGATAN: harga diskon tidak lebih murah dari harga asli!' : ''}`,
            payload: { action: 'set_discount', itemKey: item.itemKey, discountPrice: price, durationHours: hours },
          })}
        />
      )}
    </div>
  );
}

function ItemEmoji({ item }) {
  if (item.emojiUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.emojiUrl} alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0" />;
  }
  if (item.emoji && !String(item.emoji).startsWith('<')) {
    return <span className="shrink-0" aria-hidden="true">{item.emoji}</span>;
  }
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-accent/15 text-[0.6rem] font-bold text-accent-hover" aria-hidden="true">
      {String(item.name || item.itemKey || '?').slice(0, 2).toUpperCase()}
    </span>
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

function NumRow({ placeholder, onSubmit, busy }) {
  const [v, setV] = useState('');
  return (
    <div className="flex gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value)} inputMode="numeric" placeholder={placeholder} className="w-40 rounded-md border border-border-soft bg-bg-soft px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none" />
      <button type="button" disabled={busy || !v} onClick={() => { const n = parseInt(v, 10); if (Number.isFinite(n)) { onSubmit(n); setV(''); } }} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink! shadow-sm transition hover:brightness-95 active:translate-y-px disabled:opacity-40 cursor-pointer">OK</button>
    </div>
  );
}

function DiscountRow({ onSubmit, busy, hargaNormal }) {
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState('');
  const priceNum = parseInt(price, 10);
  const hoursNum = parseInt(hours, 10);
  const valid = Number.isFinite(priceNum) && priceNum >= 1 && Number.isFinite(hoursNum) && hoursNum >= 1 && hoursNum <= 720;
  const lebihMurah = priceNum < hargaNormal;
  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="harga diskon" className="w-28 rounded-md border border-border-soft bg-bg-soft px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none" />
        <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" placeholder="jam (1-720)" className="w-24 rounded-md border border-border-soft bg-bg-soft px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none" />
        <button type="button" disabled={busy || !valid} onClick={() => { onSubmit(priceNum, hoursNum); setPrice(''); setHours(''); }} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink! shadow-sm transition hover:brightness-95 active:translate-y-px disabled:opacity-40 cursor-pointer">OK</button>
      </div>
      {price && Number.isFinite(priceNum) && (
        <p className={`text-[0.65rem] ${lebihMurah ? 'text-ink-muted' : 'text-danger font-semibold'}`}>
          {lebihMurah
            ? `${fmtRingkas(hargaNormal)} → ${fmtRingkas(priceNum)}`
            : `Harga diskon harus di bawah ${fmtRingkas(hargaNormal)}`}
        </p>
      )}
    </div>
  );
}

function pesanSukses(payload, d) {
  switch (payload.action) {
    case 'restock_item': return `Stok ${d.itemKey} → ${d.stock}.`;
    case 'set_price': return `Harga ${d.itemKey} → ${fmtRingkas(d.price)}.${d.diskonDihapus ? ' Diskon lama dihapus.' : ''}`;
    case 'set_discount': return `Diskon ${d.itemKey}: ${fmtRingkas(d.originalPrice)} → ${fmtRingkas(d.discountPrice)}, berakhir ${jamBerakhir(d.expiresAt)}.`;
    case 'remove_discount': return `Diskon ${d.itemKey} dihapus, harga kembali ${fmtRingkas(d.price)}.`;
    default: return 'Tersimpan.';
  }
}
