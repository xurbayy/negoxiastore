import { getSession } from '../../lib/session';
import { getDb, schemaReady } from '../../lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

    // Identitas selalu terbaru: samakan row users dengan profil terbaru dari bot
    if (profile?.exists && profile?.profile) {
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
          await db.execute({
            sql: "INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (?, 'event', ?, ?, ?)",
            args: [
              session.discordId,
              'NEXO Pass kamu AKTIF!',
              'Semua perk premium sudah jalan in-game: inventori unlimited, bonus kuota, dan prioritas render.',
              now,
            ],
          });
        }
      } else if (!isPremium && wasPremium) {
        const flip = await db.execute({
          sql: 'UPDATE users SET was_premium = 0 WHERE discord_id = ? AND was_premium = 1',
          args: [session.discordId],
        });
        if (flip.rowsAffected > 0) {
          await db.execute({
            sql: "INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (?, 'info', ?, ?, ?)",
            args: [
              session.discordId,
              'Langganan NEXO Pass berakhir',
              'Inventori kembali dibatasi 5 unit per item. Aktifkan lagi kapan saja di halaman Premium.',
              now,
            ],
          });
          // Siklus langganan langkah 4: satu pengingat "aktifkan lagi" (event).
          await db.execute({
            sql: "INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (?, 'event', ?, ?, ?)",
            args: [
              session.discordId,
              'Aktifkan lagi NEXO Pass',
              'Beli ulang kapan saja - Rp 20.000/bulan, semua perk balik lagi.',
              now + 1,
            ],
          });
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
