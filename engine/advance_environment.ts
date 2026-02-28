// ============================================================
// Environment Advance Engine
// ============================================================
// Simulates the passage of time for the town environment.
// Handles gradual drift (population, prosperity, buildings),
// catastrophic events, recovery arcs, and current_state updates.
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  TownSoul, TownCore, TownLived, TownInfrastructure,
  Wound, Growth,
} from "./types.js";
import { writeMemory, listNpcIds, loadSoul } from "./file_io.js";
import { parseDate, formatDate, addMonths } from "./calendar.js";

// --- Constants ---

const TOWN_ROOT = "world/town/environment";
const TOWN_FILE = "town.md";
const MEMORIES_DIR = "memories";

// --- Result Type ---

export interface EnvironmentAdvanceResult {
  gradual_events: string[];
  catastrophic_event: string | null;
  population_change: number;
  prosperity_change: number;
  memories_written: string[];
  recovery_updated: boolean;
}

// --- Town Soul I/O ---

/** Parse a simple YAML block into a record. Handles scalars, arrays, nested maps, and multiline strings. */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    const topMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (!topMatch) { i++; continue; }

    const key = topMatch[1];
    const inlineVal = topMatch[2].trim();

    if (inlineVal === "" || inlineVal === "|") {
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== "" && !l.trim().startsWith("#"));
      if (nextNonEmpty && nextNonEmpty.trim().startsWith("- ")) {
        // Array
        const arr: unknown[] = [];
        i++;
        while (i < lines.length) {
          const arrLine = lines[i];
          if (!arrLine.trim() || arrLine.trim().startsWith("#")) { i++; continue; }
          if (!arrLine.match(/^\s+-/)) break;

          const mapItemMatch = arrLine.match(/^\s+-\s+(\w[\w_]*)\s*:\s*(.*)$/);
          if (mapItemMatch) {
            const obj: Record<string, unknown> = {};
            obj[mapItemMatch[1]] = parseScalar(mapItemMatch[2].trim());
            i++;
            while (i < lines.length) {
              const subLine = lines[i];
              if (!subLine.trim() || subLine.trim().startsWith("#")) { i++; continue; }
              const subMatch = subLine.match(/^\s{4,}(\w[\w_]*)\s*:\s*(.*)$/);
              if (!subMatch) break;
              obj[subMatch[1]] = parseScalar(subMatch[2].trim());
              i++;
            }
            arr.push(obj);
          } else {
            const itemMatch = arrLine.match(/^\s+-\s*"?(.*?)"?\s*$/);
            if (itemMatch) arr.push(itemMatch[1]);
            i++;
          }
        }
        result[key] = arr;
      } else if (nextNonEmpty && nextNonEmpty.match(/^\s+\w[\w_]*\s*:/)) {
        // Nested map
        const map: Record<string, unknown> = {};
        i++;
        while (i < lines.length) {
          const mapLine = lines[i];
          if (!mapLine.trim() || mapLine.trim().startsWith("#")) { i++; continue; }
          if (!mapLine.match(/^\s+/)) break;

          const mapKeyMatch = mapLine.match(/^\s+(\w[\w_]*)\s*:\s*(.*)$/);
          if (!mapKeyMatch) { i++; continue; }

          const mapKey = mapKeyMatch[1];
          const mapInline = mapKeyMatch[2].trim();

          if (mapInline === "") {
            const subMap: Record<string, unknown> = {};
            i++;
            while (i < lines.length) {
              const subLine = lines[i];
              if (!subLine.trim() || subLine.trim().startsWith("#")) { i++; continue; }
              const subMatch = subLine.match(/^\s{4,}(\w[\w_]*)\s*:\s*(.*)$/);
              if (!subMatch) break;
              subMap[subMatch[1]] = parseScalar(subMatch[2].trim());
              i++;
            }
            map[mapKey] = subMap;
          } else if (mapInline === "[]") {
            map[mapKey] = [];
            i++;
          } else if (mapInline.startsWith("- ")) {
            // Inline start of array under nested map
            const subArr: unknown[] = [];
            const firstItem = mapInline.match(/^-\s*"?(.*?)"?\s*$/);
            if (firstItem) subArr.push(firstItem[1]);
            i++;
            while (i < lines.length) {
              const subLine = lines[i];
              if (!subLine.trim() || subLine.trim().startsWith("#")) { i++; continue; }
              const subArrMatch = subLine.match(/^\s{4,}-\s*"?(.*?)"?\s*$/);
              if (!subArrMatch) break;
              subArr.push(subArrMatch[1]);
              i++;
            }
            map[mapKey] = subArr;
          } else {
            map[mapKey] = parseScalar(mapInline);
            i++;
          }
        }
        result[key] = map;
      } else if (inlineVal === "|") {
        // Multiline string
        let str = "";
        i++;
        while (i < lines.length) {
          const subLine = lines[i];
          if (subLine.match(/^\S/) && subLine.match(/^\w[\w_]*\s*:/)) break;
          str += subLine.replace(/^\s{2}/, "") + "\n";
          i++;
        }
        result[key] = str.trimEnd();
      } else {
        result[key] = inlineVal;
        i++;
      }
    } else if (inlineVal === "[]") {
      result[key] = [];
      i++;
    } else {
      result[key] = parseScalar(inlineVal);
      i++;
    }
  }
  return result;
}

