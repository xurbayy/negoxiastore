'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

export default function AgenAI({ jalan, detikSisa, provider, model, onSelesai }) {
  const [laporan, setLaporan] = useState([]);
  const [usulan, setUsulan] = useState([]);
  const [pengingat, setPengingat] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [jalanAgen, setJalanAgen] = useState(false);
  const [pesan, setPesan] = useState(null);
  const [bukaRiwayat, setBukaRiwayat] = useState(false);
  // Provider TERPISAH untuk agen (bukan milik Analisis/Diskusi).
  const [agentProvider, setAgentProvider] = useState('');
  const [agentModel, setAgentModel] = useState('');
  const [daftarProv, setDaftarProv] = useState([]);
  // Kombinasi provider+model tersimpan (bisa dipilih cepat / dihapus).
  const [daftarKombinasi, setDaftarKombinasi] = useState(() => {
    try { return JSON.parse(window.localStorage.getItem('nexo_agen_kombinasi') || '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('nexo_agen_kombinasi', JSON.stringify(daftarKombinasi)); } catch { /* abaikan */ }
  }, [daftarKombinasi]);
  const hapusKombinasi = useCallback((id) => {
    setDaftarKombinasi((arr) => arr.filter((k) => k.id !== id));
  }, []);
  // Auto-run: agen jalan otomatis tiap 6 jam saat toggle AKTIF.
  const [autoJalan, setAutoJalan] = useState(() => {
    try { return window.localStorage.getItem('nexo_agen_auto') === '1'; } catch { return false; }
  });
  const [terakhirJalan, setTerakhirJalan] = useState(null);

  const flash = (t) => { setPesan(t); setTimeout(() => setPesan(null), 5000); };

  // Simpan toggle auto-run ke localStorage.
  useEffect(() => {
    try { window.localStorage.setItem('nexo_agen_auto', autoJalan ? '1' : '0'); } catch { /* abaikan */ }
  }, [autoJalan]);

  // Load daftar provider + auto-fill dari provider/model Analisis/Diskusi.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/ai', { cache: 'no-store' });
        const d = await res.json();
        if (d.ok && Array.isArray(d.providers)) {
          const daftar = d.providers
            .filter((p) => p.kunci > 0)
            .map((p) => ({ id: p.id, nama: p.label || p.id }));
          setDaftarProv(daftar);
        }
      } catch { /* abaikan */ }
      // Muat dari SERVER dulu (persist lintas device), fallback localStorage.
      let dapat = false;
      try {
        const res2 = await fetch('/api/admin/ai/prefs', { cache: 'no-store' });
        const d2 = await res2.json();
        if (d2.ok && d2.prefs) {
          if (d2.prefs.agentProvider) { setAgentProvider(d2.prefs.agentProvider); dapat = true; }
          if (d2.prefs.agentModel) { setAgentModel(d2.prefs.agentModel); dapat = true; }
        }
      } catch { /* fallback */ }
      if (!dapat) {
        try {
          const sp = window.localStorage.getItem('nexo_agen_provider') || '';
          const sm = window.localStorage.getItem('nexo_agen_model') || '';
          if (sp) { setAgentProvider(sp); dapat = true; }
          if (sm) { setAgentModel(sm); dapat = true; }
        } catch { /* abaikan */ }
      }
      // AUTO-FILL: kalau belum ada pilihan agent, pakai provider/model
      // Analisis/Diskusi (dari prefs server) supaya agent langsung bisa jalan.
      if (!dapat) {
        try {
          const res3 = await fetch('/api/admin/ai/prefs', { cache: 'no-store' });
          const d3 = await res3.json();
          if (d3.ok && d3.prefs) {
            if (d3.prefs.provider) setAgentProvider(d3.prefs.provider);
            if (d3.prefs.model) setAgentModel(d3.prefs.model);
          }
        } catch { /* abaikan */ }
      }
    })();
  }, []);

  // Simpan agent provider/model ke server (debounced).
  const prefsRef = useRef(null);
  useEffect(() => {
    clearTimeout(prefsRef.current);
    prefsRef.current = setTimeout(async () => {
      if (!agentProvider && !agentModel) return;
      try {
        await fetch('/api/admin/ai/prefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentProvider, agentModel }),
        });
      } catch { /* offline */ }
    }, 1000);
    return () => clearTimeout(prefsRef.current);
  }, [agentProvider, agentModel]);

  // AUTO-RUN: saat toggle AKTIF, agen jalan otomatis tiap 6 jam (hemat token,
  // bukan terus-menerus). Interval hanya jalan saat tab aktif.
  const jalankanAgenRef = useRef(null);
  useEffect(() => {
    if (!autoJalan) return;
    const iv = setInterval(() => {
      if (document.hidden) return; // skip saat tab tersembunyi
      jalankanAgenRef.current?.();
    }, 6 * 60 * 60 * 1000); // 6 jam
    return () => clearInterval(iv);
  }, [autoJalan]);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const res = await fetch('/api/admin/ai/agen', { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) { setLaporan(d.laporan || []); setUsulan(d.usulan || []); setPengingat(d.pengingat || []); }
      else flash('Gagal memuat: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flash('Gagal memuat: ' + e.message); }
    finally { setMemuat(false); }
  }, []);

  // Simpan laporan ke arsip (pindah ke ai_notes supaya bisa diakses dari Arsip Jawaban).
  const simpanKeArsip = useCallback(async (l) => {
    if (!l?.ringkasan) return;
    try {
      const res = await fetch('/api/admin/ai/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judul: `Agen: ${(l.ringkasan || '').slice(0, 60)}`, pertanyaan: `Laporan agen ${l.tanggal || ''}`, jawaban: l.ringkasan + (l.temuan ? '\n\nTemuan:\n' + l.temuan : ''), sumber: 'agen', model: l.model || '' }),
      });
      const d = await res.json();
      flash(d.ok ? 'Tersimpan di Arsip Jawaban.' : 'Gagal simpan: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flash('Gagal simpan: ' + e.message); }
  }, []);

  // Hapus satu laporan agen.
  const hapusLaporan = useCallback(async (id) => {
    try {
      const res = await fetch('/api/admin/ai/agen/laporan?id=' + id, { method: 'DELETE' });
      const d = await res.json();
      if (d.ok) { flash('Laporan dihapus.'); await muat(); }
      else flash('Gagal hapus: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flash('Gagal hapus: ' + e.message); }
  }, [muat]);

  useEffect(() => { muat(); }, [muat]);

  // Jalankan agen sekarang (analisis 1x). Pakai provider & model TERPISAH
  // milik agen (bukan milik Analisis/Diskusi).
  const jalankanAgen = useCallback(async () => {
    // Validasi: wajib ada provider & model agen.
    if (!agentProvider?.trim() || !agentModel?.trim()) {
      flash('Pilih provider & model agen dulu di dropdown bawah.');
      return;
    }
    setJalanAgen(true);
    try {
      const res = await fetch('/api/admin/ai/agen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: agentProvider,
          model: agentModel,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        flash(`Agen selesai. ${d.usulanTersimpan} usulan dibuat.`);
        await muat();
        if (typeof onSelesai === 'function') onSelesai();
      }
      else flash('Gagal: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flash('Gagal: ' + e.message); }
    finally { setJalanAgen(false); }
  }, [muat, agentProvider, agentModel, onSelesai]);

  // Simpan referensi jalankanAgen untuk dipanggil dari interval auto-run.
  useEffect(() => { jalankanAgenRef.current = jalankanAgen; }, [jalankanAgen]);
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
      {/* Kepala + tombol aksi - mobile friendly */}
      <div className="nx-card px-4 py-4 sm:px-5">
        <h3 className="font-display text-ink">Agen AI</h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          Memantau data &amp; kode bot, mengusulkan aksi + saran.
        </p>
        {/* Tombol aksi: full width di mobile, side-by-side di desktop. */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => {
              const baru = !autoJalan;
              setAutoJalan(baru);
              flash(baru ? 'Agen AKTIF - jalan otomatis tiap 6 jam.' : 'Agen MATI - hanya manual.');
              if (baru) jalankanAgenRef.current?.();
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold transition cursor-pointer sm:py-2 ${
              autoJalan
                ? 'bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20'
                : 'border border-border-soft text-ink-muted hover:border-accent/60 hover:text-ink'
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${autoJalan ? 'bg-danger' : 'bg-ink-faint'}`} />
            {autoJalan ? 'Matikan' : 'Aktifkan'}
          </button>
          <button
            type="button"
            onClick={jalankanAgen}
            disabled={jalanAgen}
            className="btn-primary flex items-center justify-center gap-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jalanAgen ? (
              <>
                <span className="pulse-dot" aria-hidden="true" />
                Menganalisis...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                Analisis sekarang
              </>
            )}
          </button>
        </div>
        {pesan && <p className="mt-2 text-xs font-semibold text-accent">{pesan}</p>}
      </div>

      {/* Provider & model AGEN - SELALU TAMPIL (tidak ikut panel sembunyi). */}
      <div className="nx-card border-accent/20 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-accent">
            Provider & Model Agen
          </p>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.6rem] font-bold text-accent">
            Dedicated
          </span>
        </div>
        <div className="mt-2 space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0">
          <select
            value={agentProvider}
            onChange={(e) => {
              setAgentProvider(e.target.value);
              setAgentModel('');
            }}
            className="w-full rounded-lg border border-border-soft bg-card-cream px-3 py-2 text-sm text-ink focus:border-accent/50 focus:outline-none"
          >
            <option value="">Pilih provider...</option>
            {daftarProv.map((p) => (
              <option key={p.id} value={p.id}>{p.nama}</option>
            ))}
          </select>
          <input
            value={agentModel}
            onChange={(e) => setAgentModel(e.target.value)}
            placeholder="Nama model (mis. llama-3.3-70b-versatile)"
            className="w-full rounded-lg border border-border-soft bg-card-cream px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent/50 focus:outline-none"
          />
        </div>
        {/* Kombinasi tersimpan - pilih cepat, bisa dihapus. */}
        {daftarKombinasi.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {daftarKombinasi.map((k) => (
              <span key={k.id} className="flex items-center gap-1 rounded-full border border-border-soft bg-bg-soft/50 px-2.5 py-1">
                <button
                  type="button"
                  onClick={() => { setAgentProvider(k.provider); setAgentModel(k.model); }}
                  className="text-[0.7rem] font-semibold text-ink hover:text-accent cursor-pointer"
                  title={`${k.provider} / ${k.model}`}
                >
                  {k.provider}/{k.model}
                </button>
                <button
                  type="button"
                  onClick={() => hapusKombinasi(k.id)}
                  title="Hapus kombinasi ini"
                  className="text-ink-faint transition hover:text-danger cursor-pointer"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (!agentProvider || !agentModel) { flash('Pilih provider & model dulu.'); return; }
              const baru = { id: Date.now(), provider: agentProvider, model: agentModel };
              const daftar = daftarKombinasi.filter((k) => !(k.provider === agentProvider && k.model === agentModel));
              setDaftarKombinasi([...daftar, baru]);
              flash('Kombinasi tersimpan.');
            }}
            className="rounded-lg border border-accent/40 px-2.5 py-1 text-[0.7rem] font-bold text-accent transition hover:bg-accent/10 cursor-pointer"
          >
            + Simpan kombinasi
          </button>
          <button
            type="button"
            onClick={() => { setAgentProvider(''); setAgentModel(''); }}
            className="rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
          >
            Kosongkan
          </button>
        </div>
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
                  {u.aksi === 'buat_pengingat' && (
                    <span className="rounded bg-accent/15 px-2 py-0.5 text-[0.6rem] font-bold text-accent">PENGINGAT</span>
                  )}
                </div>
                {/* Pengingat: tampilkan teks + tanggal dengan jelas. */}
                {u.aksi === 'buat_pengingat' && u.payload ? (
                  <div className="mt-1.5 rounded-lg bg-bg-soft/50 px-2.5 py-2">
                    <p className="text-xs text-ink">{u.payload.teks || '-'}</p>
                    <p className="mt-0.5 text-[0.7rem] text-ink-muted">
                      Diingatkan: {u.payload.tanggal || '-'}{u.payload.jam ? ` pukul ${u.payload.jam} WIB` : ''}
                    </p>
                  </div>
                ) : (
                  <>
                    {u.alasan && <p className="mt-1.5 text-xs text-ink-muted"><strong className="text-ink">Alasan:</strong> {u.alasan}</p>}
                    {u.risiko && <p className="mt-1 text-xs text-danger"><strong>Risiko:</strong> {u.risiko}</p>}
                    {u.payload && (
                      <p className="mt-1 break-all font-mono text-[0.65rem] text-ink-faint">{JSON.stringify(u.payload)}</p>
                    )}
                  </>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => putuskan(u.id, 'setuju')}
                    className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-bold text-success transition hover:bg-success/20 cursor-pointer"
                  >
                    {u.aksi === 'buat_pengingat' ? 'Setujui - pasang pengingat' : 'Setujui & jalankan'}
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

      {/* PENGINGAT AKTIF (dibuat dari usulan agen yang disetujui). */}
      {pengingat.length > 0 && (
        <div className="nx-card px-4 py-4 sm:px-5">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
            Pengingat aktif ({pengingat.length})
          </p>
          <ul className="mt-2 space-y-1.5">
            {pengingat.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${p.jatuhTempo ? 'border-danger/40 bg-danger/8' : 'border-border-soft bg-bg-soft/40'}`}>
                <span className={`text-[0.65rem] font-bold ${p.jatuhTempo ? 'text-danger' : 'text-ink-faint'}`}>
                  {p.jatuhTempo ? 'SEKARANG' : new Date(p.waktuIngat).toLocaleString('id-ID')}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.teks}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* LAPORAN - semua tampil ke bawah, tidak ketumpuk */}
      {memuat ? (
        <div className="nx-card px-4 py-6 text-center text-sm text-ink-muted">
          <span className="pulse-dot" aria-hidden="true" /> Memuat laporan agen...
        </div>
      ) : laporan.length === 0 ? (
        <div className="nx-card px-4 py-6 text-center text-sm text-ink-muted">
          Belum ada laporan. Klik "Analisis sekarang" (laporan otomatis juga dibuat tiap jam 12.00 WIB).
        </div>
      ) : (
        <div className="space-y-3">
          {laporan.map((l, i) => (
            <div key={l.id} className={`nx-card px-4 py-4 sm:px-5 ${i === 0 ? 'border-accent/30' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">
                  {i === 0 ? 'Laporan terbaru' : `Laporan #${laporan.length - i}`}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => simpanKeArsip(l)}
                    className="rounded border border-border-soft px-2 py-0.5 text-[0.6rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => hapusLaporan(l.id)}
                    className="rounded border border-border-soft px-2 py-0.5 text-[0.6rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              </div>
              <div className="mt-1 text-[0.6rem] text-ink-faint">
                {typeof l.tanggal === 'string' ? l.tanggal : '(tanggal lama)'} • {l.provider || '-'} • {l.model || '-'}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{l.ringkasan}</p>
              {l.temuan && (
                <div className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{l.temuan}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* RIWAYAT USULAN (yang sudah diputuskan) */}
      {usulanLama.length > 0 && (
        <div className="nx-card px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setBukaRiwayat((v) => !v)}
            className="text-xs font-bold text-ink-muted transition hover:text-ink cursor-pointer"
          >
            {bukaRiwayat ? 'Sembunyikan riwayat' : `Riwayat usulan (${usulanLama.length} diputuskan)`}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
