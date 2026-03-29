// Supabase Edge Function: Classify MCF job postings using AI
// Triggered from the Public Data module in tv-client
//
// POST /classify-job-postings
// Body: { batch_size?: number }  (default 100, max 500)
//
// Picks up rows where classified_at IS NULL, sends title + description
// to Qwen3.5-Flash via OpenRouter, writes back structured tags.
// Already-classified rows are never reprocessed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openrouterKey = Deno.env.get("OPENROUTER_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "public_data" },
});

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "qwen/qwen3.5-flash-02-23";
const CLASSIFY_BATCH = 10; // jobs per LLM call
const CONCURRENT_BATCHES = 2; // parallel LLM calls
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

// ─── Classification Prompt ─────────────────────────────

const SYSTEM_PROMPT = `You are a job posting classifier. For each job, return a JSON object with these fields:

- finance_function: The specific finance function this role performs. Use one of: ar, ap, ar_ap, gl, fullset, tax, audit, cost, fpa, reporting, treasury, payroll, general. Use null if this is NOT a finance/accounting role at all.
- seniority: The seniority level. Use one of: intern, junior, executive, senior, manager, director.
- industry_tag: The industry of the HIRING COMPANY or END CLIENT (not the job function). Use one of: fnb, hospitality, retail, logistics, healthcare, construction, tech, manufacturing, financial_services, professional_services, government, education, real_estate, other.

Rules:
- "fullset" means the role covers AR + AP + GL + month-end — a one-person finance team.
- "general" means it IS a finance role but doesn't fit a specific function (e.g. "Finance Admin").
- "fpa" = financial planning & analysis, budgeting, forecasting.
- "reporting" = financial reporting, management reporting, consolidation.
- For seniority: "Account Assistant" / "Clerk" = junior, "Executive" = executive, "Senior Executive" / "Senior Accountant" = senior, "Manager" / "Assistant Manager" = manager, "Director" / "VP" / "CFO" = director, "Intern" / "Trainee" = intern.
- For industry: use company name, SSIC code, and job description as signals. SSIC codes starting with 56 = fnb, 55 = hospitality, 47 = retail, 49-53 = logistics/transport, 86 = healthcare, 41-43 = construction, 62-63 = tech, 10-33 = manufacturing, 64-66 = financial_services, 69-75 = professional_services, 84 = government, 85 = education, 68 = real_estate.
- If a recruitment/staffing agency is hiring on behalf of a client, classify the INDUSTRY of the client if apparent from the description.

Return a JSON array with one object per job, in the same order as input. No markdown, no explanation — just the JSON array.`;

function buildUserPrompt(
  jobs: { idx: number; title: string; company: string; ssic: string | null; description: string | null }[]
): string {
  return jobs
    .map(
      (j, i) =>
        `[Job ${i + 1}]\nTitle: ${j.title}\nCompany: ${j.company}\nSSIC: ${j.ssic || "unknown"}\nDescription: ${(j.description || "").slice(0, 600)}`
    )
    .join("\n\n");
}

// ─── Valid values (for sanitization) ───────────────────

const VALID_FINANCE = new Set([
  "ar", "ap", "ar_ap", "gl", "fullset", "tax", "audit", "cost", "fpa",
  "reporting", "treasury", "payroll", "general",
]);
const VALID_SENIORITY = new Set([
  "intern", "junior", "executive", "senior", "manager", "director",
]);
const VALID_INDUSTRY = new Set([
  "fnb", "hospitality", "retail", "logistics", "healthcare", "construction",
  "tech", "manufacturing", "financial_services", "professional_services",
  "government", "education", "real_estate", "other",
]);

function sanitize(
  result: Record<string, unknown>
): { finance_function: string | null; seniority: string | null; industry_tag: string | null } {
  const ff = typeof result.finance_function === "string" ? result.finance_function.toLowerCase() : null;
  const s = typeof result.seniority === "string" ? result.seniority.toLowerCase() : null;
  const it = typeof result.industry_tag === "string" ? result.industry_tag.toLowerCase() : null;
  return {
    finance_function: ff && VALID_FINANCE.has(ff) ? ff : null,
    seniority: s && VALID_SENIORITY.has(s) ? s : null,
    industry_tag: it && VALID_INDUSTRY.has(it) ? it : null,
  };
}

