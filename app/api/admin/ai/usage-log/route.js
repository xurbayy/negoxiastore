import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { json } from '../../../../lib/api-helpers';
import { estimasiBiaya } from '../../../../lib/aiUsage';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/usage-log - dashboard riwayat pemakaian AI
// ==========================================
// Permintaan pemilik 2026-10-04: "gw mau ada usage seperti [Total Requests,
// Input/Cached/Output Tokens, Est. Cost, Recent Requests, grafik] ... real ga
// halu berdasarkan data ... ada graphicnya di bawah chat AI".
//
// CATATAN: ini BERBEDA dari /api/admin/ai/usage?provider= (kuota kredit
// provider). Route ini membaca log pemakaian yang dicatat lib/aiUsage.js di
// setiap permintaan AI.
//
// Sumber:
//   - TOTAL seumur hidup : ai_usage_harian (rollup per hari+provider+model).
//   - Grafik per jam 24j : ai_usage (log mentah, 7 hari terakhir).
//   - Recent Requests     : ai_usage (20 baris terakhir).
//   - Usage by Model      : ai_usage_harian digabung per model.
//   - By Provider         : ai_usage_harian digabung per provider.
//
// Est. Cost = token x tarif publik per model (lib/aiUsage.js) - PERKIRAAN,
// bukan tagihan asli. Model gratis = $0.
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

