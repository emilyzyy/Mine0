// Shared timeline data for the animated demo-replay fallback in MainDemoScene.
// All frame numbers are local to the MainDemoScene Sequence (0–630 at 30 fps = 21 s).
// Objective: "Craft and equip an iron helmet before nightfall"

export type TaskStatus = 'pending' | 'active' | 'complete' | 'verified';

export interface Task {
  id: string;
  label: string;
  activeAt: number;
  doneAt: number;
  note: string | null;
  finalStatus: TaskStatus;
}

export interface DemoEvent {
  tag: string;
  text: string;
  frame: number;
}

export type PovPhase =
  | 'outdoor'   // 0-90:   receive objective, inspect inventory
  | 'cave'      // 90-240: locate + mine iron ore underground
  | 'furnace'   // 240-355: smelt at furnace
  | 'crafting'  // 355-500: craft at crafting table
  | 'equip'     // 500-560: equip iron helmet
  | 'verify';   // 560-630: verifier confirms + memory update

export const TASKS: Task[] = [
  { id: 'task_001', label: 'receive objective',     activeAt: 0,   doneAt: 28,  note: null,                       finalStatus: 'complete' },
  { id: 'task_002', label: 'inspect inventory',     activeAt: 32,  doneAt: 88,  note: 'missing: 5 iron ingots',   finalStatus: 'complete' },
  { id: 'task_003', label: 'locate iron ore',       activeAt: 95,  doneAt: 162, note: 'ore target selected',      finalStatus: 'complete' },
  { id: 'task_004', label: 'mine iron ore',         activeAt: 168, doneAt: 232, note: 'ore collected',            finalStatus: 'complete' },
  { id: 'task_005', label: 'smelt iron ingots',     activeAt: 240, doneAt: 348, note: 'ingots ready',             finalStatus: 'complete' },
  { id: 'task_006', label: 'craft iron helmet',     activeAt: 355, doneAt: 495, note: 'helmet crafted',           finalStatus: 'complete' },
  { id: 'task_007', label: 'equip helmet',          activeAt: 502, doneAt: 558, note: 'equipment slot updated',   finalStatus: 'complete' },
  { id: 'task_008', label: 'verify equipped state', activeAt: 562, doneAt: 608, note: 'helmet detected',          finalStatus: 'verified' },
  { id: 'task_009', label: 'update memory',         activeAt: 612, doneAt: 628, note: 'equipment path stored',    finalStatus: 'complete' },
];

export const DEMO_EVENTS: DemoEvent[] = [
  { tag: 'GOAL',  text: 'Craft and equip an iron helmet before nightfall', frame: 2   },
  { tag: 'PLAN',  text: 'inspect inventory',                               frame: 36  },
  { tag: 'STATE', text: 'missing 5 iron ingots',                          frame: 90  },
  { tag: 'PLAN',  text: 'locate iron ore deposit',                        frame: 98  },
  { tag: 'ACT',   text: 'mine iron ore',                                  frame: 170 },
  { tag: 'ACT',   text: 'smelt ingots at furnace',                        frame: 243 },
  { tag: 'PLAN',  text: 'select iron helmet recipe',                      frame: 358 },
  { tag: 'ACT',   text: 'craft iron helmet',                              frame: 368 },
  { tag: 'VER',   text: 'helmet detected in armor slot',                  frame: 563 },
  { tag: 'MEM',   text: 'equipment crafting path stored',                 frame: 614 },
];

export function getTaskStatus(task: Task, frame: number): TaskStatus {
  if (frame < task.activeAt) return 'pending';
  if (frame >= task.doneAt) return task.finalStatus;
  return 'active';
}

export function getPovPhase(frame: number): PovPhase {
  if (frame < 90)  return 'outdoor';
  if (frame < 240) return 'cave';
  if (frame < 355) return 'furnace';
  if (frame < 500) return 'crafting';
  if (frame < 560) return 'equip';
  return 'verify';
}

export function getRecentEvents(frame: number, count = 4): DemoEvent[] {
  return DEMO_EVENTS.filter((e) => e.frame <= frame).slice(-count);
}
