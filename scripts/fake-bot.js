#!/usr/bin/env node
/**
 * FAKE BOT - simulator webBridge untuk testing web NEXO tanpa bot asli.
 *
 *   node scripts/fake-bot.js           (WEB_URL = http://localhost:3000)
 *   WEB_URL=http://xxx node scripts/fake-bot.js
 *
 * Yang dilakukan (persis perilaku utils/webBridge.js):
 *   - PUSH  tiap 30s : POST /api/bot/stats (dummy tapi masuk akal)
 *   - POLL  tiap 5s  : GET /api/bot/queue
 *   - EKSEKUSI       : balas semua command dengan status done
 *   - ACK            : POST /api/bot/ack dengan hasil + profil user dummy
 */

const WEB_URL = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/+$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || 'dev-local-secret-ganti-dengan-yang-asli';
const PUSH_MS = parseInt(process.env.FAKE_PUSH_MS, 10) || 30000;
const POLL_MS = parseInt(process.env.FAKE_POLL_MS, 10) || 5000;

let gamesBase = 300;
let moneyBase = 95_000_000;
let lastSeen = null; // heartbeat (fair-time premium simulator)

function dummySnapshot() {
  gamesBase += Math.floor(Math.random() * 5);
  moneyBase += Math.floor(Math.random() * 20_000);
  const now = Date.now();
  return {
    ts: now,
    bot: { uptimeSec: 3600 + Math.floor(now / 1000) % 100000, memMb: 240 + Math.floor(Math.random() * 40), wsPing: 30 + Math.floor(Math.random() * 40), guildCount: 36 },
    monitor: {
      totalUsers: 1500, totalUsersAll: 1800, totalMoney: moneyBase, premiumCount: 2,
      loans: { count: 12, overdue: 3, owed: 450_000 },
      live: { playing: 5, lobby: 2, mp: 1, solo: 3 },
      gamesToday: gamesBase, gamesWeek: 2100,
      topGamesToday: [{ game_type: 'rps', plays: 45 }, { game_type: 'slot', plays: 31 }],
      topServers: [{ guildId: '1', name: 'NEXO HQ', players: 30 }, { guildId: '2', name: 'Gaming Indo', players: 22 }],
      richest: [{ userId: '836383639439671366', username: 'xurbayy', points: 705_071 }, { userId: '2', username: 'pemainrajin', points: 512_400 }],
    },
    leaderboard: [
      { rank: 1, userId: '836383639439671366', username: 'xurbayy', points: 705_071, level: 26 },
      { rank: 2, userId: '2', username: 'pemainrajin', points: 512_400, level: 22 },
      { rank: 3, userId: '3', username: 'sultanpoin', points: 480_100, level: 21 },
    ],
    guildBoard: [{ rank: 1, name: 'NEXO HQ', emoji: '🏰', points: 100_000, warWins: 5, members: 10 }],
    shopItems: [
      { itemKey: 'double_points', name: 'Double Points Card', description: 'Gandakan poin 1 game.', price: 50_000, stock: 20, gameType: 'all', emoji: '2️⃣' },
      { itemKey: 'shield_item', name: 'Shield', description: 'Lindungi taruhan sekali.', price: 25_000, stock: 50, gameType: 'all', emoji: '🛡️' },
    ],
    discounts: [{ item_key: 'shield_item', original_price: 50_000, expires_at: now + 3600_000 }],
    loans: [
      { userId: '3', username: 'sultanpoin', amount: 100_000, totalDue: 120_000, dueDate: now - 86400000, overdue: true },
      { userId: '4', username: 'borongan', amount: 50_000, totalDue: 55_000, dueDate: now + 86400000 * 3, overdue: false },
    ],
    promoCodes: [
      { code: 'NEXO2026', rewardType: 'points', rewardValue: '10000', quota: 100, claimed: 34 },
      { code: 'TESTITEM', rewardType: 'item', rewardValue: 'shield_item', quota: 10, claimed: 1 },
    ],
    maintenance: { active: false, reason: null },
    premiumMembers: [{ userId: '836383639439671366', username: 'xurbayy', tier: 'pro', expiresAt: now + 30 * 86400000, grantedBy: '836383639439671366' }],
  };
}

