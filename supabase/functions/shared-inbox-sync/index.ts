// Supabase Edge Function: Sync shared mailboxes from Microsoft Graph
// Designed to run on a cron schedule (every 5 minutes).
//
// POST /shared-inbox-sync
// Body: { mailbox_id?: string }  — sync one mailbox, or all active if omitted
//
// For each active mailbox:
//   1. Refresh access token if expired
//   2. Delta query Graph /messages endpoint
//   3. Upsert new/changed emails, hard-delete removed ones
//   4. Store new delta link for next run

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SELECT_FIELDS = "id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,body,importance,isRead,hasAttachments,webLink";
const PAGE_SIZE = 50;

// ─── Token Refresh ─────────────────────────────

async function refreshAccessToken(creds: {
  mailbox_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  tenant_id: string;
  client_id: string;
  client_secret: string;
}): Promise<string> {
  // Check if current token is still valid (with 2 min buffer)
  if (creds.access_token && creds.access_token_expires_at) {
    const expiresAt = new Date(creds.access_token_expires_at).getTime();
    if (Date.now() < expiresAt - 120_000) {
      return creds.access_token;
    }
  }

  const tokenUrl = `https://login.microsoftonline.com/${creds.tenant_id}/oauth2/v2.0/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
      scope: "offline_access Mail.Read",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Update stored tokens
  await supabase
    .from("shared_mailbox_credentials")
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
      // MS may rotate refresh token
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("mailbox_id", creds.mailbox_id);

  return tokens.access_token;
}

// ─── Graph Delta Sync ──────────────────────────

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress: { name?: string; address?: string } }>;
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  importance?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  webLink?: string;
  "@removed"?: { reason: string };
}

function mapRecipients(list?: Array<{ emailAddress: { name?: string; address?: string } }>) {
  return (list || []).map((r) => ({
    name: r.emailAddress?.name || "",
    email: r.emailAddress?.address || "",
  }));
}

// Folders to sync via delta (for ongoing incremental updates)
const SYNC_FOLDERS = [
  { graphFolder: "Inbox", folderName: "Inbox", deltaCol: "delta_link" },
  { graphFolder: "SentItems", folderName: "Sent Items", deltaCol: "delta_link_sent" },
] as const;

async function syncFolder(
  mailboxId: string,
  emailAddress: string,
  accessToken: string,
  folder: typeof SYNC_FOLDERS[number],
  existingDeltaLink: string | null,
): Promise<{ upserted: number; deleted: number; deltaLink: string | null }> {
  let upserted = 0;
  let deleted = 0;
  let nextLink: string | null = null;
  let deltaLink: string | null = null;

  let url: string;
  if (existingDeltaLink) {
    url = existingDeltaLink;
  } else if (folder.graphFolder) {
    url = `${GRAPH_BASE}/me/mailFolders/${folder.graphFolder}/messages/delta?$select=${SELECT_FIELDS}&$top=${PAGE_SIZE}`;
  } else {
    // All messages across all folders
    url = `${GRAPH_BASE}/me/messages/delta?$select=${SELECT_FIELDS}&$top=${PAGE_SIZE}`;
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  do {
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 410 || errText.includes("SyncStateNotFound")) {
        console.log(`[shared-inbox-sync] Delta expired for ${emailAddress}/${folder.folderName}, resetting`);
        url = `${GRAPH_BASE}/me/mailFolders/${folder.graphFolder}/messages/delta?$select=${SELECT_FIELDS}&$top=${PAGE_SIZE}`;
        continue;
      }
      throw new Error(`Graph API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const messages: GraphMessage[] = data.value || [];

    const toUpsert: any[] = [];
    const toDelete: string[] = [];

    for (const msg of messages) {
      if (msg["@removed"]) {
        toDelete.push(msg.id);
        continue;
      }

      toUpsert.push({
        mailbox_id: mailboxId,
        graph_message_id: msg.id,
        conversation_id: msg.conversationId || null,
        subject: msg.subject || "(no subject)",
        from_name: msg.from?.emailAddress?.name || "",
        from_email: msg.from?.emailAddress?.address || "",
        to_addresses: mapRecipients(msg.toRecipients),
        cc_addresses: mapRecipients(msg.ccRecipients),
        received_at: msg.receivedDateTime || null,
        preview: msg.bodyPreview || null,
        body_html: msg.body?.contentType === "html" ? msg.body.content : null,
        has_attachments: msg.hasAttachments || false,
        importance: msg.importance || "normal",
        is_read_in_source: msg.isRead || false,
        web_link: msg.webLink || null,
        folder_name: folder.folderName,
        raw: msg,
      });
    }

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("shared_emails")
        .upsert(toUpsert, { onConflict: "mailbox_id,graph_message_id" });
      if (error) console.error(`[shared-inbox-sync] upsert error (${folder.folderName}):`, error);
      else upserted += toUpsert.length;
    }

    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("shared_emails")
        .delete()
        .eq("mailbox_id", mailboxId)
        .in("graph_message_id", toDelete);
      if (error) console.error(`[shared-inbox-sync] delete error (${folder.folderName}):`, error);
      else deleted += toDelete.length;
    }

    nextLink = data["@odata.nextLink"] || null;
    deltaLink = data["@odata.deltaLink"] || null;
    if (nextLink) url = nextLink;
  } while (nextLink);

  return { upserted, deleted, deltaLink };
}

