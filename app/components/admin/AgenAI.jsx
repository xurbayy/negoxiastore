'use client';

import { useCallback, useEffect, useState } from 'react';

// ==========================================
// AgenAI - agen pemantau otomatis (komponen modular)
// ==========================================
//
// Permintaan pemilik 2026-10-02: agen memantau data, tiap hari kasih laporan +
// usulan aksi. Pemilik menyetujui/menolak. Aksi dijalankan hanya setelah
// disetujui (keputusan penuh di tangan pemilik).
//
// Komponen ini HANYA menampilkan. Logika ada di app/lib/aiAgen.js (server).

const WARNA_TINGKAT = {
  rendah: 'bg-success/15 text-success',
  sedang: 'bg-warning/15 text-warning',
  tinggi: 'bg-danger/15 text-danger',
  kritis: 'bg-danger/25 text-danger',
};

export default function AgenAI({ jalan, detikSisa }) {
  const [laporan, setLaporan] = useState([]);
  const [usulan, setUsulan] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [jalanAgen, setJalanAgen] = useState(false);
  const [pesan, setPesan] = useState(null);
  const [bukaRiwayat, setBukaRiwayat] = useState(false);

  const flash = (t) => { setPesan(t); setTimeout(() => setPesan(null), 5000); };

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const res = await fetch('/api/admin/ai/agen', { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) { setLaporan(d.laporan || []); setUsulan(d.usulan || []); }
      else flash('Gagal memuat: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flash('Gagal memuat: ' + e.message); }
    finally { setMemuat(false); }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  // Jalankan agen sekarang (analisis 1x). Hasil muncul sebagai laporan + usulan.
  const jalankanAgen = useCallback(async () => {
    setJalanAgen(true);
    try {
      const res = await fetch('/api/admin/ai/agen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const d = await res.json();
      if (d.ok) { flash(`Agen selesai. ${d.usulanTersimpan} usulan dibuat.`); await muat(); }
      else flash('Gagal: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flash('Gagal: ' + e.message); }
    finally { setJalanAgen(false); }
  }, [muat]);

  // Putuskan usulan: setuju (kirim ke bot) / tolak.
  const putuskan = useCallback(async (id, putusan) => {
    try {
      const res = await fetch('/api/admin/ai/agen/usulan?id=' + id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ putusan }),
      });
      const d = await res.json();
      if (d.ok) { flash(putusan === 'setuju' ? 'Disetujui - aksi dikirim ke bot.' : 'Ditolak.'); await muat(); }
      else flash('Gagal: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flash('Gagal: ' + e.message); }
  }, [muat]);

  const menunggu = usulan.filter((u) => u.status === 'menunggu');
  const laporanTerbaru = laporan[0];
  const riwayatLain = laporan.slice(1);
  const usulanLama = usulan.filter((u) => u.status !== 'menunggu');

  return (
    <div className="space-y-3">
      {/* Kepala + tombol jalankan */}
      <div className="nx-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-ink">Agen AI</h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              Memantau data &amp; mengusulkan aksi tiap hari jam 12.00 WIB. Aksi hanya jalan setelah kamu setujui.
            </p>
          </div>
          <button
            type="button"
            onClick={jalankanAgen}
            disabled={jalanAgen || jalan || detikSisa > 0}
            className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jalanAgen ? 'Menganalisis...' : 'Jalankan agen sekarang'}
          </button>
        </div>
        {pesan && <p className="mt-2 text-xs font-semibold text-accent">{pesan}</p>}
      </div>

      {/* USULAN MENUNGGU PERSETUJUAN - paling penting, tampil di atas */}
      {menunggu.length > 0 && (
        <div className="nx-card border-accent/40 px-4 py-4 sm:px-5">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
            Usulan menunggu keputusanmu ({menunggu.length})
          </p>
          <ul className="mt-3 space-y-3">
            {menunggu.map((u) => (
              <li key={u.id} className="rounded-xl border border-border-soft bg-bg-soft/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{u.judul}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${WARNA_TINGKAT[u.tingkat] || WARNA_TINGKAT.sedang}`}>
                    risiko {u.tingkat}
                  </span>
                  <span className="rounded bg-card-cream px-2 py-0.5 font-mono text-[0.6rem] text-ink-faint">{u.aksi}</span>
                </div>
                {u.alasan && <p className="mt-1.5 text-xs text-ink-muted"><strong className="text-ink">Alasan:</strong> {u.alasan}</p>}
                {u.risiko && <p className="mt-1 text-xs text-danger"><strong>Risiko:</strong> {u.risiko}</p>}
                {u.payload && (
                  <p className="mt-1 break-all font-mono text-[0.65rem] text-ink-faint">{JSON.stringify(u.payload)}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => putuskan(u.id, 'setuju')}
                    className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-bold text-success transition hover:bg-success/20 cursor-pointer"
                  >
                    Setujui &amp; jalankan
                  </button>
                  <button
                    type="button"
                    onClick={() => putuskan(u.id, 'tolak')}
                    className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                  >
                    Tolak
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* LAPORAN TERBARU */}
      {memuat ? (
        <div className="nx-card px-4 py-6 text-center text-sm text-ink-muted">
          <span className="pulse-dot" aria-hidden="true" /> Memuat laporan agen...
        </div>
      ) : !laporanTerbaru ? (
        <div className="nx-card px-4 py-6 text-center text-sm text-ink-muted">
          Belum ada laporan. Klik "Jalankan agen sekarang" (laporan otomatis juga dibuat tiap jam 12.00 WIB).
        </div>
      ) : (
        <div className="nx-card px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Laporan terbaru</p>
            <span className="text-[0.65rem] text-ink-faint">
              {laporanTerbaru.tanggal} • {laporanTerbaru.provider || '-'} • {laporanTerbaru.model || '-'}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{laporanTerbaru.ringkasan}</p>
          {laporanTerbaru.temuan && (
            <div className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{laporanTerbaru.temuan}</div>
          )}
        </div>
      )}

      {/* RIWAYAT (laporan lama + usulan yang sudah diputuskan) */}
      {(riwayatLain.length > 0 || usulanLama.length > 0) && (
        <div className="nx-card px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setBukaRiwayat((v) => !v)}
            className="text-xs font-bold text-ink-muted transition hover:text-ink cursor-pointer"
          >
            {bukaRiwayat ? 'Sembunyikan riwayat' : `Riwayat (${riwayatLain.length} laporan, ${usulanLama.length} usulan diputuskan)`}
          </button>
          {bukaRiwayat && (
            <div className="mt-3 space-y-2">
              {usulanLama.map((u) => (
                <div key={'u' + u.id} className="rounded-lg border border-border-soft bg-bg-soft/30 px-3 py-2">
                  <p className="text-xs text-ink">
                    <span className={u.status === 'disetujui' ? 'text-success' : 'text-ink-faint'}>
                      {u.status === 'disetujui' ? 'Disetujui' : 'Ditolak'}
                    </span>
                    {' - '}{u.judul} <span className="font-mono text-[0.6rem] text-ink-faint">({u.aksi})</span>
                  </p>
                  {u.hasil && <p className="text-[0.65rem] text-ink-faint">{u.hasil}</p>}
                </div>
              ))}
              {riwayatLain.map((l) => (
                <div key={'l' + l.id} className="rounded-lg border border-border-soft bg-bg-soft/30 px-3 py-2">
                  <p className="text-[0.65rem] text-ink-faint">{l.tanggal}</p>
                  <p className="whitespace-pre-wrap text-xs text-ink-muted">{l.ringkasan}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
