// ============================================================
// Memory Writer Engine
// ============================================================
// Converts player interaction events into NPC memory files.
// The LLM call is injectable via `generateMemoryBody` callback
// so this module remains testable without hitting an actual model.
// ============================================================

import type {
  Soul,
  InteractionEvent,
  EmotionalValence,
  MemoryFrontmatter,
} from "./types.js";

import {
  loadSoul,
  writeMemory,
  appendEventLog,
  npcExists,
} from "./file_io.js";

import { parseDate } from "./calendar.js";

// --- Public Types ---

/** Callback that turns a prompt string into a memory body via an LLM. */
export type MemoryBodyGenerator = (prompt: string) => Promise<string>;

/** Result returned after writing all memories for an interaction event. */
export interface WriteMemoryResult {
  primary_memory_path: string;
  witness_memory_paths: string[];
  event_log_entry: string;
}

// --- Exported Helper Functions (also useful for testing) ---

/**
 * Determine the emotional valence an NPC would feel about the event,
 * based on their moral_grain, values, and the action's moral_weight.
 */
export function determineValence(soul: Soul, event: InteractionEvent): EmotionalValence {
  const weight = event.player_action.moral_weight;
  const grain = soul.core.moral_grain;
  const values = soul.core.values.map(v => v.toLowerCase());
  const actionType = event.player_action.type.toLowerCase();
  const description = event.player_action.description.toLowerCase();

  // Selfless NPCs care deeply about morality
  if (grain === "selfless") {
    if (weight > 0.1) return "positive";
    if (weight < -0.1) return "negative";
    return "neutral";
  }

  // Selfish NPCs react differently to generosity/wealth actions
  if (grain === "selfish") {
    const isWealthRelated =
      values.some(v => v.includes("wealth") || v.includes("profit") || v.includes("coin")) ||
      actionType.includes("gave") || actionType.includes("gave_away") ||
      description.includes("giving") || description.includes("gave away") ||
      description.includes("donated");

    if (isWealthRelated) {
      // A selfish NPC views giving away resources negatively
      if (weight > 0) return "negative";
      return "positive";
    }

    // For non-wealth actions, selfish NPCs are less moved by morality
    if (weight > 0.4) return "positive";
    if (weight < -0.4) return "negative";
    return "neutral";
  }

  // Ruthless NPCs are unbothered by negative actions
  if (grain === "ruthless") {
    if (weight > 0.3) return "positive";
    if (weight < -0.5) return "negative"; // only very extreme acts register
    return "neutral";
  }

  // Default (pragmatic or anything else): standard thresholds
  if (weight > 0.2) return "positive";
  if (weight < -0.2) return "negative";
  return "neutral";
}

/**
 * Compute memory weight proportional to the absolute moral weight of the action.
 * Range: [0.1, 0.9], base formula: 0.3 + abs(moral_weight) * 0.6
 */
export function computeWeight(moralWeight: number): number {
  const raw = 0.3 + Math.abs(moralWeight) * 0.6;
  return Math.round(Math.min(0.9, Math.max(0.1, raw)) * 100) / 100;
}

/**
 * Generate a URL-safe slug from the action type, optionally including an NPC id.
 * E.g. "helped" -> "player-helped", "threatened" -> "player-threatened-old_mara"
 */
export function generateSlug(actionType: string, npcId?: string): string {
  const sanitized = actionType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const base = `player-${sanitized}`;
  if (npcId) {
    const sanitizedNpc = npcId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${base}-${sanitizedNpc}`;
  }
  return base;
}

// --- Internal Helpers ---

/** Build the LLM prompt for the primary NPC's memory. */
function buildPrimaryPrompt(soul: Soul, event: InteractionEvent): string {
  const name = soul.frontmatter.name;
  const temperament = soul.core.temperament;
  const occupation = soul.frontmatter.occupation;
  const values = soul.core.values.join(", ");
  const currentState = soul.lived.current_state;
  const description = event.player_action.description;
  const context = event.context;

  return [
    `You are writing a memory for ${name}, a ${temperament} ${occupation} who values ${values}.`,
    `Their current emotional state is: ${currentState}`,
    "",
    `The following event just occurred: ${description}`,
    `Context: ${context}`,
    "",
    `Write a 2-5 sentence internal memory from ${name}'s first-person perspective.`,
    "Do not summarize. Write it as they would actually think it -- in their voice, with their emotional filter.",
    'Do not use the player\'s name; refer to them as "the traveler" or a physical description.',
  ].join("\n");
}

