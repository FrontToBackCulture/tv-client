// Supabase Edge Function: Parse VAL error notification emails into structured tables
// Designed to run on a schedule (every 30 min) or after shared-inbox-sync completes.
//
// POST /val-parse-error-emails
// Body: { since?: string }  — ISO timestamp, defaults to last 24h
//
// Scans shared_emails for:
//   1. Custom Importer errors (⚠️) → val_importer_errors
//   2. Integration errors (🚨 Integration) → val_integration_errors
// Deduplicates by email_id (graph_message_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Parsers ──────────────────────────────────

interface ImporterError {
  email_id: string;
  domain: string;
  importer_name: string;
  file_name: string | null;
  error_summary: string | null;
  error_detail: string | null;
  received_at: string;
}

interface IntegrationError {
  email_id: string;
  domain: string;
  connector: string;
  action: string | null;
  target_table: string | null;
  error_summary: string | null;
  triggered_by: string | null;
  triggered_at: string | null;
  received_at: string;
}

/**
 * Parse Custom Importer error email
 * Subject: ⚠️ | {domain} | Custom Importer | Validation failed for {importer_name}
 * Preview: Error in {importer_name}\r\n\r\n{validation context} processing {file_path}\r\n\r\n{error_detail}
 */
function parseImporterEmail(
  emailId: string,
  subject: string,
  preview: string,
  receivedAt: string,
): ImporterError | null {
  // Parse subject: ⚠️ | {domain} | Custom Importer | Validation failed for {name}
  // Match pipe-delimited subject — emoji may have variation selectors
  const subjectMatch = subject.match(
    /\|\s*(\w+)\s*\|\s*Custom Importer\s*\|\s*(?:Validation failed for\s+)?(.+)/,
  );
  if (!subjectMatch) return null;

  const domain = subjectMatch[1];
  const importer_name = subjectMatch[2].trim();

  // Parse preview for file name and error detail
  const lines = preview.split(/\r?\n/).filter((l) => l.trim());

  let file_name: string | null = null;
  let error_detail: string | null = null;
  const error_lines: string[] = [];

  for (const line of lines) {
    // File path: ./downloads/{domain}/{filename}
    const fileMatch = line.match(/processing\s+\.\/downloads\/\w+\/(.+)/);
    if (fileMatch) {
      file_name = fileMatch[1].trim();
      continue;
    }

    // Skip the "Error in ..." header line
    if (line.startsWith("Error in ")) continue;
    // Skip "Validation error encountered" prefix (file line handles the rest)
    if (line.startsWith("Validation error encountered")) continue;

    // Everything else is error detail
    if (line.trim()) error_lines.push(line.trim());
  }

  error_detail = error_lines.length > 0 ? error_lines.join(" | ") : null;

  return {
    email_id: emailId,
    domain,
    importer_name,
    file_name,
    error_summary: `Validation failed for ${importer_name}`,
    error_detail,
    received_at: receivedAt,
  };
}

/**
 * Parse Integration error email
 * Subject: 🚨 | {domain} | Integration | {connector}: {action}: {description}
 * Preview: {error_summary}\r\n\r\nAction Triggered by User ID: {user} @ {timestamp}\r\n\r\nUUID: ...\r\n\r\nIntegration: {connector}\r\n\r\nTable...
 */
