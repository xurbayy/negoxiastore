// Loading skeleton - SETIAP halaman punya varian yang meniru UI ASLINYA
// (bukan pola generik). Prinsip:
//   - proporsi & susunan sama dengan halaman asli, supaya saat data siap
//     layout tidak "melompat" (jauh lebih halus, dan tidak terasa mengelabui).
//   - pakai kelas .skeleton yang sudah ada di globals.css (pulseSoft halus,
//     otomatis mati saat pengguna pilih "reduce motion").
//   - TANPA teks apa pun di area konten; hanya judul section bila di halaman
//     aslinya ada heading tetap (bukan hasil data). Tidak ada tulisan "loading".
//   - Placeholder NAVBAR selalu ikut: Navbar dirender per-halaman (bukan di
//     layout), jadi tanpa ini navbar hilang lalu muncul = halaman melompat.
//
// Acuan tiap varian diambil dari struktur nyata:
//   leaderboard/page.jsx, shop/page.jsx, bank/page.jsx, premium/page.jsx,
//   components/MeClient.jsx, redeem + admin/Dashboard.jsx

/* ── Potongan dasar ───────────────────────────────────────────────────── */

function Bar({ className = '' }) {
  return <div className={`skeleton h-4 ${className}`} />;
}

function Circle({ className = '' }) {
  return <div className={`skeleton rounded-full ${className}`} />;
}

function Card({ className = '', children }) {
  return (
    <div className={`rounded-2xl border border-border-soft bg-card-cream ${className}`}>{children}</div>
  );
}

// Placeholder navbar: tinggi & posisi sama dengan Navbar asli (fixed top-0,
// py-4, logo 36px) supaya tidak ada pergeseran layout.
function NavbarSkeleton() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 py-4">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5" aria-hidden="true">
        <div className="flex items-center gap-2.5">
          <Circle className="h-9 w-9" />
          <Bar className="hidden h-5 w-28 lg:block" />
        </div>
        <div className="flex items-center gap-3">
          <Bar className="hidden h-4 w-16 sm:block" />
          <Bar className="hidden h-4 w-20 sm:block" />
          <div className="skeleton h-9 w-24 rounded-full" />
        </div>
      </nav>
    </header>
  );
}

// Pembungkus halaman: menyamakan latar grid + padding atas/bawah halaman asli.
function Shell({ maxWidth = 'max-w-4xl', children }) {
  return (
    <>
      <NavbarSkeleton />
      <main
        className={`relative mx-auto ${maxWidth} px-5 pb-24 pt-32`}
        aria-busy="true"
        aria-label="Memuat halaman"
      >
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <div className="relative" role="status">
          <span className="sr-only">Memuat halaman</span>
          {children}
        </div>
      </main>
    </>
  );
}

/* ── Varian per halaman ───────────────────────────────────────────────── */

/**
 * LEADERBOARD - halaman asli:
 *   h1 "Leaderboard NEXO" + subjudul "Diperbarui …"
 *   section "Top 10 Pemain": tabel 4 kolom (# | Pemain | Poin | Level), 10 baris
 *   section "Guild Terkuat": tabel 5 kolom
 */
function LeaderboardSkeleton() {
  const pemainRow = (i) => (
    <div key={i} className="flex items-center gap-3 border-b border-border-soft/60 px-4 py-3 last:border-0">
      <Bar className="h-4 w-5 shrink-0" />
      <Circle className="h-7 w-7 shrink-0" />
      <Bar className={i % 3 === 0 ? 'w-40' : i % 3 === 1 ? 'w-28' : 'w-32'} />
      <Bar className="ml-auto w-20 shrink-0" />
      <Bar className="h-4 w-8 shrink-0" />
    </div>
  );
  return (
    <Shell maxWidth="max-w-4xl">
      <h1 className="mt-3 font-display text-3xl text-ink md:text-4xl">Leaderboard NEXO</h1>
      <Bar className="mt-3 w-52" />

      {/* Top 10 Pemain */}
      <div className="mt-10">
        <Bar className="h-6 w-40" />
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center gap-4 border-b border-border-soft px-4 py-3">
            <Bar className="h-3 w-5" />
            <Bar className="h-3 w-24" />
            <Bar className="ml-auto h-3 w-16" />
            <Bar className="h-3 w-12" />
          </div>
          {Array.from({ length: 10 }).map((_, i) => pemainRow(i))}
        </Card>
      </div>

      {/* Guild Terkuat */}
      <div className="mt-12">
        <Bar className="h-6 w-36" />
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center gap-4 border-b border-border-soft px-4 py-3">
            <Bar className="h-3 w-5" />
            <Bar className="h-3 w-24" />
            <Bar className="ml-auto h-3 w-20" />
            <Bar className="hidden h-3 w-16 sm:block" />
            <Bar className="h-3 w-14" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border-soft/60 px-4 py-3 last:border-0">
              <Bar className="h-4 w-5 shrink-0" />
              <Bar className="w-32" />
              <Bar className="ml-auto w-24 shrink-0" />
              <Bar className="hidden h-4 w-10 shrink-0 sm:block" />
              <Bar className="h-4 w-8 shrink-0" />
            </div>
          ))}
        </Card>
      </div>
    </Shell>
  );
}

