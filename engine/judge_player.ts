// ============================================================
// NPC Judgment System — Player Reputation Scoring
// ============================================================
// Computes an NPC's opinion of the player based on direct
// memories, rumors, values alignment, and soul modifiers.
// Produces a Reputation object saved to disk.
// ============================================================

import { loadSoul, loadMemories, writeReputation } from "./file_io.js";
import type {
  Soul,
  Memory,
  Reputation,
  Disposition,
  KeyMemory,
  ScoreBreakdown,
} from "./types.js";

// --- VALUE_KEYWORDS (shared approach with drift engine) ---

const VALUE_KEYWORDS: Record<string, string[]> = {
  family: ["family", "mother", "father", "sister", "brother", "child", "children", "son", "daughter", "kin", "wife", "husband", "spouse", "parent"],
  honesty: ["deception", "deceived", "lied", "lie", "lying", "dishonest", "truth", "honest", "honesty", "betrayal", "betrayed", "cheat", "fraud"],
  wealth: ["wealth", "trade", "gold", "coin", "merchant", "profit", "money", "payment", "debt", "rich", "poor", "commerce", "bargain", "goods"],
  justice: ["justice", "law", "crime", "punishment", "court", "judge", "trial", "sentence", "guilty", "innocent", "fair", "unfair", "verdict", "order"],
  loyalty: ["loyalty", "loyal", "oath", "promise", "allegiance", "betray", "devotion", "faithful", "unfaithful", "sworn", "vow"],
  honor: ["honor", "honour", "dignity", "respect", "shame", "disgrace", "reputation", "pride", "noble", "ignoble"],
  freedom: ["freedom", "free", "liberty", "captive", "prison", "escape", "cage", "chains", "liberate", "oppression", "tyranny"],
  faith: ["faith", "god", "gods", "prayer", "temple", "divine", "holy", "sacred", "blessing", "curse", "piety", "devotion"],
  knowledge: ["knowledge", "learn", "study", "book", "scholar", "wisdom", "lore", "discovery", "research", "truth"],
  community: ["community", "town", "village", "neighbor", "together", "unity", "cooperation", "common", "shared", "public"],
  mercy: ["mercy", "forgive", "forgiveness", "compassion", "pity", "spare", "clemency", "gentle", "kind", "kindness"],
  power: ["power", "rule", "throne", "authority", "command", "dominion", "control", "influence", "strength"],
  survival: ["survival", "survive", "endure", "danger", "threat", "risk", "safety", "protect", "defense", "shield"],
};

// --- Helper: valence to float ---

function valenceToFloat(valence: string): number {
  if (valence === "positive") return 1.0;
  if (valence === "negative") return -1.0;
  return 0.0;
}

// --- Step 2: Direct Memory Score ---

/**
 * Compute the weighted average opinion score from direct player memories.
 * Faded memories contribute at 20% of their original weight.
 */
