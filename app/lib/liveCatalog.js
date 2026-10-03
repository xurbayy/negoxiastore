// ==========================================
// app/lib/liveCatalog.js
// Katalog (shop, titles, misi) dibaca LANGSUNG dari database bot.
// ==========================================
// Sejak migrasi ke SATU database PostgreSQL (Supabase, 2026-10-03), web tidak
// lagi menunggu bot "push" katalog. Fungsi di sini query langsung ke tabel bot
// (public.shop_items, public.shop_discounts) + memakai katalog statis (titles,
// kategori, misi) yang DISALIN dari bot supaya bentuk hasilnya sama persis.
//
// CATATAN: kategori & daftar misi memang statis di bot (bukan tabel DB), jadi
// disalin di sini. Kalau bot mengubahnya, salinan ini perlu disesuaikan.
import { getDb, schemaReady } from './db';

// Kategori shop = PERSIS nxshop (label + emoji + warna + deskripsi).
export const SHOP_CATEGORIES = [
  { value: 'global', label: 'Global Boosters', emoji: '<a:globe:1516390212672946288>', description: 'VIP, Double Points & Daily Boost', color: '#5865F2' },
  { value: 'titles', label: 'Prestigious Titles', emoji: '<a:titles:1516365054134583306>', description: 'Gelar profil eksklusif permanen', color: '#E91E63' },
  { value: 'instant', label: 'Mystery & Instant', emoji: '<a:gift:1469193552256041043>', description: 'Mystery Box & tiket reset harian', color: '#9E9E9E' },
  { value: 'passive', label: 'Passive Buffs', emoji: '🧲', description: 'Item otomatis aktif (Magnet Poin)', color: '#795548' },
  { value: 'chemistry', label: 'Chemistry & Partner', emoji: '<a:chemistry:1517177922459402330>', description: 'Hadiah & item untuk Chemistry', color: '#FF4081' },
  { value: 'bet', label: 'Betting Protection', emoji: '<:shield:1516394055641075783>', description: 'Amulet & asuransi taruhan', color: '#FF9800' },
  { value: 'quiz', label: 'Quiz & Puzzle', emoji: '<a:brain:1516396687159988325>', description: 'Extra Life & Hint Token', color: '#9C27B0' },
  { value: 'arcade', label: 'Arcade & Cheat', emoji: '<:rps:1516405345000357948>', description: 'Item curang RPS, Coinflip, Numwar & Slot', color: '#00BCD4' },
  { value: 'timed', label: 'Racing & Timed', emoji: '<:racing:1516404055692414986>', description: 'Speed Boost & Nitro Racing', color: '#2196F3' },
  { value: 'blackjack', label: 'Blackjack', emoji: '<:blackjack:1519659727318024193>', description: 'Item curang Blackjack', color: '#E91E63' },
  { value: 'russianroulette', label: 'Russian Roulette', emoji: '<:rr:1519568573083811982>', description: 'Item bertahan hidup Russian Roulette', color: '#FF5722' },
  { value: 'musicalchairs', label: 'Musical Chairs', emoji: '<:chair:1519576885418393600>', description: 'Sabotase lawan di Musical Chairs', color: '#FFC107' },
  { value: 'board', label: 'Board Games', emoji: '<:monopoly:1516402431271899287>', description: 'Item Monopoly NEXO & Snakes & Ladders', color: '#009688' },
  { value: 'autochess', label: 'Auto Chess', emoji: '<:autochess:1516402800022786240>', description: 'Refresh Shop & Lucky Roll', color: '#673AB7' },
  { value: 'rpg', label: 'RPG Gear', emoji: '<:swords:1516394026507571280>', description: 'Potion & Elixir Boss Raid', color: '#F44336' },
  { value: 'bombsquad', label: 'Bomb Squad', emoji: '<:bombsquad:1517174856729493665>', description: 'Item & perk Bomb Squad', color: '#E91E63' },
  { value: 'bossraid', label: 'Boss Raid', emoji: '<:bossraid:1517175047477788845>', description: 'Item khusus Boss Raid', color: '#F44336' },
  { value: 'heist', label: 'The Heist', emoji: '<:heist:1517175515914436830>', description: 'Perk untuk Bank Heist', color: '#FFEB3B' },
  { value: 'dungeon', label: 'Dungeon Crawler', emoji: '<:dungeon:1519954384169996451>', description: 'Item & perk Dungeon Crawler', color: '#795548' },
  { value: 'zombiesurvival', label: 'Zombie Survival', emoji: '<:zombie:1517175779207807116>', description: 'Item Zombie Survival', color: '#8BC34A' },
];

