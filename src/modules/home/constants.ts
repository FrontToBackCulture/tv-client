// Home feed constants — colors and icons per card type

import {
  Zap,
  Lightbulb,
  Users,
  Star,
  Monitor,
  Flag,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import type { CardType } from "./types";

export const typeColors: Record<
  CardType,
  {
    accent: string;
    accentBright: string;
    bg: string;
    badgeBg: string;
    badgeBorder: string;
    ctaBg: string;
    ctaHoverBg: string;
    glow: string;
  }
> = {
  feature: {
    accent: "text-teal-600 dark:text-teal-400",
    accentBright: "text-teal-500 dark:text-teal-300",
    bg: "from-teal-50/80 via-white to-white dark:from-teal-950/40 dark:via-zinc-950/60 dark:to-zinc-950",
    badgeBg: "bg-teal-500/10 dark:bg-teal-500/15",
    badgeBorder: "border-teal-500/20",
    ctaBg: "bg-teal-500/10 hover:bg-teal-500/20 dark:bg-teal-500/15 dark:hover:bg-teal-500/25",
    ctaHoverBg: "",
    glow: "bg-teal-500",
  },
  tip: {
    accent: "text-amber-600 dark:text-amber-400",
    accentBright: "text-amber-500 dark:text-amber-300",
    bg: "from-amber-50/80 via-white to-white dark:from-amber-950/30 dark:via-zinc-950/60 dark:to-zinc-950",
    badgeBg: "bg-amber-500/10 dark:bg-amber-500/12",
    badgeBorder: "border-amber-500/18",
    ctaBg: "bg-amber-500/10 hover:bg-amber-500/20 dark:bg-amber-500/12 dark:hover:bg-amber-500/22",
    ctaHoverBg: "",
    glow: "bg-amber-500",
  },
  team: {
    accent: "text-blue-600 dark:text-blue-400",
    accentBright: "text-blue-500 dark:text-blue-300",
    bg: "from-blue-50/80 via-white to-white dark:from-blue-950/30 dark:via-zinc-950/60 dark:to-zinc-950",
    badgeBg: "bg-blue-500/10 dark:bg-blue-500/12",
    badgeBorder: "border-blue-500/18",
    ctaBg: "bg-blue-500/10 hover:bg-blue-500/20 dark:bg-blue-500/12 dark:hover:bg-blue-500/22",
    ctaHoverBg: "",
    glow: "bg-blue-500",
  },
  skill: {
    accent: "text-violet-600 dark:text-violet-400",
    accentBright: "text-violet-500 dark:text-violet-300",
    bg: "from-violet-50/80 via-white to-white dark:from-violet-950/30 dark:via-zinc-950/60 dark:to-zinc-950",
    badgeBg: "bg-violet-500/10 dark:bg-violet-500/12",
    badgeBorder: "border-violet-500/18",
    ctaBg: "bg-violet-500/10 hover:bg-violet-500/20 dark:bg-violet-500/12 dark:hover:bg-violet-500/22",
    ctaHoverBg: "",
    glow: "bg-violet-500",
  },
  platform: {
    accent: "text-emerald-600 dark:text-emerald-400",
    accentBright: "text-emerald-500 dark:text-emerald-300",
    bg: "from-emerald-50/80 via-white to-white dark:from-emerald-950/30 dark:via-zinc-950/60 dark:to-zinc-950",
    badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/12",
    badgeBorder: "border-emerald-500/18",
    ctaBg: "bg-emerald-500/10 hover:bg-emerald-500/20 dark:bg-emerald-500/12 dark:hover:bg-emerald-500/22",
    ctaHoverBg: "",
    glow: "bg-emerald-500",
  },
  release: {
    accent: "text-rose-600 dark:text-rose-400",
    accentBright: "text-rose-500 dark:text-rose-300",
    bg: "from-rose-50/80 via-white to-white dark:from-rose-950/30 dark:via-zinc-950/60 dark:to-zinc-950",
    badgeBg: "bg-rose-500/10 dark:bg-rose-500/12",
    badgeBorder: "border-rose-500/18",
    ctaBg: "bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-500/12 dark:hover:bg-rose-500/22",
    ctaHoverBg: "",
    glow: "bg-rose-500",
  },
  module: {
    accent: "text-orange-600 dark:text-orange-400",
    accentBright: "text-orange-500 dark:text-orange-300",
    bg: "from-orange-50/80 via-white to-white dark:from-orange-950/30 dark:via-zinc-950/60 dark:to-zinc-950",
    badgeBg: "bg-orange-500/10 dark:bg-orange-500/12",
    badgeBorder: "border-orange-500/18",
    ctaBg: "bg-orange-500/10 hover:bg-orange-500/20 dark:bg-orange-500/12 dark:hover:bg-orange-500/22",
    ctaHoverBg: "",
    glow: "bg-orange-500",
  },
  app_tip: {
    accent: "text-cyan-600 dark:text-cyan-400",
    accentBright: "text-cyan-500 dark:text-cyan-300",
    bg: "from-cyan-50/80 via-white to-white dark:from-cyan-950/30 dark:via-zinc-950/60 dark:to-zinc-950",
    badgeBg: "bg-cyan-500/10 dark:bg-cyan-500/12",
    badgeBorder: "border-cyan-500/18",
    ctaBg: "bg-cyan-500/10 hover:bg-cyan-500/20 dark:bg-cyan-500/12 dark:hover:bg-cyan-500/22",
    ctaHoverBg: "",
    glow: "bg-cyan-500",
  },
};

export const typeIcons: Record<CardType, typeof Zap> = {
  feature: Zap,
  tip: Lightbulb,
  team: Users,
  skill: Star,
  platform: Monitor,
  release: Flag,
  module: LayoutGrid,
  app_tip: Sparkles,
};