function parseScalar(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  if (val === "null" || val === "~") return null;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^[+-]?\d+\.\d+$/.test(val)) return parseFloat(val);
  if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
  if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1);
  return val;
}

/** Extract a YAML code block by its fence label (e.g. ```core or ```lived). */
function extractYamlBlock(content: string, label: string): string | null {
  const regex = new RegExp("```" + label + "\\n([\\s\\S]*?)```", "m");
  const match = content.match(regex);
  return match ? match[1] : null;
}

/** Load the town soul from disk. */
export function loadTownSoul(baseDir: string = "."): TownSoul {
  const path = join(baseDir, TOWN_ROOT, TOWN_FILE);
  const content = readFileSync(path, "utf-8");
  return parseTownSoulContent(content);
}

/** Parse town.md content into a TownSoul object. */
function parseTownSoulContent(content: string): TownSoul {
  const coreYaml = extractYamlBlock(content, "core");
  const livedYaml = extractYamlBlock(content, "lived");

  const coreParsed = coreYaml ? parseSimpleYaml(coreYaml) : {};
  const livedParsed = livedYaml ? parseSimpleYaml(livedYaml) : {};

  // Build infrastructure
  const rawInfra = (livedParsed.infrastructure || {}) as Record<string, unknown>;
  const infrastructure: TownInfrastructure = {
    condition: (rawInfra.condition as TownInfrastructure["condition"]) || "stable",
    notable_buildings: (rawInfra.notable_buildings as string[]) || [],
    recent_construction: (rawInfra.recent_construction as string[]) || [],
  };

  return {
    core: {
      archetype: (coreParsed.archetype as string) || "",
      founding_story: (coreParsed.founding_story as string) || "",
      character: (coreParsed.character as string) || "",
      geographic_traits: (coreParsed.geographic_traits as string[]) || [],
      cultural_values: (coreParsed.cultural_values as string[]) || [],
    },
    lived: {
      population: (livedParsed.population as number) || 0,
      prosperity: (livedParsed.prosperity as number) || 0.5,
      infrastructure,
      social_atmosphere: (livedParsed.social_atmosphere as number) || 0.5,
      safety: (livedParsed.safety as number) || 0.5,
      current_state: (livedParsed.current_state as string) || "",
      wounds: (livedParsed.wounds as Wound[]) || [],
      growth: (livedParsed.growth as Growth[]) || [],
    },
  };
}

/** Serialize and save a TownSoul back to disk. */
export function saveTownSoul(town: TownSoul, baseDir: string = "."): void {
  const dir = join(baseDir, TOWN_ROOT);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, TOWN_FILE);
  const content = serializeTownSoul(town);
  writeFileSync(path, content, "utf-8");
}

