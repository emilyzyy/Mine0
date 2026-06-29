import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { THEME } from "../theme";
import { getPovPhase, type PovPhase } from "./demoTimeline";

const cl = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

// ─── Pixel-art icons ────────────────────────────────────────────────────────

const IronOre: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <rect x={0} y={0} width={16} height={16} fill="#7A7A7A" />
    <rect x={0} y={0} width={8} height={8}  fill="#6A6A6A" />
    <rect x={8} y={8} width={8} height={8}  fill="#6A6A6A" />
    <rect x={3} y={2} width={4} height={3}  fill="#C8844A" />
    <rect x={9} y={5} width={3} height={4}  fill="#B87040" />
    <rect x={2} y={10} width={5} height={3} fill="#C8844A" />
    <rect x={0} y={14} width={16} height={2} fill="#4A4A4A" />
    <rect x={14} y={0} width={2} height={16} fill="#4A4A4A" />
    <rect x={0} y={0} width={16} height={1} fill="#9A9A9A" opacity={0.4} />
  </svg>
);

const IronIngot: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <rect x={2} y={4} width={12} height={8} fill="#C8C8C8" />
    <rect x={4} y={2} width={8}  height={2} fill="#B0B0B0" />
    <rect x={4} y={12} width={8} height={2} fill="#B0B0B0" />
    <rect x={3} y={5} width={2}  height={2} fill="#E8E8E8" />
    <rect x={2} y={11} width={12} height={1} fill="#808080" />
  </svg>
);

const IronHelmet: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20">
    <rect x={4}  y={2}  width={12} height={4}  fill="#A8A8A8" />
    <rect x={2}  y={6}  width={4}  height={9}  fill="#A8A8A8" />
    <rect x={14} y={6}  width={4}  height={9}  fill="#A8A8A8" />
    <rect x={4}  y={15} width={4}  height={3}  fill="#909090" />
    <rect x={12} y={15} width={4}  height={3}  fill="#909090" />
    <rect x={6}  y={6}  width={8}  height={9}  fill="#1C1C1C" />
    <rect x={5}  y={3}  width={2}  height={1}  fill="#D0D0D0" opacity={0.8} />
  </svg>
);

// ─── Inventory slot ──────────────────────────────────────────────────────────

const Slot: React.FC<{
  size?: number;
  children?: React.ReactNode;
  glow?: string;
  active?: boolean;
}> = ({ size = 36, children, glow, active }) => (
  <div
    style={{
      width: size,
      height: size,
      background: THEME.mc.slotBg,
      border: `2px solid`,
      borderColor: `${THEME.mc.slotDark} ${THEME.mc.slotLight} ${THEME.mc.slotLight} ${THEME.mc.slotDark}`,
      boxShadow: glow ? `0 0 8px ${glow}55` : active ? "0 0 5px #fff4" : "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative" as const,
      flexShrink: 0,
    }}
  >
    {children}
  </div>
);

// ─── Scene backgrounds ───────────────────────────────────────────────────────

const STARS = Array.from({ length: 48 }, (_, i) => ({
  x: ((i * 397 + 13) % 860),
  y: ((i * 231 + 7)  % 320),
  r: 0.8 + (i % 3) * 0.5,
  op: 0.35 + (i % 4) * 0.15,
}));

