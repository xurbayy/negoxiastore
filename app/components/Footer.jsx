import Link from 'next/link';
import { getSession } from '../lib/session';
import { NexoLogo } from './ui';
import { SUPPORT_INVITE } from '../lib/site';

// Jelajahi (belum login) vs Akun (sudah login) - footer menyesuaikan status.
// Komunitas ada di KEDUA daftar: halaman itu berguna untuk tamu maupun member,
// jadi jangan sampai hilang begitu orang login. Ditaruh tepat setelah Game
// supaya tetap konsisten dengan urutan di navbar.
const NAV_GUEST = [
  { href: '/#games', label: 'Game' },
  { href: '/komunitas', label: 'Komunitas' },
  { href: '/#fitur', label: 'Fitur' },
  { href: '/#cara-main', label: 'Cara Main' },
  { href: '/#premium', label: 'NEXO Pass' },
  { href: '/#faq', label: 'FAQ' },
];
const NAV_MEMBER = [
  { href: '/me', label: 'Profil Saya' },
  { href: '/komunitas', label: 'Komunitas' },
  { href: '/shop', label: 'Shop' },
  { href: '/redeem', label: 'Redeem' },
  { href: '/premium', label: 'NEXO Pass' },
];
const NAV_LEGAL = [
  { href: '/privacy-policy', label: 'Kebijakan Privasi' },
  { href: '/terms-of-service', label: 'Ketentuan Layanan' },
  { href: SUPPORT_INVITE, label: 'Server Discord', external: true },
];

// Ukuran + gaya hover SATU tempat supaya link internal dan tautan luar
// tidak pernah berbeda perilaku (dulu keduanya menulis class sendiri-sendiri).
//
// KENAPA HOVER-NYA DULU TERASA TIDAK JALAN (laporan pemilik 2026-09-30):
//   Garis bawah ditaruh di <li> sehingga area hover-nya SELUAR BARIS, bukan
//   selebar tulisannya - dan gerakan 1px pada <li> membawa seluruh kalimat
//   maju-mundur. Sekarang animasinya dipasang di LINK-nya sendiri:
//   warna berubah + garis bawah tumbuh dari kiri, tanpa menggeser tata letak.
const GAYA_LINK =
  'group relative inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted ' +
  'transition-colors duration-200 hover:text-ink ' +
  'after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full ' +
  'after:origin-left after:scale-x-0 after:bg-accent after:transition-transform ' +
  'after:duration-200 hover:after:scale-x-100 cursor-pointer';

// Penanda kecil untuk tautan yang membuka tab baru.
function PanahKeluar() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 opacity-60 transition-opacity duration-200 group-hover:opacity-100"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export default async function Footer() {
  const session = await getSession();
  const NAV = [
    ...(session ? NAV_MEMBER : NAV_GUEST),
    ...NAV_LEGAL,
  ];
  return (
    <footer className="border-t border-border-soft/70 bg-bg py-12">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row">
          <div className="max-w-sm">
            <Link href="/" className="flex w-fit items-center gap-2.5 cursor-pointer" aria-label="NEXO Games - Beranda">
              <NexoLogo size={32} />
              <span className="font-display text-lg text-ink">
                NEXO<span className="text-ink"> Games</span>
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              Bot Discord gaming dengan 25+ game, ekonomi poin, guild war, dan leaderboard.
              Dikembangkan oleh <strong className="text-ink">xurbaybase</strong> studio.
            </p>
          </div>

          <nav aria-label="Navigasi footer" className="w-full md:w-auto">
            <h3 className="text-xs font-bold uppercase tracking-widest text-ink-muted">{session ? 'Akun' : 'Jelajahi'}</h3>
            {/* w-fit: daftar link hanya selebar LINK-nya, bukan selebar kolom.
                Sebelumnya <ul> melebar penuh di layar sempit sehingga area
                hover terasa "melenceng" dari tulisannya. */}
            <ul className="mt-4 w-fit space-y-2.5">
              {NAV.map((l) => (
                // w-fit di <li>: elemen list-item secara default melebar
                // sepanjang barisnya (126px), padahal tulisannya cuma 70px.
                // Akibatnya area yang "terasa" bisa di-hover melenceng jauh dari
                // teksnya. w-fit menyusutkan <li> tepat selebar isinya.
                <li key={l.href} className="w-fit">
                  {l.external ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      /* Tautan luar (Server Discord) sengaja TIDAK same-origin,
                         jadi tidak bisa dicek oleh pengawas tautan internal. */
                      className={GAYA_LINK}
                    >
                      {l.label}
                      <PanahKeluar />
                    </a>
                  ) : (
                    <Link href={l.href} className={GAYA_LINK}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-ink-muted">Perintah Cepat</h3>
            <ul className="mt-4 space-y-2.5 font-mono text-sm text-ink-muted">
              <li><code className="text-ink">nxhelp</code>: panduan lengkap</li>
              <li><code className="text-ink">nxdaily</code>: klaim poin harian</li>
              <li><code className="text-ink">np slot</code>: main slot</li>
              <li><code className="text-ink">nxlb</code>: leaderboard</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border-soft/60 pt-6 text-xs text-ink-muted md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} NEXO Games · oleh xurbaybase. Semua hak dilindungi.</p>
          <p>Poin NEXO bersifat virtual dan tidak memiliki nilai uang asli.</p>
        </div>
      </div>
    </footer>
  );
}
