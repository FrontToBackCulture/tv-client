// src/lib/themes.ts
// Theme registry — each theme is a complete, self-contained look (no
// separate light/dark mode). Some themes are inherently dark (Carbon,
// Aurora), others inherently light (Newsprint, Sunset). The .dark class
// is applied based on theme.isDark so Tailwind dark: variants still work.
//
// Switching themes is a single `data-theme` attribute swap on <html>
// plus toggling the `.dark` class.

export type ThemeId =
  | "aurora"
  | "aurora-day"
  | "linear"
  | "linear-day"
  | "newsprint"
  | "carbon"
  | "slate"
  | "mocha"
  | "midnight"
  | "iceberg"
  | "sunset"
  | "forest"
  | "synthwave"
  | "terminal"
  | "dracula"
  | "tokyo-night"
  | "nord"
  | "gruvbox"
  | "lava"
  | "ocean"
  | "rose-gold"
  | "mint"
  | "plasma"
  | "aurora-borealis"
  | "cyberpunk"
  | "holographic"
  | "galactic"
  | "bubblegum"
  | "tropical";

interface ThemeTokens {
  /** rgb triplet for the page base color */
  surfaceBase: string;
  /** rgb triplet for solid panels / cards */
  surfaceElevated: string;
  /** background-color for .bg-surface-glass before blur */
  glassBg: string;
  /** opacity for the three radial mesh layers — set to 0 to disable */
  mesh: [number, number, number];
  /** full-screen linear wash opacity (0-0.20). Vibrant themes use 0.06-0.14
   *  so the theme's colors permeate the whole canvas, not just corners. */
  meshWash?: number;
  /** secondary mesh tint ("accent" = workspace accent, or rgb triplet) */
  meshTint2: string;
  /** standard border color (rgb triplet) */
  border: string;
  /** corner radius for cards/pills */
  radiusLg: string;
  /** how strongly the workspace accent saturates gradients (0-1.5) */
  accentSaturation: number;
  /** drop-shadow under elevated cards */
  cardShadow: string;
}

interface Theme {
  id: ThemeId;
  label: string;
  description: string;
  /** Apply Tailwind's `.dark` class for this theme */
  isDark: boolean;
  /** Swatch shown in the theme picker */
  preview: string;
  tokens: ThemeTokens;
}

// ─── Dark themes ───────────────────────────────────────────────────────────

const aurora: Theme = {
  id: "aurora",
  label: "Aurora",
  description: "Soft accent gradients, glass surfaces, deep zinc.",
  isDark: true,
  preview: "#181820",
  tokens: {
    surfaceBase: "20 20 23",
    surfaceElevated: "30 30 34",
    glassBg: "rgba(30, 30, 34, 0.55)",
    mesh: [0.18, 0.10, 0.08],
    meshTint2: "99 102 241", // indigo bottom glow
    border: "44 44 49",
    radiusLg: "12px",
    accentSaturation: 1,
    cardShadow: "0 1px 0 rgb(255 255 255 / 0.04) inset, 0 8px 24px -12px rgb(0 0 0 / 0.6)",
  },
};

const linear: Theme = {
  id: "linear",
  label: "Linear",
  description: "Flat, sharp, single dark surface. No gradients.",
  isDark: true,
  preview: "#161719",
  tokens: {
    surfaceBase: "22 23 26",
    surfaceElevated: "30 31 35",
    glassBg: "rgb(28, 29, 33)",
    mesh: [0, 0, 0],
    meshTint2: "accent",
    border: "44 45 50",
    radiusLg: "6px",
    accentSaturation: 0.8,
    cardShadow: "0 1px 0 rgb(255 255 255 / 0.04) inset",
  },
};

const carbon: Theme = {
  id: "carbon",
  label: "Carbon",
  description: "True black, neon accent, brutal contrast, tight radius.",
  isDark: true,
  preview: "#000000",
  tokens: {
    surfaceBase: "0 0 0",
    surfaceElevated: "12 12 14",
    glassBg: "rgba(8, 8, 10, 0.85)",
    mesh: [0.05, 0.03, 0.02],
    meshTint2: "accent",
    border: "30 30 35",
    radiusLg: "4px",
    accentSaturation: 1.4,
    cardShadow: "0 0 0 1px rgb(var(--workspace-accent-rgb) / 0.12), 0 0 24px -8px rgb(var(--workspace-accent-rgb) / 0.25)",
  },
};

