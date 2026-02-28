// ============================================================
// World Simulation Engine — advance_world.ts
// ============================================================
// Runs when the player returns from a quest. Simulates all
// world changes for the elapsed time: aging, death, economic
// drift, relationships, skill growth, and more.
// ============================================================

import type {
  Soul,
  EconomicStatus,
  WorldAdvanceInput,
  MemoryFrontmatter,
} from "./types.js";

import { ECONOMIC_STATUS_LADDER } from "./types.js";

import {
  loadSoul,
  writeSoul,
  listNpcIds,
  writeMemory,
  appendObituary,
  writeChangelog,
} from "./file_io.js";

import {
  parseDate,
  formatDate,
  formatDateHuman,
  addMonths,
} from "./calendar.js";

// --- Public Types ---

export interface WorldAdvanceCallbacks {
  generateText: (prompt: string) => Promise<string>;
  driftSoul: (npcId: string, sinceDate: string, currentDate: string) => Promise<void>;
  advanceEnvironment: (monthsElapsed: number, currentDate: string) => Promise<void>;
}

export interface WorldAdvanceResult {
  new_date: string;
  npcs_processed: number;
  deaths: DeathRecord[];
  economic_changes: EconomicChange[];
  relationship_changes: RelationshipChange[];
  coming_of_age: string[];
  changelog_path: string;
}

export interface DeathRecord {
  npc_id: string;
  name: string;
  age: number;
  cause: string;
}

export interface EconomicChange {
  npc_id: string;
  from: EconomicStatus;
  to: EconomicStatus;
}

export interface RelationshipChange {
  npc_ids: [string, string];
  type: "formed" | "dissolved";
  description: string;
}

// --- Occupation → Trait Map ---

const OCCUPATION_TRAIT_MAP: Record<string, string> = {
  blacksmith: "ambition",
  healer: "empathy",
  merchant: "ambition", // overridden to "greed" for selfish moral_grain
  guard: "courage",
  priest: "empathy",
  farmer: "loyalty",
  innkeeper: "trust",
  mage: "ambition",
  bard: "empathy",
  singer: "empathy",
};

// --- Helpers ---

function economicIndex(status: EconomicStatus): number {
  return ECONOMIC_STATUS_LADDER.indexOf(status);
}

