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
 * ATURAN PENTING (kebijakan pemilik): server yang TIDAK punya invite
 * permanen TIDAK ditampilkan. Jadi daftar ini sudah tersaring - setiap
 * server di sini pasti bisa di-join.
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
 * Mengembalikan juga `total` dan `tanpaInvite` sebagai DIAGNOSA: kalau bot
 * sudah mengirim server tapi nol yang punya invite, halaman menampilkan
 * penyebabnya (izin Create Instant Invite / modul invite belum ter-deploy)
 * alih-alih cuma bilang "Belum ada server" - pertanyaan pertama pemilik
 * selalu "kenapa servernya tidak keluar", dan tanpa angka ini mustahil
 * dibedakan dari "bot belum push apa-apa".
 */
function siapkanServer(snap) {
  const mon = snap?.monitor || {};
  const daftar = Array.isArray(mon.servers) ? mon.servers : (Array.isArray(snap?.servers) ? snap.servers : []);
  const mentah = mon.invites || snap?.invites;
  const invites = mentah && typeof mentah === 'object' ? mentah : {};

  const denganInvite = daftar
    .map((s) => {
      const inv = invites[s.guildId];
      if (!inv || !inv.url) return null; // tanpa invite -> tidak ditampilkan
      return {
        guildId: s.guildId,
        name: s.name,
        iconUrl: s.iconUrl || null,
        players: Number(s.players) || 0,
        games: Number(s.games) || 0,
        points: Number(s.points) || 0,
        members: Number(s.members) || 0,
        invite: inv.url,
      };
    })
    .filter(Boolean);

  return {
    daftar: denganInvite.slice(0, 100), // maksimal 100 server
    total: daftar.length,
    tanpaInvite: daftar.length - denganInvite.length,
  };
}

export default async function KomunitasPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const snap = await getLatestSnapshot();
  const { daftar, total, tanpaInvite } = siapkanServer(snap);
  // Server sudah masuk tapi nol yang punya invite = masalah di sisi bot
  // (izin Create Instant Invite / modul invite belum ter-deploy), bukan
  // "bot belum push". Tanpa pesan ini pemilik hanya melihat "Belum ada
  // server" dan menyimpulkan servernya tidak kebaca.
  const semuaTanpaInvite = snap && total > 0 && tanpaInvite === total;

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

          {semuaTanpaInvite && (
            <div className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-ink">
              {diag ? (
                <>
                  <p>
                    ⚠ Bot sudah mengirim <strong>{total} server</strong>, tetapi{' '}
                    <strong>{diag.gagal}</strong> gagal dibuatkan link invite
                    {diag.ok ? ` (${diag.ok} berhasil)` : ''}.
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
                  ⚠ Bot sudah mengirim <strong>{total} server</strong>, tetapi belum ada satu pun
                  link invite. Bot kamu belum mengirim keterangan penyebabnya (kode lama). Setelah
                  bot di-restart dengan versi terbaru, bagian ini akan menyebut sebabnya dan
                  server mana saja yang belum memberi izin. Sementara itu: pastikan bot diberi izin{' '}
                  <strong>Create Instant Invite</strong> dan file{' '}
                  <strong>utils/guildInvite.js</strong> ada di hosting.
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
