'use client';

import { useState } from 'react';

// Jam render lewat helper module (pola sama seperti Dashboard) -> aman dari
// aturan purity react-hooks.
function nowMs() {
  return Date.now();
}

export default function Moderasi({ send, data }) {
  const [discordId, setDiscordId] = useState('');
  const [reason, setReason] = useState('Melanggar ToS');
  const [mins, setMins] = useState(60);
  const [modal, setModal] = useState(null); // { action, message, confirmText }
  
  const [filter, setFilter] = useState('all'); // 'all', 'ban', 'timeout'
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const rawList = data?.snapshot?.monitor?.bannedUsers || [];
  const bannedOf = (b) => b.user_id ?? b.userId;
  const timeoutOf = (b) => Number(b.timeout_until ?? b.timeoutUntil) || 0;
  const filteredList = rawList.filter((b) => {
    if (filter === 'ban') return timeoutOf(b) === 0;
    if (filter === 'timeout') return timeoutOf(b) > 0;
    return true;
  });
  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
  const paginated = filteredList.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const initiateAction = (action, targetId = discordId) => {
    if (!targetId) {
      setModal({ action: 'alert', message: 'Discord ID tujuan wajib diisi!', confirmText: 'OK' });
      return;
    }
    
    let msg = '';
    let btn = '';
    if (action === 'timeout') {
      if (!mins || mins <= 0) {
        setModal({ action: 'alert', message: 'Menit timeout tidak valid!', confirmText: 'OK' });
        return;
      }
      msg = `Yakin ingin timeout ID ${targetId} selama ${mins} menit?\nAlasan: ${reason}`;
      btn = 'Timeout Player';
    } else if (action === 'ban') {
      msg = `Yakin ingin BANNED PERMANEN ID ${targetId}?\nAlasan: ${reason}`;
      btn = 'Banned Permanen';
    } else if (action === 'unban') {
      msg = `Yakin ingin mencabut hukuman Ban/Timeout untuk ID ${targetId}?`;
      btn = 'Cabut Hukuman';
    } else if (action === 'wipe') {
      msg = `YAKIN INGIN MENGHAPUS SEMUA DATA UNTUK ID ${targetId}?\nTindakan ini menghapus progres, poin, dan barang mereka secara permanen!`;
      btn = 'Hapus Semua Data';
    }

    setModal({ action, targetId, message: msg, confirmText: btn });
  };

  const confirmAction = () => {
    if (!modal) return;
    if (modal.action === 'alert') {
      setModal(null);
      return;
    }

    const payload = { userId: modal.targetId };
    if (modal.action === 'timeout') {
      payload.mins = parseInt(mins, 10);
      payload.reason = reason;
    } else if (modal.action === 'ban') {
      payload.reason = reason;
    }

    send(modal.action, payload);
    setModal(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink">Sanksi & Moderasi</h2>
        <p className="mt-1 text-sm text-ink-muted">Berikan hukuman kepada pemain yang melanggar aturan.</p>
      </div>

      <div className="nx-card p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-ink-muted">Target Discord ID</label>
            <input
              type="text"
              value={discordId}
              onChange={(e) => setDiscordId(e.target.value.replace(/\D/g, ''))}
              placeholder="123456789012345678"
              className="w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-ink-muted">Alasan Sanksi</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Alasan, opsional untuk unban dan reset"
              className="w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-border-soft/60 pt-6 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-2 block text-sm font-semibold text-warning">1. Berikan Timeout Sementara</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={mins}
                onChange={(e) => setMins(parseInt(e.target.value) || 1)}
                className="w-24 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                title="Durasi dalam menit"
              />
              <span className="self-center text-sm text-ink-muted">menit</span>
              <button
                onClick={() => initiateAction('timeout')}
                className="ml-2 rounded-lg bg-warning px-5 py-2 text-sm font-bold text-black shadow-sm transition hover:brightness-105 active:scale-95 cursor-pointer"
              >
                Timeout
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-border-soft/60 pt-6 sm:flex-row">
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-semibold text-danger">2. Ban Permanen</label>
            <button
              onClick={() => initiateAction('ban')}
              className="w-full rounded-lg bg-danger px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-105 active:scale-95 sm:w-auto cursor-pointer"
            >
              Banned User
            </button>
          </div>

          <div className="flex-1 space-y-2">
            <label className="block text-sm font-semibold text-success">3. Pulihkan Akses Unban</label>
            <button
              onClick={() => initiateAction('unban')}
              className="w-full rounded-lg bg-success px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-105 active:scale-95 sm:w-auto cursor-pointer"
            >
              Cabut Ban / Timeout
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-border-soft/60 pt-6">
          <label className="block text-sm font-semibold text-danger">4. Reset Data Total</label>
          <p className="text-xs text-ink-muted max-w-lg mb-2">Peringatan: Menghapus seluruh data progres, level, inventori, title, dan saldo pengguna. Tidak bisa dibatalkan!</p>
          <button
            onClick={() => initiateAction('wipe')}
            className="w-full rounded-lg border border-danger/40 bg-white px-5 py-2 text-sm font-bold text-danger shadow-sm transition hover:bg-danger hover:text-white active:scale-95 sm:w-auto self-start cursor-pointer"
          >
            Reset Data Player Ini
          </button>
        </div>
      </div>

      <div className="nx-card p-5 mt-6">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-lg font-bold text-ink">Daftar Hukuman Aktif</h3>
          <div className="flex gap-2">
            <button
              onClick={() => { setFilter('all'); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${filter === 'all' ? 'bg-ink text-white' : 'bg-bg-soft text-ink-muted hover:bg-border-soft'}`}
            >
              Semua
            </button>
            <button
              onClick={() => { setFilter('timeout'); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${filter === 'timeout' ? 'bg-warning text-black' : 'bg-bg-soft text-ink-muted hover:bg-border-soft'}`}
            >
              Timeout
            </button>
            <button
              onClick={() => { setFilter('ban'); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${filter === 'ban' ? 'bg-danger text-white' : 'bg-bg-soft text-ink-muted hover:bg-border-soft'}`}
            >
              Banned
            </button>
          </div>
        </div>
        
        {paginated.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-6">Tidak ada player yang sedang dihukum di kategori ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ink-muted">
              <thead className="border-b border-border-soft bg-bg-soft/50 text-xs font-semibold uppercase tracking-wider text-ink">
                <tr>
                  <th className="px-4 py-3">Discord ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Alasan</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft/40">
                {paginated.map((b) => {
                  // Payload snapshot bot memakai kolom snake_case (banned_users SELECT)
                  const userId = bannedOf(b);
                  const until = timeoutOf(b);
                  // Timeout yang sudah lewat masa berlaku = sanksi selesai (bot
                  // membersihkan barisnya saat user cek in-game berikutnya).
                  const expiredTimeout = until > 0 && nowMs() > until;
                  const isTimeout = until > 0;
                  const statusText = isTimeout ? (expiredTimeout ? 'Timeout (berakhir)' : 'Timeout') : 'Banned';
                  const statusColor = isTimeout
                    ? (expiredTimeout ? 'bg-border-soft/60 text-ink-muted border-border-soft' : 'bg-warning/10 text-warning border-warning/40')
                    : 'bg-danger/10 text-danger border-danger/40';

                  return (
                    <tr key={userId} className={`transition-colors hover:bg-bg-soft/30 ${expiredTimeout ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs">{userId}</td>
                      <td className="px-4 py-3">
                        <span className={`nx-badge border ${statusColor}`}>
                          {statusText}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={b.reason}>{b.reason || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setDiscordId(bannedOf(b)); initiateAction('unban', bannedOf(b)); }}
                          className="rounded-lg border border-success/40 bg-white px-3 py-1 text-xs font-bold text-success shadow-sm transition hover:bg-success hover:text-white active:scale-95 cursor-pointer"
                        >
                          Unban/Cabut
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-border-soft/60 pt-4">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-border-soft bg-bg-soft px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40 cursor-pointer"
                >
                  &larr; Prev
                </button>
                <span className="text-xs font-semibold text-ink-muted">Hal {page} dari {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-border-soft bg-bg-soft px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-40 cursor-pointer"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-border-soft/50">
            <h3 className="mb-2 text-lg font-bold text-ink">
              {modal.action === 'alert' ? 'Perhatian' : 'Konfirmasi Aksi'}
            </h3>
            <p className="mb-6 text-sm leading-relaxed text-ink-muted">{modal.message}</p>
            <div className="flex justify-end gap-3">
              {modal.action !== 'alert' && (
                <button
                  onClick={() => setModal(null)}
                  className="rounded-lg border border-border-soft bg-bg-soft px-4 py-2 text-sm font-medium text-ink transition hover:bg-border-soft cursor-pointer"
                >
                  Batal
                </button>
              )}
              <button
                onClick={modal.action === 'alert' ? () => setModal(null) : confirmAction}
                className={`rounded-lg px-5 py-2 text-sm font-bold shadow-md transition hover:brightness-105 active:scale-95 cursor-pointer ${
                  modal.action === 'alert' ? 'bg-accent text-white' : 'bg-danger text-white'
                }`}
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
