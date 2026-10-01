import Link from 'next/link';
import { NexoLogo } from '../ui';
import { SUPPORT_INVITE } from '../../lib/site';

// Footer KHUSUS panel admin: strip ramping fungsional - identitas, jalur
// keluar, dan support. Tanpa navigasi marketing ala footer publik.
//
// MOBILE (perbaikan 2026-09-30):
//   Di HP, flex-wrap membuat tiga bagian bertumpuk dengan jarak yang tidak
//   seragam (identitas, dua tautan, hak cipta), dan tautannya berdempetan.
//   Sekarang di layar sempit susunannya sengaja: identitas di atas, tautan
//   di baris sendiri dengan jarak lega, hak cipta muncul sebagai baris
//   terpisah. Di layar lebar kembali satu baris seperti semula.
export default function AdminFooter() {
  return (
    <footer className="border-t border-border-soft/70 bg-bg-soft py-5">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 text-xs text-ink-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <span className="flex items-center gap-2">
          <NexoLogo size={18} />
          <span className="font-display text-sm font-bold tracking-tight text-ink">NEXO Games</span>
          <span className="text-ink-muted">· Admin Panel</span>
        </span>
        {/* Tautan diberi padding vertikal supaya area tekanannya cukup untuk
            jari (sebelumnya cuma 16px tinggi - terlalu tipis). -my-2 di
            induknya mencegah padding itu menambah tinggi footer. */}
        <nav aria-label="Tautan admin" className="-my-2 flex flex-wrap items-center gap-x-5 sm:my-0">
          <Link href="/" className="py-2 font-medium transition hover:text-ink cursor-pointer">
            Kembali ke Situs
          </Link>
          <a href={SUPPORT_INVITE} className="py-2 font-medium transition hover:text-ink cursor-pointer">
            Support Discord
          </a>
          {/* Hak cipta selalu tampil, tapi di HP jadi barisnya sendiri supaya
              tidak berdesakan dengan tautan. */}
          <span className="w-full py-1 text-ink-faint sm:hidden">© {new Date().getFullYear()} xurbaybase</span>
          <span className="hidden sm:inline">© {new Date().getFullYear()} xurbaybase</span>
        </nav>
      </div>
    </footer>
  );
}
