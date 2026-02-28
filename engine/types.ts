// ============================================================
// MindGame — Shared Type Definitions
// ============================================================
// All engine modules import types from this file.
// ============================================================

// --- Soul Types ---

export type EconomicStatus = "destitute" | "poor" | "modest" | "comfortable" | "wealthy";
export type MoralGrain = "selfless" | "pragmatic" | "selfish" | "ruthless";

export interface TraitValue {
  seed: number;    // original value (0.0–1.0), never changes
  current: number; // present value after drift (0.0–1.0)
}

export interface Wound {
  event_ref: string;      // memory filename: <YYYY-MM-DD>_<slug>.md
  trait_affected: string;
  drift_amount: number;   // negative for worsening
  since_date: string;     // YYYY-MM-DD
}

export interface Growth {
  event_ref: string;
  trait_affected: string;
  drift_amount: number;   // positive for improvement
  since_date: string;
}

export interface SoulFrontmatter {
  id: string;
  name: string;
  age: number;
  occupation: string;
  home: string;
  economic_status: EconomicStatus;
  relationship_status: string;
  faction: string | null;
  alive: boolean;
  last_simulated: string;
  recruitable?: boolean;
}

export interface SoulCore {
  temperament: string;
  values: string[];
  moral_grain: MoralGrain;
  quirks: string[];
  backstory: string;
}

export interface SoulLived {
  traits: Record<string, TraitValue>;
  tendencies: string[];
  wounds: Wound[];
  growth: Growth[];
  current_state: string;
}

export interface Soul {
  frontmatter: SoulFrontmatter;
  core: SoulCore;
  lived: SoulLived;
}

// --- Memory Types ---

export type MemoryType = "interaction" | "observation" | "rumor" | "secondhand";
export type EmotionalValence = "positive" | "neutral" | "negative";
export type MemorySource = "direct" | "rumor";

export interface MemoryFrontmatter {
  date: string;
  type: MemoryType;
  subject: string;
  emotional_valence: EmotionalValence;
  weight: number;
  source: MemorySource;
  faded: boolean;
  fade_date: string | null;
}

export interface Memory {
  frontmatter: MemoryFrontmatter;
  body: string;
  filename: string;
}

// --- Quest Outcome Types ---

export type QuestOutcomeStatus = "success" | "partial" | "failure" | "abandoned";

export interface PlayerAction {
  type: string;
  description: string;
  moral_weight: number;        // -1.0 to +1.0
  target_npc_id: string | null;
  location: string;
  in_world_date: string;
  witnesses: string[];
  known_to_town: boolean;
}

export interface MoralChoice {
  choice_id: string;
  description: string;
  options_available: string[];
  choice_made: string;
  moral_weight: number;
  affected_npcs: string[];
  known_to_town: boolean;
}

export interface NpcInteraction {
  npc_id: string;
  type: "helped" | "wronged" | "deceived" | "recruited" | "abandoned" | "killed" | "befriended";
  description: string;
  moral_weight: number;
  in_world_date: string;
  memory_worthy: boolean;
}

export interface QuestOutcome {
  quest_id: string;
  quest_name: string;
  duration_months: number;
  start_date: string;
  end_date: string;
  outcome: QuestOutcomeStatus;
  player_actions: PlayerAction[];
  moral_choices: MoralChoice[];
  npc_interactions: NpcInteraction[];
  witnesses: string[];
  party_members: string[];
  summary: string;
}

// --- Interaction Event (input to write_memory) ---

export interface InteractionEvent {
  npc_id: string;
  player_action: {
    type: string;
    description: string;
    moral_weight: number;
  };
  context: string;
  in_world_date: string;
  witnesses: string[];
}

// --- Reputation Types ---

export type Disposition = "adoring" | "friendly" | "neutral" | "wary" | "hostile" | "hated";

export interface KeyMemory {
  event_ref: string;
  valence: EmotionalValence;
  weight: number;
}

export interface ScoreBreakdown {
  direct_memories: number;
  rumors_heard: number;
  values_alignment: number;
  memory_modifier: number;
}

export interface Reputation {
  npc_id: string;
  last_updated: string;
  opinion_score: number;
  disposition: Disposition;
  score_breakdown: ScoreBreakdown;
  internal_monologue: string;
  key_memories: KeyMemory[];
}

// --- Drift Engine Types ---

export interface DriftInput {
  npc_id: string;
  since_date: string;
  current_date: string;
}

// --- World Advance Types ---

export interface WorldAdvanceInput {
  months_elapsed: number;
  current_date: string;
  event_log_since: string;
}

// --- Dialogue Types ---

export interface DialogueRequest {
  npc_id: string;
  player_approach_context: string;
  topic: string | null;
}

export interface DialogueToneContext {
  npc_summary: string;
  current_state: string;
  disposition_toward_player: string;
  key_memories_summary: string;
  tone_instructions: string;
  memory_cues: string[];
  world_context: string;
}

// --- NPC Loader Types ---

export type LoadPurpose = "dialogue" | "judgment" | "drift" | "debug";

export interface NpcLoadRequest {
  npc_id: string;
  purpose: LoadPurpose;
  player_approaching: boolean;
  topic_context: string | null;
  token_budget: number;
}

export interface MemoryContext {
  date: string;
  type: MemoryType;
  summary: string;
  weight: number;
}

export interface NpcContext {
  npc_id: string;
  soul_summary: string;
  current_state: string;
  trait_snapshot: string;
  memories: MemoryContext[];
  disposition_summary: string | null;
  world_context: string | null;
  total_tokens_used: number;
}

// --- Town Environment Types ---

export interface TownCore {
  archetype: string;
  founding_story: string;
  character: string;
  geographic_traits: string[];
  cultural_values: string[];
}

export interface TownInfrastructure {
  condition: "thriving" | "stable" | "declining" | "damaged" | "ruined";
  notable_buildings: string[];
  recent_construction: string[];
}

export interface TownLived {
  population: number;
  prosperity: number;
  infrastructure: TownInfrastructure;
  social_atmosphere: number;
  safety: number;
  current_state: string;
  wounds: Wound[];
  growth: Growth[];
}

export interface TownSoul {
  core: TownCore;
  lived: TownLived;
}

// --- Calendar Utilities ---

export interface InWorldDate {
  year: number;
  month: number;
  day: number;
}

export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_MONTH = 30;

export const MONTH_NAMES = [
  "Firstmelt", "Greenrise", "Bloomtide",
  "Sundrift", "Highburn", "Ashmonth",
  "Goldfall", "Reapmoon", "Lastlight",
  "Deepcold", "Ironwatch", "Stillnight",
] as const;

export const SEASON_NAMES = [
  "Season of Thaw",
  "Season of Heat",
  "Season of Harvest",
  "Season of Dark",
] as const;

export const ECONOMIC_STATUS_LADDER: EconomicStatus[] = [
  "destitute", "poor", "modest", "comfortable", "wealthy",
];
