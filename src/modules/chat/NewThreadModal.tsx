// New thread modal — create a conversation optionally linked to an entity

import { useState, useEffect, useRef } from "react";
import { X, Hash, Building2, CheckSquare, FolderOpen, Briefcase, Search } from "lucide-react";
import { useEntityMentionSearch } from "../../hooks/chat";

type EntityType = "general" | "crm_company" | "crm_deal" | "task" | "project";

const entityTypeOptions: { value: EntityType; label: string; icon: typeof Hash; accent: string }[] = [
  { value: "general",      label: "General",  icon: Hash,        accent: "text-[var(--text-secondary)]" },
  { value: "crm_company",  label: "Company",  icon: Building2,   accent: "text-[var(--color-info)]" },
  { value: "crm_deal",     label: "Deal",     icon: Briefcase,   accent: "text-[var(--color-success)]" },
  { value: "task",          label: "Task",     icon: CheckSquare, accent: "text-[var(--color-warning)]" },
  { value: "project",       label: "Project",  icon: FolderOpen,  accent: "text-[var(--color-purple)]" },
];

const entityTypeToSearchType: Record<string, string> = {
  crm_company: "company",
  crm_deal: "project",
  task: "task",
  project: "project",
};

interface NewThreadModalProps {
  onClose: () => void;
  onCreate: (params: {
    title: string;
    body: string;
    entityType: string;
    entityId: string;
  }) => void;
}

export function NewThreadModal({ onClose, onCreate }: NewThreadModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("general");
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<{ id: string; label: string } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const searchType = entityTypeToSearchType[entityType] || "";
  const { data: searchResults = [] } = useEntityMentionSearch(
    entityType !== "general" && !selectedEntity ? entitySearch : ""
  );
  const filteredResults = searchResults.filter(
    (r) => searchType === "company" ? r.type === "company" : (r.type === "task" || r.type === "project")
  );

  // Auto-focus title
  useEffect(() => {
    requestAnimationFrame(() => titleRef.current?.focus());
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function handleSubmit() {
    if (!title.trim() || !body.trim()) return;
    if (entityType !== "general" && !selectedEntity) return;

    onCreate({
      title: title.trim(),
      body: body.trim(),
      entityType: entityType === "general" ? "general" : entityType,
      entityId: entityType === "general" ? crypto.randomUUID() : selectedEntity!.id,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px]" />

      {/* Modal */}
      <div
        className="relative bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl shadow-xl w-full max-w-[440px] border border-[var(--border-default)] overflow-hidden animate-fade-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-default)]">
          <h3 className="font-heading text-[15px] text-[var(--text-primary)]">
            New Thread
          </h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors duration-150"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Title
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's this about?"
              className="w-full text-[13px] bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] border-0 rounded-xl px-3.5 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition-shadow"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
            />
          </div>

          {/* Entity type selector */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Link to
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {entityTypeOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = entityType === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setEntityType(opt.value);
                      setSelectedEntity(null);
                      setEntitySearch("");
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-[var(--color-teal-light)] dark:bg-[var(--color-teal-light)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20"
                        : "bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <Icon size={12} className={isActive ? "text-[var(--color-accent)]" : opt.accent} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Entity search */}
          {entityType !== "general" && (
            <div>
              {selectedEntity ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-teal-light)] dark:bg-[var(--color-teal-light)] border border-[var(--color-accent)]/15 rounded-xl">
                  <span className="text-[12px] font-medium text-[var(--color-accent)]">
                    {selectedEntity.label}
                  </span>
                  <button
                    onClick={() => setSelectedEntity(null)}
                    className="ml-auto p-0.5 rounded text-[var(--color-accent)] hover:opacity-70"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder={`Search ${entityTypeOptions.find((o) => o.value === entityType)?.label.toLowerCase()}...`}
                    className="w-full text-[13px] bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] border-0 rounded-xl pl-9 pr-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition-shadow"
                  />
                  {filteredResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--bg-elevated)] dark:bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden z-10 animate-fade-slide-in">
                      {filteredResults.map((result) => (
                        <button
                          key={result.id}
                          onClick={() => setSelectedEntity({ id: result.id, label: result.label })}
                          className="w-full text-left px-3.5 py-2 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)] dark:hover:bg-[var(--bg-muted)] transition-colors"
                        >
                          {result.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Opening message */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Start the conversation..."
              rows={3}
              className="w-full text-[13px] bg-[var(--bg-muted)] dark:bg-[var(--bg-muted)] border-0 rounded-xl px-3.5 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition-shadow"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-page)] dark:bg-[var(--bg-page)]">
          <span className="text-[10px] text-[var(--text-muted)]">
            <kbd className="px-1 py-0.5 rounded bg-[var(--bg-muted)] text-[9px] font-mono">⌘↵</kbd> to create
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-muted)] transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || !body.trim() || (entityType !== "general" && !selectedEntity)}
              className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
