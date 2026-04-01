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
  if ((theme as any).foreground) {
    root.style.setProperty('--foreground', (theme as any).foreground);
  }
  if ((theme as any).cardForeground) {
    root.style.setProperty('--card-foreground', (theme as any).cardForeground);
  }
}
