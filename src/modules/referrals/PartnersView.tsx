// src/modules/referrals/PartnersView.tsx
// View partner access codes, last accessed, and active status

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Clock, Copy, Check, Layers, CheckCircle2, XCircle, Plus, X } from "lucide-react";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { cn } from "../../lib/cn";
import { toast } from "../../stores/toastStore";

interface PartnerRecord {
  id: string;
  name: string;
  code: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  last_accessed: string | null;
  created_at: string;
}

type Filter = "all" | "active" | "inactive";

const FILTERS: { id: Filter; label: string; icon: typeof Layers }[] = [
  { id: "all", label: "All", icon: Layers },
  { id: "active", label: "Active", icon: CheckCircle2 },
  { id: "inactive", label: "Inactive", icon: XCircle },
];

function usePartners() {
  return useQuery({
    queryKey: ["partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_access")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as PartnerRecord[];
    },
  });
}

async function generateAccessCode(): Promise<{ code: string; codeHash: string }> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const random = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => chars[b % chars.length])
    .join("");
  const code = `VAL-${random}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const codeHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { code, codeHash };
}

export function PartnersView() {
  const { data: partners = [], isLoading } = usePartners();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", company: "", phone: "" });

  const [filter, setFilter] = useState<Filter>(() => {
    try {
      return (localStorage.getItem("partners-filter") as Filter) || "active";
    } catch {
      return "active";
    }
  });
  const handleSetFilter = (f: Filter) => {
    setFilter(f);
    try { localStorage.setItem("partners-filter", f); } catch {/* ignore */}
  };

  const counts = useMemo(() => ({
    all: partners.length,
    active: partners.filter((p) => p.active).length,
    inactive: partners.filter((p) => !p.active).length,
  }), [partners]);

  const filtered = useMemo(() => {
    if (filter === "all") return partners;
    return partners.filter((p) => (filter === "active" ? p.active : !p.active));
  }, [partners, filter]);

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resetAddForm = () => {
    setAddForm({ name: "", email: "", company: "", phone: "" });
    setShowAddForm(false);
  };

  const handleCreatePartner = async () => {
    const name = addForm.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const { code, codeHash } = await generateAccessCode();
      const { error } = await supabase.from("partner_access").insert({
        name,
        email: addForm.email.trim() || null,
        company: addForm.company.trim() || null,
        phone: addForm.phone.trim() || null,
        code,
        code_hash: codeHash,
        active: true,
      });
      if (error) {
        toast.error(`Failed to create partner: ${error.message}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["partners"] });
      toast.success(`Partner created — code ${code}`);
      resetAddForm();
    } finally {
      setSubmitting(false);
    }
  };

  const itemBase = "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors";
  const itemActive = "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400";
  const itemIdle = "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50";

  return (
    <div className="h-full flex overflow-hidden px-4 py-4">
     <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
        <div className="h-full flex flex-col overflow-y-auto px-3 py-3 space-y-3">
          <CollapsibleSection title="Status" storageKey="partners-status">
            {FILTERS.map((f) => {
              const Icon = f.icon;
              const isActive = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => handleSetFilter(f.id)}
                  className={cn(itemBase, isActive ? itemActive : itemIdle)}
                >
                  <Icon size={13} className={isActive ? "text-teal-500" : "text-zinc-400"} />
                  <span className="flex-1">{f.label}</span>
                  <span className="text-[10px] text-zinc-400">{counts[f.id]}</span>
                </button>
              );
            })}
          </CollapsibleSection>
          <div className="flex-1" />
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-end px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/60">
          {showAddForm ? (
            <button
              onClick={resetAddForm}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors"
            >
              <X size={12} />
              Cancel
            </button>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300 transition-colors"
            >
              <Plus size={12} />
              Add Partner
            </button>
          )}
        </div>
        {showAddForm && (
          <div className="flex-shrink-0 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/60 dark:bg-zinc-900/40 space-y-2">
            <input
              type="text"
              autoFocus
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full text-sm font-medium px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Name (required)"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Email"
              />
              <input
                type="text"
                value={addForm.company}
                onChange={(e) => setAddForm((f) => ({ ...f, company: e.target.value }))}
                className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Company"
              />
            </div>
            <input
              type="text"
              value={addForm.phone}
              onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Phone"
            />
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-zinc-400">Access code is generated automatically</p>
              <button
                onClick={handleCreatePartner}
                disabled={submitting || !addForm.name.trim()}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={12} />
                {submitting ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-zinc-400">Loading...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-zinc-400">No partners</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className={`px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
                    !p.active ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          {p.name}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            p.active
                              ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20"
                              : "text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800"
                          }`}
                        >
                          {p.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {p.company && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {p.company}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {p.last_accessed && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                            <Clock size={10} />
                            Last active{" "}
                            {new Date(p.last_accessed).toLocaleDateString("en-SG", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                        {p.email && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {p.email}
                          </span>
                        )}
                      </div>
                    </div>

                    {p.code && (
                      <button
                        onClick={() => handleCopy(p.code!, p.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        title="Copy access code"
                      >
                        <code className="text-xs font-mono text-zinc-600 dark:text-zinc-300">
                          {p.code}
                        </code>
                        {copiedId === p.id ? (
                          <Check size={12} className="text-green-500" />
                        ) : (
                          <Copy size={12} className="text-zinc-400" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
     </div>
    </div>
  );
}
