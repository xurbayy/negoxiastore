// ==========================================
// Channel pembayaran Duitku — satu sumber untuk web
// ==========================================
// Terverifikasi LIVE ke sandbox 2026-10-12: 22 dari 25 channel aktif merchant
// bisa inquiry sukses (lihat scratch scan). Yang GAGAL jangan ditampilkan:
//   - LQ (LinkAja QRIS)  -> "Payment channel not available"
//   - GQ (Gudang Voucher QRIS) -> "Payment channel not available"
//   - DN (Indodana Paylater) -> tidak merespons
//
// Dipakai oleh:
//   - /api/payment/duitku/methods  -> daftar dropdown (nama live dari API,
//     lib ini untuk urutan kategori + fallback)
//   - /api/payment/duitku/create   -> validasi kode + label jejak gateway_ref
export const DUITKU_METODE = {
  // QRIS — satu QR, discan aplikasi apa pun
  NQ: 'Nobu QRIS',
  SP: 'ShopeePay QRIS',
  // E-wallet
  OV: 'OVO',
  DA: 'DANA',
  SA: 'ShopeePay',
  LA: 'LinkAja',
  JP: 'Jenius Pay',
  // Virtual Account
  BC: 'BCA VA',
  VA: 'Maybank VA',
  BT: 'Permata VA',
  B1: 'CIMB Niaga VA',
  A1: 'ATM Bersama VA',
  I1: 'BNI VA',
  M2: 'Mandiri VA',
  AG: 'Artha Graha VA',
  S1: 'Sampoerna VA',
  BR: 'BRI VA',
  NC: 'BNC VA',
  BV: 'BSI VA',
  // Gerai retail
  FT: 'Gerai Retail',
  IR: 'Indomaret',
  // Kartu kredit
  VC: 'Kartu Kredit',
};

// Channel yang terverifikasi tidak bisa dipakai — tolak di create, sembunyikan
// di dropdown. (Kalau Duitku mengaktifkan di production, hapus dari sini.)
export const DUITKU_DILARANG = new Set(['LQ', 'GQ', 'DN']);

// Urutan kategori di dropdown.
export const DUITKU_URUTAN_KATEGORI = [
  'QRIS',
  'E-Wallet',
  'Virtual Account',
  'Gerai Retail',
  'Kartu Kredit',
  'Lainnya',
];

// Kategori dari NAMA channel (dipakai endpoint methods dari data live API).
export function kategoriDuitku(nama) {
  const n = String(nama || '').toUpperCase();
  if (n.includes('QRIS')) return 'QRIS';
  if (/(\bOVO\b|\bDANA\b|SHOPEEPAY APP|LINKAJA APP|JENIUS)/.test(n)) return 'E-Wallet';
  if (/\bVA\b|VIRTUAL/.test(n)) return 'Virtual Account';
  if (/RETAIL|INDOMARET/.test(n)) return 'Gerai Retail';
  if (/CREDIT CARD|KARTU/.test(n)) return 'Kartu Kredit';
  if (/PAYLATER/.test(n)) return 'Paylater';
  return 'Lainnya';
}
