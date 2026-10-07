'use client';

import { useState } from 'react';
import { emojiSrc, emojiSrcStatis } from '../lib/emojisClient';
import { fmtRingkas, fmtPenuh } from '../lib/formatClient';
import { avatarUser } from '../lib/avatarClient';
import PlayerProfileCard from '../components/PlayerProfileCard';
import ShareCardButton from '../components/ShareCardButton';

// Klien leaderboard: baris pemain jadi TOMBOL yang membuka kartu profil mini
// (dengan avatar fresh). Data dari snapshot bot - avatarUrl dikirim tiap push
// (60 dtk), ganti PP di Discord otomatis kebaca <=60 dtk tanpa request tambahan.
// Share (wajib login): tiap baris punya tombol yang merender kartu peringkat
// 4:5 di canvas lalu dibagikan via Web Share API (HP) / unduh (desktop).
// Pemegang NEXO Pass (premiumIds dari snapshot bot) dapat badge logo kecil.
// Bagian Guild Terkuat pindah ke GuildSection (client component sendiri,
// permintaan pemilik 2026-10-07) karena barisnya kini bisa diklik + di-share.
export default function LeaderboardClient({ players, myId, loggedIn, premiumIds = [] }) {
  const [selected, setSelected] = useState(null);
  const isMe = (id) => myId && String(id) === String(myId);
  const hasPass = (id) => premiumIds.includes(String(id));
  const rowMe = 'bg-accent/15 border-l-4 border-l-accent';

  // hasPass ikut dikirim ke kartu profil: pemegang NEXO Pass dapat sel
  // tambahan (emoji + tulisan "NEXO Pass"), non-premium tetap 3 kolom.
  const openCard = (row, board) => setSelected({ ...row, board, hasPass: hasPass(row.userId) });

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
        <div className="nx-card nx-scroll mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
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
                    {/* #1 = emoji GIF party (1516446871785046149) -
                        permintaan pemilik 2026-10-07 (pengganti mahkota). */}
                    {Number(p.rank) === 1 && emojiSrc('party') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('party')} onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = emojiSrcStatis('party', 64); } }} alt="" width={18} height={18} className="mr-1 inline h-4 w-4 align-middle" />
                    )}
                    {Number(p.rank) > 1 && Number(p.rank) <= 3 && emojiSrc('medal') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('medal')} onError={(e) => { const el = e.currentTarget; if (!el.dataset.fb) { el.dataset.fb = '1'; el.src = emojiSrcStatis('medal', 64); } }} alt="" width={16} height={16} className="mr-1 inline h-4 w-4 align-middle" />
                    )}
                    {p.rank}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openCard(p, 'top')}
                        className="group inline-flex min-w-[160px] flex-1 items-center gap-2.5 text-left font-semibold text-ink transition hover:text-accent-hover cursor-pointer"
                        aria-label={`Lihat profil ${p.username}`}
                      >
                        {p.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUser(p.userId, p.avatarUrl, 56)} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 shrink-0 rounded-full border border-border-soft group-hover:border-accent" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUser(p.userId, null, 56)} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 shrink-0 rounded-full border border-border-soft group-hover:border-accent" />
                        )}
                        {/* NAMA USER: TIDAK BOLEH TERPOTONG (permintaan pemilik
                            2026-10-07: "ga mau ada nama yang ... kepotong, walau
                            di device kecil tetap kebaca semua"). Dulu `truncate`
                            memotong jadi "bagasagustina..." - sekarang nama
                            membungkus ke baris berikutnya (wrap-anywhere:
                            patah di titik mana pun, termasuk nama tanpa spasi). */}
                        <span className="min-w-0 flex-1 wrap-anywhere">{p.username}</span>
                        {hasPass(p.userId) && (
                          // Badge NEXO Pass: custom emoji :NEXO Pass: milik kita
                          // (server xurbaybase, id 1548184905018507306) langsung
                          // dari CDN Discord - bukan logo generik.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src="https://cdn.discordapp.com/emojis/1548184905018507306.png?size=64&quality=lossless"
                            alt="Pemegang NEXO Pass"
                            title="Pemegang NEXO Pass"
                            width={18}
                            height={18}
                            className="h-4.5 w-4.5 shrink-0"
                          />
                        )}
                        {isMe(p.userId) && (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-white">Kamu</span>
                        )}
                      </button>
                      <ShareCardButton
                        // hasPass WAJIB diteruskan: dipakai kartu untuk
                        // menaruh emoji NEXO Pass di samping peringkat.
                        // Dulu props-nya cuma `p` mentah -> status premium
                        // tidak pernah sampai ke kartu.
                        player={{ ...p, premium: hasPass(p.userId) }}
                        loggedIn={loggedIn}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5" title={fmtPenuh(p.points)}>
                      {emojiSrc('goldcoin') && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc('goldcoin')} alt="" width={16} height={16} className="inline h-4 w-4" />
                      )}
                      {fmtRingkas(p.points)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-muted">{p.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal profil + TOMBOL SHARE di header (permintaan pemilik
          2026-10-07: "ketika klik top pemain juga gw mau ada tombol share
          seperti di leaderboard guild") - data player diulang dari row +
          premium dari hasPass (pola sama ShareCardButton di baris). */}
      {selected && (
        <PlayerProfileCard
          player={selected}
          onClose={() => setSelected(null)}
          shareButton={
            <ShareCardButton
              player={{ ...selected, premium: selected.hasPass }}
              loggedIn={loggedIn}
            />
          }
        />
      )}
    </>
  );
}
