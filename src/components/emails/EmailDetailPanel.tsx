// Email detail slide-over — shows full email body with metadata
// Fetches body from local SQLite first, falls back to email_cache preview

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../../lib/supabase";
import { ItemDetailPanel } from "../ui/ItemDetailPanel";
import { Loader2, Mail } from "lucide-react";
import type { LinkedEmail } from "../../hooks/email/useEntityEmails";

interface EmailDetailPanelProps {
  email: LinkedEmail | null;
  onClose: () => void;
}

function stripScripts(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function EmailDetailPanel({ email, onClose }: EmailDetailPanelProps) {
  const [body, setBody] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email) {
      setBody(null);
      setIsPreview(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setBody(null);
    setIsPreview(false);

    async function fetchBody() {
      // Try local SQLite first (has full HTML body)
      try {
        const htmlBody = await invoke<string>("outlook_get_email_body", { id: email!.email_id });
        if (!cancelled && htmlBody) {
          setBody(stripScripts(htmlBody));
          setLoading(false);
          return;
        }
      } catch {
        // Local not available
      }

      // Fall back to email_cache body_preview
      try {
        const { data } = await supabase
          .from("email_cache")
          .select("body_preview")
          .eq("id", email!.email_id)
          .single();

        if (!cancelled && data?.body_preview) {
          setBody(data.body_preview);
          setIsPreview(true);
        }
      } catch {
        // No cached data either
      }

      if (!cancelled) setLoading(false);
    }

    fetchBody();
    return () => { cancelled = true; };
  }, [email?.email_id]);

  if (!email) return null;

  return (
    <ItemDetailPanel
      open={!!email}
      onClose={onClose}
      title={email.subject || "(no subject)"}
    >
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {/* Metadata */}
        <div className="px-5 py-4 space-y-2.5">
          <MetaRow label="From" value={email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email} />
          {email.to_emails?.length > 0 && (
            <MetaRow label="To" value={email.to_emails.map(r => r.name ? `${r.name} <${r.email}>` : r.email).join(", ")} />
          )}
          {email.cc_emails?.length > 0 && (
            <MetaRow label="CC" value={email.cc_emails.map(r => r.name ? `${r.name} <${r.email}>` : r.email).join(", ")} />
          )}
          <MetaRow label="Date" value={formatDateTime(email.received_at)} />
          {email.email_type === "campaign" && (
            <MetaRow label="Type" value="Campaign (EDM)" />
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          ) : body ? (
            <>
              {isPreview && (
                <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-700 dark:text-amber-400">
                  Preview only — full email body available on the device that linked it
                </div>
              )}
              {isPreview ? (
                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {body}
                </p>
              ) : (
                <div
                  className="text-sm text-zinc-700 dark:text-zinc-300 prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_table]:text-xs"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Mail size={24} className="mb-2 opacity-40" />
              <p className="text-sm">No email body available</p>
            </div>
          )}
        </div>
      </div>
    </ItemDetailPanel>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 w-12 shrink-0 text-right">
        {label}
      </span>
      <span className="text-sm text-zinc-700 dark:text-zinc-300 break-all">
        {value}
      </span>
    </div>
  );
}
