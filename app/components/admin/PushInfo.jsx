'use client';

import { useEffect, useState } from 'react';

// Info kecil di panel admin: berapa perangkat menyalakan notifikasi.
// Bukan kontrol - user yang nyalakan sendiri lewat toggle di lonceng.
export default function PushInfo() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/push/info', { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (hidup && d.ok) setInfo(d);
      } catch { /* diamkan */ }
    })();
    return () => { hidup = false; };
  }, []);

  if (!info) return null;

  return (
    <div className="rounded-xl border border-border-soft bg-card-cream/60 px-3 py-2">
      <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-ink-muted">Notifikasi</p>
      <p className="mt-0.5 text-lg font-bold text-ink">{info.perangkat}</p>
      <p className="text-[0.62rem] text-ink-muted">perangkat menyalakan notifikasi</p>
    </div>
  );
}
