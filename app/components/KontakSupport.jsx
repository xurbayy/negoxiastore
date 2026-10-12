import Reveal from './Reveal';

// ==========================================
// KontakSupport — kontak resmi + alamat usaha
// ==========================================
// WAJIB ADA (syarat verifikasi payment gateway Duitku 2026-10-12):
//   "Mohon mencantumkan email, nomor telepon dan alamat usaha sebagai
//    kontak support pada halaman utama website terdaftar."
// Data ini juga dipakai sebagai kontak resmi di halaman legal.
export const KONTAK = {
  email: 'akzandoank8@gmail.com',
  telepon: '085872320635',
  alamat: 'KOMP Kota Baru Arasari RT 02/RW 13 B1 42, Arjasari, Kabupaten Bandung, Jawa Barat 40379',
};

function Ikon({ d }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-accent-hover">
      <path d={d} />
    </svg>
  );
}

export default function KontakSupport() {
  return (
    <section id="kontak" className="relative scroll-mt-24 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-3xl text-ink md:text-4xl">Kontak Support.</h2>
          <div className="accent-bar mx-auto mt-4" aria-hidden="true" />
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Ada pertanyaan, kendala pembelian, atau laporan? Hubungi kami lewat
            kanal resmi di bawah ini.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div className="nx-card mx-auto mt-10 grid max-w-3xl gap-4 px-6 py-6 sm:grid-cols-2 md:px-8 md:py-8">
            <a
              href={`mailto:${KONTAK.email}`}
              className="flex items-start gap-3 rounded-xl border border-border-soft bg-bg-soft/60 px-4 py-3.5 transition hover:border-accent/50 cursor-pointer"
            >
              <Ikon d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" />
              <span>
                <span className="block text-xs font-bold uppercase tracking-wider text-ink-muted">Email</span>
                <span className="mt-0.5 block text-sm font-semibold text-ink break-all">{KONTAK.email}</span>
              </span>
            </a>

            <a
              href={`tel:${KONTAK.telepon}`}
              className="flex items-start gap-3 rounded-xl border border-border-soft bg-bg-soft/60 px-4 py-3.5 transition hover:border-accent/50 cursor-pointer"
            >
              <Ikon d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              <span>
                <span className="block text-xs font-bold uppercase tracking-wider text-ink-muted">Telepon / WhatsApp</span>
                <span className="mt-0.5 block text-sm font-semibold text-ink">{KONTAK.telepon}</span>
              </span>
            </a>

            <div className="flex items-start gap-3 rounded-xl border border-border-soft bg-bg-soft/60 px-4 py-3.5 sm:col-span-2">
              <Ikon d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
              <span>
                <span className="block text-xs font-bold uppercase tracking-wider text-ink-muted">Alamat Usaha</span>
                <span className="mt-0.5 block text-sm font-semibold leading-relaxed text-ink">{KONTAK.alamat}</span>
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