function dummyProfile(discordId) {
  const now = Date.now();
  return {
    exists: true,
    profile: {
      userId: discordId, username: 'xurbayy', title: 'OVERLORD', adminTitle: null,
      points: 705_071, level: 26, xp: 500, xpNext: 1000, globalRank: 1,
      dailyStreak: 7, winstreak: 3, totalWon: 100, totalBet: 50, partnerId: null, registered: 1,
      ownedTitles: ['OVERLORD'],
      inventory: [{ itemKey: 'double_points', name: 'Double Points Card', quantity: 2 }],
      missions: {
        missions: [
          { id: 'solo_2', icon: '🎮', desc: 'Selesaikan 2 game solo', type: 'finish', cat: 'solo', game: null, target: 2, base: 3000, progress: 1, claimed: false },
        ],
        claimed_all: false, day: new Date().toISOString().slice(0, 10),
      },
      history: [
        { gameType: 'rps', points: 500, playedAt: now - 3600_000 },
        { gameType: 'slot', points: -200, playedAt: now - 7200_000 },
        { gameType: 'autochess', points: 1200, playedAt: now - 86400_000 },
      ],
      loan: { amount: 0, totalDue: 0, dueDate: 0 },
      guild: { name: 'NEXO HQ', emoji: '🏰', role: 'owner' },
      premium: { tier: 'pro', expiresAt: now + 30 * 86400000, betaAccess: true },
    },
  };
}

async function call(path, method, body) {
  const res = await fetch(`${WEB_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${BOT_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function push() {
  const r = await call('/api/bot/stats', 'POST', dummySnapshot());
  console.log(`[FAKE-BOT] push -> HTTP ${r.status}`);
}

async function poll() {
  const r = await call('/api/bot/queue', 'GET');
  if (r.status !== 200) { console.log(`[FAKE-BOT] poll -> HTTP ${r.status}`); return; }
  // Heartbeat last_seen - meniru perilaku webBridge.js asli (bridge_meta)
  lastSeen = Date.now();
  const results = [];
  for (const cmd of r.json.commands || []) {
    const label = cmd.payload?.amount ? `${cmd.payload.amount}` : '';
    console.log(`[FAKE-BOT] eksekusi #${cmd.id} ${cmd.action} ${label}`);
    results.push({ id: cmd.id, status: 'done', result: `FAKE OK: ${cmd.action} ${label}` });
  }
  for (const req of r.json.dataRequests || []) {
    console.log(`[FAKE-BOT] profil user ${req.discordId}`);
    results.push({ id: req.id, status: 'done', result: 'user_profile', data: dummyProfile(req.discordId) });
  }
  if (results.length) {
    const a = await call('/api/bot/ack', 'POST', { results });
    console.log(`[FAKE-BOT] ack ${results.length} hasil -> HTTP ${a.status}`);
  }
}

// FAIR-TIME: saat shutdown bersih, catat last_shutdown (ditiru dari webBridge.js).
// Web sendiri tidak mengelola kompensasi (itu kerja bot saat start) - simulator
// hanya menuliskan jejak agar pengujian downtime konsisten dengan perilaku asli.
function markShutdown() {
  console.log(`[FAKE-BOT] shutdown - last_seen=${lastSeen || '-'} (simulasi fair-time premium)`);
}
process.on('SIGINT', () => { markShutdown(); process.exit(0); });

console.log(`[FAKE-BOT] jalan -> ${WEB_URL} (push ${PUSH_MS / 1000}s, poll ${POLL_MS / 1000}s)`);
push();
poll();
setInterval(push, PUSH_MS);
setInterval(poll, POLL_MS);
