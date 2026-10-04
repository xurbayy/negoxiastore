'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { NexoLogo } from '../ui';
// Isi skeleton panel yang SAMA dengan app/admin/loading.jsx (anti skeleton dobel).
import { AdminSkeletonBody, AdminAiSkeletonBody } from '../PageSkeleton';
import AutoRefresh from '../AutoRefresh';
import Dashboard from './Dashboard';
import AnalisisAI from './AnalisisAI';
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
  { label: 'Pantau', tabs: [['ai', 'NEXO AI'], ['dashboard', 'Dashboard'], ['players', 'Player Lookup'], ['log', 'Activity Log']] },
  { label: 'Ekonomi & Toko', tabs: [['ekonomi', 'Ekonomi'], ['shop', 'Shop'], ['bank', 'Bank'], ['redeem', 'Redeem'], ['manualorders', 'Pembayaran QRIS']] },
  { label: 'Member', tabs: [['nexopass', 'NEXO Pass'], ['titles', 'Titles']] },
  { label: 'Komunitas', tabs: [['broadcast', 'Broadcast'], ['moderasi', 'Sanksi & Moderasi'], ['feedback', 'Feedback']] },
];

// Kerangka admin: sidebar + konten. Data snapshot/log di-poll tiap 5 detik.
// Daftar ID tab yang sah - dipakai untuk memvalidasi tab dari URL/localStorage
// supaya nilai asing tidak membuat panel menampilkan tab kosong.
const TAB_VALID = new Set(TAB_GROUPS.flatMap((g) => g.tabs.map(([id]) => id)));