const slate: Theme = {
  id: "slate",
  label: "Slate",
  description: "Cool grey-blue, GitHub Dim feel. Calm, low contrast.",
  isDark: true,
  preview: "#1f2329",
  tokens: {
    surfaceBase: "31 35 41",
    surfaceElevated: "42 47 54",
    glassBg: "rgba(42, 47, 54, 0.55)",
    mesh: [0.06, 0.04, 0.04],
    meshTint2: "100 116 139", // slate-500
    border: "55 62 71",
    radiusLg: "8px",
    accentSaturation: 0.85,
    cardShadow: "0 1px 0 rgb(255 255 255 / 0.03) inset, 0 6px 20px -12px rgb(0 0 0 / 0.5)",
  },
};

const mocha: Theme = {
  id: "mocha",
  label: "Mocha",
  description: "Warm brown coffee tones. Cozy dark workspace.",
  isDark: true,
  preview: "#2a221b",
  tokens: {
    surfaceBase: "42 34 27",
    surfaceElevated: "55 45 36",
    glassBg: "rgba(55, 45, 36, 0.55)",
    mesh: [0.10, 0.07, 0.06],
    meshTint2: "194 145 100", // warm latte
    border: "78 64 51",
    radiusLg: "10px",
    accentSaturation: 0.9,
    cardShadow: "0 1px 0 rgb(255 220 180 / 0.04) inset, 0 8px 24px -12px rgb(0 0 0 / 0.5)",
  },
};

const midnight: Theme = {
  id: "midnight",
  label: "Midnight",
  description: "Deep navy + indigo glow. Atmospheric, dramatic.",
  isDark: true,
  preview: "#0d1226",
  tokens: {
    surfaceBase: "13 18 38",
    surfaceElevated: "24 30 56",
    glassBg: "rgba(24, 30, 56, 0.55)",
    mesh: [0.22, 0.14, 0.12],
    meshTint2: "139 92 246", // violet
    border: "40 48 78",
    radiusLg: "12px",
    accentSaturation: 1.1,
    cardShadow: "0 1px 0 rgb(255 255 255 / 0.05) inset, 0 12px 32px -12px rgb(20 0 60 / 0.7)",
  },
};

const forest: Theme = {
  id: "forest",
  label: "Forest",
  description: "Deep evergreen base. Earthy, focused.",
  isDark: true,
  preview: "#10241c",
  tokens: {
    surfaceBase: "16 36 28",
    surfaceElevated: "26 50 40",
    glassBg: "rgba(26, 50, 40, 0.55)",
    mesh: [0.10, 0.07, 0.06],
    meshTint2: "94 162 112", // moss
    border: "44 70 58",
    radiusLg: "10px",
    accentSaturation: 0.9,
    cardShadow: "0 1px 0 rgb(255 255 255 / 0.03) inset, 0 8px 24px -12px rgb(0 0 0 / 0.5)",
  },
};

// ─── Light themes ──────────────────────────────────────────────────────────

const auroraDay: Theme = {
  id: "aurora-day",
  label: "Aurora Day",
  description: "Soft pastel gradient mesh on near-white. Bright and airy.",
  isDark: false,
  preview: "#fafafa",
  tokens: {
    surfaceBase: "250 250 250",
    surfaceElevated: "255 255 255",
    glassBg: "rgba(255, 255, 255, 0.55)",
    mesh: [0.10, 0.07, 0.06],
    meshTint2: "accent",
    border: "228 228 231",
    radiusLg: "12px",
    accentSaturation: 1,
    cardShadow: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px -4px rgb(0 0 0 / 0.04)",
  },
};

const linearDay: Theme = {
  id: "linear-day",
  label: "Linear Day",
  description: "Crisp white, sharp lines, no gradients.",
  isDark: false,
  preview: "#ffffff",
  tokens: {
    surfaceBase: "252 252 253",
    surfaceElevated: "255 255 255",
    glassBg: "rgb(255, 255, 255)",
    mesh: [0, 0, 0],
    meshTint2: "accent",
    border: "228 228 231",
    radiusLg: "6px",
    accentSaturation: 0.8,
    cardShadow: "0 1px 2px rgb(0 0 0 / 0.04)",
  },
};

