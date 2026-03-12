// src/modules/questions/QuestionCatalogView.tsx
// Browse, search, filter, and manage questions with catalog + review views

import { useState, useMemo, useCallback } from "react";
import {
  Search,
  Plus,
  X,
  MessageCircleQuestion,
  Globe,
  Star,
  Video,
  LayoutList,
  Table2,
  Save,
  Trash2,
  Loader2,
  Tags,
} from "lucide-react";
import { ViewTab } from "../../components/ViewTab";
import { Button, IconButton } from "../../components/ui";
import { cn } from "../../lib/cn";
import { SectionLoading } from "../../components/ui/DetailStates";
import {
  useQuestions,
  useCreateQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
} from "../../hooks/gallery/useQuestions";
import type { Question } from "../../lib/gallery/types";
import { QuestionReviewGrid } from "./QuestionReviewGrid";

const SOLUTION_OPTIONS = [
  { value: "analytics", label: "Analytics" },
  { value: "ar-automation", label: "AR Automation" },
  { value: "ap-automation", label: "AP Automation" },
];

export function QuestionCatalogView() {
  const { data: questions = [], isLoading } = useQuestions();
  const [view, setView] = useState<"catalog" | "review">("catalog");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  // Filtered questions
  const filtered = useMemo(() => {
    if (!search) return questions;
    const s = search.toLowerCase();
    return questions.filter(
      (q) =>
        q.question.toLowerCase().includes(s) ||
        q.description?.toLowerCase().includes(s) ||
        q.category.toLowerCase().includes(s) ||
        q.subcategory?.toLowerCase().includes(s)
    );
  }, [questions, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, Question[]> = {};
    for (const q of filtered) {
      const cat = q.category || "Uncategorized";
      if (!map[cat]) map[cat] = [];
      map[cat].push(q);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Selected question
  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedId) ?? null,
    [questions, selectedId]
  );

  // Counts
  const publishedCount = questions.filter((q) => q.published).length;
  const featuredCount = questions.filter((q) => q.featured).length;
  const withVideoCount = questions.filter((q) => q.video_url).length;

  if (isLoading) return <SectionLoading className="py-12" />;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Questions</h2>
          <ViewTab label="Catalog" icon={LayoutList} active={view === "catalog"} onClick={() => setView("catalog")} />
          <ViewTab label="Review" icon={Table2} active={view === "review"} onClick={() => setView("review")} />
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span>{questions.length} total</span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="text-teal-600 dark:text-teal-400">{publishedCount} published</span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="text-amber-600 dark:text-amber-400">{featuredCount} featured</span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="text-violet-600 dark:text-violet-400">{withVideoCount} with video</span>
          </div>
        </div>

        {view === "catalog" && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search questions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <Button
              size="sm"
              icon={Plus}
              onClick={() => { setShowNewForm(true); setSelectedId(null); }}
            >
              Add Question
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {view === "review" ? (
        <QuestionReviewGrid
          onSelectQuestion={(id) => {
            setSelectedId(id);
            setView("catalog");
          }}
        />
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: Question list */}
          <div className="flex-1 overflow-y-auto p-4">
            {showNewForm && (
              <div className="mb-4">
                <QuestionForm
                  onClose={() => setShowNewForm(false)}
                  onSaved={(id) => { setShowNewForm(false); setSelectedId(id); }}
                />
              </div>
            )}

            {filtered.length === 0 && !showNewForm ? (
              <div className="text-center py-8 text-xs text-zinc-400">
                {search ? `No questions matching "${search}"` : "No questions yet. Add one to get started."}
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map(([category, items]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-2 pb-1 border-b border-zinc-200 dark:border-zinc-800">
                      <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        {category}
                      </h3>
                      <span className="text-[10px] text-zinc-400">{items.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {items.map((q) => (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          isSelected={selectedId === q.id}
                          onClick={() => setSelectedId(q.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Detail panel */}
          {selectedQuestion && (
            <div className="w-[400px] border-l border-zinc-200 dark:border-zinc-800 overflow-y-auto flex-shrink-0">
              <QuestionDetailPanel
                question={selectedQuestion}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Question Card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  isSelected,
  onClick,
}: {
  question: Question;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-all",
        isSelected
          ? "border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-950/20"
          : "border-zinc-200 dark:border-zinc-800 hover:border-teal-300 dark:hover:border-teal-700"
      )}
    >
      <MessageCircleQuestion size={14} className="text-zinc-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2">
          {question.question}
        </p>
        {question.description && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">
            {question.description}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {question.published && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Globe size={8} /> Live
            </span>
          )}
          {question.featured && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Star size={8} /> Featured
            </span>
          )}
          {question.video_url && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Video size={8} /> Video
            </span>
          )}
          {question.solution && question.solution !== "analytics" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              {question.solution}
            </span>
          )}
          {question.subcategory && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              {question.subcategory}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function QuestionDetailPanel({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) {
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();

  const [questionText, setQuestionText] = useState(question.question);
  const [description, setDescription] = useState(question.description ?? "");
  const [category, setCategory] = useState(question.category);
  const [subcategory, setSubcategory] = useState(question.subcategory ?? "");
  const [solution, setSolution] = useState(question.solution ?? "analytics");
  const [videoUrl, setVideoUrl] = useState(question.video_url ?? "");
  const [published, setPublished] = useState(question.published);
  const [featured, setFeatured] = useState(question.featured);
  const [sortOrder, setSortOrder] = useState(question.sort_order);
  const [saving, setSaving] = useState(false);

  // Sync when selection changes
  const [lastId, setLastId] = useState(question.id);
  if (question.id !== lastId) {
    setLastId(question.id);
    setQuestionText(question.question);
    setDescription(question.description ?? "");
    setCategory(question.category);
    setSubcategory(question.subcategory ?? "");
    setSolution(question.solution ?? "analytics");
    setVideoUrl(question.video_url ?? "");
    setPublished(question.published);
    setFeatured(question.featured);
    setSortOrder(question.sort_order);
  }

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateQuestion.mutateAsync({
        id: question.id,
        updates: {
          question: questionText.trim(),
          description: description.trim() || null,
          category: category.trim(),
          subcategory: subcategory.trim() || null,
          solution: solution.trim() || "analytics",
          video_url: videoUrl.trim() || null,
          published,
          featured,
          sort_order: sortOrder,
        },
      });
    } finally {
      setSaving(false);
    }
  }, [question.id, questionText, description, category, subcategory, solution, videoUrl, published, featured, sortOrder, updateQuestion]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this question?")) return;
    await deleteQuestion.mutateAsync(question.id);
    onClose();
  }, [question.id, deleteQuestion, onClose]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2">
          {question.question}
        </h3>
        <IconButton icon={X} size={14} label="Close" onClick={onClose} />
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPublished(!published)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition border",
            published
              ? "bg-teal-500/10 text-teal-600 border-teal-500/30"
              : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700"
          )}
        >
          <Globe size={10} />
          {published ? "Published" : "Draft"}
        </button>
        <button
          onClick={() => setFeatured(!featured)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition border",
            featured
              ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
              : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700"
          )}
        >
          <Star size={10} />
          {featured ? "Featured" : "Not Featured"}
        </button>
      </div>

      {/* Fields */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Question</label>
        <input
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">
            <Tags size={10} className="inline mr-1" />
            Category
          </label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Subcategory</label>
          <input
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Solution</label>
          <select
            value={solution}
            onChange={(e) => setSolution(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {SOLUTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Sort Order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Video URL</label>
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://youtu.be/..."
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1 text-[10px] text-violet-500 hover:text-violet-400"
          >
            <Video size={10} /> Open video
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <Button size="sm" icon={saving ? Loader2 : Save} onClick={handleSave} disabled={saving || !questionText.trim() || !category.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={handleDelete} className="text-red-500 hover:text-red-600">
          Delete
        </Button>
      </div>

      {/* Meta */}
      <div className="text-[10px] text-zinc-400 pt-2">
        <p>ID: {question.id}</p>
        <p>Updated: {question.updated_at?.slice(0, 19).replace("T", " ")}</p>
      </div>
    </div>
  );
}

// ─── New Question Form ────────────────────────────────────────────────────────

function QuestionForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const createQuestion = useCreateQuestion();

  const [questionText, setQuestionText] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [solution, setSolution] = useState("analytics");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!questionText.trim() || !category.trim()) return;
    setSaving(true);
    try {
      const result = await createQuestion.mutateAsync({
        question: questionText.trim(),
        description: description.trim() || null,
        category: category.trim(),
        subcategory: subcategory.trim() || null,
        solution,
      });
      onSaved(result.id);
    } finally {
      setSaving(false);
    }
  }, [questionText, description, category, subcategory, solution, createQuestion, onSaved]);

  return (
    <div className="p-3 rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50/30 dark:bg-teal-950/20 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-teal-600 dark:text-teal-400">
          New Question
        </span>
        <IconButton icon={X} size={12} label="Cancel" onClick={onClose} />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Question</label>
        <input
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          placeholder="What can users ask?"
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this question demonstrates..."
          rows={2}
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Revenue & Sales"
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Subcategory</label>
          <input
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            placeholder="POS, Delivery"
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Solution</label>
          <select
            value={solution}
            onChange={(e) => setSolution(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {SOLUTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" icon={saving ? Loader2 : Save} onClick={handleSave} disabled={saving || !questionText.trim() || !category.trim()}>
          Create
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
