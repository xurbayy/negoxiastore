'use client';

import { useState } from 'react';
import { emojiSrc } from '../lib/emojisClient';
import { fmtRingkas, fmtPenuh } from '../lib/formatClient';
import { stripEmojiToken } from '../lib/textUtil';
import GuildEmoji from '../components/GuildEmoji';
import GuildDetailCard from '../components/GuildDetailCard';
import ShareGuildCardButton from '../components/ShareGuildCardButton';

// ==========================================
// SEKSI GUILD TERKUAT (permintaan pemilik 2026-10-07)
// ==========================================
// Sebelumnya tabel guild dirender SERVER tanpa interaksi. Sekarang client:
//   - Nama guild bisa DIKLIK -> modal GuildDetailCard (owner, admin, member
//     + poin masing-masing, transparan)
//   - Tiap baris punya tombol BAGIKAN -> kartu canvas versi guild (semua
//     anggota + poin + badge NEXO Pass di samping nama pemegangnya)
// Login hanya dibutuhkan saat klik share (dicek di sisi klien), sama seperti
// kartu pemain. Data tabel tetap dari server (getLiveGuildBoard) - komponen
// ini hanya menangani interaksi.
export default function GuildSection({ guilds, loggedIn }) {
  const [selected, setSelected] = useState(null);

  return (
    <section className="mt-12" aria-labelledby="lb-guild">
      <h2 id="lb-guild" className="font-display text-xl text-ink">
        {emojiSrc('castle') && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emojiSrc('castle')} alt="" width={20} height={20} className="mr-2 inline h-5 w-5 align-middle" />
        )}
        Guild Terkuat
      </h2>
      <div className="nx-card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
              <th scope="col" className="px-4 py-3">#</th>
              <th scope="col" className="px-4 py-3">Guild</th>
              <th scope="col" className="px-4 py-3 text-right">Total Poin</th>
              <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">War Wins</th>
              <th scope="col" className="px-4 py-3 text-right">Member</th>
            </tr>
          </thead>
          <tbody>
            {guilds.length === 0 && (
              <tr><td colSpan="5" className="px-4 py-6 text-center text-ink-muted">Belum ada guild terdaftar.</td></tr>
            )}
            {guilds.map((g) => {
              // Guard: fallback snapshot lama tidak punya `code` - kalau tidak
              // ada kode, jangan render tombol klik/share (fetch akan 404).
              const adaKode = Boolean(g.code);
              return (
              <tr key={g.code || g.rank + g.name} className="border-b border-border-soft/60 last:border-0 hover:bg-card-cream/60">
                <td className="px-4 py-3 font-display text-ink">{g.rank}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    {/* Klik nama guild -> buka detail (owner/admin/member + poin) */}
                    <button
                      type="button"
                      onClick={() => adaKode && setSelected(g)}
                      disabled={!adaKode}
                      className="group inline-flex min-w-0 flex-1 items-center gap-2 text-left font-semibold text-ink transition hover:text-accent-hover cursor-pointer disabled:cursor-default"
                      aria-label={`Lihat detail guild ${stripEmojiToken(g.name)}`}
                    >
                      {/* Emoji guild dari kolom guilds.emoji (bot) - nama tampil bersih */}
                      <GuildEmoji token={g.emoji} size={18} />
                      <span className="truncate">{stripEmojiToken(g.name)}</span>
                    </button>
                    {adaKode && <ShareGuildCardButton guild={g} loggedIn={loggedIn} />}
                  </div>
                </td>
                <td className="px-4 py-3 text-right" title={fmtPenuh(g.points)}>{fmtRingkas(g.points)}</td>
                <td className="hidden px-4 py-3 text-right text-ink-muted sm:table-cell">{g.warWins}</td>
                <td className="px-4 py-3 text-right text-ink-muted">{g.members}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal detail. Tombol share ikut di header modal - GuildDetailCard
          meneruskan data yang sudah dimuat (cloneElement) supaya klik share
          langsung memakai data yang tampil, tanpa fetch ulang. */}
      {selected && (
        <GuildDetailCard
          code={selected.code}
          onClose={() => setSelected(null)}
          shareButton={<ShareGuildCardButton guild={selected} loggedIn={loggedIn} />}
        />
      )}
    </section>
  );
}
