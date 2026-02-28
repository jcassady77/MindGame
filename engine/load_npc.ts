// ============================================================
// NPC Loader / Context Builder
// ============================================================
// Assembles a token-budgeted NPC context object for LLM prompts.
// Loads soul data, memories, reputation, and world state, then
// prioritizes and trims to fit within the requested token budget.
// ============================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  Soul,
  Memory,
  MemorySource,
  Reputation,
  NpcLoadRequest,
  NpcContext,
  MemoryContext,
  LoadPurpose,
  TraitValue,
} from "./types.js";
import { loadSoul, loadMemories, loadReputation, parseMemoryContent } from "./file_io.js";
import { parseDate, monthsBetween } from "./calendar.js";

// --- Token Budget Constants ---

const SOUL_CORE_TOKENS = 200;
const TRAIT_TOKENS = 100;
const DISPOSITION_TOKENS = 100;
const WORLD_CONTEXT_TOKENS = 150;
const MEMORY_TOKENS_EACH = 50;

const WORLD_ROOT = "world/town";

// --- Priority Scoring ---

/**
 * Compute a composite priority score for a memory.
 * Higher scores = more important / more relevant.
 *
 * Components:
 *   - weight (50%): the memory's intrinsic importance
 *   - recency (30%): 1.0 for current month, decaying to 0.0 over 24 months
 *   - topic relevance (20%): 1.0 if memory body or subject relates to the topic
 */
export function prioritizeMemory(
  memory: Memory,
  currentDate: string,
  topicContext: string | null,
): number {
  const weightScore = memory.frontmatter.weight * 0.5;

  // Recency: 1.0 for current month, decaying to 0.0 over 24 months
  const monthsAgo = monthsBetween(
    parseDate(memory.frontmatter.date),
    parseDate(currentDate),
  );
  const recencyScore = Math.max(0, 1.0 - monthsAgo / 24) * 0.3;

  // Topic relevance: 0.2 if memory body or subject mentions the topic
  let topicScore = 0;
  if (
    topicContext &&
    memory.body.toLowerCase().includes(topicContext.toLowerCase())
  ) {
    topicScore = 0.2;
  } else if (
    topicContext &&
    memory.frontmatter.subject
      .toLowerCase()
      .includes(topicContext.toLowerCase())
  ) {
    topicScore = 0.2;
  }

  return weightScore + recencyScore + topicScore;
}

// --- Trait Snapshot ---

/**
 * Build a formatted trait snapshot string showing each trait with its delta.
 *
 * For non-debug purposes, only the top 5 most-changed traits are included.
 * Format: "trust: 0.4 (down-arrow from 0.7), hope: 0.65 (down-arrow from 0.8), ..."
 */
export function buildTraitSnapshot(
  traits: Record<string, TraitValue>,
  purpose: LoadPurpose,
): string {
  const entries = Object.entries(traits).map(([name, tv]) => ({
    name,
    seed: tv.seed,
    current: tv.current,
    delta: Math.abs(tv.current - tv.seed),
  }));

  // Sort by absolute delta descending
  entries.sort((a, b) => b.delta - a.delta);

  // For non-debug, only top 5 most-changed traits
  const selected = purpose === "debug" ? entries : entries.slice(0, 5);

  return selected
    .map((e) => {
      if (e.current === e.seed) {
        return `${e.name}: ${e.current}`;
      }
      const arrow = e.current > e.seed ? "\u2191" : "\u2193";
      return `${e.name}: ${e.current} (${arrow} from ${e.seed})`;
    })
    .join(", ");
}

// --- Token Estimation ---

/**
 * Estimate the total tokens used by an NpcContext.
 * Uses rough per-section estimates consistent with budget planning.
 */
export function estimateTokens(context: NpcContext): number {
  let total = SOUL_CORE_TOKENS + TRAIT_TOKENS;
  total += context.memories.length * MEMORY_TOKENS_EACH;
  if (context.disposition_summary) total += DISPOSITION_TOKENS;
  if (context.world_context) total += WORLD_CONTEXT_TOKENS;
  return total;
}

// --- Soul Summary Prompt ---

