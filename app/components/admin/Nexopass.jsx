'use client';

import { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import { fmt } from '../../lib/formatClient';

// NEXO Pass: daftar member premium aktif + grant/revoke.
export default function Nexopass({ send, data }) {
  const members = data.snapshot?.premiumMembers || [];
  const [confirm, setConfirm] = useState(null); // { action, payload, label }
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ userId: '', days: 30 });

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

  function grant(e) {
    e.preventDefault();
    if (!form.userId.trim()) return;
    // Satu-satunya tier yang dijual: pro. (basic/beta cuma peninggalan sistem,
    // jangan muncul di ruang kerja.)
    doSend('grant_premium', { userId: form.userId.trim(), tier: 'pro', days: form.days });
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl text-ink">NEXO Pass: Member Aktif ({members.length})</h2>

      {/* Form grant */}
      <form onSubmit={grant} className="nx-card flex flex-wrap items-end gap-3 px-5 py-5">
        <div>
          <label htmlFor="g-userid" className="block text-xs uppercase tracking-wider text-ink-muted">Discord User ID</label>
          <input id="g-userid" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value.replace(/\D/g, '') })} placeholder="83638..." className="mt-1.5 w-52 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <div>
          <label htmlFor="g-days" className="block text-xs uppercase tracking-wider text-ink-muted">Hari (30 = 1 bulan, 3650 = seumur hidup)</label>
          <input id="g-days" type="number" value={form.days} onChange={(e) => setForm({ ...form, days: parseInt(e.target.value, 10) || 0 })} className="mt-1.5 w-32 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <button type="submit" disabled={busy || !form.userId} className="rounded-lg bg-accent text-ink! px-5 py-2 text-sm font-bold text-white shadow-md transition hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:shadow-sm disabled:opacity-40 cursor-pointer">Grant</button>
      </form>

      {feedback && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{feedback.text}</p>
      )}

      {/* Tabel member */}
      <div className="nx-card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-3">Member</th>
                            <th className="px-4 py-3">Berakhir</th>
              <th className="px-4 py-3">Granted By</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr><td colSpan="4" className="px-4 py-8 text-center text-ink-muted">Belum ada member premium aktif.</td></tr>
            )}
            {members.map((m) => {
              const daysLeft = Math.ceil((m.expiresAt - Date.now()) / 86400000);
              // Web clamp grant ke 3650 hari = "seumur hidup efektif"; Discord
              // nxadmin bisa pasang lebih besar - tampilkan LIFETIME untuk itu.
              const isLifetime = !m.expiresAt || daysLeft >= 3650;
              return (
                <tr key={m.userId} className="border-b border-border-soft/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{m.username}</div>
                    <code className="text-xs text-ink-muted">{m.userId}</code>
                  </td>
                                    <td className="px-4 py-3 text-ink-muted">
                    {isLifetime ? 'LIFETIME' : `${fmt(daysLeft)} hari`}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-muted">{m.grantedBy}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setConfirm({ action: 'revoke_premium', payload: { userId: m.userId }, label: `Revoke premium ${m.username}` })} className="rounded-lg border border-danger/40 bg-white px-2.5 py-1 text-xs font-semibold text-danger shadow-sm transition hover:bg-danger hover:text-white active:translate-y-px cursor-pointer">
                      Revoke
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Audit pembayaran (orders terbaru) */}
      <h3 className="pt-4 font-display text-lg text-ink">Audit Pembayaran</h3>
      <div className="nx-card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Waktu</th>
            </tr>
          </thead>
          <tbody>
            {(data.orders || []).length === 0 && (
              <tr><td colSpan="5" className="px-4 py-6 text-center text-ink-muted">Belum ada order.</td></tr>
            )}
            {(data.orders || []).map((o) => (
              <tr key={o.id} className="border-b border-border-soft/60 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-ink-muted">#{o.id} {o.plan}</td>
                <td className="px-4 py-3 font-mono text-xs">{o.discordId}</td>
                <td className="px-4 py-3 text-right">Rp {fmt(o.amount)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider ${o.status === 'paid' ? 'bg-success text-white' : o.status === 'pending' ? 'bg-accent text-ink' : 'bg-card-dark-2 text-ink-faint'}`}>{o.status === 'pending' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-80" aria-hidden="true" />}{o.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-muted">{new Date(o.createdAt).toLocaleString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmModal
          title={`${confirm.label}?`}
          body="Premium akan dicabut dari user ini oleh bot. Lanjutkan?"
          onCancel={() => setConfirm(null)}
          onConfirm={() => doSend(confirm.action, confirm.payload)}
          busy={busy}
        />
      )}
    </div>
  );
}