/** Serialize a TownSoul to markdown string. */
function serializeTownSoul(town: TownSoul): string {
  let out = "## Core\n\n```core\n";

  out += `archetype: "${town.core.archetype}"\n`;
  out += `founding_story: |\n`;
  for (const line of town.core.founding_story.split("\n")) out += `  ${line}\n`;
  out += `character: "${town.core.character}"\n`;
  out += "geographic_traits:\n";
  for (const t of town.core.geographic_traits) out += `  - "${t}"\n`;
  out += "cultural_values:\n";
  for (const v of town.core.cultural_values) out += `  - "${v}"\n`;
  out += "```\n\n";

  out += "## Lived\n\n```lived\n";
  out += `population: ${town.lived.population}\n`;
  out += `prosperity: ${round(town.lived.prosperity, 2)}\n`;
  out += "infrastructure:\n";
  out += `  condition: ${town.lived.infrastructure.condition}\n`;
  out += "  notable_buildings:\n";
  for (const b of town.lived.infrastructure.notable_buildings) out += `    - "${b}"\n`;
  if (town.lived.infrastructure.recent_construction.length === 0) {
    out += "  recent_construction: []\n";
  } else {
    out += "  recent_construction:\n";
    for (const c of town.lived.infrastructure.recent_construction) out += `    - "${c}"\n`;
  }
  out += `social_atmosphere: ${round(town.lived.social_atmosphere, 2)}\n`;
  out += `safety: ${round(town.lived.safety, 2)}\n`;
  out += `current_state: |\n`;
  for (const line of town.lived.current_state.split("\n")) out += `  ${line}\n`;

  if (town.lived.wounds.length === 0) {
    out += "wounds: []\n";
  } else {
    out += "wounds:\n";
    for (const w of town.lived.wounds) {
      out += `  - event_ref: "${w.event_ref}"\n`;
      out += `    trait_affected: ${w.trait_affected}\n`;
      out += `    drift_amount: ${w.drift_amount}\n`;
      out += `    since_date: "${w.since_date}"\n`;
    }
  }

  if (town.lived.growth.length === 0) {
    out += "growth: []\n";
  } else {
    out += "growth:\n";
    for (const g of town.lived.growth) {
      out += `  - event_ref: "${g.event_ref}"\n`;
      out += `    trait_affected: ${g.trait_affected}\n`;
      out += `    drift_amount: ${g.drift_amount}\n`;
      out += `    since_date: "${g.since_date}"\n`;
    }
  }

  out += "```\n";
  return out;
}

// --- Utility Helpers ---

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// --- Catastrophic Event Definitions ---

interface CatastrophicEventDef {
  name: string;
  slug: string;
  baseProbability: number;
  conditionMultiplier?: (town: TownSoul) => number;
  condition?: (town: TownSoul) => boolean;
  apply: (town: TownSoul, date: string) => CatastrophicEffect;
}

interface CatastrophicEffect {
  description: string;
  populationLoss: number;
  prosperityChange: number;
  safetyChange: number;
  socialAtmosphereChange: number;
  buildingsDestroyed: string[];
  infrastructureCondition?: TownInfrastructure["condition"];
  woundTraitAffected: string;
  woundDriftAmount: number;
  memoryBody: string;
}

