import {
  type LucideIcon,
  Mail,
  Handshake,
  Users,
  CheckCircle2,
  FolderOpen,
  Search,
  Puzzle,
  Layers,
  Tag,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";

// ---------------------------------------------------------------------------
// Variant configuration — icon, copy, color tint, and decorative SVG motif
// ---------------------------------------------------------------------------

interface VariantConfig {
  icon: LucideIcon;
  title: string;
  message: string;
  /** Tailwind color classes: [iconBg, iconBgDark, iconColor, iconColorDark, motifColor, motifColorDark] */
  tint: {
    iconBg: string;
    iconColor: string;
    motifColor: string;
  };
  /** SVG motif rendered behind the icon */
  motif: React.FC<{ className?: string }>;
}

// -- Decorative SVG motifs (abstract, geometric, domain-specific) -----------

function InboxMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Envelope outlines — layered, offset */}
      <rect x="20" y="38" width="80" height="52" rx="4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M20 42 L60 68 L100 42" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="28" y="30" width="64" height="44" rx="3" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <path d="M28 33 L60 54 L92 33" stroke="currentColor" strokeWidth="0.8" opacity="0.4" strokeLinejoin="round" />
    </svg>
  );
}

function DealsMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Two arcs connecting — partnership/handshake abstraction */}
      <circle cx="42" cy="60" r="28" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" />
      <circle cx="78" cy="60" r="28" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" />
      {/* Connection point */}
      <circle cx="60" cy="60" r="3" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function ContactsMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Abstract person silhouettes — circles + shoulders */}
      <circle cx="40" cy="44" r="10" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M24 78 C24 64 40 58 40 58 C40 58 56 64 56 78" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="72" cy="48" r="8" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
      <path d="M59 76 C59 65 72 60 72 60 C72 60 85 65 85 76" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
    </svg>
  );
}

function TasksMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Checkmark with radiating lines — completion/satisfaction */}
      <path d="M38 62 L52 76 L82 44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="60" y1="20" x2="60" y2="30" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="60" y1="90" x2="60" y2="100" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="20" y1="60" x2="30" y2="60" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="90" y1="60" x2="100" y2="60" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="32" y1="32" x2="38" y2="38" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
      <line x1="82" y1="82" x2="88" y2="88" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
      <line x1="82" y1="32" x2="88" y2="38" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
      <line x1="32" y1="82" x2="38" y2="88" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    </svg>
  );
}

function LibraryMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Stacked folder tabs */}
      <path d="M26 48 L26 86 L94 86 L94 48 L66 48 L60 40 L26 40 Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M32 42 L32 80 L88 80 L88 42 L62 42 L56 36 L32 36 Z" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <path d="M38 38 L38 74 L82 74 L82 38 L58 38 L52 32 L38 32 Z" stroke="currentColor" strokeWidth="0.6" opacity="0.25" />
    </svg>
  );
}

function SearchMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Magnifying glass with scan lines */}
      <circle cx="52" cy="52" r="24" stroke="currentColor" strokeWidth="1.2" />
      <line x1="70" y1="70" x2="94" y2="94" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Scan lines inside lens */}
      <line x1="36" y1="44" x2="68" y2="44" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
      <line x1="36" y1="52" x2="68" y2="52" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
      <line x1="36" y1="60" x2="68" y2="60" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
    </svg>
  );
}

function ConnectorsMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Puzzle pieces interlocking */}
      <rect x="24" y="24" width="32" height="32" rx="3" stroke="currentColor" strokeWidth="1" />
      <rect x="64" y="24" width="32" height="32" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <rect x="24" y="64" width="32" height="32" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <rect x="64" y="64" width="32" height="32" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      {/* Connection tabs */}
      <circle cx="56" cy="40" r="4" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="40" cy="56" r="4" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="80" cy="56" r="4" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <circle cx="56" cy="80" r="4" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

function FeaturesMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Stacked layers — depth lines */}
      <path d="M60 30 L100 50 L60 70 L20 50 Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M20 60 L60 80 L100 60" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <path d="M20 70 L60 90 L100 70" stroke="currentColor" strokeWidth="0.6" opacity="0.3" />
    </svg>
  );
}

function ReleasesMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Tag with version dots */}
      <path d="M30 30 L66 30 L90 54 L54 90 L30 66 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="46" cy="46" r="4" stroke="currentColor" strokeWidth="1" />
      {/* Version dots */}
      <circle cx="62" cy="54" r="1.5" fill="currentColor" opacity="0.4" />
      <circle cx="70" cy="62" r="1.5" fill="currentColor" opacity="0.3" />
      <circle cx="58" cy="66" r="1.5" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

// -- Fallback motif for custom (non-variant) usage --------------------------

