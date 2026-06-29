import React from "react";

export const THEME = {
  // Base palette
  bg: "#070b12",
  bgCard: "#0f172a",
  bgCardBorder: "#1e293b",

  accent: "#22d3ee",   // cyan
  accent2: "#7c3aed",  // purple
  accent3: "#22c55e",  // green
  warn: "#f59e0b",     // amber

  text: "#f0f6fc",
  textMuted: "#94a3b8",
  textDim: "#475569",

  fontSans: "'SF Pro Display', 'Segoe UI', system-ui, -apple-system, sans-serif",
  fontMono: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace",

  // Minecraft-native palette (original CSS approximations, no copyrighted assets)
  mc: {
    grassTop:    "#5A9C1A",
    grassSide:   "#4A8514",
    dirtBrown:   "#875C27",
    stoneMid:    "#7A7A7A",
    stoneDark:   "#555555",
    stoneLight:  "#9A9A9A",
    nightSky:    "#050810",
    redstone:    "#FF3030",
    xpGreen:     "#7EDD41",
    xpDark:      "#4FA612",
    torchYellow: "#FFD54F",
    enchantPurp: "#7035C8",
    slotBg:      "#8B8080",
    slotLight:   "#DBDBDB",
    slotDark:    "#3C3C3C",
    advanceBg:   "#1a3a1a",
    advanceBorder:"#2a5a2a",
    creeper:     "#5FBB3B",
    diamond:     "#4FE7ED",
    lavaOrange:  "#FF8000",
  },

  // Background grid used across scenes
  gridBg: {
    backgroundImage: `
      linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(34,211,238,0.04) 1px, transparent 1px)
    `,
    backgroundSize: "80px 80px",
  } as React.CSSProperties,

  // Minecraft pixel grid texture
  pixelGrid: {
    backgroundImage: `
      repeating-linear-gradient(90deg, transparent, transparent 7px, rgba(0,0,0,0.12) 7px, rgba(0,0,0,0.12) 8px),
      repeating-linear-gradient(0deg,  transparent, transparent 7px, rgba(0,0,0,0.12) 7px, rgba(0,0,0,0.12) 8px)
    `,
    backgroundSize: "8px 8px",
  } as React.CSSProperties,
};

// ── Revised timing ──────────────────────────────────────────────
// Scene 1: 0–4s       Title / Night crew hook
// Scene 2: 4–9s       Objective input (cycling goals)
// Scene 3: 9–17s      Agent crew inventory cards
// Scene 4: 17–38s     Main demo (side-by-side + HUD)
// Scene 5: 38–48s     Use-case advancement tiles
// Scene 6: 48–55s     Failure recovery event log
// Scene 7: 55–60s     Final punch card
// ────────────────────────────────────────────────────────────────
export const SCENE_DURATIONS = {
  title:        120,  // 4s
  objective:    150,  // 5s
  agentCrew:    240,  // 8s
  mainDemo:     630,  // 21s  ← biggest scene
  useCases:     300,  // 10s
  recovery:     210,  // 7s
  architecture: 150,  // 5s
} as const;

export const SCENE_STARTS = {
  title:        0,
  objective:    120,
  agentCrew:    270,
  mainDemo:     510,
  useCases:     1140,
  recovery:     1440,
  architecture: 1650,
} as const;

export const FPS = 30;
export const TOTAL_FRAMES = 1800; // 60s
