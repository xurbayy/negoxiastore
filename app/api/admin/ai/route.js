import { getSession, getAdminSession } from '../../../lib/session';
import { getLatestSnapshot } from '../../../lib/snapshot';
import { susunKonteks, PINTASAN, SARAN_DISKUSI, saranDinamis, ATURAN_FORMAT } from '../../../lib/aiKonteks';
import { tanyaGroq, infoProviderLengkap } from '../../../lib/groq';
import { json } from '../../../lib/api-helpers';
import { wibKeEpoch, formatWib, cariMomen } from '../../../lib/waktuWib';
import { cariHariLibur } from '../../../lib/hariLibur';
import { ambilPeran, daftarPeran, pintasanPeran } from '../../../lib/aiPeran';
import { susunKonteksKode } from '../../../lib/kodeBase';

export const dynamic = 'force-dynamic';

// ==========================================
// CACHE DATA BOT 60 DETIK (optimasi egress 2026-10-04)
// ==========================================
// "ai langsung baca dari database jangan gitu ... boncos". AI route query
// 15+ tabel bot (public.*) langsung di SETIAP request untuk merakit botData
// (ekonomi, retensi, top game/pemain, premium, redeem, bank, title, item,
// shop). Tiap query = round-trip Supabase (~174ms) + EGRESS. Padahal data
// ini JARANG berubah per detik.
//
// Solusi: cache 60 detik. Chat/analisis/agen yang beruntun memakai data yang
// SAMA -> query DB hanya 1x per menit, bukan tiap request. Hemat egress +
// percepat AI drastis. Data >60 dtk dianggap basi -> query ulang.
const BOT_TTL_MS = 60_000;
let _botCacheStore = { data: null, at: 0 };

// Invalidasi on-write (fix 2026-10-04): dipanggil route tulis SETELAH menulis
// DB supaya AI membaca data segar di request berikutnya (bukan cache basi).
export function invalidateBotCache() {
  _botCacheStore = { data: null, at: 0 };
}

// ==========================================
// PENGINGAT: BACA & SIMPAN DARI JAWABAN AI
// ==========================================
// AI menulis baris [[INGATKAN]] tanggal=YYYY-MM-DD | teks=... di akhir
// jawabannya (lihat ATURAN_PENGINGAT). Fungsi ini:
//   1. Mengambil baris itu (dan membersihkannya dari jawaban yang ditampilkan
//      - pemilik tidak perlu melihat perintah teknisnya).
//   2. Menyimpan pengingatnya ke DB dengan waktu WIB.
// @returns {{ jawabanBersih: string, pengingat: object|null }}
async function prosesPengingat(jawaban) {
  const asli = String(jawaban || '');
  // Terima beberapa varian penulisan supaya tidak gagal karena spasi/huruf besar.
  // Format: [[INGATKAN]] tanggal=YYYY-MM-DD jam=HH:MM | teks=... (jam opsional)
  const re = /\[\[\s*INGATKAN\s*\]\]\s*tanggal\s*=\s*(\d{4})-(\d{2})-(\d{2})(?:\s+jam\s*=\s*(\d{1,2})[:.](\d{2}))?\s*\|\s*teks\s*=\s*([^\n\r]+)/i;
  const m = asli.match(re);

  // Baris perintah SELALU dipangkas dari jawaban, walau parsing-nya gagal -
  // supaya pemilik tidak pernah melihat teks teknisnya.
  const jawabanBersih = asli.replace(/\[\[\s*INGATKAN\s*\]\][^\n\r]*/gi, '').replace(/\n{3,}/g, '\n\n').trim();

  if (!m) return { jawabanBersih, pengingat: null };

  const tahun = Number(m[1]), bulan = Number(m[2]) - 1, tanggal = Number(m[3]);
  // Jam dari marker AI (opsional). Kalau tidak ada, default 09:00 WIB.
  const jamAI = m[4] ? Math.min(23, Math.max(0, Number(m[4]))) : 9;
  const menitAI = m[5] ? Math.min(59, Math.max(0, Number(m[5]))) : 0;
  const teks = m[6].trim().slice(0, 300);
  if (!teks) return { jawabanBersih, pengingat: null };

  let waktuIngat = wibKeEpoch(tahun, bulan, tanggal, jamAI, menitAI);
  // Kalau tanggal yang ditulis sudah lewat, coba baca momen dari teksnya
  // (mis. "Halloween") supaya dapat tahun berikutnya.
  if (!Number.isFinite(waktuIngat) || waktuIngat < Date.now() - 86400000) {
    const momen = cariMomen(teks) || cariMomen(asli);
    if (momen) waktuIngat = momen.epoch;
  }
  // Terakhir: cek hari libur Indonesia dari Google Calendar (permintaan pemilik
  // 2026-10-01). Ini menangkap libur Hijriah & Imlek yang tanggalnya bergeser -
  // mis. "ingetin gw pas Idul Fitri". Dipakai kalau momen tetap belum ketemu.
  if (!Number.isFinite(waktuIngat) || waktuIngat < Date.now() - 86400000) {
    try {
      const libur = (await cariHariLibur(teks)) || (await cariHariLibur(asli));
      if (libur) {
        // libur.tanggal berbentuk 'YYYY-MM-DD' - bulan dikurangi 1 karena
        // Date.UTC memakai indeks bulan 0-11.
        const [th, bl, tg] = libur.tanggal.split('-').map(Number);
        waktuIngat = wibKeEpoch(th, bl - 1, tg, 9, 0);
      }
    } catch (_) { /* gagal ambil libur -> pakai nilai sebelumnya */ }
  }
  if (!Number.isFinite(waktuIngat)) return { jawabanBersih, pengingat: null };

  try {
    const { getDb, schemaReady } = await import('../../../lib/db');
    await schemaReady();
    const db = getDb();
    const res = await db.execute({
      sql: 'INSERT INTO ai_reminders (teks, waktu_ingat, selesai, dibuat_at) VALUES (?, ?, 0, ?) RETURNING id',
      args: [teks, waktuIngat, Date.now()],
    });
    return {
      jawabanBersih,
      pengingat: { id: Number(res.rows?.[0]?.id ?? res.lastInsertRowid ?? 0), teks, waktuIngat, waktuTeks: formatWib(waktuIngat) },
    };
  } catch (e) {
    // Gagal simpan pengingat TIDAK boleh menggagalkan jawaban AI, tapi
    // errornya harus TERCATAT (bukan senyap) supaya bisa ditelusuri
    // mengapa pengingat tidak masuk.
    console.error('[AI] Gagal simpan pengingat:', e?.message || e);
    return { jawabanBersih, pengingat: null };
  }
}

