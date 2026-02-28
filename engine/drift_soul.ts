// ============================================================
// Soul Drift Engine
// ============================================================
// Updates each NPC's mutable `lived` traits based on accumulated
// memories since the last simulation step. Traits drift in
// response to experiences, pull back toward seed values when
// untouched, and cross thresholds that update tendencies.
// ============================================================

import { loadSoul, loadMemoriesInRange, writeSoul } from "./file_io.js";
import type {
  Soul,
  Memory,
  TraitValue,
  Wound,
  Growth,
  DriftInput,
} from "./types.js";

// --- Result Types ---

export interface TraitChange {
  trait: string;
  old_value: number;
  new_value: number;
  cause: string; // memory filename
}

export interface DriftResult {
  npc_id: string;
  traits_changed: TraitChange[];
  tendencies_changed: string[];
  wounds_added: Wound[];
  growth_added: Growth[];
  new_current_state: string;
}

// --- Tendency Threshold Types ---

interface TendencyThreshold {
  trait: string;
  threshold: number;
  direction: "above" | "below";
  tendency: string;
}

export interface TendencyUpdate {
  trait: string;
  tendency: string;
  direction: "above" | "below";
}

// --- Constants ---

const TENDENCY_THRESHOLDS: TendencyThreshold[] = [
  { trait: "bitterness", threshold: 0.8, direction: "above", tendency: "cold to strangers" },
  { trait: "bitterness", threshold: 0.3, direction: "below", tendency: "warm to strangers" },
  { trait: "trust", threshold: 0.2, direction: "below", tendency: "guards their words" },
  { trait: "trust", threshold: 0.7, direction: "above", tendency: "open with feelings" },
  { trait: "hope", threshold: 0.2, direction: "below", tendency: "expects the worst" },
  { trait: "hope", threshold: 0.7, direction: "above", tendency: "looks forward to tomorrow" },
  { trait: "ambition", threshold: 0.85, direction: "above", tendency: "always wants more" },
  { trait: "courage", threshold: 0.2, direction: "below", tendency: "looks for the exit" },
  { trait: "courage", threshold: 0.8, direction: "above", tendency: "stands their ground" },
  { trait: "suspicion", threshold: 0.8, direction: "above", tendency: "questions every motive" },
];

/** Keywords that map memory content to NPC core values. */
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

// --- Utility ---

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Round a number to 4 decimal places to avoid floating point noise. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// --- Step 2: Evaluate Memory Drift ---

/**
 * Determine which traits are affected by a memory and by how much.
 * Returns a map of trait_name to drift_amount.
 */
export function evaluateMemoryDrift(memory: Memory, soul: Soul): Map<string, number> {
  const drifts = new Map<string, number>();
  const valence = memory.frontmatter.emotional_valence;
  const weight = memory.frontmatter.weight;
  const source = memory.frontmatter.source;

  // Base magnitude scales with weight
  let baseMagnitude = weight * 0.1;

  // Rumor sources apply at 40% rate
  if (source === "rumor") baseMagnitude *= 0.4;

  // Apply based on valence
  if (valence === "negative") {
    drifts.set("bitterness", baseMagnitude);
    drifts.set("trust", -baseMagnitude * 0.8);
    drifts.set("suspicion", baseMagnitude * 0.6);
    if (memory.frontmatter.subject !== "player") {
      // Death or loss event
      drifts.set("hope", -baseMagnitude);
    }
  } else if (valence === "positive") {
    drifts.set("trust", baseMagnitude * 0.8);
    drifts.set("hope", baseMagnitude * 0.6);
    drifts.set("bitterness", -baseMagnitude * 0.3);
  }
  // neutral memories don't cause drift

  return drifts;
}

// --- Step 3: Values-Amplified Drift ---

/**
 * Check if a memory's content relates to any of the NPC's core values,
 * and return the amplification multiplier based on value priority.
 */
function getValuesAmplifier(memory: Memory, soul: Soul): number {
  const values = soul.core.values;
  if (values.length === 0) return 1.0;

  // Build a searchable text from the memory body and subject
  const searchText = `${memory.frontmatter.subject} ${memory.body}`.toLowerCase();

  for (let i = 0; i < values.length; i++) {
    const value = values[i].toLowerCase();
    const keywords = VALUE_KEYWORDS[value] || [value];

    const matches = keywords.some(kw => searchText.includes(kw));
    if (matches) {
      if (i === 0) return 1.5;
      if (i === 1) return 1.3;
      if (i === 2) return 1.1;
      return 1.0; // index 3+: no amplification
    }
  }

  return 1.0;
}

