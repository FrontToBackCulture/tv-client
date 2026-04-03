// src/modules/library/IntercomModal.tsx

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, BookOpen, Trash2, ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatError } from "../../lib/formatError";
import { Button, IconButton, FormField, Select } from "../../components/ui";
import { InlineLoading, ErrorBanner } from "../../components/ui/DetailStates";

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
      setError(formatError(err));
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
      setError(formatError(err));
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
      setError(formatError(err));
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
      setError(formatError(err));
    } finally {
      setLoading(false);
      setConfirmDelete(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg w-full max-w-md mx-4 overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {isUpdateMode ? "Update Help Center Article" : "Publish to Help Center"}
            </h3>
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
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
            <ErrorBanner message={error} />
          )}

          {/* Collection picker */}
          <FormField label="Collection">
            {loadingCollections ? (
              <InlineLoading message="Loading collections..." />
            ) : collections.length === 0 ? (
              <div className="text-sm text-zinc-500 py-2">
                No collections found. Create one in Intercom first.
              </div>
            ) : (
              <Select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          {/* State picker */}
          <FormField label="State">
            <div className="flex gap-2">
              <button
                onClick={() => setPublishState("published")}
                className={cn(
                  "px-3 py-1.5 text-xs rounded border transition-colors",
                  publishState === "published"
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
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
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                )}
              >
                Draft
              </button>
            </div>
          </FormField>

          {/* Delete confirmation */}
          {isUpdateMode && confirmDelete && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
              <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                Delete this article from Intercom? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={handleDelete} disabled={loading}>
                  {loading ? "Deleting..." : "Confirm Delete"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <div>
            {isUpdateMode && !confirmDelete && (
              <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDelete(true)} disabled={loading} className="text-red-500 hover:text-red-600">
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={isUpdateMode ? handleUpdate : handlePublish}
              disabled={loading || loadingCollections || collections.length === 0}
              loading={loading}
              icon={loading ? undefined : ExternalLink}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUpdateMode ? (loading ? "Updating..." : "Update") : (loading ? "Publishing..." : "Publish")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
