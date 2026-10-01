// ==========================================
// scripts/build-bersih.js
// Build produksi dengan cache DIBERSIHKAN dulu.
// ==========================================
//
// KENAPA PERLU (kejadian nyata 2026-10-01):
//   Build Vercel gagal berulang dengan error:
//     "module-not-found" pada [next]/internal/font/google/jetbrains_mono_*.module.css
//     Error: Command "npm run build" exited with 1
//
//   Setelah diuji: build GAGAL kalau folder .next masih ada sisa, dan SUKSES
//   kalau .next dihapus lebih dulu. Jadi ini bug cache build Turbopack
//   (referensi font tersimpan setengah jalan dari build yang terputus),
//   BUKAN kesalahan kode - build lokal dari nol selalu berhasil.
//
//   Menyalakan "clean build" lewat perintah ini membuat perilaku build
//   SAMA di lokal maupun Vercel, tanpa perlu mengingat-uncheck
//   "Use existing Build Cache" setiap kali redeploy.
const { rmSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const AKAR = join(__dirname, '..');

// Hapus .next (dan cache turbopack bila ada) supaya build selalu dari nol.
for (const nama of ['.next', 'node_modules/.cache']) {
  try {
    rmSync(join(AKAR, nama), { recursive: true, force: true });
    console.log('[build-bersih] menghapus ' + nama);
  } catch (e) {
    // Gagal hapus bukan alasan membatalkan build - lanjut saja.
    console.log('[build-bersih] lewati ' + nama + ': ' + (e?.message || e));
  }
}

console.log('[build-bersih] menjalankan next build...');
try {
  execFileSync('npx', ['next', 'build'], { cwd: AKAR, stdio: 'inherit', shell: true });
} catch (e) {
  process.exit(typeof e?.status === 'number' ? e.status : 1);
}