const CATASTROPHIC_EVENTS: CatastrophicEventDef[] = [
  {
    name: "Plague",
    slug: "plague",
    baseProbability: 0.005,
    apply: (town, _date) => {
      const deathRate = 0.2 + Math.random() * 0.4; // 20-60%
      const deaths = Math.round(town.lived.population * deathRate);
      return {
        description: `A virulent plague swept through Hearthfield, claiming ${deaths} lives.`,
        populationLoss: deaths,
        prosperityChange: -0.2,
        safetyChange: -0.1,
        socialAtmosphereChange: -0.55,
        buildingsDestroyed: [],
        woundTraitAffected: "population",
        woundDriftAmount: -deathRate,
        memoryBody:
          `The sickness came without warning. It started with the children, ` +
          `then spread to the workers and the elderly. The healers did what ` +
          `they could, but ${deaths} souls were lost before it passed. ` +
          `The town has not seen suffering like this in living memory.`,
      };
    },
  },
  {
    name: "Invasion",
    slug: "invasion",
    baseProbability: 0.01,
    conditionMultiplier: (town) => town.lived.safety < 0.5 ? 3.0 : 1.0,
    apply: (town, _date) => {
      const deathRate = 0.05 + Math.random() * 0.25; // 5-30%
      const deaths = Math.round(town.lived.population * deathRate);
      const buildings = town.lived.infrastructure.notable_buildings;
      const destroyCount = Math.min(randomInt(1, 3), buildings.length);
      const destroyed: string[] = [];
      const available = [...buildings];
      for (let j = 0; j < destroyCount; j++) {
        const idx = randomInt(0, available.length - 1);
        destroyed.push(available.splice(idx, 1)[0]);
      }
      return {
        description: `Raiders attacked Hearthfield. ${deaths} were killed and ${destroyCount} building(s) destroyed.`,
        populationLoss: deaths,
        prosperityChange: -0.15,
        safetyChange: -0.3,
        socialAtmosphereChange: -0.2,
        buildingsDestroyed: destroyed,
        woundTraitAffected: "safety",
        woundDriftAmount: -0.3,
        memoryBody:
          `They came at dawn with torches and blades. The guard did what ` +
          `they could, but the raiders overwhelmed the barricades. ` +
          `${deaths} people died defending the town. ` +
          `${destroyed.join(", ")} ${destroyed.length === 1 ? "was" : "were"} ` +
          `burned or torn down. The survivors are shaken but resolute.`,
      };
    },
  },
  {
    name: "Fire",
    slug: "fire",
    baseProbability: 0.008,
    apply: (town, _date) => {
      const buildings = town.lived.infrastructure.notable_buildings;
      const destroyCount = Math.min(randomInt(1, 2), buildings.length);
      const destroyed: string[] = [];
      const available = [...buildings];
      for (let j = 0; j < destroyCount; j++) {
        const idx = randomInt(0, available.length - 1);
        destroyed.push(available.splice(idx, 1)[0]);
      }
      return {
        description: `A fire broke out in Hearthfield, destroying ${destroyed.join(" and ")}.`,
        populationLoss: randomInt(0, 5),
        prosperityChange: -0.15,
        safetyChange: -0.05,
        socialAtmosphereChange: -0.1,
        buildingsDestroyed: destroyed,
        woundTraitAffected: "prosperity",
        woundDriftAmount: -0.15,
        memoryBody:
          `The fire started in the night and spread faster than anyone ` +
          `could react. By morning, ${destroyed.join(" and ")} ` +
          `${destroyed.length === 1 ? "was" : "were"} nothing but ash and char. ` +
          `The bucket brigades saved what they could, but the loss hangs ` +
          `heavy over the town.`,
      };
    },
  },
  {
    name: "Flood",
    slug: "flood",
    baseProbability: 0.012,
    conditionMultiplier: (town) => {
      const hasRiver = town.core.geographic_traits.some(t =>
        t.toLowerCase().includes("river"),
      );
      return hasRiver ? (0.025 / 0.012) : 1.0;
    },
    apply: (town, _date) => {
      return {
        description: `The Ash River flooded its banks, damaging Hearthfield's infrastructure.`,
        populationLoss: randomInt(2, 15),
        prosperityChange: -0.12,
        safetyChange: -0.1,
        socialAtmosphereChange: -0.15,
        buildingsDestroyed: [],
        infrastructureCondition: "damaged",
        woundTraitAffected: "infrastructure",
        woundDriftAmount: -0.2,
        memoryBody:
          `The river swelled after weeks of rain and broke its banks in the ` +
          `night. Water rushed through the lower quarter, flooding homes ` +
          `and fields alike. The granary stores were soaked, the roads turned ` +
          `to mud, and several families lost everything. It will take months ` +
          `to rebuild.`,
      };
    },
  },
  {
    name: "Famine",
    slug: "famine",
    baseProbability: 0.007,
    condition: (town) => town.lived.prosperity < 0.3,
    apply: (town, _date) => {
      const deathRate = 0.05 + Math.random() * 0.15; // 5-20%
      const deaths = Math.round(town.lived.population * deathRate);
      return {
        description: `Famine struck Hearthfield. ${deaths} people died of starvation or illness.`,
        populationLoss: deaths,
        prosperityChange: -0.1,
        safetyChange: -0.05,
        socialAtmosphereChange: -0.3,
        buildingsDestroyed: [],
        woundTraitAffected: "prosperity",
        woundDriftAmount: -0.15,
        memoryBody:
          `The stores ran out before midwinter. Families rationed what they ` +
          `had, but it was not enough. The weakest went first — the very ` +
          `old, the very young. ${deaths} people were buried before the ` +
          `thaw. The town is gaunt and hollow-eyed, held together by ` +
          `stubbornness more than hope.`,
      };
    },
  },
];

