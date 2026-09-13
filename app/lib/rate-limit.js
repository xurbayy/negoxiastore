// Rate limiter in-memory sederhana (per-instance, cukup untuk Vercel Node).
const buckets = new Map(); // key -> [timestamps]

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  buckets.set(key, list);
  return list.length <= max;
}

// Lockout: setelah maxFail gagal dalam window, blokir sampai lockoutMs lewat.
const fails = new Map(); // key -> { count, lockedUntil, firstFail }

export function isLockedOut(key) {
  const rec = fails.get(key);
  if (!rec) return false;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) return true;
  return false;
}

export function recordFail(key, maxFail, windowMs, lockoutMs) {
  const now = Date.now();
  const rec = fails.get(key) || { count: 0, lockedUntil: 0, firstFail: now };
  if (now - rec.firstFail > windowMs) {
    rec.count = 0;
    rec.firstFail = now;
  }
  rec.count += 1;
  if (rec.count >= maxFail) {
    rec.lockedUntil = now + lockoutMs;
    rec.count = 0;
  }
  fails.set(key, rec);
}

export function clearFails(key) {
  fails.delete(key);
}

export function lockoutRemaining(key) {
  const rec = fails.get(key);
  if (!rec || !rec.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil - Date.now());
}

export function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local'
  );
}