/**
 * SHOP - halaman asli:
 *   h1 "NEXO Shop." + accent-bar + subjudul
 *   deretan pill kategori (bulat, horizontal scroll)
 *   section per kategori: header (kotak ikon + label + deskripsi + badge jumlah)
 *   grid kartu 3 kolom; tiap kartu: emoji + nama + deskripsi 2 baris,
 *   baris bawah harga (kiri) + stok (kanan)
 */
function ShopSkeleton() {
  const itemCard = (i) => (
    <li key={i} className="rounded-2xl border border-border-soft bg-card-cream px-5 py-5">
      <div className="flex items-start gap-3">
        <div className="skeleton h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className={i % 2 ? 'w-3/5' : 'w-2/3'} />
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-4/5" />
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <Bar className="h-5 w-20" />
        <Bar className="h-3 w-14" />
      </div>
    </li>
  );

  const section = (i) => (
    <section key={i} className="mt-12">
      <div className="mb-5 flex items-center gap-3">
        <div className="skeleton h-9 w-9 shrink-0 rounded-xl" />
        <div className="space-y-2">
          <Bar className="h-5 w-36" />
          <Bar className="h-3 w-52" />
        </div>
        <div className="skeleton ml-auto h-6 w-9 rounded-full" />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, j) => itemCard(j))}
      </ul>
    </section>
  );

  return (
    <Shell maxWidth="max-w-5xl">
      <h1 className="font-display text-3xl tracking-tight text-ink md:text-4xl">NEXO Shop.</h1>
      <div className="accent-bar mt-4" aria-hidden="true" />
      <Bar className="mt-3 w-72" />

      {/* Pill kategori */}
      <nav aria-hidden="true" className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {[64, 88, 72, 96, 80, 76].map((w, i) => (
          <div key={i} className="skeleton h-8 shrink-0 rounded-full" style={{ width: `${w}px` }} />
        ))}
      </nav>

      {section(0)}
      {section(1)}
    </Shell>
  );
}

/**
 * BANK - halaman asli:
 *   h1 "Bank Watch" + subjudul
 *   3 kartu ringkasan (Pinjaman Aktif | Total Tunggakan | Telat Bayar*)
 *     *kartu ke-3 ber-border danger
 *   h2 "50 Hutang Terberat" + tabel 5 kolom
 */
function BankSkeleton() {
  const summary = (danger) => (
    <div
      className={`rounded-2xl border bg-card-cream px-5 py-5 text-center ${
        danger ? 'border-danger/40' : 'border-border-soft'
      }`}
    >
      <div className="skeleton mx-auto h-7 w-24" />
      <div className="skeleton mx-auto mt-2 h-3 w-24" />
    </div>
  );
  return (
    <Shell maxWidth="max-w-4xl">
      <h1 className="mt-3 font-display text-3xl text-ink md:text-4xl">Bank Watch</h1>
      <Bar className="mt-3 w-56" />

      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary(false)}
        {summary(false)}
        {summary(true)}
      </div>

      <div className="mt-12">
        <Bar className="h-6 w-56" />
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center gap-4 border-b border-border-soft px-4 py-3">
            <Bar className="h-3 w-20" />
            <Bar className="ml-auto h-3 w-16" />
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-20" />
            <Bar className="h-3 w-14" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border-soft/60 px-4 py-3 last:border-0">
              <Bar className={i % 2 ? 'w-28' : 'w-32'} />
              <Bar className="ml-auto w-20 shrink-0" />
              <Bar className="w-24 shrink-0" />
              <Bar className="w-24 shrink-0" />
              {/* pill status Telat/Aman */}
              <div className={`skeleton h-6 shrink-0 rounded-full ${i % 3 === 0 ? 'w-16' : 'w-14'}`} />
            </div>
          ))}
        </Card>
      </div>
    </Shell>
  );
}