const newsprint: Theme = {
  id: "newsprint",
  label: "Newsprint",
  description: "Warm cream paper, amber accents, soft shadows.",
  isDark: false,
  preview: "#faf6ee",
  tokens: {
    surfaceBase: "250 246 238",
    surfaceElevated: "255 252 245",
    glassBg: "rgba(255, 252, 245, 0.65)",
    mesh: [0.08, 0.06, 0.05],
    meshTint2: "180 130 80", // amber
    border: "232 222 200",
    radiusLg: "10px",
    accentSaturation: 0.75,
    cardShadow: "0 1px 3px rgb(120 80 30 / 0.08), 0 6px 16px -6px rgb(120 80 30 / 0.08)",
  },
};

const iceberg: Theme = {
  id: "iceberg",
  label: "Iceberg",
  description: "Cool light blue-grey. Crisp and minimal.",
  isDark: false,
  preview: "#eef3f8",
  tokens: {
    surfaceBase: "238 243 248",
    surfaceElevated: "248 251 254",
    glassBg: "rgba(248, 251, 254, 0.65)",
    mesh: [0.10, 0.07, 0.06],
    meshTint2: "59 130 246", // blue-500
    border: "215 226 238",
    radiusLg: "10px",
    accentSaturation: 0.85,
    cardShadow: "0 1px 2px rgb(30 60 100 / 0.06), 0 4px 12px -4px rgb(30 60 100 / 0.06)",
  },
};

const sunset: Theme = {
  id: "sunset",
  label: "Sunset",
  description: "Warm peach + coral. Golden hour energy.",
  isDark: false,
  preview: "#ffdec5",
  tokens: {
    surfaceBase: "255 222 197", // clearly peach
    surfaceElevated: "255 236 220",
    glassBg: "rgba(255, 236, 220, 0.65)",
    mesh: [0.18, 0.14, 0.12],
    meshWash: 0.08,
    meshTint2: "239 108 92",
    border: "240 200 178",
    radiusLg: "12px",
    accentSaturation: 1.0,
    cardShadow: "0 1px 3px rgb(180 80 60 / 0.10), 0 6px 18px -6px rgb(180 80 60 / 0.12)",
  },
};

// ─── Distinctive themes ───────────────────────────────────────────────────

const synthwave: Theme = {
  id: "synthwave",
  label: "Synthwave",
  description: "Neon magenta + cyan over deep purple. Retrofuturistic glow.",
  isDark: true,
  preview: "#2a1448",
  tokens: {
    surfaceBase: "42 20 72", // clearly purple
    surfaceElevated: "60 32 96",
    glassBg: "rgba(60, 32, 96, 0.55)",
    mesh: [0.30, 0.24, 0.20],
    meshWash: 0.09,
    meshTint2: "255 80 188",
    border: "96 52 138",
    radiusLg: "10px",
    accentSaturation: 1.3,
    cardShadow: "0 1px 0 rgb(255 100 200 / 0.10) inset, 0 8px 32px -10px rgb(255 80 188 / 0.35)",
  },
};

const terminal: Theme = {
  id: "terminal",
  label: "Terminal",
  description: "Phosphor green on near-black. CRT monitor nostalgia.",
  isDark: true,
  preview: "#070c08",
  tokens: {
    surfaceBase: "7 12 8",
    surfaceElevated: "16 24 18",
    glassBg: "rgba(16, 24, 18, 0.85)",
    mesh: [0.06, 0.04, 0.03],
    meshTint2: "0 255 130", // phosphor green
    border: "30 60 38",
    radiusLg: "2px",
    accentSaturation: 1.1,
    cardShadow: "0 0 0 1px rgb(0 255 130 / 0.08), 0 0 16px -4px rgb(0 255 130 / 0.20)",
  },
};

const dracula: Theme = {
  id: "dracula",
  label: "Dracula",
  description: "Iconic dev theme. Soft pink, purple, and cyan on slate.",
  isDark: true,
  preview: "#282a36",
  tokens: {
    surfaceBase: "40 42 54",
    surfaceElevated: "55 58 73",
    glassBg: "rgba(55, 58, 73, 0.55)",
    mesh: [0.10, 0.08, 0.06],
    meshTint2: "255 121 198", // dracula pink
    border: "68 71 90",
    radiusLg: "8px",
    accentSaturation: 1.0,
    cardShadow: "0 1px 0 rgb(255 255 255 / 0.04) inset, 0 8px 24px -12px rgb(0 0 0 / 0.5)",
  },
};

