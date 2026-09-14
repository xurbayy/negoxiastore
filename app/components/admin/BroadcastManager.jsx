'use client';

import { useState } from 'react';

// Broadcast Manager: kirim notifikasi umum ke inbox user (info/event).
// Khusus notifikasi KODE REDEEM ada di tab Redeem (type 'token') - beda urusan.
export default function BroadcastManager({ send, data } = {}) {
  const [form, setForm] = useState({ target: 'all', targetOne: '', type: 'info', title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const target = form.target === 'all' ? 'all' : form.targetOne.trim();
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, type: form.type, title: form.title, body: form.body }),
      });
      const d = await res.json();
      if (d.ok) {
        setMsg({ ok: true, text: `Terkirim ke ${d.target}.` });
        setForm((f) => ({ ...f, title: '', body: '' }));
      } else {
        setMsg({ ok: false, text: d.error || 'Gagal.' });
      }
    } catch {
      setMsg({ ok: false, text: 'Gagal menghubungi server.' });
    } finally {
      setBusy(false);
    }
  }

  const typeInfo = {
    info: 'Pengumuman umum - mis. maintenance, perubahan sistem. Warna netral di bel user.',
    event: 'Kabar besar - mis. event, update game. Tonjolan oranye di bel user.',
  };

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl text-ink">Broadcast & Notifikasi.</h2>
      <p className="-mt-3 text-sm text-ink-muted">
        Masuk ke lonceng notifikasi user di web. Notifikasi kode redeem dikirim dari tab Redeem.
      </p>

      {/* Pengumuman DISCORD (nxadmin broadcast / shopbroadcast) - dikirim ke bot */}
      <DiscordAnnouncement send={send} data={data} />

      <form onSubmit={submit} className="nx-card px-5 py-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs uppercase tracking-wider text-ink-muted">Target</label>
            <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="mt-1.5 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none">
              <option value="all">Semua user, siaran ke semua</option>
              <option value="one">1 user saja, pakai Discord ID</option>
            </select>
          </div>
          {form.target === 'one' && (
            <div>
              <label className="block text-xs uppercase tracking-wider text-ink-muted">Discord ID</label>
              <input value={form.targetOne} onChange={(e) => setForm({ ...form, targetOne: e.target.value.replace(/\D/g, '') })} placeholder="83638..." className="mt-1.5 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none" />
            </div>
          )}
          <div>
            <label className="block text-xs uppercase tracking-wider text-ink-muted">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1.5 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none">
              <option value="info">info</option>
              <option value="event">event</option>
            </select>
            <p className="mt-1.5 text-xs text-ink-muted">{typeInfo[form.type]}</p>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-xs uppercase tracking-wider text-ink-muted">Judul, maks 120 karakter</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} placeholder="Maintenance malam ini" className="mt-1.5 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <div className="mt-4">
          <label className="block text-xs uppercase tracking-wider text-ink-muted">Isi, maks 500 karakter</label>
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={500} rows={3} placeholder="Bot update jam 21.00 WIB, fitur utama tetap jalan." className="mt-1.5 w-full resize-y rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !form.title.trim() || (form.target === 'one' && !/^\d{5,25}$/.test(form.targetOne))}
            className="rounded-lg bg-accent text-ink! px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {busy ? 'Mengirim…' : 'Kirim Notifikasi'}
          </button>
          {form.target === 'all' && (
            <span className="text-xs text-ink-muted">Semua user yang pernah login web akan melihat ini di loncengnya.</span>
          )}
        </div>
        {msg && (
          <p className={`mt-3 rounded-xl border px-4 py-3 text-sm ${msg.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{msg.text}</p>
        )}
      </form>

      {/* Panduan singkat */}
      <div className="nx-card px-5 py-5">
        <h3 className="font-display text-ink">Catatan.</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>Broadcast muncul ke semua user dan ditandai terbaca per orang, jadi satu klik tidak mematikan untuk semua.</li>
          <li>Pengumuman dari <code className="text-ink">nxadmin</code> di Discord juga otomatis muncul di lonceng user.</li>
        </ul>
      </div>

      <div className="nx-card px-5 py-5">
        <h2 className="font-display text-ink flex items-center justify-between">
          <span>Mode Maintenance Global</span>
          {data?.snapshot?.maintenance?.active ? (
            <span className="nx-badge bg-danger text-white">ON</span>
          ) : (
            <span className="nx-badge bg-success text-white">OFF</span>
          )}
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          Matikan akses semua perintah bot (kecuali admin). Web tetap bisa diakses, tetapi interaksi web-ke-bot mungkin dibatasi.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input 
            type="text" 
            placeholder="Alasan, opsional, maks 200 karakter"
            maxLength={200}
            id="maint-reason"
            className="flex-1 rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button 
              type="button" 
              onClick={() => {
                const reason = document.getElementById('maint-reason').value;
                send('set_maintenance', { status: 'on', reason: reason || 'Under Maintenance' });
              }}
              disabled={busy}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger/80 disabled:opacity-40"
            >
              Nyalakan
            </button>
            <button 
              type="button" 
              onClick={() => {
                send('set_maintenance', { status: 'off' });
                document.getElementById('maint-reason').value = '';
              }}
              disabled={busy}
              className="rounded-lg bg-border-soft px-4 py-2 text-sm font-semibold text-ink transition hover:bg-border disabled:opacity-40"
            >
              Matikan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Pengumuman in-Discord: global = tampil sekali saat user main (getGlobalAnnouncement),
// shop = banner di dalam nxshop. Text kosong = hapus. Sumber = whitelist aksi bot.
function DiscordAnnouncement({ send, data }) {
  const [ch, setCh] = useState('global');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const cur = data?.snapshot?.announcements?.[ch === 'shop' ? 'shop' : 'global'];

  async function push(t, label) {
    if (!send) return;
    setBusy(true);
    try {
      const out = await send('set_announcement', { channel: ch, text: t });
      setMsg(out.ok ? { ok: true, text: `${label} masuk antrean (#${out.id}) - tampil di Discord ≤10 detik.` } : { ok: false, text: out.error || 'Gagal.' });
      if (out.ok) setText('');
    } finally { setBusy(false); }
  }

  return (
    <div className="nx-card px-5 py-5">
      <h2 className="font-display text-ink">Pengumuman Bot Discord</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Ini bukan notifikasi web - teks ini yang tampil di chat Discord (`nxadmin broadcast` versi web):
        global = muncul sekali saat user main; shop = banner di dalam `nxshop`.
      </p>
      <div className="mt-3 flex gap-2">
        <select value={ch} onChange={(e) => setCh(e.target.value)} className="rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink! focus:border-accent focus:outline-none">
          <option value="global">Global broadcast</option>
          <option value="shop">Banner shop</option>
        </select>
        {cur && <span className="flex items-center rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-ink! truncate max-w-[50%]">Aktif: {String(cur).slice(0, 60)}</span>}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 800))} rows={2} placeholder={cur ? 'Tulis pesan baru untuk menimpa...' : 'Isi pengumuman, biarkan kosong bila tidak ada'} className="mt-2 w-full rounded-lg border border-border-soft bg-bg-soft px-3 py-2 text-sm text-ink! focus:border-accent focus:outline-none" />
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy || !text.trim()} onClick={() => push(text.trim(), 'Pengumuman')} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink! transition hover:bg-accent-hover disabled:opacity-40 cursor-pointer">Pasang</button>
        {cur && <button type="button" disabled={busy} onClick={() => push('', 'Penghapusan')} className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-40 cursor-pointer">Hapus</button>}
      </div>
      {msg && <p className={`mt-3 rounded-xl border px-4 py-2 text-sm ${msg.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>{msg.text}</p>}
    </div>
  );
}
