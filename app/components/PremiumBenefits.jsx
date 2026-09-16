'use client';

import { emojiSrc } from '../lib/emojisClient';
import { labelMasaAktif, PLAN_DAYS, PLAN_PRICE } from '../lib/premiumPlan';

// ==========================================
// KARTU KEUNGGULAN NEXOPASS
// ==========================================
// Menampilkan SEMUA perk premium dengan emoji custom resmi (dari registry web,
// bukan emoji Unicode) supaya konsisten dengan bot.
//
// PENTING - SUMBER KEBENARAN: daftar ini disalin dari commands/premium.js di bot
// (`perkList`). Kalau perk di bot berubah, ubah di sini juga supaya janji ke
// pembeli tidak pernah beda antara Discord dan web.
//
// Dipakai di halaman /premium, baik saat user BELUM berlangganan (biar tahu
// apa yang didapat) maupun saat SUDAH (biar tahu yang sedang aktif).
const BENEFITS = [
  {
    emoji: 'PE_PandaBackPack',
    title: 'Inventori Unlimited',
    desc: 'Simpan item tanpa batas 5 per jenis (akun biasa dibatasi 5).',
  },
  {
    emoji: 'sun58',
    title: `Kuota Harian +5.000 pts`,
    desc: 'Limit poin harianmu naik di atas bonus streak yang sudah ada.',
  },
  {
    emoji: '267042fire',
    title: 'Klaim Harian +10%',
    desc: 'Reward nxdaily selalu dibulak-balikkan 10% lebih besar.',
  },
  {
    emoji: 'goldcoin',
    title: 'Bunga Pinjaman -10%',
    desc: 'Pinjam poin di bank dengan bunga lebih murah.',
  },
  {
    emoji: 'UC_Checkmark',
    title: '+1 Slot Misi Harian',
    desc: '4 misi per hari, lebih banyak poin yang bisa dicairkan.',
  },
  {
    emoji: 'controller',
    title: 'Prioritas Render',
    desc: 'Papan game muncul lebih cepat saat antrean ramai, cooldown render setengah.',
  },
  {
    emoji: 'download3',
    title: 'Akses Game Beta',
    desc: 'Masuk Test Lab (nxtest) dan main game baru sebelum rilis publik.',
  },
  {
    emoji: 'crown',
    title: 'Badge & Profil Web Premium',
    desc: 'Badge khusus di leaderboard dan grafik riwayat di halaman profil.',
  },
];

/**
 * Satu baris benefit: emoji custom + judul + penjelasan singkat.
 */
function BenefitRow({ emoji, title, desc }) {
  const src = emojiSrc(emoji);
  return (
    <li className="flex items-start gap-3">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={20} height={20} className="mt-0.5 h-5 w-5 shrink-0" />
      ) : (
        <span className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      )}
      <span className="text-sm leading-relaxed text-ink-muted">
        <strong className="font-semibold text-ink">{title}</strong>
        {' - '}
        {desc}
      </span>
    </li>
  );
}

/**
 * Daftar keunggulan lengkap.
 * @param {object} props
 * @param {object|null} props.premium - data premium user (kalau sudah aktif)
 * @param {boolean} props.compact - versi ringkas (tanpa kartu pembungkus)
 */
export default function PremiumBenefits({ premium = null, compact = false }) {
  const aktif = Boolean(premium);

  const isi = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg text-ink">
          {emojiSrc('download3') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emojiSrc('download3')} alt="" width={20} height={20} className="h-5 w-5" />
          )}
          Keunggulan NEXOPASS
        </h2>
        {aktif && (
          <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
            {labelMasaAktif(premium)}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-ink-faint">
        {aktif
          ? 'Semua perk di bawah ini sedang aktif di akunmu.'
          : `Aktif selama ${PLAN_DAYS} hari sejak pembayaran disetujui. Rp ${PLAN_PRICE.toLocaleString('id-ID')} sekali bayar.`}
      </p>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {BENEFITS.map((b) => (
          <BenefitRow key={b.title} {...b} />
        ))}
      </ul>
    </>
  );

  if (compact) return <div>{isi}</div>;

  return (
    <div className="nx-card mt-8 w-full max-w-2xl px-5 py-5 text-left">
      {isi}
    </div>
  );
}
