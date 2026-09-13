'use client';

import { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import RichText from './RichText';

// Titles: (1) beri Title katalog ke user (add_title),
// (2) pasang/hapus Admin Title custom (set_admin_title / clear_admin_title),
// (3) daftar pemegang Admin Title dari snapshot (adminTitleHolders) - emoji
// di-render lewat RichText, sinkron otomatis tiap push bot (60 dtk).
export default function Titles({ send, data }) {
  const holders = data.snapshot?.monitor?.adminTitleHolders || [];
  const titles = data.snapshot?.titleCatalog || [];
  const [tForm, setTForm] = useState({ userId: '', titleKey: '' });
  const [aForm, setAForm] = useState({ userId: '', text: '' });
  const [confirm, setConfirm] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  async function doSend(action, payload, label) {
    setBusy(true);
    try {
      const out = await send(action, payload);
      setFeedback(out.ok ? { ok: true, text: `${label} masuk antrean (#${out.id}). Bot eksekusi ≤10 detik.` } : { ok: false, text: out.error || 'Gagal.' });
      setConfirm(null);
    } finally { setBusy(false); }
  }

  function submitTitle(e) {
    e.preventDefault();
    if (!tForm.userId.trim() || !tForm.titleKey) return;
    doSend('add_title', { userId: tForm.userId.trim(), titleKey: tForm.titleKey }, 'Add Title');
  }

  function submitAdmin(e) {
    e.preventDefault();
    if (!aForm.userId.trim() || !aForm.text.trim()) return;
    doSend('set_admin_title', { userId: aForm.userId.trim(), text: aForm.text.trim().slice(0, 100) }, 'Set Admin Title');
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Beri title katalog */}
        <form onSubmit={submitTitle} className="nx-card px-5 py-5">
          <h2 className="font-display text-ink">Beri Title</h2>
          <p className="mt-1 text-xs text-ink-muted">Title permanen dari daftar title resmi; langsung dipakai di nxprofile user.</p>
          <input value={tForm.userId} onChange={(e) => setTForm({ ...tForm, userId: e.target.value.replace(/\D/g, '') })} placeholder="Discord User ID"
            className="mt-3 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm !text-ink focus:border-accent focus:outline-none" />
          <select value={tForm.titleKey} onChange={(e) => setTForm({ ...tForm, titleKey: e.target.value })}
            className="mt-2 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm !text-ink focus:border-accent focus:outline-none">
            <option value="">- pilih title -</option>
            {titles.map((t) => <option key={t.key} value={t.key}>{t.label.replace(/<[^>]+>/g, '').trim()} ({t.key})</option>)}
          </select>
          <button type="submit" disabled={busy || !tForm.userId || !tForm.titleKey} className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold !text-ink transition hover:bg-accent-hover disabled:opacity-40 cursor-pointer">Beri Title</button>
        </form>

        {/* Set admin title */}
        <form onSubmit={submitAdmin} className="nx-card px-5 py-5">
          <h2 className="font-display text-ink">Pasang Admin Title</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Boleh mengandung emoji custom, mis. <code className="font-mono">&lt;:badge_dev:…&gt; Owner</code> - bot menyimpan, web mencatat
            emoji barunya lewat emoji_registry, dan kalau dicabut ikonnya ikut hilang dari mana pun ditampilkan.
          </p>
          <input value={aForm.userId} onChange={(e) => setAForm({ ...aForm, userId: e.target.value.replace(/\D/g, '') })} placeholder="Discord User ID"
            className="mt-3 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm !text-ink focus:border-accent focus:outline-none" />
          <textarea value={aForm.text} onChange={(e) => setAForm({ ...aForm, text: e.target.value.slice(0, 100) })} placeholder="Teks title (maks 100 karakter)" rows={2}
            className="mt-2 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm !text-ink focus:border-accent focus:outline-none" />
          <button type="submit" disabled={busy || !aForm.userId || !aForm.text.trim()} className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold !text-ink transition hover:bg-accent-hover disabled:opacity-40 cursor-pointer">Pasang</button>
        </form>
      </div>

      {feedback && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{feedback.text}</p>
      )}

      {/* Daftar pemegang admin title (sinkron snapshot) */}
      <div className="nx-card px-5 py-5">
        <h2 className="font-display text-ink">Pemegang Admin Title : {holders.length}</h2>
        <p className="mt-1 text-xs text-ink-muted">Data ikut snapshot bot - baru ≤60 detik setelah dipasang/dicabut (termasuk lewat nxadmin Discord).</p>
        {holders.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Belum ada.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {holders.map((h) => (
              <li key={h.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-soft bg-card-cream/60 px-4 py-2.5">
                <span><b className="!text-ink">{h.username}</b> <span className="font-mono text-xs text-ink-muted">{h.userId}</span></span>
                <span className="flex items-center gap-3">
                  <RichText text={h.adminTitle} />
                  <button type="button" disabled={busy} onClick={() => setConfirm({ userId: h.userId, username: h.username })}
                    className="rounded-lg border border-danger/40 px-3 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10 cursor-pointer disabled:opacity-40">Hapus</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirm && (
        <ConfirmModal
          title="Hapus Admin Title?"
          body={`Admin Title ${confirm.username} akan dicabut. Web ikut menghapus catatannya saat bot push berikutnya.`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => doSend('clear_admin_title', { userId: confirm.userId }, 'Clear Admin Title')}
          busy={busy}
        />
      )}
    </div>
  );
}
