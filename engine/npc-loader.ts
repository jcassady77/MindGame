import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const NPC_DIR = "world/town/npcs";
const ENV_DIR = "world/town/environment";

export interface NPCContext {
  npcId: string;
  name: string;
  age: number;
  soulContent: string;
  coreBlock: string;
  livedBlock: string;
  memoriesContent: string;
  lastSimulated: string;
}

export interface EnvironmentContext {
  townContent: string;
  livedBlock: string;
  currentContext: string;
}

export function loadNPC(npcId: string): NPCContext {
  const npcPath = resolve(process.cwd(), NPC_DIR, npcId);
  const soulPath = join(npcPath, "soul.md");

  if (!existsSync(soulPath)) {
    throw new Error(`NPC not found: ${npcId}`);
  }

  const soulContent = readFileSync(soulPath, "utf-8");

  const nameMatch = soulContent.match(/\nname:\s*"([^"]+)"/);
  const dateMatch = soulContent.match(/last_simulated:\s*"([^"]+)"/);
  const ageMatch = soulContent.match(/\nage:\s*(\d+)/);

  const name = nameMatch?.[1] ?? npcId;
  const lastSimulated = dateMatch?.[1] ?? "0001-01-01";
  const age = parseInt(ageMatch?.[1] ?? "0", 10);

  const coreMatch = soulContent.match(/```core\n([\s\S]*?)```/);
  const coreBlock = coreMatch?.[1]?.trim() ?? "";

  const livedMatch = soulContent.match(/```lived\n([\s\S]*?)```/);
  const livedBlock = livedMatch?.[1]?.trim() ?? "";

  const memoriesContent = loadMemories(join(npcPath, "memories"));

  return { npcId, name, age, soulContent, coreBlock, livedBlock, memoriesContent, lastSimulated };
}

export function loadEnvironment(): EnvironmentContext {
  const envPath = resolve(process.cwd(), ENV_DIR);
  const townPath = join(envPath, "town.md");
  const contextPath = join(envPath, "context.md");

  const townContent = existsSync(townPath) ? readFileSync(townPath, "utf-8") : "";
  const livedMatch = townContent.match(/```lived\n([\s\S]*?)```/);
  const livedBlock = livedMatch?.[1]?.trim() ?? "";
  const currentContext = existsSync(contextPath)
    ? readFileSync(contextPath, "utf-8")
    : "The town is newly established.";

  return { townContent, livedBlock, currentContext };
}

export function listNPCIds(): string[] {
  const npcDir = resolve(process.cwd(), NPC_DIR);
  return readdirSync(npcDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function loadMemories(memoriesDir: string): string {
  if (!existsSync(memoriesDir)) return "";

  const files = readdirSync(memoriesDir)
    .filter((f) => f.endsWith(".md") && f !== ".gitkeep")
    .sort()
    .reverse();

  if (files.length === 0) return "";

  return files
    .map((f) => readFileSync(join(memoriesDir, f), "utf-8"))
    .join("\n\n---\n\n");
}
