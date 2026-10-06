'use client';

import { useCallback, useEffect, useState } from 'react';

// ==========================================
// PanelNotif — notif pintar PANEL ADMIN (bell + toggle perangkat)
// ==========================================
// Permintaan pemilik 2026-10-06:
//   "di panel admin ada notif, kasih toggle juga biar bisa dinyalain di
//    perangkat seperti notif user. Notif pembelian NEXO Pass masuk juga,
//    dan kalau CPU/VPS >= 80% ada info - panel admin notifnya pinter."
//
// Isi notif: pembelian NEXO Pass, alert VPS (CPU/RAM/disk), laporan agen.
// Sumber: /api/admin/notif. Toggle perangkat: /api/admin/push/toggle.
const IKON = { premium: '💎', vps: '⚠️', agen: '🤖', order: '🧾', info: '🔔' };

function waktu(ms) {
  try {
    const d = new Date(Number(ms));
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function PanelNotif() {
  const [notif, setNotif] = useState([]);
  const [belum, setBelum] = useState(0);
  const [pushAktif, setPushAktif] = useState(false);
  const [pushSibuk, setPushSibuk] = useState(false);
  const [tersedia, setTersedia] = useState(true);

  const muat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notif?n=40', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) { setNotif(d.notif || []); setBelum(d.belum || 0); }
    } catch { /* diamkan */ }
  }, []);

  const muatPush = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const ep = sub?.endpoint || '';
      const res = await fetch('/api/admin/push/toggle?endpoint=' + encodeURIComponent(ep), { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) { setPushAktif(Boolean(d.aktif)); setTersedia(d.tersedia !== false); }
    } catch { /* diamkan */ }
  }, []);

  useEffect(() => {
    muat();
    muatPush();
    const iv = setInterval(() => { if (!document.hidden) muat(); }, 20000);
    const onVis = () => { if (!document.hidden) muat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [muat, muatPush]);

  function b64ToU8(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  const togglePush = useCallback(async () => {
    if (pushSibuk) return;
    // VALIDASI (pola Notifikasi user): izin diblokir browser -> jangan diam-diam gagal.
    if (!pushAktif && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      alert('Izin notifikasi diblokir browser. Nyalakan dulu izin Notifikasi untuk situs ini di pengaturan browser (ikon gembok di address bar), lalu coba lagi.');
      return;
    }
    setPushSibuk(true);
    try {
      if (pushAktif) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        const endpoint = sub?.endpoint || '';
        if (sub) await sub.unsubscribe().catch(() => {});
        await fetch('/api/admin/push/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aksi: 'matikan', endpoint }) });
        setPushAktif(false);
      } else {
        if (Notification.permission !== 'granted') {
          const izin = await Notification.requestPermission();
          if (izin !== 'granted') { setPushAktif(false); return; }
        }
        const st = await fetch('/api/admin/push/toggle', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
        const vapid = st?.vapid;
        if (!vapid) { alert('Push belum aktif di server (VAPID belum diset).'); return; }
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(vapid) });
        const res = await fetch('/api/admin/push/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aksi: 'aktifkan', subscription: sub.toJSON() }) });
        const d = await res.json().catch(() => ({}));
        if (d.ok) setPushAktif(true);
      }
    } catch { /* diamkan */ } finally { setPushSibuk(false); }
  }, [pushAktif, pushSibuk]);

  async function baca(id) {
    setNotif((a) => a.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setBelum((n) => Math.max(0, n - 1));
    await fetch('/api/admin/notif?id=' + id, { method: 'PATCH' }).catch(() => {});
  }
  async function bacaSemua() {
    setNotif((a) => a.map((x) => ({ ...x, read: true })));
    setBelum(0);
    await fetch('/api/admin/notif?all=1', { method: 'PATCH' }).catch(() => {});
  }

  return (
    <details className="group relative">
      <summary
        className={`relative flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border px-2.5 transition ${
          belum > 0 ? 'border-accent bg-accent text-white hover:bg-accent/90' : 'border-border-soft text-ink-muted hover:border-accent/50 hover:text-ink'
        }`}
        title={belum > 0 ? `${belum} notifikasi baru` : 'Tidak ada notifikasi baru'}
        onClick={() => { if (belum > 0) setTimeout(bacaSemua, 400); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {belum > 0 && (
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[0.62rem] font-bold leading-none text-accent">{belum > 99 ? '99+' : belum}</span>
        )}
      </summary>

      <div className="invisible absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-border-soft bg-card-cream/95 p-2 opacity-0 shadow-[0_16px_40px_rgba(43,33,24,0.16)] backdrop-blur-xl transition-all duration-150 group-focus-within:visible group-hover:visible group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-muted">Notifikasi Panel</p>
          {notif.length > 0 && (
            <button type="button" onClick={bacaSemua} className="text-[0.65rem] font-semibold text-accent-hover hover:underline cursor-pointer">
              Tandai dibaca
            </button>
          )}
        </div>

        {/* TOGGLE notif perangkat (pola user) */}
        <div className="mx-1 mb-1.5 flex items-center justify-between rounded-xl border border-border-soft bg-bg-soft/50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold text-ink">Notif Perangkat</p>
            <p className="text-[0.6rem] text-ink-muted">{!tersedia ? 'Push belum aktif di server' : pushAktif ? 'Aktif di perangkat ini' : 'Nonaktif di perangkat ini'}</p>
          </div>
          <button
            type="button"
            onClick={togglePush}
            disabled={pushSibuk || !tersedia}
            aria-label={pushAktif ? 'Matikan notif perangkat' : 'Nyalakan notif perangkat'}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${pushAktif ? 'bg-accent' : 'bg-border-soft'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${pushAktif ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {notif.length === 0 ? (
          <p className="px-2 pb-2 text-[0.7rem] leading-relaxed text-ink-muted sm:text-xs">
            Belum ada notifikasi. Pembelian NEXO Pass, alert VPS tinggi, dan laporan agen akan muncul di sini.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {notif.map((n) => (
              <li key={n.id} className={`rounded-xl border px-2.5 py-2 ${n.read ? 'border-border-soft bg-bg-soft/30' : 'border-accent/40 bg-accent/8'}`}>
                <p className="text-[0.72rem] font-semibold leading-snug text-ink sm:text-xs">
                  <span className="mr-1" aria-hidden="true">{IKON[n.tipe] || '🔔'}</span>{n.judul}
                </p>
                {n.isi && <p className="mt-0.5 text-[0.65rem] leading-snug text-ink-muted">{n.isi}</p>}
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[0.58rem] text-ink-faint">{waktu(n.createdAt)}</span>
                  {!n.read && (
                    <button type="button" onClick={() => baca(n.id)} className="text-[0.62rem] font-semibold text-accent-hover hover:underline cursor-pointer">Tandai dibaca</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
