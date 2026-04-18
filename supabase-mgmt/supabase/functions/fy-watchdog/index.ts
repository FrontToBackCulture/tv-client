// ---------------------------------------------------------------------------
// FY Watchdog — recapture + diff + drift alert.
//
// POST /fy-watchdog
// Body: { fy_code?: "FY2024"  // default = current + prior FY
//       , period_start?: "2024-07-01"  // default = all months of scope
//       , threshold?: 1.0  // $ delta threshold; ignores smaller rounding noise
//       }
//
// For each (fy, month) in scope:
//   1. Remember the id of the latest prior qbo snapshot (snap_prior).
//   2. Invoke fy-capture-snapshot to insert a fresh snapshot (snap_new).
//   3. Diff fy_snapshot_lines(snap_prior) vs fy_snapshot_lines(snap_new).
//   4. For any account line whose balance/movement delta > threshold, insert
//      a fy_drift_alerts row.
//
// Designed to run on a schedule (e.g. pg_cron nightly) but also callable
// on-demand. Append-only for snapshots; alerts persist until acknowledged.
// ---------------------------------------------------------------------------

import {
  CORS_HEADERS,
  jsonResponse,
  supabaseAdmin,
} from "../_shared/qbo.ts";

const FY_START_MONTH = 8;

interface Body {
  fy_code?: string;
  period_start?: string;
  threshold?: number;
}

function currentFyCode(): string {
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const y = now.getUTCFullYear();
  const fyYear = m >= FY_START_MONTH ? y + 1 : y;
  return `FY${fyYear}`;
}

function priorFyCode(fy: string): string {
  const y = parseInt(fy.slice(2), 10);
  return `FY${y - 1}`;
}

interface SnapshotRow {
  id: string;
  fy_code: string;
  period_start: string;
  captured_at: string;
}

interface LineRow {
  account_qbo_id: string | null;
  account_name: string;
  fs_line: string | null;
  balance: number | null;
  movement: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body: Body = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};
    const threshold = body.threshold ?? 1.0;

    const fyScope = body.fy_code
      ? [body.fy_code]
      : [currentFyCode(), priorFyCode(currentFyCode())];

    const supabase = supabaseAdmin();

    const summary = {
      scopes_checked: 0,
      alerts_created: 0,
      errors: [] as string[],
      details: [] as Array<Record<string, unknown>>,
    };

    for (const fyCode of fyScope) {
      // Fetch prior snapshots (pre-capture) per period_start
      let q = supabase
        .from("fy_snapshots")
        .select("id, fy_code, period_start, captured_at")
        .eq("fy_code", fyCode)
        .eq("source", "qbo")
        .eq("granularity", "month")
        .order("captured_at", { ascending: false });
      if (body.period_start) q = q.eq("period_start", body.period_start);
      const { data: priorSnaps, error: priorErr } = await q;
      if (priorErr) throw priorErr;

      // Latest per period_start (before we capture new)
      const priorByPeriod = new Map<string, SnapshotRow>();
      for (const s of (priorSnaps ?? []) as SnapshotRow[]) {
        if (!priorByPeriod.has(s.period_start)) priorByPeriod.set(s.period_start, s);
      }

      // Trigger fresh capture(s) for scope
      const captureBody: Record<string, string> = { fy_code: fyCode };
      if (body.period_start) captureBody.period_start = body.period_start;
      const captureRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/fy-capture-snapshot`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(captureBody),
        },
      );
      if (!captureRes.ok) {
        const txt = await captureRes.text();
        summary.errors.push(`${fyCode}: capture failed — ${txt}`);
        continue;
      }

      // Fetch new snapshots (captured just now)
      const { data: newSnaps, error: newErr } = await supabase
        .from("fy_snapshots")
        .select("id, fy_code, period_start, captured_at")
        .eq("fy_code", fyCode)
        .eq("source", "qbo")
        .eq("granularity", "month")
        .order("captured_at", { ascending: false });
      if (newErr) throw newErr;
      const newByPeriod = new Map<string, SnapshotRow>();
      for (const s of (newSnaps ?? []) as SnapshotRow[]) {
        if (!newByPeriod.has(s.period_start)) newByPeriod.set(s.period_start, s);
      }

      // Diff per period
      for (const [period, newSnap] of newByPeriod) {
        const priorSnap = priorByPeriod.get(period);
        if (!priorSnap || priorSnap.id === newSnap.id) continue; // first capture for this period → nothing to diff

        const [priorLinesRes, newLinesRes] = await Promise.all([
          supabase
            .from("fy_snapshot_lines")
            .select("account_qbo_id, account_name, fs_line, balance, movement")
            .eq("snapshot_id", priorSnap.id),
          supabase
            .from("fy_snapshot_lines")
            .select("account_qbo_id, account_name, fs_line, balance, movement")
            .eq("snapshot_id", newSnap.id),
        ]);
        if (priorLinesRes.error) throw priorLinesRes.error;
        if (newLinesRes.error) throw newLinesRes.error;

        const indexBy = (rows: LineRow[]) => {
          const m = new Map<string, LineRow>();
          for (const r of rows) {
            const k = r.account_qbo_id ?? `name:${r.account_name}`;
            m.set(k, r);
          }
          return m;
        };
        const priorIdx = indexBy(priorLinesRes.data as LineRow[]);
        const newIdx = indexBy(newLinesRes.data as LineRow[]);

        const keys = new Set([...priorIdx.keys(), ...newIdx.keys()]);
        const alertRows: Record<string, unknown>[] = [];
        for (const k of keys) {
          const pr = priorIdx.get(k);
          const nw = newIdx.get(k);
          const check = (field: "balance" | "movement") => {
            const a = pr?.[field] ?? 0;
            const b = nw?.[field] ?? 0;
            if (a == null && b == null) return;
            if (Math.abs((b ?? 0) - (a ?? 0)) > threshold) {
              alertRows.push({
                fy_code: fyCode,
                period_start: period,
                account_qbo_id: (nw ?? pr)?.account_qbo_id ?? null,
                account_name: (nw ?? pr)?.account_name ?? "",
                fs_line: (nw ?? pr)?.fs_line ?? null,
                amount_field: field,
                old_value: a,
                new_value: b,
                snapshot_id_prior: priorSnap.id,
                snapshot_id_new: newSnap.id,
                status: "open",
              });
            }
          };
          check("balance");
          check("movement");
        }

        if (alertRows.length > 0) {
          const { error: insErr } = await supabase.from("fy_drift_alerts").insert(alertRows);
          if (insErr) throw insErr;
          summary.alerts_created += alertRows.length;
          summary.details.push({
            fy_code: fyCode,
            period_start: period,
            alerts: alertRows.length,
          });
        }
        summary.scopes_checked += 1;
      }
    }

    return jsonResponse({ ok: summary.errors.length === 0, ...summary });
  } catch (err) {
    console.error("[fy-watchdog] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
