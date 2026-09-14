'use client';

// Modal konfirmasi untuk aksi destruktif.
export default function ConfirmModal({ title, body, onCancel, onConfirm, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-2xl border border-danger/40 bg-card-cream p-6 shadow-2xl">
        <h3 className="font-display text-lg text-danger">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost px-4! py-2! text-sm cursor-pointer">
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-danger text-white! px-5 py-2 text-sm font-semibold text-white transition hover:bg-danger-hover disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Mengirim…' : 'Ya, Lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
