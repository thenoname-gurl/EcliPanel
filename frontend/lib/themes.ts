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
  },
  {
    name: "Arctic White",
    primary: "#8b5cf6",
    bg: "#f4f3f9",
    card: "#ffffff",
    secondary: "#ede9f5",
    sidebar: "#f0eef8",
    accent: "#ddd6fe",
    accentFg: "#5b21b6",
    glow: "#8b5cf640",
    border: "#d4c8f0",
  },
] as const;

export type Theme = (typeof THEMES)[number];

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty('--primary', theme.primary as string);
  root.style.setProperty('--background', theme.bg as string);
  root.style.setProperty('--card', theme.card as string);
  root.style.setProperty('--secondary', theme.secondary as string);
  root.style.setProperty('--sidebar', theme.sidebar as string);
  root.style.setProperty('--accent', theme.accent as string);
  root.style.setProperty('--accent-foreground', theme.accentFg as string);
  root.style.setProperty('--glow', theme.glow as string);
  root.style.setProperty('--glow-strong', theme.primary as string);
  root.style.setProperty('--ring', theme.primary as string);
  root.style.setProperty('--sidebar-primary', theme.primary as string);
  root.style.setProperty('--border', theme.border as string);
  root.style.setProperty('--chart-1', theme.primary as string);
  try {
    localStorage.setItem('eclipseTheme', theme.name);
  } catch {}
}