const tokyoNight: Theme = {
  id: "tokyo-night",
  label: "Tokyo Night",
  description: "Cool navy + soft violet + electric cyan. Modern editor vibe.",
  isDark: true,
  preview: "#1a1b26",
  tokens: {
    surfaceBase: "26 27 38",
    surfaceElevated: "41 46 66",
    glassBg: "rgba(41, 46, 66, 0.55)",
    mesh: [0.14, 0.10, 0.08],
    meshTint2: "125 207 255", // tokyo cyan
    border: "65 72 104",
    radiusLg: "8px",
    accentSaturation: 1.05,
    cardShadow: "0 1px 0 rgb(255 255 255 / 0.04) inset, 0 10px 28px -12px rgb(0 0 0 / 0.55)",
  },
};

const nord: Theme = {
  id: "nord",
  label: "Nord",
  description: "Arctic blue-grey. Calm, balanced, low contrast.",
  isDark: true,
  preview: "#2e3440",
  tokens: {
    surfaceBase: "46 52 64",
    surfaceElevated: "59 66 82",
    glassBg: "rgba(59, 66, 82, 0.55)",
    mesh: [0.06, 0.05, 0.04],
    meshTint2: "136 192 208", // nord frost
    border: "76 86 106",
    radiusLg: "6px",
    accentSaturation: 0.85,
    cardShadow: "0 1px 0 rgb(255 255 255 / 0.03) inset, 0 6px 20px -12px rgb(0 0 0 / 0.5)",
  },
};

const gruvbox: Theme = {
  id: "gruvbox",
  label: "Gruvbox",
  description: "Warm retro brown + olive + amber. Vintage terminal warmth.",
  isDark: true,
  preview: "#282828",
  tokens: {
    surfaceBase: "40 40 40",
    surfaceElevated: "60 56 54",
    glassBg: "rgba(60, 56, 54, 0.55)",
    mesh: [0.08, 0.06, 0.05],
    meshTint2: "254 128 25", // gruvbox orange
    border: "80 73 69",
    radiusLg: "6px",
    accentSaturation: 0.9,
    cardShadow: "0 1px 0 rgb(255 220 180 / 0.04) inset, 0 6px 20px -12px rgb(0 0 0 / 0.5)",
  },
};

const lava: Theme = {
  id: "lava",
  label: "Lava",
  description: "Deep volcanic red + ember orange glow. Intense and warm.",
  isDark: true,
  preview: "#3a1216",
  tokens: {
    surfaceBase: "58 18 22", // clearly red
    surfaceElevated: "78 30 34",
    glassBg: "rgba(78, 30, 34, 0.55)",
    mesh: [0.28, 0.22, 0.18],
    meshWash: 0.10,
    meshTint2: "255 100 30",
    border: "120 50 52",
    radiusLg: "10px",
    accentSaturation: 1.2,
    cardShadow: "0 1px 0 rgb(255 150 100 / 0.10) inset, 0 10px 32px -10px rgb(255 80 30 / 0.35)",
  },
};

const ocean: Theme = {
  id: "ocean",
  label: "Ocean",
  description: "Deep sea teal + bioluminescent cyan. Submerged calm.",
  isDark: true,
  preview: "#10303a",
  tokens: {
    surfaceBase: "16 48 58", // clearly teal
    surfaceElevated: "30 70 84",
    glassBg: "rgba(30, 70, 84, 0.55)",
    mesh: [0.20, 0.16, 0.14],
    meshWash: 0.08,
    meshTint2: "100 220 220",
    border: "62 110 128",
    radiusLg: "10px",
    accentSaturation: 1.0,
    cardShadow: "0 1px 0 rgb(150 240 240 / 0.07) inset, 0 10px 28px -10px rgb(0 60 80 / 0.5)",
  },
};

const roseGold: Theme = {
  id: "rose-gold",
  label: "Rose Gold",
  description: "Copper-pink on warm cream. Refined, romantic light.",
  isDark: false,
  preview: "#fcf0eb",
  tokens: {
    surfaceBase: "252 240 235",
    surfaceElevated: "255 247 244",
    glassBg: "rgba(255, 247, 244, 0.65)",
    mesh: [0.12, 0.09, 0.08],
    meshTint2: "225 130 130", // rose
    border: "240 215 205",
    radiusLg: "12px",
    accentSaturation: 0.9,
    cardShadow: "0 1px 3px rgb(180 90 90 / 0.08), 0 6px 18px -6px rgb(180 90 90 / 0.10)",
  },
};

