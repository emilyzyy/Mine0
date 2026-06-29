export const THEME = {
  bg: "#080c14",
  bgCard: "#0f172a",
  bgCardBorder: "#1e293b",
  bgCardHover: "#162032",

  accent: "#22d3ee",    // cyan — primary highlight
  accent2: "#7c3aed",   // purple — secondary
  accent3: "#22c55e",   // green — success / confirm
  warn: "#f59e0b",      // amber — warning / alert

  text: "#f0f6fc",
  textMuted: "#94a3b8",
  textDim: "#475569",

  fontSans: "'SF Pro Display', 'Segoe UI', system-ui, -apple-system, sans-serif",
  fontMono: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace",

  // Background grid used across scenes
  gridBg: {
    backgroundImage: `
      linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(34,211,238,0.04) 1px, transparent 1px)
    `,
    backgroundSize: "80px 80px",
  } as React.CSSProperties,
};

export const SCENE_DURATIONS = {
  title:        120,  // 0–4s
  objective:    180,  // 4–10s
  decisionTree: 360,  // 10–22s
  mainDemo:     480,  // 22–38s
  closedLoop:   300,  // 38–48s
  recovery:     210,  // 48–55s
  architecture: 150,  // 55–60s
} as const;

export const SCENE_STARTS = {
  title:        0,
  objective:    120,
  decisionTree: 300,
  mainDemo:     660,
  closedLoop:   1140,
  recovery:     1440,
  architecture: 1650,
} as const;

export const FPS = 30;
export const TOTAL_FRAMES = 1800; // 60s
