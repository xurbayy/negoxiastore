// ============================================================
// E2E: aksi admin web LANGSUNG ke DB (fix 2026-10-04)
//
// Fokus: aksi yang sebelumnya TIDAK ADA form UI, sekarang ada:
//   - add_item   (kasih item ke user)
//   - remove_item (hapus item dari tas user)
//   - set_chemistry (ubah poin chemistry 2 user)
//   - restock_all: verifikasi TIDAK ada di AKSI_LANGSUNG (lewat bot queue)
//
// Uji terhadap PostgreSQL asli, DB terisolasi (schema public).
// Jalankan: node scratch_web_aksi_test.mjs
// ============================================================
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const BOT_DIR = 'E:/NEGOXIA/BOT HOSTING/NEXO';

process.env.PGHOST = 'localhost';
process.env.PGPORT = '5432';
process.env.PGUSER = 'postgres';
process.env.PGPASSWORD = 'postgres';
process.env.PGDATABASE = 'nexo_web_aksi_e2e';
process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/nexo_web_aksi_e2e';
delete process.env.PG_URL;

let pass = 0, fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label); }
}

async function main() {
    // [1] Siapkan DB
    const boot = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'postgres' });
    await boot.connect();
    await boot.query('DROP DATABASE IF EXISTS nexo_web_aksi_e2e');
    await boot.query('CREATE DATABASE nexo_web_aksi_e2e');
    await boot.end();

    const c = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'nexo_web_aksi_e2e' });
    await c.connect();
    // Skema dari bot (public.*)
    await c.query(fs.readFileSync(path.join(BOT_DIR, 'utils', 'schema.pg.sql'), 'utf8'));
    await c.query(`
        INSERT INTO users (user_id, username, points, level) VALUES
        ('111111111111111111', 'UserSatu', 5000, 10),
        ('222222222222222222', 'UserDua', 7000, 12);
        INSERT INTO shop_items (item_key, name, description, price, stock, restock_rate, is_active, effect_type, effect_value, game_type)
        VALUES ('double_points', 'Double Points', 'Gandakan poin game berikutnya', 50000, 20, 24, 1, 'multiplier', '2', 'all')
        ON CONFLICT (item_key) DO NOTHING;
    `);
    console.log('[1] DB nexo_web_aksi_e2e + skema + seed OK\n');

    // [2] Import modul web (ESM, pakai adapter pg)
    // Aksi langsung dieksekusi via jalankanAksiLangsung - tapi modul itu
    // mengimpor './db' (Next.js path). Kita replikasi SQL yang sama PERSIS
    // dan verifikasi efek di DB (karena modul web butuh runtime Next).
    // Untuk memastikan SQL di modul web benar, kita baca file-nya dan
    // ekstrak query kunci, lalu jalankan.

    const aksiSrc = fs.readFileSync(path.join(WEB_DIR, 'app', 'lib', 'aksiAdminLangsung.js'), 'utf8');

    // [3] Verifikasi SQL add_item (ON CONFLICT tambah quantity)
    console.log('[3] add_item');
    const addItemSql = `INSERT INTO public.inventory (user_id, item_key, quantity) VALUES ($1, $2, $3)
        ON CONFLICT (user_id, item_key) DO UPDATE SET quantity = public.inventory.quantity + EXCLUDED.quantity`;
    await c.query(addItemSql, ['111111111111111111', 'double_points', 3]);
    let inv = await c.query(`SELECT quantity FROM public.inventory WHERE user_id=$1 AND item_key=$2`, ['111111111111111111', 'double_points']);
    ok(Number(inv.rows[0]?.quantity) === 3, 'add_item: 3 item masuk ke inventory');
    // Tambah lagi 2 -> harus 5 (bukti ON CONFLICT + tambah, bukan timpa)
    await c.query(addItemSql, ['111111111111111111', 'double_points', 2]);
    inv = await c.query(`SELECT quantity FROM public.inventory WHERE user_id=$1 AND item_key=$2`, ['111111111111111111', 'double_points']);
    ok(Number(inv.rows[0]?.quantity) === 5, 'add_item dobel: quantity menambah (5), bukan timpa');
    ok(aksiSrc.includes('public.inventory.quantity + EXCLUDED.quantity'), 'SQL di modul web = ON CONFLICT tambah (bukan timpa)');

    // [4] Verifikasi SQL remove_item (GREATEST 0)
    console.log('\n[4] remove_item');
    const removeItemSql = `UPDATE public.inventory SET quantity = GREATEST(0, quantity - $1) WHERE user_id = $2 AND item_key = $3`;
    await c.query(removeItemSql, [2, '111111111111111111', 'double_points']);
    inv = await c.query(`SELECT quantity FROM public.inventory WHERE user_id=$1 AND item_key=$2`, ['111111111111111111', 'double_points']);
    ok(Number(inv.rows[0]?.quantity) === 3, 'remove_item: 5 - 2 = 3');
    // Hapus lebih dari punya -> harus 0 (GREATEST)
    await c.query(removeItemSql, [99, '111111111111111111', 'double_points']);
    inv = await c.query(`SELECT quantity FROM public.inventory WHERE user_id=$1 AND item_key=$2`, ['111111111111111111', 'double_points']);
    ok(Number(inv.rows[0]?.quantity) === 0, 'remove_item berlebih: floor 0 (GREATEST, tidak negatif)');
    ok(aksiSrc.includes('GREATEST(0, quantity - '), 'SQL di modul web = GREATEST(0,...)');
    // User tanpa item -> rowsAffected 0 -> HttpError 404 di modul
    const r404 = await c.query(removeItemSql, [1, '222222222222222222', 'double_points']);
    ok(r404.rowCount === 0, 'remove_item user tanpa item: 0 baris (modul -> HttpError 404)');
    ok(aksiSrc.includes('tidak punya'), 'modul web memberi pesan 404 "tidak punya"');

    // [5] set_chemistry: tabel chemistry struktur apa?
    console.log('\n[5] set_chemistry');
    const chemCols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='chemistry' ORDER BY ordinal_position`);
    const chemNames = chemCols.rows.map(r => r.column_name);
    ok(chemNames.length > 0, `tabel chemistry ada (kolom: ${chemNames.join(', ')})`);
    ok(aksiSrc.includes("case 'set_chemistry'"), 'modul web punya case set_chemistry');

    // [6] restock_all TIDAK di AKSI_LANGSUNG (lewat bot queue)
    console.log('\n[6] restock_all routing');
    // Buang komentar dulu - komentar menjelaskan perubahan (menyebut nama aksi
    // dan SQL lama) sehingga grep mentah memberi false positive.
    // GOTCHA: file ber-CRLF; di JS '\r' adalah line terminator sehingga
    // `.*$` TIDAK match sebelum '\r' -> normalisasi CRLF dulu.
    const aksiTanpaKomentar = aksiSrc
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(l => l.replace(/\/\/.*/, ''))
        .join('\n');
    const aksiLangsungBlock = aksiTanpaKomentar.slice(
        aksiTanpaKomentar.indexOf('export const AKSI_LANGSUNG'),
        aksiTanpaKomentar.indexOf(']);', aksiTanpaKomentar.indexOf('export const AKSI_LANGSUNG'))
    );
    ok(!aksiLangsungBlock.includes("'restock_all'"), 'restock_all TIDAK di AKSI_LANGSUNG (fix salah semantik restock_rate)');
    ok(!aksiTanpaKomentar.includes('SET stock = COALESCE(restock_rate, stock)'), 'SQL salah (COALESCE restock_rate) sudah dihapus dari kode');
    ok(!/case 'restock_all'/.test(aksiTanpaKomentar), 'case restock_all sudah tidak ada di switch (tidak reachable)');

    // [7] restock_all masih ada di ACTIONS web + bot (lewat antrean)
    const cmdRoute = fs.readFileSync(path.join(WEB_DIR, 'app', 'api', 'admin', 'command', 'route.js'), 'utf8');
    ok(cmdRoute.includes("'restock_all'"), 'restock_all masih di ACTIONS /api/admin/command (jalur antrean bot)');
    const botBridge = fs.readFileSync(path.join(BOT_DIR, 'utils', 'webBridge.js'), 'utf8');
    ok(botBridge.includes("case 'restock_all'") && botBridge.includes('db.adminRestockAll()'), 'bot: case restock_all -> adminRestockAll() (katalog seed asli)');

    // [8] UI: form Item User ada di Ekonomi.jsx
    console.log('\n[8] UI form baru');
    const ekonomiSrc = fs.readFileSync(path.join(WEB_DIR, 'app', 'components', 'admin', 'Ekonomi.jsx'), 'utf8');
    ok(ekonomiSrc.includes('function ItemUserPanel'), 'Ekonomi.jsx: komponen ItemUserPanel ada');
    ok(ekonomiSrc.includes("kirim('add_item')") && ekonomiSrc.includes("kirim('remove_item')"), 'Ekonomi.jsx: tombol Beri Item + Hapus Item');
    ok(ekonomiSrc.includes('function ChemistryForm') && ekonomiSrc.includes("submit('set_chemistry'"), 'Ekonomi.jsx: form Chemistry');
    const shopSrc = fs.readFileSync(path.join(WEB_DIR, 'app', 'components', 'admin', 'ShopManager.jsx'), 'utf8');
    ok(shopSrc.includes('restockSemua') && shopSrc.includes("send('restock_all'"), 'ShopManager.jsx: tombol Restock Semua lewat send (bot queue)');
    const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'app', 'components', 'admin', 'AdminShell.jsx'), 'utf8');
    ok(shellSrc.includes('<ShopManager send={send} />'), 'AdminShell: pass send ke ShopManager');

    // [9] REGRESI CRASH LABELS (bug produksi 2026-10-04):
    // "kenapa chemistry udah gw set eh malah error halaman webnya".
    // Penyebab: set_chemistry tidak ada di LABELS -> confirm.label undefined
    // -> confirm.label.toLowerCase() di ConfirmModal body -> TypeError ->
    // seluruh halaman admin error. Dua lapis pertahanan yang WAJIB ada:
    //   a) semua destructive action terdaftar di LABELS (atau fallback)
    //   b) fallback `LABELS[action] || action` di submit()
    console.log('\n[9] Regresi crash LABELS (set_chemistry)');
    const ekNoCRLF = ekonomiSrc.replace(/\r\n/g, '\n');
    // a) fallback ada
    ok(/LABELS\[action\]\s*\|\|\s*action/.test(ekNoCRLF), 'Ekonomi.jsx: fallback LABELS[action] || action ada (anti-crash)');
    // b) set_chemistry terdaftar eksplisit di LABELS
    const labelsLine = ekNoCRLF.split('\n').find(l => l.trim().startsWith('const LABELS'));
    ok(labelsLine && labelsLine.includes('set_chemistry'), 'Ekonomi.jsx: set_chemistry terdaftar di LABELS');
    // c) SEMUA destructive submit di Ekonomi punya label di LABELS
    const aksiDestruktif = [...ekNoCRLF.matchAll(/submit\('([a-z_]+)'[^)]*,\s*true\)/g)].map(m => m[1]);
    const belumTerdaftar = [...new Set(aksiDestruktif)].filter(a => !labelsLine || !labelsLine.includes(a + ':'));
    ok(belumTerdaftar.length === 0, `semua ${new Set(aksiDestruktif).size} aksi destruktif terdaftar di LABELS (belum: ${belumTerdaftar.join(',') || '-'})`);
    // d) simulasi runtime: label untuk tiap aksi tidak undefined
    const labelsMatch = labelsLine ? labelsLine.match(/\{([^}]+)\}/) : null;
    const labelsObj = {};
    if (labelsMatch) {
        for (const kv of labelsMatch[1].split(',')) {
            const [k, v] = kv.split(':').map(s => s.trim().replace(/^'|'$/g, ''));
            if (k) labelsObj[k] = v;
        }
    }
    let crashSim = null;
    for (const a of new Set(aksiDestruktif)) {
        const label = labelsObj[a] || a; // fallback yang sama dengan kode
        try { label.toLowerCase(); } catch (e) { crashSim = a + ': ' + e.message; break; }
    }
    ok(crashSim === null, 'simulasi toLowerCase() untuk semua aksi destruktif: tidak crash' + (crashSim ? ' [' + crashSim + ']' : ''));

    console.log(`\n========== HASIL: ${pass} PASS / ${fail} FAIL ==========`);
    await c.end();
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