// --- Gradual Drift Logic ---

interface GradualDriftResult {
  events: string[];
  populationChange: number;
  prosperityChange: number;
}

function applyGradualDrift(
  town: TownSoul,
  monthsElapsed: number,
): GradualDriftResult {
  const events: string[] = [];
  let totalPopChange = 0;
  let totalProsperityChange = 0;

  // Process each 3-month interval
  const intervals = Math.floor(monthsElapsed / 3);
  for (let i = 0; i < intervals; i++) {
    // Prosperity drift: +/-0.03 per 3 months, slight bias toward current trajectory
    const prosperityDirection = town.lived.prosperity > 0.5 ? 0.55 : 0.45;
    const drift = Math.random() < prosperityDirection ? 0.03 : -0.03;
    town.lived.prosperity = clamp(town.lived.prosperity + drift, 0.0, 1.0);
    totalProsperityChange += drift;

    if (drift > 0) {
      events.push(`Town prosperity drifted upward slightly (+${drift.toFixed(2)}).`);
    } else {
      events.push(`Town prosperity drifted downward slightly (${drift.toFixed(2)}).`);
    }
  }

  // Population growth/decline per 6-month interval
  const sixMonthIntervals = Math.floor(monthsElapsed / 6);
  for (let i = 0; i < sixMonthIntervals; i++) {
    if (town.lived.prosperity > 0.5) {
      const growth = randomInt(2, 8);
      town.lived.population += growth;
      totalPopChange += growth;
      events.push(`Population grew by ${growth} (prosperity is ${round(town.lived.prosperity, 2)}).`);
    } else if (town.lived.prosperity < 0.35) {
      const loss = randomInt(1, 5);
      town.lived.population = Math.max(1, town.lived.population - loss);
      totalPopChange -= loss;
      events.push(`Population declined by ${loss} (prosperity is ${round(town.lived.prosperity, 2)}).`);
    }
  }

  // New building if prosperity > 0.6 and 12+ months elapsed
  if (town.lived.prosperity > 0.6 && monthsElapsed >= 12) {
    const newBuildings = [
      "New Homesteads (east expansion)",
      "Weaver's Workshop",
      "Tanner's Shed",
      "Apothecary Annex",
      "Watchtower (south road)",
      "Millhouse (Ash River)",
      "Schoolhouse",
      "Stonecutter's Yard",
      "Farrier's Stable",
      "Brewery (west quarter)",
    ];
    // Pick one that isn't already present
    const existing = new Set(town.lived.infrastructure.notable_buildings);
    const candidates = newBuildings.filter(b => !existing.has(b));
    if (candidates.length > 0) {
      const chosen = candidates[randomInt(0, candidates.length - 1)];
      town.lived.infrastructure.notable_buildings.push(chosen);
      town.lived.infrastructure.recent_construction.push(chosen);
      events.push(`New construction completed: ${chosen}.`);
    }
  }

  return {
    events,
    populationChange: totalPopChange,
    prosperityChange: totalProsperityChange,
  };
}

// --- Recovery Arc Processing ---

/** Minimum months before a wound begins to recover. */
const RECOVERY_DELAY_MONTHS = 6;
/** Months of gradual recovery after the delay. */
const RECOVERY_DURATION_MONTHS = 12;