const OutdoorBg: React.FC<{ frame: number; dawn?: boolean }> = ({ frame, dawn }) => {
  const skyBottom = dawn ? "#1A2840" : "#050A18";
  const skyTop    = dawn ? "#0A1828" : "#020508";
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, ${skyTop} 0%, ${skyBottom} 70%, ${THEME.mc.grassSide} 88%, ${THEME.mc.grassTop} 92%, ${THEME.mc.dirtBrown} 100%)`,
        }}
      />
      {/* Stars */}
      <svg style={{ position: "absolute", top: 0, left: 0 }} width="100%" height="75%">
        {STARS.map((s, i) => (
          <circle key={i} cx={`${(s.x / 860) * 100}%`} cy={s.y} r={s.r} fill="#fff" opacity={dawn ? s.op * 0.4 : s.op} />
        ))}
      </svg>
      {/* Moon */}
      {!dawn && (
        <svg style={{ position: "absolute", top: 18, right: 80 }} width={36} height={36}>
          <circle cx={18} cy={18} r={14} fill="#EEF0E0" opacity={0.85} />
          <circle cx={12} cy={14} r={3}  fill="#D0D2C0" opacity={0.5} />
          <circle cx={22} cy={22} r={2}  fill="#D0D2C0" opacity={0.4} />
        </svg>
      )}
      {/* Horizon trees (silhouette) */}
      {[60, 200, 480, 660, 780].map((x, i) => (
        <div key={i} style={{ position: "absolute", bottom: "10%", left: x, width: 18, height: 60 + (i % 3) * 30, background: "#0A1208", opacity: 0.6 }} />
      ))}
    </div>
  );
};

// Cave block constants (seeded, never change between frames)
const CAVE_BLOCKS = Array.from({ length: 45 }, (_, i) => ({
  col: i % 9,
  row: Math.floor(i / 9),
  shade: ((i * 37) % 5),         // 0-4 → darker/lighter stone
  isOre: i === 11 || i === 21 || i === 22,
}));

const CaveBg: React.FC<{ frame: number }> = ({ frame }) => {
  // Mine animation: 168-232
  const mineProgress = interpolate(frame, [168, 232], [0, 1], cl);
  const BLOCK_W = 56;
  const BLOCK_H = 48;
  const shades = ["#5A5A5A", "#606060", "#686868", "#707070", "#787878"];

  return (
    <div style={{ position: "absolute", inset: 0, background: "#0A0808", overflow: "hidden" }}>
      <svg style={{ position: "absolute", inset: 0 }} width="100%" height="100%">
        {CAVE_BLOCKS.map((b, i) => {
          const x = b.col * BLOCK_W;
          const y = b.row * BLOCK_H + 30;
          const isOre = b.isOre;
          // Ore breaks during mining
          const oreVisible = isOre
            ? interpolate(frame, [220, 232], [1, 0], cl)
            : 1;

          return (
            <g key={i} opacity={oreVisible}>
              {/* Stone base */}
              <rect x={x} y={y} width={BLOCK_W - 1} height={BLOCK_H - 1} fill={shades[b.shade]} />
              {/* Stone crack lines (original texture) */}
              <line x1={x+4} y1={y+4} x2={x+12} y2={y+4}  stroke="#4A4A4A" strokeWidth={1} opacity={0.5} />
              <line x1={x+4} y1={y+4} x2={x+4}  y2={y+14} stroke="#4A4A4A" strokeWidth={1} opacity={0.5} />
              {/* Iron ore specks */}
              {isOre && <>
                <rect x={x+6}  y={y+5}  width={8} height={6} fill="#C8844A" />
                <rect x={x+18} y={y+9}  width={6} height={8} fill="#B87040" />
                <rect x={x+8}  y={y+22} width={7} height={5} fill="#C8844A" />
                <rect x={x+30} y={y+16} width={5} height={6} fill="#B87040" />
                {/* Flash on mining */}
                {mineProgress > 0.4 && (
                  <rect x={x} y={y} width={BLOCK_W-1} height={BLOCK_H-1}
                    fill="#FFFFFF"
                    opacity={interpolate(mineProgress, [0.4, 0.55, 0.7, 0.85, 1], [0, 0.6, 0, 0.4, 0], cl)}
                  />
                )}
              </>}
              {/* Block border */}
              <rect x={x} y={y+BLOCK_H-2} width={BLOCK_W-1} height={2} fill="#3A3A3A" opacity={0.7} />
              <rect x={x+BLOCK_W-2} y={y} width={2} height={BLOCK_H-1} fill="#3A3A3A" opacity={0.7} />
            </g>
          );
        })}

        {/* Ore break particles (frame 220-250) */}
        {Array.from({ length: 10 }, (_, i) => {
          if (frame < 218 || frame > 252) return null;
          const startF = 218 + i * 1.5;
          const prog = interpolate(frame, [startF, startF + 22], [0, 1], cl);
          if (prog <= 0) return null;
          const vx = ((i * 127) % 120) - 60;
          const vy = ((i * 79) % 100) - 80;
          const baseX = 22 * 56 + 16; // near ore blocks
          const baseY = 2 * 48 + 30 + 20;
          return (
            <rect
              key={i}
              x={baseX + vx * prog}
              y={baseY + vy * prog + 20 * prog * prog}
              width={4} height={4}
              fill={i % 3 === 0 ? "#C8844A" : "#787878"}
              opacity={interpolate(prog, [0, 0.3, 0.8, 1], [0, 0.9, 0.5, 0], cl)}
            />
          );
        })}

        {/* Ambient cave torchlight */}
        <circle cx="30%" cy="85%" r="180" fill={THEME.mc.torchYellow} opacity={0.04} />
      </svg>

      {/* Torch */}
      <div style={{ position: "absolute", top: 120, left: "28%", width: 4, height: 20, background: "#875C27" }}>
        <div style={{
          position: "absolute", top: -8, left: -4, width: 12, height: 12,
          background: `radial-gradient(circle, ${THEME.mc.torchYellow} 0%, ${THEME.mc.lavaOrange}88 60%, transparent 100%)`,
          opacity: 0.5 + 0.2 * Math.sin((frame / 14) * Math.PI),
        }} />
      </div>
    </div>
  );
};

// ─── UI overlays ─────────────────────────────────────────────────────────────

const mcPanel: React.CSSProperties = {
  background: "#2A2A2A",
  border: "3px solid",
  borderColor: `${THEME.mc.stoneLight} ${THEME.mc.stoneDark} ${THEME.mc.stoneDark} ${THEME.mc.stoneLight}`,
  padding: "16px 20px",
};

const InspectPanel: React.FC<{ frame: number }> = ({ frame }) => {
  const openProgress = interpolate(frame, [32, 52], [0, 1], cl);
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) scale(${0.85 + openProgress * 0.15})`,
        opacity: openProgress,
        ...mcPanel,
        width: 360,
        zIndex: 10,
      }}
    >
      <div style={{ fontFamily: THEME.fontMono, fontSize: 13, color: "#FFF", marginBottom: 12, letterSpacing: "0.05em" }}>
        INVENTORY
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, marginBottom: 12 }}>
        {/* Sample items */}
        <Slot><div style={{ width: 20, height: 20, background: THEME.mc.dirtBrown }} /></Slot>
        <Slot><div style={{ width: 20, height: 14, background: THEME.mc.stoneMid, marginTop: 3 }} /></Slot>
        <Slot><IronOre size={22} /></Slot>
        <Slot><div style={{ width: 14, height: 18, background: "#5C4033" }} /></Slot>
        <Slot><div style={{ width: 16, height: 10, background: "#C84820", borderRadius: 2 }} /></Slot>
        {Array.from({ length: 4 }, (_, i) => <Slot key={i} />)}
      </div>
      {/* Helmet slot — empty, highlighted */}
      <div style={{ fontFamily: THEME.fontMono, fontSize: 10, color: THEME.textDim, marginBottom: 6, letterSpacing: "0.06em" }}>
        ARMOR SLOTS
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <Slot size={34} glow={THEME.mc.redstone}>
          <div style={{ fontFamily: THEME.fontMono, fontSize: 8, color: THEME.mc.redstone, textAlign: "center", lineHeight: 1.2, opacity: 0.7 }}>
            HELMET<br/>EMPTY
          </div>
        </Slot>
        {Array.from({ length: 3 }, (_, i) => <Slot key={i} size={34} />)}
      </div>
      {/* Missing items label */}
      <div style={{ marginTop: 10, fontFamily: THEME.fontMono, fontSize: 11, color: THEME.mc.redstone, letterSpacing: "0.03em" }}>
        ✗ 5 iron ingots required
      </div>
    </div>
  );
};

