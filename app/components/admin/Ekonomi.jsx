'use client';

import { useState } from 'react';
import ConfirmModal from './ConfirmModal';

// Ekonomi: cari user by ID + form aksi poin/level/streak + item user + chemistry.

export default function Ekonomi({ send, data }) {
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null); // { ok, text }
  const [confirm, setConfirm] = useState(null);   // { action, payload, label }

  async function submit(action, payload, destructive) {
    if (destructive) {
      setConfirm({ action, payload, label: LABELS[action] });
      return;
    }
    await doSend(action, payload);
  }

  async function doSend(action, payload) {
    setBusy(true);
    setFeedback(null);
    try {
      const out = await send(action, payload);
      setFeedback(out.ok
        ? out.langsung
          ? { ok: true, text: `Perintah ${action} berhasil dijalankan langsung - data sudah berubah.` }
          : { ok: true, text: `Perintah ${action} masuk antrean nomor ${out.id}. Bot eksekusi dalam ±15 detik.` }
        : { ok: false, text: out.error || 'Gagal mengirim perintah.' });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const uid = userId.trim();

  return (
    <div className="space-y-4">
      <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
        <h2 className="font-display text-ink">Cari User</h2>
        <p className="mt-1 text-xs text-ink-muted">Masukkan Discord User ID berupa angka. Profil dari bot bisa dilihat lewat riwayat perintah di Activity Log.</p>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
          placeholder="836383639439671366"
          className="mt-3 w-full rounded-xl border border-border-soft bg-bg-soft px-4 py-3 font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        {uid && uid.length < 5 && <p className="mt-2 text-xs text-danger">ID minimal 5 digit.</p>}
      </div>

      <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
        <h2 className="font-display text-ink">Aksi Ekonomi</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <AmountAction label="Tambah Poin" hint="maks 1.000.000" disabled={!uid || busy} onSubmit={(v) => submit('add_points', { userId: uid, amount: v })} />
          <AmountAction label="Kurangi Poin" hint="maks 1.000.000" disabled={!uid || busy} onSubmit={(v) => submit('remove_points', { userId: uid, amount: v })} />
          <AmountAction label="Set Poin" hint="0 sampai 100 jt - DESTRUKTIF" danger disabled={!uid || busy} onSubmit={(v) => submit('set_points', { userId: uid, amount: v }, true)} />
          <AmountAction label="Set Level" hint="1-1000" disabled={!uid || busy} onSubmit={(v) => submit('set_level', { userId: uid, level: v })} />
          <AmountAction label="Set Daily Streak" hint="0-3650" disabled={!uid || busy} onSubmit={(v) => submit('set_streak', { userId: uid, value: v })} />
          <AmountAction label="Set Winstreak" hint="0-3650" disabled={!uid || busy} onSubmit={(v) => submit('set_winstreak', { userId: uid, value: v })} />
          <AmountAction label="Set RPG Level" hint="1-100 (season berjalan)" disabled={!uid || busy} onSubmit={(v) => submit('set_rpg_level', { userId: uid, level: v })} />
          <AmountAction label="Giveaway Semua Player" hint="maks 250.000 - DESTRUKTIF" danger disabled={busy} onSubmit={(v) => submit('giveaway', { amount: v }, true)} />
          <AmountAction label="Bebaskan Hutang" hint="clear loan user ini" disabled={!uid || busy} onSubmit={() => submit('clear_loan', { userId: uid }, true)} />
        </div>

        {/* Aksi cepat (tanpa nominal) */}
        <div className="mt-4 flex flex-wrap gap-2">
          <QuickAction label="Reset Limit Harian" disabled={!uid || busy} onClick={() => submit('reset_daily', { userId: uid })} />
          <QuickAction label="Reset Misi User" disabled={!uid || busy} onClick={() => submit('reset_missions', { userId: uid })} />
          <QuickAction label="Clear Sesi Macet User" disabled={!uid || busy} onClick={() => submit('clear_lock', { userId: uid })} />
          <QuickAction label="Reset Misi SEMUA Player" danger disabled={busy} onClick={() => submit('reset_missions', { userId: null }, true)} />
          <QuickAction label="Clear SEMUA Sesi Macet" danger disabled={busy} onClick={() => submit('clear_lock', { userId: null }, true)} />
        </div>
      </div>

      {/* ==========================================
          ITEM USER (permintaan pemilik 2026-10-04):
          "ngasih item ke orang terus hapus item orang".
          Backend (add_item/remove_item) sudah ada sejak awal di
          aksiAdminLangsung.js, tapi TIDAK ADA form di UI - sekarang ada.
          Dropdown item dari snapshot.shopItems (katalog bot).
          ========================================== */}
      <ItemUserPanel uid={uid} busy={busy} send={send} items={data?.snapshot?.shopItems || []} setFeedback={setFeedback} />

      <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
        <h2 className="font-display text-ink">Chemistry Pasangan</h2>
        <p className="mt-1 text-xs text-ink-muted">Ubah poin chemistry antara dua user (pacar/partner in-game). Isi 2 Discord ID + jumlah poin.</p>
        <ChemistryForm busy={busy} onSubmit={(u1, u2, amt) => submit('set_chemistry', { user1: u1, user2: u2, amount: amt }, true)} />
      </div>

      {feedback && (
        <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm ${feedback.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>
          {feedback.text}
        </p>
      )}

      {confirm && (
        <ConfirmModal
          title={`${confirm.label}?`}
          body={`Perintah destruktif dieksekusi langsung ke database (bot ikut melihat perubahan). Lanjutkan ${confirm.label.toLowerCase()}?`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => doSend(confirm.action, confirm.payload)}
          busy={busy}
        />
      )}
    </div>
  );
}

const LABELS = { set_points: 'Set Poin', giveaway: 'Giveaway', clear_loan: 'Bebaskan Hutang', reset_missions: 'Reset Misi Global', clear_lock: 'Clear Lock Global' };

function QuickAction({ label, danger, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition cursor-pointer disabled:opacity-40 ${
        danger ? 'border-danger/40 text-danger hover:bg-danger/10' : 'border-border-soft text-ink hover:bg-bg-soft'
      }`}
    >
      {label}
    </button>
  );
}

function AmountAction({ label, hint, danger, disabled, onSubmit }) {
  const [val, setVal] = useState('');
  return (
    <div className="rounded-xl border border-border-soft bg-card-cream/60 px-4 py-4">
      <p className={`text-sm font-semibold ${danger ? 'text-danger' : 'text-ink'}`}>{label}</p>
      <p className="text-xs text-ink-muted">{hint}</p>
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={disabled || !val}
          onClick={() => { onSubmit(parseInt(val, 10)); setVal(''); }}
          className="shrink-0 rounded-lg bg-accent text-ink! px-4 py-2 text-sm font-bold text-white shadow-md transition hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:shadow-sm disabled:opacity-40 cursor-pointer"
        >
          Kirim
        </button>
      </div>
    </div>
  );
}

// ==========================================
// ITEM USER (permintaan pemilik 2026-10-04):
// "gw mau si web juga bisa jalanin di admin panel ya ngasih item ke orang
//  terus hapus item orang".
// Backend (add_item / remove_item) sudah ADA di aksiAdminLangsung.js sejak
// awal, tapi tidak pernah ada form di UI. Panel ini mengisinya.
// ==========================================
function ItemUserPanel({ uid, busy, send, items, setFeedback }) {
  const [itemKey, setItemKey] = useState('');
  const [qty, setQty] = useState('1');
  const [sibuk, setSibuk] = useState(false);

  // Dropdown katalog: dedup by itemKey (snapshot bisa punya duplikat kalau
  // push bertumpuk), urut nama.
  const katalog = [];
  const terlihat = new Set();
  for (const it of items) {
    const k = it?.itemKey;
    if (!k || terlihat.has(k)) continue;
    terlihat.add(k);
    katalog.push({ itemKey: k, name: it.name || k });
  }
  katalog.sort((a, b) => a.name.localeCompare(b.name));

  async function kirim(action) {
    if (!uid || !itemKey) return;
    const jumlah = Math.max(1, parseInt(qty, 10) || 1);
    setSibuk(true);
    setFeedback(null);
    try {
      const out = await send(action, { userId: uid, itemKey, qty: jumlah });
      setFeedback(out.ok
        ? { ok: true, text: out.langsung ? out.hasil || `Perintah ${action} berhasil dijalankan langsung.` : `Perintah ${action} masuk antrean nomor ${out.id}. Bot eksekusi dalam ±15 detik.` }
        : { ok: false, text: out.error || 'Gagal mengirim perintah.' });
    } finally {
      setSibuk(false);
    }
  }

  const disabled = !uid || !itemKey || busy || sibuk;

  return (
    <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
      <h2 className="font-display text-ink">Item User</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Beri item gratis ke tas user atau hapus item dari tasnya. Butuh Discord ID di panel &quot;Cari User&quot; di atas
        {uid ? ` (sekarang: ${uid})` : ' - isi dulu ID-nya'}.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block">
          <span className="text-xs font-semibold text-ink-muted">Item</span>
          <select
            value={itemKey}
            onChange={(e) => setItemKey(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="">- pilih item -</option>
            {katalog.map((it) => (
              <option key={it.itemKey} value={it.itemKey}>{it.name} ({it.itemKey})</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-muted">Jumlah</span>
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => kirim('add_item')}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white shadow-md transition hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:shadow-sm disabled:opacity-40 cursor-pointer"
        >
          Beri Item
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => kirim('remove_item')}
          className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-bold text-danger transition hover:bg-danger/10 disabled:opacity-40 cursor-pointer"
        >
          Hapus Item
        </button>
      </div>

      {katalog.length === 0 && (
        <p className="mt-2 text-xs text-ink-faint">Katalog item belum termuat dari snapshot bot - tunggu beberapa detik atau isi kode item manual di kolom lain.</p>
      )}
    </div>
  );
}

// ==========================================
// CHEMISTRY (set_chemistry): ubah poin chemistry 2 user.
// ==========================================
function ChemistryForm({ busy, onSubmit }) {
  const [u1, setU1] = useState('');
  const [u2, setU2] = useState('');
  const [amt, setAmt] = useState('');

  const ok = u1.length >= 5 && u2.length >= 5 && amt !== '';

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <input
        value={u1}
        onChange={(e) => setU1(e.target.value.replace(/\D/g, ''))}
        placeholder="Discord ID user 1"
        className="rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <input
        value={u2}
        onChange={(e) => setU2(e.target.value.replace(/\D/g, ''))}
        placeholder="Discord ID user 2"
        className="rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <div className="flex gap-2">
        <input
          type="number"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          placeholder="Poin"
          className="w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          disabled={!ok || busy}
          onClick={() => { onSubmit(u1, u2, parseInt(amt, 10)); setAmt(''); }}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white shadow-md transition hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:shadow-sm disabled:opacity-40 cursor-pointer"
        >
          Set
        </button>
      </div>
    </div>
  );
}
