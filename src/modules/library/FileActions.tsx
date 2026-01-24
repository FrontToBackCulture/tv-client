// src/modules/library/FileActions.tsx

import { useState, useRef, useEffect, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import {
  MoreVertical,
  Copy,
  FolderOpen,
  ExternalLink,
  Pencil,
  Trash2,
  Star,
  StarOff,
  Image,
  ImagePlus,
  Presentation,
  Video,
  Globe,
} from "lucide-react";
import { cn } from "../../lib/cn";

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "danger";
  dividerAfter?: boolean;
}

interface FileActionsProps {
  path: string;
  isDirectory?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onShowToast?: (message: string, type: "success" | "error") => void;
  // Domain URL for opening in VAL
  domainUrl?: string | null;
  domainLabel?: string;
  // File-type-specific action handlers
  onGenerateImage?: () => void;
  onGenerateImageWithLogo?: () => void;
  onGenerateDeck?: () => void;
  onGenerateVideo?: () => void;
  // Loading states for async actions
  isGeneratingImage?: boolean;
  isGeneratingDeck?: boolean;
  isGeneratingVideo?: boolean;
}

// Get file type from path
function getFileType(path: string): "nanobanana" | "gamma" | "veo" | "markdown" | "other" {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".nanobanana.json")) return "nanobanana";
  if (lowerPath.endsWith(".gamma.json")) return "gamma";
  if (lowerPath.endsWith(".veo.json")) return "veo";
  if (lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown")) return "markdown";
  return "other";
}

