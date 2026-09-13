import { getLatestSnapshot } from '../lib/snapshot';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import { emojiSrc } from '../lib/emojis';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AutoRefresh from '../components/AutoRefresh';

export const metadata = {
  title: 'Bank Watch',
  description:
    'Pantau pinjaman aktif di Bank NEXO: total tunggakan, daftar 50 hutang terberat, dan siapa saja yang telat bayar. Data live dari bot.',
  alternates: { canonical: '/bank' },
};

export const dynamic = 'force-dynamic';

export default async function BankPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  const snap = await getLatestSnapshot();
  const loans = snap?.loans || [];
  const mon = snap?.monitor?.loans || {};

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <AutoRefresh />
      <main className="relative mx-auto max-w-4xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <div className="relative">
          <h1 className="mt-3 font-display text-3xl text-ink md:text-4xl">
            Bank <span className="font-display text-ink">Watch</span>
          </h1>
          {snap ? (
            <p className="mt-2 text-sm text-ink-muted">Diperbarui {timeAgo(snap.ts)} · data live dari bot</p>
          ) : (
            <p className="mt-2 text-sm text-danger">⚠ Bot belum mengirim data bank.</p>
          )}

          {/* Ringkasan */}
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="nx-card px-5 py-5 text-center">
              <div className="font-display text-2xl text-ink">{Number(mon.count ?? loans.length).toLocaleString('id-ID')}</div>
              <div className="mt-1 text-xs text-ink-muted">Pinjaman Aktif</div>
            </div>
            <div className="nx-card px-5 py-5 text-center">
              <div className="font-display text-2xl text-ink">{Number(mon.owed ?? 0).toLocaleString('id-ID')}</div>
              <div className="mt-1 text-xs text-ink-muted">Total Tunggakan</div>
            </div>
            <div className="nx-card border-danger/40 px-5 py-5 text-center">
              <div className="font-display text-2xl text-danger">{Number(mon.overdue ?? 0).toLocaleString('id-ID')}</div>
              <div className="mt-1 text-xs text-ink-muted">Telat Bayar</div>
            </div>
          </div>

          {/* Tabel 50 hutang terberat */}
          <h2 className="mt-12 font-display text-xl text-ink">50 Hutang Terberat</h2>
          <div className="nx-card mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
                  <th scope="col" className="px-4 py-3">Pemain</th>
                  <th scope="col" className="px-4 py-3 text-right">Pinjaman</th>
                  <th scope="col" className="px-4 py-3 text-right">Total Due</th>
                  <th scope="col" className="px-4 py-3">Jatuh Tempo</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {loans.length === 0 && (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-ink-muted">Tidak ada pinjaman aktif. Semua aman 🎉</td></tr>
                )}
                {loans.map((l) => (
                  <tr key={l.userId} className="border-b border-border-soft/60 last:border-0 hover:bg-card-cream/60">
                    <td className="px-4 py-3 font-semibold text-ink">{l.username}</td>
                    <td className="px-4 py-3 text-right">{Number(l.amount).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        {emojiSrc('goldcoin') && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={emojiSrc('goldcoin')} alt="" width={14} height={14} className="inline h-3.5 w-3.5" />
                        )}
                        {Number(l.totalDue).toLocaleString('id-ID')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{new Date(l.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3">
                      {l.overdue ? (
                        <span className="inline-flex items-center rounded-full bg-danger px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-white">Telat</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-success px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-white">Aman</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 0) return 'baru saja';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} detik lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  return `${Math.floor(m / 60)} jam lalu`;
}
