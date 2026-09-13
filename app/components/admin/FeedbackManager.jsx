'use client';

import { useState } from 'react';

export default function FeedbackManager({ send, data }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  if (!data?.feedback) return null;

  const filtered = data.feedback.filter((f) => {
    const q = search.toLowerCase();
    return (
      String(f.message || '').toLowerCase().includes(q) ||
      String(f.username || '').toLowerCase().includes(q) ||
      String(f.discordId || '').includes(q)
    );
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleDelete = async (id) => {
    if (!confirm('Yakin ingin menghapus feedback ini?')) return;
    // Panggil action delete_feedback ke API admin
    await send('delete_feedback', { id });
  };

  const getKindColor = (kind) => {
    switch (String(kind || '').toLowerCase()) {
      case 'bug': return 'bg-danger text-white';
      case 'laporan': return 'bg-warning text-black';
      default: return 'bg-accent !text-ink';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Feedback</h2>
          <p className="text-sm text-ink-muted">Saran, bug, dan laporan dari pemain.</p>
        </div>
        <div className="flex w-full sm:w-64 relative items-center">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted flex items-center justify-center pointer-events-none">🔍</span>
          <input
            type="text"
            placeholder="Cari kata kunci / username..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-border-soft bg-bg-soft px-3 py-2 pl-9 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="nx-card overflow-hidden">
        {paginated.length === 0 ? (
          <div className="p-8 text-center text-ink-muted">Belum ada feedback / tidak ditemukan.</div>
        ) : (
          <ul className="divide-y divide-border-soft/60">
            {paginated.map((f) => (
              <li key={f.id} className="flex flex-col gap-3 p-4 hover:bg-bg-soft/50 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wider ${getKindColor(f.kind)}`}>
                      {f.kind}
                    </span>
                    <span className="font-semibold text-ink">{f.username}</span>
                    <span className="text-ink-muted">({f.discordId})</span>
                    <span className="text-ink-muted">· {new Date(f.createdAt).toLocaleString('id-ID')}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{f.message}</p>
                  <p className="text-xs text-ink-muted">📍 Sumber: <span className="font-mono text-border-hover">Web</span></p>
                </div>
                <button
                  onClick={() => handleDelete(f.id)}
                  className="shrink-0 self-start rounded-lg border border-danger/20 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border-soft bg-bg px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-bg-soft disabled:opacity-50"
          >
            &laquo; Prev
          </button>
          <span className="text-sm text-ink-muted">
            Halaman {page} dari {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-border-soft bg-bg px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-bg-soft disabled:opacity-50"
          >
            Next &raquo;
          </button>
        </div>
      )}
    </div>
  );
}
