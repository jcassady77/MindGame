// ============================================================
// Dialogue Tone System
// ============================================================
// Assembles tone-aware dialogue context for a given NPC +
// player encounter. Disposition sets the register (how guarded,
// how warm, how forthcoming). Soul sets the voice (how the NPC
// actually expresses it). This module is a pure function layer
// — no async, no file I/O. The caller loads the data.
// ============================================================

import type {
  DialogueRequest,
  DialogueToneContext,
  Soul,
  Reputation,
  Memory,
  Disposition,
} from "./types.js";

// --- Tone Template ---

export interface ToneTemplate {
  general: string;
  information: string;
  references: string;
}

// --- Tone Matrix ---

const TONE_MATRIX: Record<Disposition, ToneTemplate> = {
  adoring: {
    general: "Warm, eager, genuinely happy to see the player",
    information: "Shares freely, volunteers extras, may reveal secrets",
    references: "References past help warmly and specifically",
  },
  friendly: {
    general: "Welcoming, honest, at ease",
    information: "Shares most things willingly, helpful",
    references: "Acknowledges player positively, may bring up shared history",
  },
  neutral: {
    general: "Polite, transactional, neither warm nor cold",
    information: "Answers what's asked, no more",
    references: "Treats player like any visitor",
  },
  wary: {
    general: "Guarded, clipped responses, watchful",
    information: "Minimal answers, evasive on sensitive topics",
    references: "Doesn't reference history unless pressed",
  },
  hostile: {
    general: "Cold, dismissive, may be confrontational",
    information: "Refuses optional help, may misdirect",
    references: "References past wrongs, cynical about player's motives",
  },
  hated: {
    general: "Barely civil or openly contemptuous",
    information: "Refuses interaction, may actively lie",
    references: "Directly references the wrong done, no pretense",
  },
};

// --- Main Export ---

/**
 * Build the dialogue tone context that gets passed to the dialogue LLM.
 *
 * This is a pure function. The caller is responsible for loading the soul,
 * reputation, memories, and world context before calling this.
 */
export function buildDialogueTone(
  request: DialogueRequest,
  soul: Soul,
  reputation: Reputation | null,
  memories: Memory[],
  worldContext: string,
): DialogueToneContext {
  const npcSummary = buildNpcSummary(soul);
  const currentState = soul.lived.current_state;
  const dispositionTowardPlayer = buildDispositionTowardPlayer(reputation);
  const keyMemoriesSummary = buildKeyMemoriesSummary(memories, request.topic);
  const disposition = reputation?.disposition ?? "neutral";
  const toneInstructions = buildToneInstructions(disposition, soul);
  const memoryCues = buildMemoryCues(memories, request.topic);

  return {
    npc_summary: npcSummary,
    current_state: currentState,
    disposition_toward_player: dispositionTowardPlayer,
    key_memories_summary: keyMemoriesSummary,
    tone_instructions: toneInstructions,
    memory_cues: memoryCues,
    world_context: worldContext,
  };
}

// --- Helper Exports ---

/**
 * Get the raw tone template for a disposition level.
 */
export function getToneTemplate(disposition: Disposition): ToneTemplate {
  return TONE_MATRIX[disposition];
}

/**
 * Apply soul-specific modifiers on top of a base tone template.
 * Returns a prose string combining the template with soul adjustments.
 */
export function applySoulModifiers(template: ToneTemplate, soul: Soul): string {
  const modifiers: string[] = [];

  const temperament = soul.core.temperament.toLowerCase();
  const bitterness = soul.lived.traits.bitterness?.current ?? 0;
  const courage = soul.lived.traits.courage?.current ?? 0.5;

  // Warm temperament + wary = guarded with sadness, not bitterness
  if (temperament === "warm" && template === TONE_MATRIX.wary) {
    modifiers.push(
      "Guarded with sadness, not bitterness. There is sorrow behind the distance — this NPC used to think better of the player.",
    );
  }

  // Suspicious temperament + friendly = warm but still asks questions
  if (
    (temperament === "suspicious" || temperament === "anxious") &&
    template === TONE_MATRIX.friendly
  ) {
    modifiers.push(
      "Warm but still asks questions. Never fully relaxed — friendliness is genuine but comes with a watchful edge.",
    );
  }

  // High bitterness at any disposition adds weariness
  if (bitterness > 0.7) {
    modifiers.push(
      "An edge or weariness colors every line. Even kind words carry the weight of accumulated disappointment.",
    );
  }

  // Low courage + hostile = passive-aggressive rather than confrontational
  if (courage < 0.2 && template === TONE_MATRIX.hostile) {
    modifiers.push(
      "Passive-aggressive rather than confrontational. Hostility comes out sideways — through omission, implication, and turned backs rather than direct challenge.",
    );
  }

  // Stoic temperament adds economy of words
  if (temperament === "stoic") {
    modifiers.push(
      "Economy of words. Says less than most people would in the same situation. Silence carries meaning.",
    );
  }

  // Melancholic temperament adds emotional depth
  if (temperament === "melancholic") {
    modifiers.push(
      "Emotional undercurrents run deep. May express feelings through metaphor, story, or oblique reference rather than direct statement.",
    );
  }

  // Gentle temperament softens even negative dispositions
  if (
    temperament === "gentle" &&
    (template === TONE_MATRIX.hostile || template === TONE_MATRIX.wary)
  ) {
    modifiers.push(
      "Even disapproval is delivered gently. Disappointment rather than anger. More sorrow than confrontation.",
    );
  }

  if (modifiers.length === 0) {
    return "";
  }

  return modifiers.join(" ");
}

