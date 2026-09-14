'use client';

import { useEffect, useRef, useState } from 'react';
import { emojiSrc } from '../lib/emojisClient';

// Kartu profil mini pemain di halaman Leaderboard: muncul saat nama pemain
// diklik. Data 100% dari snapshot bot (leaderboard + richest) - tidak ada
// request tambahan. Avatar fresh dikirim bot tiap push (60 dtk), jadi ganti
// PP di Discord otomatis kebaca.
export default function PlayerProfileCard({ player, onClose }) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 10);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  if (!player) return null;

  const initials = String(player.username || '?').slice(0, 2).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-5 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Profil ${player.username}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        className={`w-full max-w-sm overflow-hidden rounded-2xl border border-border-soft bg-card-cream shadow-2xl transition-all duration-200 ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
      >
        {/* Header */}
        <div className="nx-dark px-5 py-5">
          <div className="flex items-center gap-4">
            {player.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.avatarUrl}
                alt={player.username}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full ring-2 ring-accent shadow-[0_0_20px_rgba(241,154,26,0.35)]"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent font-display text-xl text-white shadow-[0_0_20px_rgba(241,154,26,0.35)]">
                {initials}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-lg text-card-cream">{player.username}</p>
              {player.rank != null && (
                <p className="mt-0.5 text-xs text-[#A99C8E]">
                  Peringkat #{player.rank} {player.board === 'richest' ? '· Terkaya' : '· Top Pemain'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Statistik */}
        <div className="grid grid-cols-3 gap-2 px-5 py-4">
          <Stat
            icon="goldcoin"
            label={player.board === 'richest' ? 'Saldo' : 'Poin'}
            value={Number(player.points).toLocaleString('id-ID')}
          />
          {player.level != null && <Stat icon="star" label="Level" value={String(player.level)} />}
          {player.wins != null && <Stat icon="trophy" label="Menang" value={String(player.wins)} />}
          {player.level == null && player.wins == null && (
            <Stat icon="sparkles" label="Status" value={player.board === 'richest' ? 'Terkaya' : 'Pemain'} />
          )}
        </div>

        <div className="border-t border-border-soft px-5 py-3">
          <p className="text-center text-[0.7rem] text-[#A99C8E]">
            Lihat profil lengkap & statistiknya in-game via <code className="font-mono">nxp</code> di Discord.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-border-soft bg-white/60 px-3 py-2.5 text-center">
      {emojiSrc(icon) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={emojiSrc(icon)} alt="" width={16} height={16} className="mx-auto mb-1 h-4 w-4" />
      )}
      <p className="font-display text-sm text-ink">{value}</p>
      <p className="text-[0.6rem] uppercase tracking-wider text-ink-muted">{label}</p>
    </div>
  );
}
