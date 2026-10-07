import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { getLatestSnapshot } from '../../../../lib/snapshot';
import { saranDinamis, SARAN_DISKUSI, susunKonteks } from '../../../../lib/aiKonteks';
import { tanyaGroq } from '../../../../lib/groq';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';
// FIX 2026-10-06: AI generate bisa butuh >10 dtk (baca snapshot + 1 request
// LLM). Tanpa maxDuration, fungsi dipotong di tengah -> klien dapat error
// koneksi dan UI "seolah tidak refresh". Naikkan batas durasi.
export const maxDuration = 60;

// ==========================================
// /api/admin/ai/saran - saran pertanyaan untuk kartu panel
// ==========================================
//
// PRIORITAS (permintaan pemilik 2026-10-02): saran DIAMBIL DARI HASIL AGEN
// (ai_agen_saran) - jadi benar-benar berbasis cek agen (kode + data), bukan
// daftar statis. Kalau agen belum pernah jalan, pakai saran dinamis dari
// snapshot, lalu fallback statis.
//
// GET            -> saran peran 'umum' (untuk mode diskusi biasa)
// GET ?peran=bug -> saran khusus peran itu (dari agen)
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

export async function GET(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const peran = (url.searchParams.get('peran') || 'umum').trim().toLowerCase();
  // segar=1: bypass saran agen, pakai snapshot real-time.
  const segar = url.searchParams.get('segar') === '1';
  // ai=1: MINTA AI GENERATE saran (paling relevan, tapi pakai token + delay).
  const mintaAI = url.searchParams.get('ai') === '1';
  const provider = url.searchParams.get('provider') || undefined;
  const model = url.searchParams.get('model') || undefined;

  // 0) AI GENERATE saran dari kondisi terkini (paling relevan).
  //
  // FIX 2026-10-06 (laporan pemilik: "udah gw pake AI kok tetep ga refresh"):
  //   Dulu kalau AI gagal (model error/timeout/balasan kosong), route ini
  //   DIAM-DIAM lanjut ke fallback dan tetap balas { ok: true, sumber: 'snapshot' }
  //   berisi saran LAMA. Frontend lihat ok=true -> pasang saran lama -> tag
  //   "tidak refresh" TANPA pesan error apa pun, dan user tidak tahu AI gagal.
  //   Sekarang: kalau mintaAI=1 tapi AI gagal, balas ok:false + alasan asli
  //   supaya UI bisa bilang kenapa (dan user bisa ganti model / coba lagi).
  if (mintaAI) {
    let alasan = 'AI tidak menghasilkan topik.';
    try {
      const snap = await getLatestSnapshot();
      if (!snap) {
        alasan = 'Data snapshot belum tersedia - jalankan bot dulu supaya data terkirim.';
      } else {
        // FIX 2026-10-07: konteks DIPANGKAS untuk "Cari topik AI" (batasChar 8000).
        // Tugas ini cuma butuh gambaran umum untuk 8 pertanyaan - konteks penuh
        // (20.000 char ~ 5000 token) bikin respons 30-60 dtk (mepet timeout 60s
        // Vercel, kadang gagal). 8000 char ~ 2000 token jauh lebih cepat dan
        // bagian depan (ringkasan, server, game, toko) tetap lengkap.
        const konteks = await susunKonteks(snap, {}, { ringkas: true, batasChar: 8000 });
        const hasil = await tanyaGroq([
          { role: 'system', content: 'Kamu asisten analisis NEXO. Tugas: usulkan pertanyaan analisis PALING relevan dengan kondisi data saat ini. Bahasa Indonesia santai.' },
          { role: 'user', content: 'DATA NEXO SAAT INI:\n\n' + konteks },
          { role: 'user', content: [
            'Berdasarkan data di atas, usulkan 8 PERTANYAAN analisis yang PALING relevan',
            'dan MENDESAK untuk pemilik bot saat ini. Fokus ke masalah nyata yang terlihat di data',
            '(server kosong, churn, item mati, anomali ekonomi, pola mencurigakan, dll).',
            '',
            'Format WAJIB - tepat 8 baris, tiap baris satu pertanyaan, tanpa nomor/bullet:',
            'Pertanyaan1?',
            'Pertanyaan2?',
            '...',
            '',
            'Aturan: maksimal 70 karakter per pertanyaan. Langsung ke inti. Jangan umum/basi.',
          ].join('\n') },
        ], {
          provider, model,
          // FIX 2026-10-07 ("Cari topik AI gagal"): dulu maxTokens 700 + thinking
          // 'low' -> untuk model reasoning, 700 token sering HABIS di "berpikir"
          // (finish_reason=length, content kosong) DAN waktu respons sampai
          // 57,5 dtk (mepet batas 60 dtk Vercel -> kadang timeout -> browser
          // dapat respons non-JSON -> UI tampil "tidak ada alasan dari server").
          // Diuji 4 variasi dengan konteks asli: 2000 token + 'minimal' =
          // 9,1 dtk dengan 8 baris valid (6x lebih cepat, jauh dari batas).
          //
          // TIMEOUT 25 dtk (bukan 60): provider kadang lambat mendadak (uji
          // live: 1 dari 3 request kena 60 dtk = fungsi Vercel dipotong, tanpa
          // kesempatan retry). Dengan 25 dtk, request lambat DIBATALKAN lebih
          // awal -> tanyaGroq masih sempat retry kunci berikutnya / jalur error
          // rapi sebelum Vercel memotong di 60 dtk.
          maxTokens: 2000,
          thinking: 'minimal',
          timeoutMs: 25000,
        });
        if (hasil.ok && hasil.teks) {
          // Parser TOLERAN (FIX 2026-10-07): model kadang menulis "1. ..." atau
          // "* ..." atau baris tanpa "?" di akhir. Dulu filter WAJIB endsWith('?')
          // -> jawaban yang isinya bagus ikut dibuang ("format tidak sesuai").
          // Sekarang: buang prefix nomor/bullet, terima baris panjang yang
          // mengandung tanda tanya ATAU minimal 15 karakter (pertanyaan jelas),
          // tambahkan '?' kalau belum ada.
          const baris = String(hasil.teks)
            .split('\n')
            .map((s) => s.replace(/^\s*[-*•\d.)\]]+\s*/, '').replace(/\*\*/g, '').trim())
            .filter((s) => s.length > 12 && (s.includes('?') || s.length >= 15))
            .map((s) => (s.endsWith('?') ? s : s + '?'))
            .slice(0, 8);
          if (baris.length >= 3) {
            // FIX 2026-10-06: ID saran AI dibuat UNIK per generate (cap waktu).
            // Dulu id selalu 'ai-0'..'ai-7' - kalau user pernah dismiss tag
            // (saranDismiss di localStorage menyimpan id), hasil generate BARU
            // dengan id yang sama langsung ikut tersembunyi = "ga refresh".
            const cap = Date.now().toString(36);
            return json({
              ok: true,
              sumber: 'ai',
              saran: baris.map((s, i) => ({ id: `ai-${cap}-${i}`, label: s.slice(0, 70), tanya: s, sumber: 'ai' })),
            });
          }
          alasan = 'AI menjawab tapi formatnya tidak sesuai (bukan daftar pertanyaan). Coba model lain.';
        } else {
          alasan = hasil?.error || 'AI tidak merespons. Cek koneksi provider / kuota model.';
        }
      }
    } catch (e) {
      alasan = e?.message || 'Gagal memanggil AI.';
    }
    // JUJUR: jangan fallback senyap. UI akan menampilkan alasan ini.
    return json({ ok: false, error: alasan, sumber: 'gagal-ai' }, 200);
  }

  // 1) SARAN DARI AGEN (hasil cek agen sebelumnya) - HANYA kalau masih BARU.
  //
  // FIX 2026-10-06 (laporan pemilik: "kenapa sarannya ga sesuai"): dulu saran
  // agen selalu menang terlepas dari umurnya - padahal agen terakhir jalan 4
  // hari lalu (02 Okt), jadi saran seperti "24 server kosong" / "69 pemain
  // belum main" merujuk kondisi LAMA yang sudah berubah. Sekarang saran agen
  // hanya dipakai kalau maksimal 48 JAM - kalau lebih tua, pakai snapshot
  // segar (real-time) atau statis.
  if (!segar) {
    try {
      await schemaReady();
      const db = getDb();
      const r = await db.execute({
        sql: 'SELECT saran, dibuat_at FROM ai_agen_saran WHERE peran = ? ORDER BY dibuat_at DESC LIMIT 8',
        args: [peran],
      });
      const rows = (r.rows || []).filter((x) => {
        const ts = Number(x.dibuat_at || 0);
        return ts > 0 && Date.now() - ts < 48 * 3600 * 1000; // < 48 jam
      });
      const dariAgen = rows.map((x, i) => ({
        id: `agen-${peran}-${i}`,
        label: String(x.saran).slice(0, 60),
        tanya: String(x.saran),
        sumber: 'agen',
      }));
      if (dariAgen.length) return json({ ok: true, saran: dariAgen, sumber: 'agen' });
    } catch { /* lanjut ke fallback */ }
  }

  // 2) SARAN DINAMIS dari snapshot (real-time) - termasuk mode segar.
  //    Dipakai kalau agen basi/tidak ada -> saran dihitung dari data segar.
  try {
    const snap = await getLatestSnapshot();
    const saran = saranDinamis(snap).map((s) => ({ id: s.id, label: s.label, tanya: s.tanya, sumber: 'snapshot' }));
    if (saran.length) return json({ ok: true, saran, sumber: segar ? 'snapshot-segar' : 'snapshot' });
  } catch { /* lanjut */ }

  // 3) Fallback terakhir: statis.
  return json({
    ok: true,
    sumber: 'statis',
    saran: SARAN_DISKUSI.map((s) => ({ id: s.id, label: s.label, tanya: s.tanya, sumber: 'statis' })),
  });
}
