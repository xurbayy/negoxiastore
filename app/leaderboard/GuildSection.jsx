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
//   - Kalau user login & punya guild: barisnya DI-HIGHLIGHT + pill "Guild
//     Kamu" (permintaan pemilik 2026-10-07, pola sama pill "Kamu" pemain)
//   - KOLOM BARU (permintaan pemilik 2026-10-07): LEVEL (dari total poin,
//     rumus sama dengan bot) + WINRATE (W/L + persen, emoji bot:
//     :sun58: level, :ClashingSwords: war)
// Login hanya dibutuhkan saat klik share (dicek di sisi klien), sama seperti
// kartu pemain. Data tabel tetap dari server (getLiveGuildBoard) - komponen
// ini hanya menangani interaksi. `myGuildCode` dari server (getUserGuild).
export default function GuildSection({ guilds, loggedIn, myGuildCode = null }) {
  const [selected, setSelected] = useState(null);
  const isMyGuild = (code) => myGuildCode && code && String(code) === String(myGuildCode);
  const rowMe = 'bg-accent/15 border-l-4 border-l-accent';

  // Winrate ditampilkan "3W / 2L (60%)" - "Belum war" kalau 0 war (null).
  const teksWinrate = (g) => {
    const w = Number(g.warWins || 0);
    const l = Number(g.warLosses || 0);
    if (w + l === 0) return 'Belum war';
    return `${w}W / ${l}L (${g.winrate != null ? g.winrate : Math.round((w / (w + l)) * 100)}%)`;
  };

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
              <th scope="col" className="px-4 py-3 text-right">Level</th>
              <th scope="col" className="px-4 py-3 text-right">Total Poin</th>
              <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">Winrate</th>
              <th scope="col" className="px-4 py-3 text-right">Member</th>
            </tr>
          </thead>
          <tbody>
            {guilds.length === 0 && (
              <tr><td colSpan="6" className="px-4 py-6 text-center text-ink-muted">Belum ada guild terdaftar.</td></tr>
            )}
            {guilds.map((g) => {
              // Guard: fallback snapshot lama tidak punya `code` - kalau tidak
              // ada kode, jangan render tombol klik/share (fetch akan 404).
              const adaKode = Boolean(g.code);
              return (
              <tr key={g.code || g.rank + g.name} className={`border-b border-border-soft/60 last:border-0 ${isMyGuild(g.code) ? rowMe : 'hover:bg-card-cream/60'}`}>
                <td className="px-4 py-3 font-display text-ink">
                  {/* Emoji podium SAMA dengan tabel pemain (permintaan pemilik
                      2026-10-07): mahkota #1, medali #2/#3. */}
                  {Number(g.rank) === 1 && emojiSrc('crown') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emojiSrc('crown')} alt="" width={18} height={18} className="mr-1 inline h-4 w-4 align-middle" />
                  )}
                  {Number(g.rank) > 1 && Number(g.rank) <= 3 && emojiSrc('medal') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emojiSrc('medal')} alt="" width={16} height={16} className="mr-1 inline h-4 w-4 align-middle" />
                  )}
                  {g.rank}
                </td>
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
                      {isMyGuild(g.code) && (
                        // Pill "Guild Kamu" - pola sama pill "Kamu" di tabel pemain.
                        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Guild Kamu</span>
                      )}
                    </button>
                    {adaKode && <ShareGuildCardButton guild={g} loggedIn={loggedIn} />}
                  </div>
                </td>
                {/* LEVEL: emoji :sun58: SAMA dengan bot (nxg/nxlb). */}
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1.5 font-display text-ink" title={`${(g.xpDiLevel || 0).toLocaleString('id-ID')} / ${(g.xpButuhLevel || 0).toLocaleString('id-ID')} poin ke level berikutnya`}>
                    {emojiSrc('sun58') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('sun58')} alt="" width={16} height={16} className="inline h-4 w-4" />
                    )}
                    {g.level ?? '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right" title={fmtPenuh(g.points)}>{fmtRingkas(g.points)}</td>
                {/* WINRATE: emoji :ClashingSwords: SAMA dengan bot. */}
                <td className="hidden px-4 py-3 text-right text-ink-muted sm:table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    {emojiSrc('swords') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('swords')} alt="" width={16} height={16} className="inline h-4 w-4" />
                    )}
                    {teksWinrate(g)}
                  </span>
                </td>
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