export async function GET(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  const url = new URL(request.url);
  // Filter hari opsional (YYYY-MM-DD). Kosong = semua hari (seumur hidup).
  const hari = (url.searchParams.get('hari') || '').trim();

  try {
    // === 1. TOTAL SEUMUR HIDUP (rollup harian) ===
    const totalSql = hari
      ? `SELECT COALESCE(SUM(requests),0) AS requests, COALESCE(SUM(ok_requests),0) AS ok_requests,
                COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(cached_tokens),0) AS cached_tokens,
                COALESCE(SUM(output_tokens),0) AS output_tokens
         FROM ai_usage_harian WHERE day = ?`
      : `SELECT COALESCE(SUM(requests),0) AS requests, COALESCE(SUM(ok_requests),0) AS ok_requests,
                COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(cached_tokens),0) AS cached_tokens,
                COALESCE(SUM(output_tokens),0) AS output_tokens
         FROM ai_usage_harian`;
    const t = await db.execute({ sql: totalSql, args: hari ? [hari] : [] });
    const r0 = t.rows?.[0] || {};
    const totalInput = Number(r0.input_tokens || 0);
    const totalCached = Number(r0.cached_tokens || 0);
    const totalOutput = Number(r0.output_tokens || 0);

    // === 2. USAGE BY MODEL ===
    const modelSql = hari
      ? `SELECT model, provider, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
                SUM(cached_tokens) AS cached_tokens, SUM(output_tokens) AS output_tokens, MAX(day) AS last_day
         FROM ai_usage_harian WHERE day = ? GROUP BY model, provider
         ORDER BY SUM(input_tokens + output_tokens) DESC LIMIT 20`
      : `SELECT model, provider, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
                SUM(cached_tokens) AS cached_tokens, SUM(output_tokens) AS output_tokens, MAX(day) AS last_day
         FROM ai_usage_harian GROUP BY model, provider
         ORDER BY SUM(input_tokens + output_tokens) DESC LIMIT 20`;
    const mr = await db.execute({ sql: modelSql, args: hari ? [hari] : [] });
    const byModel = (mr.rows || []).map((m) => {
      const inp = Number(m.input_tokens || 0);
      const cac = Number(m.cached_tokens || 0);
      const out = Number(m.output_tokens || 0);
      return {
        model: m.model || '(tanpa nama)',
        provider: m.provider || '-',
        requests: Number(m.requests || 0),
        inputTokens: inp,
        cachedTokens: cac,
        outputTokens: out,
        lastUsed: m.last_day || null,
        estCostUsd: estimasiBiaya(m.model, inp, cac, out),
      };
    });

    // === 3. BY PROVIDER ===
    const provSql = hari
      ? `SELECT provider, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
                SUM(cached_tokens) AS cached_tokens, SUM(output_tokens) AS output_tokens
         FROM ai_usage_harian WHERE day = ? GROUP BY provider ORDER BY SUM(input_tokens) DESC`
      : `SELECT provider, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
                SUM(cached_tokens) AS cached_tokens, SUM(output_tokens) AS output_tokens
         FROM ai_usage_harian GROUP BY provider ORDER BY SUM(input_tokens) DESC`;
    const pr = await db.execute({ sql: provSql, args: hari ? [hari] : [] });
    const byProvider = (pr.rows || []).map((p) => {
      const prov = p.provider || '-';
      const inp = Number(p.input_tokens || 0);
      const cac = Number(p.cached_tokens || 0);
      const out = Number(p.output_tokens || 0);
      return {
        provider: p.provider || '(custom)',
        requests: Number(p.requests || 0),
        inputTokens: inp,
        cachedTokens: cac,
        outputTokens: out,
        estCostUsd: byModel.filter((m) => m.provider === prov).reduce((s, m) => s + m.estCostUsd, 0),
      };
    });

    // === 4. GRAFIK PER JAM (24 jam terakhir, dari log mentah) ===
    const sejak = Date.now() - 24 * 3600_000;
    const hr = await db.execute({
      sql: `SELECT (EXTRACT(HOUR FROM to_timestamp(ts/1000.0) AT TIME ZONE 'Asia/Jakarta'))::int AS jam,
                   COUNT(*)::int AS requests, COALESCE(SUM(prompt_tokens),0)::int AS input_tokens,
                   COALESCE(SUM(cached_tokens),0)::int AS cached_tokens, COALESCE(SUM(completion_tokens),0)::int AS output_tokens
              FROM ai_usage WHERE ts >= ? GROUP BY 1 ORDER BY 1`,
      args: [sejak],
    });
    const perJam = Array.from({ length: 24 }, (_, j) => ({ jam: j, requests: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0 }));
    for (const row of (hr.rows || [])) {
      const j = Number(row.jam);
      if (j >= 0 && j <= 23) {
        perJam[j] = {
          jam: j,
          requests: Number(row.requests || 0),
          inputTokens: Number(row.input_tokens || 0),
          cachedTokens: Number(row.cached_tokens || 0),
          outputTokens: Number(row.output_tokens || 0),
        };
      }
    }

    // === 5. RECENT REQUESTS (20 terakhir) ===
    const rr = await db.execute({
      sql: `SELECT ts, provider, model, prompt_tokens, cached_tokens, completion_tokens, total_tokens, ok
              FROM ai_usage ORDER BY id DESC LIMIT 20`,
    });
    const recent = (rr.rows || []).map((r) => ({
      ts: Number(r.ts),
      model: r.model || '-',
      provider: r.provider || '-',
      promptTokens: Number(r.prompt_tokens || 0),
      cachedTokens: Number(r.cached_tokens || 0),
      completionTokens: Number(r.completion_tokens || 0),
      totalTokens: Number(r.total_tokens || 0),
      ok: Number(r.ok) === 1,
    }));

    const estTotal = byModel.reduce((s, m) => s + m.estCostUsd, 0);
    const adaToken = (totalInput + totalCached + totalOutput) > 0;

    return json({
      ok: true,
      hari: hari || null,
      totals: {
        requests: Number(r0.requests || 0),
        okRequests: Number(r0.ok_requests || 0),
        inputTokens: totalInput,
        cachedTokens: totalCached,
        outputTokens: totalOutput,
        estCostUsd: estTotal,
        adaToken,
      },
      byModel,
      byProvider,
      hourly: perJam,
      recent,
      catatan: 'Estimasi dari token x tarif publik per model - perkiraan, bukan tagihan asli provider. Model gratis = $0.',
    });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
}
