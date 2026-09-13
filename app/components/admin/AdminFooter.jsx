import Link from 'next/link';
import { NexoLogo } from '../ui';
import { SUPPORT_INVITE } from '../../lib/site';

// Footer KHUSUS panel admin: strip ramping fungsional - identitas, jalur
// keluar, dan support. Tanpa navigasi marketing ala footer publik.
export default function AdminFooter() {
  return (
    <footer className="border-t border-border-soft/70 bg-bg-soft py-5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 text-xs text-ink-muted">
        <span className="flex items-center gap-2">
          <NexoLogo size={18} />
          <span className="font-display text-sm font-bold tracking-tight text-ink">NEXO Games</span>
          <span className="text-ink-muted">· Admin Panel</span>
        </span>
        <nav aria-label="Tautan admin" className="flex items-center gap-5">
          <Link href="/" className="font-medium transition hover:text-ink cursor-pointer">
            Kembali ke Situs
          </Link>
          <a href={SUPPORT_INVITE} className="font-medium transition hover:text-ink cursor-pointer">
            Support Discord
          </a>
          <span className="hidden sm:inline">© {new Date().getFullYear()} xurbaybase</span>
        </nav>
      </div>
    </footer>
  );
}
