// Rate limiter in-memory sederhana (per-instance, cukup untuk Vercel Node).
//
// CATATAN KEAMANAN (audit 2026-09-14):
//  - buckets/fails dulu TIDAK PERNAH dibersihkan. Setiap IP unik menambah entri
//    permanen, jadi penyerang yang memutar IP bisa membuat memori tumbuh tanpa
//    batas sampai proses mati (OOM). Sekarang ada pembersihan berkala.
//  - getClientIp dulu mengambil elemen PERTAMA x-forwarded-for, yang bisa
//    dipalsukan klien karena proxy menambahkan IP asli di belakangnya. Sekarang
//    diambil dari KANAN (paling dekat proxy tepercaya).
//  - Ditambah rateLimitGlobal() untuk membatasi total request lintas IP, supaya
//    satu serangan dari banyak IP tidak lolos hanya karena IP-nya berbeda.
const buckets = new Map(); // key -> [timestamps]
const fails = new Map();   // key -> { count, lockedUntil, firstFail }

// Batas jumlah entri supaya memori tidak tumbuh tanpa batas. Kalau terlampaui,
// entri tertua dibuang (LRU sederhana lewat urutan Map).
const MAX_ENTRIES = 5000;

// Pembersihan berkala: hapus bucket/lockout yang sudah kedaluwarsa.
let _lastSweep = 0;
const SWEEP_EVERY_MS = 60_000;

function sweep(now) {
  if (now - _lastSweep < SWEEP_EVERY_MS) return;
  _lastSweep = now;
  for (const [k, list] of buckets) {
    const masih = list.filter((t) => now - t < 10 * 60_000);
    if (masih.length) buckets.set(k, masih);
    else buckets.delete(k);
  }
  for (const [k, rec] of fails) {
    const basi = now - rec.firstFail > 30 * 60_000 && (!rec.lockedUntil || now > rec.lockedUntil);
    if (basi) fails.delete(k);
  }
  // Jaring terakhir kalau sweep belum cukup (trafik sangat tinggi).
  while (buckets.size > MAX_ENTRIES) buckets.delete(buckets.keys().next().value);
  while (fails.size > MAX_ENTRIES) fails.delete(fails.keys().next().value);
}

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  sweep(now);
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  buckets.set(key, list);
  return list.length <= max;
}

// Batas GLOBAL lintas IP: melindungi dari serangan terdistribusi (banyak IP,
// masing-masing sedikit) yang akan lolos dari rate limit per-IP.
// Dipakai hemat di endpoint publik yang paling sering ditembak.
const globalBucket = new Map(); // nama : [timestamps]
export function rateLimitGlobal(name, max, windowMs) {
  const now = Date.now();
  sweep(now);
  const list = (globalBucket.get(name) || []).filter((t) => now - t < windowMs);
  list.push(now);
  globalBucket.set(name, list);
  return list.length <= max;
}

// Lockout: setelah maxFail gagal dalam window, blokir sampai lockoutMs lewat.
export function isLockedOut(key) {
  const rec = fails.get(key);
  if (!rec) return false;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) return true;
  return false;
}

export function recordFail(key, maxFail, windowMs, lockoutMs) {
  const now = Date.now();
  sweep(now);
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

// IP klien dari header proxy.
//
// GOTCHA: x-forwarded-for berbentuk "klien, proxy1, proxy2, ...". Elemen PALING
// KIRI bisa dikirim klien sendiri (dipalsukan) sehingga rate limit bisa dilewati
// dengan mengganti nilai itu tiap request. Di belakang proxy tepercaya (Vercel),
// IP asli yang ditambahkan platform ada di posisi paling KANAN. Karena itu
// ambil dari kanan, dan kalau hanya ada satu nilai (dev/lokal) pakai itu.
export function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return request.headers.get('x-real-ip') || 'local';
}

// ==========================================
// RATE LIMIT PERSISTENT (audit keamanan 2026-10-01)
// ==========================================
//
// KENAPA PERLU:
//   Fungsi rateLimit() di atas menyimpan hitungan di MEMORI proses. Di Vercel,
//   satu request bisa mendarat di instance berbeda, sehingga tiap instance
//   punya hitungan sendiri - batas jadi longgar tanpa sengaja.
//
//   Dipakai HANYA untuk endpoint paling sensitif (login admin & redeem kode),
//   karena setiap panggilan = 1 query DB. Endpoint lain tetap in-memory.
//
// CARA KERJA:
//   Hitungan disimpan per (bucket, jendela waktu). Jendela dihitung dari
//   waktu dibulatkan ke bawah sesuai ukuran jendela, sehingga semua instance
//   memakai jendela yang sama.
export async function rateLimitPersistent(bucket, batas, windowMs) {
  try {
    const { getDb, schemaReady } = await import('./db');
    await schemaReady();
    const db = getDb();
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    // UPSERT atomik: kalau baris jendela ini sudah ada, tambah hitungan.
    // RETURNING hits memberi nilai SETELAH penambahan, jadi keputusannya
    // konsisten walau ada request bersamaan dari instance berbeda.
    const res = await db.execute({
      sql: `INSERT INTO rate_limit (bucket, window_start, hits)
            VALUES (?, ?, 1)
            ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1
            RETURNING hits`,
      args: [bucket, windowStart],
    });

    const hits = Number(res.rows?.[0]?.hits ?? res.rows?.[0]?.[0] ?? 1);

    // Bersihkan jendela lama sesekali (jangan tiap request - mahal).
    if (Math.random() < 0.01) {
      db.execute({ sql: 'DELETE FROM rate_limit WHERE window_start < ?', args: [now - 10 * windowMs] }).catch(() => {});
    }

    return hits <= batas;
  } catch {
    // DB bermasalah -> JANGAN blokir user. Keamanan lapis ini opsional;
    // lapisan in-memory di atas tetap berjalan.
    return true;
  }
}
