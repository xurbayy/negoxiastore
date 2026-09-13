'use client';

import { useEffect, useRef, useState } from 'react';

// Tombol Feedback di navbar (sebelah lonceng): buka modal -> kirim saran/bug/
// laporan. Masuk ke web (tabel) + di-forward bot ke channel Discord admin.
const KINDS = [
  { id: 'Saran', label: 'Saran' },
  { id: 'Bug', label: 'Lapor Bug' },
  { id: 'Laporan', label: 'Laporan Pemain' },
];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('Saran');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (busy || text.trim().length < 5) return;
    setBusy(true);
    setDone(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: text.trim(), page: window.location.pathname }),
      });
      const d = await res.json();
      if (d.ok) {
        setDone({ ok: true, text: d.message });
        setText('');
        setTimeout(() => { setDone(null); setOpen(false); }, 2200);
      } else {
        setDone({ ok: false, text: d.reason || 'Gagal mengirim.' });
      }
    } catch {
      setDone({ ok: false, text: 'Gagal menghubungi server.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Kirim feedback atau laporan"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-card-cream text-ink transition hover:-translate-y-px hover:bg-bg-soft active:translate-y-0 cursor-pointer"
        title="Feedback & Laporan"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(17rem,calc(100vw-2.5rem))] sm:w-80 overflow-hidden rounded-2xl border border-border-soft bg-card-cream shadow-[0_12px_32px_rgba(43,33,24,0.14)]">
          <div className="border-b border-border-soft px-4 py-3">
            <p className="text-sm font-bold text-ink">Feedback & Laporan.</p>
            <p className="mt-0.5 text-xs text-ink-muted">Langsung sampai ke meja admin via Discord.</p>
          </div>
          <form onSubmit={submit} className="px-4 py-3">
            <div className="flex gap-1.5" role="radiogroup" aria-label="Jenis">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  onClick={() => setKind(k.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    kind === k.id
                      ? 'border-transparent bg-accent text-ink shadow-sm'
                      : 'border-border-soft bg-white text-ink-muted hover:border-accent/50 hover:text-ink'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={1500}
              placeholder={kind === 'Bug' ? 'Ceritain bugnya + langkah mengulanginya…' : kind === 'Laporan' ? 'Siapa, di server mana, kejadiinya apa…' : 'Ide fitur, kritik, atau pujangan pun boleh…'}
              className="mt-3 w-full resize-y rounded-xl border border-border-soft bg-bg-soft px-3 py-2 text-xs sm:text-sm text-ink focus:border-accent focus:outline-none"
            />
            {done && (
              <p className={`mt-2 rounded-lg border px-3 py-2 text-xs ${done.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>
                {done.text}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[0.65rem] text-ink-muted">{text.length}/1500</span>
              <button
                type="submit"
                disabled={busy || text.trim().length < 5}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-ink shadow-sm transition hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                {busy ? 'Mengirim…' : 'Kirim'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