function processRecoveryArcs(
  town: TownSoul,
  currentDate: string,
): boolean {
  let anyUpdated = false;
  const current = parseDate(currentDate);
  const remainingWounds: Wound[] = [];

  for (const wound of town.lived.wounds) {
    const woundDate = parseDate(wound.since_date);
    const totalElapsed =
      (current.year - woundDate.year) * 12 + (current.month - woundDate.month);

    if (totalElapsed < RECOVERY_DELAY_MONTHS) {
      // Too early to recover
      remainingWounds.push(wound);
      continue;
    }

    const recoveryMonths = totalElapsed - RECOVERY_DELAY_MONTHS;
    if (recoveryMonths >= RECOVERY_DURATION_MONTHS) {
      // Fully recovered — remove wound, restore values
      const recoveryAmount = Math.abs(wound.drift_amount);

      if (wound.trait_affected === "population") {
        // Population recovery is handled by gradual growth, not direct restoration
      } else if (wound.trait_affected === "prosperity") {
        town.lived.prosperity = clamp(town.lived.prosperity + recoveryAmount * 0.5, 0.0, 1.0);
      } else if (wound.trait_affected === "safety") {
        town.lived.safety = clamp(town.lived.safety + recoveryAmount * 0.5, 0.0, 1.0);
      } else if (wound.trait_affected === "infrastructure") {
        town.lived.infrastructure.condition = "stable";
      }

      // Add a growth entry documenting the recovery
      town.lived.growth.push({
        event_ref: wound.event_ref,
        trait_affected: wound.trait_affected,
        drift_amount: recoveryAmount * 0.5,
        since_date: currentDate,
      });

      anyUpdated = true;
      // Do NOT push to remainingWounds — wound is removed
    } else {
      // Partial recovery — apply incremental restoration
      const recoveryFraction = recoveryMonths / RECOVERY_DURATION_MONTHS;
      const incrementalRecovery = Math.abs(wound.drift_amount) * 0.02;

      if (wound.trait_affected === "prosperity") {
        town.lived.prosperity = clamp(
          town.lived.prosperity + incrementalRecovery,
          0.0,
          1.0,
        );
      } else if (wound.trait_affected === "safety") {
        town.lived.safety = clamp(
          town.lived.safety + incrementalRecovery,
          0.0,
          1.0,
        );
      } else if (
        wound.trait_affected === "infrastructure" &&
        recoveryFraction > 0.5 &&
        town.lived.infrastructure.condition === "damaged"
      ) {
        town.lived.infrastructure.condition = "declining";
      }

      town.lived.social_atmosphere = clamp(
        town.lived.social_atmosphere + 0.01,
        0.0,
        1.0,
      );

      anyUpdated = true;
      remainingWounds.push(wound);
    }
  }

  town.lived.wounds = remainingWounds;
  return anyUpdated;
}

// --- Write Catastrophic Memory to NPCs ---

function writeCatastrophicMemoryToNpcs(
  eventSlug: string,
  date: string,
  description: string,
  memoryBody: string,
  baseDir: string,
): string[] {
  const npcIds = listNpcIds(baseDir);
  const memoriesWritten: string[] = [];
  const filename = `${date}_${eventSlug}.md`;

  for (const npcId of npcIds) {
    try {
      const soul = loadSoul(npcId, baseDir);
      if (!soul.frontmatter.alive) continue;

      const path = writeMemory(
        npcId,
        filename,
        {
          date,
          type: "observation",
          subject: "town",
          emotional_valence: "negative",
          weight: 0.85,
          source: "direct",
          faded: false,
          fade_date: null,
        },
        memoryBody,
        baseDir,
      );
      memoriesWritten.push(path);
    } catch {
      // Skip NPCs that fail to load (e.g. corrupted soul files)
    }
  }

  return memoriesWritten;
}

// --- Write Town Memory ---

function writeTownMemory(
  eventSlug: string,
  date: string,
  memoryBody: string,
  baseDir: string,
): string {
  const dir = join(baseDir, TOWN_ROOT, MEMORIES_DIR);
  mkdirSync(dir, { recursive: true });
  const filename = `${date}_${eventSlug}.md`;
  const path = join(dir, filename);

  let content = "---\n";
  content += `date: "${date}"\n`;
  content += `type: observation\n`;
  content += `subject: "town"\n`;
  content += `emotional_valence: negative\n`;
  content += `weight: 0.85\n`;
  content += `source: direct\n`;
  content += `faded: false\n`;
  content += `fade_date: null\n`;
  content += "---\n\n";
  content += memoryBody + "\n";

  writeFileSync(path, content, "utf-8");
  return path;
}

// --- Main Export ---

