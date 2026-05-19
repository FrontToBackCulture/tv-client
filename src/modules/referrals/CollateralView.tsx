// src/modules/referrals/CollateralView.tsx
// Manage partner-facing sales decks — toggle published, edit metadata

import { useMemo, useState, type FormEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { Eye, EyeOff, Pencil, ExternalLink, X, Check, Layers, Plus, Upload, FileCode, FileDown, Trash2 } from "lucide-react";
import {
  usePartnerDecks,
  useUpdateDeck,
  useCreateDeck,
  useReplaceDeckFile,
  useUploadDeckPdf,
  useRemoveDeckPdf,
  slugify,
  PartnerDeck,
} from "../../hooks/usePartnerDecks";
import { bundleDeckHtml } from "../../lib/deckBundler";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { timeAgoVerbose, formatDateFull } from "../../lib/date";
import { FormModal, FormField, Input } from "../../components/ui";
import { toast } from "../../stores/toastStore";
import { cn } from "../../lib/cn";

type Filter = "all" | "published" | "hidden";

const FILTERS: { id: Filter; label: string; icon: typeof Layers }[] = [
  { id: "all", label: "All", icon: Layers },
  { id: "published", label: "Published", icon: Eye },
  { id: "hidden", label: "Hidden", icon: EyeOff },
];

export function CollateralView() {
  const { data: decks = [], isLoading } = usePartnerDecks();
  const updateDeck = useUpdateDeck();
  const createDeck = useCreateDeck();
  const replaceFile = useReplaceDeckFile();
  const uploadPdf = useUploadDeckPdf();
  const removePdf = useRemoveDeckPdf();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    slug: "",
    slugTouched: false,
    description: "",
    guidance: "",
  });
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [createFileInfo, setCreateFileInfo] = useState<string | null>(null);
  const [createPdf, setCreatePdf] = useState<File | null>(null);
  const [createPdfInfo, setCreatePdfInfo] = useState<string | null>(null);

  // True while a picked .html is being bundled into a self-contained file.
  const [bundling, setBundling] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    guidance: string;
  }>({ title: "", description: "", guidance: "" });

  const [filter, setFilter] = useState<Filter>(() => {
    try {
      return (localStorage.getItem("collateral-filter") as Filter) || "all";
    } catch {
      return "all";
    }
  });

  const handleSetFilter = (f: Filter) => {
    setFilter(f);
    try { localStorage.setItem("collateral-filter", f); } catch {/* ignore */}
  };

  const counts = useMemo(() => ({
    all: decks.length,
    published: decks.filter((d) => d.published).length,
    hidden: decks.filter((d) => !d.published).length,
  }), [decks]);

  const filtered = useMemo(() => {
    if (filter === "all") return decks;
    return decks.filter((d) => (filter === "published" ? d.published : !d.published));
  }, [decks, filter]);

  const handleTogglePublished = (deck: PartnerDeck) => {
    updateDeck.mutate({ id: deck.id, updates: { published: !deck.published } });
  };

  const handleStartEdit = (deck: PartnerDeck) => {
    setEditingId(deck.id);
    setEditForm({
      title: deck.title,
      description: deck.description || "",
      guidance: deck.guidance || "",
    });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    updateDeck.mutate(
      {
        id: editingId,
        updates: {
          title: editForm.title,
          description: editForm.description || null,
          guidance: editForm.guidance || null,
        },
      },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const resetCreate = () => {
    setShowCreate(false);
    setCreateForm({ title: "", slug: "", slugTouched: false, description: "", guidance: "" });
    setCreateFile(null);
    setCreateFileInfo(null);
    setCreatePdf(null);
    setCreatePdfInfo(null);
  };

  // Native PDF picker → File (no bundling; PDFs are self-contained binary).
  const pickPdfFile = async (): Promise<File | null> => {
    const sel = await open({
      multiple: false,
      title: "Select the deck PDF",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!sel || typeof sel !== "string") return null;
    try {
      const bytes = await readFile(sel);
      return new File([bytes], "deck.pdf", { type: "application/pdf" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  const handlePdfPick = async (deck: PartnerDeck) => {
    const file = await pickPdfFile();
    if (!file) return;
    uploadPdf.mutate(
      { id: deck.id, slug: deck.slug, file },
      {
        onSuccess: () => toast.success(`PDF attached to ${deck.slug}`),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handlePdfRemove = (deck: PartnerDeck) => {
    removePdf.mutate(
      { id: deck.id, slug: deck.slug },
      {
        onSuccess: () => toast.success(`PDF removed from ${deck.slug}`),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  // Open a native .html picker, follow its links, and bundle into one
  // self-contained file. Returns null (and toasts) on cancel/error.
  const pickAndBundleFile = async (): Promise<File | null> => {
    const sel = await open({
      multiple: false,
      title: "Select the deck's .html file",
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    });
    if (!sel || typeof sel !== "string") return null;
    setBundling(true);
    try {
      const { html, imageCount, leftover } = await bundleDeckHtml(sel);
      if (leftover.length) {
        toast.error(
          `${leftover.length} link(s) couldn't be resolved: ${leftover
            .slice(0, 3)
            .join(", ")}${leftover.length > 3 ? "…" : ""}`,
        );
        return null;
      }
      const file = new File([html], "deck.html", { type: "text/html" });
      toast.success(
        `Bundled · ${imageCount} image(s) inlined · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
      );
      return file;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBundling(false);
    }
  };

  const previewSlug = slugify(
    createForm.slugTouched ? createForm.slug : createForm.title,
  );

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!createFile) {
      toast.error("Select a deck HTML file");
      return;
    }
    createDeck.mutate(
      {
        slug: previewSlug,
        title: createForm.title,
        description: createForm.description || null,
        guidance: createForm.guidance || null,
        file: createFile,
        pdfFile: createPdf,
      },
      {
        onSuccess: () => {
          toast.success("Deck created — hidden until you publish it");
          resetCreate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleReplacePick = async (deck: PartnerDeck) => {
    const file = await pickAndBundleFile();
    if (!file) return;
    replaceFile.mutate(
      { id: deck.id, slug: deck.slug, file },
      {
        onSuccess: () => toast.success(`Replaced ${deck.slug} · live in ~1 min`),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const websiteUrl = "https://www.thinkval.com";

  const itemBase = "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-xs transition-colors";
  const itemActive = "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400";
  const itemIdle = "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50";

  return (
    <div className="h-full flex overflow-hidden px-4 py-4">
     {showCreate && (
       <FormModal
         title="New deck"
         onClose={resetCreate}
         onSubmit={handleCreate}
         submitLabel="Create deck"
         isSaving={createDeck.isPending}
       >
         <FormField label="Title" required>
           <Input
             value={createForm.title}
             onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
             placeholder="VAL for F&B — Agentic AI Platform"
             autoFocus
           />
         </FormField>
         <FormField
           label="Slug"
           required
           hint={`Share URL: thinkval.com/d/${previewSlug || "…"} · Storage: ${previewSlug || "…"}.html (permanent — pick carefully)`}
         >
           <Input
             value={createForm.slugTouched ? createForm.slug : previewSlug}
             onChange={(e) =>
               setCreateForm((f) => ({ ...f, slug: e.target.value, slugTouched: true }))
             }
             placeholder="val-fandb"
           />
         </FormField>
         <FormField label="Description" hint="What this deck covers (shown in the partner list)">
           <Input
             value={createForm.description}
             onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
             placeholder="Full platform overview — how AI agents automate reconciliation…"
           />
         </FormField>
         <FormField label="Guidance" hint="When a partner should send this deck">
           <Input
             value={createForm.guidance}
             onChange={(e) => setCreateForm((f) => ({ ...f, guidance: e.target.value }))}
             placeholder="First touch. Send when a prospect doesn't know VAL yet."
           />
         </FormField>
         <FormField
           label="Deck HTML"
           required
           hint="Pick the deck's .html — its linked CSS & images are auto-inlined into one self-contained file."
         >
           <button
             type="button"
             disabled={bundling}
             onClick={async () => {
               const f = await pickAndBundleFile();
               if (f) {
                 setCreateFile(f);
                 setCreateFileInfo(`${(f.size / 1024 / 1024).toFixed(1)} MB · self-contained`);
               }
             }}
             className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors disabled:opacity-60"
           >
             <FileCode size={14} />
             {bundling ? "Bundling…" : createFile ? "Choose a different .html" : "Select deck .html"}
           </button>
           {createFile && createFileInfo && (
             <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">
               ✓ Bundled · {createFileInfo}
             </p>
           )}
         </FormField>
         <FormField
           label="PDF (optional)"
           hint="A downloadable PDF version partners can share. Uploaded as-is."
         >
           <button
             type="button"
             onClick={async () => {
               const f = await pickPdfFile();
               if (f) {
                 setCreatePdf(f);
                 setCreatePdfInfo(`${(f.size / 1024 / 1024).toFixed(1)} MB`);
               }
             }}
             className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
           >
             <FileDown size={14} />
             {createPdf ? "Choose a different PDF" : "Select PDF"}
           </button>
           {createPdf && createPdfInfo && (
             <span className="ml-2 inline-flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
               ✓ {createPdfInfo}
               <button
                 type="button"
                 onClick={() => { setCreatePdf(null); setCreatePdfInfo(null); }}
                 className="text-zinc-400 hover:text-red-500"
                 title="Remove PDF"
               >
                 <X size={12} />
               </button>
             </span>
           )}
         </FormField>
       </FormModal>
     )}

     <div className="flex-1 min-h-0 flex overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 flex flex-col overflow-hidden rounded-l-md">
        <div className="h-full flex flex-col overflow-y-auto px-3 py-3 space-y-3">
          <CollapsibleSection title="Visibility" storageKey="collateral-visibility">
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
        <div className="flex items-center justify-end px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300 transition-colors"
          >
            <Plus size={13} />
            New deck
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-zinc-400">Loading...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-xs text-zinc-400">No decks</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {filtered.map((deck) => (
                <div
                  key={deck.id}
                  className={`px-4 py-3 transition-colors ${
                    deck.published
                      ? "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      : "opacity-60 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  }`}
                >
                  {editingId === deck.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                        className="w-full text-sm font-medium px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Title"
                      />
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                        className="w-full text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Description (what this deck covers)"
                      />
                      <input
                        type="text"
                        value={editForm.guidance}
                        onChange={(e) => setEditForm((f) => ({ ...f, guidance: e.target.value }))}
                        className="w-full text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Guidance (when to send this deck)"
                      />
                      <div className="flex gap-1.5 pt-1">
                        <button
                          onClick={handleSaveEdit}
                          disabled={updateDeck.isPending}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300 transition-colors"
                        >
                          <Check size={12} className="inline mr-1" />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReplacePick(deck)}
                          disabled={replaceFile.isPending || bundling}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors disabled:opacity-60"
                          title="Pick the deck's .html — CSS & images auto-bundled, then uploaded"
                        >
                          <Upload size={12} className="inline mr-1" />
                          {bundling ? "Bundling…" : replaceFile.isPending ? "Uploading…" : "Replace .html"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePdfPick(deck)}
                          disabled={uploadPdf.isPending}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors disabled:opacity-60"
                          title={deck.pdf_path ? "Replace the downloadable PDF" : "Attach a downloadable PDF"}
                        >
                          <FileDown size={12} className="inline mr-1" />
                          {uploadPdf.isPending
                            ? "Uploading…"
                            : deck.pdf_path
                              ? "Replace PDF"
                              : "Add PDF"}
                        </button>
                        {deck.pdf_path && (
                          <button
                            type="button"
                            onClick={() => handlePdfRemove(deck)}
                            disabled={removePdf.isPending}
                            className="text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-100 text-red-500 hover:bg-red-50 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-60"
                            title="Remove the PDF"
                          >
                            <Trash2 size={12} className="inline mr-1" />
                            {removePdf.isPending ? "Removing…" : "Remove PDF"}
                          </button>
                        )}
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <X size={12} className="inline mr-1" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                            {deck.title}
                          </span>
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              deck.published
                                ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20"
                                : "text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800"
                            }`}
                          >
                            {deck.published ? "Published" : "Hidden"}
                          </span>
                          {deck.pdf_path && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/20"
                              title="A downloadable PDF is attached"
                            >
                              PDF
                            </span>
                          )}
                        </div>
                        {deck.description && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {deck.description}
                          </p>
                        )}
                        {deck.guidance && (
                          <p className="text-xs text-blue-500/70 dark:text-blue-400/70 mt-1 italic">
                            {deck.guidance}
                          </p>
                        )}
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 block">
                          /{deck.slug}
                          {deck.updated_at && (
                            <span
                              title={`Last edited ${formatDateFull(deck.updated_at) ?? deck.updated_at}`}
                            >
                              {" · Edited "}
                              {timeAgoVerbose(deck.updated_at)}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a
                          href={`${websiteUrl}/d/${deck.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                          title="Preview deck"
                        >
                          <ExternalLink size={14} className="text-zinc-400" />
                        </a>
                        <button
                          onClick={() => handleStartEdit(deck)}
                          className="p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                          title="Edit metadata"
                        >
                          <Pencil size={14} className="text-zinc-400" />
                        </button>
                        <button
                          onClick={() => handleTogglePublished(deck)}
                          disabled={updateDeck.isPending}
                          className="p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                          title={deck.published ? "Unpublish" : "Publish"}
                        >
                          {deck.published ? (
                            <Eye size={14} className="text-green-500" />
                          ) : (
                            <EyeOff size={14} className="text-zinc-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
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
