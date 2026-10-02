import { getLatestSnapshot } from '../../lib/snapshot';
import { json } from '../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/snapshot-umur - waktu data bot terakhir
// ==========================================
//
// Dipakai indikator "Diperbarui ..." di web supaya menampilkan KAPAN BOT
// MENGIRIM DATA (bukan kapan browser refresh). Ringan: hanya ts + umur detik,
// tanpa memuat isi snapshot penuh.
export async function GET() {
  try {
    const snap = await getLatestSnapshot();
    if (!snap?.ts) return json({ ok: true, ada: false });
    return json({ ok: true, ada: true, ts: Number(snap.ts), umurDetik: Math.max(0, Math.round((Date.now() - Number(snap.ts)) / 1000)) });
  } catch {
    return json({ ok: false, ada: false });
  }
}
