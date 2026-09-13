// Helper khusus WelcomeBack: ambil profil user dari data_requests terakhir.
// Return null kalau belum ada / error - kartu tetap tampil tanpa angka.
import { getDb, schemaReady } from './db';

export async function getSessionProfile() {
  try {
    // dipanggil dari server component setelah session divalidasi
    const { getSession } = await import('./session');
    const session = await getSession();
    if (!session) return null;

    await schemaReady();
    const db = getDb();
    const res = await db.execute({
      sql: "SELECT data FROM data_requests WHERE discord_id = ? AND status = 'done' ORDER BY filled_at DESC LIMIT 1",
      args: [session.discordId],
    });
    if (!res.rows.length) return null;
    const parsed = JSON.parse(res.rows[0].data);
    if (!parsed?.exists) return null;
    return parsed.profile;
  } catch {
    return null;
  }
}
