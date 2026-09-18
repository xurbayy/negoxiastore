import { getSession } from '../../lib/session';
import { getDb, schemaReady } from '../../lib/db';
import { getLatestSnapshot } from '../../lib/snapshot';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/notifications - kode redeem aktif yang BELUM diklaim user ini.
// Sumber: promoCodes dari snapshot bot terakhir (jadi otomatis muncul begitu
// admin/bot membuat kode baru, paling lambat 1 menit setelah push berikutnya).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: true, notifications: [] });

  // Endpoint ini dipanggil tiap halaman dibuka. Kalau DB/snapshot bermasalah,
  // balas daftar kosong (bukan 500) supaya UI tidak ikut error - notifikasi
  // memang pelengkap, bukan data kritis.
  try {
    await schemaReady();
    const db = getDb();
    const snap = await getLatestSnapshot();
    const promoCodes = snap?.promoCodes || [];

    if (!promoCodes.length) {
      return NextResponse.json({ ok: true, notifications: [] });
    }

    // Kode yang sudah diklaim user ini -> jangan diberitahu lagi
    const claimed = await db.execute({
      sql: 'SELECT code FROM web_redeem_claims WHERE discord_id = ?',
      args: [session.discordId],
    });
    const claimedSet = new Set(claimed.rows.map((r) => String(r.code).toUpperCase()));

    const notifications = promoCodes
      .filter((p) => {
        const code = String(p.code).toUpperCase();
        if (claimedSet.has(code)) return false;
        return Number(p.claimed) < Number(p.quota); // masih ada kuota
      })
      .map((p) => ({
        code: String(p.code).toUpperCase(),
        rewardType: p.rewardType,
        rewardValue: String(p.rewardValue),
        remaining: Math.max(0, Number(p.quota) - Number(p.claimed)),
        quota: Number(p.quota),
      }));

    return NextResponse.json({ ok: true, notifications });
  } catch (e) {
    console.error('[notifications] gagal memuat:', (e && e.message) || e);
    return NextResponse.json({ ok: true, notifications: [], degraded: true });
  }
}
