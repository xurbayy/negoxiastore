'use client';

import { useState } from 'react';
import TabelGeser from './TabelGeser';
import ConfirmModal from './ConfirmModal';
import { fmtRingkas } from '../../lib/formatClient';

// Redeem & Event Manager: daftar kode + buat/hapus.
export default function RedeemManager({ send, data }) {
  const cacheByCode = {};
  for (const c of data.promoCache || []) cacheByCode[c.code] = c;
  // DATA LIVE DARI DB (2026-10-03): dulu dari snapshot push (bisa basi 60+ dtk)
  // -> admin mengira kode gagal dibuat. Sekarang dari data.promoCodes (query
  // langsung). Fallback ke snapshot kalau field DB tak ada.
  const sumberKode = data.promoCodes || data.snapshot?.promoCodes || [];
  const codes = sumberKode.map((p) => {
    const c = cacheByCode[String(p.code).toUpperCase()];
    return { ...p, live: c ? { remaining: c.remaining, exhausted: c.exhausted } : null };
  });
  const [confirm, setConfirm] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: '', rewardType: 'points', rewardValue: '', quota: 100 });

  async function doSend(action, payload) {
    setBusy(true);
    try {
      const out = await send(action, payload);
      setFeedback(out.ok ? { ok: true, text: out.langsung
        ? `${action} berhasil dijalankan langsung - data diperbarui otomatis.`
        : `${action} masuk antrean (#${out.id}).` } : { ok: false, text: out.error || 'Gagal.' });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  function create(e) {
    e.preventDefault();
    doSend('create_promo', {
      code: form.code.trim().toUpperCase(),
      rewardType: form.rewardType,
      rewardValue: form.rewardValue.trim(),
      quota: form.quota,
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl text-ink">Redeem Manager</h2>

      {/* Buat kode */}
      <form onSubmit={create} className="nx-card flex flex-wrap items-end gap-3 px-4 py-4 sm:px-5 sm:py-5">
        <div>
          <label htmlFor="p-code" className="block text-xs uppercase tracking-wider text-ink-muted">Kode</label>
          <input id="p-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="NEXO2026" maxLength={24} className="mt-1.5 w-40 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm uppercase text-ink focus:border-accent focus:outline-none" />
        </div>
        <div>
          <label htmlFor="p-type" className="block text-xs uppercase tracking-wider text-ink-muted">Reward</label>
          <select id="p-type" value={form.rewardType} onChange={(e) => setForm({ ...form, rewardType: e.target.value })} className="mt-1.5 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none">
            <option value="points">points</option>
            <option value="item">item, isi dengan itemKey</option>
            <option value="title">title</option>
            <option value="premium">NEXO Pass, isi jumlah hari</option>
          </select>
        </div>
        <div>
          <label htmlFor="p-value" className="block text-xs uppercase tracking-wider text-ink-muted">Value</label>
          <input id="p-value" value={form.rewardValue} onChange={(e) => setForm({ ...form, rewardValue: e.target.value })} placeholder={form.rewardType === 'premium' ? '30' : '10000 / item_key'} className="mt-1.5 w-40 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <div>
          <label htmlFor="p-quota" className="block text-xs uppercase tracking-wider text-ink-muted">Kuota</label>
          <input id="p-quota" type="number" value={form.quota} onChange={(e) => setForm({ ...form, quota: parseInt(e.target.value, 10) || 0 })} className="mt-1.5 w-24 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <button type="submit" disabled={busy || !form.code || !form.rewardValue} className="btn-solid btn-solid-accent disabled:opacity-40">Buat Kode</button>
      </form>

      {feedback && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{feedback.text}</p>
      )}

      {/* Kabari kode baru ke lonceng user (type 'token' - khusus Redeem) */}
      <NotifyForm codes={codes} onSent={() => {}} />

      {/* Tabel kode */}
      <TabelGeser className="nx-card">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Reward</th>
              <th className="px-4 py-3 w-48">Klaim</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 && (
              <tr><td colSpan="4" className="px-4 py-8 text-center text-ink-muted">Belum ada kode promo.</td></tr>
            )}
            {codes.map((c) => {
              const remaining = c.live ? c.live.remaining : Math.max(0, Number(c.quota) - Number(c.claimed));
              const habis = c.live ? c.live.exhausted || remaining <= 0 : Number(c.claimed) >= Number(c.quota);
              const pct = Math.min(100, Math.round(((Number(c.quota) - remaining) / Math.max(1, Number(c.quota))) * 100));
              return (
                <tr key={c.code} className="border-b border-border-soft/60 last:border-0">
                  <td className="px-4 py-3 font-mono font-bold text-ink">{c.code}</td>
                  <td className="px-4 py-3 text-ink">
                    {c.rewardType === 'points' ? `${fmtRingkas(c.rewardValue)} pts` : c.rewardType === 'premium' ? `NEXO Pass ${c.rewardValue} hari` : `${c.rewardType}: ${c.rewardValue}`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-soft">
                        <div className={`h-full rounded-full ${habis ? 'bg-danger' : 'bg-success'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-ink-muted">sisa {fmtRingkas(remaining)}/{fmtRingkas(c.quota)}{habis ? ' · HABIS' : ''}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setConfirm({ code: c.code })} className="btn-solid btn-solid-danger">Hapus</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TabelGeser>

      {confirm && (
        <ConfirmModal
          title={`Hapus kode ${confirm.code}?`}
          body="Kode akan dihapus dari bot dan tidak bisa diredeem lagi. Lanjutkan?"
          onCancel={() => setConfirm(null)}
          onConfirm={() => doSend('delete_promo', { code: confirm.code })}
          busy={busy}
        />
      )}
    </div>
  );
}

// Form kirim notifikasi KODE ke inbox user (web_notifications, type 'token').
// Hanya di tab Redeem - broadcast umum ada di tab Broadcast sendiri.
function NotifyForm({ codes, onSent }) {
  const [form, setForm] = useState({ target: 'all', targetOne: '', code: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const target = form.target === 'all' ? 'all' : form.targetOne.trim();
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, type: 'token', code: form.code, title: `Kode ${form.code} tersedia untukmu`, body: 'Klaim langsung dari web sebelum kuota habis.' }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        setMsg({ ok: true, text: `Notifikasi kode ${form.code} terkirim ke ${d.target}.` });
        onSent(`Notifikasi kode ${form.code} terkirim ke ${d.target}.`);
      } else {
        setMsg({ ok: false, text: d.error || 'Gagal.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="nx-card px-4 py-4 sm:px-5 sm:py-5">
      <h3 className="font-display text-lg text-ink">Kabari Kode Baru</h3>
      <p className="mt-1 text-xs text-ink-muted">Kirim notifikasi &quot;token&quot; ke lonceng user - tampil dengan kode + tombol Klaim. Untuk broadcast umum seperti info, event, atau maintenance, pakai tab Broadcast.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-muted">Target</label>
          <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="mt-1.5 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none">
            <option value="all">Semua user</option>
            <option value="one">1 user, pakai Discord ID</option>
          </select>
        </div>
        {form.target === 'one' && (
          <div>
            <label className="block text-xs uppercase tracking-wider text-ink-muted">Discord ID</label>
            <input value={form.targetOne} onChange={(e) => setForm({ ...form, targetOne: e.target.value.replace(/\D/g, '') })} placeholder="83638..." className="mt-1.5 w-44 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none" />
          </div>
        )}
        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-muted">Kode</label>
          <select value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1.5 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none">
            <option value="">pilih kode...</option>
            {codes.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={busy || !form.code || (form.target === 'one' && !/^\d{5,25}$/.test(form.targetOne))} className="btn-solid btn-solid-accent disabled:opacity-40">Kirim</button>
      </div>
      {msg && (
        <p className={`mt-3 rounded-xl border px-4 py-3 text-sm ${msg.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{msg.text}</p>
      )}
    </form>
  );
}
