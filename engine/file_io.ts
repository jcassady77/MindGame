// ============================================================
// File I/O Utilities
// ============================================================
// Read/write soul files, memory files, and other markdown
// documents with YAML frontmatter.
// ============================================================

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, basename } from "node:path";
import type {
  Soul, SoulFrontmatter, SoulCore, SoulLived,
  Memory, MemoryFrontmatter,
  Reputation,
  TraitValue, Wound, Growth,
} from "./types.js";

const WORLD_ROOT = "world/town";
const NPC_ROOT = `${WORLD_ROOT}/npcs`;

// --- YAML-like Parsing (lightweight, no external deps) ---

/** Parse simple YAML frontmatter between --- fences. */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const yamlBlock = match[1];
  const body = match[2];
  const fm: Record<string, unknown> = {};
  for (const line of yamlBlock.split("\n")) {
    const kv = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let val: unknown = kv[2].trim();
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (val === "null") val = null;
      else if (/^-?\d+$/.test(val as string)) val = parseInt(val as string, 10);
      else if (/^-?\d+\.\d+$/.test(val as string)) val = parseFloat(val as string);
      else if ((val as string).startsWith('"') && (val as string).endsWith('"')) {
        val = (val as string).slice(1, -1);
      }
      fm[key] = val;
    }
  }
  return { frontmatter: fm, body };
}

/** Extract a YAML code block by its fence label (e.g. ```core or ```lived). */
function extractYamlBlock(content: string, label: string): string | null {
  const regex = new RegExp("```" + label + "\\n([\\s\\S]*?)```", "m");
  const match = content.match(regex);
  return match ? match[1] : null;
}