// Kategori item = logika SAMA dengan bot (utils/webBridge.js _shopCategory).
function shopCategory(item) {
  if (['vip_bypass', 'multiplier', 'daily_boost'].includes(item.effect_type)) return 'global';
  if (['passive_boost'].includes(item.effect_type)) return 'passive';
  if (['random', 'daily_reset'].includes(item.effect_type)) return 'instant';
  if (['gift_chemistry', 'proposal', 'breakup'].includes(item.effect_type)) return 'chemistry';
  if (item.game_type === 'autochess') return 'autochess';
  if (['snakeladder', 'monopoly'].includes(item.game_type) || item.item_key === 'lucky_dice' || item.game_type === 'dice') return 'board';
  if (item.game_type === 'blackjack') return 'blackjack';
  if (item.game_type === 'russianroulette') return 'russianroulette';
  if (item.game_type === 'musicalchairs') return 'musicalchairs';
  if (item.game_type === 'bet') return 'bet';
  if (item.game_type === 'rpg') return 'rpg';
  if (item.game_type === 'bombsquad') return 'bombsquad';
  if (item.game_type === 'dungeon') return 'dungeon';
  if (item.game_type === 'bossraid') return 'bossraid';
  if (item.game_type === 'heist') return 'heist';
  if (item.game_type === 'zombiesurvival') return 'zombiesurvival';
  if (item.game_type === 'timed' || item.item_key === 'racing_nitro') return 'timed';
  if ((['quiz', 'solo', 'word', 'math', 'riddle'].includes(item.game_type) && !['jackpot'].includes(item.effect_type)) || ['hint', 'extra_life'].includes(item.effect_type)) return 'quiz';
  if (['rps', 'coinflip', 'numwar'].includes(item.game_type) || item.effect_type === 'jackpot') return 'arcade';
  if (item.game_type === 'solo' || ['jackpot'].includes(item.effect_type)) return 'arcade';
  return 'other';
}

// Ambil daftar emoji dari registry web (untuk emojiUrl) - opsional.
async function emojiUrlMap() {
  try {
    const db = getDb();
    const res = await db.execute('SELECT emoji_id, emoji_url FROM emoji_registry');
    const m = {};
    for (const r of res.rows) m[String(r.emoji_id)] = r.emoji_url;
    return m;
  } catch { return {}; }
}

function emojiUrl(emoji, map) {
  const m = String(emoji || '').match(/<a?:[A-Za-z0-9_]+:(\d+)>/);
  if (!m) return null;
  return map[m[1]] || null;
}

// SHOP ITEMS langsung dari DB bot.
export async function getLiveShop() {
  try {
    await schemaReady();
    const db = getDb();
    const [items, discounts, emap] = await Promise.all([
      db.execute('SELECT item_key, name, description, price, stock, game_type, effect_type, emoji, is_active FROM public.shop_items ORDER BY price ASC'),
      db.execute('SELECT item_key, discount_price, expires_at FROM public.shop_discounts WHERE expires_at > ?', [Date.now()]).catch(() => ({ rows: [] })),
      emojiUrlMap(),
    ]);
    const disc = {};
    for (const d of discounts.rows) disc[d.item_key] = Number(d.discount_price);

    return {
      shopItems: items.rows
        .filter((it) => Number(it.is_active ?? 1) !== 0)
        .map((it) => ({
          itemKey: it.item_key,
          name: it.name,
          description: it.description,
          price: Number(it.price || 0),
          stock: Number(it.stock ?? -1),
          gameType: it.game_type,
          emoji: it.emoji,
          emojiUrl: emojiUrl(it.emoji, emap),
          category: shopCategory(it),
          discountPrice: disc[it.item_key] || null,
        })),
      shopCategories: SHOP_CATEGORIES,
      discounts: discounts.rows.map((d) => ({ itemKey: d.item_key, discountPrice: Number(d.discount_price), expiresAt: Number(d.expires_at) })),
    };
  } catch {
    return null;
  }
}