export function FileActions({
  path,
  isDirectory = false,
  isFavorite = false,
  onToggleFavorite,
  onRename,
  onDelete,
  onShowToast,
  domainUrl,
  domainLabel = "Open in VAL",
  onGenerateImage,
  onGenerateImageWithLogo,
  onGenerateDeck,
  onGenerateVideo,
  isGeneratingImage = false,
  isGeneratingDeck = false,
  isGeneratingVideo = false,
}: FileActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fileType = getFileType(path);

  const openInBrowser = async (url: string) => {
    setLoading("browser");
    try {
      await openUrl(url);
    } catch (err) {
      onShowToast?.(`Failed to open URL: ${err}`, "error");
    } finally {
      setLoading(null);
      setIsOpen(false);
    }
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onShowToast?.(`${label} copied to clipboard`, "success");
    } catch {
      onShowToast?.("Failed to copy", "error");
    }
    setIsOpen(false);
  };

  const openInFinder = async () => {
    setLoading("finder");
    try {
      await invoke("open_in_finder", { path });
      onShowToast?.("Opened in Finder", "success");
    } catch (err) {
      onShowToast?.(`Failed to open in Finder: ${err}`, "error");
    } finally {
      setLoading(null);
      setIsOpen(false);
    }
  };

  const openWithDefaultApp = async () => {
    setLoading("default");
    try {
      await invoke("open_with_default_app", { path });
      onShowToast?.("Opened with default app", "success");
    } catch (err) {
      onShowToast?.(`Failed to open: ${err}`, "error");
    } finally {
      setLoading(null);
      setIsOpen(false);
    }
  };

  // Get relative path (last 3 segments)
  const getRelativePath = () => {
    const parts = path.split("/");
    return parts.slice(-3).join("/");
  };

  const items: ActionMenuItem[] = [];

  // File-type-specific actions at the top
  if (fileType === "nanobanana" && onGenerateImage) {
    items.push({
      label: isGeneratingImage ? "Generating..." : "Generate Image",
      icon: <Image className="w-4 h-4" />,
      onClick: () => {
        onGenerateImage();
        setIsOpen(false);
      },
      disabled: isGeneratingImage,
      loading: isGeneratingImage,
    });
    if (onGenerateImageWithLogo) {
      items.push({
        label: isGeneratingImage ? "Generating..." : "+ Logo",
        icon: <ImagePlus className="w-4 h-4" />,
        onClick: () => {
          onGenerateImageWithLogo();
          setIsOpen(false);
        },
        disabled: isGeneratingImage,
        loading: isGeneratingImage,
        dividerAfter: true,
      });
    } else {
      items[items.length - 1].dividerAfter = true;
    }
  }

  if (fileType === "gamma" && onGenerateDeck) {
    items.push({
      label: isGeneratingDeck ? "Generating..." : "Generate Deck",
      icon: <Presentation className="w-4 h-4" />,
      onClick: () => {
        onGenerateDeck();
        setIsOpen(false);
      },
      disabled: isGeneratingDeck,
      loading: isGeneratingDeck,
      dividerAfter: true,
    });
  }

  if (fileType === "veo" && onGenerateVideo) {
    items.push({
      label: isGeneratingVideo ? "Generating..." : "Generate Video",
      icon: <Video className="w-4 h-4" />,
      onClick: () => {
        onGenerateVideo();
        setIsOpen(false);
      },
      disabled: isGeneratingVideo,
      loading: isGeneratingVideo,
      dividerAfter: true,
    });
  }

  // Domain URL action (Open in VAL)
  if (domainUrl) {
    items.push({
      label: domainLabel,
      icon: <Globe className="w-4 h-4" />,
      onClick: () => openInBrowser(domainUrl),
      loading: loading === "browser",
      dividerAfter: true,
    });
  }

  // Standard actions
  items.push(
    {
      label: "Copy path",
      icon: <Copy className="w-4 h-4" />,
      onClick: () => copyToClipboard(path, "Path"),
    },
    {
      label: "Copy relative path",
      icon: <Copy className="w-4 h-4" />,
      onClick: () => copyToClipboard(getRelativePath(), "Relative path"),
      dividerAfter: true,
    },
    {
      label: "Show in Finder",
      icon: <FolderOpen className="w-4 h-4" />,
      onClick: openInFinder,
      loading: loading === "finder",
    }
  );

  // Add "Open with default app" for files only
  if (!isDirectory) {
    items.push({
      label: "Open with default app",
      icon: <ExternalLink className="w-4 h-4" />,
      onClick: openWithDefaultApp,
      loading: loading === "default",
      dividerAfter: true,
    });
  } else {
    items[items.length - 1].dividerAfter = true;
  }

  // Favorite toggle
  if (onToggleFavorite) {
    items.push({
      label: isFavorite ? "Remove from favorites" : "Add to favorites",
      icon: isFavorite ? <StarOff className="w-4 h-4" /> : <Star className="w-4 h-4" />,
      onClick: () => {
        onToggleFavorite();
        setIsOpen(false);
      },
      dividerAfter: true,
    });
  }

  // Rename
  if (onRename) {
    items.push({
      label: "Rename",
      icon: <Pencil className="w-4 h-4" />,
      onClick: () => {
        onRename();
        setIsOpen(false);
      },
    });
  }

  // Delete
  if (onDelete) {
    items.push({
      label: "Delete",
      icon: <Trash2 className="w-4 h-4" />,
      onClick: () => {
        onDelete();
        setIsOpen(false);
      },
      variant: "danger",
    });
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded hover:bg-zinc-800 transition-colors"
        title="More actions"
      >
        <MoreVertical className="w-4 h-4 text-zinc-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-52 bg-zinc-900 border border-zinc-700 rounded-lg shadow-lg py-1 z-50">
          {items.map((item, index) => (
            <div key={index}>
              <button
                onClick={item.onClick}
                disabled={item.disabled || item.loading}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors",
                  item.disabled || item.loading
                    ? "opacity-50 cursor-not-allowed"
                    : item.variant === "danger"
                    ? "text-red-400 hover:bg-red-900/20"
                    : "text-zinc-300 hover:bg-zinc-800"
                )}
              >
                {item.loading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  item.icon
                )}
                <span className="flex-1">{item.label}</span>
              </button>
              {item.dividerAfter && (
                <div className="my-1 border-t border-zinc-700" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
