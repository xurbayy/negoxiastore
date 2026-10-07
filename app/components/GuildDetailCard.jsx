'use client';

import { cloneElement, useEffect, useState } from 'react';
import { emojiSrc } from '../lib/emojisClient';
import { fmtRingkas, fmtPenuh } from '../lib/formatClient';
import { avatarUser } from '../lib/avatarClient';
import GuildEmoji from './GuildEmoji';

// ==========================================
// KARTU DETAIL GUILD (permintaan pemilik 2026-10-07)
// ==========================================
// Muncul saat NAMA GUILD di tabel "Top 10 Guild Terkuat" diklik. Isi:
//   - Header: emoji + nama guild + kode + tombol bagikan (BIO DIHAPUS dari
//     web - permintaan pemilik; bio tetap di Discord)
//   - Statistik: LEVEL (TANPA emoji) / Poin / WINRATE / Member
//   - RIWAYAT WAR DIHAPUS dari web (permintaan pemilik 2026-10-07: "yang
//     bisa liat itu hanya member di bot discord") - lihat tombol Riwayat
//     di nxg / nxlb untuk riwayat 10 war
//   - OWNER, ADMIN (kalau ada), MEMBER: avatar, emoji peran di DEPAN nama,
//     level, badge NEXO Pass, dan POIN MASING-MASING - transparan, orang
//     bisa lihat kenapa total poin guild segitu (bukan angka misterius).
//
// EMOJI = embed bot nxguild (permintaan pemilik: pakai emoji yang ada di bot):
//   :stats: Statistik     -> chart   (1517007751002460330)
//   :goldcoin: Poin       -> goldcoin (1516390096419684422)
//   :ClashingSwords:      -> swords   (1516375357031321730)
//   :users0: Member       -> group    (1516381292986634300)
//   :Crown: owner         -> crown    (1516383025531846816)
//   ADMIN                 -> gif      (1469194581303103634, ANIMASI -
//                          permintaan pemilik 2026-10-07, ganti admin lama)
//   :SVD_member: member   -> member   (1517021034069491883)
// Baris anggota meniru format bot: ":Crown: xurbayy • Lv.89 • 3,884,375 pts".
//
// Data diambil dari /api/guild/[code] saat modal dibuka - halaman leaderboard
// tidak ikut berat saat load pertama, dan datanya selalu segar.
// Tutup: ESC / klik backdrop (pola sama dengan PlayerProfileCard).
export default function GuildDetailCard({ code, onClose, shareButton = null }) {
  const [show, setShow] = useState(false);
  const [guild, setGuild] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 10);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // Fetch detail guild saat modal dibuka (sekali per kode).
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const res = await fetch(`/api/guild/${encodeURIComponent(code)}`, { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (batal) return;
        if (d.ok && d.guild) setGuild(d.guild);
        else setError(d.error || 'Gagal memuat detail guild.');
      } catch {
        if (!batal) setError('Gagal menghubungi server.');
      }
    })();
    return () => { batal = true; };
  }, [code]);

  const admins = (guild && guild.admins) || [];
  const members = (guild && guild.members) || [];
  const semuaAnggota = guild ? [guild.owner, ...admins, ...members].filter(Boolean) : [];
  // Jumlah poin SEMUA anggota - ditampilkan bersama total poin guild supaya
  // hubungan kedua angka terlihat (transparansi, permintaan pemilik).
  const totalPoinMember = semuaAnggota.reduce((a, m) => a + (m.points || 0), 0);

  // Tombol share dari parent diberi DETAIL yang sudah dimuat (cloneElement)
  // supaya klik share memakai data yang persis tampil di layar, tanpa fetch ulang.
  const tombolShare = shareButton
    ? (guild ? cloneElement(shareButton, { detail: guild }) : shareButton)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-5 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={guild ? `Detail guild ${guild.name}` : 'Detail guild'}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-soft bg-card-cream shadow-2xl transition-all duration-200 ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
      >
        {/* Header gelap - identitas guild */}
        <div className="nx-dark px-5 py-5">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-card-cream/10">
              <GuildEmoji token={guild?.emoji} size={32} />
            </span>
            <div className="min-w-0 flex-1">
              {/* Nama guild: tidak dipotong (wrap-anywhere), konsisten dengan
                  permintaan "nama tidak boleh kepotong". BIO DIHAPUS dari web
                  (permintaan pemilik 2026-10-07: "di leaderboard guild web ga
                  usah cantumin bionya") - bio tetap ada di Discord. */}
              <p className="wrap-anywhere font-display text-lg text-card-cream">{guild?.name || 'Memuat...'}</p>
              {guild?.code && <p className="mt-0.5 text-[0.65rem] text-ink-faint">Kode: {guild.code}</p>}
            </div>
            {tombolShare}
          </div>
        </div>

        {error && (
          <div className="px-5 py-8 text-center text-sm text-ink-muted">{error}</div>
        )}

        {!guild && !error && (
          <div className="px-5 py-8 text-center text-sm text-ink-muted">
            <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent align-middle" aria-hidden="true" />
            Memuat detail guild...
          </div>
        )}

        {guild && (
          <>
            {/* Statistik guild - emoji SAMA dengan embed bot nxguild:
                :stats: judul, :goldcoin: poin, :ClashingSwords: winrate,
                :users0: member. LEVEL TANPA emoji (permintaan pemilik
                2026-10-07) + label "Total Poin" -> "Poin".
                RIWAYAT WAR DIHAPUS dari web (permintaan pemilik: "yang bisa
                liat itu hanya member di bot discord") - tetap ada di nxg. */}
            <div className="border-t border-border-soft px-5 py-3">
              <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-muted">
                {emojiSrc('chart') && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={emojiSrc('chart')} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                )}
                Statistik
              </p>
            </div>
            <div className="grid grid-cols-2 items-stretch gap-2 px-5 pb-4 pt-1 sm:grid-cols-4">
              <GuildStat
                char="⭐"
                label="Level"
                value={String(guild.level ?? '-')}
                full={guild.xpButuhLevel ? `${guild.xpDiLevel || 0} / ${guild.xpButuhLevel} menang lagi ke level berikutnya` : undefined}
              />
              <GuildStat icon="goldcoin" label="Poin" value={fmtRingkas(guild.points)} full={fmtPenuh(guild.points)} />
              <GuildStat
                icon="swords"
                label="Winrate"
                value={guild.winrate != null ? `${guild.winrate}%` : 'Belum war'}
                full={guild.warWins > 0 || guild.warLosses > 0 ? `${guild.warWins} menang / ${guild.warLosses} kalah` : 'Belum pernah war'}
              />
              <GuildStat icon="group" label="Member" value={`${guild.membersCount}/10`} />
            </div>

            {/* PROGRESS BAR TIDAK DI WEB (revisi permintaan pemilik
                2026-10-07 malam: "progress bar itu bukan di web ... tapi di
                nxg") - bar teks buildProgressBar() ada di embed Markas nxg.
                Cukup tooltip tile Level: "x / y menang lagi ke level N+1". */}

            {/* Anggota: OWNER dulu, lalu ADMIN, lalu MEMBER.
                Emoji peran di DEPAN nama + poin masing-masing (transparan),
                format baris meniru bot: :Crown: nama • Lv.89 • 3,884,375 pts */}
            <div className="border-t border-border-soft px-5 py-4">
              {guild.owner && (
                <>
                  <p className="mb-2 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-muted">
                    {emojiSrc('crown') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('crown')} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                    )}
                    Owner
                  </p>
                  <AnggotaBaris m={guild.owner} />
                </>
              )}
              {admins.length > 0 && (
                <>
                  <p className="mb-2 mt-4 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-muted">
                    {/* EMOJI ADMIN = 1469194581303103634 (gif, animasi) -
                        permintaan pemilik 2026-10-07 */}
                    {emojiSrc('gif') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('gif')} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                    )}
                    Admin ({admins.length})
                  </p>
                  <ul className="space-y-1.5">
                    {admins.map((m) => <li key={m.userId}><AnggotaBaris m={m} /></li>)}
                  </ul>
                </>
              )}
              {members.length > 0 && (
                <>
                  <p className="mb-2 mt-4 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-muted">
                    {emojiSrc('group') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('group')} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                    )}
                    Anggota ({members.length})
                  </p>
                  <ul className="space-y-1.5">
                    {members.map((m) => <li key={m.userId}><AnggotaBaris m={m} /></li>)}
                  </ul>
                </>
              )}
              {semuaAnggota.length === 0 && <p className="text-center text-xs text-ink-faint">Belum ada anggota.</p>}

              {/* Transparansi: hubungan poin member vs total guild. Selisih
                  kecil wajar - bot menghitung ulang total guild berkala. */}
              {semuaAnggota.length > 0 && (
                <p className="mt-4 rounded-lg bg-white/60 px-3 py-2 text-[0.68rem] leading-relaxed text-ink-muted">
                  Total poin member: <span className="font-semibold text-ink">{fmtPenuh(totalPoinMember)}</span>
                  {' · '}Total poin guild: <span className="font-semibold text-ink">{fmtPenuh(guild.points)}</span>
                  {guild.points !== totalPoinMember && (
                    <> <span className="text-ink-faint">(selisih kecil = pembaruan berkala bot)</span></>
                  )}
                </p>
              )}
            </div>

            <div className="border-t border-border-soft px-5 py-3">
              <p className="text-center text-[0.7rem] text-ink-faint">
                Lihat detail guild in-game via <code className="font-mono">nxguild</code> di Discord.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Sel statistik guild (pola sama dengan PlayerProfileCard.Stat).