// --- Internal Helpers ---

/**
 * Build a prose summary paragraph from the soul.
 */
function buildNpcSummary(soul: Soul): string {
  const { name, age, occupation } = soul.frontmatter;
  const { temperament, values, moral_grain, quirks } = soul.core;

  const valuesStr = values.join(", ");
  const quirksStr = quirks.map((q) => q.replace(/^"|"$/g, "")).join("; ");

  return (
    `${name} is a ${age}-year-old ${occupation} with a ${temperament} nature. ` +
    `They value ${valuesStr} above all else, and their moral outlook is ${moral_grain}. ` +
    `Quirks: ${quirksStr}.`
  );
}

/**
 * Build the disposition toward the player string.
 * If reputation exists, includes disposition label and internal monologue excerpt.
 * Otherwise, indicates no prior relationship.
 */
function buildDispositionTowardPlayer(reputation: Reputation | null): string {
  if (!reputation) {
    return "No prior relationship with the traveler.";
  }

  const disposition = reputation.disposition;
  const monologue = reputation.internal_monologue;

  // Extract first 2 sentences of internal monologue
  const sentences = monologue.match(/[^.!?]+[.!?]+/g) || [];
  const excerpt = sentences.slice(0, 2).join("").trim();

  if (excerpt) {
    return `Disposition: ${disposition}. ${excerpt}`;
  }

  return `Disposition: ${disposition}.`;
}

/**
 * Build a summary of the top 2 most relevant memories.
 * Filters by topic relevance if a topic is provided, otherwise uses
 * highest-weight memories about the player.
 */
function buildKeyMemoriesSummary(
  memories: Memory[],
  topic: string | null,
): string {
  if (memories.length === 0) {
    return "No memories of the traveler.";
  }

  let relevant: Memory[];

  if (topic) {
    // Filter for memories whose body mentions the topic
    const topicLower = topic.toLowerCase();
    const topicMatches = memories.filter(
      (m) =>
        m.body.toLowerCase().includes(topicLower) ||
        m.frontmatter.subject.toLowerCase().includes(topicLower),
    );

    if (topicMatches.length > 0) {
      relevant = topicMatches
        .sort((a, b) => b.frontmatter.weight - a.frontmatter.weight)
        .slice(0, 2);
    } else {
      // Fall back to highest weight
      relevant = [...memories]
        .sort((a, b) => b.frontmatter.weight - a.frontmatter.weight)
        .slice(0, 2);
    }
  } else {
    // Use highest weight memories
    relevant = [...memories]
      .sort((a, b) => b.frontmatter.weight - a.frontmatter.weight)
      .slice(0, 2);
  }

  const summaries = relevant.map((m) => {
    // Take the first sentence of the memory body as a summary
    const firstSentence = m.body.match(/^[^.!?]+[.!?]+/);
    const summary = firstSentence ? firstSentence[0].trim() : m.body.trim();
    const valence = m.frontmatter.emotional_valence;
    return `[${valence}] ${summary}`;
  });

  return summaries.join(" ");
}

/**
 * Build tone instructions from the disposition x soul matrix.
 * Combines the base tone template with soul-specific modifiers.
 */
function buildToneInstructions(
  disposition: Disposition,
  soul: Soul,
): string {
  const template = getToneTemplate(disposition);
  const soulModifiers = applySoulModifiers(template, soul);

  let instructions =
    `General tone: ${template.general}. ` +
    `Information sharing: ${template.information}. ` +
    `Player references: ${template.references}.`;

  if (soulModifiers) {
    instructions += ` Soul modifiers: ${soulModifiers}`;
  }

  return instructions;
}

/**
 * Build memory cues — max 3 cues from the most relevant memories.
 * These prompt the LLM to reference specific past events naturally.
 */
function buildMemoryCues(
  memories: Memory[],
  topic: string | null,
): string[] {
  if (memories.length === 0) {
    return [];
  }

  // Sort by weight descending, then filter by topic if provided
  let pool = [...memories].sort(
    (a, b) => b.frontmatter.weight - a.frontmatter.weight,
  );

  if (topic) {
    const topicLower = topic.toLowerCase();
    const topicMatches = pool.filter(
      (m) =>
        m.body.toLowerCase().includes(topicLower) ||
        m.frontmatter.subject.toLowerCase().includes(topicLower),
    );
    if (topicMatches.length > 0) {
      pool = topicMatches;
    }
  }

  const selected = pool.slice(0, 3);
  const cues: string[] = [];

  for (const memory of selected) {
    const action = extractAction(memory);
    const valence = memory.frontmatter.emotional_valence;
    const source = memory.frontmatter.source;

    if (source === "direct") {
      cues.push(
        `Reference, if natural, that you remember when the traveler ${action}. You felt ${valence}.`,
      );
    } else {
      cues.push(
        `You heard (but aren't sure) that the traveler ${action}. You're uncertain.`,
      );
    }
  }

  return cues;
}

/**
 * Extract a short action description from a memory body.
 * Takes the first sentence and strips it down to an action phrase.
 */
function extractAction(memory: Memory): string {
  const body = memory.body.trim();
  // Take the first sentence
  const firstSentence = body.match(/^[^.!?]+[.!?]*/);
  if (firstSentence) {
    return firstSentence[0].trim().toLowerCase().replace(/\.$/, "");
  }
  // Fallback: use subject
  return memory.frontmatter.subject.toLowerCase();
}