/** Parse a simple YAML block into nested objects. Handles maps, arrays, and scalars. */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Skip comments and blank lines
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    const topMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (!topMatch) { i++; continue; }

    const key = topMatch[1];
    const inlineVal = topMatch[2].trim();

    if (inlineVal === "" || inlineVal === "|") {
      // Could be a map, array, or multiline string
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== "" && !l.trim().startsWith("#"));
      if (nextNonEmpty && nextNonEmpty.trim().startsWith("- ")) {
        // Array
        const arr: unknown[] = [];
        i++;
        while (i < lines.length) {
          const arrLine = lines[i];
          if (!arrLine.trim() || arrLine.trim().startsWith("#")) { i++; continue; }
          if (!arrLine.match(/^\s+-/)) break;

          // Check if this is a map item (  - key: value\n    key: value)
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
            // Simple array item
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
            // Sub-map (e.g. trust: \n    seed: 0.7 \n    current: 0.5)
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

// --- Soul File I/O ---

/** Load an NPC soul file. */
export function loadSoul(npcId: string, baseDir: string = "."): Soul {
  const path = join(baseDir, NPC_ROOT, npcId, "soul.md");
  const content = readFileSync(path, "utf-8");
  return parseSoulContent(content);
}

/** Parse soul file content into a Soul object. */
export function parseSoulContent(content: string): Soul {
  const { frontmatter } = parseFrontmatter(content);

  const coreYaml = extractYamlBlock(content, "core");
  const livedYaml = extractYamlBlock(content, "lived");

  const coreParsed = coreYaml ? parseSimpleYaml(coreYaml) : {};
  const livedParsed = livedYaml ? parseSimpleYaml(livedYaml) : {};

  // Build traits map
  const rawTraits = (livedParsed.traits || {}) as Record<string, Record<string, number>>;
  const traits: Record<string, TraitValue> = {};
  for (const [name, val] of Object.entries(rawTraits)) {
    traits[name] = { seed: val.seed ?? 0.5, current: val.current ?? 0.5 };
  }

  const fm = frontmatter as Record<string, unknown>;
  return {
    frontmatter: {
      id: (fm.id as string) || "",
      name: (fm.name as string) || "",
      age: (fm.age as number) || 0,
      occupation: (fm.occupation as string) || "",
      home: (fm.home as string) || "",
      economic_status: (fm.economic_status as Soul["frontmatter"]["economic_status"]) || "modest",
      relationship_status: (fm.relationship_status as string) || "single",
      faction: (fm.faction as string | null) ?? null,
      alive: fm.alive !== false,
      last_simulated: (fm.last_simulated as string) || "0001-01-01",
      recruitable: (fm.recruitable as boolean) || undefined,
    },
    core: {
      temperament: (coreParsed.temperament as string) || "",
      values: (coreParsed.values as string[]) || [],
      moral_grain: (coreParsed.moral_grain as Soul["core"]["moral_grain"]) || "pragmatic",
      quirks: (coreParsed.quirks as string[]) || [],
      backstory: (coreParsed.backstory as string) || "",
    },
    lived: {
      traits,
      tendencies: (livedParsed.tendencies as string[]) || [],
      wounds: (livedParsed.wounds as Wound[]) || [],
      growth: (livedParsed.growth as Growth[]) || [],
      current_state: (livedParsed.current_state as string) || "",
    },
  };
}

/** Write a soul file back to disk. */
export function writeSoul(soul: Soul, baseDir: string = "."): void {
  const dir = join(baseDir, NPC_ROOT, soul.frontmatter.id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "soul.md");
  const content = serializeSoul(soul);
  writeFileSync(path, content, "utf-8");
}

/** Serialize a Soul object to markdown string. */
export function serializeSoul(soul: Soul): string {
  const fm = soul.frontmatter;
  let out = "---\n";
  out += `id: "${fm.id}"\n`;
  out += `name: "${fm.name}"\n`;
  out += `age: ${fm.age}\n`;
  out += `occupation: "${fm.occupation}"\n`;
  out += `home: "${fm.home}"\n`;
  out += `economic_status: ${fm.economic_status}\n`;
  out += `relationship_status: "${fm.relationship_status}"\n`;
  out += `faction: ${fm.faction ? `"${fm.faction}"` : "null"}\n`;
  out += `alive: ${fm.alive}\n`;
  out += `last_simulated: "${fm.last_simulated}"\n`;
  if (fm.recruitable) out += `recruitable: true\n`;
  out += "---\n\n";

  out += "## Core\n\n```core\n";
  out += `temperament: ${soul.core.temperament}\n`;
  out += "values:\n";
  for (const v of soul.core.values) out += `  - ${v}\n`;
  out += `moral_grain: ${soul.core.moral_grain}\n`;
  out += "quirks:\n";
  for (const q of soul.core.quirks) out += `  - "${q}"\n`;
  out += `backstory: |\n`;
  for (const line of soul.core.backstory.split("\n")) out += `  ${line}\n`;
  out += "```\n\n";

  out += "## Lived\n\n```lived\n";
  out += "traits:\n";
  for (const [name, val] of Object.entries(soul.lived.traits)) {
    out += `  ${name}:\n`;
    out += `    seed: ${val.seed}\n`;
    out += `    current: ${val.current}\n`;
  }
  out += "\ntendencies:\n";
  for (const t of soul.lived.tendencies) out += `  - "${t}"\n`;

  out += "\nwounds:\n";
  if (soul.lived.wounds.length === 0) {
    out = out.replace(/\nwounds:\n$/, "\nwounds: []\n");
  } else {
    for (const w of soul.lived.wounds) {
      out += `  - event_ref: "${w.event_ref}"\n`;
      out += `    trait_affected: ${w.trait_affected}\n`;
      out += `    drift_amount: ${w.drift_amount}\n`;
      out += `    since_date: "${w.since_date}"\n`;
    }
  }

  out += "\ngrowth:\n";
  if (soul.lived.growth.length === 0) {
    out = out.replace(/\ngrowth:\n$/, "\ngrowth: []\n");
  } else {
    for (const g of soul.lived.growth) {
      out += `  - event_ref: "${g.event_ref}"\n`;
      out += `    trait_affected: ${g.trait_affected}\n`;
      out += `    drift_amount: ${g.drift_amount}\n`;
      out += `    since_date: "${g.since_date}"\n`;
    }
  }

  out += `\ncurrent_state: |\n`;
  for (const line of soul.lived.current_state.split("\n")) out += `  ${line}\n`;
  out += "```\n";

  return out;
}

// --- Memory File I/O ---

/** Load all memories for an NPC. */
export function loadMemories(npcId: string, baseDir: string = "."): Memory[] {
  const dir = join(baseDir, NPC_ROOT, npcId, "memories");
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith(".md"));
  return files.map(f => {
    const content = readFileSync(join(dir, f), "utf-8");
    return parseMemoryContent(content, f);
  });
}

/** Load memories within a date range (inclusive). */
export function loadMemoriesInRange(
  npcId: string,
  sinceDate: string,
  currentDate: string,
  baseDir: string = ".",
): Memory[] {
  const all = loadMemories(npcId, baseDir);
  return all.filter(m => m.frontmatter.date >= sinceDate && m.frontmatter.date <= currentDate);
}

/** Parse memory file content. */
export function parseMemoryContent(content: string, filename: string): Memory {
  const { frontmatter, body } = parseFrontmatter(content);
  const fm = frontmatter as Record<string, unknown>;
  return {
    frontmatter: {
      date: (fm.date as string) || "",
      type: (fm.type as Memory["frontmatter"]["type"]) || "interaction",
      subject: (fm.subject as string) || "",
      emotional_valence: (fm.emotional_valence as Memory["frontmatter"]["emotional_valence"]) || "neutral",
      weight: (fm.weight as number) || 0.5,
      source: (fm.source as Memory["frontmatter"]["source"]) || "direct",
      faded: (fm.faded as boolean) || false,
      fade_date: (fm.fade_date as string | null) ?? null,
    },
    body: body.trim(),
    filename,
  };
}

/** Write a memory file for an NPC. */
export function writeMemory(
  npcId: string,
  filename: string,
  frontmatter: MemoryFrontmatter,
  body: string,
  baseDir: string = ".",
): string {
  const dir = join(baseDir, NPC_ROOT, npcId, "memories");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  let content = "---\n";
  content += `date: "${frontmatter.date}"\n`;
  content += `type: ${frontmatter.type}\n`;
  content += `subject: "${frontmatter.subject}"\n`;
  content += `emotional_valence: ${frontmatter.emotional_valence}\n`;
  content += `weight: ${frontmatter.weight}\n`;
  content += `source: ${frontmatter.source}\n`;
  content += `faded: ${frontmatter.faded}\n`;
  content += `fade_date: ${frontmatter.fade_date ? `"${frontmatter.fade_date}"` : "null"}\n`;
  content += "---\n\n";
  content += body + "\n";
  writeFileSync(path, content, "utf-8");
  return path;
}

// --- Reputation File I/O ---

/** Load reputation file for a specific NPC's view of the player. */
export function loadReputation(npcId: string, baseDir: string = "."): Reputation | null {
  const path = join(baseDir, NPC_ROOT, npcId, "reputation", "player.md");
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const fm = frontmatter as Record<string, unknown>;
  // Parse key_memories and score_breakdown from the body's YAML blocks or frontmatter
  return {
    npc_id: (fm.npc_id as string) || npcId,
    last_updated: (fm.last_updated as string) || "",
    opinion_score: (fm.opinion_score as number) || 0,
    disposition: (fm.disposition as Reputation["disposition"]) || "neutral",
    score_breakdown: {
      direct_memories: (fm.direct_memories as number) || 0,
      rumors_heard: (fm.rumors_heard as number) || 0,
      values_alignment: (fm.values_alignment as number) || 0,
      memory_modifier: (fm.memory_modifier as number) || 0,
    },
    internal_monologue: body.trim(),
    key_memories: [],
  };
}

/** Write reputation file. */
export function writeReputation(rep: Reputation, baseDir: string = "."): void {
  const dir = join(baseDir, NPC_ROOT, rep.npc_id, "reputation");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "player.md");
  let content = "---\n";
  content += `npc_id: "${rep.npc_id}"\n`;
  content += `last_updated: "${rep.last_updated}"\n`;
  content += `opinion_score: ${rep.opinion_score}\n`;
  content += `disposition: ${rep.disposition}\n`;
  content += `direct_memories: ${rep.score_breakdown.direct_memories}\n`;
  content += `rumors_heard: ${rep.score_breakdown.rumors_heard}\n`;
  content += `values_alignment: ${rep.score_breakdown.values_alignment}\n`;
  content += `memory_modifier: ${rep.score_breakdown.memory_modifier}\n`;
  content += "---\n\n";
  content += rep.internal_monologue + "\n\n";
  content += "## Key Memories\n\n";
  for (const km of rep.key_memories) {
    content += `- ${km.event_ref} (${km.valence}, weight: ${km.weight})\n`;
  }
  writeFileSync(path, content, "utf-8");
}

