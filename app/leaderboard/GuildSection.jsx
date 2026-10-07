'use client';

import { useState } from 'react';
import { emojiSrc, emojiSrcStatis } from '../lib/emojisClient';
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
//     rumus sama dengan bot, TANPA emoji) + WINRATE (W/L + persen, emoji
//     bot :ClashingSwords:) + label kolom poin = "Poin"
// Login hanya dibutuhkan saat klik share (dicek di sisi klien), sama seperti
// kartu pemain. Data tabel tetap dari server (getLiveGuildBoard) - komponen
// ini hanya menangani interaksi. `myGuildCode` dari server (getUserGuild).
export default function GuildSection({ guilds, loggedIn, myGuildCode = null }) {
  const [selected, setSelected] = useState(null);
  const isMyGuild = (code) => myGuildCode && code && String(code) === String(myGuildCode);
  const rowMe = 'bg-accent/15 border-l-4 border-l-accent';

  return (
    <section className="mt-12" aria-labelledby="lb-guild">
      {/* JUDUL DIPERJELAS (permintaan pemilik 2026-10-07): "kasih jelas
          10 guild terkuat gitu ada info jelas seperti top pemain" - dulu
          cuma "Guild Terkuat", sekarang sejajar dengan "Top 10 Pemain". */}
      <h2 id="lb-guild" className="font-display text-xl text-ink">
        {emojiSrc('castle') && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emojiSrc('castle')} alt="" width={20} height={20} className="mr-2 inline h-5 w-5 align-middle" />
        )}
        Top 10 Guild Terkuat
      </h2>
      <div className="nx-card nx-scroll mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
              <th scope="col" className="px-4 py-3">#</th>
              <th scope="col" className="px-4 py-3">Guild</th>
              {/* URUTAN KOLOM: WIN + Level + Member (permintaan pemilik
                  2026-10-07: 'urutannya tu WIN LEVEL MEMBER') - Poin &
                  Winrate ditarik dulu. */}
              <th scope="col" className="px-4 py-3 text-right">WIN</th>
              <th scope="col" className="px-4 py-3 text-right">Level</th>
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
              <tr key={g.code || g.rank + g.name} className={`border-b border-border-soft/60 last:border-0 ${isMyGuild(g.code) ? rowMe : 'hover:bg-card-cream/60'}`}>
                <td className="px-4 py-3 font-display text-ink">
                  {/* Emoji podium SAMA dengan tabel pemain (permintaan pemilik
                      2026-10-07): #1 = emoji GIF party (1516446871785046149,
                      pengganti mahkota), medali #2/#3. */}
                  {Number(g.rank) === 1 && emojiSrc('party') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emojiSrc('party')} onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = emojiSrcStatis('party', 64); } }} alt="" width={18} height={18} className="mr-1 inline h-4 w-4 align-middle" />
                  )}
                  {Number(g.rank) > 1 && Number(g.rank) <= 3 && emojiSrc('medal') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emojiSrc('medal')} onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = emojiSrcStatis('medal', 64); } }} alt="" width={16} height={16} className="mr-1 inline h-4 w-4 align-middle" />
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
                      className="group inline-flex min-w-[160px] flex-1 items-center gap-2 text-left font-semibold text-ink transition hover:text-accent-hover cursor-pointer disabled:cursor-default"
                      aria-label={`Lihat detail guild ${stripEmojiToken(g.name)}`}
                    >
                      {/* Emoji guild dari kolom guilds.emoji (bot) - nama tampil bersih.
                          NAMA GUILD: tidak dipotong (wrap-anywhere) - sama dengan
                          permintaan nama user di tabel pemain. */}
                      <GuildEmoji token={g.emoji} size={18} />
                      <span className="min-w-0 wrap-anywhere">{stripEmojiToken(g.name)}</span>
                      {isMyGuild(g.code) && (
                        // Pill "Guild Kamu" - pola sama pill "Kamu" di tabel pemain.
                        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Guild Kamu</span>
                      )}
                    </button>
                    {adaKode && <ShareGuildCardButton guild={g} loggedIn={loggedIn} />}
                  </div>
                </td>
                {/* WIN: jumlah MENANG war - angka polos tanpa emoji
                    (permintaan: urutan WIN LEVEL MEMBER). */}
                <td className="px-4 py-3 text-right" title={`${g.warWins || 0} menang`}>{g.warWins ?? 0}</td>
                {/* LEVEL: TANPA emoji, level = DARI MENANG WAR (revisi:
                    "level itu diambil dari win di guild itu") - tooltip
                    tampilkan progres menang. */}
                <td className="px-4 py-3 text-right">
                  <span className="font-display text-ink" title={`${g.xpDiLevel || 0} / ${g.xpButuhLevel || 0} menang lagi ke level berikutnya`}>
                    {g.level ?? '-'}
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
