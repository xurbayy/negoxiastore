'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NexoLogo } from '../ui';
import Dashboard from './Dashboard';
import Ekonomi from './Ekonomi';
import ShopManager from './ShopManager';
import BankManager from './BankManager';
import Nexopass from './Nexopass';
import RedeemManager from './RedeemManager';
import BroadcastManager from './BroadcastManager';
import Moderasi from './Moderasi';
import FeedbackManager from './FeedbackManager';
import ActivityLog from './ActivityLog';
import PlayerLookup from './PlayerLookup';
import Titles from './Titles';
import ManualOrders from './ManualOrders';

// Sidebar dikelompokkan per area kerja + badge angka live (dari data yang
// sudah di-poll - tanpa API baru). Visual saja, alur data tidak berubah.
const TAB_GROUPS = [
  { label: 'Pantau', tabs: [['dashboard', 'Dashboard'], ['players', 'Player Lookup'], ['log', 'Activity Log']] },
  { label: 'Ekonomi & Toko', tabs: [['ekonomi', 'Ekonomi'], ['shop', 'Shop'], ['bank', 'Bank'], ['redeem', 'Redeem'], ['manualorders', 'Pembayaran QRIS']] },
  { label: 'Member', tabs: [['nexopass', 'NEXO Pass'], ['titles', 'Titles']] },
  { label: 'Komunitas', tabs: [['broadcast', 'Broadcast'], ['moderasi', 'Sanksi & Moderasi'], ['feedback', 'Feedback']] },
];