// --- Step 5: Attractor Pull ---

/**
 * For each trait NOT affected by any memory this step, move current
 * toward seed by 0.02. Returns list of trait names that were pulled.
 */
export function applyAttractorPull(
  traits: Record<string, TraitValue>,
  affectedTraits?: Set<string>,
): string[] {
  const pulled: string[] = [];
  const affected = affectedTraits ?? new Set<string>();

  for (const [name, trait] of Object.entries(traits)) {
    if (affected.has(name)) continue;

    if (trait.current < trait.seed) {
      trait.current = round4(Math.min(trait.current + 0.02, trait.seed));
      pulled.push(name);
    } else if (trait.current > trait.seed) {
      trait.current = round4(Math.max(trait.current - 0.02, trait.seed));
      pulled.push(name);
    }
  }

  return pulled;
}

// --- Step 6: Tendency Thresholds ---

/**
 * Check all trait values against tendency thresholds.
 * Returns list of tendency updates that should be applied.
 */
export function checkTendencyThresholds(
  traits: Record<string, TraitValue>,
): TendencyUpdate[] {
  const updates: TendencyUpdate[] = [];

  for (const entry of TENDENCY_THRESHOLDS) {
    const trait = traits[entry.trait];
    if (!trait) continue;

    if (entry.direction === "above" && trait.current > entry.threshold) {
      updates.push({
        trait: entry.trait,
        tendency: entry.tendency,
        direction: entry.direction,
      });
    } else if (entry.direction === "below" && trait.current < entry.threshold) {
      updates.push({
        trait: entry.trait,
        tendency: entry.tendency,
        direction: entry.direction,
      });
    }
  }

  return updates;
}

// --- Main Export ---

/**
 * Update an NPC's mutable `lived` traits based on accumulated memories
 * since the last simulation step.
 */
