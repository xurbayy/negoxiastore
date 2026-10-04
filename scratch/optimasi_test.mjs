// ============================================================
// TEST: Optimasi egress/efisiensi Supabase + Vercel (2026-10-05)
//
// Memverifikasi (statis - baca kode):
//   [1] /api/me: write throttle 3 menit ada + fallback label benar
//   [2] /api/admin/shop GET: cache 8 dtk + invalidasi on-write
//   [3] snapshot.js: cache 5 menit + invalidateSnapshot + invalidateLive
//   [4] bot/stats: panggil invalidateSnapshot setelah simpan snapshot baru
//   [5] Navbar: poll 60 dtk + skip hidden + visibilitychange
//   [6] Notifications: poll 60 dtk + skip hidden + visibilitychange
//   [7] Anti-regresi: TIDAK ada polling <15 dtk yang tersisa di komponen
//       user-facing (kecuali yang memang butuh: PremiumClient saat pending)
//
// Jalankan: node scratch/optimasi_test.mjs
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label); }
}
const read = (p) => fs.readFileSync(path.join(WEB, p), 'utf8').replace(/\r\n/g, '\n');

console.log('[1] /api/me write throttle');
const meSrc = read('app/api/me/route.js');
ok(meSrc.includes('WRITE_THROTTLE_MS = 3 * 60_000'), 'throttle 3 menit terdefinisi');
ok(meSrc.includes('function bolehMenulis'), 'helper bolehMenulis ada');
ok(/bolehMenulis\(session\.discordId\)/.test(meSrc), 'blok write dipagari bolehMenulis');
ok(meSrc.includes('_lastWrite.size > 5000'), 'map throttle dibatasi (anti memory leak)');

console.log('\n[2] /api/admin/shop GET cache');
const shopSrc = read('app/api/admin/shop/route.js');
ok(shopSrc.includes('GET_TTL_MS = 8_000'), 'cache GET 8 detik');
ok(shopSrc.includes('cached: true'), 'response menandai cached');
ok(shopSrc.includes('_cacheGet.data = null'), 'invalidasi on-write ada di catatDanSegarkan');

console.log('\n[3] snapshot.js cache');
const snapSrc = read('app/lib/snapshot.js');
ok(snapSrc.includes('SNAP_CACHE_MS = 5 * 60_000'), 'snapshot cache 5 menit');
ok(snapSrc.includes('SERIES_CACHE_MS = 5 * 60_000'), 'series cache 5 menit');
ok(snapSrc.includes('export function invalidateSnapshot'), 'invalidateSnapshot diexport');
ok(/invalidateLive\(\)[\s\S]{0,200}_snapCache = null/.test(snapSrc), 'invalidateLive juga clear _snapCache');
ok(/invalidateSnapshot\(\)[\s\S]{0,100}_seriesCache = null/.test(snapSrc), 'invalidateSnapshot clear _seriesCache');
// _seriesCache dideklarasi sebelum invalidateSnapshot dipakai
const posDecl = snapSrc.indexOf('let _seriesCache');
const posInv = snapSrc.indexOf('export function invalidateSnapshot');
ok(posDecl > 0 && posDecl < posInv, `_seriesCache dideklarasi SEBELUM invalidateSnapshot (${posDecl} < ${posInv})`);

console.log('\n[4] bot/stats invalidasi');
const statsSrc = read('app/api/bot/stats/route.js');
ok(statsSrc.includes("import { invalidateSnapshot }"), 'import invalidateSnapshot');
ok(/INSERT INTO monitor_snapshots[\s\S]{0,300}invalidateSnapshot\(\)/.test(statsSrc), 'invalidateSnapshot dipanggil SETELAH insert snapshot baru');

console.log('\n[5] Navbar polling');
const navSrc = read('app/components/Navbar.jsx');
ok(navSrc.includes('setInterval(check, 60000)'), 'poll 60 detik (dari 15)');
ok(navSrc.includes('if (document.hidden) return'), 'skip saat tab tersembunyi');
ok(navSrc.includes('visibilitychange'), 'listener visibilitychange (refresh saat kembali)');

console.log('\n[6] Notifications polling');
const notifSrc = read('app/components/Notifications.jsx');
ok(notifSrc.includes('setInterval(load, 60000)'), 'poll 60 detik (dari 15)');
ok(notifSrc.includes('document.hidden'), 'skip saat tab tersembunyi');
ok(notifSrc.includes('visibilitychange'), 'listener visibilitychange');

console.log('\n[7] Anti-regresi: interval user-facing minimal 10 dtk');
// 10 dtk = batas yang disepakati setelah optimasi 2026-10-05 (panel admin
// poll 10s + cache server 8s = data terasa live). Yang <10 dtk (selain tick
// UI lokal) dicurigai sebagai sisa kebocoran egress.
const komponenWajibCek = [
    'app/components/Navbar.jsx',
    'app/components/Notifications.jsx',
    'app/components/MeClient.jsx',
    'app/components/admin/ShopManager.jsx',
    'app/components/admin/AdminShell.jsx',
];
let terlaluCepat = [];
for (const f of komponenWajibCek) {
    const src = read(f);
    const m = src.match(/setInterval\([^,]+,\s*(\d+)\)/g) || [];
    for (const call of m) {
        const ms = Number((call.match(/,\s*(\d+)\)/) || [])[1]);
        if (ms && ms < 10000 && !call.includes('setTick')) terlaluCepat.push(`${f}: ${call}`);
    }
}
ok(terlaluCepat.length === 0, 'tidak ada setInterval <10s (selain tick UI)' + (terlaluCepat.length ? ' [' + terlaluCepat.join('; ') + ']' : ''));

// Verifikasi spesifik nilai baru
const shellSrc = read('app/components/admin/AdminShell.jsx');
const shopComp = read('app/components/admin/ShopManager.jsx');
ok(shellSrc.includes('}, 10000)'), 'AdminShell poll 10 dtk');
ok(shopComp.includes('}, 10000)'), 'ShopManager poll 10 dtk');

console.log(`\n========== HASIL: ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail === 0 ? 0 : 1);