const mint: Theme = {
  id: "mint",
  label: "Mint",
  description: "Fresh light green + soft white. Clean, energizing.",
  isDark: false,
  preview: "#eefaf2",
  tokens: {
    surfaceBase: "238 250 242",
    surfaceElevated: "248 254 250",
    glassBg: "rgba(248, 254, 250, 0.65)",
    mesh: [0.10, 0.08, 0.06],
    meshTint2: "20 184 130", // mint
    border: "200 232 215",
    radiusLg: "10px",
    accentSaturation: 0.9,
    cardShadow: "0 1px 2px rgb(40 120 80 / 0.06), 0 4px 14px -4px rgb(40 120 80 / 0.08)",
  },
};

// ─── Vibrant themes ───────────────────────────────────────────────────────

const plasma: Theme = {
  id: "plasma",
  label: "Plasma",
  description: "Hot pink + magenta over deep purple. Saturated electric heat.",
  isDark: true,
  preview: "#3a1450",
  tokens: {
    surfaceBase: "58 20 80", // clearly purple, not near-black
    surfaceElevated: "76 32 100",
    glassBg: "rgba(76, 32, 100, 0.55)",
    mesh: [0.36, 0.28, 0.22],
    meshWash: 0.10,
    meshTint2: "255 60 130", // hot pink
    border: "108 50 130",
    radiusLg: "12px",
    accentSaturation: 1.4,
    cardShadow: "0 1px 0 rgb(255 100 200 / 0.12) inset, 0 12px 36px -10px rgb(255 60 130 / 0.40)",
  },
};

const auroraBorealis: Theme = {
  id: "aurora-borealis",
  label: "Aurora Borealis",
  description: "Electric green dancing over violet night sky. Northern lights.",
  isDark: true,
  preview: "#0e2240",
  tokens: {
    surfaceBase: "16 36 64", // clearly navy, not near-black
    surfaceElevated: "30 54 88",
    glassBg: "rgba(30, 54, 88, 0.55)",
    mesh: [0.32, 0.28, 0.24],
    meshWash: 0.10,
    meshTint2: "70 230 175",
    border: "60 90 130",
    radiusLg: "12px",
    accentSaturation: 1.3,
    cardShadow: "0 1px 0 rgb(150 240 200 / 0.08) inset, 0 12px 36px -10px rgb(70 230 175 / 0.30)",
  },
};

const cyberpunk: Theme = {
  id: "cyberpunk",
  label: "Cyberpunk",
  description: "Electric yellow + neon magenta on dark teal. Glitch energy.",
  isDark: true,
  preview: "#103040",
  tokens: {
    surfaceBase: "16 48 64", // clearly teal, not near-black
    surfaceElevated: "30 70 88",
    glassBg: "rgba(30, 70, 88, 0.55)",
    mesh: [0.32, 0.26, 0.22],
    meshWash: 0.10,
    meshTint2: "255 232 30",
    border: "60 110 130",
    radiusLg: "4px",
    accentSaturation: 1.5,
    cardShadow: "0 0 0 1px rgb(255 232 30 / 0.10), 0 0 24px -6px rgb(255 232 30 / 0.20), 0 0 24px -6px rgb(var(--workspace-accent-rgb) / 0.25)",
  },
};

const holographic: Theme = {
  id: "holographic",
  label: "Holographic",
  description: "Iridescent pastel shimmer. Pearlescent and futuristic.",
  isDark: false,
  preview: "#e8def8",
  tokens: {
    surfaceBase: "232 222 248", // clearly lavender
    surfaceElevated: "242 236 252",
    glassBg: "rgba(242, 236, 252, 0.55)",
    mesh: [0.26, 0.22, 0.20],
    meshWash: 0.10,
    meshTint2: "120 220 220",
    border: "204 192 232",
    radiusLg: "14px",
    accentSaturation: 1.15,
    cardShadow: "0 1px 3px rgb(150 100 220 / 0.10), 0 8px 24px -8px rgb(150 100 220 / 0.14)",
  },
};

const galactic: Theme = {
  id: "galactic",
  label: "Galactic",
  description: "Deep space + nebula pink + violet stars. Cosmic depth.",
  isDark: true,
  preview: "#1a1450",
  tokens: {
    surfaceBase: "26 20 80", // clearly indigo
    surfaceElevated: "42 32 100",
    glassBg: "rgba(42, 32, 100, 0.55)",
    mesh: [0.30, 0.26, 0.22],
    meshWash: 0.10,
    meshTint2: "230 100 220",
    border: "70 56 130",
    radiusLg: "12px",
    accentSaturation: 1.25,
    cardShadow: "0 1px 0 rgb(220 180 255 / 0.08) inset, 0 12px 36px -10px rgb(230 100 220 / 0.30)",
  },
};

