#!/usr/bin/env node

/**
 * Sync emails from tv-knowledge index.json → Supabase `emails` table
 *
 * Usage:
 *   node scripts/sync-emails-to-supabase.mjs [--dry-run] [--limit N]
 *
 * Reads the email index from tv-knowledge, maps domains to CRM companies,
 * and upserts email metadata into the `emails` table.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Config — uses service key if available, falls back to anon key (RLS is permissive)
const SUPABASE_URL = "https://cqwcaeffzanfqsxlspig.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxd2NhZWZmemFuZnFzeGxzcGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzE2MzIsImV4cCI6MjA5MDcwNzYzMn0.4UjeZdVjB7z-_sTWP6BRqHINkpTxA6jhP6ZabvKQC_0";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : null;

// Paths
const TV_KNOWLEDGE = resolve(
  process.env.HOME,
  "Library/CloudStorage/Dropbox-Thinkval/ThinkVAL team folder/SkyNet/tv-knowledge"
);
const INDEX_PATH = resolve(TV_KNOWLEDGE, "_team/melvin/emails/index.json");
const CONTACTS_PATH = resolve(TV_KNOWLEDGE, "_team/melvin/emails/contacts.json");

async function main() {
  console.log("Loading email index...");
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
  const contacts = JSON.parse(readFileSync(CONTACTS_PATH, "utf-8"));

  console.log(`Found ${index.emails.length} emails in index`);

  // Load CRM companies + contacts for domain matching
  console.log("Loading CRM companies...");
  const { data: companies } = await supabase
    .from("crm_companies")
    .select("id, name, website");

  const { data: crmContacts } = await supabase
    .from("crm_contacts")
    .select("id, company_id, email");

  // Build domain → company_id map from CRM contacts
  const domainToCompany = new Map();
  const emailToContact = new Map();

  for (const contact of crmContacts || []) {
    if (!contact.email) continue;
    const domain = contact.email.split("@")[1]?.toLowerCase();
    emailToContact.set(contact.email.toLowerCase(), contact);
    if (domain && contact.company_id) {
      domainToCompany.set(domain, contact.company_id);
    }
  }

  // Also map from company websites
  for (const company of companies || []) {
    if (!company.website) continue;
    const domain = company.website
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (!domainToCompany.has(domain)) {
      domainToCompany.set(domain, company.id);
    }
  }

  console.log(`Mapped ${domainToCompany.size} domains to companies`);

  // Transform emails
  let emails = index.emails;
  if (limit) emails = emails.slice(0, limit);

  // Sanitize string: remove lone surrogates and optionally truncate
  function sanitizeText(str, maxLen) {
    if (!str) return null;
    // Remove lone surrogates (broken emoji from upstream truncation)
    let clean = str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
                    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
    if (maxLen && clean.length > maxLen) {
      let end = maxLen;
      const code = clean.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end--;
      clean = clean.substring(0, end);
    }
    return clean;
  }

  // Sanitize to/cc — ensure they're always arrays of strings (fixes JSON parse errors)
  function sanitizeEmailList(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter((v) => typeof v === "string");
    if (typeof val === "string") return [val];
    return [];
  }

  const rows = emails.map((e) => {
    const fromDomain = e.from?.email?.split("@")[1]?.toLowerCase();
    const matchedContact = emailToContact.get(e.from?.email?.toLowerCase());
    let companyId = matchedContact?.company_id || domainToCompany.get(fromDomain) || null;
    let contactId = matchedContact?.id || null;

    // For sent emails (from you), also check to/cc recipients for matches
    // Skip your own domain to avoid matching every email to ThinkVAL
    const ownDomains = new Set(["thinkval.com", "thinkval.co"]);
    if (!companyId) {
      const recipients = [...(Array.isArray(e.to) ? e.to : []), ...(Array.isArray(e.cc) ? e.cc : [])];
      for (const addr of recipients) {
        const email = (typeof addr === "string" ? addr : "").toLowerCase();
        const domain = email.split("@")[1];
        if (ownDomains.has(domain)) continue; // skip internal recipients
        const rc = emailToContact.get(email);
        if (rc?.company_id) { companyId = rc.company_id; contactId = contactId || rc.id; break; }
        if (domain && domainToCompany.has(domain)) { companyId = domainToCompany.get(domain); break; }
      }
    }

    return {
      outlook_id: e.id,
      conversation_id: e.conversationId || null,
      subject: sanitizeText(e.subject) || null,
      from_email: e.from?.email || "unknown",
      from_name: sanitizeText(e.from?.name) || null,
      to_emails: sanitizeEmailList(e.to),
      cc_emails: sanitizeEmailList(e.cc),
      received_at: e.receivedAt || null,
      is_read: e.isRead || false,
      has_attachments: e.hasAttachments || false,
      folder: e.folder || null,
      file_path: e.filePath || null,
      body_preview: sanitizeText(e.bodyPreview, 500),
      classification_category: e.classification?.category || null,
      classification_confidence: e.classification?.confidence || null,
      action_required: e.analysis?.actionRequired || false,
      urgency: e.analysis?.urgency || null,
      company_id: companyId,
      contact_id: contactId,
    };
  });

  // Find email senders that have a company match but no contact match — create contacts
  const ownDomainsForContacts = new Set(["thinkval.com", "thinkval.co"]);
  const newContacts = new Map(); // email -> { name, company_id }
  for (const e of emails) {
    const email = e.from?.email?.toLowerCase();
    if (!email) continue;
    if (emailToContact.has(email)) continue; // already a contact
    const domain = email.split("@")[1];
    if (ownDomainsForContacts.has(domain)) continue; // skip own company
    const companyId = domainToCompany.get(domain);
    if (!companyId) continue; // no company match
    if (newContacts.has(email)) continue; // already queued

    // Derive name from email (e.g. "john.smith@company.com" → "John Smith")
    const fromName = e.from?.name;
    let name = fromName;
    if (!name || name === email) {
      const local = email.split("@")[0];
      name = local
        .replace(/[._]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    newContacts.set(email, { name, email, company_id: companyId, is_primary: false, is_active: true });
  }

  console.log(`Prepared ${rows.length} rows for upsert`);
  console.log(`Found ${newContacts.size} new contacts to create`);

  if (dryRun) {
    console.log("\n--- DRY RUN ---");
    console.log(`Would upsert ${rows.length} emails`);
    const withCompany = rows.filter((r) => r.company_id);
    const withContact = rows.filter((r) => r.contact_id);
    console.log(`  ${withCompany.length} matched to a company`);
    console.log(`  ${withContact.length} matched to a contact`);
    console.log(`  ${newContacts.size} new contacts would be created`);
    if (newContacts.size > 0) {
      const sample = [...newContacts.entries()].slice(0, 5);
      console.log("\nSample new contacts:");
      for (const [email, c] of sample) {
        console.log(`  ${c.name} <${email}> → company ${c.company_id}`);
      }
    }
    console.log("\nSample email row:", JSON.stringify(rows[0], null, 2));
    return;
  }

  // Step 1: Create new contacts
  if (newContacts.size > 0) {
    console.log("\nCreating new contacts...");
    const contactRows = [...newContacts.values()];
    const CONTACT_BATCH = 100;
    let created = 0;

    for (let i = 0; i < contactRows.length; i += CONTACT_BATCH) {
      const batch = contactRows.slice(i, i + CONTACT_BATCH);
      const { data, error } = await supabase
        .from("crm_contacts")
        .upsert(batch, { onConflict: "email", ignoreDuplicates: true })
        .select("id, email, company_id");

      if (error) {
        console.error(`  Contact batch ${i} failed:`, error.message);
      } else {
        created += data?.length || 0;
        // Update our lookup maps with the new contacts
        for (const c of data || []) {
          emailToContact.set(c.email.toLowerCase(), c);
        }
      }
    }
    console.log(`  Created ${created} contacts`);

    // Re-map rows with newly created contacts
    for (const row of rows) {
      if (row.contact_id) continue;
      const contact = emailToContact.get(row.from_email?.toLowerCase());
      if (contact) {
        row.contact_id = contact.id;
        if (!row.company_id) row.company_id = contact.company_id;
      }
    }
  }

  // Step 2: Upsert emails in batches of 500
  console.log("\nSyncing emails...");
  const BATCH_SIZE = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("emails")
      .upsert(batch, { onConflict: "outlook_id", ignoreDuplicates: false });

    if (error) {
      console.error(`\n  Batch ${i}-${i + batch.length} failed:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  Synced ${inserted}/${rows.length}...`);
    }
  }

  console.log(`\n  Done! Synced ${inserted} emails (${errors} errors)`);

  // Step 3: Auto-link emails to companies and contacts in email_entity_links
  console.log("\nLinking emails to companies and contacts...");

  // Get all synced emails with company/contact IDs
  const { data: linkedEmails } = await supabase
    .from("emails")
    .select("id, company_id, contact_id")
    .not("company_id", "is", null);

  if (linkedEmails?.length) {
    const links = [];
    for (const e of linkedEmails) {
      // Link to company
      links.push({
        email_type: "correspondence",
        email_id: e.id,
        entity_type: "company",
        entity_id: e.company_id,
        match_method: "auto_domain",
        relevance_score: 0.8,
      });
      // Link to contact if available
      if (e.contact_id) {
        links.push({
          email_type: "correspondence",
          email_id: e.id,
          entity_type: "contact",
          entity_id: e.contact_id,
          match_method: "auto_contact",
          relevance_score: 0.9,
        });
      }
    }

    const LINK_BATCH = 500;
    let linked = 0;
    for (let i = 0; i < links.length; i += LINK_BATCH) {
      const batch = links.slice(i, i + LINK_BATCH);
      const { error } = await supabase
        .from("email_entity_links")
        .upsert(batch, {
          onConflict: "email_type,email_id,entity_type,entity_id",
          ignoreDuplicates: true,
        });

      if (error) {
        console.error(`  Link batch ${i} failed:`, error.message);
      } else {
        linked += batch.length;
      }
    }
    console.log(`  Linked ${linked} email→entity relationships`);
  }

  console.log("\nAll done!");
}

main().catch(console.error);