export function computeDirectScore(memories: Memory[]): number {
  const directMemories = memories.filter(
    m => m.frontmatter.source === "direct" && m.frontmatter.subject === "player",
  );

  let weightedSum = 0;
  let totalWeight = 0;

  for (const m of directMemories) {
    const valenceFloat = valenceToFloat(m.frontmatter.emotional_valence);
    const effectiveWeight = m.frontmatter.faded
      ? m.frontmatter.weight * 0.2
      : m.frontmatter.weight;
    weightedSum += effectiveWeight * valenceFloat;
    totalWeight += effectiveWeight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// --- Step 3: Rumor Score ---

/**
 * Compute the weighted average opinion score from rumor-sourced player memories.
 * Uses the same formula as direct score but influence is capped at 30% of total.
 */
export function computeRumorScore(memories: Memory[]): number {
  const rumorMemories = memories.filter(
    m => m.frontmatter.source === "rumor" && m.frontmatter.subject === "player",
  );

  let weightedSum = 0;
  let totalWeight = 0;

  for (const m of rumorMemories) {
    const valenceFloat = valenceToFloat(m.frontmatter.emotional_valence);
    const effectiveWeight = m.frontmatter.faded
      ? m.frontmatter.weight * 0.2
      : m.frontmatter.weight;
    weightedSum += effectiveWeight * valenceFloat;
    totalWeight += effectiveWeight;
  }

  const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Cap rumor influence at 30% — the raw score is already in [-1, 1],
  // but we clamp it so extreme rumor consensus cannot dominate
  return Math.max(-0.3, Math.min(0.3, rawScore));
}

// --- Step 4: Values Alignment Score ---

/**
 * Compute how well the player's actions (as recorded in memories) align
 * with the NPC's core values. Top value gets 3x weight, second gets 2x,
 * third and beyond get 1x.
 */
export function computeValuesAlignment(memories: Memory[], soul: Soul): number {
  const playerMemories = memories.filter(m => m.frontmatter.subject === "player");
  if (playerMemories.length === 0 || soul.core.values.length === 0) return 0;

  let alignmentSum = 0;
  let totalWeight = 0;

  for (const memory of playerMemories) {
    const searchText = `${memory.frontmatter.subject} ${memory.body}`.toLowerCase();
    const valenceFloat = valenceToFloat(memory.frontmatter.emotional_valence);

    for (let i = 0; i < soul.core.values.length; i++) {
      const value = soul.core.values[i].toLowerCase();
      const keywords = VALUE_KEYWORDS[value] || [value];
      const matches = keywords.some(kw => searchText.includes(kw));

      if (matches) {
        // Priority weight: top value 3x, second 2x, rest 1x
        const priorityWeight = i === 0 ? 3 : i === 1 ? 2 : 1;
        const memWeight = memory.frontmatter.faded
          ? memory.frontmatter.weight * 0.2
          : memory.frontmatter.weight;

        // Positive memory about a valued topic → positive alignment
        // Negative memory about a valued topic → negative alignment
        alignmentSum += valenceFloat * priorityWeight * memWeight;
        totalWeight += priorityWeight * memWeight;
        break; // one value match per memory, highest priority wins
      }
    }
  }

  return totalWeight > 0 ? alignmentSum / totalWeight : 0;
}

// --- Step 7: Disposition Label ---

/**
 * Map a numeric opinion score ([-1, 1]) to a named disposition.
 */
export function getDisposition(score: number): Disposition {
  if (score >= 0.75) return "adoring";
  if (score >= 0.4) return "friendly";
  if (score >= -0.15) return "neutral";
  if (score >= -0.4) return "wary";
  if (score >= -0.74) return "hostile";
  return "hated";
}

// --- Main Export ---

/**
 * Judge the player from a specific NPC's perspective.
 *
 * Loads the NPC's soul and all memories about the player, computes a
 * composite opinion score from four components (direct memories, rumors,
 * values alignment, soul modifier), generates an internal monologue via
 * LLM, and writes the resulting Reputation file to disk.
 */
export async function judgePlayer(
  npcId: string,
  generateMonologue: (prompt: string) => Promise<string>,
  baseDir?: string,
): Promise<Reputation> {
  // ----- Step 1: Load Data -----
  const soul = loadSoul(npcId, baseDir);
  const allMemories = loadMemories(npcId, baseDir);
  const playerMemories = allMemories.filter(m => m.frontmatter.subject === "player");

  // ----- Step 2: Direct Memory Score -----
  const directScore = computeDirectScore(playerMemories);

  // ----- Step 3: Rumor Score -----
  const rumorScore = computeRumorScore(playerMemories);

  // ----- Step 4: Values Alignment Score -----
  const valuesScore = computeValuesAlignment(playerMemories, soul);

  // ----- Step 5: Soul Modifier -----
  let modifier = 0;

  // Grudge-holder: negative memories weigh 40% heavier
  if (soul.lived.tendencies.some(t => t.includes("grudge") || t.includes("forgive") === false)) {
    modifier -= Math.abs(Math.min(directScore, 0)) * 0.4;
  }

  // Forgiving: negative weight reduced
  if (soul.lived.tendencies.some(t => t.includes("forgiv"))) {
    modifier += Math.abs(Math.min(directScore, 0)) * 0.2;
  }

  // Ruthless: mild negatives don't register — reduce negative contribution
  // for memories with weight < 0.5
  if (soul.core.moral_grain === "ruthless") {
    const mildNegatives = playerMemories.filter(
      m =>
        m.frontmatter.source === "direct" &&
        m.frontmatter.emotional_valence === "negative" &&
        m.frontmatter.weight < 0.5,
    );
    if (mildNegatives.length > 0) {
      // Reduce their drag — push modifier toward zero
      const mildDrag = mildNegatives.reduce((sum, m) => {
        const w = m.frontmatter.faded ? m.frontmatter.weight * 0.2 : m.frontmatter.weight;
        return sum + w;
      }, 0);
      const totalDirect = playerMemories
        .filter(m => m.frontmatter.source === "direct")
        .reduce((sum, m) => {
          const w = m.frontmatter.faded ? m.frontmatter.weight * 0.2 : m.frontmatter.weight;
          return sum + w;
        }, 0);
      if (totalDirect > 0) {
        // Counteract the mild negative contribution proportionally
        modifier += (mildDrag / totalDirect) * Math.abs(Math.min(directScore, 0)) * 0.5;
      }
    }
  }

  // Selfless: strong negatives hit harder
  if (soul.core.moral_grain === "selfless") {
    modifier -= Math.abs(Math.min(directScore, 0)) * 0.5;
  }

  // ----- Step 6: Composite Score -----
  const opinionScore = Math.max(
    -1,
    Math.min(
      1,
      directScore * 0.5 + rumorScore * 0.2 + valuesScore * 0.3 + modifier,
    ),
  );

  // Round to 4 decimal places
  const roundedScore = Math.round(opinionScore * 10000) / 10000;

  // ----- Step 7: Disposition -----
  const disposition = getDisposition(roundedScore);

  // ----- Step 8: Internal Monologue -----
  // Select top 3 player memories by weight
  const topMemories = [...playerMemories]
    .sort((a, b) => b.frontmatter.weight - a.frontmatter.weight)
    .slice(0, 3);

  const memorySummary = topMemories
    .map(
      (m, i) =>
        `  ${i + 1}. [${m.frontmatter.date}] (${m.frontmatter.emotional_valence}, weight ${m.frontmatter.weight}, ${m.frontmatter.source}) ${m.body.slice(0, 150)}`,
    )
    .join("\n");

  const prompt = `You are writing the private thoughts of ${soul.frontmatter.name}, a ${soul.core.temperament} ${soul.frontmatter.occupation} who values ${soul.core.values.join(", ")}.
Their current emotional state: ${soul.lived.current_state}
Their opinion of the traveler is: ${disposition} (score: ${roundedScore})

The memories most shaping their view:
${memorySummary || "  (no memories of the traveler yet)"}

Write 2-4 sentences of internal monologue — what this NPC privately thinks about the traveler.
Be specific to the memories and values. Be honest about any conflict or ambivalence.
Do not be generic. Do not moralize.`;

  const internalMonologue = await generateMonologue(prompt);

  // ----- Step 9: Build key_memories -----
  const keyMemories: KeyMemory[] = topMemories.map(m => ({
    event_ref: m.filename,
    valence: m.frontmatter.emotional_valence,
    weight: m.frontmatter.weight,
  }));

  // ----- Step 10: Build and Save Reputation -----
  const scoreBreakdown: ScoreBreakdown = {
    direct_memories: Math.round(directScore * 10000) / 10000,
    rumors_heard: Math.round(rumorScore * 10000) / 10000,
    values_alignment: Math.round(valuesScore * 10000) / 10000,
    memory_modifier: Math.round(modifier * 10000) / 10000,
  };

  const today = new Date();
  const lastUpdated = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const reputation: Reputation = {
    npc_id: npcId,
    last_updated: lastUpdated,
    opinion_score: roundedScore,
    disposition,
    score_breakdown: scoreBreakdown,
    internal_monologue: internalMonologue,
    key_memories: keyMemories,
  };

  writeReputation(reputation, baseDir);

  return reputation;
}
