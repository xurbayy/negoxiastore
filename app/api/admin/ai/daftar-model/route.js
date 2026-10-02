import { getSession, getAdminSession } from '../../../../lib/session';
import { daftarModelProvider, infoProviderLengkap } from '../../../../lib/groq';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/daftar-model - daftar model provider (+ tandai gratis)
// ==========================================
//
// Permintaan pemilik 2026-10-02: "kalo gw nambahin providernya terus bakal
// muncul semua nama modelnya yang free saja".
//
// GET ?provider=<slug>&gratis=1  -> hanya model gratis dari SATU provider
// GET ?semua=1&gratis=1          -> model dari SEMUA provider (permintaan baru:
//                                   "gw mau liat semua model ai dari semua
//                                   provider, lengkap yang free")
//   -> { ok, models[] } (tiap model punya field `provider`/`providerLabel`)
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
  const hanyaGratis = url.searchParams.get('gratis') === '1';

  // ---- MODE SEMUA PROVIDER ----
  if (url.searchParams.get('semua') === '1') {
    const info = await infoProviderLengkap();
    // Provider yang punya kunci (bawaan + kustom).
    const daftar = (info.tersedia || []).filter((p) => Number(p.kunci) > 0);
    const hasil = await Promise.all(daftar.map(async (p) => {
      try {
        const r = await daftarModelProvider(p.id);
        if (!r.ok) return { provider: p.id, providerLabel: p.label, models: [], error: r.error };
        const m = hanyaGratis ? (r.gratis || []) : (r.semua || []);
        return {
          provider: p.id,
          providerLabel: p.label,
          jumlah: r.jumlah,
          jumlahGratis: r.jumlahGratis,
          bisaPastikan: r.bisaPastikan,
          models: m.slice(0, 300).map((x) => ({ ...x, providerId: p.id, providerLabel: p.label })),
        };
      } catch (e) {
        return { provider: p.id, providerLabel: p.label, models: [], error: e?.message || String(e) };
      }
    }));
    const semua = hasil.flatMap((h) => h.models || []);
    return json({ ok: true, perProvider: hasil, models: semua, jumlah: semua.length });
  }

  // ---- MODE SATU PROVIDER ----
  const provider = url.searchParams.get('provider') || '';
  const hasil = await daftarModelProvider(provider);
  if (!hasil.ok) return json(hasil);
  const kirim = hanyaGratis ? hasil.gratis.slice(0, 300) : (hasil.semua || []).slice(0, 300);
  return json({
    ok: true,
    label: hasil.label,
    urlDicek: hasil.urlDicek,
    jumlah: hasil.jumlah,
    jumlahGratis: hasil.jumlahGratis,
    models: kirim,
  });
}