function parseIntegrationEmail(
  emailId: string,
  subject: string,
  preview: string,
  receivedAt: string,
): IntegrationError | null {
  // Parse subject: 🚨 | {domain} | Integration | {connector}: {action}: {description}
  // Match pipe-delimited subject — emoji may have variation selectors
  const subjectMatch = subject.match(
    /\|\s*(\w+)\s*\|\s*Integration\s*\|\s*(.+)/,
  );
  if (!subjectMatch) return null;

  const domain = subjectMatch[1];
  const integrationPart = subjectMatch[2].trim();

  // Parse connector and action from "{connector}: {action}: {description}"
  const parts = integrationPart.split(":");
  const connector = parts[0]?.trim() || integrationPart;
  const action = parts[1]?.trim() || null;

  // Parse preview for structured fields
  const lines = preview.split(/\r?\n/).filter((l) => l.trim());

  let error_summary: string | null = null;
  let triggered_by: string | null = null;
  let triggered_at: string | null = null;
  let target_table: string | null = null;

  for (const line of lines) {
    // First non-empty line is the error summary
    if (!error_summary && line.trim()) {
      error_summary = line.trim();
    }

    // Action Triggered by User ID: {user} @ {timestamp}
    const triggerMatch = line.match(
      /Action Triggered by User ID:\s*(.+?)\s*@\s*(.+)/,
    );
    if (triggerMatch) {
      triggered_by = triggerMatch[1].trim();
      triggered_at = triggerMatch[2].trim();
    }

    // Table references like custom_tbl_XXX_YYY
    const tableMatch = line.match(/(custom_tbl_\d+_\d+)/);
    if (tableMatch && !target_table) {
      target_table = tableMatch[1];
    }
  }

  return {
    email_id: emailId,
    domain,
    connector,
    action,
    target_table,
    error_summary,
    triggered_by,
    triggered_at,
    received_at: receivedAt,
  };
}

// ─── Paginated fetch ──────────────────────────

async function fetchAllEmails(
  likePattern: string,
  extraFilter: ((q: any) => any) | null,
  since: string,
): Promise<Array<{ graph_message_id: string; subject: string; preview: string; received_at: string }>> {
  const PAGE_SIZE = 1000;
  const all: Array<{ graph_message_id: string; subject: string; preview: string; received_at: string }> = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("shared_emails")
      .select("graph_message_id, subject, preview, received_at")
      .like("subject", likePattern)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (extraFilter) query = extraFilter(query);

    const { data, error } = await query;
    if (error) {
      console.error("[val-parse-error-emails] Fetch error:", error);
      break;
    }
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

// ─── Handler ──────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const since =
      body.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // ─── Fetch emails with pagination ────────
    const importerEmails = await fetchAllEmails("%Custom Importer%", null, since);
    const integrationEmails = await fetchAllEmails(
      "%Integration |%",
      (q: any) => q.like("subject", "%🚨%"),
      since,
    );

    // ─── Parse and upsert importer errors ───
    let importerParsed = 0;
    let importerSkipped = 0;

    if (importerEmails.length > 0) {
      const rows: ImporterError[] = [];
      for (const email of importerEmails) {
        const parsed = parseImporterEmail(
          email.graph_message_id,
          email.subject,
          email.preview || "",
          email.received_at,
        );
        if (parsed) {
          rows.push(parsed);
        } else {
          importerSkipped++;
        }
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from("val_importer_errors")
          .upsert(rows, { onConflict: "email_id", ignoreDuplicates: true });

        if (error) {
          console.error("[val-parse-error-emails] Importer upsert error:", error);
        } else {
          importerParsed = rows.length;
        }
      }
    }

    // ─── Parse and upsert integration errors ─
    let integrationParsed = 0;
    let integrationSkipped = 0;

    if (integrationEmails.length > 0) {
      const rows: IntegrationError[] = [];
      for (const email of integrationEmails) {
        const parsed = parseIntegrationEmail(
          email.graph_message_id,
          email.subject,
          email.preview || "",
          email.received_at,
        );
        if (parsed) {
          rows.push(parsed);
        } else {
          integrationSkipped++;
        }
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from("val_integration_errors")
          .upsert(rows, { onConflict: "email_id", ignoreDuplicates: true });

        if (error) {
          console.error(
            "[val-parse-error-emails] Integration upsert error:",
            error,
          );
        } else {
          integrationParsed = rows.length;
        }
      }
    }

    return Response.json({
      status: "ok",
      since,
      importer_errors: {
        emails_found: importerEmails.length,
        parsed: importerParsed,
        skipped: importerSkipped,
      },
      integration_errors: {
        emails_found: integrationEmails.length,
        parsed: integrationParsed,
        skipped: integrationSkipped,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[val-parse-error-emails] Fatal error:", message);
    return Response.json({ status: "error", message }, { status: 500 });
  }
});