const FurnacePanel: React.FC<{ frame: number }> = ({ frame }) => {
  // frame 240-355 → local 0-115
  const local = frame - 240;
  const openProg = interpolate(local, [0, 18], [0, 1], cl);
  const smeltProg = interpolate(local, [10, 110], [0, 1], cl);
  const ingotVisible = smeltProg > 0.88;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -52%) scale(${0.88 + openProg * 0.12})`,
        opacity: openProg,
        ...mcPanel,
        width: 360,
        zIndex: 10,
      }}
    >
      <div style={{ fontFamily: THEME.fontMono, fontSize: 13, color: "#FFF", marginBottom: 14, letterSpacing: "0.05em" }}>
        FURNACE
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center", marginBottom: 14 }}>
        {/* Input slot */}
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: THEME.fontMono, fontSize: 9, color: THEME.textDim }}>INPUT</span>
          <Slot size={44}><IronOre size={28} /></Slot>
        </div>

        {/* Fire + arrow */}
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4 }}>
          {/* Flame */}
          <svg width={24} height={24} viewBox="0 0 24 24">
            <rect x={8}  y={14} width={8}  height={8}  fill={THEME.mc.lavaOrange} opacity={0.9} />
            <rect x={6}  y={10} width={12} height={8}  fill={THEME.mc.torchYellow} opacity={0.85} />
            <rect x={9}  y={6}  width={6}  height={8}  fill="#FFF176" opacity={0.7} />
            {/* Flicker */}
            <rect x={10} y={4}  width={4}  height={5}  fill="#FFFFFF" opacity={0.3 * (0.5 + 0.5 * Math.sin((frame / 8) * Math.PI))} />
          </svg>
          {/* Arrow */}
          <svg width={32} height={16} viewBox="0 0 32 16">
            <line x1={0} y1={8} x2={22} y2={8} stroke="#666" strokeWidth={2} />
            <polygon points="22,4 30,8 22,12" fill="#666" />
            {/* Progress overlay */}
            <rect x={0} y={5} width={smeltProg * 22} height={6} fill={THEME.mc.xpGreen} opacity={0.7} />
          </svg>
        </div>

        {/* Output slot */}
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: THEME.fontMono, fontSize: 9, color: THEME.textDim }}>OUTPUT</span>
          <Slot size={44} glow={ingotVisible ? THEME.mc.xpGreen : undefined}>
            {ingotVisible && <IronIngot size={28} />}
          </Slot>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ fontFamily: THEME.fontMono, fontSize: 9, color: THEME.textDim, marginBottom: 5, letterSpacing: "0.06em" }}>
        SMELTING PROGRESS
      </div>
      <div style={{ height: 6, background: "#1A1A1A", border: "1px solid #444", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${smeltProg * 100}%`,
          background: `linear-gradient(90deg, ${THEME.mc.lavaOrange}, ${THEME.mc.torchYellow})`,
          boxShadow: `0 0 6px ${THEME.mc.torchYellow}88`,
        }} />
      </div>
      <div style={{ fontFamily: THEME.fontMono, fontSize: 10, color: THEME.textDim, marginTop: 6, textAlign: "center" as const }}>
        {ingotVisible ? "✓ iron ingots ready" : `smelting iron ore… ${Math.round(smeltProg * 100)}%`}
      </div>
    </div>
  );
};