export async function driftSoul(
  input: DriftInput,
  generateCurrentState: (prompt: string) => Promise<string>,
  baseDir?: string,
): Promise<DriftResult> {
  // ----- Step 1: Load Data -----
  const soul = loadSoul(input.npc_id, baseDir);
  const memories = loadMemoriesInRange(
    input.npc_id,
    input.since_date,
    input.current_date,
    baseDir,
  );

  // Filter to non-faded memories, sort by weight descending
  const activeMemories = memories
    .filter(m => !m.frontmatter.faded)
    .sort((a, b) => b.frontmatter.weight - a.frontmatter.weight);

  // ----- Step 2 & 3: Evaluate High-Weight Memories with Values Amplification -----
  // Accumulate all drift contributions per trait, tracking causes
  const traitDriftAccum: Record<string, number> = {};
  const traitCauses: Record<string, string[]> = {};
  const affectedTraits = new Set<string>();
  const traitChanges: TraitChange[] = [];

  // Per-memory tracking for wounds/growth (Step 7)
  const memoryDriftMap: { memory: Memory; drifts: Map<string, number> }[] = [];

  for (const memory of activeMemories) {
    if (memory.frontmatter.weight < 0.5) continue;

    const rawDrifts = evaluateMemoryDrift(memory, soul);
    if (rawDrifts.size === 0) continue;

    // Step 3: Apply values amplification
    const amplifier = getValuesAmplifier(memory, soul);

    const amplifiedDrifts = new Map<string, number>();
    for (const [trait, drift] of rawDrifts) {
      const amplifiedDrift = round4(drift * amplifier);
      amplifiedDrifts.set(trait, amplifiedDrift);

      // Accumulate
      traitDriftAccum[trait] = (traitDriftAccum[trait] || 0) + amplifiedDrift;
      if (!traitCauses[trait]) traitCauses[trait] = [];
      traitCauses[trait].push(memory.filename);
      affectedTraits.add(trait);
    }

    memoryDriftMap.push({ memory, drifts: amplifiedDrifts });
  }

  // ----- Step 4: Aggregate and Cap -----
  for (const [traitName, totalDrift] of Object.entries(traitDriftAccum)) {
    const trait = soul.lived.traits[traitName];
    if (!trait) continue;

    const cappedDrift = clamp(totalDrift, -0.10, 0.10);
    const oldValue = trait.current;
    trait.current = round4(clamp(trait.current + cappedDrift, 0.0, 1.0));

    if (trait.current !== oldValue) {
      traitChanges.push({
        trait: traitName,
        old_value: oldValue,
        new_value: trait.current,
        cause: (traitCauses[traitName] || []).join(", "),
      });
    }
  }

  // ----- Step 5: Attractor Pull -----
  applyAttractorPull(soul.lived.traits, affectedTraits);

  // ----- Step 6: Update Tendencies -----
  const tendencyUpdates = checkTendencyThresholds(soul.lived.traits);
  const tendenciesChanged: string[] = [];

  for (const update of tendencyUpdates) {
    // Only add if not already present
    if (!soul.lived.tendencies.includes(update.tendency)) {
      soul.lived.tendencies.push(update.tendency);
      tendenciesChanged.push(update.tendency);
    }
  }

  // Remove tendencies whose thresholds are no longer crossed
  const activeTendencySet = new Set(tendencyUpdates.map(u => u.tendency));
  soul.lived.tendencies = soul.lived.tendencies.filter(t => {
    // Keep tendencies that are still active OR that are not from our threshold table
    const isThresholdTendency = TENDENCY_THRESHOLDS.some(th => th.tendency === t);
    if (!isThresholdTendency) return true; // custom tendency, keep it
    return activeTendencySet.has(t);
  });

  // ----- Step 7: Write Wounds/Growth -----
  const woundsAdded: Wound[] = [];
  const growthAdded: Growth[] = [];

  for (const { memory, drifts } of memoryDriftMap) {
    for (const [traitName, driftAmount] of drifts) {
      // Skip if the trait does not exist on the soul
      if (!soul.lived.traits[traitName]) continue;

      if (driftAmount < 0) {
        // Wound: negative drift
        const existing = soul.lived.wounds.find(
          w => w.event_ref === memory.filename && w.trait_affected === traitName,
        );
        if (existing) {
          existing.drift_amount = round4(driftAmount);
          existing.since_date = memory.frontmatter.date;
        } else {
          const wound: Wound = {
            event_ref: memory.filename,
            trait_affected: traitName,
            drift_amount: round4(driftAmount),
            since_date: memory.frontmatter.date,
          };
          soul.lived.wounds.push(wound);
          woundsAdded.push(wound);
        }
      } else if (driftAmount > 0) {
        // Growth: positive drift
        const existing = soul.lived.growth.find(
          g => g.event_ref === memory.filename && g.trait_affected === traitName,
        );
        if (existing) {
          existing.drift_amount = round4(driftAmount);
          existing.since_date = memory.frontmatter.date;
        } else {
          const growth: Growth = {
            event_ref: memory.filename,
            trait_affected: traitName,
            drift_amount: round4(driftAmount),
            since_date: memory.frontmatter.date,
          };
          soul.lived.growth.push(growth);
          growthAdded.push(growth);
        }
      }
    }
  }

  // ----- Step 8: Generate current_state -----
  const topMemories = activeMemories.slice(0, 3);
  const traitSummary = Object.entries(soul.lived.traits)
    .map(([name, val]) => `  ${name}: ${val.current}`)
    .join("\n");
  const memorySummary = topMemories
    .map((m, i) => `  ${i + 1}. [${m.frontmatter.date}] (weight ${m.frontmatter.weight}, ${m.frontmatter.emotional_valence}) ${m.body.slice(0, 120)}`)
    .join("\n");

  const prompt = `You are updating the emotional state description for ${soul.frontmatter.name}, a ${soul.core.temperament} ${soul.frontmatter.occupation}.

Their core values are: ${soul.core.values.join(", ")}
Their current trait scores are:
${traitSummary}
Recent experiences (most impactful first):
${memorySummary || "  (no recent experiences)"}

Write 1-2 sentences describing their current emotional posture.
Write it as an outside observer would describe them, not in first person.
Be specific to their actual trait values - do not be generic.`;

  const newCurrentState = await generateCurrentState(prompt);
  soul.lived.current_state = newCurrentState;

  // ----- Step 9: Save -----
  // NEVER modify the `core` section - we only changed `lived` above.
  writeSoul(soul, baseDir);

  return {
    npc_id: input.npc_id,
    traits_changed: traitChanges,
    tendencies_changed: tendenciesChanged,
    wounds_added: woundsAdded,
    growth_added: growthAdded,
    new_current_state: newCurrentState,
  };
}
