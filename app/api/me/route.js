import { getSession } from '../../lib/session';
import { getDb, schemaReady } from '../../lib/db';
import { sisipNotif } from '../../lib/notif';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ==========================================
// OPTIMASI EGRESS 2026-10-05: THROTTLE WRITE PER USER
// ==========================================
// MASALAH: /api/me di-poll tiap 15-20 dtk oleh Navbar + MeClient + halaman
// lain. Tiap request = 15 query, TERMASUK WRITE yang tidak berubah:
//   - UPDATE users SET username/avatar (identitas jarang berubah)
//   - sync emoji_registry (SELECT+INSERT/UPDATE per emoji - admin title)
//   - cek transisi premium (was_premium) - hanya perlu saat status berubah
//
// Dalam sehari dengan 1 user membuka tab 8 jam: ~1.900 request x 15 query =
// 28.500 query (mayoritas WRITE yang sama berulang). Egress + IOPS terbuang.
//
// SOLUSI: throttle per user (di memori proses Vercel - instance-level):
//   - WRITE (identitas + emoji sync + transisi premium): maks 1x / 3 MENIT
//     per user. Cukup segar untuk perubahan (avatar/username jarang berubah,
//     premium transisi ditangkap <=3 menit) tanpa menulis tiap poll.
//   - BACA (data_requests + auto-segar): tetap tiap request (murah, indexed).
//
// PENTING: instance Vercel bisa lebih dari satu, jadi throttle ini per
// instance - worst case beberapa write ekstra antar instance, tapi tetap
// memangkas mayoritas (1 instance = 1 user poll berurutan).
const WRITE_THROTTLE_MS = 3 * 60_000;
const _lastWrite = new Map(); // discordId -> ts

function bolehMenulis(userId) {
  const now = Date.now();
  const last = _lastWrite.get(userId) || 0;
  if (now - last < WRITE_THROTTLE_MS) return false;
  _lastWrite.set(userId, now);
  // Jaga map tidak tumbuh tanpa batas (user lama jarang kembali).
  if (_lastWrite.size > 5000) {
    for (const [k, v] of _lastWrite) {
      if (now - v > WRITE_THROTTLE_MS) _lastWrite.delete(k);
    }
  }
  return true;
}

