// REKONSILIASI PREMIUM (audit 2026-09-12; direvisi 2026-09-13 v2).
// Web = pencatat kebenaran: order paid / grant done yang belum kedaluwarsa
// wajib ada di premiumMembers bot. Tapi DUA keadaan harus dibedakan:
//
//  1. Baris hilang karena DB bot reset/restore -> grant ulang otomatis.
//  2. Baris hilang karena admin cabut MANUAL via Discord
//     (`nxadmin premium revoke` - tidak lewat web, tidak ada command-nya).
//     Jangan pernah melawan admin.
//
// Pembeda (v2): TRANSISI antar snapshot. Web menyimpan daftar member aktif
// push sebelumnya (recon_prev di web_meta). Kalau di push berikutnya seseorang
// HILANG padahal expiresAt-nya masih panjang, dan yang lain tidak banyak bergeser
// -> itu pencabutan manual -> catat revoke sintetis (web_meta recon_revoke:<id>)
// yang membatalkan semua event lama. Revoke sintetis bangun LAGI hanya kalau ada
// event BARU setelahnya (order paid lagi / grant dari panel web).
// Kalau hilang massal (>= 2 orang DAN >= 60% anggota aktif) -> indikasi DB reset,
// semua di-revive seperti biasa.
//
// Sumber "expected":
//  - orders.status = paid (30 hari dari paid_at)
//  - bot_commands grant_premium done (executed_at + days, cap 3650)
//  - revoke_premium done (lewat panel web) membatalkan event sebelumnya.
import { getDb, schemaReady } from './db';

const DAY = 86_400_000;
const RE_ENQUEUE_COOLDOWN_MS = 5 * 60_000;
const TOLERANCE_MS = DAY; // expiry bot boleh meleset < 1 hari dari ekspektasi
const PREV_MAX_AGE_MS = 10 * 60_000; // transisi cuma valid antar push berdekatan

const meta = {
  async get(db, key) {
    try {
      const r = await db.execute({ sql: 'SELECT value FROM web_meta WHERE key = ?', args: [key] });
      return r.rows.length ? r.rows[0].value : null;
    } catch { return null; }
  },
  async getNum(db, key) { const v = await this.get(db, key); return v ? Number(v) || 0 : 0; },
  async set(db, key, value) {
    try {
      await db.execute({
        sql: 'INSERT INTO web_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        args: [key, String(value)],
      });
    } catch {}
  },
  async del(db, key) {
    try { await db.execute({ sql: 'DELETE FROM web_meta WHERE key = ?', args: [key] }); } catch {}
  },
};