/** Build the LLM prompt for a witness NPC's memory. */
function buildWitnessPrompt(
  witnessSoul: Soul,
  event: InteractionEvent,
  wasPresent: boolean,
): string {
  const name = witnessSoul.frontmatter.name;
  const temperament = witnessSoul.core.temperament;
  const occupation = witnessSoul.frontmatter.occupation;
  const values = witnessSoul.core.values.join(", ");
  const currentState = witnessSoul.lived.current_state;
  const description = event.player_action.description;
  const perspective = wasPresent
    ? "You only saw this from a distance."
    : "You heard about this from someone else.";

  return [
    `You are writing a memory for ${name}, a ${temperament} ${occupation} who values ${values}.`,
    `Their current emotional state is: ${currentState}`,
    "",
    `The following event was witnessed or heard about: ${description}`,
    perspective,
    "",
    `Write a 1-3 sentence internal memory from ${name}'s first-person perspective.`,
    "Reflect uncertainty -- you did not experience this directly.",
    'Do not use the player\'s name; refer to them as "the traveler" or a physical description.',
  ].join("\n");
}

/** Format the event log entry. */
function formatEventLogEntry(
  date: string,
  npcId: string,
  actionType: string,
  description: string,
  moralWeight: number,
  witnesses: string[],
  memoryPaths: string[],
): string {
  const lines = [
    `[${date}] ${npcId} -- ${actionType}: ${description} (moral_weight: ${moralWeight})`,
    `  witnesses: [${witnesses.join(", ")}]`,
    `  memory files: [${memoryPaths.join(", ")}]`,
  ];
  return lines.join("\n");
}

// --- Main Export ---

/**
 * Convert a player interaction event into NPC memory files.
 *
 * 1. Validates the event and loads the primary NPC's soul.
 * 2. Determines emotional valence and computes memory weight.
 * 3. Generates a memory body via the injectable LLM callback.
 * 4. Writes the primary memory file.
 * 5. Writes witness memories (silently skipping missing NPCs).
 * 6. Appends an entry to the event log.
 */
export async function writeInteractionMemory(
  event: InteractionEvent,
  generateMemoryBody: MemoryBodyGenerator,
  baseDir?: string,
): Promise<WriteMemoryResult> {
  const base = baseDir ?? ".";

  // --- Validate date format ---
  parseDate(event.in_world_date); // throws on invalid format

  // --- Load primary NPC soul ---
  if (!npcExists(event.npc_id, base)) {
    throw new Error(
      `Cannot write memory: NPC "${event.npc_id}" has no soul.md file. ` +
      `Expected soul file at world/town/npcs/${event.npc_id}/soul.md`,
    );
  }
  const soul = loadSoul(event.npc_id, base);

  // --- Determine valence and weight ---
  const valence = determineValence(soul, event);
  const weight = computeWeight(event.player_action.moral_weight);

  // --- Generate memory filename ---
  const slug = generateSlug(event.player_action.type, event.npc_id);
  const filename = `${event.in_world_date}_${slug}.md`;

  // --- Build prompt and generate body via LLM callback ---
  const prompt = buildPrimaryPrompt(soul, event);
  const body = await generateMemoryBody(prompt);

  // --- Write primary memory ---
  const primaryFrontmatter: MemoryFrontmatter = {
    date: event.in_world_date,
    type: "interaction",
    subject: "player",
    emotional_valence: valence,
    weight,
    source: "direct",
    faded: false,
    fade_date: null,
  };

  const primaryPath = writeMemory(
    event.npc_id,
    filename,
    primaryFrontmatter,
    body,
    base,
  );

  // --- Write witness memories ---
  const witnessMemoryPaths: string[] = [];

  for (const witnessId of event.witnesses) {
    // Silently skip witnesses without soul files
    if (!npcExists(witnessId, base)) continue;

    const witnessSoul = loadSoul(witnessId, base);
    const witnessValence = determineValence(witnessSoul, event);
    const witnessWeight = Math.round(Math.min(0.4, Math.max(0.1, weight * 0.4)) * 100) / 100;
    const witnessSlug = generateSlug(event.player_action.type, event.npc_id);
    const witnessFilename = `${event.in_world_date}_${witnessSlug}.md`;

    // Witnesses who are in the witnesses list were present
    const witnessPrompt = buildWitnessPrompt(witnessSoul, event, true);
    const witnessBody = await generateMemoryBody(witnessPrompt);

    const witnessFrontmatter: MemoryFrontmatter = {
      date: event.in_world_date,
      type: "observation",
      subject: "player",
      emotional_valence: witnessValence,
      weight: witnessWeight,
      source: "rumor",
      faded: false,
      fade_date: null,
    };

    const witnessPath = writeMemory(
      witnessId,
      witnessFilename,
      witnessFrontmatter,
      witnessBody,
      base,
    );
    witnessMemoryPaths.push(witnessPath);
  }

  // --- Build and append event log entry ---
  const allPaths = [primaryPath, ...witnessMemoryPaths];
  const logEntry = formatEventLogEntry(
    event.in_world_date,
    event.npc_id,
    event.player_action.type,
    event.player_action.description,
    event.player_action.moral_weight,
    event.witnesses,
    allPaths,
  );

  appendEventLog(logEntry, base);

  return {
    primary_memory_path: primaryPath,
    witness_memory_paths: witnessMemoryPaths,
    event_log_entry: logEntry,
  };
}