// GET /api/me - session + data_requests terakhir yang filled.
// Termasuk SIKLUS LANGGANAN: notif AKTIF sekali saat premium mulai, notif
// "berakhir" saat expired (flag users.was_premium). Identitas users row juga
// disegarkan dari profil bot terbaru (nama & avatar ikut Discord).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false }, { status: 200 });

  await schemaReady();
  const db = getDb();

  const res = await db.execute({
    sql: "SELECT id, status, data, filled_at FROM data_requests WHERE discord_id = ? AND status = 'done' ORDER BY filled_at DESC LIMIT 1",
    args: [session.discordId],
  });

  let profile = null;
  if (res.rows.length) {
    try { profile = JSON.parse(res.rows[0].data); } catch { profile = null; }

    // BLOK WRITE (identitas + emoji sync + transisi premium) - THROTTLED
    // 1x/3 menit per user. Baca profil di atas tetap tiap request.
    if (profile?.exists && profile?.profile && bolehMenulis(session.discordId)) {
      await db.execute({
        sql: 'UPDATE users SET username = ?, avatar = COALESCE(?, avatar) WHERE discord_id = ?',
        args: [profile.profile.username, profile.profile.avatarUrl, session.discordId],
      });

      // Sinkron emoji_registry (catatan emoji dinamis admin title):
      // emoji yang MUNCUL di parts -> UPSERT (seen_at=now);
      // emoji registry aktif yang TIDAK lagi muncul -> set removed_at.
      try {
        const parts = profile.profile.adminTitleInfo?.parts || [];
        const active = new Set();
        for (const part of parts) {
          if (!part.emojiUrl) continue;
          const mid = /(\d{15,25})/.exec(part.emojiUrl);
          const name = /<(a)?:([A-Za-z0-9_]+):(\d+)>/.exec(part.emoji || '')?.[2] || null;
          if (!mid) continue;
          active.add(mid[1]);
          const exists = await db.execute({
            sql: 'SELECT id FROM emoji_registry WHERE discord_id = ? AND kind = ? AND emoji_id = ? LIMIT 1',
            args: [session.discordId, 'admin_title', mid[1]],
          });
          if (exists.rows.length) {
            await db.execute({
              sql: 'UPDATE emoji_registry SET seen_at = ?, removed_at = NULL WHERE id = ?',
              args: [Date.now(), Number(exists.rows[0].id)],
            });
          } else {
            await db.execute({
              sql: 'INSERT INTO emoji_registry (discord_id, kind, emoji_name, emoji_id, emoji_url, seen_at) VALUES (?, ?, ?, ?, ?, ?)',
              args: [session.discordId, 'admin_title', name, mid[1], part.emojiUrl, Date.now()],
            });
          }
        }
        const known = await db.execute({
          sql: "SELECT id, emoji_id FROM emoji_registry WHERE discord_id = ? AND removed_at IS NULL",
          args: [session.discordId],
        });
        for (const row of known.rows) {
          if (!active.has(String(row.emoji_id))) {
            await db.execute({
              sql: 'UPDATE emoji_registry SET removed_at = ? WHERE id = ?',
              args: [Date.now(), Number(row.id)],
            });
          }
        }
      } catch {}

      // SIKLUS LANGGANAN
      const userRow = await db.execute({
        sql: 'SELECT was_premium FROM users WHERE discord_id = ?',
        args: [session.discordId],
      });
      const wasPremium = Number(userRow.rows[0]?.was_premium || 0) === 1;
      const isPremium = Boolean(profile.profile.premium);
      const now = Date.now();

      // TRANSISI ATOMIK (fix 2026-09-14): dulu dua request /api/me yang
      // bersamaan (profil + auto-refresh + poll) sama-sama membaca was_premium
      // LAMA lalu dua-duanya menulis notif -> notif DOBEL/TRIPLE (terbukti di
      // data: 2 notif identik di detik yang sama). Sekarang UPDATE dulu dengan
      // syarat nilai lama; hanya pemenang UPDATE yang menulis notifikasi.
      if (isPremium && !wasPremium) {
        const flip = await db.execute({
          sql: 'UPDATE users SET was_premium = 1 WHERE discord_id = ? AND (was_premium IS NULL OR was_premium = 0)',
          args: [session.discordId],
        });
        if (flip.rowsAffected > 0) {
          await sisipNotif({ userId: session.discordId, type: 'event', title: 'NEXO Pass kamu AKTIF!', body: 'Semua perk premium sudah jalan in-game: inventori unlimited, bonus kuota, dan prioritas render.', db });
        }
      } else if (!isPremium && wasPremium) {
        const flip = await db.execute({
          sql: 'UPDATE users SET was_premium = 0 WHERE discord_id = ? AND was_premium = 1',
          args: [session.discordId],
        });
        if (flip.rowsAffected > 0) {
          await sisipNotif({ userId: session.discordId, type: 'info', title: 'Langganan NEXO Pass berakhir', body: 'Inventori kembali dibatasi 5 unit per item. Aktifkan lagi kapan saja di halaman Premium.', db });
          // Siklus langganan langkah 4: satu pengingat "aktifkan lagi" (event).
          await sisipNotif({ userId: session.discordId, type: 'event', title: 'Aktifkan lagi NEXO Pass', body: 'Beli ulang kapan saja - Rp 20.000/bulan, semua perk balik lagi.', db });
        }
      }
    }
  }

  // Auto-segar: data >60 detik dianggap basi -> antrekan permintaan baru
  // (bot poll tiap 15 detik, jadi <=30 dtk web dapat keadaan TERBARU -
  // termasuk premium yang tiba-tiba dicabut/dihapus role-nya di bot).
  try {
    const lastFilled = res.rows.length ? Number(res.rows[0].filled_at || 0) : 0;
    const stale = Date.now() - lastFilled > 60_000;
    if (stale) {
      const inFlight = await db.execute({
        sql: "SELECT 1 as x FROM data_requests WHERE discord_id = ? AND status = 'pending' LIMIT 1",
        args: [session.discordId],
      });
      if (!inFlight.rows.length) {
        await db.execute({
          sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
          args: [session.discordId, Date.now()],
        });
      }
    }
  } catch {}

  return NextResponse.json({
    authenticated: true,
    user: session,
    profile,
  });
}
