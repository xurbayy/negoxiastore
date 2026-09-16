import { getSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { getLatestSnapshot } from '../../../lib/snapshot';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/me/notifications
// Gabungan 2 sumber (urut terbaru dulu):
//   1. PERSONAL  : tabel web_notifications (discord_id = user ATAU NULL = broadcast)
//   2. TURUNAN   : di-compute dari snapshot terakhir (flash sale, broadcast
//                  nxadmin, promo shop, kode redeem yang belum diklaim user)
// Derived id format "d:<jenis>:<kunci>". Penutupannya PERMANEN di DB per user
// (tabel web_notif_dismiss) - bukan localStorage. Sudah ditutup = tidak muncul
// lagi walau ganti perangkat / bot-web restart; isi baru (key beda) tetap muncul.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: true, notifications: [], unreadCount: 0 }, { status: 200 });

  await schemaReady();
  const db = getDb();
  const now = Date.now();

  // Sumber 1: personal + broadcast. Broadcast (discord_id NULL) punya
  // penanda read PER USER di notif_reads (audit B1) - satu orang klik dibaca
  // tidak boleh mematikan broadcast untuk semua orang.
  const rows = await db.execute({
    sql: `SELECT n.id, n.type, n.title, n.body, n.code, n.created_at,
                 CASE WHEN n.discord_id IS NULL THEN r.read_at ELSE n.read_at END AS read_at
          FROM web_notifications n
          LEFT JOIN notif_reads r ON r.notification_id = n.id AND r.discord_id = ?
          WHERE n.discord_id = ? OR n.discord_id IS NULL
          ORDER BY n.created_at DESC LIMIT 50`,
    args: [session.discordId, session.discordId],
  });
  const notifications = rows.rows.map((r) => ({
    id: 'p:' + r.id,
    type: r.type,
    title: r.title,
    body: r.body || '',
    code: r.code || null,
    createdAt: Number(r.created_at),
    read: r.read_at != null,
  }));

  // Sumber 2: turunan dari snapshot. Key yang PERNAH ditutup user dibuang
  // permanen (DB) -> restart bot/web/ganti perangkat tidak menghidupkannya lagi.
  const dismissed = new Set();
  try {
    const dm = await db.execute({
      sql: 'SELECT key FROM web_notif_dismiss WHERE discord_id = ?',
      args: [session.discordId],
    });
    for (const r of dm.rows) dismissed.add(String(r.key));
  } catch {}
  // Kunci turunan menyertai identitas isinya: kalau admin memasang pengumuman
  // BARU (teks beda) atau flash sale baru (expiry beda), key-nya beda -> notif
  // hidup lagi. Yang disenyapkan cuma persis notif yang sama.
  const contentHash = (s) => {
    let h = 5381;
    const str = String(s);
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  const snap = await getLatestSnapshot();
  if (snap) {
    // a) Flash sale aktif
    for (const fs of snap.flashSales || []) {
      const did = `d:flash:${fs.itemKey}:${Number(fs.expiresAt)}`;
      if (Number(fs.expiresAt) > now && !dismissed.has(did)) {
        notifications.push({
          id: did,
          type: 'event',
          title: `FLASH SALE: ${fs.itemKey}`,
          body: `Harga turun dari ${Number(fs.originalPrice).toLocaleString('id-ID')} jadi ${Number(fs.discountPrice ?? 0).toLocaleString('id-ID')} poin!`,
          link: '/shop',
          expiresAt: Number(fs.expiresAt),
          createdAt: now,
          read: false,
        });
      }
    }
    // b) Broadcast nxadmin
    if (snap.announcements?.global) {
      const did = `d:ann:global:${contentHash(snap.announcements.global)}`;
      if (!dismissed.has(did)) {
        notifications.push({
          id: did,
          type: 'info',
          title: 'Pengumuman',
          body: String(snap.announcements.global),
          createdAt: now,
          read: false,
        });
      }
    }
    // c) Banner shop / promo toko
    if (snap.announcements?.shop) {
      const did = `d:ann:shop:${contentHash(snap.announcements.shop)}`;
      if (!dismissed.has(did)) {
        notifications.push({
          id: did,
          type: 'event',
          title: 'Promo Toko',
          body: String(snap.announcements.shop),
          link: '/shop',
          createdAt: now,
          read: false,
        });
      }
    }
    // d) Kode redeem belum diklaim user.
    //
    // PENTING (perbaikan 2026-09-16): sumbernya web_promo_cache - BUKAN
    // snap.promoCodes. Dulu notif diambil dari snapshot push bot (tiap 60 dtk),
    // sedangkan claim divalidasi dari cache. Akibatnya ada JENDELA ~60 detik
    // saat admin baru menghapus kode: notif masih tampil ("kode tersedia"),
    // user klik, tapi bot sudah tidak punya kodenya -> user kecewa karena
    // ditolak padahal baru lihat notifnya.
    //
    // Sekarang keduanya memakai sumber yang SAMA (cache), dan cache ditandai
    // exhausted=1 begitu kode hilang dari daftar bot. Jadi notif dan tombol
    // claim selalu sejalan - tidak mungkin "ada di notif tapi sudah tidak bisa".
    const claimed = await db.execute({
      sql: "SELECT code FROM web_redeem_claims WHERE discord_id = ? AND status != 'failed'",
      args: [session.discordId],
    });
    const claimedSet = new Set(claimed.rows.map((r) => String(r.code).toUpperCase()));
    const cacheRows = await db.execute(
      'SELECT code, rewardType, rewardValue, quota, reserved, exhausted FROM web_promo_cache'
    );
    for (const c of cacheRows.rows) {
      const code = String(c.code).toUpperCase();
      const did = `d:code:${code}`;
      if (claimedSet.has(code) || dismissed.has(did)) continue;
      if (Number(c.exhausted) === 1) continue;
      const remaining = Math.max(0, Number(c.quota) - Number(c.reserved));
      if (remaining <= 0) continue;
      const reward = c.rewardType === 'points'
        ? `${Number(c.rewardValue).toLocaleString('id-ID')} poin`
        : c.rewardType === 'item'
          ? `item ${c.rewardValue}`
          : String(c.rewardValue);
      notifications.push({
        id: did,
        type: 'token',
        title: `Kode ${code} tersedia untukmu`,
        body: `Hadiah: ${reward} · sisa ${remaining}/${Number(c.quota)}`,
        code,
        link: '/redeem',
        createdAt: now,
        read: false,
      });
    }
  }

  notifications.sort((a, b) => b.createdAt - a.createdAt);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ ok: true, notifications, unreadCount });
}