const bubblegum: Theme = {
  id: "bubblegum",
  label: "Bubblegum",
  description: "Hot pink + electric cyan on cream. Y2K pop energy.",
  isDark: false,
  preview: "#ffe4f0",
  tokens: {
    surfaceBase: "255 228 240", // clearly pink
    surfaceElevated: "255 240 248",
    glassBg: "rgba(255, 240, 248, 0.65)",
    mesh: [0.22, 0.18, 0.16],
    meshWash: 0.08,
    meshTint2: "60 200 230",
    border: "248 200 222",
    radiusLg: "14px",
    accentSaturation: 1.15,
    cardShadow: "0 1px 3px rgb(220 80 160 / 0.12), 0 8px 24px -6px rgb(220 80 160 / 0.14)",
  },
};

const tropical: Theme = {
  id: "tropical",
  label: "Tropical",
  description: "Turquoise water + coral reef + sunshine. Beach paradise.",
  isDark: false,
  preview: "#d4f5ec",
  tokens: {
    surfaceBase: "212 245 236", // clearly turquoise
    surfaceElevated: "228 252 244",
    glassBg: "rgba(228, 252, 244, 0.65)",
    mesh: [0.24, 0.20, 0.18],
    meshWash: 0.08,
    meshTint2: "255 130 100",
    border: "180 222 208",
    radiusLg: "14px",
    accentSaturation: 1.1,
    cardShadow: "0 1px 3px rgb(40 160 140 / 0.12), 0 8px 22px -6px rgb(40 160 140 / 0.14)",
  },
};

// ─── Registry ──────────────────────────────────────────────────────────────

export const THEMES: Record<ThemeId, Theme> = {
  aurora,
  "aurora-day": auroraDay,
  linear,
  "linear-day": linearDay,
  newsprint,
  carbon,
  slate,
  mocha,
  midnight,
  iceberg,
  sunset,
  forest,
  synthwave,
  terminal,
  dracula,
  "tokyo-night": tokyoNight,
  nord,
  gruvbox,
  lava,
  ocean,
  "rose-gold": roseGold,
  mint,
  plasma,
  "aurora-borealis": auroraBorealis,
  cyberpunk,
  holographic,
  galactic,
  bubblegum,
  tropical,
};

// Curated display order — vibrant first, then distinctive,
// then neutrals, then light themes.
export const THEME_LIST: Theme[] = [
  // Vibrant dark
  plasma,
  auroraBorealis,
  cyberpunk,
  galactic,
  synthwave,
  lava,
  // Signature dark
  aurora,
  midnight,
  tokyoNight,
  dracula,
  ocean,
  forest,
  mocha,
  // Neutral / minimal dark
  carbon,
  terminal,
  nord,
  gruvbox,
  slate,
  linear,
  // Vibrant light
  bubblegum,
  tropical,
  holographic,
  sunset,
  // Soft light
  auroraDay,
  newsprint,
  iceberg,
  roseGold,
  mint,
  linearDay,
];

// ─── Apply theme to <html> ─────────────────────────────────────────────────

export function applyTheme(themeId: ThemeId) {
  if (typeof document === "undefined") return;
  const theme = THEMES[themeId] ?? aurora;
  const root = document.documentElement;
  const t = theme.tokens;

  root.setAttribute("data-theme", themeId);
  root.classList.toggle("dark", theme.isDark);

  root.style.setProperty("--surface-base", t.surfaceBase);
  root.style.setProperty("--surface-elevated", t.surfaceElevated);
  root.style.setProperty("--glass-bg", t.glassBg);
  root.style.setProperty("--mesh-1", String(t.mesh[0]));
  root.style.setProperty("--mesh-2", String(t.mesh[1]));
  root.style.setProperty("--mesh-3", String(t.mesh[2]));
  root.style.setProperty("--mesh-wash", String(t.meshWash ?? 0));
  root.style.setProperty(
    "--mesh-tint-2",
    t.meshTint2 === "accent" ? "var(--workspace-accent-rgb)" : t.meshTint2,
  );
  root.style.setProperty("--theme-border", t.border);
  root.style.setProperty("--theme-radius-lg", t.radiusLg);
  root.style.setProperty("--accent-saturation", String(t.accentSaturation));
  root.style.setProperty("--card-shadow", t.cardShadow);
}