// --- Event Log ---

/** Append an entry to the event log. */
export function appendEventLog(entry: string, baseDir: string = "."): void {
  const path = join(baseDir, WORLD_ROOT, "event_log.md");
  const dir = join(baseDir, WORLD_ROOT);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, "# Event Log\n\n", "utf-8");
  }
  appendFileSync(path, entry + "\n", "utf-8");
}

/** Append to obituaries. */
export function appendObituary(entry: string, baseDir: string = "."): void {
  const path = join(baseDir, WORLD_ROOT, "obituaries.md");
  const dir = join(baseDir, WORLD_ROOT);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, "# Obituaries\n\n", "utf-8");
  }
  appendFileSync(path, entry + "\n", "utf-8");
}

/** Write a changelog file. */
export function writeChangelog(date: string, content: string, baseDir: string = "."): void {
  const path = join(baseDir, WORLD_ROOT, `changelog_${date}.md`);
  mkdirSync(join(baseDir, WORLD_ROOT), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

// --- Directory Listing ---

/** List all NPC IDs (folder names under npcs/). */
export function listNpcIds(baseDir: string = "."): string[] {
  const dir = join(baseDir, NPC_ROOT);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

/** Check if an NPC exists. */
export function npcExists(npcId: string, baseDir: string = "."): boolean {
  return existsSync(join(baseDir, NPC_ROOT, npcId, "soul.md"));
}
