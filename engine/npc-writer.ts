import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const NPC_DIR = "world/town/npcs";
const ENV_DIR = "world/town/environment";

export function replaceLivedBlock(soulContent: string, newLived: string): string {
  return soulContent.replace(
    /```lived\n[\s\S]*?```/,
    `\`\`\`lived\n${newLived.trim()}\n\`\`\``
  );
}

export function replaceTownLivedBlock(townContent: string, newLived: string): string {
  return townContent.replace(
    /```lived\n[\s\S]*?```/,
    `\`\`\`lived\n${newLived.trim()}\n\`\`\``
  );
}

export function updateLastSimulated(soulContent: string, newDate: string): string {
  return soulContent.replace(/last_simulated:\s*"[^"]+"/, `last_simulated: "${newDate}"`);
}

export function writeSoul(npcId: string, content: string): void {
  const soulPath = resolve(process.cwd(), NPC_DIR, npcId, "soul.md");
  writeFileSync(soulPath, content, "utf-8");
}

export function writeNPCMemory(npcId: string, date: string, slug: string, content: string): void {
  const memoriesDir = resolve(process.cwd(), NPC_DIR, npcId, "memories");
  if (!existsSync(memoriesDir)) mkdirSync(memoriesDir, { recursive: true });
  writeFileSync(join(memoriesDir, `${date}_${slug}.md`), content, "utf-8");
}

export function writeEnvironmentContext(content: string): void {
  const contextPath = resolve(process.cwd(), ENV_DIR, "context.md");
  writeFileSync(contextPath, content, "utf-8");
}

export function writeEnvironmentMemory(date: string, slug: string, content: string): void {
  const memoriesDir = resolve(process.cwd(), ENV_DIR, "memories");
  if (!existsSync(memoriesDir)) mkdirSync(memoriesDir, { recursive: true });
  writeFileSync(join(memoriesDir, `${date}_${slug}.md`), content, "utf-8");
}

export function writeTownSoul(content: string): void {
  const townPath = resolve(process.cwd(), ENV_DIR, "town.md");
  writeFileSync(townPath, content, "utf-8");
}

export function addYearsToDate(dateStr: string, years: number): string {
  const [yearStr, month, day] = dateStr.split("-");
  const newYear = parseInt(yearStr, 10) + years;
  return `${String(newYear).padStart(4, "0")}-${month}-${day}`;
}