export async function advanceEnvironment(
  monthsElapsed: number,
  currentDate: string,
  generateNarrative: (prompt: string) => Promise<string>,
  baseDir: string = ".",
): Promise<EnvironmentAdvanceResult> {
  // 1. Load town soul
  const town = loadTownSoul(baseDir);

  const result: EnvironmentAdvanceResult = {
    gradual_events: [],
    catastrophic_event: null,
    population_change: 0,
    prosperity_change: 0,
    memories_written: [],
    recovery_updated: false,
  };

  const startingPop = town.lived.population;
  const startingProsperity = town.lived.prosperity;

  // 2. Apply gradual drift
  const drift = applyGradualDrift(town, monthsElapsed);
  result.gradual_events = drift.events;

  // 3. Roll for catastrophic events (once per advance step, at most one)
  let catastrophicOccurred = false;

  for (const eventDef of CATASTROPHIC_EVENTS) {
    if (catastrophicOccurred) break;

    // Check condition gate
    if (eventDef.condition && !eventDef.condition(town)) continue;

    // Calculate effective probability
    let probability = eventDef.baseProbability;
    if (eventDef.conditionMultiplier) {
      probability *= eventDef.conditionMultiplier(town);
    }

    // Roll
    if (Math.random() < probability) {
      catastrophicOccurred = true;
      const effect = eventDef.apply(town, currentDate);
      result.catastrophic_event = effect.description;

      // Apply effects to town
      town.lived.population = Math.max(
        1,
        town.lived.population - effect.populationLoss,
      );
      town.lived.prosperity = clamp(
        town.lived.prosperity + effect.prosperityChange,
        0.0,
        1.0,
      );
      town.lived.safety = clamp(
        town.lived.safety + effect.safetyChange,
        0.0,
        1.0,
      );
      town.lived.social_atmosphere = clamp(
        town.lived.social_atmosphere + effect.socialAtmosphereChange,
        0.0,
        1.0,
      );

      // Remove destroyed buildings
      if (effect.buildingsDestroyed.length > 0) {
        const destroyedSet = new Set(effect.buildingsDestroyed);
        town.lived.infrastructure.notable_buildings =
          town.lived.infrastructure.notable_buildings.filter(
            b => !destroyedSet.has(b),
          );
      }

      // Update infrastructure condition if specified
      if (effect.infrastructureCondition) {
        town.lived.infrastructure.condition = effect.infrastructureCondition;
      }

      // Write wound
      const eventRef = `${currentDate}_${eventDef.slug}.md`;
      town.lived.wounds.push({
        event_ref: eventRef,
        trait_affected: effect.woundTraitAffected,
        drift_amount: effect.woundDriftAmount,
        since_date: currentDate,
      });

      // Write town memory
      const townMemPath = writeTownMemory(
        eventDef.slug,
        currentDate,
        effect.memoryBody,
        baseDir,
      );
      result.memories_written.push(townMemPath);

      // Write memory to all living NPCs
      const npcMemories = writeCatastrophicMemoryToNpcs(
        eventDef.slug,
        currentDate,
        effect.description,
        effect.memoryBody,
        baseDir,
      );
      result.memories_written.push(...npcMemories);
    }
  }

  // 4. Process recovery arcs
  result.recovery_updated = processRecoveryArcs(town, currentDate);

  // 5. Calculate total changes
  result.population_change = town.lived.population - startingPop;
  result.prosperity_change = round(town.lived.prosperity - startingProsperity, 2);

  // 6. Generate current_state via LLM
  const recentEvents = [
    ...result.gradual_events.slice(-3),
    ...(result.catastrophic_event ? [result.catastrophic_event] : []),
  ];

  const activeRecoveries = town.lived.wounds
    .map(w => `Recovering from ${w.trait_affected} wound (${w.event_ref})`)
    .join(", ");

  const prompt =
    `You are describing the current condition of a town.\n\n` +
    `Town type: ${town.core.archetype}\n` +
    `Town character: ${town.core.character}\n` +
    `Current: infrastructure ${town.lived.infrastructure.condition}, ` +
    `prosperity ${round(town.lived.prosperity, 2)}, ` +
    `social atmosphere ${round(town.lived.social_atmosphere, 2)}, ` +
    `safety ${round(town.lived.safety, 2)}\n` +
    `Population: ${town.lived.population}\n` +
    `Recent events: ${recentEvents.length > 0 ? recentEvents.join("; ") : "none"}\n` +
    `Active recovery: ${activeRecoveries || "none"}\n\n` +
    `Write 2-3 sentences describing what the town feels like right now.\n` +
    `Write as what a returning traveler would notice first — sensory, specific, honest.`;

  try {
    town.lived.current_state = await generateNarrative(prompt);
  } catch {
    // If LLM call fails, keep the existing current_state
  }

  // 7. Save updated town soul
  saveTownSoul(town, baseDir);

  return result;
}
