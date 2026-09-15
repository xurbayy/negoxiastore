'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import RichText from './RichText';
import { fmt, fmtRingkas, fmtPenuh } from '../../lib/formatClient';

// PLAYER LOOKUP: admin memasukkan Discord ID -> profil penuh (dari bot,
// real-time) + jejak perintah (gift/reward masuk atau belum) + order & klaim.
export default function PlayerLookup() {
  const [id, setId] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const timer = useRef(null);
  const pollCount = useRef(0);

  const load = useCallback(async (target) => {
    if (!target || target.length < 5) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/player?id=${target}`, { cache: 'no-store' });
      const j = await res.json();
      if (!j.ok) { setErr(j.error || 'Gagal.'); setData(null); }
      else { setErr(null); setData(j); }
      // kalau masih menyegarkan dari bot -> poll lagi 3 dtk (maks 8x)
      if (j.ok && j.refreshing && pollCount.current < 8) {
        pollCount.current += 1;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => load(target), 3000);
      } else {
        pollCount.current = 0;
      }
    } catch { setErr('Gagal menghubungi server.'); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const p = data?.profile?.exists ? data.profile.profile : null;
  const inv = p?.inventory || [];
  const tx = p?.transactions || [];
  const premium = p?.premium;

  return (
    <div className="space-y-5">
      <div className="nx-card px-5 py-5">
        <h2 className="font-display text-ink">Cari Player</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Masukkan Discord User ID. Data profil diambil <b>langsung dari bot</b>;
          kalau muncul status &quot;menyegarkan&quot;, panel otomatis cek ulang tiap 3 detik.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={id}
            onChange={(e) => setId(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && load(id)}
            placeholder="836383639439671366"
            className="w-full rounded-xl border border-border-soft bg-bg-soft px-4 py-3 font-mono text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <button type="button" disabled={busy || id.length < 5} onClick={() => load(id)}
            className="shrink-0 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-ink! transition hover:bg-accent-hover disabled:opacity-40 cursor-pointer">
            {busy ? 'Memuat…' : 'Cari'}
          </button>
        </div>
        {err && <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">{err}</p>}
      </div>

      {data && data.refreshing && !p && (
        <div className="nx-card px-5 py-4 text-sm text-ink-muted">Menyegarkan data dari bot… dicek ulang otomatis tiap 3 detik</div>
      )}

      {data && !data.profile && !data.refreshing && (
        <div className="nx-card px-5 py-4 text-sm text-ink">Bot tidak mengenali ID ini - user belum pernah memakai bot / ID salah.</div>
      )}

      {p && (
        <>
          {/* Kartu utama ala nxp */}
          <div className="nx-card px-5 py-5">
            <div className="flex flex-wrap items-center gap-3">
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatarUrl} alt="" width={52} height={52} className="h-[52px] w-[52px] rounded-full border border-border-soft" />
              ) : (
                <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent/20 text-lg font-bold text-accent-hover">{(p.username || '?').slice(0, 2)}</span>
              )}
              <div className="min-w-0">
                <p className="font-display text-lg text-ink">
                  {p.username}{' '}
                  {p.titleInfo && <RichText text={p.titleInfo.label} />}{' '}
                  {premium && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 align-middle text-[0.65rem] font-bold uppercase tracking-wider text-ink!">
                      <RichText text="<:download3:1548184905018507306>" size={12} /> NEXO PASS
                    </span>
                  )}
                </p>
                {p.adminTitle && <p className="text-sm text-ink-muted"><RichText text={p.adminTitle} /></p>}
                <p className="text-xs text-ink-muted">Level {p.level} • XP {fmtRingkas(p.xp)}/{fmtRingkas(p.xpNext)} • Rank global #{fmt(p.globalRank)}</p>
              </div>
              <p className="ml-auto text-right"><span className="block text-2xl font-bold text-ink" title={fmtPenuh(p.points)}>{fmtRingkas(p.points)}</span><span className="text-xs text-ink-muted">poin</span></p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label="Daily streak" value={`${p.dailyStreak} hari`} />
              <Stat label="Winstreak MP" value={`${p.winstreak}x`} />
              <Stat label="Menang / pasang" value={`${fmtRingkas(p.totalWon)} / ${fmtRingkas(p.totalBet)}`} />
              <Stat label="Guild" value={p.guild ? p.guild.name : '-'} />
            </div>
            {premium && (
              <p className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2 text-xs text-ink">
                Pass aktif s/d <b>{premium.lifetime ? 'LIFETIME ♾️' : new Date(premium.expiresAt).toLocaleDateString('id-ID')}</b>
                {premium.daysLeft != null && !premium.lifetime ? ` (sisa ${premium.daysLeft} hari)` : ''} • Beta games: <b>terbuka</b>
              </p>
            )}
            {p.loan && (
              <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-xs text-danger">
                Hutang bank: {fmt(p.loan.totalDue)} • jatuh tempo {new Date(p.loan.dueDate).toLocaleDateString('id-ID')}
                {p.loan.dueDate < Date.now() ? ' - TELAT' : ''}
              </p>
            )}
          </div>

          {/* Inventori + misi */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="nx-card px-5 py-5">
              <h3 className="font-display text-ink">Inventori</h3>
              {inv.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Kosong.</p> : (
                <ul className="mt-2 space-y-1 text-sm">
                  {inv.map((i) => (
                    <li key={i.itemKey} className="flex justify-between gap-2">
                      <RichText text={`${i.emoji || ''} ${i.name}`} />
                      <span className="text-ink-muted">{premium ? `×${i.quantity}` : `${i.quantity}/5`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="nx-card px-5 py-5">
              <h3 className="font-display text-ink">Misi Hari Ini</h3>
              {p.missions?.missions?.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {p.missions.missions.map((m) => (
                    <li key={m.id}>
                      <RichText text={m.icon || ''} size={16} /> {String(m.desc).replace('{n}', m.target)} - <span className="text-ink-muted">{m.progress}/{m.target}{m.claimed ? ' ✓' : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-ink-muted">Belum ada record hari ini.</p>}
            </div>
          </div>

          {/* Transaksi dari bot (bukti gift/reward masuk) */}
          <div className="nx-card px-5 py-5">
            <h3 className="font-display text-ink">Riwayat Transaksi</h3>
            {tx.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Belum ada log.</p> : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead><tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted"><th className="py-2 pr-3">Waktu</th><th className="pr-3">Jenis</th><th className="pr-3 text-right">Poin</th><th>Keterangan</th></tr></thead>
                  <tbody>
                    {tx.map((t, i) => (
                      <tr key={i} className="border-b border-border-soft/50">
                        <td className="whitespace-nowrap py-1.5 pr-3 text-ink-muted">{new Date(t.createdAt).toLocaleString('id-ID')}</td>
                        <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${t.amount > 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>{t.type}</span></td>
                        <td className="pr-3 text-right font-mono">{t.amount > 0 ? '+' : ''}{fmtRingkas(t.amount)}</td>
                        <td className="text-ink-muted">{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Jejak perintah ke user ini */}
          <div className="nx-card px-5 py-5">
            <h3 className="font-display text-ink">Riwayat Perintah Terakhir</h3>
            {data.commands.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Belum ada.</p> : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.commands.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase ${c.status === 'done' ? 'bg-success/15 text-success' : c.status === 'failed' || c.status === 'rejected' ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-ink-muted'}`}>{c.status}</span>
                    <span className="font-mono text-xs text-ink!">{c.action}</span>
                    <span className="text-ink-muted">{c.result}</span>
                    <span className="ml-auto text-xs text-ink-muted">#{c.id} • {new Date(c.createdAt).toLocaleString('id-ID')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Order & klaim web */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="nx-card px-5 py-5">
              <h3 className="font-display text-ink">Riwayat Order Premium</h3>
              {data.orders.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Belum pernah order.</p> : (
                <ul className="mt-2 space-y-1 text-sm">{data.orders.map((o) => <li key={o.id} className="flex justify-between"><span>{o.plan} • {fmt(o.amount)}</span><span className="text-ink-muted">{o.status} • {new Date(o.createdAt).toLocaleDateString('id-ID')}</span></li>)}</ul>
              )}
            </div>
            <div className="nx-card px-5 py-5">
              <h3 className="font-display text-ink">Klaim Redeem Promo</h3>
              {data.claims.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Belum ada.</p> : (
                <ul className="mt-2 space-y-1 text-sm">{data.claims.map((c, i) => <li key={i} className="flex justify-between"><span className="font-mono">{c.code}</span><span className="text-ink-muted">{c.status}{c.failReason ? ` (${c.failReason})` : ''}</span></li>)}</ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="rounded-xl border border-border-soft bg-card-cream/60 px-3 py-2"><p className="text-xs uppercase tracking-wider text-ink-muted">{label}</p><p className="mt-0.5 truncate font-semibold text-ink!">{value}</p></div>;
}