// ─── LLM Call ──────────────────────────────────────────

async function classifyBatch(
  jobs: { idx: number; title: string; company: string; ssic: string | null; description: string | null }[]
): Promise<{ finance_function: string | null; seniority: string | null; industry_tag: string | null }[]> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://tryval.com",
      "X-Title": "VAL Job Classifier",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(jobs) },
      ],
      temperature: 0,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "[]";

  // Parse JSON — handle markdown code blocks if model wraps it
  const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array, got: ${typeof parsed}`);
  }

  // Sanitize and pad/truncate to match input length
  const results = jobs.map((_, i) => {
    const raw = parsed[i] || {};
    return sanitize(raw);
  });

  return results;
}

// ─── Main Handler ──────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(body.batch_size || DEFAULT_LIMIT, 1), MAX_LIMIT);

    // 1. Fetch unclassified rows
    const { data: rows, error: fetchErr } = await supabase
      .from("mcf_job_postings")
      .select("id, title, company_name, company_ssic_code, description")
      .is("classified_at", null)
      .limit(limit);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);
    if (!rows || rows.length === 0) {
      return Response.json({
        status: "completed",
        classified: 0,
        remaining: 0,
        message: "No unclassified jobs found",
      });
    }

    // Count total remaining for progress reporting
    const { count: totalRemaining } = await supabase
      .from("mcf_job_postings")
      .select("id", { count: "exact", head: true })
      .is("classified_at", null);

    // 2. Split into mini-batches and process with parallel LLM calls
    let classified = 0;
    let errors = 0;
    let lastError = "";
    const now = new Date().toISOString();

    const batches: typeof rows[] = [];
    for (let i = 0; i < rows.length; i += CLASSIFY_BATCH) {
      batches.push(rows.slice(i, i + CLASSIFY_BATCH));
    }

    // Process CONCURRENT_BATCHES at a time
    for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
      const concurrentSlice = batches.slice(i, i + CONCURRENT_BATCHES);

      const results = await Promise.allSettled(
        concurrentSlice.map(async (batch) => {
          const jobs = batch.map((r, idx) => ({
            idx,
            title: r.title,
            company: r.company_name || "Unknown",
            ssic: r.company_ssic_code,
            description: r.description,
          }));

          const classifications = await classifyBatch(jobs);

          // Parallel DB writes for all rows in this batch
          const writeResults = await Promise.all(
            batch.map((row, j) =>
              supabase
                .from("mcf_job_postings")
                .update({
                  finance_function: classifications[j].finance_function,
                  seniority: classifications[j].seniority,
                  industry_tag: classifications[j].industry_tag,
                  classified_at: now,
                })
                .eq("id", row.id)
            )
          );

          const writeErrors = writeResults.filter((r) => r.error);
          if (writeErrors.length > 0) {
            console.error(`${writeErrors.length} write errors in batch`);
          }
          return batch.length - writeErrors.length;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          classified += r.value;
        } else {
          const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          console.error(`Batch error: ${errMsg}`);
          lastError = errMsg;
          errors += CLASSIFY_BATCH; // approximate
        }
      }
    }

    // 4. Log to ingestion_log
    const startedAt = new Date();
    await supabase.from("ingestion_log").insert({
      source_id: "mcf-classify",
      rows_upserted: classified,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      status: errors > 0 ? "error" : "success",
      error: errors > 0 ? `${errors} rows failed classification` : null,
      metadata: { model: MODEL, batch_size: limit, errors },
    });

    return Response.json({
      status: errors > 0 ? "partial" : "completed",
      classified,
      errors,
      remaining: (totalRemaining || 0) - classified,
      message: `Classified ${classified} jobs${errors > 0 ? ` (${errors} errors)` : ""}. ${Math.max(0, (totalRemaining || 0) - classified)} remaining.`,
      lastError: lastError || undefined,
    });
  } catch (err) {
    console.error("classify-job-postings error:", err);
    return Response.json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
});
