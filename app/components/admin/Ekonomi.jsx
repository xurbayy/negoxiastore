'use client';

import { useState } from 'react';
import ConfirmModal from './ConfirmModal';

// Ekonomi: cari user by ID + form aksi poin/level/streak.

export default function Ekonomi({ send }) {
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
        ? { ok: true, text: `Perintah ${action} masuk antrean (#${out.id}). Bot eksekusi dalam ±15 detik.` }
        : { ok: false, text: out.error || 'Gagal mengirim perintah.' });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const uid = userId.trim();

  return (
    <div className="space-y-6">
      <div className="nx-card px-5 py-5">
        <h2 className="font-display text-ink">Cari User</h2>
        <p className="mt-1 text-xs text-ink-muted">Masukkan Discord User ID (angka). Profil dari bot bisa dilihat lewat riwayat perintah di Activity Log.</p>
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
          placeholder="836383639439671366"
          className="mt-3 w-full rounded-xl border border-border-soft bg-bg-soft px-4 py-3 font-mono text-ink placeholder:text-[#A99C8E] focus:border-accent focus:outline-none"
        />
        {uid && uid.length < 5 && <p className="mt-2 text-xs text-danger">ID minimal 5 digit.</p>}
      </div>

      <div className="nx-card px-5 py-5">
        <h2 className="font-display text-ink">Aksi Ekonomi</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <AmountAction label="Tambah Poin" hint="maks 1.000.000" disabled={!uid || busy} onSubmit={(v) => submit('add_points', { userId: uid, amount: v })} />
          <AmountAction label="Kurangi Poin" hint="maks 1.000.000" disabled={!uid || busy} onSubmit={(v) => submit('remove_points', { userId: uid, amount: v })} />
          <AmountAction label="Set Poin (0-100jt)" hint="DESTRUKTIF - modal konfirmasi" danger disabled={!uid || busy} onSubmit={(v) => submit('set_points', { userId: uid, amount: v }, true)} />
          <AmountAction label="Set Level" hint="1-1000" disabled={!uid || busy} onSubmit={(v) => submit('set_level', { userId: uid, level: v })} />
          <AmountAction label="Set Daily Streak" hint="0-3650" disabled={!uid || busy} onSubmit={(v) => submit('set_streak', { userId: uid, value: v })} />
          <AmountAction label="Set Winstreak" hint="0-3650" disabled={!uid || busy} onSubmit={(v) => submit('set_winstreak', { userId: uid, value: v })} />
          <AmountAction label="Giveaway Semua Player" hint="maks 250.000 - DESTRUKTIF" danger disabled={busy} onSubmit={(v) => submit('giveaway', { amount: v }, true)} />
          <AmountAction label="Bebaskan Hutang" hint="clear loan user ini" disabled={!uid || busy} onSubmit={() => submit('clear_loan', { userId: uid }, true)} />
        </div>

        {/* Aksi cepat (tanpa nominal) */}
        <div className="mt-4 flex flex-wrap gap-2">
          <QuickAction label="Reset Limit Harian" disabled={!uid || busy} onClick={() => submit('reset_daily', { userId: uid })} />
          <QuickAction label="Reset Misi User" disabled={!uid || busy} onClick={() => submit('reset_missions', { userId: uid })} />
          <QuickAction label="Clear Sesi Macet (user)" disabled={!uid || busy} onClick={() => submit('clear_lock', { userId: uid })} />
          <QuickAction label="Reset Misi SEMUA Player" danger disabled={busy} onClick={() => submit('reset_missions', { userId: null }, true)} />
          <QuickAction label="Clear SEMUA Sesi Macet" danger disabled={busy} onClick={() => submit('clear_lock', { userId: null }, true)} />
        </div>

        {feedback && (
          <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm ${feedback.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>
            {feedback.text}
          </p>
        )}
      </div>

      {confirm && (
        <ConfirmModal
          title={`${confirm.label}?`}
          body={`Perintah destruktif akan masuk antrean bot dan dieksekusi ±15 detik. Lanjutkan ${confirm.label.toLowerCase()}?`}
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
          className="shrink-0 rounded-lg bg-accent !text-ink px-4 py-2 text-sm font-bold text-white shadow-md transition hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:shadow-sm disabled:opacity-40 cursor-pointer"
        >
          Kirim
        </button>
      </div>
    </div>
  );
}
