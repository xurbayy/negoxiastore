'use client';

import { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import { fmtRingkas, fmtPenuh } from '../../lib/formatClient';

export default function BankManager({ send, data }) {
  const loans = data.snapshot?.loans || [];
  const [confirm, setConfirm] = useState(null); // { userId, username }
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  async function doClear() {
    setBusy(true);
    try {
      const out = await send('clear_loan', { userId: confirm.userId });
      setFeedback(out.ok ? { ok: true, text: `clear_loan untuk ${confirm.username} masuk antrean (#${out.id}).` } : { ok: false, text: out.error || 'Gagal.' });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl text-ink">Bank Manager</h2>
      {feedback && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{feedback.text}</p>
      )}
      <div className="nx-card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-3">Pemain</th>
              <th className="px-4 py-3 text-right">Total Due</th>
              <th className="px-4 py-3">Jatuh Tempo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-ink-muted">Tidak ada pinjaman aktif.</td></tr>
            )}
            {loans.map((l) => (
              <tr key={l.userId} className="border-b border-border-soft/60 last:border-0">
                <td className="px-4 py-3 font-semibold text-ink">{l.username}</td>
                <td className="px-4 py-3 text-right text-ink" title={fmtPenuh(l.totalDue)}>{fmtRingkas(l.totalDue)}</td>
                <td className="px-4 py-3 text-ink-muted">{new Date(l.dueDate).toLocaleDateString('id-ID')}</td>
                <td className="px-4 py-3">
                  {l.overdue
                    ? <span className="inline-flex items-center rounded-full bg-danger px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-white">Telat</span>
                    : <span className="inline-flex items-center rounded-full bg-success px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-white">Aman</span>}
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => setConfirm({ userId: l.userId, username: l.username })} className="rounded-lg border border-danger/40 bg-white px-2.5 py-1 text-xs font-semibold text-danger shadow-sm transition hover:bg-danger hover:text-white active:translate-y-px cursor-pointer">
                    Bebaskan Hutang
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <ConfirmModal
          title="Bebaskan hutang?"
          body={`Hutang ${confirm.username} akan dihapus oleh bot lewat perintah clear_loan. Lanjutkan?`}
          onCancel={() => setConfirm(null)}
          onConfirm={doClear}
          busy={busy}
        />
      )}
    </div>
  );
}
