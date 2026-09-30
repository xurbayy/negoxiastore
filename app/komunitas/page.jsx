import { getLatestSnapshot, timeAgo } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';
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
 * PERUBAHAN KEBIJAKAN (permintaan pemilik 2026-09-30):
 *   Sebelumnya server TANPA invite disembunyikan sepenuhnya. Pemilik memutuskan
 *   server tetap DITAMPILKAN walau invite-nya belum siap - yang hilang cuma
 *   tombol "Gabung"-nya. Daftar server tetap berguna sebagai papan peringkat,
 *   dan lebih baik daripada halaman kosong tanpa penjelasan.
 *
 *   Tombol Gabung tetap hanya muncul kalau invite benar-benar ada, jadi tidak
 *   ada tautan mati.
 *
 * LOKASI DATA (penting - jangan diubah sembarangan):
 *   Bot menaruh `servers` dan `invites` di DALAM `monitor` (hasil
 *   collectMonitorStats di utils/webBridge.js), BUKAN di level atas snapshot.
 *   Membaca `snap.servers` akan selalu undefined -> halaman kosong selamanya.
 *   Fallback ke level atas dipertahankan untuk snapshot lama/eksperimen.
 *
 * Bot sudah mengurutkan berdasarkan: pemain -> game -> poin. Web tidak
 * mengurutkan ulang supaya peringkat konsisten dengan yang bot hitung.
 *
 * Mengembalikan `tanpaInvite` sebagai diagNosa: berapa server yang belum
 * punya link invite (tombolnya kosong), supaya bisa ditampilkan apa adanya.
 */
function siapkanServer(snap) {
  const mon = snap?.monitor || {};
  const daftar = Array.isArray(mon.servers) ? mon.servers : (Array.isArray(snap?.servers) ? snap.servers : []);
  const mentah = mon.invites || snap?.invites;
  const invites = mentah && typeof mentah === 'object' ? mentah : {};

  // Semua server tetap masuk daftar; invite hanya pelengkap.
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

  return {
    daftar: semua.slice(0, 100), // maksimal 100 server
    total: daftar.length,
    tanpaInvite: semua.filter((s) => !s.invite).length,
  };
}

export default async function KomunitasPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const snap = await getLatestSnapshot();
  const { daftar, total, tanpaInvite } = siapkanServer(snap);
  // Sebagian/total server belum punya link invite. Server TETAP ditampilkan
  // (permintaan pemilik 2026-09-30) - yang hilang hanya tombol Gabung-nya.
  // Keterangan ini murni penjelasan, bukan alasan menyembunyikan daftar.
  const adaTanpaInvite = snap && total > 0 && tanpaInvite > 0;

  // Diagnosa dari bot (monitor.inviteDiag) - dirakit di utils/webBridge.js
  // sehingga tetap terkirim walau utils/guildInvite.js sendiri gagal dimuat.
  // Kalau ada, halaman bisa menyebut PENYEBAB PASTINYA + server mana saja,
  // bukan cuma menduga dua kemungkinan.
  const diag = snap?.monitor?.inviteDiag || null;
  const alasannya = Array.isArray(diag?.alasan) ? diag.alasan : [];

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <AutoRefresh />
      <main className="relative mx-auto max-w-4xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />

        <div className="relative">
          <h1 className="mt-3 font-display text-3xl text-ink md:text-4xl">
            Komunitas <span className="font-display text-ink">NEXO</span>
          </h1>

          {snap ? (
            <p className="mt-3 text-xs text-ink-muted">
              Diperbarui {timeAgo(snap.ts)} · data live dari bot
            </p>
          ) : (
            <p className="mt-3 text-xs text-danger">
              ⚠ Bot belum mengirim data. Daftar akan muncul setelah bot online.
            </p>
          )}

          {adaTanpaInvite && (
            <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-ink">
              {diag && diag.gagal > 0 ? (
                <>
                  <p>
                    <strong>{tanpaInvite} dari {total} server</strong> belum punya link invite,
                    jadi tombol Gabung-nya belum muncul. Servernya tetap ditampilkan di daftar.
                  </p>
                  {alasannya.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      {alasannya.map((a, i) => (
                        <li key={i}>
                          <strong>{a.teks}</strong> - {a.jumlah} server
                          {a.server?.length > 0 && (
                            <span className="text-ink-muted">
                              {' '}({a.server.join(', ')}{a.sisa ? `, +${a.sisa} lagi` : ''})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {diag.modulHilang && (
                    <p className="mt-1.5">
                      Modul invite gagal dimuat: <code>{diag.modulHilang}</code>. Pastikan file{' '}
                      <strong>utils/guildInvite.js</strong> ada di folder bot hosting.
                    </p>
                  )}
                </>
              ) : (
                <p>
                  <strong>{tanpaInvite} dari {total} server</strong> belum punya link invite.
                  Penyebab tersering: bot belum diberi izin{' '}
                  <strong>Create Instant Invite</strong> di server itu. Servernya tetap
                  ditampilkan di daftar, hanya tombol Gabung-nya yang belum muncul.
                </p>
              )}
            </div>
          )}

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
