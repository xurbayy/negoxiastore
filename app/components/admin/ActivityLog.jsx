'use client';

import { useState } from 'react';
import { timeAgo } from '../../lib/formatClient';

const STATUS_STYLE = {
  pending: 'bg-accent text-ink',
  done: 'bg-success text-white',
  failed: 'bg-danger text-white',
  rejected: 'bg-card-dark-2 text-[#A99C8E]',
};

const FILTERS = ['all', 'pending', 'done', 'failed', 'rejected'];
const PER_PAGE = 10;

export default function ActivityLog({ data }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const log = data.log || [];
  const filtered = filter === 'all' ? log : log.filter((r) => r.status === filter);

  // Clamp aman: kalau data mengecil / filter berubah sampai halaman di luar
  // jangkauan, otomatis geser ke halaman terakhir yang valid (tanpa effect).
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  function changeFilter(f) {
    setFilter(f);
    setPage(0);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ink">Activity Log</h2>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => changeFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize shadow-sm transition cursor-pointer ${
                filter === f ? 'border-transparent bg-accent text-ink! text-white' : 'border-border-soft bg-white text-ink-muted hover:border-accent/50 hover:text-ink'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="nx-card overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-3">Waktu</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Payload</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-ink-muted">Belum ada perintah{filter !== 'all' ? ` dengan status ${filter}` : ''}.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border-soft/60 align-top last:border-0">
                <td className="px-4 py-3 text-xs text-ink-muted">{timeAgo(r.createdAt)}</td>
                <td className="px-4 py-3 font-mono text-ink">{r.action}</td>
                <td className="max-w-[220px] px-4 py-3">
                  <code className="break-all text-xs text-ink-muted">{JSON.stringify(r.payload)}</code>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-muted">{r.actorId}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider ${STATUS_STYLE[r.status] || STATUS_STYLE.rejected}`}><span className={`h-1.5 w-1.5 rounded-full bg-current opacity-80 ${r.status === "pending" ? "animate-pulse" : ""}`} aria-hidden="true" />{r.status}</span>
                </td>
                <td className="max-w-[220px] px-4 py-3 text-xs text-ink">{r.result || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pager: Prev · nomor halaman · Next · hitungan baris */}
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            Menampilkan {safePage * PER_PAGE + 1}-{Math.min((safePage + 1) * PER_PAGE, filtered.length)} dari {filtered.length} perintah
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-bg-soft disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              ← Prev
            </button>
            {Array.from({ length: pages }, (_, i) => i)
              .filter((i) => i === 0 || i === pages - 1 || Math.abs(i - safePage) <= 1)
              .map((i, idx, arr) => (
                <span key={i} className="flex items-center gap-1.5">
                  {idx > 0 && arr[idx - 1] !== i - 1 && <span className="text-xs text-ink-muted">…</span>}
                  <button
                    type="button"
                    onClick={() => setPage(i)}
                    aria-current={i === safePage ? 'page' : undefined}
                    className={`h-8 w-8 rounded-lg text-xs font-bold transition cursor-pointer ${
                      i === safePage ? 'bg-accent text-ink' : 'text-ink-muted hover:bg-bg'
                    }`}
                  >
                    {i + 1}
                  </button>
                </span>
              ))}
            <button
              type="button"
              onClick={() => setPage(Math.min(pages - 1, safePage + 1))}
              disabled={safePage >= pages - 1}
              className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-bg-soft disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