/**
 * PREMIUM - halaman asli (rata tengah):
 *   pill "NEXO Pass" (bg-accent) + h1 + harga besar "Rp 20.000 /bulan"
 *   + paragraf max-w-lg, lalu kartu pembelian (PremiumClient)
 */
function PremiumSkeleton() {
  return (
    <Shell maxWidth="max-w-4xl">
      <div className="text-center">
        <div className="skeleton mx-auto h-8 w-36 rounded-full" />
        <h1 className="mt-5 font-display text-3xl text-ink md:text-5xl">Satu Pass, Semua Perk</h1>
        <div className="mt-5 flex items-end justify-center gap-2">
          <div className="skeleton h-10 w-52 md:h-14 md:w-72" />
        </div>
        <div className="mx-auto mt-5 max-w-lg space-y-2">
          <Bar className="w-full" />
          <Bar className="w-11/12" />
          <Bar className="mx-auto w-2/3" />
        </div>

        {/* Kartu pembelian (QRIS) - meniru PremiumClient */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <Card className="w-full max-w-sm p-6">
            <Bar className="h-6 w-36" />
            <Bar className="mt-4 h-3 w-full" />
            <Bar className="mt-2 h-3 w-5/6" />
            <div className="mt-4">
              <div className="skeleton mx-auto h-52 w-52 rounded-xl" />
            </div>
            <div className="mx-auto mt-4 h-14 w-full rounded-lg border border-border-soft bg-bg-soft" />
            <div className="skeleton mt-4 h-12 w-full rounded-full" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}

/**
 * PROFIL (/me) - halaman asli:
 *   kartu header NX-DARK: avatar + nama + bar XP + deretan statistik
 *   banner status akun
 *   grid 3 kolom: kiri (2/3) misi + riwayat, kanan sidebar
 */
function MeSkeleton() {
  return (
    <Shell maxWidth="max-w-3xl">
      {/* Header dark */}
      <div className="overflow-hidden rounded-2xl bg-card-dark">
        <div className="flex items-center justify-between gap-3 bg-card-dark-2 px-6 py-3">
          <Bar className="h-4 w-28 bg-white/10" />
          <Bar className="h-4 w-20 bg-white/10" />
        </div>
        <div className="px-6 py-6">
          <div className="flex items-center gap-4">
            <Circle className="h-16 w-16 shrink-0 bg-white/10" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-6 w-44 bg-white/10" />
              <Bar className="h-3 w-32 bg-white/10" />
            </div>
          </div>
          {/* bar XP */}
          <div className="mt-5">
            <Bar className="h-3 w-24 bg-white/10" />
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-card-dark-2" />
          </div>
          {/* deretan statistik */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Bar className="h-3 w-16 bg-white/10" />
                <Bar className="h-5 w-20 bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Banner status */}
      <div className="mt-5 rounded-2xl border border-border-soft bg-card-cream px-6 py-5">
        <Bar className="h-5 w-52" />
        <Bar className="mt-3 h-3 w-72" />
      </div>

      {/* Grid isi: misi + riwayat + sidebar */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="px-6 py-6">
            <Bar className="h-5 w-32" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-6 w-6 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Bar className={i % 2 ? 'w-2/3' : 'w-4/5'} />
                    <Bar className="h-2.5 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="overflow-hidden rounded-2xl bg-card-dark">
            <div className="flex items-center justify-between bg-card-dark-2 px-6 py-3">
              <Bar className="h-5 w-32 bg-white/10" />
              <Bar className="h-4 w-16 bg-white/10" />
            </div>
            <div className="space-y-3 px-6 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Bar className="h-4 w-24 bg-white/10" />
                  <Bar className="ml-auto h-4 w-16 bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <Card className="px-6 py-6">
            <Bar className="h-5 w-24" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Bar key={i} className={i % 2 ? 'w-3/4' : 'w-full'} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

/**
 * REDEEM - halaman asli:
 *   h1 + kartu form (input kode + tombol klaim, widget Turnstile)
 *   kartu riwayat klaim
 */
function RedeemSkeleton() {
  return (
    <Shell maxWidth="max-w-2xl">
      <h1 className="font-display text-3xl text-ink md:text-4xl">Redeem Kode</h1>
      <Bar className="mt-3 w-64" />

      <Card className="mt-8 p-6">
        <Bar className="h-5 w-32" />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="skeleton h-11 flex-1 rounded-xl" />
          <div className="skeleton h-11 w-full rounded-xl sm:w-28" />
        </div>
        {/* kotak Turnstile */}
        <div className="skeleton mt-4 h-16 w-full max-w-xs rounded-lg" />
      </Card>

      <Card className="mt-6 p-6">
        <Bar className="h-5 w-36" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-6 w-20 shrink-0 rounded-md" />
              <Bar className={i % 2 ? 'w-2/5' : 'w-1/2'} />
              <div className="skeleton ml-auto h-5 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    </Shell>
  );
}

/**
 * ADMIN - halaman asli (Dashboard):
 *   baris kartu metrik (2 kolom mobile / 4 kolom desktop) + sparkline
 *   kartu grafik "Tren Ekonomi & Aktivitas" + 3 sub-panel
 *   grid 2 kolom: "Top Game Hari Ini" dan "Top Server"
 */
function AdminSkeleton() {
  return (
    <Shell maxWidth="max-w-6xl">
      <Bar className="h-7 w-40" />
      <Bar className="mt-3 w-56" />

      {/* Kartu metrik */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="px-4 py-4">
            <Bar className="h-6 w-24" />
            <Bar className="mt-2 h-3 w-20" />
            <div className="skeleton mt-3 h-8 w-full rounded-md" />
          </Card>
        ))}
      </div>

      {/* Kartu grafik utama */}
      <Card className="mt-4 px-5 py-5">
        <Bar className="h-5 w-52" />
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-3 w-24" />
              <div className="skeleton h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </Card>

      {/* Dua panel bawah */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, p) => (
          <Card key={p} className="px-5 py-5">
            <Bar className="h-5 w-40" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-7 w-7 shrink-0 rounded-lg" />
                  <Bar className={i % 2 ? 'w-1/2' : 'w-2/5'} />
                  <Bar className="ml-auto w-14" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}

/**
 * HOME - halaman asli (landing):
 *   hero (maskot / kartu game) + statistik live + grid kartu game
 */
function HomeSkeleton() {
  return (
    <Shell maxWidth="max-w-5xl">
      <div className="text-center">
        <div className="skeleton mx-auto h-8 w-44 rounded-full" />
        <div className="skeleton mx-auto mt-5 h-11 w-80 max-w-full md:h-14 md:w-[34rem]" />
        <div className="mx-auto mt-4 max-w-xl space-y-2">
          <Bar className="w-full" />
          <Bar className="mx-auto w-3/4" />
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <div className="skeleton h-12 w-44 rounded-full" />
          <div className="skeleton h-12 w-40 rounded-full" />
        </div>
        <div className="skeleton mx-auto mt-8 h-52 w-52 rounded-2xl" />
      </div>

      {/* Statistik live */}
      <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="px-4 py-4 text-center">
            <Bar className="mx-auto h-6 w-20" />
            <Bar className="mx-auto mt-2 h-3 w-24" />
          </Card>
        ))}
      </div>

      {/* Kartu game */}
      <div className="mt-12">
        <Bar className="h-6 w-40" />
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="rounded-2xl border border-border-soft bg-card-cream px-5 py-5">
              <div className="flex items-start gap-3">
                <div className="skeleton h-7 w-7 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Bar className="w-3/5" />
                  <Bar className="h-3 w-full" />
                  <Bar className="h-3 w-4/5" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

/* ── Ekspor: pilih varian lewat prop `variant` ────────────────────────── */

const VARIANTS = {
  home: HomeSkeleton,
  leaderboard: LeaderboardSkeleton,
  shop: ShopSkeleton,
  bank: BankSkeleton,
  premium: PremiumSkeleton,
  me: MeSkeleton,
  redeem: RedeemSkeleton,
  admin: AdminSkeleton,
};

/**
 * @param {'home'|'leaderboard'|'shop'|'bank'|'premium'|'me'|'redeem'|'admin'} variant
 *   Varian skeleton yang meniru halaman tujuan.
 */
export default function PageSkeleton({ variant = 'home' }) {
  const Komponen = VARIANTS[variant] || HomeSkeleton;
  return <Komponen />;
}
