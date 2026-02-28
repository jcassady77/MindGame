// ============================================================
// Town State Snapshot Builder
// ============================================================
// Generates world/town/state.md — the "return to town" context
// document injected into LLM prompts. Assembles NPC status,
// emotional currents, recent deaths, rumors, and recruitment
// info into a single concise markdown file.
// ============================================================

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Soul } from "./types.js";
import { listNpcIds, loadSoul } from "./file_io.js";
import { parseDate, formatDateHuman } from "./calendar.js";

const WORLD_ROOT = "world/town";
const MAX_RUMORS = 7;
const EVENT_LOG_TAIL_LINES = 20;

/**
 * Build the town state snapshot and write it to world/town/state.md.
 *
 * @param currentDate - The current in-world date in YYYY-MM-DD format.
 * @param generateRumors - An LLM call that accepts a prompt and returns generated text.
 * @param baseDir - Base directory for file resolution. Defaults to ".".
 * @returns The path to the written state.md file.
 */
export async function buildState(
  currentDate: string,
  generateRumors: (prompt: string) => Promise<string>,
  baseDir: string = ".",
): Promise<string> {
  // --- 1. Load all NPC souls ---
  const npcIds = listNpcIds(baseDir);
  const souls: Soul[] = [];
  for (const id of npcIds) {
    try {
      souls.push(loadSoul(id, baseDir));
    } catch {
      // Skip NPCs with unreadable soul files
    }
  }

  // --- 2. Partition living from dead ---
  const living = souls.filter(s => s.frontmatter.alive);
  const dead = souls.filter(s => !s.frontmatter.alive);

  // --- 3. Find recent deaths (last_simulated within last 3 months) ---
  const currentParsed = parseDate(currentDate);
  const recentDead = dead.filter(s => {
    try {
      const deathParsed = parseDate(s.frontmatter.last_simulated);
      const monthsDiff =
        (currentParsed.year - deathParsed.year) * 12 +
        (currentParsed.month - deathParsed.month);
      return monthsDiff >= 0 && monthsDiff <= 3;
    } catch {
      return false;
    }
  });

  // --- 4. Load event log ---
  const eventLogPath = join(baseDir, WORLD_ROOT, "event_log.md");
  let eventLogLines: string[] = [];
  if (existsSync(eventLogPath)) {
    const eventLogContent = readFileSync(eventLogPath, "utf-8");
    const allLines = eventLogContent.split("\n").filter(l => l.trim() !== "");
    // Skip the header line if present
    const bodyLines = allLines.filter(l => !l.startsWith("# "));
    eventLogLines = bodyLines.slice(-EVENT_LOG_TAIL_LINES);
  }

  // --- 5. Load recent changelogs ---
  const townDir = join(baseDir, WORLD_ROOT);
  let changelogEntries = "";
  if (existsSync(townDir)) {
    const changelogFiles = readdirSync(townDir)
      .filter(f => f.startsWith("changelog_") && f.endsWith(".md"))
      .sort();
    for (const file of changelogFiles) {
      try {
        const content = readFileSync(join(townDir, file), "utf-8");
        changelogEntries += content.trim() + "\n\n";
      } catch {
        // Skip unreadable changelogs
      }
    }
  }

  // --- 6. Generate rumors via LLM ---
  const rumorsSection = await generateRumorsSection(
    eventLogLines,
    changelogEntries.trim(),
    generateRumors,
  );

  // --- 7. Detect relationship changes ---
  const relationshipChanges = buildRelationshipChanges(living);

  // --- 8. Build recruitable section ---
  const recruitableNpcs = living.filter(s => s.frontmatter.recruitable === true);

  // --- 9. Assemble the document ---
  const humanDate = formatDateHuman(currentParsed);
  const doc = assembleDocument(
    humanDate,
    living,
    recentDead,
    rumorsSection,
    relationshipChanges,
    recruitableNpcs,
  );

  // --- 10. Write state.md ---
  const outPath = join(baseDir, WORLD_ROOT, "state.md");
  writeFileSync(outPath, doc, "utf-8");
  return outPath;
}

// ---- Internal helpers ----

/** Build the living residents table. */
function buildLivingTable(npcs: Soul[]): string {
  const header = `| Name | Age | Occupation | Home | Economic Status | Relationship | Recruitable |
|------|-----|-----------|------|----------------|--------------|-------------|`;
  const rows = npcs.map(s => {
    const fm = s.frontmatter;
    const recruitable = fm.recruitable ? "Yes" : "No";
    return `| ${fm.name} | ${fm.age} | ${fm.occupation} | ${fm.home} | ${fm.economic_status} | ${fm.relationship_status} | ${recruitable} |`;
  });
  return [header, ...rows].join("\n");
}