// Helmet recipe: row 0 cols 0,1,2  row 1 cols 0,2
const HELMET_RECIPE = [
  { col: 0, row: 0, appearAt: 10 },
  { col: 1, row: 0, appearAt: 18 },
  { col: 2, row: 0, appearAt: 26 },
  { col: 0, row: 1, appearAt: 34 },
  { col: 2, row: 1, appearAt: 42 },
];

const CraftingPanel: React.FC<{ frame: number }> = ({ frame }) => {
  const local = frame - 355;
  const openProg = interpolate(local, [0, 20], [0, 1], cl);
  const helmetAppear = interpolate(local, [100, 118], [0, 1], cl);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -52%) scale(${0.88 + openProg * 0.12})`,
        opacity: openProg,
        ...mcPanel,
        width: 400,
        zIndex: 10,
      }}
    >
      <div style={{ fontFamily: THEME.fontMono, fontSize: 13, color: "#FFF", marginBottom: 14, letterSpacing: "0.05em" }}>
        CRAFTING TABLE
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        {/* 3×3 grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 44px)", gap: 3 }}>
          {Array.from({ length: 9 }, (_, idx) => {
            const col = idx % 3;
            const row = Math.floor(idx / 3);
            const recipeSlot = HELMET_RECIPE.find((r) => r.col === col && r.row === row);
            const slotAppear = recipeSlot
              ? interpolate(local, [recipeSlot.appearAt, recipeSlot.appearAt + 10], [0, 1], cl)
              : 0;
            return (
              <Slot key={idx} size={44}>
                {recipeSlot && slotAppear > 0.1 && (
                  <div style={{ opacity: slotAppear }}>
                    <IronIngot size={26} />
                  </div>
                )}
              </Slot>
            );
          })}
        </div>

        {/* Arrow */}
        <svg width={36} height={20} viewBox="0 0 36 20">
          <line x1={0} y1={10} x2={24} y2={10} stroke="#666" strokeWidth={2} />
          <polygon points="24,6 34,10 24,14" fill="#666" />
        </svg>

        {/* Output */}
        <Slot size={52} glow={helmetAppear > 0.5 ? THEME.mc.xpGreen : undefined}>
          {helmetAppear > 0.1 && (
            <div style={{ opacity: helmetAppear }}>
              <IronHelmet size={34} />
            </div>
          )}
        </Slot>
      </div>

      {helmetAppear > 0.7 && (
        <div style={{ marginTop: 10, fontFamily: THEME.fontMono, fontSize: 11, color: THEME.mc.xpGreen, letterSpacing: "0.03em", textAlign: "center" as const }}>
          ✓ iron helmet crafted
        </div>
      )}
    </div>
  );
};

const EquipOverlay: React.FC<{ frame: number; panelW: number; panelH: number }> = ({
  frame,
  panelW,
  panelH,
}) => {
  const local = frame - 500;
  const armorSlotX = 14;
  const armorSlotY = 14;
  const centerX = panelW / 2 - 20;
  const centerY = panelH / 2 - 20;

  const moveX = interpolate(local, [8, 32], [centerX, armorSlotX], cl);
  const moveY = interpolate(local, [8, 32], [centerY, armorSlotY], cl);
  const helmetOpacity = interpolate(local, [0, 10, 48, 58], [0, 1, 1, 0], cl);
  const glowAppear = interpolate(local, [32, 48], [0, 1], cl);

  return (
    <>
      {/* Flying helmet */}
      <div
        style={{
          position: "absolute",
          left: moveX,
          top: moveY,
          opacity: helmetOpacity,
          zIndex: 20,
          filter: `drop-shadow(0 0 ${6 * glowAppear}px ${THEME.mc.xpGreen})`,
        }}
      >
        <IronHelmet size={30} />
      </div>

      {/* Armor slot indicator */}
      {glowAppear > 0.5 && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            opacity: glowAppear,
          }}
        >
          <Slot size={34} glow={THEME.mc.xpGreen}>
            <IronHelmet size={22} />
          </Slot>
          <div style={{ fontFamily: THEME.fontMono, fontSize: 9, color: THEME.mc.xpGreen, marginTop: 2, textAlign: "center" as const, letterSpacing: "0.04em" }}>
            EQUIPPED
          </div>
        </div>
      )}
    </>
  );
};

const VerifyOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const local = frame - 560;
  const verBadge = interpolate(local, [4, 20], [0, 1], cl);
  const memBadge = interpolate(local, [52, 68], [0, 1], cl);

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        display: "flex",
        flexDirection: "column" as const,
        gap: 8,
        zIndex: 20,
      }}
    >
      {/* Verifier badge */}
      <div
        style={{
          opacity: verBadge,
          transform: `translateX(${(1 - verBadge) * 20}px)`,
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "rgba(34,211,238,0.12)",
          border: `1px solid ${THEME.accent}55`,
          padding: "5px 10px",
          fontFamily: THEME.fontMono,
          fontSize: 11,
          color: THEME.accent,
          letterSpacing: "0.06em",
        }}
      >
        <div style={{ width: 6, height: 6, background: THEME.accent, boxShadow: `0 0 5px ${THEME.accent}` }} />
        VER · helmet detected
      </div>
      {/* Memory badge */}
      <div
        style={{
          opacity: memBadge,
          transform: `translateX(${(1 - memBadge) * 20}px)`,
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "rgba(112,53,200,0.12)",
          border: `1px solid ${THEME.mc.enchantPurp}55`,
          padding: "5px 10px",
          fontFamily: THEME.fontMono,
          fontSize: 11,
          color: THEME.mc.enchantPurp,
          letterSpacing: "0.06em",
        }}
      >
        <div style={{ width: 6, height: 6, background: THEME.mc.enchantPurp, boxShadow: `0 0 5px ${THEME.mc.enchantPurp}` }} />
        MEM · crafting path stored
      </div>
    </div>
  );
};

// ─── Action chip ─────────────────────────────────────────────────────────────

type ChipDef = { text: string; start: number; end: number; color: string };

const ACTION_CHIPS: ChipDef[] = [
  { text: "receive objective",  start: 2,   end: 28,  color: THEME.accent   },
  { text: "inspect inventory",  start: 36,  end: 88,  color: THEME.accent   },
  { text: "locate iron ore",    start: 98,  end: 162, color: THEME.mc.xpGreen },
  { text: "mine iron ore",      start: 168, end: 232, color: THEME.mc.xpGreen },
  { text: "smelt ingots",       start: 243, end: 348, color: THEME.mc.torchYellow },
  { text: "craft helmet",       start: 358, end: 495, color: THEME.mc.diamond },
  { text: "equip helmet",       start: 502, end: 558, color: THEME.mc.xpGreen },
  { text: "verify equipped",    start: 562, end: 620, color: THEME.accent   },
];

const ActionChip: React.FC<{ frame: number }> = ({ frame }) => {
  const chip = ACTION_CHIPS.find((c) => frame >= c.start && frame <= c.end);
  if (!chip) return null;
  const fade = interpolate(
    frame,
    [chip.start, chip.start + 8, chip.end - 8, chip.end],
    [0, 1, 1, 0],
    cl
  );
  return (
    <div
      style={{
        position: "absolute",
        bottom: 52,
        left: "50%",
        transform: `translateX(-50%)`,
        opacity: fade,
        background: "rgba(0,0,0,0.82)",
        border: `1px solid ${chip.color}55`,
        padding: "5px 14px",
        fontFamily: THEME.fontMono,
        fontSize: 13,
        color: chip.color,
        letterSpacing: "0.06em",
        whiteSpace: "nowrap" as const,
        pointerEvents: "none" as const,
        zIndex: 30,
      }}
    >
      › {chip.text}
    </div>
  );
};

// ─── Inventory hotbar ─────────────────────────────────────────────────────────

const HOTBAR_ITEMS = [
  { name: "pickaxe",  icon: "tool"   },
  { name: "torch",    icon: "torch"  },
  null,
  null,
  { name: "bread",    icon: "food"   },
  null,
  null,
  null,
  null,
];

const HotbarItem: React.FC<{ item: typeof HOTBAR_ITEMS[number] }> = ({ item }) => {
  if (!item) return null;
  if (item.icon === "tool")  return <div style={{ width: 6, height: 22, background: THEME.mc.stoneMid, transform: "rotate(30deg)" }} />;
  if (item.icon === "torch") return <div style={{ width: 4, height: 16, background: "#875C27" }}><div style={{ width: 8, height: 8, background: THEME.mc.torchYellow, marginTop: -4, marginLeft: -2, borderRadius: "50%" }} /></div>;
  if (item.icon === "food")  return <div style={{ width: 16, height: 10, background: "#C84820", borderRadius: 2 }} />;
  return null;
};

const InventoryHotbar: React.FC<{ frame: number; helmetEquipped: boolean }> = ({
  frame,
  helmetEquipped,
}) => {
  return (
    <>
      {/* Hotbar */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 2,
          zIndex: 20,
        }}
      >
        {HOTBAR_ITEMS.map((item, i) => (
          <Slot key={i} size={32} active={i === 0}>
            <HotbarItem item={item} />
          </Slot>
        ))}
      </div>

      {/* Armor slot (top-left) — only if equipping or beyond */}
      {helmetEquipped && (
        <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10 }}>
          <Slot size={30} glow={THEME.mc.xpGreen}>
            <IronHelmet size={20} />
          </Slot>
        </div>
      )}
    </>
  );
};

// ─── Crosshair ───────────────────────────────────────────────────────────────

const Crosshair: React.FC = () => (
  <div
    style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 18,
      height: 18,
      transform: "translate(-50%, -50%)",
      zIndex: 25,
      pointerEvents: "none" as const,
    }}
  >
    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.85)", transform: "translateY(-50%)" }} />
    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.85)", transform: "translateX(-50%)" }} />
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const MinecraftPovReplay: React.FC = () => {
  const frame = useCurrentFrame();
  const phase = getPovPhase(frame);

  // Subtle head bob (sin-driven, no CSS keyframes)
  const headBobY = interpolate(Math.sin((frame / 24) * Math.PI), [-1, 1], [-3, 3]);
  const headBobX = interpolate(Math.sin((frame / 37) * Math.PI), [-1, 1], [-2, 2]);

  const isCave   = phase === "cave";
  const isDawn   = phase === "equip" || phase === "verify";
  const showInspect = phase === "outdoor" && frame >= 32 && frame < 90;
  const helmetEquipped = frame >= 558;

  // Panel dimensions (approximate for positioning calculations)
  const PW = 860;
  const PH = 840;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#070B12",
      }}
    >
      {/* Parallax scene layer (has head bob) */}
      <div
        style={{
          position: "absolute",
          inset: -8,
          transform: `translate(${headBobX}px, ${headBobY}px)`,
        }}
      >
        {isCave ? (
          <CaveBg frame={frame} />
        ) : (
          <OutdoorBg frame={frame} dawn={isDawn} />
        )}
      </div>

      {/* Dark vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none" as const,
          zIndex: 5,
        }}
      />

      {/* Phase-specific UI overlays */}
      {showInspect && <InspectPanel frame={frame} />}
      {phase === "furnace"  && <FurnacePanel  frame={frame} />}
      {phase === "crafting" && <CraftingPanel frame={frame} />}
      {phase === "equip"    && <EquipOverlay  frame={frame} panelW={PW} panelH={PH} />}
      {phase === "verify"   && <VerifyOverlay frame={frame} />}

      {/* Fixed UI */}
      <Crosshair />
      <InventoryHotbar frame={frame} helmetEquipped={helmetEquipped} />
      <ActionChip frame={frame} />

      {/* "system walkthrough" watermark */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          right: 10,
          fontFamily: THEME.fontMono,
          fontSize: 10,
          color: "rgba(255,255,255,0.2)",
          letterSpacing: "0.08em",
          pointerEvents: "none" as const,
          zIndex: 30,
        }}
      >
        system walkthrough
      </div>
    </div>
  );
};
