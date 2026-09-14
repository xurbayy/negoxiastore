// Kerangka halaman (loading skeleton) - dipasang lewat loading.jsx per route.
// Tujuan: saat halaman berat sedang dimuat (query Turso + render), pemain TIDAK
// melihat layar kosong, tapi bayangan layout yang meniru halaman aslinya. Begitu
// data siap, React menggantinya mulus.
//
// Kenapa begini:
// - Pakai komponen yang sama untuk semua route supaya konsisten (judul + kartu).
// - Tanpa animasi berat; kelas `.skeleton` sudah punya pulse halus dan otomatis
//   MATI saat pengguna memilih "reduce motion" (lihat globals.css).
// - Tanpa teks apa pun: kerangka saja, tidak ada tulisan "loading..." yang
//   bikin halaman terasa lambat.
// - Ada placeholder NAVBAR (fixed, tinggi sama dengan Navbar asli). Navbar
//   dirender per-halaman, bukan di layout, jadi tanpa placeholder ini navbar
//   akan hilang lalu muncul lagi = halaman terasa melompat.

// Placeholder navbar: meniru tinggi & posisi Navbar asli (fixed top-0, py-4,
// logo 36px) supaya tidak ada pergeseran layout saat halaman selesai dimuat.
function NavbarSkeleton() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 py-4">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5" aria-hidden="true">
        <div className="flex items-center gap-2.5">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="skeleton hidden h-5 w-28 lg:block" />
        </div>
        <div className="flex items-center gap-3">
          <div className="skeleton hidden h-4 w-16 sm:block" />
          <div className="skeleton hidden h-4 w-20 sm:block" />
          <div className="skeleton h-9 w-24 rounded-full" />
        </div>
      </nav>
    </header>
  );
}

// Satu batang abu-abu. width bisa dikirim sebagai kelas Tailwind (mis. 'w-40').
function Bar({ className = '' }) {
  return <div className={`skeleton h-4 ${className}`} />;
}

// Kerangka kartu: meniru .nx-card (krem, rounded, border tipis).
function CardSkeleton({ rows = 4, className = '' }) {
  return (
    <div className={`rounded-2xl border border-border-soft bg-card-cream p-5 shadow-[0_2px_12px_rgba(43,33,24,0.06)] ${className}`}>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className={i % 2 === 0 ? 'w-1/2' : 'w-2/5'} />
              <Bar className="h-3 w-1/4" />
            </div>
            <div className="skeleton h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * PageSkeleton - kerangka halaman generik.
 *
 * @param {string}  maxWidth   kelas max-w untuk kolom konten (default max-w-4xl)
 * @param {boolean} table      tampilkan kerangka tabel (leaderboard/bank)
 * @param {number}  cards      jumlah kartu (shop/premium)
 * @param {number}  cardRows   baris per kartu
 * @param {boolean} stats      tampilkan 3 kotak statistik di atas (bank)
 */
export default function PageSkeleton({
  maxWidth = 'max-w-4xl',
  table = false,
  cards = 0,
  cardRows = 4,
  stats = false,
}) {
  return (
    <>
      <NavbarSkeleton />
      <main className={`relative mx-auto ${maxWidth} px-5 pb-24 pt-32`} aria-busy="true" aria-label="Memuat halaman">
        {/* Grid latar, sama seperti halaman asli */}
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />

      <div className="relative" role="status">
        <span className="sr-only">Memuat halaman</span>

        {/* Judul halaman */}
        <div className="mt-3 space-y-3">
          <Bar className="h-9 w-56 md:h-11 md:w-72" />
          <Bar className="w-40" />
        </div>

        {/* Kotak statistik (bank) */}
        {stats && (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border-soft bg-card-cream px-5 py-5 text-center">
                <div className="skeleton mx-auto h-8 w-24" />
                <div className="skeleton mx-auto mt-2 h-3 w-20" />
              </div>
            ))}
          </div>
        )}

        {/* Kerangka tabel */}
        {table && (
          <div className="mt-10">
            <Bar className="h-6 w-40" />
            <div className="mt-4 overflow-hidden rounded-2xl border border-border-soft bg-card-cream">
              {/* header tabel */}
              <div className="flex items-center gap-3 border-b border-border-soft px-4 py-3">
                <Bar className="h-3 w-8" />
                <Bar className="h-3 w-24" />
                <Bar className="ml-auto h-3 w-16" />
                <Bar className="h-3 w-12" />
              </div>
              {/* baris */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border-soft/60 px-4 py-3 last:border-0">
                  <Bar className="h-4 w-6" />
                  <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
                  <Bar className="w-28" />
                  <Bar className="ml-auto w-20" />
                  <Bar className="h-4 w-8" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Kerangka kartu (shop/premium) */}
        {cards > 0 && (
          <div className={table || stats ? 'mt-12' : 'mt-8'}>
            <Bar className="h-6 w-48" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: cards }).map((_, i) => (
                <CardSkeleton key={i} rows={cardRows} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
    </>
  );
}