function DefaultMotif({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="36" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" />
      <circle cx="60" cy="60" r="20" stroke="currentColor" strokeWidth="0.6" opacity="0.4" strokeDasharray="2 3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Variant definitions
// ---------------------------------------------------------------------------

const variants: Record<string, VariantConfig> = {
  inbox: {
    icon: Mail,
    title: "Inbox zero",
    message: "You're all caught up. No emails to triage.",
    tint: {
      iconBg: "bg-blue-50 dark:bg-blue-950/40",
      iconColor: "text-blue-500 dark:text-blue-400",
      motifColor: "text-blue-300 dark:text-blue-700",
    },
    motif: InboxMotif,
  },
  deals: {
    icon: Handshake,
    title: "No deals yet",
    message: "Create your first deal to start tracking your pipeline.",
    tint: {
      iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
      iconColor: "text-emerald-500 dark:text-emerald-400",
      motifColor: "text-emerald-300 dark:text-emerald-800",
    },
    motif: DealsMotif,
  },
  contacts: {
    icon: Users,
    title: "No contacts",
    message: "Contacts will appear here when added to companies.",
    tint: {
      iconBg: "bg-violet-50 dark:bg-violet-950/40",
      iconColor: "text-violet-500 dark:text-violet-400",
      motifColor: "text-violet-300 dark:text-violet-800",
    },
    motif: ContactsMotif,
  },
  tasks: {
    icon: CheckCircle2,
    title: "All clear",
    message: "No open tasks. Time to plan your next move.",
    tint: {
      iconBg: "bg-teal-50 dark:bg-teal-950/40",
      iconColor: "text-teal-500 dark:text-teal-400",
      motifColor: "text-teal-300 dark:text-teal-700",
    },
    motif: TasksMotif,
  },
  library: {
    icon: FolderOpen,
    title: "Empty folder",
    message: "This folder has no files yet.",
    tint: {
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-500 dark:text-amber-400",
      motifColor: "text-amber-300 dark:text-amber-800",
    },
    motif: LibraryMotif,
  },
  search: {
    icon: Search,
    title: "No results",
    message: "Try adjusting your search or filters.",
    tint: {
      iconBg: "bg-slate-100 dark:bg-slate-800",
      iconColor: "text-slate-400 dark:text-slate-500",
      motifColor: "text-slate-300 dark:text-slate-700",
    },
    motif: SearchMotif,
  },
  connectors: {
    icon: Puzzle,
    title: "No connectors",
    message: "Connect platforms to start pulling data.",
    tint: {
      iconBg: "bg-orange-50 dark:bg-orange-950/40",
      iconColor: "text-orange-500 dark:text-orange-400",
      motifColor: "text-orange-300 dark:text-orange-800",
    },
    motif: ConnectorsMotif,
  },
  features: {
    icon: Layers,
    title: "No features yet",
    message: "Features will be listed here as they're documented.",
    tint: {
      iconBg: "bg-indigo-50 dark:bg-indigo-950/40",
      iconColor: "text-indigo-500 dark:text-indigo-400",
      motifColor: "text-indigo-300 dark:text-indigo-800",
    },
    motif: FeaturesMotif,
  },
  releases: {
    icon: Tag,
    title: "No releases yet",
    message: "Release notes will appear here when published.",
    tint: {
      iconBg: "bg-rose-50 dark:bg-rose-950/40",
      iconColor: "text-rose-500 dark:text-rose-400",
      motifColor: "text-rose-300 dark:text-rose-800",
    },
    motif: ReleasesMotif,
  },
};

// ---------------------------------------------------------------------------
// Default tint for custom (non-variant) usage
// ---------------------------------------------------------------------------

const defaultTint = {
  iconBg: "bg-slate-100 dark:bg-slate-800",
  iconColor: "text-slate-400 dark:text-slate-500",
  motifColor: "text-slate-300 dark:text-slate-700",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  variant?: keyof typeof variants;
}

export function EmptyState({ icon, title, message, action, className, variant }: EmptyStateProps) {
  const preset = variant ? variants[variant] : undefined;
  const Icon = icon ?? preset?.icon;
  const displayTitle = title ?? preset?.title;
  const displayMessage = message ?? preset?.message;
  const tint = preset?.tint ?? defaultTint;
  const Motif = preset?.motif ?? DefaultMotif;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-14 px-6 select-none",
        className
      )}
    >
      {/* Icon + motif cluster */}
      <motion.div
        className="relative mb-5"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* Decorative motif — sits behind icon at low opacity */}
        <Motif
          className={cn(
            "absolute -inset-6 w-[calc(100%+48px)] h-[calc(100%+48px)] opacity-[0.35] dark:opacity-[0.25]",
            tint.motifColor
          )}
        />
        {/* Icon in tinted circle */}
        {Icon && (
          <div
            className={cn(
              "relative flex items-center justify-center w-12 h-12 rounded-xl",
              "shadow-sm",
              tint.iconBg
            )}
          >
            <Icon size={22} strokeWidth={1.75} className={tint.iconColor} />
          </div>
        )}
      </motion.div>

      {/* Title — Instrument Serif for a moment of quiet distinction */}
      {displayTitle && (
        <motion.p
          className="font-heading text-base text-slate-800 dark:text-slate-200 mb-1 text-center"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
        >
          {displayTitle}
        </motion.p>
      )}

      {/* Message */}
      {displayMessage && (
        <motion.p
          className="text-[13px] text-slate-500 dark:text-slate-400 text-center max-w-[260px] leading-relaxed"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.14 }}
        >
          {displayMessage}
        </motion.p>
      )}

      {/* Action button */}
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Button onClick={action.onClick} className="mt-4">
            {action.label}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
