import { getLiveStats } from '../lib/snapshot';
import { fmtRingkas, fmtPenuh } from '../lib/formatClient';

// LiveSnapshot: statistik LANGSUNG dari database (Supabase).
// Sejak migrasi ke SATU database (2026-10-03), web menghitung angka langsung
// dari tabel bot - TIDAK lagi menunggu bot "push" snapshot. Jadi:
//   - angka selalu real-time
//   - tidak ada lagi peringatan "Bot terakhir terlihat..." walau bot restart
export default async function LiveSnapshot() {
  const live = await getLiveStats();

  if (!live) {
    return (
      <div className="relative mx-auto mt-14 max-w-6xl px-5">
        <div className="nx-card flex flex-wrap items-center justify-center gap-3 px-6 py-5 text-center text-sm text-ink-muted">
          <span className="pulse-dot" aria-hidden="true" />
          Memuat statistik…
        </div>
      </div>
    );
  }

  const m = live;

  // CATATAN: kartu "Sesi LIVE" DIHAPUS (permintaan pemilik, 2026-09-16) - angka
  // sesi berjalan naik-turun cepat dan tidak berguna untuk pengunjung web.
  const stats = [
    { label: 'Player Terdaftar', value: m.totalUsers, emoji: 'people' },
    { label: 'Poin Beredar', value: m.totalMoney, emoji: 'goldcoin' },
    { label: 'Member NEXO Pass', value: m.premiumCount, emoji: 'crown' },
    { label: 'Game Hari Ini', value: m.gamesToday, emoji: 'dice' },
  ];

  return (
    <div className="relative mx-auto mt-14 max-w-6xl px-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {stats.map((s) => (
          <div key={s.label} className="nx-card px-4 py-4 text-center">
            {typeof s.value === 'number' && (
              <div className="font-display text-2xl text-ink" title={fmtPenuh(s.value)}>{fmtRingkas(s.value)}</div>
            )}
            <div className="mt-1 text-xs text-ink-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
