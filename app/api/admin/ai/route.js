import { getSession, getAdminSession } from '../../../lib/session';
import { getLatestSnapshot } from '../../../lib/snapshot';
import { susunKonteks, PINTASAN, ATURAN_FORMAT } from '../../../lib/aiKonteks';
import { tanyaGroq, adaGroq, jumlahKunci, modelGroq } from '../../../lib/groq';
import { json } from '../../../lib/api-helpers';

export const dynamic = 'force-dynamic';
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
function sistemPrompt() {
  return [
    'Kamu asisten analisis data untuk NEXO Games, bot Discord mini-games berbahasa Indonesia.',
    'Pemilik bot memakai jawabanmu untuk mengambil keputusan (promo, harga, konten, komunitas).',
    '',
    'ATURAN KERAS:',
    '1. HANYA pakai angka dari DATA yang diberikan. Jangan mengarang angka, item, atau game yang tidak ada di data.',
    '2. Kalau data kurang untuk menjawab, KATAKAN terus terang bagian mana yang kurang. Jangan menebak.',
    '3. Kalau suatu bagian datanya memang KOSONG (mis. Jumlah item: 0), laporkan apa adanya - jangan mengarang isinya.',
    '4. Setiap kesimpulan harus menyebut angka pendukungnya (mis. stok 10, terjual 0).',
    '5. Saran harus bisa dikerjakan: sebut item/game/nilainya persis, bukan saran umum.',
    '6. Jangan mengulang seluruh data mentah. Langsung ke temuan dan tindakan.',
    '',
    ATURAN_FORMAT,
    '',
    'Susun jawaban sebagai:',
    'TEMUAN: apa yang terlihat dari angka (2-5 poin)',
    'SARAN: langkah konkret + alasan angkanya',
    'RISIKO: hal yang bisa salah kalau saran dijalankan, kalau ada',
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

  const konteks = susunKonteks(snap);

  const pesan = [
    { role: 'system', content: sistemPrompt() },
    { role: 'user', content: 'DATA SNAPSHOT BOT:\n\n' + konteks },
    { role: 'user', content: 'TUGAS: ' + instruksi },
  ];

  const hasil = await tanyaGroq(pesan);
  if (!hasil.ok) {
    return json({
      ok: false,
      error: hasil.error,
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
