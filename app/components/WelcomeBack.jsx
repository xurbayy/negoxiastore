import Link from 'next/link';
import { getSessionProfile } from '../lib/welcome';

// Kartu sambutan utk user yang sudah login: ringkasan profil dari cache bot
// (kalau snapshot data_requests tersedia) + shortcut ke fitur utama.
function stripEmoji(str) {
  return String(str || '').replace(/<a?:[A-Za-z0-9_]+:\d+>/g, '').trim();
}

export default async function WelcomeBack({ username }) {
  const profile = await getSessionProfile();

  return (
    <div className="relative mx-auto max-w-6xl px-5">
      <div className="nx-card flex flex-wrap items-center justify-between gap-5 px-6 py-5">
        <div>
          <p className="text-sm font-medium text-ink-muted">Selamat datang kembali,</p>
          <p className="mt-1 font-display text-xl tracking-tight text-ink">{username}</p>
          {profile ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <strong className="text-ink">{profile.points.toLocaleString('id-ID')}</strong> poin
              </span>
              <span>Level {profile.level}</span>
              {profile.dailyStreak > 0 && <span>Streak {profile.dailyStreak} hari</span>}
              {profile.guild && <span>{stripEmoji(profile.guild.name)}</span>}
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-muted">
              Profil belum dimuat. Buka halaman profil lalu tekan Refresh dari bot.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/me" className="btn-primary !px-5 !py-2.5 text-sm cursor-pointer">Profil Saya</Link>
          <Link href="/redeem" className="btn-ghost !px-5 !py-2.5 text-sm cursor-pointer">Redeem Kode</Link>
          <Link href="/shop" className="btn-ghost !px-5 !py-2.5 text-sm cursor-pointer">Shop</Link>
        </div>
      </div>
    </div>
  );
}