// TITLES langsung dari DB bot (katalog statis bot + dimiliki user via user_titles).
export async function getLiveTitles() {
  try {
    await schemaReady();
    const db = getDb();
    const [rows, emap] = await Promise.all([
      db.execute('SELECT title_key, COUNT(*) AS owners FROM public.user_titles GROUP BY title_key').catch(() => ({ rows: [] })),
      emojiUrlMap(),
    ]);
    const owners = {};
    for (const r of rows.rows) owners[r.title_key] = Number(r.owners);
    return { owners, emojiMap: emap };
  } catch {
    return { owners: {}, emojiMap: {} };
  }
}

// ==========================================
// PROMO CODES + PENGUMUMAN LANGSUNG DARI DB BOT (2026-10-03)
// ==========================================
// Dulu web menunggu bot mengirim promoCodes/announcements lewat push.
// Sekarang dibaca langsung dari tabel bot: public.promo_codes + public.settings.

export async function getLivePromos() {
  try {
    await schemaReady();
    const db = getDb();
    const res = await db.execute(
      `SELECT code, reward_type, reward_value, quota, claimed_count
         FROM public.promo_codes
        WHERE claimed_count < quota
        ORDER BY code ASC`
    );
    return res.rows.map((r) => ({
      code: r.code,
      rewardType: r.reward_type,
      rewardValue: r.reward_value,
      quota: Number(r.quota || 0),
      claimed: Number(r.claimed_count || 0),
    }));
  } catch {
    return null;
  }
}

export async function getLiveSettings() {
  try {
    await schemaReady();
    const db = getDb();
    const res = await db.execute("SELECT key, value FROM public.settings WHERE key IN ('maintenance','maintenance_reason','global_announcement','shop_announcement')");
    const m = {};
    for (const r of res.rows) m[r.key] = r.value;
    return {
      maintenance: {
        active: String(m.maintenance) === '1',
        reason: m.maintenance_reason || '',
      },
      announcements: {
        global: m.global_announcement || '',
        shop: m.shop_announcement || '',
      },
    };
  } catch {
    return null;
  }
}

// DISKON AKTIF (flash sale) langsung dari DB bot.
export async function getLiveDiscounts() {
  try {
    await schemaReady();
    const db = getDb();
    const res = await db.execute(
      'SELECT item_key, discount_price, expires_at FROM public.shop_discounts WHERE expires_at > ?',
      [Date.now()]
    );
    return res.rows.map((r) => ({
      item_key: r.item_key,
      discount_price: Number(r.discount_price),
      expires_at: Number(r.expires_at),
    }));
  } catch {
    return null;
  }
}

// ==========================================
// SERVER (Komunitas) LANGSUNG DARI DB BOT (2026-10-03)
// ==========================================
// Dulu web menunggu bot mengirim daftar server (butuh Discord client).
// Sekarang dihitung langsung dari tabel bot:
//   players = pemain unik yang pernah main di server itu (game_scores)
//   games   = jumlah permainan
//   points  = total poin dari server itu
//   invite  = link dari guild_discord_invites (kalau ada)
// Nama + ikon server diambil dari tabel web (server_icons) kalau tersedia,
// fallback ke "Server <id>" supaya tetap tampil.
export async function getLiveServers() {
  try {
    await schemaReady();
    const db = getDb();
    const [stats, invites] = await Promise.all([
      db.execute(`
        SELECT guild_id,
               COUNT(DISTINCT user_id) AS players,
               COUNT(*)                AS games,
               COALESCE(SUM(points),0) AS points
          FROM public.game_scores
         GROUP BY guild_id
        HAVING COUNT(DISTINCT user_id) > 0
         ORDER BY COUNT(DISTINCT user_id) DESC, COALESCE(SUM(points),0) DESC
         LIMIT 100
      `),
      db.execute('SELECT guild_id, invite_url FROM public.guild_discord_invites').catch(() => ({ rows: [] })),
    ]);
    const inv = {};
    for (const r of invites.rows) inv[r.guild_id] = r.invite_url;

    return stats.rows.map((s) => ({
      guildId: String(s.guild_id),
      name: `Server ${String(s.guild_id).slice(-4)}`,
      iconUrl: null,
      players: Number(s.players || 0),
      games: Number(s.games || 0),
      points: Number(s.points || 0),
      members: 0,
      invite: inv[s.guild_id] || null,
    }));
  } catch {
    return null;
  }
}
