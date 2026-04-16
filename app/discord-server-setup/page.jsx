import ScrollProgress from '../components/ScrollProgress';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import PricingCard from '../components/PricingCard';
import Link from 'next/link';

const DISCORD_PACKAGES = [
  {
    title: 'Basic Server Setup',
    price: 'Rp20.000 – Rp50.000',
    targetAudience: [
      'Server kecil',
      'Server baru',
      'Private community',
    ],
    features: [
      'Pembuatan struktur channel dasar (info, rules, chat, voice)',
      'Setup role dasar (admin, mod, member)',
      'Permission standar',
      'Setup rules & info server',
      'Basic bot gratis (moderation / utility)',
      'Setting dasar bot',
    ],
    guarantee: (
      <>
        Garansi 3 Hari<br />
        (Tidak termasuk ticket / verification / leveling)
      </>
    ),
    delay: 0,
  },
  {
    title: 'Standard Server Setup',
    price: 'Rp50.000 – Rp100.000',
    targetAudience: [
      'Server publik',
      'Komunitas aktif',
      'Server jualan kecil',
    ],
    features: [
      'Struktur channel lebih rapi & lengkap',
      'Role + permission detail',
      'Multi bot gratis (moderation, welcome, leveling, dll)',
      'Setup welcome message',
      'Sistem auto role (via bot gratis)',
      'Penyesuaian layout server sesuai konsep',
      'Revisi ringan',
    ],
    guarantee: (
      <>
        Garansi 3 Hari<br />
        (Termasuk ticket / verification / leveling)
      </>
    ),
    delay: 0.1,
  },
  {
    title: 'Advanced Server Setup',
    price: 'Rp100.000 – Rp300.000',
    targetAudience: [
      'Komunitas besar',
      'Server brand / bisnis',
      'Server marketplace',
    ],
    features: [
      'Struktur channel lengkap & clean',
      'Role hierarchy detail',
      'Permission advance',
      'Sistem ticket (bot gratis)',
      'Sistem verification (bot gratis)',
      'Leveling & logging system',
      'Layout server profesional',
      'Revisi lebih fleksibel',
    ],
    guarantee: (
      <>
        Garansi 3 Hari<br />
        Dapat menambahkan semua bot public yang ingin digunakan
      </>
    ),
    delay: 0.2,
  },
];

export default function DiscordServerSetupPage() {
  return (
    <>
      <ScrollProgress />
      <Navbar />

      <main className="page-wrap max-w-[1280px] mx-auto padding-x-nav pt-[120px] pb-20 px-16 max-md:px-5 max-md:pt-[100px]">
        {/* Breadcrumb */}
        <nav className="breadcrumb flex items-center gap-2 text-[13px] font-inter text-brand/55 mb-12">
          <Link href="/" className="hover:text-accent2 transition-colors">Beranda</Link>
          <span className="sep text-[11px]">›</span>
          <Link href="/#services" className="hover:text-accent2 transition-colors">Produk</Link>
          <span className="sep text-[11px]">›</span>
          <span className="current text-brand font-semibold">Discord Server Setup</span>
        </nav>

        {/* Page Header */}
        <header className="page-header mb-[60px]">
          <p className="page-label text-xs font-bold uppercase tracking-[2px] text-accent2 mb-3 font-inter">
            Discord Server Setup
          </p>
          <h1 className="page-title text-[36px] font-extrabold leading-[1.25] mb-4 max-md:text-[26px]">
            Pilih Paket Server Setup<br />yang Sesuai Kebutuhan
          </h1>
          <p className="page-subtitle text-[15px] font-inter leading-[1.75] text-brand/70 max-w-[600px]">
            Dari server kecil hingga komunitas besar, kami siapkan server Discord kamu jadi rapi, profesional, dan siap digunakan.
          </p>
        </header>

        {/* Pricing Grid */}
        <div className="pricing-grid grid grid-cols-3 gap-7 items-start max-[1024px]:grid-cols-2 max-md:grid-cols-1">
          {DISCORD_PACKAGES.map((pkg) => (
            <PricingCard key={pkg.title} {...pkg} />
          ))}
        </div>
      </main>

      <Footer />
    </>
  );
}
