// LinkedIn Feed - View your recent posts and engagement

import { useState } from "react";
import { Heart, MessageCircle, Share2, Trash2, RefreshCw, Loader2, Globe, Users, AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui";
import { useLinkedInPosts, useDeleteLinkedInPost, LinkedInPost } from "../../hooks/useLinkedIn";
import { useQueryClient } from "@tanstack/react-query";

export function FeedView() {
  const { data: posts, isLoading, error } = useLinkedInPosts(20);
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["linkedin", "posts"] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={24} className="animate-spin text-zinc-400" />
      </div>
    );
  }

  // Check if error is a 403 (Community Management API not available)
  const errorMsg = error
    ? typeof error === 'object' && error !== null && 'message' in error
      ? (error as any).message
      : String(error)
    : "";
  const isForbidden = errorMsg.includes("403") || errorMsg.includes("Not enough permissions");

  if (error) {
    if (isForbidden) {
      return (
        <div className="max-w-2xl mx-auto p-6">
          <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Reading posts requires Community Management API
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Your LinkedIn app (valMarketing) has the Share on LinkedIn product, which lets you
                  <strong> publish posts</strong> from the Compose tab. To read your feed and see
                  engagement metrics, you need the Community Management API — which requires a
                  separate LinkedIn app.
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  For now, use <strong>Compose</strong> to create and publish posts.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500 mb-2">Failed to load posts</p>
        <p className="text-xs text-zinc-400">{errorMsg}</p>
        <Button size="sm" variant="secondary" onClick={handleRefresh} className="mt-3 rounded-lg">
          <RefreshCw size={12} className="mr-1" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Your Posts
        </h2>
        <Button size="sm" variant="secondary" onClick={handleRefresh} className="rounded-lg">
          <RefreshCw size={12} className="mr-1" /> Refresh
        </Button>
      </div>

      {!posts?.length ? (
        <div className="text-center py-12 text-zinc-400">
          <p className="text-sm">No posts yet. Go to Compose to create your first post.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post }: { post: LinkedInPost }) {
  const deletePost = useDeleteLinkedInPost();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await deletePost.mutateAsync(post.id);
  };

  const createdDate = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString("en-SG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {post.visibility === "PUBLIC" ? (
            <Globe size={12} />
          ) : (
            <Users size={12} />
          )}
          <span>{post.visibility === "PUBLIC" ? "Public" : "Connections"}</span>
          {createdDate && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">|</span>
              <span>{createdDate}</span>
            </>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={deletePost.isPending}
          className={`p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${
            confirmDelete ? "text-red-500" : "text-zinc-400 hover:text-zinc-600"
          }`}
          title={confirmDelete ? "Click again to confirm" : "Delete post"}
        >
          {deletePost.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-100 mb-3 line-clamp-6">
        {post.text}
      </div>

      {/* Engagement */}
      <div className="flex items-center gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <span className="flex items-center gap-1 text-xs text-zinc-400">
          <Heart size={12} /> {post.numLikes}
        </span>
        <span className="flex items-center gap-1 text-xs text-zinc-400">
          <MessageCircle size={12} /> {post.numComments}
        </span>
        <span className="flex items-center gap-1 text-xs text-zinc-400">
          <Share2 size={12} /> {post.numShares}
        </span>
      </div>
    </div>
  );
}
