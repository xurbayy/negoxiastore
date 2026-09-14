'use client';

import { useState } from 'react';
import { emojiSrc } from '../lib/emojisClient';
import PlayerProfileCard from '../components/PlayerProfileCard';

// Klien leaderboard: baris pemain jadi TOMBOL yang membuka kartu profil mini
// (dengan avatar fresh). Data dari snapshot bot - avatarUrl dikirim tiap push
// (60 dtk), ganti PP di Discord otomatis kebaca <=60 dtk tanpa request tambahan.
// `children` = bagian Guild Terkuat (server component).
export default function LeaderboardClient({ players, myId, children }) {
  const [selected, setSelected] = useState(null);
  const isMe = (id) => myId && String(id) === String(myId);
  const rowMe = 'bg-accent/15 border-l-4 border-l-accent';

  const openCard = (row, board) => setSelected({ ...row, board });

  return (
    <>
      {/* Pemain */}
      <section className="mt-10" aria-labelledby="lb-pemain">
        <h2 id="lb-pemain" className="font-display text-xl text-ink">
          {emojiSrc('trophy') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emojiSrc('trophy')} alt="" width={20} height={20} className="mr-2 inline h-5 w-5 align-middle" />
          )}
          Top 10 Pemain
        </h2>
        <div className="nx-card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
                <th scope="col" className="px-4 py-3">#</th>
                <th scope="col" className="px-4 py-3">Pemain</th>
                <th scope="col" className="px-4 py-3 text-right">Poin</th>
                <th scope="col" className="px-4 py-3 text-right">Level</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 && (
                <tr><td colSpan="4" className="px-4 py-6 text-center text-ink-muted">Belum ada data.</td></tr>
              )}
              {players.map((p) => (
                <tr
                  key={p.userId}
                  className={`border-b border-border-soft/60 last:border-0 ${isMe(p.userId) ? rowMe : 'hover:bg-card-cream/60'}`}
                >
                  <td className="px-4 py-3 font-display text-ink">
                    {Number(p.rank) === 1 && emojiSrc('crown') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('crown')} alt="" width={18} height={18} className="mr-1 inline h-4 w-4 align-middle" />
                    )}
                    {Number(p.rank) > 1 && Number(p.rank) <= 3 && emojiSrc('medal') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('medal')} alt="" width={16} height={16} className="mr-1 inline h-4 w-4 align-middle" />
                    )}
                    {p.rank}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openCard(p, 'top')}
                      className="group inline-flex items-center gap-2.5 text-left font-semibold text-ink transition hover:text-accent-hover cursor-pointer"
                      aria-label={`Lihat profil ${p.username}`}
                    >
                      {p.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatarUrl} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 shrink-0 rounded-full border border-border-soft group-hover:border-accent" />
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[0.65rem] font-bold text-accent-hover">
                          {String(p.username || '?').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate">{p.username}</span>
                      {isMe(p.userId) && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Kamu</span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {emojiSrc('goldcoin') && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc('goldcoin')} alt="" width={16} height={16} className="inline h-4 w-4" />
                      )}
                      {Number(p.points).toLocaleString('id-ID')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-muted">{p.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Guild Terkuat (server component dari page) */}
      {children}

      {selected && <PlayerProfileCard player={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