/** Build emotional currents section. Truncate current_state to first 2 sentences. */
function buildEmotionalCurrents(npcs: Soul[]): string {
  const entries: string[] = [];
  for (const s of npcs) {
    const state = s.lived.current_state.trim();
    if (!state) continue;
    const truncated = truncateToSentences(state, 2);
    entries.push(`> **${s.frontmatter.name}:** ${truncated}`);
  }
  if (entries.length === 0) {
    return "*No notable emotional currents at this time.*";
  }
  return entries.join("\n\n");
}

/** Truncate text to the first N sentences. */
function truncateToSentences(text: string, maxSentences: number): string {
  // Match sentences ending with . ! or ?
  const sentencePattern = /[^.!?]*[.!?]+/g;
  const sentences: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = sentencePattern.exec(text)) !== null) {
    sentences.push(match[0].trim());
    if (sentences.length >= maxSentences) break;
  }
  if (sentences.length === 0) {
    // No sentence-ending punctuation found — return the whole text
    return text;
  }
  return sentences.join(" ");
}

/** Build recent deaths table. */
function buildRecentDeathsTable(dead: Soul[]): string {
  if (dead.length === 0) {
    return "*No recent deaths.*";
  }
  const header = `| Name | Age at Death | Date | Occupation |
|------|-------------|------|-----------|`;
  const rows = dead.map(s => {
    const fm = s.frontmatter;
    let dateDisplay = fm.last_simulated;
    try {
      const parsed = parseDate(fm.last_simulated);
      dateDisplay = formatDateHuman(parsed);
    } catch {
      // Use raw date string as fallback
    }
    return `| ${fm.name} | ${fm.age} | ${dateDisplay} | ${fm.occupation} |`;
  });
  return [header, ...rows].join("\n");
}

/** Generate the rumors section via LLM call. */
async function generateRumorsSection(
  eventLogLines: string[],
  changelogContent: string,
  generateRumors: (prompt: string) => Promise<string>,
): Promise<string> {
  if (eventLogLines.length === 0 && !changelogContent) {
    return "The town has been quiet while you were away.";
  }

  const prompt = `You are a storyteller summarizing what has happened in a small town.

Raw events from the log:
${eventLogLines.join("\n")}

Recent changes:
${changelogContent || "(none)"}

Write 4-6 short town rumors and observations in a warm, in-world voice.
Each should be 1-2 sentences. Write them as things the player might overhear at the inn.
Do not be exhaustive - pick the most interesting or emotionally resonant events.
Format each as: - *"rumor text here"*`;

  try {
    const raw = await generateRumors(prompt);
    // Cap at MAX_RUMORS items
    const lines = raw.split("\n").filter(l => l.trim().startsWith("- "));
    const capped = lines.slice(0, MAX_RUMORS);
    return capped.length > 0 ? capped.join("\n") : raw.trim();
  } catch {
    return "The town has been quiet while you were away.";
  }
}

/** Detect any notable relationship statuses worth calling out. */
function buildRelationshipChanges(living: Soul[]): string {
  const notable = living.filter(
    s => s.frontmatter.relationship_status && s.frontmatter.relationship_status !== "single",
  );
  if (notable.length === 0) {
    return "*No notable relationship changes.*";
  }
  const lines = notable.map(
    s => `- **${s.frontmatter.name}**: ${s.frontmatter.relationship_status}`,
  );
  return lines.join("\n");
}

/** Build the recruitable NPCs section. */
function buildRecruitableSection(npcs: Soul[]): string {
  if (npcs.length === 0) {
    return "*No one is currently available to join your party.*";
  }
  const lines = npcs.map(
    s => `- **${s.frontmatter.name}** — Age ${s.frontmatter.age}, ${s.frontmatter.occupation}`,
  );
  return lines.join("\n");
}

/** Assemble the full state.md document. */
function assembleDocument(
  humanDate: string,
  living: Soul[],
  recentDead: Soul[],
  rumorsSection: string,
  relationshipChanges: string,
  recruitableNpcs: Soul[],
): string {
  const sections = [
    `# Town State — ${humanDate}`,
    "",
    "## Current Date",
    humanDate,
    "",
    "## Living Residents",
    "",
    buildLivingTable(living),
    "",
    "## Emotional Currents",
    "",
    buildEmotionalCurrents(living),
    "",
    "## Recent Deaths",
    "",
    buildRecentDeathsTable(recentDead),
    "",
    "## What People Are Saying",
    "",
    rumorsSection,
    "",
    "## Relationships Changed",
    "",
    relationshipChanges,
    "",
    "## Who Can Now Join Your Party",
    "",
    buildRecruitableSection(recruitableNpcs),
    "",
  ];

  return sections.join("\n");
}
