/**
 * UJI END-TO-END (DB lokal): kode redeem dibuat ulang -> klaim web lama
 * harus ter-reset, user lama bisa claim lagi. Memakai syncPromoCache ASLI.
 * Meniru alur nyata: bot push snapshot (dengan createdAtMs) -> web sinkron.
 */
import { getDb, ensureSchema } from '../app/lib/db.js';
import { syncPromoCache } from '../app/lib/promo-cache.js';

const CODE = 'RESETEST';
const uid = '999000000000009701';
let gagal = 0;
const cek = (label, ok) => {
  if (!ok) gagal++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
};

(async () => {
  await ensureSchema();
  const db = getDb();

  const hapusSemua = async () => {
    await db.execute({ sql: 'DELETE FROM web_promo_cache WHERE code = ?', args: [CODE] });
    await db.execute({ sql: 'DELETE FROM web_redeem_claims WHERE code = ?', args: [CODE] });
  };
  const klaimBaris = async () => {
    const r = await db.execute({ sql: 'SELECT discord_id, code, status FROM web_redeem_claims WHERE code = ?', args: [CODE] });
    return r.rows.map(x => `${x.discord_id}:${x.status}`);
  };
  const cache = async () => {
    const r = await db.execute({ sql: 'SELECT quota, reserved, exhausted FROM web_promo_cache WHERE code = ?', args: [CODE] });
    return r.rows[0] || null;
  };

  await hapusSemua();
  const T0 = Date.now() - 10 * 60 * 1000; // "10 menit lalu"

  console.log('=== SIKLUS 1: kode dibuat, user klaim ===');
  await syncPromoCache(db, [{ code: CODE, rewardType: 'points', rewardValue: '500', quota: 3, claimed: 0, createdAtMs: T0 }]);
  // user klaim (persis seperti /api/redeem: insert claim + reserved naik)
  await db.execute({ sql: 'UPDATE web_promo_cache SET reserved = reserved + 1 WHERE code = ?', args: [CODE] });
  await db.execute({
    sql: "INSERT INTO web_redeem_claims (discord_id, code, claimed_at, status) VALUES (?,?,?, 'delivered')",
    args: [uid, CODE, T0 + 60 * 1000],
  });
  let c = await cache();
  cek(`  reserved = 1 setelah 1 klaim (reserved: ${c.reserved})`, Number(c.reserved) === 1);
  cek('  klaim user tercatat', (await klaimBaris()).length === 1);

  console.log('\n=== SIKLUS 2: admin HAPUS kode (sync tandai exhausted) ===');
  await syncPromoCache(db, []); // kode hilang dari daftar bot
  c = await cache();
  cek('  cache ditandai exhausted=1', c && Number(c.exhausted) === 1);
  cek('  klaim LAMA masih ada (belum dibuat ulang - belum saatnya reset)', (await klaimBaris()).length === 1);

  console.log('\n=== SIKLUS 3: admin TAMBAH ULANG kode (inkarnasi baru) ===');
  const T1 = Date.now(); // created_at baru dari bot
  await syncPromoCache(db, [{ code: CODE, rewardType: 'points', rewardValue: '500', quota: 3, claimed: 0, createdAtMs: T1 }]);
  c = await cache();
  cek('  exhausted kembali 0 (kode hidup lagi)', c && Number(c.exhausted) === 0);
  cek('  KLAIM LAMA DIHAPUS (user bisa claim lagi)', (await klaimBaris()).length === 0);
  cek(`  reserved kembali 0 (reserved: ${c.reserved})`, Number(c.reserved) === 0);

  console.log('\n=== SIKLUS 4: user yang sama claim lagi di inkarnasi baru ===');
  await db.execute({ sql: 'UPDATE web_promo_cache SET reserved = reserved + 1 WHERE code = ? AND exhausted = 0 AND reserved < quota', args: [CODE] });
  await db.execute({
    sql: "INSERT INTO web_redeem_claims (discord_id, code, claimed_at, status) VALUES (?,?,?, 'pending')",
    args: [uid, CODE, T1 + 1000],
  });
  c = await cache();
  cek('  klaim kedua diterima (reserved: ' + c.reserved + ')', Number(c.reserved) === 1);

  console.log('\n=== SIKLUS 5: sync berikutnya TIDAK boleh menghapus klaim baru ===');
  await syncPromoCache(db, [{ code: CODE, rewardType: 'points', rewardValue: '500', quota: 3, claimed: 1, createdAtMs: T1 }]);
  const klaimSekarang = await klaimBaris();
  cek('  klaim baru (sesudah created_at) UTUH', klaimSekarang.length === 1 && klaimSekarang[0].startsWith(uid));
  c = await cache();
  cek('  reserved tetap 1, tidak dobel', Number(c.reserved) === 1);

  console.log('\n=== SIKLUS 6: kode yang TIDAK pernah dibuat ulang (created_at lama) ===');
  await syncPromoCache(db, [{ code: CODE, rewardType: 'points', rewardValue: '500', quota: 3, claimed: 1, createdAtMs: T1 - 60 * 1000 }]);
  // created_at sengaja dibuat 1 menit SEBELUM klaim -> tidak boleh ada yang terhapus
  cek('  klaim yang lebih baru dari created_at tidak tersentuh', (await klaimBaris()).length === 1);

  await hapusSemua();
  console.log('\n(data uji dibersihkan)');
  console.log(`\n=== HASIL: ${gagal === 0 ? 'SEMUA PASS' : gagal + ' GAGAL'} ===`);
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.log('ERROR:', e.message); process.exit(1); });