// Pemformat angka ringkas - dipakai untuk data pemain yang dicari namanya.
function rupiahNum(n) {
  return Number(n || 0).toLocaleString('id-ID');
}
// Analisis panjang bisa lewat 10 detik; beri ruang tapi jangan menggantung.
export const maxDuration = 60;

// ==========================================
// POST /api/admin/ai
// Asisten analisis data untuk panel admin.
// ==========================================
//
// KEAMANAN (paling penting di berkas ini):
//   - Kunci Groq TIDAK PERNAH menyentuh browser. Permintaan ke Groq selalu
//     dari server ini, jadi kunci tidak bisa dilihat lewat DevTools.
//   - Akses dibatasi sama seperti /api/admin/data: session admin ATAU member
//     yang ada di ADMIN_DISCORD_IDS. Tanpa ini, siapa pun bisa memakai kuota
//     Groq milikmu.
//   - Pesan error dari Groq disaring lewat lib/groq (kunci bisa bocor di
//     pesan error kalau tidak).
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

// Instruksi tetap untuk AI. Ditulis sekali di sini supaya semua jalur
// (chat maupun tombol pintas) memakai aturan yang sama.
//
// PERBAIKAN 2026-10-01 (permintaan pemilik: "AI harus pinter konteks, gw nanya
// kemana jangan bercabang, gw pusing bacanya"):
//
//   MASALAH SEBELUMNYA: prompt SELALU memaksa tiga bagian (TEMUAN/SARAN/RISIKO)
//   untuk SETIAP pertanyaan. Akibatnya saat pemilik bertanya hal spesifik
//   ("berapa pendapatan hari ini?"), AI tetap menulis tiga bagian - membahas
//   hal yang tidak ditanyakan, melebar ke topik lain. Jawaban jadi panjang,
//   bercabang, dan menyulitkan.
//
//   SEKARANG: AI diminta MENJAWAB PERSIS YANG DITANYAKAN dulu, baru menambah
//   bila relevan. Format tiga bagian hanya dipakai kalau pertanyaannya memang
//   meminta analisis menyeluruh (tombol pintas).
function sistemPrompt(peranId) {
  const peran = ambilPeran(peranId);
  return [
    'Kamu asisten analisis data untuk NEXO Games, bot Discord mini-games berbahasa Indonesia.',
    'Pemilik bot memakai jawabanmu untuk mengambil keputusan (promo, harga, konten, komunitas).',
    '',
    peran.prompt,
    '',
    'ATURAN KRITIS:',
    '1. JAWAB LANGSUNG dari data yang diberikan. JANGAN minta user kirim kode/berkas lagi.',
    '   Kalau data kurang, katakan BAGIAN MANA yang kurang - jangan suruh user kirim file.',
    '2. Jawaban SINGKAT dan PADAT. Pertanyaan pendek -> jawaban 1-3 baris.',
    '3. Jangan mengulang pertanyaan. Langsung ke inti.',
    '4. HANYA pakai angka dari DATA. Jangan mengarang.',
    '5. INGAT konteks percakapan sebelumnya.',
    '',
    'LARANGAN HALUSINASI (permintaan pemilik 2026-10-04 - "AI dilarang keras halu"):',
    '- DILARANG menyebut angka, nama pemain, nama item, atau nama game yang TIDAK ada di DATA.',
    '- DILARANG mengaku "sudah melakukan" sesuatu (mis. "sudah saya reset") - kamu hanya menganalisis & mengusulkan.',
    '- Kalau data tidak ada: tulis persis "data tidak tersedia" - JANGAN menebak atau mengisi dengan asumsi.',
    '- Setiap klaim angka WAJIB bisa ditunjuk dari bagian DATA mana asalnya.',
    '- Kalau ragu antara 2 angka, sebut keduanya sebagai rentang - jangan pilih satu secara acak.',
    '',
    'FORMAT:',
    '- Pertanyaan spesifik: jawab langsung tanpa judul.',
    '- Analisis menyeluruh (tombol pintas): pakai "Temuan:", "Saran:", "Risiko:"',
    '  (huruf kapital di awal saja, masing-masing 2-4 poin).',
    '- Bahasa santai seperti ngobrol dengan rekan.',
    '- Tanpa emoji, tanpa huruf besar berlebihan.',
    '- JANGAN akhiri dengan pertanyaan ke user.',
    '',
    ATURAN_FORMAT,
  ].join('\n');
}