// Kerangka admin: sidebar + konten. Data snapshot/log di-poll tiap 5 detik.
export default function AdminShell({ username, avatar = null }) {
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState(null); // { snapshot, series, log }
  const [menuOpen, setMenuOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const lastSig = useRef('');

  // Global UI states for admin commands
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { message, isError }

  // Badge sidebar: angka dari data yang sudah ada (pending command, sanksi, feedback).
  const badges = data ? {
    log: (data.log || []).filter((r) => r.status === 'pending').length,
    moderasi: (data.snapshot?.monitor?.bannedUsers || []).length,
    feedback: (data.feedback || []).length,
    nexopass: (data.snapshot?.premiumMembers || []).length,
    manualorders: (data.orders || []).filter((r) => r.status === 'pending' && r.gateway === 'manual').length,
  } : {};

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/data', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const sig = JSON.stringify(json);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        setData(json);
        setUpdatedAt(Date.now());
      }
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0); 
    const iv = setInterval(load, 5000);
    function onFocus() { load(); }
    window.addEventListener('focus', onFocus);
    return () => { clearTimeout(t); clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const send = useCallback(async (action, payload) => {
    setBusy(true);
    setToast(null);
    let finalOut = { ok: false, error: 'Gagal menghubungi server' };
    let pollId = null;
    
    try {
      const res = await fetch('/api/admin/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      
      if (!data.ok) {
        finalOut = data;
      } else if (data.ok && data.id) {
        pollId = data.id;
        // sertakan id antrean: komponen memakai `#${out.id}` utk konfirmasi
        finalOut = { ok: true, id: data.id, result: `Masuk antrean #${data.id}.` };
      } else {
        finalOut = { ok: true, result: 'Command terkirim.' };
      }
    } catch {
      finalOut.error = 'Gagal menghubungi server';
    }

    // Polling jika masuk antrean bot (maks 15 detik)
    if (pollId) {
      const startMs = Date.now();
      while (Date.now() - startMs < 15000) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const pollRes = await fetch(`/api/admin/command/${pollId}`);
          if (pollRes.ok) {
            const pData = await pollRes.json();
            if (pData.status === 'done') {
              finalOut = { ok: true, id: pollId, result: pData.result || 'Berhasil!' };
              break;
            } else if (pData.status === 'failed' || pData.status === 'rejected') {
              finalOut = { ok: false, id: pollId, error: pData.result || 'Gagal diproses bot' };
              break;
            }
          }
        } catch {}
      }
      
      // Jika belum ok setelah 15 detik, timpa finalOut dengan timeout message.
      if (!finalOut.ok && finalOut.error === 'Gagal menghubungi server') {
        finalOut = { ok: false, id: pollId, error: 'Waktu tunggu habis (bot sedang offline/sibuk) - perintah tetap antre.' };
      } else if (finalOut.ok && !finalOut.result.includes('#')) {
        finalOut = { ...finalOut, result: `${finalOut.result} (#${pollId})` };
      }
    }
    
    if (finalOut.ok) {
      setToast({ message: finalOut.result || 'Berhasil!', isError: false });
    } else {
      setToast({ message: finalOut.error || 'Terjadi kesalahan', isError: true });
    }
    
    // Auto hide toast after 4s
    setTimeout(() => setToast(null), 4000);
    
    await load(); // refresh log & data
    setBusy(false);
    return finalOut;
  }, [load]);

  return (
    <>
    {/* GLOBAL BUSY OVERLAY */}
    {busy && (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink/50 backdrop-blur-sm">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent"></div>
        <p className="mt-4 font-mono text-sm font-bold text-white shadow-black drop-shadow-md">Memproses Command...</p>
      </div>
    )}

    {/* GLOBAL TOAST */}
    {toast && (
      <div className="fixed bottom-10 left-1/2 z-[100] -translate-x-1/2 transform transition-all duration-300">
        <div className={`flex items-center gap-3 rounded-full px-5 py-3 shadow-2xl backdrop-blur-md border ${
          toast.isError ? 'bg-danger/90 border-danger/50 text-white' : 'bg-success/90 border-success/50 text-white'
        }`}>
          {toast.isError ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          )}
          <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
        </div>
      </div>
    )}

    {menuOpen && (
      <button
        type="button"
        aria-label="Tutup menu"
        onClick={() => setMenuOpen(false)}
        className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[2px] md:hidden"
      />
    )}
    <div className="mx-auto flex max-w-7xl gap-6 px-4 pb-20 pt-6 md:px-5">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 transform flex-col overflow-y-auto border-r border-border-soft bg-bg-soft p-5 transition-transform md:sticky md:top-6 md:z-auto md:max-h-[calc(100vh-3rem)] md:w-60 md:translate-x-0 md:overflow-hidden md:rounded-2xl md:border md:bg-card-cream/60 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Identitas panel: logo + nama sebaris (compact), lalu baris admin. */}
        <div className="mb-4 shrink-0 border-b border-border-soft pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex shrink-0 items-center"><NexoLogo size={34} /></span>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-display text-sm font-bold tracking-tight text-ink">NEXO Games</p>
              <p className="text-[0.6rem] uppercase tracking-widest text-ink-muted">Admin Panel</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full border border-border-soft" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-hover">
                {(username || '?').slice(0, 2).toUpperCase()}
              </span>
            )}
            <p className="min-w-0 truncate text-sm font-semibold text-ink">{username}</p>
          </div>
        </div>
        <nav aria-label="Menu admin" className="min-h-0 flex-1 md:overflow-y-auto">
          {TAB_GROUPS.map((g) => (
            <div key={g.label} className="mb-2.5">
              <p className="px-3 pb-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-ink-muted/70">{g.label}</p>
              <ul className="space-y-0.5">
                {g.tabs.map(([id, label]) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => { setTab(id); setMenuOpen(false); }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer ${
                        tab === id ? 'bg-accent/25 text-ink' : 'text-ink-muted hover:bg-bg hover:text-ink'
                      }`}
                      aria-current={tab === id ? 'page' : undefined}
                    >
                      <span className="truncate">{label}</span>
                      {Number(badges[id]) > 0 && (
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold leading-none ${
                          id === 'log' ? 'bg-accent text-ink' : id === 'feedback' ? 'bg-danger/15 text-danger' : 'bg-bg text-ink-muted'
                        }`}>{badges[id] > 99 ? '99+' : badges[id]}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <a href="/api/auth/logout" className="mt-4 flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border-soft bg-bg-soft px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-danger/40 hover:bg-danger/10 hover:text-danger cursor-pointer">Keluar Panel</a>
      </aside>

      {/* Konten */}
      <div className="min-w-0 flex-1">
        {/* Mobile: identitas tetap ada tapi senyap - logo (buka menu) + avatar saja. */}
        <div className="mb-3 flex items-center justify-between md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-2 rounded-lg px-1 py-1 cursor-pointer"
            aria-label="Buka menu admin"
            aria-expanded={menuOpen}
          >
            <span className="flex shrink-0 items-center"><NexoLogo size={28} /></span>
            <span className="text-ink-muted" aria-hidden="true">☰</span>
          </button>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="Admin" width={34} height={34} className="h-[34px] w-[34px] rounded-full border border-border-soft" />
          ) : (
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-hover" aria-label="Admin">
              {(username || '?').slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        {/* Indikator hidup: data bergerak sendiri tanpa tombol manual */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            {updatedAt && (
              <span className="flex items-center gap-2">
                <span className="pulse-dot" aria-hidden="true" />
                Live · diperbarui {new Date(updatedAt).toLocaleTimeString('id-ID')}
              </span>
            )}
          </div>
        </div>

        {!data ? (
          <div className="space-y-4">
            <div className="skeleton h-32 w-full" />
            <div className="skeleton h-48 w-full" />
          </div>
        ) : (
          <>
            {tab === 'dashboard' && <Dashboard data={data} />}
            {tab === 'ekonomi' && <Ekonomi send={send} data={data} />}
            {tab === 'shop' && <ShopManager send={send} data={data} />}
            {tab === 'bank' && <BankManager send={send} data={data} />}
            {tab === 'nexopass' && <Nexopass send={send} data={data} />}
            {tab === 'players' && <PlayerLookup />}
            {tab === 'redeem' && <RedeemManager send={send} data={data} />}
            {tab === 'titles' && <Titles send={send} data={data} />}
            {tab === 'manualorders' && <ManualOrders orders={data?.orders} reload={load} />}
            {tab === 'broadcast' && <BroadcastManager send={send} data={data} />}
            {tab === 'moderasi' && <Moderasi send={send} data={data} />}
            {tab === 'feedback' && <FeedbackManager send={send} data={data} />}
            {tab === 'log' && <ActivityLog data={data} />}
          </>
        )}
      </div>
    </div>
    </>
  );
}
