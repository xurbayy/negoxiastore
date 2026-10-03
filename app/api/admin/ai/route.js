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
      sql: 'INSERT INTO ai_reminders (teks, waktu_ingat, selesai, dibuat_at) VALUES (?, ?, 0, ?)',
      args: [teks, waktuIngat, Date.now()],
    });
    return {
      jawabanBersih,
      pengingat: { id: Number(res.lastInsertRowid ?? 0), teks, waktuIngat, waktuTeks: formatWib(waktuIngat) },
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
      db.execute('SELECT plan, amount, gateway, status, created_at FROM orders ORDER BY created_at DESC LIMIT 100'),
      db.execute('SELECT action, status, result, created_at FROM bot_commands ORDER BY created_at DESC LIMIT 100'),
      db.execute('SELECT kind, message, page, created_at, username, discord_id FROM web_feedback ORDER BY created_at DESC LIMIT 60'),
      getSnapshotSeries(7),
    ]);

    // ==========================================
    // DATA BOT LANGSUNG (public.*) - 2026-10-03
    // ==========================================
    // Sejak SATU database (Supabase), AI bisa membaca SELURUH tabel bot
    // langsung: pemain terkaya, top game, ekonomi, premium, misi, guild, dll.
    // Ini melengkapi snapshot push supaya AI punya gambaran penuh.
    let botData = {};
    try {
      const [topPlayers, topGames, economy, premiumRows, guildRows, missionRows, txRows] = await Promise.all([
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
      ]);
      botData = {
        topPlayers: topPlayers.rows.map((r) => ({ username: r.username, points: Number(r.points), level: Number(r.level), xp: Number(r.xp), totalWon: Number(r.total_won), totalBet: Number(r.total_bet) })),
        topGames: topGames.rows.map((r) => ({ game: r.game_type, plays: Number(r.plays), points: Number(r.points) })),
        economy: economy.rows[0] ? Object.fromEntries(Object.entries(economy.rows[0]).map(([k, v]) => [k, Number(v)])) : {},
        premiumMembers: premiumRows.rows.map((r) => ({ userId: String(r.user_id), tier: r.tier, expiresAt: Number(r.expires_at) })),
        guilds: guildRows.rows.map((r) => ({ code: r.guild_code, name: r.name, points: Number(r.total_points) })),
        dailyMissionRows: Number(missionRows.rows[0]?.total || 0),
        transactionsByType: txRows.rows.map((r) => ({ type: r.type, jumlah: Number(r.jumlah), total: Number(r.total) })),
        liveStats: liveStats || null,
        botOnline: heartbeat ? (Date.now() - heartbeat < 3 * 60000) : false,
        botLastSeen: heartbeat,
      };
    } catch (e) { /* sebagian tabel gagal -> AI tetap jalan dengan data yang ada */ }

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
    const cocok = daftar.filter((u) => u.username && kataTanya.has(String(u.username).toLowerCase()));
    // Dibatasi 2 supaya konteks tidak meledak kalau banyak nama disebut.
    for (const u of cocok.slice(0, 2)) {
      try {
        const res = await fetch(new URL('/api/admin/player?id=' + encodeURIComponent(u.userId), request.url), {
          headers: { cookie: request.headers.get('cookie') || '' },
        });
        if (!res.ok) continue;
        const d = await res.json();
        const p = d?.profile?.profile || d?.profile;
        if (!p) continue;
        // Ringkas supaya tidak mengirim objek mentah yang panjang.
        konteksPemain += '\n\n### DATA LENGKAP PEMAIN: ' + (p.username || u.username) + '\n';
        konteksPemain += 'ID: ' + (p.userId || u.userId) + '\n';
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

  const konteks = (await susunKonteks(snap, panel)) + konteksPemain;

  // KODE BASE: kalau bot mengirim ringkasan kode, tambahkan ke konteks. Ini
  // yang membuat peran bug/security/exploit/analyst bisa menganalisis kode.
  const konteksKode = susunKonteksKode(snap?.kodeBase);

  // Tandai jenis tugas supaya AI tahu BENTUK jawaban yang diinginkan.
  // Inilah pembeda dua mode yang diminta pemilik:
  //   analisis -> tersusun Temuan / Saran / Risiko (laporan siap baca)
  //   diskusi  -> jawaban langsung & singkat, boleh ditanya lanjut
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
    ].join('\n')
    : 'MODE DISKUSI. Jawab persis yang ditanyakan, singkat, tanpa judul bagian. Bahasa santai. Jangan memakai huruf asing (Mandarin/Jepang/Korea/Cyrillic) - pakai huruf Latin saja. Kalau pemilik bertanya lanjutan, rujuk jawaban sebelumnya.';

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
  // Pengaturan per-model: UI mengirim max_tokens + kecerdasan (1-10) dari
  // model tersimpan, kalau ada. Bisa juga dikirim manual.
  const maxTokens = Number(body?.max_tokens) || undefined;
  const kecerdasan = Number(body?.kecerdasan) || undefined;

  const hasil = await tanyaGroq(pesan, {
    provider: providerPilihan || undefined,
    model: modelPilihan || undefined,
    maxTokens,
    kecerdasan,
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
      kode: hasil.kode,
      petunjuk: hasil.kode === 429
        ? `Semua kunci ${labelProv} kena batas kuota. Tunggu sebentar atau tambah kunci di ${envProv}.`
        : undefined,
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