export async function POST(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);

  let body = null;
  try { body = await request.json(); } catch { body = null; }

  // Dua mode: tombol pintas (pakai instruksi bawaan) atau chat bebas.
  const idPintasan = String(body?.pintasan || '').trim();
  const idSaran = String(body?.saran || '').trim();
  const tanyaBebas = String(body?.tanya || '').trim().slice(0, 2000);
  // PERAN AI (modular): bug hunter / security / exploit / analyst / umum.
  const peranId = String(body?.peran || 'umum').trim();

  // ==========================================
  // MODE JAWABAN (permintaan pemilik 2026-10-01)
  // ==========================================
  // Pemilik ingin DUA cara pakai, karena keunggulannya berbeda:
  //
  //   'analisis' (searah) - sekali klik tombol pintasan, jawaban tersusun
  //      rapi dalam TEMUAN / SARAN / RISIKO. Cocok untuk laporan cepat dan
  //      keputusan yang butuh pertimbangan risiko.
  //
  //   'diskusi' (chat 2 arah) - percakapan bebas, AI ingat konteks, bisa
  //      ditanya lanjut. Cocok untuk mengobrol/berpikir bersama soal arah
  //      pengembangan ke depan.
  //
  // KEDUANYA tetap berbasis DATA yang sama - mode hanya mengubah BENTUK
  // jawaban, bukan kebebasan AI untuk mengarang. Aturan anti-halusinasi
  // berlaku di kedua mode.
  const mode = body?.mode === 'diskusi' ? 'diskusi' : (idPintasan ? 'analisis' : 'diskusi');

  // RIWAYAT PERCAKAPAN. Dikirim oleh panel sebagai daftar { role, isi } berisi
  // pertukaran sebelumnya, supaya AI INGAT konteks dan bisa ditanya lanjut
  // ("yang tadi itu kenapa?"). Dibatasi 12 pesan terakhir agar konteks tidak
  // meledak dan biaya token tetap wajar.
  //
  // Di mode 'analisis' riwayat DIABAIKAN: tiap analisis harus berdiri sendiri
  // supaya hasilnya tidak tercampur topik sebelumnya.
  const riwayatMentah = mode === 'diskusi' && Array.isArray(body?.riwayat) ? body.riwayat : [];
  const riwayat = riwayatMentah
    .slice(-12)
    .map((r) => {
      const teks = String(r?.isi || '').slice(0, 4000);
      const gbr = Array.isArray(r?.gambar) ? r.gambar.filter((g) => typeof g === 'string' && g.startsWith('data:image')).slice(0, 2) : [];
      // Kalau pesan lama punya gambar, kirim sebagai content array (teks+gambar)
      // supaya model tetap bisa merujuknya di pertanyaan lanjutan.
      const content = gbr.length
        ? [{ type: 'text', text: teks || '(gambar)' }, ...gbr.map((g) => ({ type: 'image_url', image_url: { url: g } }))]
        : teks;
      return { role: r?.role === 'ai' ? 'assistant' : 'user', content };
    })
    .filter((r) => r.content && (typeof r.content === 'string' ? r.content : r.content.length));

  let instruksi = '';
  if (idPintasan) {
    // Pintasan bisa dari PINTASAN umum ATAU pintasan khusus peran (modular).
    const p = PINTASAN.find((x) => x.id === idPintasan)
      || pintasanPeran(peranId).find((x) => x.id === idPintasan);
    if (!p) return json({ ok: false, error: 'Pintasan tidak dikenal.' }, 400);
    instruksi = p.tanya;
  } else if (idSaran) {
    // Saran mode DISKUSI - pertanyaan bebas yang relevan dengan data.
    const s = SARAN_DISKUSI.find((x) => x.id === idSaran);
    if (!s) return json({ ok: false, error: 'Saran tidak dikenal.' }, 400);
    instruksi = s.tanya;
  } else if (tanyaBebas) {
    instruksi = tanyaBebas;
  } else {
    return json({ ok: false, error: 'Kirim salah satu: pintasan atau tanya.' }, 400);
  }

  // Snapshot push bot (opsional sekarang). Sejak migrasi ke SATU database
  // PostgreSQL (2026-10-03), AI TIDAK lagi bergantung pada push: kalau snapshot
  // kosong/basi, AI tetap jalan dengan data LANGSUNG dari tabel bot (public.*).
  let snap = await getLatestSnapshot();
  const { getLiveStats, getBotHeartbeat } = await import('../../../lib/snapshot');
  const [liveStats, heartbeat] = await Promise.all([getLiveStats(), getBotHeartbeat()]);
  if (!snap) {
    // Bangun snapshot minimal dari live stats supaya AI tetap punya konteks.
    snap = {
      ts: heartbeat || Date.now(),
      monitor: liveStats || {},
      bot: { online: heartbeat ? (Date.now() - heartbeat < 3 * 60000) : false, lastSeen: heartbeat },
      _fromLiveDb: true,
    };
  }

  // ==========================================
  // DATA PANEL ADMIN (2026-10-01)
  // ==========================================
  // AI dulu hanya membaca `snapshot` - padahal panel admin menampilkan jauh
  // lebih banyak (pendapatan, log perintah, feedback, tren 7 hari). Akibatnya
  // pertanyaan seperti "berapa pendapatan" atau "keluhan apa yang sering"
  // tidak bisa dijawab walau datanya ADA di panel.
  //
  // Diambil langsung dari DB di sini (bukan lewat fetch ke /api/admin/data)
  // supaya tidak menambah satu putaran HTTP dan tidak bergantung pada cookie.
  let panel = {};
  try {
    const { getDb } = await import('../../../lib/db');
    const { getSnapshotSeries } = await import('../../../lib/snapshot');
    const db = getDb();
    const [orders, log, feedback, series] = await Promise.all([
      db.execute('SELECT plan, amount, gateway, status, created_at FROM orders ORDER BY created_at DESC LIMIT 50'),
      db.execute('SELECT action, status, result, created_at FROM bot_commands ORDER BY created_at DESC LIMIT 50'),
      db.execute('SELECT kind, message, page, created_at, username, discord_id FROM web_feedback ORDER BY created_at DESC LIMIT 50'),
      getSnapshotSeries(7),
    ]);

    // ==========================================
    // DATA BOT LANGSUNG (public.*) - 2026-10-03
    // ==========================================
    // Sejak SATU database (Supabase), AI bisa membaca SELURUH tabel bot
    // langsung: pemain terkaya, top game, ekonomi, premium, misi, guild, dll.
    // Ini melengkapi snapshot push supaya AI punya gambaran penuh.
    // CACHE 60 DTK: query 15+ tabel hanya 1x per menit, bukan tiap request
    // (hemat egress + percepat AI - lihat BOT_TTL_MS di atas).
    let botData = {};
    if (_botCacheStore.data && Date.now() - _botCacheStore.at < BOT_TTL_MS) {
      botData = _botCacheStore.data;
    } else {
    try {
      const [topPlayers, topGames, economy, premiumRows, guildRows, missionRows, txRows, hourlyRows] = await Promise.all([
        db.execute('SELECT username, points, level, xp, total_won, total_bet FROM public.users ORDER BY points DESC LIMIT 20'),
        db.execute('SELECT game_type, COUNT(*) AS plays, COALESCE(SUM(points),0) AS points FROM public.game_scores GROUP BY game_type ORDER BY plays DESC LIMIT 20'),
        db.execute(`SELECT
            (SELECT COUNT(*) FROM public.users) AS total_users,
            (SELECT COALESCE(SUM(points),0) FROM public.users) AS total_points,
            (SELECT COALESCE(SUM(total_won),0) FROM public.users) AS total_won,
            (SELECT COALESCE(SUM(total_bet),0) FROM public.users) AS total_bet,
            (SELECT COUNT(*) FROM public.transactions) AS total_tx,
            (SELECT COUNT(*) FROM public.game_scores) AS total_scores,
            (SELECT COUNT(*) FROM public.inventory) AS total_inventory`),
        db.execute('SELECT user_id, tier, expires_at FROM public.premium WHERE expires_at > ? ORDER BY expires_at DESC LIMIT 50', [Date.now()]),
        // kolom guilds di Postgres = total_points (bukan points - fix 2026-10-03;
        // query lama error senyap -> AI tak pernah dapat data guild).
        db.execute('SELECT guild_code, name, total_points FROM public.guilds ORDER BY total_points DESC LIMIT 20').catch(() => ({ rows: [] })),
        db.execute("SELECT COUNT(*) AS total FROM public.daily_missions").catch(() => ({ rows: [{ total: 0 }] })),
        db.execute('SELECT type, COUNT(*) AS jumlah, COALESCE(SUM(amount),0) AS total FROM public.transactions GROUP BY type ORDER BY jumlah DESC LIMIT 15').catch(() => ({ rows: [] })),
        // DATA PER JAM (WIB) 24 JAM TERAKHIR (permintaan pemilik 2026-10-04:
        // "AI ga bisa baca waktu game dimainkan jam berapa paling banyak, poin
        // beredar juga dari jam WIB Jakarta"). Grup game_scores per jam WIB
        // (AT TIME ZONE 'Asia/Jakarta') -> games + poin dimenangkan per jam.
        // played_at = epoch ms -> konversi ke timestamp lalu ambil jam WIB.
        db.execute(`SELECT (EXTRACT(HOUR FROM to_timestamp(played_at/1000.0) AT TIME ZONE 'Asia/Jakarta'))::int AS jam,
                           COUNT(*)::int AS games, COALESCE(SUM(points),0)::int AS points
                      FROM public.game_scores WHERE played_at >= ?
                     GROUP BY 1 ORDER BY 1`, [Date.now() - 24 * 3600000]).catch(() => ({ rows: [] })),
      ]);
      // DATA REDEEM & EKONOMI TAMBAHAN (2026-10-03, permintaan pemilik:
      // "AI cerdas beneran, baca database, bukan halu") - AI sekarang
      // melihat redeem code, klaim, bank, title, item populer, dan
      // retensi pemain langsung dari tabel bot.
      const [redeemCodes, redeemClaims, bankLoans, titleRows, itemRows, retention, shopStock, redeemWebStat] = await Promise.all([
        db.execute('SELECT code, reward_type, reward_value, quota, claimed_count FROM public.promo_codes ORDER BY created_at DESC LIMIT 15').catch(() => ({ rows: [] })),
        db.execute('SELECT code, COUNT(*) AS dipakai FROM public.promo_claims GROUP BY code ORDER BY dipakai DESC LIMIT 15').catch(() => ({ rows: [] })),
        db.execute('SELECT COUNT(*) AS aktif, COALESCE(SUM(total_due),0) AS total_due FROM public.bank_loans').catch(() => ({ rows: [{ aktif: 0, total_due: 0 }] })),
        db.execute('SELECT title_key, COUNT(*) AS owners FROM public.user_titles GROUP BY title_key ORDER BY owners DESC LIMIT 10').catch(() => ({ rows: [] })),
        db.execute("SELECT item_key, COUNT(*) AS dibeli, COALESCE(SUM(amount),0) AS poin FROM public.transactions WHERE item_key IS NOT NULL GROUP BY item_key ORDER BY dibeli DESC LIMIT 12").catch(() => ({ rows: [] })),
        // FIX 2026-10-06 (retensi selalu 0 - "AI halu"): public.users.created_at
        // di VPS bertipe TEXT ("2026-05-30 16:45:35" / "...+00"), sedangkan
        // played_at bertipe bigint (epoch ms). Versi lama membandingkan keduanya
        // dengan angka epoch -> Postgres error "operator does not exist:
        // text > bigint" -> seluruh query retensi gagal senyap (.catch) ->
        // AI SELALU melihat pemain baru 30 hari = 0, aktif 7/30 hari = 0.
        // Sekarang: created_at di-cast ::timestamptz lalu dibandingkan dengan
        // to_timestamp(epoch/1000); played_at tetap bigint dibandingkan angka.
        db.execute(`SELECT
            (SELECT COUNT(*) FROM public.users WHERE created_at::timestamptz > to_timestamp($1 / 1000.0)) AS baru_30d,
            (SELECT COUNT(*) FROM public.game_scores WHERE played_at > $1) AS game_30d,
            (SELECT COUNT(DISTINCT user_id) FROM public.game_scores WHERE played_at > $2) AS aktif_7d,
            (SELECT COUNT(DISTINCT user_id) FROM public.game_scores WHERE played_at > $1) AS aktif_30d`,
          [Date.now() - 30 * 86400000, Date.now() - 7 * 86400000]).catch(() => ({ rows: [{}] })),
        db.execute('SELECT item_key, name, price, stock FROM public.shop_items WHERE is_active = 1 ORDER BY price DESC LIMIT 20').catch(() => ({ rows: [] })),
        db.execute("SELECT status, COUNT(*) AS n FROM web.web_redeem_claims WHERE claimed_at > $1 GROUP BY status", [Date.now() - 7 * 86400000]).catch(() => ({ rows: [] })),
      ]);

      botData = {
        topPlayers: topPlayers.rows.map((r) => ({ username: r.username, points: Number(r.points), level: Number(r.level), xp: Number(r.xp), totalWon: Number(r.total_won), totalBet: Number(r.total_bet) })),
        topGames: topGames.rows.map((r) => ({ game: r.game_type, plays: Number(r.plays), points: Number(r.points) })),
        // Game + poin per jam (WIB, 24 jam terakhir) - supaya AI bisa menjawab
        // "jam berapa paling ramai" dan "poin beredar per jam".
        hourlyGames: hourlyRows.rows.map((r) => ({ jam: Number(r.jam), games: Number(r.games), points: Number(r.points) })),
        economy: economy.rows[0] ? Object.fromEntries(Object.entries(economy.rows[0]).map(([k, v]) => [k, Number(v)])) : {},
        premiumMembers: premiumRows.rows.map((r) => ({ userId: String(r.user_id), tier: r.tier, expiresAt: Number(r.expires_at) })),
        guilds: guildRows.rows.map((r) => ({ code: r.guild_code, name: r.name, points: Number(r.total_points) })),
        dailyMissionRows: Number(missionRows.rows[0]?.total || 0),
        transactionsByType: txRows.rows.map((r) => ({ type: r.type, jumlah: Number(r.jumlah), total: Number(r.total) })),
        // Data baru (redeem, bank, title, item, retensi):
        redeemCodes: redeemCodes.rows.map((r) => ({ code: r.code, rewardType: r.reward_type, rewardValue: r.reward_value, quota: Number(r.quota), claimed: Number(r.claimed_count) })),
        redeemClaims: redeemClaims.rows.map((r) => ({ code: r.code, dipakai: Number(r.dipakai) })),
        redeemWeb7d: redeemWebStat.rows.map((r) => ({ status: r.status, n: Number(r.n) })),
        bankLoans: { aktif: Number(bankLoans.rows[0]?.aktif || 0), totalDue: Number(bankLoans.rows[0]?.total_due || 0) },
        titles: titleRows.rows.map((r) => ({ key: r.title_key, owners: Number(r.owners) })),
        topItems: itemRows.rows.map((r) => ({ itemKey: r.item_key, dibeli: Number(r.dibeli), poin: Number(r.poin) })),
        shopStock: shopStock.rows.map((r) => ({ itemKey: r.item_key, name: r.name, price: Number(r.price), stock: Number(r.stock) })),
        retention: {
          baru30d: Number(retention.rows[0]?.baru_30d || 0),
          game30d: Number(retention.rows[0]?.game_30d || 0),
          aktif7d: Number(retention.rows[0]?.aktif_7d || 0),
          aktif30d: Number(retention.rows[0]?.aktif_30d || 0),
        },
        liveStats: liveStats || null,
        botOnline: heartbeat ? (Date.now() - heartbeat < 3 * 60000) : false,
        botLastSeen: heartbeat,
      };
      // Simpan ke cache 60 dtk - request berikutnya tidak query ulang 15+ tabel.
      _botCacheStore = { data: botData, at: Date.now() };
    } catch (e) { /* sebagian tabel gagal -> AI tetap jalan dengan data yang ada */ }
    } // tutup blok else (cache miss)

    panel = {
      orders: orders.rows.map((r) => ({
        plan: r.plan, amount: Number(r.amount), gateway: r.gateway, status: r.status,
        createdAt: Number(r.created_at),
      })),
      log: log.rows.map((r) => ({
        action: r.action, status: r.status, result: r.result, createdAt: Number(r.created_at),
      })),
      feedback: feedback.rows.map((r) => ({
        kind: r.kind, message: r.message, page: r.page, createdAt: Number(r.created_at),
        // Sertakan pemain supaya agen bisa sebut SIAPA yang mengeluh
        // (permintaan pemilik 2026-10-02: "agen lebih peka terhadap feedback").
        username: r.username || null, discordId: r.discord_id || null,
      })),
      series: Array.isArray(series) ? series : [],
      bot: botData,
    };
  } catch { /* data panel gagal diambil -> AI tetap jalan dengan snapshot saja */ }

  // ==========================================
  // DETEKSI PEMAIN YANG DITANYAKAN
  // ==========================================
  // Permintaan pemilik: "munculkan data sweetsucidial ... selengkap mungkin".
  // Snapshot hanya memuat 5 pemain teratas, jadi pemain lain tidak bisa dibahas.
  //
  // Di sini nama yang disebut di pertanyaan dicocokkan ke daftar pemain, lalu
  // profil LENGKAPnya diambil dari data Player Lookup (bukan ditebak).
  // Pencocokan harus persis (case-insensitive) supaya tidak salah orang -
  // nama mirip seperti "sweet" dan "sweetsucidial" tidak boleh tertukar.
  let konteksPemain = '';
  const daftar = snap.monitor?.daftarPemain || [];
  if (daftar.length) {
    // Pencocokan HARUS kata utuh (fix 2026-10-01).
    //
    // BUG YANG DIPERBAIKI: sebelumnya memakai teksCari.includes(username),
    // sehingga pertanyaan tentang "sweetsucidial" IKUT menarik data pemain
    // bernama "sweet" (karena "sweet" adalah potongan dari "sweetsucidial").
    // Akibatnya AI membahas DUA orang sekaligus dan bisa mencampur angkanya -
    // persis jenis kesalahan yang paling berbahaya untuk pengambilan keputusan.
    //
    // Sekarang: pertanyaan dipecah jadi kata, dan username harus SAMA PERSIS
    // dengan salah satu kata. "sweetsucidial" hanya cocok dengan dirinya sendiri.
    const kataTanya = new Set(
      (instruksi + ' ' + tanyaBebas + ' ' + idPintasan)
        .toLowerCase()
        .split(/[^a-z0-9_]+/)   // pisah di spasi, tanda baca, dan simbol
        .filter(Boolean)
    );
    // Ambil userId yang BENAR. PENTING (fix 2026-10-04): PostgreSQL me-lowercase
    // alias kolom, jadi daftarPemain bisa berisi `userid` (bukan `userId`).
    // Dulu kode memakai u.userId apa adanya -> undefined -> pencarian gagal
    // dan AI menjawab "Data tidak tersedia" padahal pemainnya ADA.
    // Terbukti: ID 1535676425305325689 (zerongawi) ada di DB tapi AI bilang
    // tidak ada.
    const idDari = (u) => u.userId ?? u.userid ?? u.user_id ?? null;

    // Pencocokan nama (kata utuh) + DETEKSI ID LANGSUNG (fix 2026-10-04):
    // pemilik sering menempelkan Discord ID mentah (17-20 digit). Sebelumnya
    // ID mentah tidak pernah dicocokkan, jadi AI buta terhadapnya.
    const cocokNama = daftar.filter((u) => u.username && kataTanya.has(String(u.username).toLowerCase()));
    const idDiPertanyaan = new Set(
      (instruksi + ' ' + tanyaBebas + ' ' + idPintasan).match(/\b\d{17,20}\b/g) || []
    );
    const cocokId = idDiPertanyaan.size
      ? daftar.filter((u) => idDiPertanyaan.has(String(idDari(u) || '')))
      : [];
    // Gabung: ID dulu (paling spesifik), lalu nama. Maks 2 supaya konteks tidak meledak.
    const cocok = [...cocokId, ...cocokNama.filter((n) => !cocokId.includes(n))];
    for (const u of cocok.slice(0, 2)) {
      try {
        const uid = idDari(u);
        if (!uid) continue;
        const res = await fetch(new URL('/api/admin/player?id=' + encodeURIComponent(uid), request.url), {
          headers: { cookie: request.headers.get('cookie') || '' },
        });
        if (!res.ok) continue;
        const d = await res.json();
        const p = d?.profile?.profile || d?.profile;
        if (!p) continue;
        // Ringkas supaya tidak mengirim objek mentah yang panjang.
        konteksPemain += '\n\n### DATA LENGKAP PEMAIN: ' + (p.username || u.username) + '\n';
        konteksPemain += 'ID: ' + (p.userId || uid) + '\n';
        konteksPemain += 'Poin: ' + rupiahNum(p.points) + ' | Level ' + p.level +
          ' | XP ' + p.xp + '/' + (p.xpNext ?? '-') + ' | Rank global: ' + (p.globalRank ?? '-') + '\n';
        konteksPemain += 'Registered: ' + (p.registered ? 'ya' : 'belum') +
          ' | Premium: ' + (p.premiumStatus || 'none') + '\n';
        konteksPemain += 'Streak harian: ' + p.dailyStreak + ' hari | Winstreak: ' + (p.winstreak || 0) + '\n';
        konteksPemain += 'Total menang: ' + rupiahNum(p.totalWon) + ' | Total taruhan: ' + rupiahNum(p.totalBet) + '\n';
        if (p.adminTitle) konteksPemain += 'Judul admin: ' + String(p.adminTitle).replace(/<[^>]+>/g, '') + '\n';
        const tas = Array.isArray(p.inventory) ? p.inventory : [];
        konteksPemain += 'Tas (' + tas.length + ' jenis): ' +
          (tas.length ? tas.map((x) => (x.name || x.itemKey) + ' x' + x.quantity).join(', ') : 'kosong') + '\n';
        const tx = Array.isArray(p.transactions) ? p.transactions : [];
        konteksPemain += 'Transaksi terakhir (' + tx.length + '): ' +
          (tx.length ? tx.slice(0, 10).map((x) => x.type + ' ' + rupiahNum(x.amount)).join(', ') : '-') + '\n';
        const hist = Array.isArray(p.history) ? p.history : [];
        konteksPemain += 'Riwayat main (' + hist.length + '): ' +
          (hist.length ? hist.slice(0, 10).map((x) => (x.gameType || x.game_type) + '=' + x.points).join(', ') : '-') + '\n';
        if (p.guild?.name) konteksPemain += 'Guild: ' + p.guild.name + ' (' + (p.guild.role || 'member') + ')\n';
        if (p.loan) konteksPemain += 'Pinjaman: ' + rupiahNum(p.loan.totalDue) + ' jatuh tempo ' + new Date(p.loan.dueDate).toISOString().slice(0, 10) + '\n';
        konteksPemain += 'Judul dimiliki: ' + (Array.isArray(p.ownedTitles) ? p.ownedTitles.length : 0) + '\n';
      } catch { /* pemain ini dilewati, yang lain tetap diproses */ }
    }
  }

  // ==========================================
  // KONTEKS DATA DB LANGSUNG (panel.bot) - permintaan pemilik 2026-10-03:
  // "AI cerdas beneran, baca database, jangan halu". Semua angka di bawah
  // dibaca LANGSUNG dari Supabase saat pertanyaan masuk (bukan cache push),
  // disusun jadi teks ringkas supaya AI menjawab dari DATA, bukan tebakan.
  // ==========================================
  function ringkasBotData(b) {
    if (!b || typeof b !== 'object') return '';
    const L = [];
    const rp = (x) => Number(x || 0).toLocaleString('id-ID');
    L.push('');
    L.push('### DATA DATABASE LANGSUNG (real-time dari PostgreSQL)');
    if (b.botOnline != null) L.push('Status bot: ' + (b.botOnline ? 'ONLINE' : 'OFFLINE') + (b.botLastSeen ? ' (terlihat ' + new Date(Number(b.botLastSeen)).toISOString().slice(0, 16).replace('T', ' ') + ' UTC)' : ''));
    // Ekonomi
    if (b.economy && Object.keys(b.economy).length) {
      L.push('Total pemain (semua): ' + rp(b.economy.total_users) + ' | Poin beredar: ' + rp(b.economy.total_points) + ' | Transaksi: ' + rp(b.economy.total_tx) + ' | Baris skor game: ' + rp(b.economy.total_scores));
    }
    // Retensi
    if (b.retention) {
      L.push('Retensi: pemain baru 30 hari=' + rp(b.retention.baru30d) + ' | aktif 7 hari=' + rp(b.retention.aktif7d) + ' | aktif 30 hari=' + rp(b.retention.aktif30d) + ' | total game 30 hari=' + rp(b.retention.game30d));
    }
    // Top game & pemain
    if (Array.isArray(b.topGames) && b.topGames.length) {
      L.push('Top game (sepanjang masa): ' + b.topGames.slice(0, 10).map((g) => g.game + '(' + g.plays + 'x)').join(', '));
    }
    if (Array.isArray(b.topPlayers) && b.topPlayers.length) {
      L.push('Pemain terkaya top 5: ' + b.topPlayers.slice(0, 5).map((p) => p.username + '(' + rp(p.points) + ')').join(', '));
    }
    // Premium
    if (Array.isArray(b.premiumMembers) && b.premiumMembers.length) {
      L.push('NEXO Pass aktif: ' + b.premiumMembers.length + ' member');
    }
    // REDEEM CODE - data yang sebelumnya tidak pernah dilihat AI
    if (Array.isArray(b.redeemCodes) && b.redeemCodes.length) {
      L.push('Kode redeem (kode | hadiah | klaim/kuota):');
      for (const r of b.redeemCodes.slice(0, 10)) {
        L.push('- ' + r.code + ' | ' + r.rewardType + ' ' + r.rewardValue + ' | ' + r.claimed + '/' + r.quota);
      }
    }
    if (Array.isArray(b.redeemClaims) && b.redeemClaims.length) {
      L.push('Klaim terbanyak: ' + b.redeemClaims.slice(0, 8).map((r) => r.code + '(' + r.dipakai + ')').join(', '));
    }
    if (Array.isArray(b.redeemWeb7d) && b.redeemWeb7d.length) {
      L.push('Redeem dari WEB 7 hari: ' + b.redeemWeb7d.map((r) => r.status + '=' + r.n).join(', '));
    }
    // Bank, title, item
    if (b.bankLoans) L.push('Pinjaman bank aktif: ' + rp(b.bankLoans.aktif) + ' | total tagihan: ' + rp(b.bankLoans.totalDue));
    if (Array.isArray(b.titles) && b.titles.length) {
      L.push('Title terpopuler: ' + b.titles.slice(0, 8).map((t) => t.key + '(' + t.owners + ')').join(', '));
    }
    if (Array.isArray(b.topItems) && b.topItems.length) {
      L.push('Item paling dibeli: ' + b.topItems.slice(0, 8).map((t) => t.itemKey + '(' + t.dibeli + 'x)').join(', '));
    }
    if (Array.isArray(b.shopStock) && b.shopStock.length) {
      const habis = b.shopStock.filter((s) => s.stock === 0);
      if (habis.length) L.push('ITEM STOK HABIS: ' + habis.map((s) => s.itemKey).join(', '));
    }
    // Guild
    if (Array.isArray(b.guilds) && b.guilds.length) {
      L.push('Guild teratas: ' + b.guilds.slice(0, 8).map((g) => g.name + '(' + rp(g.points) + ')').join(', '));
    }
    // Transaksi per tipe
    if (Array.isArray(b.transactionsByType) && b.transactionsByType.length) {
      L.push('Transaksi per tipe (top): ' + b.transactionsByType.slice(0, 8).map((t) => t.type + '=' + t.jumlah + 'x').join(', '));
    }
    return L.join('\n');
  }
  const konteksBot = ringkasBotData(panel?.bot);

  const konteks = (await susunKonteks(snap, panel)) + konteksPemain + konteksBot;

  // KODE BASE: kalau bot mengirim ringkasan kode, tambahkan ke konteks. Ini
  // yang membuat peran bug/security/exploit/analyst bisa menganalisis kode.
  const konteksKode = susunKonteksKode(snap?.kodeBase);

  // Tandai jenis tugas supaya AI tahu BENTUK jawaban yang diinginkan.
  // Inilah pembeda dua mode yang diminta pemilik:
  //   analisis -> tersusun Temuan / Saran / Risiko (laporan siap baca)
  //   diskusi  -> jawaban langsung & singkat, boleh ditanya lanjut
  //
  // PENTING (fix 2026-10-04) - LARANGAN HALUSINASI AKSI:
  // Pemilik melaporkan AI mode DISKUSI mengaku BISA melakukan aksi (mis.
  // "sudah saya buatkan notif") padahal mode ini MURNI percakapan - tidak
  // punya kemampuan mengeksekusi apa pun. Yang bisa melakukan aksi HANYA
  // AGEN (lewat usulan yang harus DISETUJUI pemilik dulu).
  const laranganAksi = [
    '',
    'LARANGAN KERAS - KAMU TIDAK BISA MELAKUKAN AKSI APA PUN:',
    '- Kamu hanya MENGANALISIS dan MENJAWAB. Kamu TIDAK punya tombol, TIDAK bisa',
    '  membuat pengingat/notif, TIDAK bisa mengubah data, TIDAK bisa mengirim pesan',
    '  ke Discord, TIDAK bisa memberi poin/item/premium.',
    '- DILARANG menulis "sudah saya buatkan", "sudah saya kirim", "sudah diproses",',
    '  "notif sudah dibuat", atau klaim apa pun bahwa sesuatu SUDAH terjadi.',
    '- Kalau pemilik meminta aksi (mis. "bikin notif", "kasih poin ke X", "restock"),',
    '  jawab dengan pola: (1) ini butuh aksi, (2) cara melakukannya ADA di panel',
    '  admin bagian mana ATAU usulkan lewat AGEN, (3) JANGAN bilang sudah dikerjakan.',
    '- Contoh jawaban BENAR untuk "bikin notif besok jam 9":',
    '  "Aku cuma bisa menganalisis, ga bisa bikin notif. Buat pengingat, pakai tab',
    '   Agen (agen bisa usulkan pengingat yang kamu setujui), atau tombol Pengingat',
    '   di panel."',
    '- Contoh jawaban SALAH: "Siap, notif sudah saya buatkan untuk besok jam 9."',
  ].join('\n');

  const penandaTugas = mode === 'analisis'
    ? [
      'PERMINTAAN ANALISIS. Jawaban WAJIB memuat TIGA bagian ini, berurutan, TANPA kecuali:',
      '1. Temuan:',
      '2. Saran:',
      '3. Risiko:',
      '(huruf kapital di awal kata saja, jangan capslock).',
      'WAJIB ada ketiganya - jangan pernah melewatkan "Risiko:". Kalau tidak ada risiko nyata, tulis "Tidak ada risiko yang signifikan hari ini."',
      'Jangan memakai huruf asing (Mandarin, Jepang, Korea, Cyrillic) - pakai huruf Latin saja.',
      'Bahasa santai.',
      laranganAksi,
    ].join('\n')
    : [
      'MODE DISKUSI. Jawab persis yang ditanyakan, singkat, tanpa judul bagian.',
      'Bahasa santai. Jangan memakai huruf asing (Mandarin/Jepang/Korea/Cyrillic) - pakai huruf Latin saja.',
      'Kalau pemilik bertanya lanjutan, rujuk jawaban sebelumnya.',
      laranganAksi,
    ].join('\n');

  // SUSUNAN PESAN (chat 2 arah):
  //   system  -> aturan main
  //   user    -> DATA (sekali, di awal - supaya AI selalu punya acuan angka)
  //   ...riwayat pertukaran sebelumnya (user/assistant bergantian)...
  //   user    -> pertanyaan terbaru
  //
  // Data diletakkan di AWAL, bukan diulang tiap giliran: AI tetap bisa
  // merujuknya sepanjang percakapan, dan token tidak membengkak.
  //
  // GAMBAR (permintaan pemilik 2026-10-02): kalau ada lampiran gambar,
  // pertanyaan terakhir memakai format content array (teks + image_url
  // data-URL) yang dipahami provider OpenAI-compatible.
  const gambar = Array.isArray(body?.gambar) ? body.gambar.filter((g) => typeof g === 'string' && g.startsWith('data:image')).slice(0, 4) : [];
  const kontenTerakhir = gambar.length
    ? [
        { type: 'text', text: penandaTugas + '\n\nPERTANYAAN: ' + instruksi },
        ...gambar.map((g) => ({ type: 'image_url', image_url: { url: g } })),
      ]
    : (penandaTugas + '\n\nPERTANYAAN: ' + instruksi);

  const pesan = [
    { role: 'system', content: sistemPrompt(peranId) },
    { role: 'user', content: 'DATA SNAPSHOT BOT:\n\n' + konteks + konteksKode },
    ...riwayat,
    { role: 'user', content: kontenTerakhir },
  ];

  // Provider & model dari UI (toggle di panel admin AI).
  const providerPilihan = String(body?.provider || '').trim();
  const modelPilihan = String(body?.model || '').trim();
  // Pengaturan per-model: UI mengirim max_tokens + thinking (level) dari
  // model tersimpan, kalau ada. Bisa juga dikirim manual.
  // (2026-10-04: 'kecerdasan 1-10' diganti 'thinking' level.)
  const maxTokens = Number(body?.max_tokens) || undefined;
  const thinking = body?.thinking ? String(body.thinking) : undefined;

  const hasil = await tanyaGroq(pesan, {
    provider: providerPilihan || undefined,
    model: modelPilihan || undefined,
    maxTokens,
    thinking,
  });
  if (!hasil.ok) {
    // Nama provider & env key untuk petunjuk - JANGAN hardcode "Groq",
    // pesan harus sesuai provider yang benar-benar dipakai.
    const labelProv = hasil.providerLabel || hasil.provider || 'AI';
    const envProv = hasil.envKey || 'API_KEY';
    return json({
      ok: false,
      error: hasil.error,
      modelDipaka: hasil.model,
      provider: hasil.provider,
      // Kode 429 = semua kunci kena limit. Pesan ini membantu admin tahu
      // harus menunggu, bukan mengira kodenya rusak.
      // FIX 2026-10-07 ("mode max & lainnya ga keluar"): tambahkan penjelasan
      // konkret rate limit provider gratis (RouterWay 5 request/menit) supaya
      // pemilik tidak mengira mode thinking-nya yang rusak.
      kode: hasil.kode,
      petunjuk: hasil.kode === 429
        ? `Batas kuota ${labelProv} tercapai (provider gratis biasanya ~5 request/menit). Tunggu 1-2 menit lalu coba lagi - ini BUKAN masalah mode thinking. Kalau sering, tambah kunci di ${envProv}.`
        : (hasil.kode >= 500
          ? `Server ${labelProv} sedang gangguan sementara (HTTP ${hasil.kode}). Tunggu sebentar lalu coba lagi - ini bukan masalah mode thinking.`
          : undefined),
    }, 502);
  }

  // Simpan pengingat bila AI menuliskannya, dan bersihkan baris perintahnya
  // dari jawaban yang ditampilkan ke pemilik.
  const { jawabanBersih, pengingat } = await prosesPengingat(hasil.teks);

  // MODE ANALISIS: PASTIKAN keluaran punya KETIGA bagian (Temuan/Saran/Risiko).
  // Sebagian model lupa satu bagian (kejadian nyata 2026-10-02: minimax hanya
  // menulis Temuan + Saran, "Risiko:" hilang; ada juga yang menyisipkan huruf
  // Mandarin "解决"). Fungsi ini:
  //   1. Membuang karakter non-Latin yang bocor (Mandarin/Kanji/Cyrillic).
  //   2. Menambahkan bagian yang HILANG dengan catatan jujur.
  let jawabanFinal = jawabanBersih;
  if (mode === 'analisis' && jawabanBersih) {
    // 1) Bersihkan karakter asing (Mandarin, Kanji, Cyrillic, Arab) yang bocor
    //    dari model - diganti tanda hubung supaya kalimat tetap terbaca.
    let teksBersih = jawabanBersih
      .replace(/[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF\u0600-\u06FF]+/g, '-')
      .replace(/\s*-\s*-\s*/g, ' - ')
      .replace(/ {2,}/g, ' ');
    // 2) Pastikan ketiga penanda ada.
    const adaTemuan = /temuan\s*:/i.test(teksBersih);
    const adaSaran = /saran\s*:/i.test(teksBersih);
    const adaRisiko = /risiko\s*:/i.test(teksBersih);
    if (!adaTemuan && !adaSaran && !adaRisiko) {
      // Model sama sekali tidak pakai format - bungkus seluruh jawaban.
      teksBersih = 'Temuan:\n\n' + teksBersih.trim() +
        '\n\nSaran:\n\n(model tidak memisahkan bagian - lihat temuan di atas)' +
        '\n\nRisiko:\n\n(model tidak menyebutkan risiko - coba ulangi atau ganti model)';
    } else {
      // Tambahkan bagian yang HILANG saja (jangan sentuh yang sudah ada).
      if (!adaRisiko) {
        teksBersih = teksBersih.trim() +
          '\n\nRisiko:\n\n(model tidak menyebutkan risiko pada jawaban ini - pertimbangkan dampaknya sendiri sebelum bertindak)';
      }
      if (!adaSaran) {
        teksBersih = teksBersih.trim() +
          '\n\nSaran:\n\n(model tidak memberi saran pada jawaban ini - coba ulangi atau ganti model)';
      }
      if (!adaTemuan) {
        teksBersih = 'Temuan:\n\n(model tidak memisahkan temuan - lihat isi di bawah)\n\n' + teksBersih.trim();
      }
    }
    jawabanFinal = teksBersih;
  }

  return json({
    ok: true,
    jawaban: jawabanFinal,
    mode,
    pengingat,
    model: hasil.model,
    provider: hasil.provider,
    kunciDipakai: hasil.kunciDipakai,
    providerLabel: hasil.providerLabel,
    ukuranKonteks: konteks.length,
    // Pemakaian token dari provider (kalau disediakan).
    usage: hasil.usage || null,
  });
}

