'use client';

import { useCallback, useEffect, useState } from 'react';

// ==========================================
// PushToggle — nyalakan/matikan notifikasi perangkat (Web Push)
// ==========================================
// Notif ini muncul di HP/laptop walau web sedang TIDAK dibuka (via push
// service). Default MATI - user menyalakan sendiri. Kalau browser tidak
// mendukung / izin ditolak, ditampilkan pesan yang jelas.
function b64ToU8(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushToggle() {
  const [status, setStatus] = useState('memuat'); // memuat | tak_didukung | mati | nyala | izin_ditolak
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState(null);
  const [vapid, setVapid] = useState(null);
  const [perangkat, setPerangkat] = useState(0);

  const dukung = typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  const muat = useCallback(async () => {
    if (!dukung) { setStatus('tak_didukung'); return; }
    try {
      const res = await fetch('/api/me/push', { cache: 'no-store' });
      if (res.status === 401) { setStatus('tamu'); return; }
      const d = await res.json().catch(() => ({}));
      if (!d.tersedia) { setStatus('tak_didukung'); setPesan('Notifikasi belum diaktifkan di server.'); return; }
      setVapid(d.vapid || null);
      setPerangkat(d.perangkat || 0);
      if (Notification.permission === 'denied') { setStatus('izin_ditolak'); return; }
      setStatus(d.aktif ? 'nyala' : 'mati');
    } catch {
      setStatus('mati');
    }
  }, [dukung]);

  useEffect(() => { muat(); }, [muat]);

  const nyalakan = useCallback(async () => {
    setSibuk(true); setPesan(null);
    try {
      if (!dukung) { setPesan('Browser ini tidak mendukung notifikasi.'); return; }
      const izin = await Notification.requestPermission();
      if (izin !== 'granted') { setStatus('izin_ditolak'); setPesan('Izin notifikasi ditolak. Aktifkan di pengaturan browser.'); return; }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToU8(vapid),
        });
      }
      const res = await fetch('/api/me/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi: 'subscribe', subscription: sub.toJSON() }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) { setStatus('nyala'); setPerangkat(d.perangkat || 1); setPesan('Notifikasi aktif di perangkat ini.'); }
      else setPesan(d.error || 'Gagal mengaktifkan notifikasi.');
    } catch (e) {
      setPesan(String(e?.message || e));
    } finally {
      setSibuk(false);
    }
  }, [dukung, vapid]);

  const matikan = useCallback(async () => {
    setSibuk(true); setPesan(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub ? sub.endpoint : null;
      if (sub) await sub.unsubscribe().catch(() => {});
      await fetch('/api/me/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi: 'matikan', endpoint }),
      });
      setStatus('mati'); setPerangkat(0); setPesan('Notifikasi dimatikan.');
    } catch (e) {
      setPesan(String(e?.message || e));
    } finally {
      setSibuk(false);
    }
  }, []);

  if (status === 'tamu') return null; // tidak login -> jangan tampilkan

  const nyala = status === 'nyala';

  return (
    <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base text-ink">Notifikasi Perangkat</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            {status === 'tak_didukung'
              ? 'Browser ini tidak mendukung notifikasi push.'
              : 'Dapatkan pemberitahuan di HP/laptop walau web sedang tidak dibuka (item masuk, NEXO Pass aktif, pengumuman admin).'}
          </p>
        </div>
        {status !== 'tak_didukung' && (
          <button
            type="button"
            disabled={sibuk}
            onClick={nyala ? matikan : nyalakan}
            className={`shrink-0 ${nyala ? 'btn-solid btn-solid-neutral' : 'btn-solid btn-solid-accent'}`}
          >
            {sibuk ? '…' : nyala ? 'Matikan' : 'Nyalakan'}
          </button>
        )}
      </div>

      {status === 'izin_ditolak' && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          Izin notifikasi diblokir di browser ini. Nyalakan dulu izin Notifikasi untuk situs ini di pengaturan browser (ikon gembok di address bar), lalu coba lagi.
        </p>
      )}
      {pesan && status !== 'izin_ditolak' && (
        <p className="mt-3 text-xs text-ink-muted">{pesan}</p>
      )}
      {nyala && (
        <p className="mt-2 text-[0.7rem] font-semibold text-success">
          ● Aktif{perangkat > 0 ? ` · ${perangkat} perangkat` : ''}
        </p>
      )}
    </div>
  );
}