// char = GLYPH unicode (mis. '⭐' utk Level - permintaan pemilik
// 2026-10-07: 'statistik pada level pake emoji bintang'; registry tidak
// punya emoji star custom, jadi pakai unicode bawaan sistem).
function GuildStat({ icon, char, label, value, full }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-border-soft bg-white/60 px-2 py-2.5 text-center">
      {emojiSrc(icon) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={emojiSrc(icon)} alt="" width={16} height={16} className="mb-1 h-4 w-4 shrink-0" />
      ) : char ? (
        <span className="mb-1 text-[16px] leading-none" aria-hidden="true">{char}</span>
      ) : null}
      <p className="w-full truncate font-display text-sm leading-tight text-ink" title={full || String(value)}>{value}</p>
      <p className="mt-auto w-full truncate pt-0.5 text-[0.6rem] uppercase tracking-wider text-ink-muted">{label}</p>
    </div>
  );
}

// Satu baris anggota - MENIRU format daftar anggota embed bot nxguild:
//   ":Crown: xurbayy • Lv.89 • 3,884,375 pts"
// Urutan web: avatar → emoji peran bot (crown/admin/member) → nama →
// Lv.X → badge NEXO Pass → poin + goldcoin. Emoji peran memakai aset bot
// yang sama (id Discord), jadi tampilannya konsisten dengan Discord.
function AnggotaBaris({ m }) {
  const role = String(m.role || 'member').toLowerCase();
  // Emoji peran PERSIS bot (commands/guild.js roleIcons):
  //   owner = crown, admin = gif (1469194581303103634, permintaan pemilik
  //   2026-10-07 - sebelumnya emoji admin lama), member = member (SVD_member)
  const roleEmoji = role === 'owner' ? 'crown' : role === 'admin' ? 'gif' : 'member';
  const roleTitle = role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member';
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border-soft bg-white/60 px-3 py-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUser(m.userId, m.avatarUrl, 56)}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        className="h-7 w-7 shrink-0 rounded-full border border-border-soft"
      />
      {emojiSrc(roleEmoji) && (
        // Emoji peran bot (sama dengan embed nxguild di Discord)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={emojiSrc(roleEmoji)} alt={roleTitle} title={roleTitle} width={16} height={16} className="h-4 w-4 shrink-0" />
      )}
      {/* Nama anggota: TIDAK dipotong - wrap ke baris berikutnya (permintaan
          pemilik 2026-10-07: nama panjang harus terbaca semua di device kecil). */}
      <span className="min-w-0 flex-1 wrap-anywhere text-sm font-semibold text-ink">{m.username}</span>
      <span className="shrink-0 text-[0.65rem] text-ink-faint">Lv.{m.level}</span>
      {m.premium && (
        // Badge NEXO Pass - custom emoji resmi (sama dengan leaderboard pemain).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="https://cdn.discordapp.com/emojis/1548184905018507306.png?size=64&quality=lossless"
          alt="Pemegang NEXO Pass"
          title="Pemegang NEXO Pass"
          width={16}
          height={16}
          className="h-4 w-4 shrink-0"
        />
      )}
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted" title={fmtPenuh(m.points)}>
        {emojiSrc('goldcoin') && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emojiSrc('goldcoin')} alt="" width={14} height={14} className="h-3.5 w-3.5" />
        )}
        {fmtRingkas(m.points)}
      </span>
    </div>
  );
}