// Backfill: fetch all messages across all folders using regular /me/messages
// with a date filter. Used for initial sync to grab historical emails.
// Subsequent syncs use delta queries per-folder for efficiency.
async function backfillAllMessages(
  mailboxId: string,
  accessToken: string,
  sinceDate: string, // ISO date like "2026-03-22"
): Promise<number> {
  let upserted = 0;
  let url: string | null = `${GRAPH_BASE}/me/messages?$select=${SELECT_FIELDS},parentFolderId&$filter=receivedDateTime ge ${sinceDate}T00:00:00Z&$top=${PAGE_SIZE}&$orderby=receivedDateTime desc`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Fetch folder names map
  const foldersRes = await fetch(`${GRAPH_BASE}/me/mailFolders?$select=id,displayName&$top=50`, { headers });
  const folderMap: Record<string, string> = {};
  if (foldersRes.ok) {
    const foldersData = await foldersRes.json();
    for (const f of (foldersData.value || [])) {
      folderMap[f.id] = f.displayName;
    }
  }

  do {
    const res = await fetch(url!, { headers });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[shared-inbox-sync] backfill error:`, errText);
      break;
    }

    const data = await res.json();
    const messages: (GraphMessage & { parentFolderId?: string })[] = data.value || [];

    const toUpsert: any[] = [];
    for (const msg of messages) {
      const folderName = folderMap[msg.parentFolderId || ""] || "Other";
      toUpsert.push({
        mailbox_id: mailboxId,
        graph_message_id: msg.id,
        conversation_id: msg.conversationId || null,
        subject: msg.subject || "(no subject)",
        from_name: msg.from?.emailAddress?.name || "",
        from_email: msg.from?.emailAddress?.address || "",
        to_addresses: mapRecipients(msg.toRecipients),
        cc_addresses: mapRecipients(msg.ccRecipients),
        received_at: msg.receivedDateTime || null,
        preview: msg.bodyPreview || null,
        body_html: msg.body?.contentType === "html" ? msg.body.content : null,
        has_attachments: msg.hasAttachments || false,
        importance: msg.importance || "normal",
        is_read_in_source: msg.isRead || false,
        web_link: msg.webLink || null,
        folder_name: folderName,
        raw: msg,
      });
    }

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("shared_emails")
        .upsert(toUpsert, { onConflict: "mailbox_id,graph_message_id" });
      if (error) console.error(`[shared-inbox-sync] backfill upsert error:`, error);
      else upserted += toUpsert.length;
    }

    url = data["@odata.nextLink"] || null;
  } while (url);

  return upserted;
}

async function syncMailbox(mailboxId: string, emailAddress: string, creds: any, backfillSince?: string) {
  const accessToken = await refreshAccessToken(creds);

  let totalUpserted = 0;
  let totalDeleted = 0;

  // If backfill requested, do a full scan across all folders first
  if (backfillSince) {
    const backfilled = await backfillAllMessages(mailboxId, accessToken, backfillSince);
    totalUpserted += backfilled;
    console.log(`[shared-inbox-sync] backfilled ${backfilled} messages since ${backfillSince}`);
  }

  // Then do delta sync per folder for ongoing tracking
  for (const folder of SYNC_FOLDERS) {
    const existingDelta = creds[folder.deltaCol] || null;
    const result = await syncFolder(mailboxId, emailAddress, accessToken, folder, existingDelta);
    totalUpserted += result.upserted;
    totalDeleted += result.deleted;

    if (result.deltaLink) {
      await supabase
        .from("shared_mailbox_credentials")
        .update({ [folder.deltaCol]: result.deltaLink, updated_at: new Date().toISOString() })
        .eq("mailbox_id", mailboxId);
    }
  }

  await supabase
    .from("shared_mailboxes")
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq("id", mailboxId);

  return { upserted: totalUpserted, deleted: totalDeleted };
}

// ─── Main Handler ──────────────────────────────

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
    const targetMailboxId = body.mailbox_id || null;
    const backfillSince: string | undefined = body.backfill_since || undefined;

    // Get mailboxes to sync
    let query = supabase
      .from("shared_mailboxes")
      .select("id, email_address")
      .eq("active", true);

    if (targetMailboxId) {
      query = query.eq("id", targetMailboxId);
    }

    const { data: mailboxes, error: mbErr } = await query;
    if (mbErr) throw mbErr;
    if (!mailboxes || mailboxes.length === 0) {
      return Response.json({ status: "ok", message: "No active mailboxes to sync" });
    }

    const results: Record<string, any> = {};

    for (const mb of mailboxes) {
      try {
        // Load credentials
        const { data: creds, error: credErr } = await supabase
          .from("shared_mailbox_credentials")
          .select("*")
          .eq("mailbox_id", mb.id)
          .single();

        if (credErr || !creds) {
          results[mb.email_address] = { error: "No credentials found" };
          await supabase
            .from("shared_mailboxes")
            .update({ last_sync_error: "No credentials found" })
            .eq("id", mb.id);
          continue;
        }

        const result = await syncMailbox(mb.id, mb.email_address, creds, backfillSince);
        results[mb.email_address] = { status: "ok", ...result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[shared-inbox-sync] ${mb.email_address} failed:`, msg);
        results[mb.email_address] = { error: msg };
        await supabase
          .from("shared_mailboxes")
          .update({ last_sync_error: msg })
          .eq("id", mb.id);
      }
    }

    return Response.json({ status: "ok", results });
  } catch (err) {
    console.error("[shared-inbox-sync] error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
});
