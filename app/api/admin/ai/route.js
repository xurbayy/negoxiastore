import { getSession, getAdminSession } from '../../../lib/session';
import { getLatestSnapshot } from '../../../lib/snapshot';
import { susunKonteks, PINTASAN, ATURAN_FORMAT } from '../../../lib/aiKonteks';
import { tanyaGroq, adaGroq, jumlahKunci, modelGroq } from '../../../lib/groq';
import { json } from '../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

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
function sistemPrompt() {
  return [
    'Kamu asisten analisis data untuk NEXO Games, bot Discord mini-games berbahasa Indonesia.',
    'Pemilik bot memakai jawabanmu untuk mengambil keputusan (promo, harga, konten, komunitas).',
    '',
    'CARA MENJAWAB (paling penting):',
    '1. JAWAB PERSIS YANG DITANYAKAN. Kalau ditanya satu hal, jawab satu hal itu.',
    '   Jangan menambah topik lain yang tidak ditanyakan - pemilik tidak minta.',
    '2. Mulai dengan JAWABAN LANGSUNG di baris pertama (angka/fakta yang diminta).',
    '   Baru setelah itu penjelasan singkat kalau perlu.',
    '3. Panjang jawaban menyesuaikan pertanyaan: pertanyaan singkat -> jawaban',
    '   singkat (1-3 baris). Jangan memaksakan jawaban panjang.',
    '4. Jangan mengulang pertanyaan pemilik di awal jawaban. Langsung ke isi.',
    '5. Kalau pertanyaan menyentuh beberapa hal sekaligus, jawab berurutan',
    '   sesuai urutan yang ditanyakan - jangan melompat-lompat.',
    '6. INGAT percakapan sebelumnya. Kalau pemilik bertanya lanjutan ("yang tadi",',
    '   "kenapa", "terus"), rujuk jawabanmu sebelumnya - jangan mulai dari nol',
    '   atau mengulang penjelasan yang sudah diberikan.',
    '',
    'ATURAN DATA:',
    '6. HANYA pakai angka dari DATA yang diberikan. Jangan mengarang angka, item, atau game yang tidak ada di data.',
    '7. Kalau data kurang untuk menjawab, KATAKAN terus terang bagian mana yang kurang. Jangan menebak.',
    '8. Kalau suatu bagian datanya memang KOSONG (mis. Jumlah item: 0), laporkan apa adanya - jangan mengarang isinya.',
    '9. Setiap angka yang kamu sebut harus ada di data. Kalau menyimpulkan, sebut angka pendukungnya.',
    '',
    'FORMAT JAWABAN:',
    '- Untuk pertanyaan SPESIFIK: jawab langsung, tanpa judul bagian. Contoh:',
    '  "Pendapatan dari order: 40.000 dari 2 order berhasil."',
    '- Untuk permintaan ANALISIS MENYELURUH (tombol pintas): baru pakai tiga',
    '  bagian TEMUAN / SARAN / RISIKO, masing-masing 2-4 poin saja.',
    '- Jangan memakai bagian yang isinya kosong atau cuma mengulang.',
    '',
    ATURAN_FORMAT,
  ].join('\n');
}