function buildSoulSummaryPrompt(soul: Soul): string {
  // Find top 3 traits by absolute delta from seed
  const traitEntries = Object.entries(soul.lived.traits).map(([name, tv]) => ({
    name,
    seed: tv.seed,
    current: tv.current,
    delta: Math.abs(tv.current - tv.seed),
  }));
  traitEntries.sort((a, b) => b.delta - a.delta);
  const topChanged = traitEntries
    .slice(0, 3)
    .map(
      (t) =>
        `${t.name}: ${t.seed} -> ${t.current} (${t.current > t.seed ? "+" : ""}${(t.current - t.seed).toFixed(2)})`,
    )
    .join(", ");

  return `You are summarizing an NPC for use in a language model prompt.

NPC data:
  Name: ${soul.frontmatter.name}
  Age: ${soul.frontmatter.age}, Occupation: ${soul.frontmatter.occupation}
  Temperament: ${soul.core.temperament}
  Values (in order): ${soul.core.values.join(", ")}
  Moral grain: ${soul.core.moral_grain}
  Quirks: ${soul.core.quirks.join(", ")}
  Current emotional state: ${soul.lived.current_state}
  Most changed traits: ${topChanged}

Write a single dense paragraph (4-6 sentences) summarizing who this person is and how they're doing right now.
Write it as characterization, not a list. Use specific language.`;
}

// --- Town Entity Handling ---

interface TownParsed {
  currentState: string;
  prosperity: number;
  safety: number;
  socialAtmosphere: number;
  population: number;
}

