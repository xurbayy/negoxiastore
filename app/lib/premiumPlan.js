// ==========================================
// KONSTANTA NEXO Pass (premium) - SATU SUMBER KEBENARAN
// ==========================================
// KENAPA DIJADIKAN SATU FILE:
//   Dulu durasi "30 hari" ditulis manual di beberapa tempat (grant, notifikasi
//   ke pembeli, konfirmasi admin). Kalau admin memberi durasi lain lewat panel
//   (mis. 60 hari untuk promo), pesan ke pembeli tetap bilang "30 hari" - itu
//   membuat pemain bingung soal masa aktifnya sendiri.
//
// ATURAN: jangan pernah hardcode durasi di tempat lain. Selalu pakai
//   PLAN_DAYS (nilai default) atau hariAktual() untuk menghitung dari data
//   yang benar-benar tersimpan (expires_at), supaya yang ditampilkan ke pemain
//   SELALU sama dengan yang benar-benar berlaku.

/** Durasi default satu pembelian NEXO Pass (hari). */
export const PLAN_DAYS = 30;

/** Harga NEXO Pass dalam Rupiah. */
export const PLAN_PRICE = 20000;

/** Ambang "lifetime" - sisa waktu di atas ini dianggap seumur hidup. */
export const LIFETIME_THRESHOLD_DAYS = 50 * 365;

/**
 * Sisa hari yang KONKRET dari sebuah tanggal kedaluwarsa.
 * Dibulatkan KE ATAS supaya "sisa 12 jam" tetap terbaca "1 hari" (bukan 0).
 *
 * @param {number|string} expiresAt - timestamp ms (atau ISO string)
 * @returns {number} sisa hari, minimal 0
 */
export function sisaHari(expiresAt) {
  const t = typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number(expiresAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
}

/**
 * Apakah premium ini berstatus LIFETIME (bukan hitungan hari).
 * @param {object} premium - objek premium dari profil (punya expiresAt / lifetime)
 */
export function isLifetime(premium) {
  if (!premium) return false;
  if (premium.lifetime === true) return true;
  const t = Number(premium.expiresAt);
  if (!Number.isFinite(t)) return false;
  return (t - Date.now()) > LIFETIME_THRESHOLD_DAYS * 86400000;
}

/**
 * Teks masa aktif yang SIAP TAMPIL dan selalu jujur:
 *   - lifetime          -> "Aktif selamanya"
 *   - sisa > 1 hari     -> "Sisa 23 hari"
 *   - sisa 1 hari       -> "Sisa 1 hari"
 *   - sisa < 1 hari     -> "Berakhir hari ini"
 *   - sudah lewat       -> "Sudah berakhir"
 *
 * @param {object} premium
 */
export function labelMasaAktif(premium) {
  if (!premium) return 'Tidak aktif';
  if (isLifetime(premium)) return 'Aktif selamanya';
  const t = Number(premium.expiresAt);
  if (!Number.isFinite(t)) return 'Tidak aktif';
  if (t <= Date.now()) return 'Sudah berakhir';
  const hari = sisaHari(t);
  if (hari <= 0) return 'Berakhir hari ini';
  return `Sisa ${hari} hari`;
}
