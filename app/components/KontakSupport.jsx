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

// Link WhatsApp: format internasional tanpa 0 di depan (0858... -> 62858...).
const WA_LINK = `https://wa.me/62${KONTAK.telepon.replace(/^0/, '')}`;

function Ikon({ d }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

// Logo WhatsApp = glyph FILL (bukan stroke) - dirender terpisah.
function IkonWA() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
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
          <div className="nx-card mx-auto mt-10 max-w-3xl px-6 py-6 md:px-8 md:py-8">
            {/* Kontak = TOMBOL polos (permintaan pemilik 2026-10-13):
                cuma bentuk tombol + label singkat, TANPA menampilkan
                email/nomor sebagai teks. Alamat usaha juga tidak ditampilkan. */}
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
              <a
                href={`mailto:${KONTAK.email}`}
                className="btn-solid btn-solid-accent justify-center px-5! py-3!"
              >
                <Ikon d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" />
                <span>Email</span>
              </a>

              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-solid btn-solid-success justify-center px-5! py-3!"
              >
                <IkonWA />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