function parseTownFile(content: string): TownParsed {
  // Extract values from the lived block
  const livedMatch = content.match(/```lived\n([\s\S]*?)```/);
  const livedBlock = livedMatch ? livedMatch[1] : "";

  const getNum = (key: string): number => {
    const m = livedBlock.match(new RegExp(`^${key}:\\s*([\\d.]+)`, "m"));
    return m ? parseFloat(m[1]) : 0;
  };

  // Extract current_state multiline value
  const stateMatch = livedBlock.match(
    /current_state:\s*\|\n([\s\S]*?)(?=\n\w|\n```|$)/,
  );
  const currentState = stateMatch
    ? stateMatch[1]
        .split("\n")
        .map((l) => l.replace(/^\s{2}/, ""))
        .join("\n")
        .trim()
    : "";

  return {
    currentState,
    prosperity: getNum("prosperity"),
    safety: getNum("safety"),
    socialAtmosphere: getNum("social_atmosphere"),
    population: getNum("population"),
  };
}

function loadTownMemories(baseDir: string): Memory[] {
  const dir = join(baseDir, WORLD_ROOT, "environment", "memories");
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) return [];

  return files.map((f) => {
    const content = readFileSync(join(dir, f), "utf-8");
    return parseMemoryContent(content, f);
  });
}

async function buildTownContext(
  request: NpcLoadRequest,
  currentDate: string,
  baseDir: string,
): Promise<NpcContext> {
  const townPath = join(baseDir, WORLD_ROOT, "environment", "town.md");
  const content = readFileSync(townPath, "utf-8");
  const town = parseTownFile(content);

  // Load town memories
  let memories = loadTownMemories(baseDir);

  // Filter faded unless debug
  if (request.purpose !== "debug") {
    memories = memories.filter((m) => !m.frontmatter.faded);
  }

  // Prioritize
  const scored = memories.map((m) => ({
    memory: m,
    score: prioritizeMemory(m, currentDate, request.topic_context),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Token budget for memories
  let remaining = request.token_budget - SOUL_CORE_TOKENS - TRAIT_TOKENS;
  const maxMemories = Math.max(1, Math.floor(remaining / MEMORY_TOKENS_EACH));
  const selectedMemories = scored.slice(0, maxMemories);

  const memoryContexts: MemoryContext[] = selectedMemories.map((s) => ({
    date: s.memory.frontmatter.date,
    type: s.memory.frontmatter.type,
    summary: s.memory.body.slice(0, 200),
    weight: s.memory.frontmatter.weight,
  }));

  const traitSnapshot = `prosperity: ${town.prosperity}, safety: ${town.safety}, social_atmosphere: ${town.socialAtmosphere}, population: ${town.population}`;

  const context: NpcContext = {
    npc_id: "town",
    soul_summary: town.currentState,
    current_state: town.currentState,
    trait_snapshot: traitSnapshot,
    memories: memoryContexts,
    disposition_summary: null,
    world_context: null,
    total_tokens_used: 0,
  };
  context.total_tokens_used = estimateTokens(context);

  return context;
}

// --- World Context (for dialogue) ---

function loadWorldContext(baseDir: string): string | null {
  const statePath = join(baseDir, WORLD_ROOT, "state.md");
  if (!existsSync(statePath)) return null;

  const content = readFileSync(statePath, "utf-8");

  // Try to extract "What People Are Saying" section
  const sectionMatch = content.match(
    /##\s*What People Are Saying\s*\n([\s\S]*?)(?=\n##\s|\n$|$)/,
  );
  if (sectionMatch) {
    // Trim to roughly 200 tokens (~800 characters)
    return sectionMatch[1].trim().slice(0, 800);
  }

  // Fallback: first ~200 tokens of the file
  return content.trim().slice(0, 800);
}

// --- Disposition Summary ---

function buildDispositionSummary(reputation: Reputation): string {
  // Extract first 2 sentences of internal_monologue
  const sentences = reputation.internal_monologue.match(/[^.!?]*[.!?]/g) || [];
  const firstTwo = sentences.slice(0, 2).join("").trim();
  return `Disposition toward player: ${reputation.disposition}. ${firstTwo}`;
}

// --- Main Export ---

/**
 * Load and assemble a token-budgeted NPC context for LLM prompts.
 *
 * @param request - what NPC to load, the purpose, token budget, etc.
 * @param generateSummary - LLM callback for generating the soul summary paragraph
 * @param currentDate - in-world date string (YYYY-MM-DD), defaults to "0001-01-01"
 * @param baseDir - filesystem root, defaults to "."
 */
export async function loadNpc(
  request: NpcLoadRequest,
  generateSummary: (prompt: string) => Promise<string>,
  currentDate?: string,
  baseDir?: string,
): Promise<NpcContext> {
  const date = currentDate ?? "0001-01-01";
  const base = baseDir ?? ".";

  // --- Special case: Town entity ---
  if (request.npc_id === "town") {
    return buildTownContext(request, date, base);
  }

  // --- 1. Load soul ---
  const soul = loadSoul(request.npc_id, base);

  // --- 2. Load memories ---
  let memories = loadMemories(request.npc_id, base);

  // Filter out faded memories (unless debug)
  if (request.purpose !== "debug") {
    memories = memories.filter((m) => !m.frontmatter.faded);
  }

  // --- 3. Prioritize memories ---
  const scored = memories.map((m) => ({
    memory: m,
    score: prioritizeMemory(m, date, request.topic_context),
  }));

  // Sort by priority descending; at equal priority, rumors go after direct memories
  scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;
    // At equal priority, direct before rumor
    const sourceOrder = (s: MemorySource): number =>
      s === "direct" ? 0 : 1;
    return (
      sourceOrder(a.memory.frontmatter.source) -
      sourceOrder(b.memory.frontmatter.source)
    );
  });

  // --- 9. Token budget management ---
  let remaining = request.token_budget - SOUL_CORE_TOKENS - TRAIT_TOKENS;
  if (request.player_approaching) remaining -= DISPOSITION_TOKENS;
  if (request.purpose === "dialogue") remaining -= WORLD_CONTEXT_TOKENS;

  const maxMemories = Math.max(1, Math.floor(remaining / MEMORY_TOKENS_EACH));

  // --- 4. Build soul_summary via LLM ---
  const summaryPrompt = buildSoulSummaryPrompt(soul);
  const soulSummary = await generateSummary(summaryPrompt);

  // --- 5. Build trait_snapshot ---
  const traitSnapshot = buildTraitSnapshot(soul.lived.traits, request.purpose);

  // --- 6. Build memories array (MemoryContext[]) ---
  const selectedMemories = scored.slice(0, maxMemories);
  const memoryContexts: MemoryContext[] = selectedMemories.map((s) => ({
    date: s.memory.frontmatter.date,
    type: s.memory.frontmatter.type,
    summary: s.memory.body.slice(0, 200),
    weight: s.memory.frontmatter.weight,
  }));

  // --- 7. Build disposition_summary ---
  let dispositionSummary: string | null = null;
  if (request.player_approaching) {
    const reputation = loadReputation(request.npc_id, base);
    if (reputation) {
      dispositionSummary = buildDispositionSummary(reputation);
    }
  }

  // --- 8. Build world_context ---
  let worldContext: string | null = null;
  if (request.purpose === "dialogue") {
    worldContext = loadWorldContext(base);
  }

  // --- 10. Assemble NpcContext ---
  const context: NpcContext = {
    npc_id: request.npc_id,
    soul_summary: soulSummary,
    current_state: soul.lived.current_state,
    trait_snapshot: traitSnapshot,
    memories: memoryContexts,
    disposition_summary: dispositionSummary,
    world_context: worldContext,
    total_tokens_used: 0,
  };
  context.total_tokens_used = estimateTokens(context);

  return context;
}
