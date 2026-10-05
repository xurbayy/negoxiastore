'use client';

// Modal konfirmasi untuk aksi destruktif.
// MOBILE (2026-10-05): padding dikecilkan di layar sempit, tombol menumpuk
// penuh (stack) supaya mudah ditekan, isi bisa digulir kalau kepanjangan /
// keyboard terbuka (max-h + overflow). Aman di semua lebar.
export default function ConfirmModal({ title, body, onCancel, onConfirm, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-danger/40 bg-card-cream p-4 shadow-2xl sm:p-6">
        <h3 className="font-display text-lg text-danger">{title}</h3>
        <p className="mt-2 overflow-y-auto text-sm leading-relaxed text-ink-muted sm:mt-3">{body}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost w-full text-sm cursor-pointer sm:w-auto">
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-solid btn-solid-danger w-full disabled:opacity-50 sm:w-auto"
          >
            {busy ? 'Mengirim…' : 'Ya, Lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
