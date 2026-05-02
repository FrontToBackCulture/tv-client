// src/modules/documentation/DocumentationModule.tsx
// Internal docs portal — mirrors tv-website /docs sourced from docs_sections + docs_pages.

import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronRight, FileText, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";
import { EmptyState } from "../../components/EmptyState";
import { useViewContextStore } from "../../stores/viewContextStore";
import { useAppStore } from "../../stores/appStore";
import {
  useDocsSections,
  useDocsPagesBySection,
} from "../../hooks/documentation";
import type { DocsSection } from "../../lib/documentation/types";

// Sections rendered as deep-links to their existing tv-client modules instead
// of as markdown indexes. The website hard-codes catalogs for these too.
const MODULE_LINK_SECTIONS: Record<string, { module: "skills" | "mcp-tools"; label: string }> = {
  skills: { module: "skills", label: "Open Skills module" },
  "mcp-tools": { module: "mcp-tools", label: "Open MCP Tools module" },
};

export function DocumentationModule() {
  const { data: sections = [], isLoading: sectionsLoading } = useDocsSections();
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  // Default to first section once loaded
  useEffect(() => {
    if (!selectedSectionId && sections.length > 0) {
      setSelectedSectionId(sections[0].id);
    }
  }, [sections, selectedSectionId]);

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  );

  const setViewContext = useViewContextStore((s) => s.setView);
  useEffect(() => {
    setViewContext(selectedSection?.slug ?? "documentation", selectedSection?.title ?? "Documentation");
  }, [selectedSection, setViewContext]);

  return (
    <div className="h-full flex bg-white dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <BookOpen size={16} className="text-teal-600" />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Documentation</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {sectionsLoading && (
            <div className="px-4 py-2 text-xs text-zinc-500">Loading…</div>
          )}
          {!sectionsLoading && sections.length === 0 && (
            <div className="px-4 py-2 text-xs text-zinc-500">No sections.</div>
          )}
          {sections.map((section) => (
            <SectionItem
              key={section.id}
              section={section}
              active={section.id === selectedSectionId}
              onSelect={() => {
                setSelectedSectionId(section.id);
                setSelectedPageId(null);
              }}
              activePageId={section.id === selectedSectionId ? selectedPageId : null}
              onSelectPage={(pageId) => setSelectedPageId(pageId)}
            />
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {selectedSection ? (
          <SectionContent
            section={selectedSection}
            selectedPageId={selectedPageId}
            onSelectPage={setSelectedPageId}
          />
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Documentation"
            message={sectionsLoading ? "Loading…" : "Select a section from the sidebar."}
          />
        )}
      </main>
    </div>
  );
}

function SectionItem({
  section,
  active,
  onSelect,
  activePageId,
  onSelectPage,
}: {
  section: DocsSection;
  active: boolean;
  onSelect: () => void;
  activePageId: string | null;
  onSelectPage: (pageId: string) => void;
}) {
  const moduleLink = MODULE_LINK_SECTIONS[section.slug];
  // Only fetch pages for the active section (saves queries for other sections)
  const { data: pages = [] } = useDocsPagesBySection(active && !moduleLink ? section.id : null);

  return (
    <div className="mb-1">
      <button
        onClick={onSelect}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left transition-colors",
          active
            ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        )}
      >
        <ChevronRight
          size={12}
          className={cn(
            "text-zinc-400 transition-transform",
            active && "rotate-90"
          )}
        />
        <span className="truncate">{section.title}</span>
      </button>
      {active && !moduleLink && pages.length > 0 && (
        <div className="ml-6 mt-0.5">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectPage(p.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1 text-xs text-left rounded transition-colors",
                activePageId === p.id
                  ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              )}
            >
              <FileText size={12} className="text-zinc-400 flex-shrink-0" />
              <span className="truncate">{p.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionContent({
  section,
  selectedPageId,
  onSelectPage,
}: {
  section: DocsSection;
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
}) {
  const moduleLink = MODULE_LINK_SECTIONS[section.slug];
  if (moduleLink) {
    return <ModuleLinkPlaceholder section={section} link={moduleLink} />;
  }

  const { data: pages = [], isLoading } = useDocsPagesBySection(section.id);
  const selectedPage = pages.find((p) => p.id === selectedPageId) ?? null;

  if (selectedPage) {
    return (
      <article className="max-w-3xl mx-auto px-8 py-10">
        <nav className="text-xs text-zinc-500 mb-4 flex items-center gap-1.5">
          <button
            onClick={() => onSelectPage("")}
            className="hover:text-teal-600 transition-colors"
          >
            {section.title}
          </button>
          <ChevronRight size={12} />
          <span className="text-zinc-700 dark:text-zinc-300">{selectedPage.title}</span>
        </nav>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {selectedPage.title}
          </h1>
          {selectedPage.summary && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{selectedPage.summary}</p>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
            <span>Updated {new Date(selectedPage.updated_at).toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "numeric" })}</span>
            {selectedPage.tags.length > 0 && (
              <span className="flex items-center gap-1">
                {selectedPage.tags.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{t}</span>
                ))}
              </span>
            )}
          </div>
        </header>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedPage.body_md}</ReactMarkdown>
        </div>
      </article>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{section.title}</h1>
        {section.description && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{section.description}</p>
        )}
      </header>
      {isLoading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : pages.length === 0 ? (
        <div className="text-sm text-zinc-500">No pages in this section yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectPage(p.id)}
              className="text-left p-4 rounded-md border border-zinc-200 dark:border-zinc-800 hover:border-teal-500 dark:hover:border-teal-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              {p.tags[0] && (
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">— {p.tags[0]}</div>
              )}
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.title}</div>
              {p.summary && (
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">{p.summary}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleLinkPlaceholder({
  section,
  link,
}: {
  section: DocsSection;
  link: { module: "skills" | "mcp-tools"; label: string };
}) {
  const setActiveModule = useAppStore((s) => s.setActiveModule);
  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{section.title}</h1>
        {section.description && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{section.description}</p>
        )}
      </header>
      <div className="p-4 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
          This catalog lives in its own module — open it for filters, schemas, and live data.
        </p>
        <button
          onClick={() => setActiveModule(link.module)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors"
        >
          <ExternalLink size={14} />
          {link.label}
        </button>
      </div>
    </div>
  );
}
