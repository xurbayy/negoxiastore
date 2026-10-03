import { getLatestSnapshot } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';
import AdUnit from '../components/AdUnit';
import KomunitasClient from './KomunitasClient';

export const metadata = {
  title: 'Komunitas',
  description:
    'Temukan 100 server Discord NEXO teratas - diurutkan dari pemain terbanyak, game paling sering dimainkan, dan total poin tertinggi. Langsung gabung lewat link invite.',
  alternates: { canonical: '/komunitas' },
};

// Data selalu fresh dari bot (snapshot), jangan di-cache statis.
export const dynamic = 'force-dynamic';

/**
 * Gabungkan data server dari snapshot bot dengan invite permanennya.
 *
 * ATURAN DAFTAR (permintaan pemilik; revisi 2026-10-03):
 *   Hanya server yang BENAR-BENAR ADA PEMAINNYA dan PUNYA LINK INVITE yang
 *   ditampilkan. Server tanpa invite DISBURUH SELURUHNYA - tidak ada lagi
 *   label "Link belum tersedia" dan tidak ada notice "belum punya link
 *   invite". Daftar ini papan "server paling ramai main NEXO yang bisa
 *   kamu gabung", bukan inventaris semua server.
 *   (Data live: 44 server bot, 24 di antaranya masih 0 pemain.)
 *
 * LOKASI DATA (penting - jangan diubah sembarangan):
 *   Bot menaruh `servers` dan `invites` di DALAM `monitor` (hasil
 *   collectMonitorStats di utils/webBridge.js), BUKAN di level atas snapshot.
 *   Membaca `snap.servers` akan selalu undefined -> halaman kosong selamanya.
 *   Fallback ke level atas dipertahankan untuk snapshot lama/eksperimen.
 *
 * Bot sudah mengurutkan berdasarkan: pemain -> game -> poin. Web tidak
 * mengurutkan ulang supaya peringkat konsisten dengan yang bot hitung.
 * Karena yang pemain-0 / tanpa-invite sudah dibuang, urutan bot tetap terjaga.
 */
function siapkanServer(snap) {
  const mon = snap?.monitor || {};
  const daftar = Array.isArray(mon.servers) ? mon.servers : (Array.isArray(snap?.servers) ? snap.servers : []);
  const mentah = mon.invites || snap?.invites;
  const invites = mentah && typeof mentah === 'object' ? mentah : {};

  const semua = daftar.map((s) => ({
    guildId: s.guildId,
    name: s.name,
    iconUrl: s.iconUrl || null,
    players: Number(s.players) || 0,
    games: Number(s.games) || 0,
    points: Number(s.points) || 0,
    members: Number(s.members) || 0,
    invite: invites[s.guildId]?.url || null, // null = tombol Gabung tidak tampil
  }));

  // Buang server tanpa pemain ATAU tanpa invite (revisi 2026-10-03), dan
  // TERAPKAN SYARAT MINIMAL 20 PEMAIN (permintaan pemilik 2026-10-03) - sama
  // persis dengan getLiveServers supaya jalur live & fallback konsisten.
  // Dibandingkan dengan angka, bukan string, supaya '0' dari JSON tidak lolos.
  const adaPemain = semua.filter((s) => s.players >= 20 && s.invite);

  return {
    daftar: adaPemain.slice(0, 100), // maksimal 100 server
    total: adaPemain.length,          // jumlah yang BENAR-BENAR tampil
  };
}

export default async function KomunitasPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  // SERVER LANGSUNG DARI DB BOT (2026-10-03): tidak menunggu push bot.
  // Fallback ke snapshot kalau query DB gagal.
  const { getLiveServers } = await import('../lib/liveCatalog');
  const liveServers = await getLiveServers();
  const snap = liveServers ? null : await getLatestSnapshot();
  const { daftar, total } = liveServers
    ? {
        daftar: liveServers,
        total: liveServers.length,
      }
    : siapkanServer(snap);
  // Notice "server belum punya link invite" DIHAPUS (permintaan pemilik
  // 2026-10-03): server tanpa invite tetap tampil di daftar, cukup tanpa
  // tombol Gabung - tanpa kotak peringatan apa pun di atas daftar.

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <AutoRefresh />
      <main className="relative mx-auto max-w-4xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />

        <div className="relative">
          {/* Iklan AdSense di atas judul (permintaan pemilik 2026-10-01).
              Slot PER-HALAMAN dari env - beda halaman beda unit, supaya
              AdSense bisa mengukur performa tiap posisi secara terpisah.
              Fallback ke NEXT_PUBLIC_ADSENSE_SLOT (nama lama) agar tidak
              langsung kosong kalau env baru belum diisi. */}
          <div className="mb-4">
            <AdUnit
              slot={
                process.env.NEXT_PUBLIC_ADSENSE_SLOT_KOMUNITAS ||
                process.env.NEXT_PUBLIC_ADSENSE_SLOT
              }
              format="auto"
            />
          </div>
          <h1 className="mt-3 font-display text-3xl text-ink md:text-4xl">
            Komunitas <span className="font-display text-ink">NEXO</span>
          </h1>

          {/* Baris "Diperbarui ..." DIHAPUS (permintaan pemilik 2026-09-30).
              Sudah ada indikator kecil mengambang di kanan bawah yang
              BERDETAK tiap detik dan bisa diklik - jadi baris ini hanya
              pengulangan yang tidak menambah informasi. Yang tersisa cuma
              peringatan kalau bot benar-benar belum mengirim data. */}
          {/* Peringatan "Bot belum mengirim data" DIHAPUS (2026-10-03):
              daftar server dibaca LANGSUNG dari database (Supabase), tidak
              lagi bergantung pada bot mengirim/push. */}

          {/* Notice "server belum punya link invite" DIHAPUS (2026-10-03).
              Daftar server langsung tampil tanpa kotak peringatan. */}

          <KomunitasClient servers={daftar} />

          {/* Catatan untuk pemilik server */}
          <div className="nx-card mt-10 p-5">
            <h2 className="font-display text-base font-bold text-ink">Punya server sendiri?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Undang bot NEXO ke servermu, dan pastikan izin{' '}
              <strong className="text-ink">Create Instant Invite</strong> aktif supaya servermu
              bisa tampil di halaman ini. Peringkat dihitung otomatis dari aktivitas pemain.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
