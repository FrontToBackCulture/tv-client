// src/modules/referrals/CollateralView.tsx
// Manage partner-facing sales decks — toggle published, edit metadata

import { useState } from "react";
import { Eye, EyeOff, Pencil, ExternalLink, X, Check } from "lucide-react";
import { usePartnerDecks, useUpdateDeck, PartnerDeck } from "../../hooks/usePartnerDecks";

export function CollateralView() {
  const { data: decks = [], isLoading } = usePartnerDecks();
  const updateDeck = useUpdateDeck();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    guidance: string;
  }>({ title: "", description: "", guidance: "" });

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

  const websiteUrl = "https://thinkval.co";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Partner Collateral
        </h1>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
          Manage which sales decks are visible to partners
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-zinc-400">Loading...</p>
          </div>
        ) : decks.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-zinc-400">No decks configured</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {decks.map((deck) => (
              <div
                key={deck.id}
                className={`px-4 py-3 transition-colors ${
                  deck.published
                    ? "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    : "opacity-60 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                }`}
              >
                {editingId === deck.id ? (
                  /* Edit mode */
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
                        onClick={() => setEditingId(null)}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <X size={12} className="inline mr-1" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
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
                      </span>
                    </div>

                    {/* Actions */}
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
  );
}
