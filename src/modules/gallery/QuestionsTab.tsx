// Questions tab — manage the AI questions library

import { useState, useCallback } from "react";
import { Plus, Globe, Star, Save, Loader2, Trash2, MessageCircleQuestion, Edit3, X, Tags } from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import { cn } from "../../lib/cn";
import { SectionLoading } from "../../components/ui/DetailStates";
import { useQuestions, useCreateQuestion, useUpdateQuestion, useDeleteQuestion } from "../../hooks/gallery/useQuestions";
import type { Question } from "../../lib/gallery/types";

export function QuestionsTab({ search }: { search: string }) {
  const { data: questions = [], isLoading } = useQuestions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const filtered = questions.filter(q => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      q.question.toLowerCase().includes(s) ||
      q.description?.toLowerCase().includes(s) ||
      q.category.toLowerCase().includes(s) ||
      q.subcategory?.toLowerCase().includes(s)
    );
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, Question[]>>((acc, q) => {
    const cat = q.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(q);
    return acc;
  }, {});

  const sortedCategories = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  if (isLoading) return <SectionLoading className="py-12" />;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-zinc-400">{filtered.length} questions</span>
        <Button
          size="sm"
          icon={Plus}
          onClick={() => { setShowNewForm(true); setEditingId(null); }}
        >
          Add Question
        </Button>
      </div>

      {showNewForm && (
        <div className="mb-4">
          <QuestionForm
            onClose={() => setShowNewForm(false)}
            onSaved={() => setShowNewForm(false)}
          />
        </div>
      )}

      {filtered.length === 0 && !showNewForm ? (
        <div className="text-center py-8 text-xs text-zinc-400">
          {search ? `No questions matching "${search}"` : "No questions yet. Add one to get started."}
        </div>
      ) : (
        <div className="space-y-5">
          {sortedCategories.map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                {category}
              </h3>
              <div className="space-y-2">
                {items.map(q => (
                  editingId === q.id ? (
                    <QuestionForm
                      key={q.id}
                      existing={q}
                      onClose={() => setEditingId(null)}
                      onSaved={() => setEditingId(null)}
                    />
                  ) : (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      onEdit={() => { setEditingId(q.id); setShowNewForm(false); }}
                    />
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionCard({ question, onEdit }: { question: Question; onEdit: () => void }) {
  return (
    <div className="group flex items-start gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-teal-300 dark:hover:border-teal-700 transition-all">
      <MessageCircleQuestion size={14} className="text-zinc-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{question.question}</p>
          <div className="flex items-center gap-1 shrink-0">
            {question.published && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <Globe size={8} />
                Published
              </span>
            )}
            {question.featured && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Star size={8} />
                Featured
              </span>
            )}
            <IconButton
              icon={Edit3}
              size={12}
              label="Edit"
              onClick={onEdit}
              className="opacity-0 group-hover:opacity-100 transition"
            />
          </div>
        </div>
        {question.description && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{question.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {question.subcategory && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{question.subcategory}</span>
          )}
          {question.video_url && (
            <span className="text-[10px] text-violet-500">Has video</span>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionForm({ existing, onClose, onSaved }: {
  existing?: Question;
  onClose: () => void;
  onSaved: () => void;
}) {
  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();

  const [question, setQuestion] = useState(existing?.question ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? "");
  const [videoUrl, setVideoUrl] = useState(existing?.video_url ?? "");
  const [published, setPublished] = useState(existing?.published ?? false);
  const [featured, setFeatured] = useState(existing?.featured ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!question.trim() || !category.trim()) return;
    setSaving(true);
    try {
      if (existing) {
        await updateQuestion.mutateAsync({
          id: existing.id,
          updates: {
            question: question.trim(),
            description: description.trim() || null,
            category: category.trim(),
            subcategory: subcategory.trim() || null,
            video_url: videoUrl.trim() || null,
            published,
            featured,
          },
        });
      } else {
        await createQuestion.mutateAsync({
          question: question.trim(),
          description: description.trim() || null,
          category: category.trim(),
          subcategory: subcategory.trim() || null,
          video_url: videoUrl.trim() || null,
          published,
          featured,
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [existing, question, description, category, subcategory, videoUrl, published, featured, createQuestion, updateQuestion, onSaved]);

  const handleDelete = useCallback(async () => {
    if (!existing) return;
    await deleteQuestion.mutateAsync(existing.id);
    onClose();
  }, [existing, deleteQuestion, onClose]);

  return (
    <div className="p-3 rounded-lg border border-teal-300 dark:border-teal-700 bg-teal-50/30 dark:bg-teal-950/20 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-teal-600 dark:text-teal-400">
          {existing ? "Edit Question" : "New Question"}
        </span>
        <IconButton icon={X} size={12} label="Cancel" onClick={onClose} />
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

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Question</label>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="What can users ask? e.g. How is my restaurant doing?"
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What this question demonstrates..."
          rows={2}
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
            onChange={e => setCategory(e.target.value)}
            placeholder="Revenue & Sales"
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Subcategory</label>
          <input
            value={subcategory}
            onChange={e => setSubcategory(e.target.value)}
            placeholder="POS, Delivery"
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Video URL</label>
        <input
          value={videoUrl}
          onChange={e => setVideoUrl(e.target.value)}
          placeholder="https://youtu.be/..."
          className="w-full px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" icon={saving ? Loader2 : Save} onClick={handleSave} disabled={saving || !question.trim() || !category.trim()}>
          {existing ? "Update" : "Create"}
        </Button>
        {existing && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={handleDelete} className="text-red-500 hover:text-red-600">
            Delete
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
