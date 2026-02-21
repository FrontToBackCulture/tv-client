// src/modules/library/IntercomModal.tsx

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, BookOpen, Trash2, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";

interface IntercomCollection {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
}

interface IntercomArticle {
  id: string;
  title: string;
  url: string | null;
  state: string | null;
}

interface IntercomModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  content: string;
  filename: string;
  intercomArticleId?: string;
  onPublished: (articleId: string, articleUrl: string) => void;
  onDeleted: () => void;
}

export function IntercomModal({
  isOpen,
  onClose,
  filePath: _filePath,
  content,
  filename,
  intercomArticleId,
  onPublished,
  onDeleted,
}: IntercomModalProps) {
  const [collections, setCollections] = useState<IntercomCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [publishState, setPublishState] = useState<"draft" | "published">("published");

  const isUpdateMode = !!intercomArticleId;

  // Fetch collections on open
  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
      setError(null);
      return;
    }
    fetchCollections();
  }, [isOpen]);

  const fetchCollections = async () => {
    setLoadingCollections(true);
    setError(null);
    try {
      const apiKey = await invoke<string | null>("settings_get_intercom_key");
      if (!apiKey) {
        setError("Intercom API key not set. Go to Settings to add it.");
        return;
      }
      const result = await invoke<IntercomCollection[]>("intercom_list_collections", {
        apiKey,
      });
      setCollections(result);
      if (result.length > 0 && !selectedCollectionId) {
        setSelectedCollectionId(result[0].id);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingCollections(false);
    }
  };

  const handlePublish = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiKey = await invoke<string | null>("settings_get_intercom_key");
      if (!apiKey) {
        setError("Intercom API key not set.");
        return;
      }

      const article = await invoke<IntercomArticle>("intercom_publish_article", {
        apiKey,
        markdown: content,
        filename,
        collectionId: selectedCollectionId,
        state: publishState,
      });

      onPublished(article.id, article.url || "");
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!intercomArticleId) return;
    setLoading(true);
    setError(null);
    try {
      const apiKey = await invoke<string | null>("settings_get_intercom_key");
      if (!apiKey) {
        setError("Intercom API key not set.");
        return;
      }

      const article = await invoke<IntercomArticle>("intercom_update_article", {
        apiKey,
        articleId: intercomArticleId,
        markdown: content,
        filename,
        collectionId: selectedCollectionId || null,
        state: publishState,
      });

      onPublished(article.id, article.url || "");
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!intercomArticleId) return;
    setLoading(true);
    setError(null);
    try {
      const apiKey = await invoke<string | null>("settings_get_intercom_key");
      if (!apiKey) {
        setError("Intercom API key not set.");
        return;
      }

      await invoke("intercom_delete_article", {
        apiKey,
        articleId: intercomArticleId,
      });

      onDeleted();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setConfirmDelete(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {isUpdateMode ? "Update Help Center Article" : "Publish to Help Center"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Article ID (update mode) */}
          {isUpdateMode && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 rounded">
              Article ID: {intercomArticleId}
            </div>
          )}

          {/* File info */}
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">{filename}</span>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
              {error}
            </div>
          )}

          {/* Collection picker */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              Collection
            </label>
            {loadingCollections ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Loading collections...
              </div>
            ) : collections.length === 0 ? (
              <div className="text-sm text-zinc-500 py-2">
                No collections found. Create one in Intercom first.
              </div>
            ) : (
              <select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* State picker */}
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
              State
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setPublishState("published")}
                className={cn(
                  "px-3 py-1.5 text-xs rounded border transition-colors",
                  publishState === "published"
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
              >
                Published
              </button>
              <button
                onClick={() => setPublishState("draft")}
                className={cn(
                  "px-3 py-1.5 text-xs rounded border transition-colors",
                  publishState === "draft"
                    ? "bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
              >
                Draft
              </button>
            </div>
          </div>

          {/* Delete confirmation */}
          {isUpdateMode && confirmDelete && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
              <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                Delete this article from Intercom? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? "Deleting..." : "Confirm Delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <div>
            {isUpdateMode && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={isUpdateMode ? handleUpdate : handlePublish}
              disabled={loading || loadingCollections || collections.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  {isUpdateMode ? "Updating..." : "Publishing..."}
                </>
              ) : (
                <>
                  <ExternalLink className="w-3 h-3" />
                  {isUpdateMode ? "Update" : "Publish"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