// Dipanggil dari POST /api/bot/stats SETIAP push snapshot (±60 dtk).
// Tidak pernah boleh membuat push gagal -> semua error ditelan.
export async function reconcilePremium(db, snapshot) {
  let requeued = 0;
  try {
    await schemaReady();
    try {
      await db.execute('CREATE TABLE IF NOT EXISTS web_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    } catch {}

    const now = Date.now();
    const snapTs = Number(snapshot?.ts) || now;

    // Member yang lapor sekarang (expiresAt null = lifetime).
    const current = new Map();
    for (const m of snapshot?.premiumMembers || []) {
      current.set(String(m.userId), m.expiresAt ? Number(m.expiresAt) : Infinity);
    }

    // === 1. Deteksi transisi -> revoke sintetis (cabut manual Discord) ===
    let prev = [];
    try { prev = JSON.parse(await meta.get(db, 'recon_prev') || '[]'); } catch { prev = []; }
    const prevTs = await meta.getNum(db, 'recon_prev_ts');
    if (prev.length >= 0 && prevTs && snapTs - prevTs <= PREV_MAX_AGE_MS + 60_000) {
      const prevMap = new Map(prev.map((p) => [p.id, p.exp]));
      // Hilang = ada di push sebelumnya, belum kedaluwarsa, tidak ada sekarang.
      const gone = [];
      for (const [id, exp] of prevMap) {
        if (!current.has(id) && exp > snapTs) gone.push(id);
      }
      // Massal (>=2 & >=60% dari anggota sebelumnya) -> DB reset, revive biasa.
      const massLoss = gone.length >= 2 && gone.length >= Math.ceil(prevMap.size * 0.6);
      if (gone.length && !massLoss) {
        for (const id of gone) {
          await meta.set(db, 'recon_revoke:' + id, snapTs);
          await meta.del(db, 'recon_premium:' + id); // reset cooldown, biar event baru langsung kebaca
          await notifyAdmin(db, id);
        }
      }
    }
    await meta.set(db, 'recon_prev', JSON.stringify([...current].map(([id, exp]) => ({ id, exp: exp === Infinity ? null : exp }))));
    await meta.set(db, 'recon_prev_ts', snapTs);

    // === 2. Kumpulan waktu revoke (command web + sintetis transisi) ===
    const revokeAt = new Map();
    const revokes = await db.execute(
      "SELECT payload, executed_at FROM bot_commands WHERE action = 'revoke_premium' AND status = 'done' AND executed_at IS NOT NULL ORDER BY executed_at DESC LIMIT 500"
    );
    for (const r of revokes.rows) {
      try {
        const id = String(JSON.parse(r.payload || '{}').userId || '');
        const t = Number(r.executed_at) || 0;
        if (id && t > (revokeAt.get(id) || 0)) revokeAt.set(id, t);
      } catch {}
    }
    const syn = await db.execute("SELECT key, value FROM web_meta WHERE key LIKE 'recon_revoke:%'").catch(() => ({ rows: [] }));
    for (const r of syn.rows || []) {
      const id = String(r.key).slice('recon_revoke:'.length);
      const t = Number(r.value) || 0;
      if (id && t > (revokeAt.get(id) || 0)) revokeAt.set(id, t);
    }

    // === 3. Event "harus premium sampai kapan" per user ===
    const events = new Map(); // id -> { until, newest }
    const add = (id, eventTs, until) => {
      if (!id || !eventTs) return;
      if (!/^\d{15,25}$/.test(id)) return; // junk payload lama (mis. '--help')
      if (eventTs <= (revokeAt.get(id) || 0)) return; // dicabut = niat, batal
      const cur = events.get(id) || { until: 0, newest: 0 };
      cur.until = Math.max(cur.until, until);
      cur.newest = Math.max(cur.newest, eventTs);
      events.set(id, cur);
    };
    const orders = await db.execute(
      "SELECT discord_id, paid_at FROM orders WHERE status = 'paid' AND paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 500"
    );
    for (const r of orders.rows) add(String(r.discord_id), Number(r.paid_at), Number(r.paid_at) + 30 * DAY);

    const grants = await db.execute(
      "SELECT payload, executed_at FROM bot_commands WHERE action = 'grant_premium' AND status = 'done' AND executed_at IS NOT NULL ORDER BY executed_at DESC LIMIT 500"
    );
    for (const r of grants.rows) {
      try {
        const p = JSON.parse(r.payload || '{}');
        const days = Math.min(Math.max(Number(p.days) || 30, 1), 3650);
        add(String(p.userId || ''), Number(r.executed_at), Number(r.executed_at) + days * DAY);
      } catch {}
    }

    // === 4. Selisih expected vs actual -> revive secukupnya ===
    for (const [id, { until, newest }] of events) {
      if (until <= now) {
        await meta.del(db, 'recon_premium:' + id);
        continue; // masa aktif memang sudah habis
      }
      // Revoke sintetis: bangun lagi HANYA kalau event lebih baru dari revoke.
      const rv = revokeAt.get(id) || 0;
      if (rv && newest <= rv) continue;

      const act = current.get(id);
      if (act !== undefined && act >= until - TOLERANCE_MS) {
        await meta.del(db, 'recon_premium:' + id); // cocok -> beres
        continue;
      }

      // jangan dobel: masih ada grant pending untuk user ini
      const inFlight = await db.execute({
        sql: "SELECT 1 as x FROM bot_commands WHERE action = 'grant_premium' AND status = 'pending' AND payload LIKE ? LIMIT 1",
        args: [`%"userId":"${id}"%`],
      });
      if (inFlight.rows.length) continue;
      const last = await meta.getNum(db, 'recon_premium:' + id);
      if (now - last < RE_ENQUEUE_COOLDOWN_MS) continue;

      const days = Math.max(1, Math.ceil((until - now) / DAY));
      await db.execute({
        sql: "INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES ('grant_premium', ?, 'web-reconcile', 'pending', ?)",
        args: [JSON.stringify({ userId: id, tier: 'pro', days }), now],
      });
      await meta.set(db, 'recon_premium:' + id, now);
      requeued += 1;
    }
    // Bersihkan revoke sintetis yang SUDAH TUA (>60 hari) dan eventnya
    // ikut kedaluwarsa. Jangan hapus revoke yang baru dibuat siklus ini
    // (harus bertahan supaya user tsb tidak di-revive push berikutnya).
    for (const r of syn.rows || []) {
      const id = String(r.key).slice('recon_revoke:'.length);
      const revokeTs = Number(r.value) || 0;
      if (now - revokeTs <= 60 * DAY) continue;
      const ev = events.get(id);
      if (!ev || ev.until <= now) await meta.del(db, 'recon_revoke:' + id);
    }
    if (requeued > 0) await touchActivitySafe();
    return requeued;
  } catch {
    return requeued;
  }
}

// Kabari admin pertama saat auto-recovery membatalkan user (cabut manual).
// DEDUP (fix 2026-09-14): notif yang sama untuk user yang sama tidak dibuat
// ulang dalam 6 jam - dulu tiap push snapshot (60 dtk) bikin notif baru
// selama kondisi "dicabut manual" belum berubah -> lonceng admin banjir.
async function notifyAdmin(db, userId) {
  try {
    const adminId = String(process.env.ADMIN_DISCORD_IDS || process.env.NEXT_PUBLIC_ADMIN_IDS || '').split(',')[0]?.trim();
    if (!adminId) return;
    const body = `User ${userId} hilang dari daftar premium tanpa perintah web -> dianggap pencabutan manual dari Discord. Auto-recovery DIJEDA untuk user ini. Grant dari panel web / pembayaran baru akan mengaktifkan recovery lagi.`;
    const existing = await db.execute({
      sql: 'SELECT 1 as x FROM web_notifications WHERE discord_id = ? AND title = ? AND body = ? AND created_at > ? LIMIT 1',
      args: [adminId, 'Premium dicabut manual terdeteksi', body, Date.now() - 6 * 60 * 60_000],
    });
    if (existing.rows.length) return; // sudah ada notif serupa < 6 jam -> jangan dobel
    await db.execute({
      sql: 'INSERT INTO web_notifications (discord_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [adminId, 'info', 'Premium dicabut manual terdeteksi', body, Date.now()],
    });
  } catch {}
}

// Beri hint ke bot supaya narik antrean cepat (queue nextPollMs:1000).
async function touchActivitySafe() {
  try {
    const { touchActivity } = await import('./activity');
    await touchActivity();
  } catch {}
}

// Helper untuk jalur non-snapshot (mis. panggilan manual admin nanti).
export async function reconcileNow(snapshot) {
  await schemaReady();
  return reconcilePremium(getDb(), snapshot);
}
