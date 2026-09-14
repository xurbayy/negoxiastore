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

  // Daftar sel dibangun eksplisit, lalu jumlah kolom grid DIHITUNG dari
  // panjang daftar ini. Dulu grid dipatok grid-cols-3/4 secara terpisah dari
  // jumlah sel yang benar-benar dirender -> kalau salah satu sel tidak muncul
  // (mis. data `wins` tidak ada di snapshot leaderboard), grid tetap 4 kolom
  // padahal selnya cuma 3 -> ada kolom kosong di kanan, kartu terlihat tidak
  // center. Sekarang tidak mungkin lagi tidak sinkron.
  const stats = [
    {
      key: 'points',
      icon: 'goldcoin',
      label: player.board === 'richest' ? 'Saldo' : 'Poin',
      value: Number(player.points).toLocaleString('id-ID'),
    },
  ];
  if (player.level != null) stats.push({ key: 'level', icon: 'star', label: 'Level', value: String(player.level) });
  if (player.wins != null) stats.push({ key: 'wins', icon: 'trophy', label: 'Menang', value: String(player.wins) });
  if (player.level == null && player.wins == null) {
    stats.push({
      key: 'status',
      icon: 'sparkles',
      label: 'Status',
      value: player.board === 'richest' ? 'Terkaya' : 'Pemain',
    });
  }
  const cells = player.hasPass ? [...stats, { key: 'pass', pass: true }] : stats;
  // Maksimal 4 kolom supaya kartu tidak pernah sesak; kalau kebetulan lebih,
  // grid tetap rapi karena kolomnya dibagi rata.
  const cols = Math.min(cells.length, 4);

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
        className={`w-full ${player.hasPass ? 'max-w-md' : 'max-w-sm'} overflow-hidden rounded-2xl border border-border-soft bg-card-cream shadow-2xl transition-all duration-200 ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
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
                <p className="mt-0.5 text-xs text-ink-faint">
                  Peringkat #{player.rank} {player.board === 'richest' ? '· Terkaya' : '· Top Pemain'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Statistik. Sel pass (kalau ada) selalu jadi sel terakhir, dan jumlah
            kolom dihitung dari daftar `cells` -> tidak pernah ada kolom kosong,
            jadi isinya selalu center. */}
        <div
          className="grid items-stretch gap-2 px-5 py-4"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {cells.map((c) =>
            c.pass ? <PassStat key={c.key} /> : <Stat key={c.key} icon={c.icon} label={c.label} value={c.value} />
          )}
        </div>

        <div className="border-t border-border-soft px-5 py-3">
          <p className="text-center text-[0.7rem] text-ink-faint">
            Lihat profil lengkap & statistiknya in-game via <code className="font-mono">nxp</code> di Discord.
          </p>
        </div>
      </div>
    </div>
  );
}

// Sel statistik. Struktur flex kolom: emoji + nilai di tengah, label dipatok
// ke dasar sel (mt-auto) supaya semua sel sejajar rata walau panjang nilainya
// berbeda-beda. min-w-0 + truncate mencegah angka panjang mendorong lebar kolom.
// `accent` = varian sel NEXO Pass (border & latar oranye tipis).
function Stat({ icon, label, value, accent = false }) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center ${
        accent ? 'border-accent/40 bg-accent/10' : 'border-border-soft bg-white/60'
      }`}
    >
      {emojiSrc(icon) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={emojiSrc(icon)} alt="" width={16} height={16} className="mb-1 h-4 w-4 shrink-0" />
      )}
      <p className="w-full truncate font-display text-sm leading-tight text-ink" title={String(value)}>{value}</p>
      <p className="mt-auto w-full truncate pt-0.5 text-[0.6rem] uppercase tracking-wider text-ink-muted">{label}</p>
    </div>
  );
}

// Sel khusus pemegang NEXO Pass. Emoji premium resmi diambil dari registry
// ("download3", id 1548184905018507306) - sama persis dengan badge di baris
// leaderboard, jadi tidak hardcode CDN. Strukturnya SENGAJA identik dengan
// Stat (emoji / nilai / label) supaya tinggi dan posisi barisnya sejajar
// dengan sel lain, bukan cuma mirip. Tidak ada embel-embel "Premium": cukup
// tulisan NEXO Pass sebagai nilainya.
function PassStat() {
  return <Stat icon="download3" label="Status" value="NEXO Pass" accent />;
}
