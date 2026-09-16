import { getLatestSnapshot, timeAgo } from '../lib/snapshot';
import { fmtRingkas, fmtPenuh } from '../lib/formatClient';

// LiveSnapshot: strip statistik nyata dari snapshot bot terakhir.
// Kalau bot belum pernah push / offline -> tampil strip "menunggu data".
export default async function LiveSnapshot() {
  const snap = await getLatestSnapshot();

  if (!snap) {
    return (
      <div className="relative mx-auto mt-14 max-w-6xl px-5">
        <div className="nx-card flex flex-wrap items-center justify-center gap-3 px-6 py-5 text-center text-sm text-ink-muted">
          <span className="pulse-dot" aria-hidden="true" />
          Menunggu data live dari bot… Statistik akan muncul otomatis dalam ±1 menit setelah bot online.
        </div>
      </div>
    );
  }

  const m = snap.monitor || {};
  const stale = computeStale(snap.ts);

  // CATATAN: kartu "Sesi LIVE" DIHAPUS (permintaan pemilik, 2026-09-16) - angka
  // sesi berjalan naik-turun cepat dan tidak berguna untuk pengunjung web.
  const stats = [
    { label: 'Player Terdaftar', value: m.totalUsers, emoji: 'people' },
    { label: 'Poin Beredar', value: m.totalMoney, emoji: 'goldcoin' },
    { label: 'Member NEXOPASS', value: m.premiumCount, emoji: 'crown' },
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
      <p className="mt-3 text-center text-xs text-ink-muted">
        {stale ? (
          <span className="text-danger">⚠ Bot terakhir terlihat lebih dari 3 menit lalu.</span>
        ) : (
          <span className="pulse-dot" aria-hidden="true" />
        )}
        {' '}Diperbarui {timeAgo(snap.ts)} · data diperbarui tiap 1 menit
      </p>
    </div>
  );
}

function computeStale(ts) {
  return Date.now() - ts > 3 * 60_000;
}