export async function POST(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);

  if (!adaGroq()) {
    return json({
      ok: false,
      error: 'GROQ_API_KEY belum diisi di environment (Vercel > Settings > Environment Variables).',
    }, 400);
  }

  let body = null;
  try { body = await request.json(); } catch { body = null; }

  // Dua mode: tombol pintas (pakai instruksi bawaan) atau chat bebas.
  const idPintasan = String(body?.pintasan || '').trim();
  const tanyaBebas = String(body?.tanya || '').trim().slice(0, 2000);

  // RIWAYAT PERCAKAPAN (permintaan pemilik 2026-10-01: "chat 2 arah seperti
  // ChatGPT"). Dikirim oleh panel sebagai daftar { role, isi } berisi
  // pertukaran sebelumnya, supaya AI INGAT konteks dan bisa ditanya lanjut
  // ("yang tadi itu kenapa?"). Dibatasi 12 pesan terakhir agar konteks tidak
  // meledak dan biaya token tetap wajar.
  const riwayatMentah = Array.isArray(body?.riwayat) ? body.riwayat : [];
  const riwayat = riwayatMentah
    .slice(-12)
    .map((r) => ({
      role: r?.role === 'ai' ? 'assistant' : 'user',
      content: String(r?.isi || '').slice(0, 4000),
    }))
    .filter((r) => r.content);

  let instruksi = '';
  if (idPintasan) {
    const p = PINTASAN.find((x) => x.id === idPintasan);
    if (!p) return json({ ok: false, error: 'Pintasan tidak dikenal.' }, 400);
    instruksi = p.tanya;
  } else if (tanyaBebas) {
    instruksi = tanyaBebas;
  } else {
    return json({ ok: false, error: 'Kirim salah satu: pintasan atau tanya.' }, 400);
  }

  const snap = await getLatestSnapshot();
  if (!snap) {
    return json({
      ok: false,
      error: 'Belum ada snapshot dari bot. Pastikan bot online dan bridge aktif.',
    }, 400);
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
      db.execute('SELECT action, status, result, created_at FROM bot_commands ORDER BY created_at DESC LIMIT 200'),
      db.execute('SELECT kind, message, page, created_at FROM web_feedback ORDER BY created_at DESC LIMIT 60'),
      getSnapshotSeries(7),
    ]);
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
      })),
      series: Array.isArray(series) ? series : [],
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

  const konteks = susunKonteks(snap, panel) + konteksPemain;

  // Tandai jenis tugas supaya AI tahu apakah harus menjawab SINGKAT (chat
  // bebas) atau boleh menyusun analisis tiga bagian (tombol pintas).
  // Ini yang mencegah jawaban bercabang saat pemilik bertanya hal spesifik.
  const penandaTugas = idPintasan
    ? 'PERMINTAAN ANALISIS MENYELURUH. Pakai format TEMUAN / SARAN / RISIKO.'
    : 'PERTANYAAN LANGSUNG. Jawab persis yang ditanyakan, singkat, tanpa judul bagian (kecuali pertanyaannya memang minta analisis).';

  // SUSUNAN PESAN (chat 2 arah):
  //   system  -> aturan main
  //   user    -> DATA (sekali, di awal - supaya AI selalu punya acuan angka)
  //   ...riwayat pertukaran sebelumnya (user/assistant bergantian)...
  //   user    -> pertanyaan terbaru
  //
  // Data diletakkan di AWAL, bukan diulang tiap giliran: AI tetap bisa
  // merujuknya sepanjang percakapan, dan token tidak membengkak.
  const pesan = [
    { role: 'system', content: sistemPrompt() },
    { role: 'user', content: 'DATA SNAPSHOT BOT:\n\n' + konteks },
    ...riwayat,
    { role: 'user', content: penandaTugas + '\n\nPERTANYAAN: ' + instruksi },
  ];

  const hasil = await tanyaGroq(pesan);
  if (!hasil.ok) {
    return json({
      ok: false,
      error: hasil.error,
      modelDipaka: hasil.model,
      // Kode 429 = semua kunci kena limit. Pesan ini membantu admin tahu
      // harus menunggu, bukan mengira kodenya rusak.
      kode: hasil.kode,
      petunjuk: hasil.kode === 429
        ? 'Semua kunci Groq kena batas kuota. Tunggu sebentar atau tambah kunci di GROQ_API_KEY.'
        : undefined,
    }, 502);
  }

  return json({
    ok: true,
    jawaban: hasil.teks,
    model: modelGroq(),
    kunciDipakai: hasil.kunciDipakai,
    totalKunci: jumlahKunci(),
    ukuranKonteks: konteks.length,
  });
}

// GET /api/admin/ai - status kesiapan (dipakai panel untuk menampilkan
// "AI siap dipakai" atau peringatan konfigurasi, tanpa memanggil Groq).
export async function GET() {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  return json({
    ok: true,
    aktif: adaGroq(),
    jumlahKunci: jumlahKunci(),
    model: modelGroq(),
    pintasan: PINTASAN.map((p) => ({ id: p.id, label: p.label })),
  });
}