export default function AdminShell({ username, avatar = null }) {
  // TAB: mulai dari Dashboard saat BARU MASUK; refresh tetap di tab terakhir.
  //
  // FIX (permintaan pemilik 2026-10-04): "ketika gw baru masuk admin panel ga
  // ke dashboard dulu, harusnya mulai dari dashboard".
  //
  // Penyebabnya DUA penyimpanan lintas-sesi di localStorage:
  //   - nexo_admin_tab           : tab terakhir, tidak pernah dihapus -> setiap
  //                                  kali buka /admin (tanpa hash) panel terbuka
  //                                  di tab lama, bukan Dashboard.
  //   - nexo_admin_tab_tujuan    : hash tujuan login, tidak pernah dihapus ->
  //                                  nyangkut dan memaksa tab itu terus.
  //
  // Sekarang sumber kebenaran = HASH di URL (survive refresh via pushState).
  //   - Ada hash valid (#ekonomi) -> buka tab itu (refresh/bookmark).
  //   - Tanpa hash (baru masuk / ketik /admin) -> DEFAULT 'dashboard'.
  //   - nexo_admin_tab_tujuan dibaca SEKALI lalu DIHAPUS (consume-once) -
  //     dipakai hanya untuk mendarat di tab bookmark saat login, tidak
  //     pernah membeku untuk login berikutnya.
  //   - Restore nexo_admin_tab (localStorage) DIHAPUS - refresh sudah dijaga
  //     oleh hash URL, jadi localStorage tidak diperlukan dan justru bikin
  //     panel membuka tab lama saat masuk baru.
  const [tab, setTab] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    const dariHash = window.location.hash.replace(/^#/, '');
    if (dariHash && TAB_VALID.has(dariHash)) return dariHash;
    try {
      const tujuan = window.localStorage.getItem('nexo_admin_tab_tujuan');
      if (tujuan && TAB_VALID.has(tujuan)) {
        // consume-once: langsung hapus supaya tidak membeku ke login berikutnya.
        window.localStorage.removeItem('nexo_admin_tab_tujuan');
        return tujuan;
      }
    } catch (_) { /* localStorage bisa diblokir - abaikan */ }
    return 'dashboard';
  });
  const [data, setData] = useState(null); // { snapshot, series, log }
  const [menuOpen, setMenuOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  // Efek navbar: saat halaman digulir, bar jadi solid + lebih rapat (sama
  // seperti Navbar halaman user). Memberi kesan hidup + konsisten.
  const [scrolled, setScrolled] = useState(false);
  // PENGINGAT AI di navbar (permintaan pemilik 2026-10-01): dipindah dari
  // halaman AI ke sebelah profil supaya terlihat dari halaman admin mana pun.
  const [pengingat, setPengingat] = useState([]);
  const lastSig = useRef('');
  // Area konten (dipakai untuk melompat ke atas saat tab berganti).
  const kontenRef = useRef(null);
  // Penanda supaya lompatan hanya terjadi saat tab DIGANTI admin, bukan saat
  // render pertama atau saat data di-poll ulang (tiap 5 detik).
  const tabSebelumnya = useRef(null);

  // Global UI states for admin commands
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { message, isError }

  // Badge sidebar: angka dari data yang sudah ada (pending command, sanksi, feedback).
  // Moderasi & NEXO Pass pakai data DB langsung (data.bannedUsers / premiumMembers)
  // supaya angkanya tidak menunggu snapshot push.
  const badges = data ? {
    log: (data.log || []).filter((r) => r.status === 'pending').length,
    moderasi: (data.bannedUsers || data.snapshot?.monitor?.bannedUsers || []).length,
    feedback: (data.feedback || []).length,
    nexopass: (data.premiumMembers || data.snapshot?.premiumMembers || []).length,
    manualorders: (data.orders || []).filter((r) => r.status === 'pending' && r.gateway === 'manual').length,
  } : {};

  // Angka untuk tombol notif pengingat di navbar.
  const pengingatAktif = pengingat.filter((p) => !p.selesai);
  const jumlahPengingat = pengingatAktif.length;
  const jumlahJatuhTempo = pengingatAktif.filter((p) => p.jatuhTempo).length;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/data', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
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
    // REALTIME (permintaan pemilik 2026-10-03): poll supaya seluruh panel
    // selalu terbaru tanpa admin menekan refresh.
    // OPTIMASI EGRESS (2026-10-05): 5s -> 10s. Server sudah punya cache 8s
    // untuk endpoint ini (poll 5s = 40% request terbuang ke cache), jadi
    // 10s = hampir semua request berguna. Data tetap terasa live (<=10s),
    // beban request Vercel + egress Supabase turun ~50%. Berhenti saat tab
    // tidak terlihat (document.hidden), dan hanya setState kalau data
    // BENAR-BENAR berubah (dibanding lewat lastSig).
    const iv = setInterval(() => { if (!document.hidden) load(); }, 10000);
    function onFocus() { if (!document.hidden) load(); }
    function onVisible() { if (!document.hidden) load(); }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(t); clearInterval(iv);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Pantau posisi gulir untuk efek navbar (solid + rapat setelah 24px).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // PENGINGAT: muat + perbarui tiap 60 detik supaya penanda 'jatuh tempo'
  // hidup sendiri tanpa pemilik perlu refresh halaman.
  const muatPengingat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai/reminders', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setPengingat(d.reminders || []);
    } catch { /* gagal muat tidak menghalangi panel */ }
  }, []);

  useEffect(() => {
    muatPengingat();
    const iv = setInterval(muatPengingat, 60000);
    return () => clearInterval(iv);
  }, [muatPengingat]);

  const tandaiPengingat = useCallback(async (id, selesai = true) => {
    try {
      const res = await fetch(`/api/admin/ai/reminders?id=${id}${selesai ? '' : '&selesai=0'}`, { method: 'PATCH' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) muatPengingat();
    } catch { /* abaikan */ }
  }, [muatPengingat]);

  const hapusPengingat = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/admin/ai/reminders?id=${id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setPengingat((p) => p.filter((x) => x.id !== id));
    } catch { /* abaikan */ }
  }, []);

  // GANTI TAB: simpan pilihan ke URL hash supaya bertahan saat refresh, dan
  // tombol Back/Forward browser ikut berfungsi.
  // CATATAN: tidak lagi menulis localStorage (refresh sudah dijaga hash URL);
  // localStorage justru bikin panel membuka tab lama saat baru masuk.
  const gantiTab = useCallback((id) => {
    setTab(id);
    setMenuOpen(false);
    try {
      // Hash (bukan query) supaya tidak memicu navigasi server / reload data.
      // history.pushState -> tombol Back kembali ke tab sebelumnya, enak dipakai.
      window.history.pushState(null, '', '#' + id);
    } catch (_) { /* pushState bisa diblokir - abaikan */ }
  }, []);

  // Ikuti tombol Back/Forward browser: kalau hash berubah, pindah tab.
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace(/^#/, '');
      if (id && TAB_VALID.has(id)) setTab(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Lompat ke atas setiap kali TAB DIGANTI.
  //
  // Kenapa perlu: mengganti tab hanya menukar isi area konten tanpa menyentuh
  // posisi gulir. Kalau admin sedang di bawah (mis. setelah menggulir daftar
  // panjang di Dashboard), panel tab baru terbuka di tengah gulir sehingga
  // terlihat kosong - isinya sebenarnya ada di atas.
  //
  // tabSebelumnya mencegah lompatan ini ikut jalan saat render pertama atau
  // saat data di-poll ulang tiap 5 detik (tab tidak berubah -> tidak digulir).
  useEffect(() => {
    const pertamaKali = tabSebelumnya.current === null;
    if (tabSebelumnya.current === tab) return;
    tabSebelumnya.current = tab;
    if (pertamaKali) return; // render pertama: posisi dibiarkan apa adanya
    kontenRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [tab]);

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
      } else if (data.ok && data.langsung) {
        // JALUR LANGSUNG (fix 2026-10-04): aksi dieksekusi instan dari DB,
        // tidak ada id antrean -> dulu UI menampilkan "masuk antrean (#undefined)".
        finalOut = { ok: true, langsung: true, result: data.hasil || 'Berhasil dijalankan langsung.' };
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
            const pData = await pollRes.json().catch(() => ({}));
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
        finalOut = { ok: false, id: pollId, error: 'Waktu tunggu habis, bot sedang offline atau sibuk. Perintah tetap antre.' };
      } else if (finalOut.ok && !finalOut.result.includes('antrean nomor')) {
        finalOut = { ...finalOut, result: `${finalOut.result} Antrean nomor ${pollId}.` };
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

    {/* GLOBAL TOAST
        MOBILE (permintaan pemilik 2026-10-04: "notif admin panel mobile terlalu
        besar"): dulu tanpa batas lebar + px-5 py-3 + tracking-wide -> pesan
        panjang melebar melebihi layar HP. Sekarang dibatasi lebar layar, padding
        & teks lebih kecil di mobile, dan boleh turun baris (bukan satu baris
        panjang yang terpotong). */}
    {toast && (
      <div className="fixed bottom-6 left-1/2 z-[100] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 transition-all duration-300 sm:bottom-10 sm:w-auto">
        <div className={`flex items-start gap-2 rounded-2xl px-3 py-2.5 shadow-2xl backdrop-blur-md border sm:items-center sm:gap-3 sm:rounded-full sm:px-5 sm:py-3 ${
          toast.isError ? 'bg-danger/90 border-danger/50 text-white' : 'bg-success/90 border-success/50 text-white'
        }`}>
          <span className="mt-0.5 shrink-0 sm:mt-0">
          {toast.isError ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sm:h-[18px] sm:w-[18px]"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sm:h-[18px] sm:w-[18px]"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          )}
          </span>
          <span className="min-w-0 text-xs font-semibold leading-snug sm:text-sm sm:tracking-wide">{toast.message}</span>
        </div>
      </div>
    )}

    {menuOpen && (
      <button
        type="button"
        aria-label="Tutup menu"
        onClick={() => setMenuOpen(false)}
        // z-[60] - DI ATAS navbar (z-50). Dulu z-30 sehingga navbar tetap
        // terlihat menimpa sidebar saat menu dibuka di mobile.
        className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-[2px] md:hidden"
      />
    )}
    {/* Bar atas admin: MENEMPEL di atas seperti navbar halaman lain.
        Kenapa `fixed inset-x-0 top-0`: halaman lain memakai <Navbar> dengan
        posisi fixed, sehingga selalu ikut terlihat saat digulir. Panel admin
        sebelumnya tidak punya bar ini - hanya tombol Menu kecil di dalam kolom
        konten (yang ikut hilang di desktop). Sekarang satu bar tipis menempel
        di semua ukuran, konsisten dengan sisa situs.

        Isinya:
        - Kiri: tombol Menu (hanya mobile, membuka sidebar) + logo + "Admin Panel".
        - Kanan: tautan "Lihat Situs" (kembali ke beranda) + avatar admin.

        Konten di bawahnya diberi pt agar tidak tertutup bar yang fixed ini. */}
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-border-soft bg-bg/90 py-2.5 backdrop-blur-xl'
          : 'bg-transparent py-4'
      } ${
        // Di mobile, saat sidebar dibuka navbar DISEMBUNYIKAN. Tanpa ini,
        // logo + tombol hamburger tetap tampak dan menimpa panel sidebar
        // (dulu navbar z-50 > sidebar z-40, jadi selalu di atas).
        // md:block memastikan di desktop animasi ini tidak berlaku.
        menuOpen ? 'pointer-events-none -translate-y-full opacity-0 md:translate-y-0 md:opacity-100' : ''
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-5" aria-label="Navigasi admin">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Tombol Menu hanya untuk mobile (sidebar desktop selalu tampak).
              Gaya sama dengan tombol hamburger Navbar user (kotak ikon). */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-soft text-ink cursor-pointer md:hidden"
            aria-label="Buka menu admin"
            aria-expanded={menuOpen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <Link href="/" className="flex items-center gap-2.5 leading-none cursor-pointer" aria-label="NEXO Games - Beranda">
            <span className="flex shrink-0 items-center"><NexoLogo size={36} /></span>
            <span className="hidden font-display text-lg font-bold tracking-tight text-ink sm:inline">
              NEXO Games
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="hidden rounded-lg border border-border-soft bg-white px-3.5 py-1.5 text-sm font-semibold text-ink-muted shadow-sm transition hover:border-accent/50 hover:text-ink sm:inline-flex cursor-pointer"
          >
            Lihat Situs
          </Link>

          {/* ==========================================
              TOMBOL NOTIF PENGINGAT - di navbar, sebelah profil
              ==========================================
              Permintaan pemilik: "notif di AI itu pindahin aja ke sebelah
              profil jadi ada notif disitu yang dimana ingatannya tu keliatan
              jadi jelas kalo ada notif".

              Jadi pengingat dari AI sekarang muncul di SINI - terlihat dari
              halaman admin mana pun, bukan cuma di tab AI. Menyala MERAH
              kalau ada pengingat aktif. */}
          <details className="group relative">
            <summary
              className={`relative flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border px-2.5 transition ${
                jumlahPengingat > 0
                  ? 'border-danger bg-danger text-white hover:bg-danger/90'
                  : 'border-border-soft text-ink-muted hover:border-accent/50 hover:text-ink'
              }`}
              title={jumlahPengingat > 0 ? `${jumlahPengingat} pengingat aktif` : 'Belum ada pengingat'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {jumlahPengingat > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold leading-none ${
                  jumlahJatuhTempo > 0 ? 'bg-white text-danger' : 'bg-white/25 text-white'
                }`}>
                  {jumlahPengingat}
                </span>
              )}
            </summary>

            {/* Dropdown daftar pengingat.
                MOBILE (permintaan pemilik 2026-10-04: "notif admin panel mobile
                terlalu besar"): lebar dikunci ke lebar layar minus margin, bukan
                w-80 (320px) yang terasa kegedean di HP. Teks & tombol ikut
                diperkecil. Desktop tetap w-80 normal. */}
            <div className="invisible absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-border-soft bg-card-cream/95 p-2 opacity-0 shadow-[0_16px_40px_rgba(43,33,24,0.16)] backdrop-blur-xl transition-all duration-150 group-focus-within:visible group-hover:visible group-hover:opacity-100 group-focus-within:opacity-100 sm:w-80">
              <p className="px-2 py-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">
                Pengingat {jumlahPengingat > 0 ? `(${jumlahPengingat})` : ''}
              </p>
              {jumlahPengingat === 0 ? (
                <p className="px-2 pb-2 text-[0.7rem] leading-relaxed text-ink-muted sm:text-xs">
                  Belum ada. Tulis di tab Analisis AI mode Diskusi, mis. "ingetin gw pas Idul Fitri mau promo".
                </p>
              ) : (
                <ul className="max-h-72 space-y-1.5 overflow-y-auto sm:max-h-80">
                  {pengingatAktif.map((p) => (
                    <li
                      key={p.id}
                      className={`rounded-xl border px-2.5 py-1.5 sm:px-3 sm:py-2 ${
                        p.jatuhTempo ? 'border-danger/40 bg-danger/8' : 'border-border-soft bg-bg-soft/40'
                      }`}
                    >
                      <p className="text-[0.7rem] font-semibold leading-snug text-ink sm:text-xs">{p.teks}</p>
                      <p className={`mt-0.5 text-[0.6rem] sm:text-[0.65rem] ${p.jatuhTempo ? 'font-bold text-danger' : 'text-ink-muted'}`}>
                        {p.jatuhTempo ? 'SEKARANG - ' : ''}{p.waktuTeks}
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => tandaiPengingat(p.id, true)}
                          className="rounded-md border border-success/40 px-2 py-0.5 text-[0.6rem] font-bold text-success transition hover:bg-success/10 cursor-pointer sm:text-[0.65rem]"
                        >
                          Selesai
                        </button>
                        <button
                          type="button"
                          onClick={() => hapusPengingat(p.id)}
                          className="rounded-md border border-border-soft px-2 py-0.5 text-[0.6rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer sm:text-[0.65rem]"
                        >
                          Hapus
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          {/* Profil admin: avatar + username, klik -> dropdown berisi Keluar.
              Pola <details> sama dengan menu "Info" di Navbar user. */}
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-bg-soft">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" width={30} height={30} className="h-[30px] w-[30px] shrink-0 rounded-full border border-border-soft object-cover" />
              ) : (
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-hover">
                  {(username || '?').slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[120px] truncate text-sm font-semibold text-ink sm:inline">{username}</span>
              <svg className="h-3.5 w-3.5 shrink-0 text-ink-muted transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
            </summary>
            <div className="invisible absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-border-soft bg-card-cream/95 p-1.5 opacity-0 shadow-[0_16px_40px_rgba(43,33,24,0.16)] backdrop-blur-xl transition-all duration-150 group-focus-within:visible group-hover:visible group-hover:opacity-100 group-focus-within:opacity-100">
              <div className="flex items-center gap-2.5 border-b border-border-soft px-3 py-2.5">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full border border-border-soft object-cover" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-hover">
                    {(username || '?').slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[0.6rem] uppercase tracking-widest text-ink-muted">Masuk sebagai</p>
                  <p className="truncate text-sm font-bold text-ink">{username}</p>
                </div>
              </div>
              <Link href="/" className="mt-1 block rounded-xl px-3 py-2 text-sm text-ink-muted transition hover:bg-bg-soft hover:text-ink cursor-pointer">
                Lihat Situs
              </Link>
              {/* Logout: pakai <a> (bukan Link) karena ini route API yang
                  mengalihkan keluar, bukan halaman internal Next. */}
              <a
                href="/api/auth/logout"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10 cursor-pointer"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Keluar Panel
              </a>
            </div>
          </details>
        </div>
      </nav>
    </header>

    {/* Latar dekoratif grid di atas halaman - SAMA seperti halaman lain
        (komunitas/leaderboard). Inilah yang membuat navbar transparan
        terlihat elegan DAN tetap terbaca: teks navbar duduk di atas pola
        halus, bukan di atas konten yang ramai. */}
    <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-grid" aria-hidden="true" />

    <div className="relative mx-auto flex max-w-7xl items-start gap-6 px-4 pb-20 pt-24 md:px-5 md:pt-24">
      {/* Sidebar */}
      {/*
        Sidebar desktop: MENEMPEL saat digulir.
        Kenapa sebelumnya gagal nempel: flex item default `align-self: stretch`,
        sehingga <aside> ditinggikan mengikuti tinggi baris flex. Akibatnya
        tidak ada ruang gerak untuk sticky - nilainya jadi sekadar sepanjang
        dirinya sendiri, dan saat digulir ia ikut naik bersama halaman.
        Perbaikannya: `items-start` pada induk (atau md:self-start) membuat
        aside setinggi ISINYA saja, sehingga sticky punya ruang untuk bekerja.
        `md:max-h-[calc(100dvh-3rem)]` + overflow-y-auto: kalau menunya lebih
        panjang dari layar, isi sidebar bisa digulir sendiri, bukan terpotong.
        dvh (bukan vh) supaya akurat di browser mobile yang punya bilah alamat.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-[70] flex w-64 transform flex-col border-r border-border-soft bg-bg-soft transition-transform md:sticky md:top-20 md:z-auto md:max-h-[calc(100dvh-5.5rem)] md:w-56 md:translate-x-0 md:self-start md:rounded-2xl md:border md:bg-card-cream/60 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header sidebar hanya di mobile (bar atas fixed sudah menampilkan
            identitas). Di mobile sidebar perlu header agar user tahu ini menu
            siapa & ada tombol tutup. Di desktop header ini disembunyikan karena
            informasi yang sama sudah ada di bar atas. */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-soft px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full border border-border-soft" />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-hover">
                {(username || '?').slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{username}</span>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-bg hover:text-ink cursor-pointer"
            aria-label="Tutup menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <nav aria-label="Menu admin" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {TAB_GROUPS.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="mb-1 px-2 text-[0.6rem] font-bold uppercase tracking-widest text-ink-muted/60">{g.label}</p>
              <ul className="space-y-0.5">
                {g.tabs.map(([id, label]) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => gantiTab(id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border-l-[3px] py-2 pl-2.5 pr-2.5 text-left text-sm transition-colors cursor-pointer ${
                        // Indikator aktif SINGKAR dan tegas: batang kiri accent +
                        // latar accent pekat + teks tebal. Hanya SATU tab yang
                        // memenuhi kondisi ini (tab === id), jadi tidak mungkin
                        // ada dua yang tersorot (permintaan pemilik 2026-10-04:
                        // "hilight di side bar jangan sampe ada double").
                        tab === id
                          ? 'border-accent bg-accent/90 font-bold text-white shadow-sm'
                          : 'border-transparent font-medium text-ink-muted hover:border-border-soft hover:bg-bg-soft hover:text-ink'
                      }`}
                      aria-current={tab === id ? 'page' : undefined}
                    >
                      <span className="truncate">{label}</span>
                      {Number(badges[id]) > 0 && (
                        // Badge harus kontras di tab aktif (latar accent pekat +
                        // teks putih) maupun non-aktif. Di tab aktif pakai
                        // translucent putih supaya tetap terbaca.
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold leading-none ${
                          tab === id
                            ? 'bg-white/90 text-accent'
                            : id === 'log' ? 'bg-accent text-ink' : id === 'feedback' ? 'bg-danger/15 text-danger' : 'bg-bg text-ink-muted'
                        }`}>{badges[id] > 99 ? '99+' : badges[id]}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-border-soft px-3 py-3">
          <a href="/api/auth/logout" className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-danger/10 hover:text-danger cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Keluar Panel
          </a>
        </div>
      </aside>

      {/* AutoRefresh: menyegarkan server-component /admin berkala + saat tab
          kembali terlihat. Komentar lama di bawah MENGAKU ini sudah ada, padahal
          TIDAK pernah dirender -> diperbaiki 2026-10-03 (permintaan pemilik:
          "data harus langsung berubah"). */}
      <AutoRefresh intervalMs={5000} />

      {/* Konten */}
      <div className="min-w-0 flex-1">
        {/* Bar identitas mobile DIPINDAH ke <header> fixed di atas (lihat
            penanda "Bar atas admin"), supaya berlaku di semua ukuran dan
            tidak lagi menempel hanya di dalam kolom konten. */}
        {/* Indikator "Live · diperbarui" DIHAPUS (permintaan pemilik
            2026-10-01). Penyegaran ditangani <AutoRefresh /> di atas (5 dtk)
            + poll /api/admin/data tiap 5 dtk di efek AdminShell. */}

        {/* ref + id + scroll-mt: dipakai untuk melompat ke atas setiap kali
            tab diganti, supaya halaman yang dituju LANGSUNG terlihat.
            Sebelumnya mengganti tab hanya menukar isi tanpa mengubah posisi
            gulir - kalau admin sedang di bawah (mis. daftar panjang di
            Dashboard), panel tab baru terbuka di tengah dan terlihat kosong
            karena isinya ada di atas. */}
        {/* pb-10: jarak ke footer. Sebelumnya area ini TIDAK punya padding
            bawah, sehingga kartu terakhir menempel langsung ke footer -
            terlihat sesak di HP. */}
        {/* scroll-mt dinaikkan ke 5rem: bar atas kini fixed (~56px), jadi
            tanpa ini lompatan antar-tab akan berhenti dengan judul tertutup
            bar. pb-10 tetap untuk jarak ke footer. */}
        <div ref={kontenRef} id="konten-admin" className="scroll-mt-20 pb-10">
        {tab === 'shop' ? (
          // Shop Manager MANDIRI (2026-10-03): mengambil datanya sendiri dari
          // /api/admin/shop, jadi TIDAK perlu menunggu `data` panel. Dirender
          // LANGSUNG tanpa skeleton "Memuat panel" (permintaan pemilik).
          // `send` dioper untuk tombol Restock Semua (restock_all harus lewat
          // antrean bot - stok default hanya ada di katalog seed bot).
          <ShopManager send={send} />
        ) : !data ? (
          // Kerangka menyesuaikan TAB yang sedang dimuat.
          //
          // Sebelumnya SELALU AdminSkeletonBody - itu bentuk Dashboard (8 kartu
          // metrik + grafik + 2 panel). Untuk tab Analisis AI bentuk itu tidak
          // nyambung dan terlihat seperti memuat halaman lain.
          //
          // Tab Analisis AI tidak butuh `data` (komponennya mengambil statusnya
          // sendiri), jadi skeleton ini murni kerangka tampilan.
          <div aria-busy="true" aria-label="Memuat panel">
            {tab === 'ai' ? <AdminAiSkeletonBody /> : <AdminSkeletonBody />}
          </div>
        ) : (
          <>
            {tab === 'ai' && <AnalisisAI />}
            {tab === 'dashboard' && <Dashboard data={data} />}
            {tab === 'ekonomi' && <Ekonomi send={send} data={data} />}
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
    </div>
    </>
  );
}
