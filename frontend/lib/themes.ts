export const THEMES = [
  {
    name: "Eclipse Purple",
    primary: "#8b5cf6",
    bg: "#0a0a12",
    card: "#12111f",
    secondary: "#1a1830",
    sidebar: "#0e0d1a",
    accent: "#2d1f6e",
    accentFg: "#c4b5fd",
    glow: "#8b5cf680",
    border: "#2a2545",
    foreground: "#e8e4f0",
    cardForeground: "#e8e4f0",
    description: "Dark purple theme with high-contrast accents and deep backgrounds (pixelcats fav)!",
  },
  {
    name: "Cyber Blue",
    primary: "#06b6d4",
    bg: "#0a0f14",
    card: "#0f1820",
    secondary: "#131e2a",
    sidebar: "#0c1520",
    accent: "#0d2d3a",
    accentFg: "#a5f3fc",
    glow: "#06b6d480",
    border: "#1a2e3a",
    foreground: "#e8e4f0",
    cardForeground: "#e8e4f0",
    description: "Dark blue x cyan theme with sleek neon-like highlights. Techno!",
  },
  {
    name: "Neon Green",
    primary: "#10b981",
    bg: "#0a120e",
    card: "#0f1f17",
    secondary: "#12211a",
    sidebar: "#0c1e14",
    accent: "#0d2e1f",
    accentFg: "#a7f3d0",
    glow: "#10b98180",
    border: "#1a3028",
    foreground: "#e8e4f0",
    cardForeground: "#e8e4f0",
    description: "Dark theme with vivid neon-green accents for visibility. TOUCH GRASS!",
  },
  {
    name: "Solar Orange",
    primary: "#f59e0b",
    bg: "#12100a",
    card: "#1f1c0f",
    secondary: "#261f0e",
    sidebar: "#1a160c",
    accent: "#3b2a0a",
    accentFg: "#fde68a",
    glow: "#f59e0b80",
    border: "#333018",
    foreground: "#e8e4f0",
    cardForeground: "#e8e4f0",
    description: "Warm dark theme with golden-orange accents and solar warmth. Hot!",
  },
  {
    name: "Ruby Red",
    primary: "#ef4444",
    bg: "#120a0a",
    card: "#1f0f0f",
    secondary: "#260e0e",
    sidebar: "#1a0c0c",
    accent: "#3b0a0a",
    accentFg: "#fca5a5",
    glow: "#ef444480",
    border: "#331818",
    foreground: "#e8e4f0",
    cardForeground: "#e8e4f0",
    description: "Bold dark theme with crimson accents and dramatic contrast.. Nether!",
  },
  {
    name: "Voters 7 Mystery",
    primary: "#9CA3AF",
    bg: "#050507",
    card: "#0b0b0d",
    secondary: "#0a0a0b",
    sidebar: "#070708",
    accent: "#374151",
    accentFg: "#e6e7e9",
    glow: "#9CA3AF40",
    border: "#121214",
    foreground: "#e6e7e9",
    cardForeground: "#e6e7e9",
    description: "Inspired by Voters 7 from 2nd Ship on HC.. we don't know much about them.",
  },
  {
    name: "Arctic White",
    primary: "#8b5cf6",
    bg: "#f4f3f9",
    card: "#ffffff",
    secondary: "#e8e7f0",
    sidebar: "#f1eff8",
    accent: "#d8d1ff",
    accentFg: "#4f46e5",
    glow: "#8b5cf640",
    border: "#c9b7ef",
    foreground: "#1f2937",
    cardForeground: "#0f172a",
    description: "Light theme with soft purple accents and gentle contrast (pixelcats fav).",
  },
  {
    name: "Arctic Snow",
    primary: "#0ea5e9",
    bg: "#fbfbff",
    card: "#ffffff",
    secondary: "#f1f5ff",
    sidebar: "#f8faff",
    accent: "#bae6fd",
    accentFg: "#0369a1",
    glow: "#0ea5e980",
    border: "#dbeafe",
    foreground: "#1e293b",
    cardForeground: "#0f172a",
    description: "Crisp light blue theme with airy, high clarity UI colors.",
  },
  {
    name: "Frost Beam",
    primary: "#22d3ee",
    bg: "#fdfdff",
    card: "#ffffff",
    secondary: "#ecfeff",
    sidebar: "#f6feff",
    accent: "#a5f3fc",
    accentFg: "#0f766e",
    glow: "#22d3ee80",
    border: "#c8fbff",
    foreground: "#1f2937",
    cardForeground: "#0f172a",
    description: "Icy light theme with cyan highlights and clean surfaces..",
  },
  {
    name: "Nordic Light",
    primary: "#818cf8",
    bg: "#fafbff",
    card: "#ffffff",
    secondary: "#f3f4ff",
    sidebar: "#f7f8ff",
    accent: "#c7d2fe",
    accentFg: "#4338ca",
    glow: "#818cf880",
    border: "#e0e7ff",
    foreground: "#111827",
    cardForeground: "#0f172a",
    description: "Soft pastel light theme inspired by Scandinavian palettes!",
  },
  {
    name: "Bubblegum Pink",
    primary: "#e594c7",
    bg: "#f4f8ff",
    card: "#ffffff",
    secondary: "#eef4ff",
    sidebar: "#eef6ff",
    accent: "#4f8ef6",
    accentFg: "#0b3d91",
    glow: "#4f8ef640",
    border: "#dbeafe",
    foreground: "#0f172a",
    cardForeground: "#0f172a",
    description: "Its bubblegum! Its.. pink theme with cool blue accents for serious business talks!",
  },
] as const;

export type Theme = (typeof THEMES)[number];

type TransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> }
}

type ApplyThemeOptions = {
  animate?: boolean
}

function applyThemeStyles(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--background", theme.bg);
  root.style.setProperty("--card", theme.card);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--sidebar", theme.sidebar);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-foreground", theme.accentFg);
  root.style.setProperty("--glow", theme.glow);
  root.style.setProperty("--glow-strong", theme.primary);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--sidebar-primary", theme.primary);
  root.style.setProperty("--border", theme.border);
  root.style.setProperty("--chart-1", theme.primary);
  if (theme.foreground) {
    root.style.setProperty("--foreground", theme.foreground);
  }
  if (theme.cardForeground) {
    root.style.setProperty("--card-foreground", theme.cardForeground);
  }
}

export function applyTheme(theme: Theme, options?: ApplyThemeOptions): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  const animate = options?.animate === true;
  if (!animate) {
    applyThemeStyles(theme);
    return Promise.resolve();
  }

  const root = document.documentElement;
  root.style.setProperty("--switch-name", "shigure-scale");
  if (!root.style.getPropertyValue("--switch-duration")) {
    root.style.setProperty("--switch-duration", "2.5s");
  }

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const transitionDocument = document as TransitionDocument;

  if (!transitionDocument.startViewTransition || prefersReducedMotion) {
    applyThemeStyles(theme);
    return Promise.resolve();
  }

  return transitionDocument
    .startViewTransition(() => {
      applyThemeStyles(theme);
    })
    .finished.catch(() => undefined);
}