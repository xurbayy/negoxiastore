// Verifikasi Cloudflare Turnstile sisi server.
// Return true = lolos. Kalau secret key belum diset (mis. dev tanpa akun),
// anggap lolos supaya web tetap bisa dites - produksi WAJIB punya env ini.
export async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== 'string') return { ok: false };
  try {
    const body = new URLSearchParams({
      secret,
      response: String(token).slice(0, 2048),
      remoteip: remoteIp || '',
    });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const d = await res.json().catch(() => ({}));
    return { ok: Boolean(d.success) };
  } catch {
    // Network error ke Cloudflare: JANGAN block user sungguhan? Untuk redeem
    // (hadiah), lebih aman menolak - tapi kasih pesan jelas buat retry.
    return { ok: false, netError: true };
  }
}
