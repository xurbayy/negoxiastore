// Avatar user: pakai avatar_url asli kalau ada, kalau tidak pakai avatar
// DEFAULT Discord (nomor 0-5 dari user_id). Ini menghindari gambar kosong /
// inisial generik untuk 200+ pemain yang avatar_url-nya belum tersinkron bot.
//
// Discord menentukan default avatar dari `(snowflake >> 22) % 6`. Kita tiru
// rumus itu supaya konsisten dengan yang dilihat pemain di Discord.
export function avatarUser(userId, avatarUrl, size = 64) {
  if (avatarUrl) {
    // Normalisasi ukuran supaya konsisten (beberapa URL lama tanpa ?size).
    const base = String(avatarUrl).split('?')[0];
    return `${base}?size=${size}`;
  }
  const id = String(userId || '');
  let idx = 0;
  try {
    idx = Number((BigInt(id) >> 22n) % 6n);
  } catch { idx = 0; }
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}