function moveEconomicStatus(soul: Soul, direction: number): void {
  const currentIdx = economicIndex(soul.frontmatter.economic_status);
  const newIdx = Math.max(0, Math.min(ECONOMIC_STATUS_LADDER.length - 1, currentIdx + direction));
  soul.frontmatter.economic_status = ECONOMIC_STATUS_LADDER[newIdx];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function makeMemoryFilename(date: string, slug: string): string {
  return `${date}_${slug}.md`;
}

function writeSimpleMemory(
  npcId: string,
  date: string,
  subject: string,
  body: string,
  valence: "positive" | "neutral" | "negative",
  weight: number,
  baseDir: string,
): void {
  const slug = slugify(subject);
  const filename = makeMemoryFilename(date, slug);
  const frontmatter: MemoryFrontmatter = {
    date,
    type: "observation",
    subject,
    emotional_valence: valence,
    weight,
    source: "direct",
    faded: false,
    fade_date: null,
  };
  writeMemory(npcId, filename, frontmatter, body, baseDir);
}

/**
 * Find NPC IDs that are "close" to the given NPC.
 * Close means: shares a faction, or the NPC's relationship_status
 * references another NPC by name.
 */
function findCloseNpcs(
  soul: Soul,
  allSouls: Map<string, Soul>,
): string[] {
  const closeIds: string[] = [];
  for (const [otherId, otherSoul] of allSouls) {
    if (otherId === soul.frontmatter.id) continue;
    if (!otherSoul.frontmatter.alive) continue;

    // Same faction (non-null)
    if (
      soul.frontmatter.faction &&
      otherSoul.frontmatter.faction === soul.frontmatter.faction
    ) {
      closeIds.push(otherId);
      continue;
    }

    // Relationship reference: check if either NPC's relationship_status mentions the other
    const soulRelLower = soul.frontmatter.relationship_status.toLowerCase();
    const otherRelLower = otherSoul.frontmatter.relationship_status.toLowerCase();
    const soulNameLower = soul.frontmatter.name.toLowerCase();
    const otherNameLower = otherSoul.frontmatter.name.toLowerCase();

    if (
      soulRelLower.includes(otherNameLower) ||
      otherRelLower.includes(soulNameLower)
    ) {
      closeIds.push(otherId);
    }
  }
  return closeIds;
}

/**
 * Count shared core values between two souls.
 */
function sharedValues(a: Soul, b: Soul): number {
  const setB = new Set(b.core.values.map(v => v.toLowerCase()));
  return a.core.values.filter(v => setB.has(v.toLowerCase())).length;
}

// --- Main Export ---

export async function advanceWorld(
  input: WorldAdvanceInput,
  callbacks: WorldAdvanceCallbacks,
  baseDir: string = ".",
): Promise<WorldAdvanceResult> {
  const currentDate = parseDate(input.current_date);
  const newDate = addMonths(currentDate, input.months_elapsed);
  const newDateStr = formatDate(newDate);
  const newDateHuman = formatDateHuman(newDate);

  // Load all NPC IDs and sort alphabetically for determinism
  const npcIds = listNpcIds(baseDir).sort();

  // Load all living souls into a map for cross-referencing
  const allSouls = new Map<string, Soul>();
  for (const npcId of npcIds) {
    const soul = loadSoul(npcId, baseDir);
    allSouls.set(npcId, soul);
  }

  // Result accumulators
  const deaths: DeathRecord[] = [];
  const economicChanges: EconomicChange[] = [];
  const relationshipChanges: RelationshipChange[] = [];
  const comingOfAge: string[] = [];
  let npcsProcessed = 0;

  // Track which NPCs have been processed for relationship pairing
  // to avoid double-processing pairs
  const relationshipPairsChecked = new Set<string>();

  for (const npcId of npcIds) {
    const soul = allSouls.get(npcId)!;

    // Skip dead NPCs
    if (!soul.frontmatter.alive) continue;

    npcsProcessed++;

    // Record starting economic status for housing check
    const startingEconomicStatus = soul.frontmatter.economic_status;
    const startingEconomicIdx = economicIndex(startingEconomicStatus);

    // ---- Step 1: Aging ----
    const yearsElapsed = Math.floor(input.months_elapsed / 12);
    soul.frontmatter.age += yearsElapsed;
    soul.frontmatter.last_simulated = newDateStr;

    // ---- Step 2: Death Check ----
    let died = false;
    let deathCause = "";

    // Age-related death (60+)
    if (soul.frontmatter.age >= 60) {
      const baseDeathProb = (soul.frontmatter.age - 60) * 0.005;
      const totalProb = baseDeathProb * input.months_elapsed;
      if (Math.random() < totalProb) {
        died = true;
        deathCause = "natural causes";
      }
    }

    // Illness/accident (all ages)
    if (!died) {
      const accidentProb = 0.001 * input.months_elapsed;
      if (Math.random() < accidentProb) {
        died = true;
        deathCause = "illness or accident";
      }
    }

    if (died) {
      soul.frontmatter.alive = false;

      // Generate epitaph
      const epitaphPrompt =
        `Write a brief, one-sentence epitaph for ${soul.frontmatter.name}, ` +
        `a ${soul.frontmatter.age}-year-old ${soul.frontmatter.occupation} ` +
        `who died of ${deathCause}. They were known for: ${soul.core.values.join(", ")}. ` +
        `Backstory: ${soul.core.backstory.slice(0, 200)}. ` +
        `Keep it solemn and under 30 words.`;
      const epitaph = await callbacks.generateText(epitaphPrompt);

      // Record death
      deaths.push({
        npc_id: npcId,
        name: soul.frontmatter.name,
        age: soul.frontmatter.age,
        cause: deathCause,
      });

      // Append obituary
      appendObituary(
        `- ${soul.frontmatter.name}, ${soul.frontmatter.occupation}, died ${newDateStr}, age ${soul.frontmatter.age}. ${epitaph}`,
        baseDir,
      );

      // Write death memory to close NPCs
      const closeNpcs = findCloseNpcs(soul, allSouls);
      for (const closeId of closeNpcs) {
        writeSimpleMemory(
          closeId,
          newDateStr,
          `death of ${soul.frontmatter.name}`,
          `${soul.frontmatter.name}, the ${soul.frontmatter.occupation}, has died of ${deathCause} at the age of ${soul.frontmatter.age}.`,
          "negative",
          0.9,
          baseDir,
        );
      }

      // Save dead NPC and skip remaining steps
      writeSoul(soul, baseDir);
      await callbacks.driftSoul(npcId, input.current_date, newDateStr);
      continue;
    }

    // ---- Step 3: Economic Drift ----
    const econRolls = Math.floor(input.months_elapsed / 3);
    for (let i = 0; i < econRolls; i++) {
      const ambition = soul.lived.traits.ambition?.current ?? 0.5;
      const upProb = ambition * 0.3;
      const downProb = 0.1;
      const roll = Math.random();
      if (roll < upProb) {
        moveEconomicStatus(soul, 1);
      } else if (roll < upProb + downProb) {
        moveEconomicStatus(soul, -1);
      }
    }

    // Track economic change
    if (soul.frontmatter.economic_status !== startingEconomicStatus) {
      economicChanges.push({
        npc_id: npcId,
        from: startingEconomicStatus,
        to: soul.frontmatter.economic_status,
      });
    }

    // ---- Step 4: Housing Change ----
    const endingEconomicIdx = economicIndex(soul.frontmatter.economic_status);
    const econDrift = Math.abs(endingEconomicIdx - startingEconomicIdx);
    if (econDrift >= 2) {
      const direction = endingEconomicIdx > startingEconomicIdx ? "better" : "worse";
      soul.frontmatter.home = `A ${soul.frontmatter.economic_status} dwelling in town`;
      writeSimpleMemory(
        npcId,
        newDateStr,
        "housing change",
        `Moved to ${direction} housing after a change in fortune. Now living in a ${soul.frontmatter.economic_status} dwelling.`,
        direction === "better" ? "positive" : "negative",
        0.6,
        baseDir,
      );
    }

    // ---- Step 5: Relationship Formation/Dissolution ----
    const relationshipRolls = Math.floor(input.months_elapsed / 2);
    for (let i = 0; i < relationshipRolls; i++) {
      const isSingle =
        soul.frontmatter.relationship_status === "single" ||
        soul.frontmatter.relationship_status === "";

      if (isSingle) {
        // Check against other single, living NPCs for formation
        for (const [otherId, otherSoul] of allSouls) {
          if (otherId === npcId) continue;
          if (!otherSoul.frontmatter.alive) continue;
          const otherIsSingle =
            otherSoul.frontmatter.relationship_status === "single" ||
            otherSoul.frontmatter.relationship_status === "";
          if (!otherIsSingle) continue;

          // Avoid checking the same pair twice
          const pairKey = [npcId, otherId].sort().join("|");
          if (relationshipPairsChecked.has(pairKey)) continue;
          relationshipPairsChecked.add(pairKey);

          // Need 2+ shared core values
          const shared = sharedValues(soul, otherSoul);
          if (shared < 2) continue;

          // 5% chance per check per compatible pair
          if (Math.random() < 0.05) {
            soul.frontmatter.relationship_status = `partnered with ${otherSoul.frontmatter.name}`;
            otherSoul.frontmatter.relationship_status = `partnered with ${soul.frontmatter.name}`;

            const description = `${soul.frontmatter.name} and ${otherSoul.frontmatter.name} formed a relationship`;

            relationshipChanges.push({
              npc_ids: [npcId, otherId],
              type: "formed",
              description,
            });

            // Write memories for both
            writeSimpleMemory(
              npcId,
              newDateStr,
              `relationship with ${otherSoul.frontmatter.name}`,
              `Began a relationship with ${otherSoul.frontmatter.name}.`,
              "positive",
              0.8,
              baseDir,
            );
            writeSimpleMemory(
              otherId,
              newDateStr,
              `relationship with ${soul.frontmatter.name}`,
              `Began a relationship with ${soul.frontmatter.name}.`,
              "positive",
              0.8,
              baseDir,
            );

            // Only form one relationship per advance cycle
            break;
          }
        }
      } else {
        // Dissolution check: if partnered, look for economic divergence
        const partnerMatch = soul.frontmatter.relationship_status.match(
          /partnered with (.+)/i,
        );
        if (partnerMatch) {
          const partnerName = partnerMatch[1];
          // Find partner soul
          let partnerId: string | null = null;
          let partnerSoul: Soul | null = null;
          for (const [oid, os] of allSouls) {
            if (os.frontmatter.name === partnerName) {
              partnerId = oid;
              partnerSoul = os;
              break;
            }
          }

          if (partnerId && partnerSoul && partnerSoul.frontmatter.alive) {
            const myIdx = economicIndex(soul.frontmatter.economic_status);
            const partnerIdx = economicIndex(partnerSoul.frontmatter.economic_status);
            const divergence = Math.abs(myIdx - partnerIdx);

            // Higher chance of split if economic status diverged significantly
            if (divergence >= 2 && Math.random() < 0.1) {
              soul.frontmatter.relationship_status = "single";
              partnerSoul.frontmatter.relationship_status = "single";

              const description = `${soul.frontmatter.name} and ${partnerSoul.frontmatter.name} dissolved their relationship`;

              relationshipChanges.push({
                npc_ids: [npcId, partnerId],
                type: "dissolved",
                description,
              });

              writeSimpleMemory(
                npcId,
                newDateStr,
                `split with ${partnerSoul.frontmatter.name}`,
                `Ended the relationship with ${partnerSoul.frontmatter.name} after growing apart.`,
                "negative",
                0.7,
                baseDir,
              );
              writeSimpleMemory(
                partnerId,
                newDateStr,
                `split with ${soul.frontmatter.name}`,
                `Ended the relationship with ${soul.frontmatter.name} after growing apart.`,
                "negative",
                0.7,
                baseDir,
              );

              break;
            }
          }
        }
      }
    }

    // ---- Step 6: Child Aging -> Recruitment ----
    if (soul.frontmatter.age >= 18 && (soul.frontmatter.age - yearsElapsed) < 18) {
      soul.frontmatter.recruitable = true;
      comingOfAge.push(soul.frontmatter.name);
    }

    // ---- Step 7: Skill Growth ----
    const occupation = soul.frontmatter.occupation.toLowerCase();
    let traitToGrow = OCCUPATION_TRAIT_MAP[occupation] ?? null;

    // Override merchant trait for selfish moral grain
    if (occupation === "merchant" && soul.core.moral_grain === "selfish") {
      traitToGrow = "greed";
    }

    if (traitToGrow && soul.lived.traits[traitToGrow]) {
      const trait = soul.lived.traits[traitToGrow];
      const growthPerMonth = 0.01;
      const totalGrowth = growthPerMonth * input.months_elapsed;
      const cap = Math.min(trait.seed + 0.3, 1.0);
      trait.current = Math.min(cap, trait.current + totalGrowth);
    }

    // ---- Step 8: Save and Call Drift ----
    writeSoul(soul, baseDir);
    await callbacks.driftSoul(npcId, input.current_date, newDateStr);
  }

  // ---- After All NPCs ----
  await callbacks.advanceEnvironment(input.months_elapsed, newDateStr);

  // ---- Step 9: Write Changelog ----
  let changelog = `# World Changelog — ${newDateHuman}\n\n`;

  changelog += "## Deaths\n";
  if (deaths.length === 0) {
    changelog += "- None\n";
  } else {
    for (const d of deaths) {
      changelog += `- ${d.name}, ${allSouls.get(d.npc_id)?.frontmatter.occupation ?? "unknown"}, age ${d.age} — ${d.cause}\n`;
    }
  }

  changelog += "\n## Economic Changes\n";
  if (economicChanges.length === 0) {
    changelog += "- None\n";
  } else {
    for (const ec of economicChanges) {
      const name = allSouls.get(ec.npc_id)?.frontmatter.name ?? ec.npc_id;
      changelog += `- ${name}: ${ec.from} → ${ec.to}\n`;
    }
  }

  changelog += "\n## Relationships\n";
  if (relationshipChanges.length === 0) {
    changelog += "- None\n";
  } else {
    for (const rc of relationshipChanges) {
      const name1 = allSouls.get(rc.npc_ids[0])?.frontmatter.name ?? rc.npc_ids[0];
      const name2 = allSouls.get(rc.npc_ids[1])?.frontmatter.name ?? rc.npc_ids[1];
      changelog += `- ${name1} and ${name2}: ${rc.type}\n`;
    }
  }

  changelog += "\n## Coming of Age\n";
  if (comingOfAge.length === 0) {
    changelog += "- None\n";
  } else {
    for (const name of comingOfAge) {
      changelog += `- ${name} came of age this season.\n`;
    }
  }

  writeChangelog(newDateStr, changelog, baseDir);

  const changelogPath = `world/town/changelog_${newDateStr}.md`;

  return {
    new_date: newDateStr,
    npcs_processed: npcsProcessed,
    deaths,
    economic_changes: economicChanges,
    relationship_changes: relationshipChanges,
    coming_of_age: comingOfAge,
    changelog_path: changelogPath,
  };
}
