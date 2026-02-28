import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { listNPCIds } from "./npc-loader.js";

const STATE_PATH = resolve(process.cwd(), "world/state.json");
const POSITIONS_PATH = resolve(process.cwd(), "world/positions.json");
const OBJECTIVES_COUNT = 2;
const GRID_MIN = 0;
const GRID_MAX = 25;

export interface Position {
  x: number;
  z: number;
}

export interface Objective {
  npcId: string;
  npcName: string;
  position: Position;
  completed: boolean;
}

export interface GameState {
  currentDate: string;
  objectives: Objective[];
}

export function loadState(): GameState {
  if (!existsSync(STATE_PATH)) {
    const initial = generateInitialState();
    saveState(initial);
    return initial;
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as GameState;
}

export function saveState(state: GameState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function markObjectiveComplete(npcId: string): boolean {
  const state = loadState();
  const obj = state.objectives.find((o) => o.npcId === npcId);
  if (!obj || obj.completed) return false;
  obj.completed = true;
  saveState(state);
  return true;
}

export function allObjectivesComplete(): boolean {
  return loadState().objectives.every((o) => o.completed);
}

export function resetObjectives(newDate: string): GameState {
  const current = loadState();
  const existingNpcIds = current.objectives.map((o) => o.npcId);
  const objectives = refreshObjectivePositions(existingNpcIds);
  const state: GameState = { currentDate: newDate, objectives };
  saveState(state);
  return state;
}

function generateInitialState(): GameState {
  const npcIds = listNPCIds();
  const currentDate = getFirstAvailableDate(npcIds);
  return { currentDate, objectives: generateObjectives(currentDate) };
}

function generateObjectives(currentDate: string): Objective[] {
  const npcIds = listNPCIds();
  const alive = npcIds.filter(isAlive);
  const shuffled = alive.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(OBJECTIVES_COUNT, shuffled.length));
  return refreshObjectivePositions(picked);
}

function refreshObjectivePositions(npcIds: string[]): Objective[] {
  const positions = loadOrGeneratePositions(listNPCIds());
  const range = GRID_MAX - GRID_MIN;
  for (const npcId of npcIds) {
    positions[npcId] = {
      x: Math.floor(Math.random() * range) + GRID_MIN,
      z: Math.floor(Math.random() * range) + GRID_MIN,
    };
  }
  writeFileSync(POSITIONS_PATH, JSON.stringify(positions, null, 2), "utf-8");
  return npcIds.map((npcId) => ({
    npcId,
    npcName: getNPCName(npcId),
    position: positions[npcId],
    completed: false,
  }));
}

function loadOrGeneratePositions(npcIds: string[]): Record<string, Position> {
  let positions: Record<string, Position> = {};

  if (existsSync(POSITIONS_PATH)) {
    positions = JSON.parse(readFileSync(POSITIONS_PATH, "utf-8"));
  }

  // Assign positions to any NPC that doesn't have one yet
  let changed = false;
  for (const npcId of npcIds) {
    if (!positions[npcId]) {
      const range = GRID_MAX - GRID_MIN;
      positions[npcId] = {
        x: Math.floor(Math.random() * range) + GRID_MIN,
        z: Math.floor(Math.random() * range) + GRID_MIN,
      };
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(POSITIONS_PATH, JSON.stringify(positions, null, 2), "utf-8");
  }

  return positions;
}

function isAlive(npcId: string): boolean {
  try {
    const soulPath = resolve(
      process.cwd(),
      "world/town/npcs",
      npcId,
      "soul.md",
    );
    const content = readFileSync(soulPath, "utf-8");
    const match = content.match(/\nalive:\s*(true|false)/);
    return match?.[1] === "true";
  } catch {
    return false;
  }
}

function getNPCName(npcId: string): string {
  try {
    const soulPath = resolve(
      process.cwd(),
      "world/town/npcs",
      npcId,
      "soul.md",
    );
    const content = readFileSync(soulPath, "utf-8");
    const match = content.match(/\nname:\s*"([^"]+)"/);
    return match?.[1] ?? npcId;
  } catch {
    return npcId;
  }
}

function getFirstAvailableDate(npcIds: string[]): string {
  for (const npcId of npcIds) {
    try {
      const soulPath = resolve(
        process.cwd(),
        "world/town/npcs",
        npcId,
        "soul.md",
      );
      const content = readFileSync(soulPath, "utf-8");
      const match = content.match(/last_simulated:\s*"([^"]+)"/);
      if (match?.[1]) return match[1];
    } catch {
      continue;
    }
  }
  return "0001-01-01";
}