// GET /api/admin/ai - status kesiapan (dipakai panel untuk menampilkan
// "AI siap dipakai" atau peringatan konfigurasi, tanpa memanggil Groq).
export async function GET() {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  try {
    const info = await infoProviderLengkap();
    // SARAN DINAMIS: susun dari snapshot terkini supaya relevan dengan kondisi
    // saat ini (bukan daftar statis).
    let saranDin = [];
    let snapKode = null;
    try {
      const snap = await getLatestSnapshot();
      saranDin = saranDinamis(snap).map((s) => ({ id: s.id, label: s.label, tanya: s.tanya }));
      snapKode = snap?.kodeBase || null;
    } catch { /* gagal ambil snapshot - pakai saran umum */ }
    if (!saranDin.length) {
      saranDin = SARAN_DISKUSI.map((s) => ({ id: s.id, label: s.label, tanya: s.tanya }));
    }
    // DIAGNOSTIK (permintaan pemilik 2026-10-02): tampilkan env yang TERBACA
    // server, TANPA membocorkan isi kunci. Membantu melacak kenapa "belum aktif"
    // padahal env sudah diisi (mis. AI_PROVIDER salah, AI_BASE_URL nyangkut).
    const diag = {
      AI_PROVIDER: process.env.AI_PROVIDER || null,
      AI_BASE_URL: process.env.AI_BASE_URL ? 'diisi' : null,
      adaGroq: Boolean(process.env.GROQ_API_KEY),
      adaOpenrouter: Boolean(process.env.OPENROUTER_API_KEY),
      jumlahGroq: (process.env.GROQ_API_KEY || '').split(',').filter((k) => k.trim()).length,
      jumlahOpenrouter: (process.env.OPENROUTER_API_KEY || '').split(',').filter((k) => k.trim()).length,
      providerBawaanTerbaca: info.tersedia.filter((t) => !t.kustom).map((t) => `${t.id}(${t.kunci})`),
      providerKustom: info.tersedia.filter((t) => t.kustom).map((t) => `${t.id}(${t.kunci})`),
      errorDb: info.errorDb || null,
    };
    return json({
      ok: true,
      aktif: info.siap,
      jumlahKunci: info.kunci,
      model: info.model,
      provider: info.aktif,
      providerLabel: info.label,
      providers: info.tersedia,
      models: info.models,
      pintasan: PINTASAN.map((p) => ({ id: p.id, label: p.label })),
      saranDiskusi: saranDin,
      // PERAN AI (modular) + pintasan per peran + status kode base.
      peran: daftarPeran(),
      pintasanPeran: Object.fromEntries(daftarPeran().map((p) => [p.id, pintasanPeran(p.id).map((x) => ({ id: x.id, label: x.label }))])),
      adaKodeBase: Boolean(snapKode),
      diag,
    });
  } catch (e) {
    // Jangan silent - kirim pesan supaya panel bisa menampilkan sebabnya.
    return json({ ok: false, error: 'Gagal memuat status AI: ' + (e?.message || e), aktif: false }, 500);
  }
}
