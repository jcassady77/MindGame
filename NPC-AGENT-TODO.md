# NPC / Agent — Consolidated TODO

Everything needed to build the NPC agent system: identity, memory, simulation, reputation, and integration.

Ordered by dependency. Earlier tasks produce artifacts that later tasks consume.

---

## Status Key

- `done` — Artifact exists and is usable
- `open` — Not started
- `blocked` — Waiting on a dependency

---

## 1. Soul Schema

**Status:** `done` ✓

Define the canonical structure of an NPC's soul file — the two-layer identity document (immutable core + mutable lived).

**Artifacts:**
- `docs/soul-schema.md` — Full schema spec with field definitions, types, drift rules, worked example (Mira Blackwood)
- `docs/templates/soul.md` — Blank annotated template

**What it defines:**
- YAML frontmatter: `id`, `name`, `age`, `occupation`, `home`, `economic_status`, `relationship_status`, `faction`, `alive`, `last_simulated`
- Core (immutable): `temperament`, `values[]`, `moral_grain`, `quirks[]`, `backstory`
- Lived (mutable): `traits{}` (10 scored traits with seed/current), `tendencies[]`, `wounds[]`, `growth[]`, `current_state`
- Drift rules: max +/-0.10 per step, attractor pull at +0.02, values-amplified drift, causal linkage to memories, tendency threshold matrix

---

## 2. Starter NPCs

**Status:** `done` ✓
**Depends on:** #1 (done)

Seed the town with 10-15 characters, each with their own `soul.md`.

**Output:** `world/town/npcs/<npc_id>/soul.md` + empty `memories/` dir per NPC

**Required archetypes:** innkeeper, blacksmith, mage, healer, singer/bard, merchant, guard captain, child, elder, guild master, farmer, priest, traveling stranger

**Constraints:**
- Spread across all `economic_status` levels
- Age spread: teenager, adults, elderly (65+)
- Mix of `moral_grain` and `values[]`
- At least 2 recruitable party members at game start
- At least 1 child (age 8-12) who can age into recruitability
- At least 1 elder who could plausibly die during a medium quest
- Each backstory 1-2 paragraphs, not a list of facts
- Set `current` equal to `seed` at game start (no starting drift)
- Backstory-warranted wounds/growth may be pre-seeded

**Acceptance:**
- [ ] 10-15 `soul.md` files at correct paths, conforming to schema
- [ ] Diversity in voice, values, temperament — no copies
- [ ] Empty `memories/` subdirectory per NPC

---

## 3. Memory Schema

**Status:** `done` ✓
**Depends on:** #1 (done — `event_ref` naming convention)

Define how NPC memories are stored and structured.

**Output:** `docs/memory-schema.md` + `docs/templates/memory.md` + 3 example memory files

**File location:** `world/town/npcs/<npc_id>/memories/<YYYY-MM-DD>_<slug>.md`

**Frontmatter fields:** `date`, `type` (interaction | observation | rumor | secondhand), `subject`, `emotional_valence` (positive | neutral | negative), `weight` (0.0-1.0), `source` (direct | rumor), `faded` (boolean), `fade_date`

**Body:** 2-5 sentence first-person narrative in the NPC's voice. Internal thought, not a log entry.

**Memory types and default weights:**
| Type | Weight Range |
|------|-------------|
| interaction | 0.5-0.9 |
| observation | 0.3-0.6 |
| rumor | 0.1-0.4 |
| secondhand | 0.3-0.6 |

**Degradation rules:**
- Low-weight (`< 0.3`) memories fade after N steps without reinforcement
- Fading sets `faded: true` — file stays on disk, excluded from active context
- High-weight (`> 0.7`) memories never fade
- Faded memories can reactivate if a new event references the same subject

**Rumor propagation:** default rumor weight = original weight * 0.4; rumors degrade faster

**Acceptance:**
- [ ] `docs/memory-schema.md` defines all fields, types, fade rules
- [ ] Template + 3 examples (direct interaction, observation, rumor) with distinct NPC voices
- [ ] `event_ref` format consistent with soul schema wounds/growth

---

## 4. Calendar System

**Status:** `done` ✓
**Depends on:** none

Define how time works — the calendar drives aging, memory dating, world simulation pacing.

**Output:** `docs/calendar.md`

**Requirements:**
- 4 seasons x 3 months = 12 months/year, with named months
- Date format: `YYYY-MM-DD` (zero-padded, sortable)
- Starting date: Year 1, Month 1, Day 1

**Quest duration guidelines:**
| Quest Type | In-World Time |
|-----------|--------------|
| Local errand | 0 months (same day) |
| Short local | 1 month |
| Regional | 2-3 months |
| Long expedition | 6-12 months |
| Epic campaign | 12-24 months |

**Life pacing:**
| Event | Check Interval |
|-------|---------------|
| Aging | Every 12 months |
| Elderly death check | Every 6 months |
| Pregnancy to birth | ~9 months |
| Child to adult | At age 18 |
| Economic shift | Every 3 months |
| Relationship change | Every 2 months |
| Memory fade | Every 6 months (weight < 0.3) |
| Soul drift step | Once per advance_world call |

**Acceptance:**
- [ ] Full year structure with named seasons/months
- [ ] Date format documented
- [ ] Quest duration + life pacing tables
- [ ] Calendar math defined (months between date A and B)

---

## 5. Quest Outcome Payload

**Status:** `done` ✓
**Depends on:** #4 (calendar, for dates)

Define the structured data a completed quest produces. This feeds memory writing, judgment, and world simulation.

**Output:** `docs/quest-outcome-schema.md` with TypeScript types + 2 worked examples

**Top-level:** `QuestOutcome` — `quest_id`, `quest_name`, `duration_months`, `start_date`, `end_date`, `outcome` (success | partial | failure | abandoned), `player_actions[]`, `moral_choices[]`, `npc_interactions[]`, `witnesses[]`, `party_members[]`, `summary`

**Sub-types:**
- `PlayerAction` — `type`, `description`, `moral_weight` (-1.0 to +1.0), `target_npc_id`, `location`, `in_world_date`, `witnesses[]`, `known_to_town`
- `MoralChoice` — `choice_id`, `description`, `options_available[]`, `choice_made`, `moral_weight`, `affected_npcs[]`, `known_to_town`
- `NpcInteraction` — `npc_id`, `type`, `description`, `moral_weight`, `in_world_date`, `memory_worthy`

**Worked examples needed:**
1. The Noble Path — honest success, helped innocents
2. The Burned Bridge — success via threats/deception, town hears about it

**Acceptance:**
- [ ] All types documented with field-level detail
- [ ] Moral weight scale with examples at multiple levels
- [ ] 2 complete worked examples
- [ ] Validation rules documented

---

## 6. Memory Writer

**Status:** `done` ✓
**Depends on:** #1 (done), #3, #5

Convert player interaction events into NPC memory files.

**Output:** `engine/write_memory.ts`

**Input:** `InteractionEvent` — `npc_id`, `player_action` (type, description, moral_weight), `context`, `in_world_date`, `witnesses[]`

**Behavior:**
1. **Primary memory** — Load NPC's `soul.md`, use core+lived to determine `emotional_valence` (same action reads differently per NPC). Set `weight` proportional to `|moral_weight|`. Generate body via LLM in NPC's voice.
2. **Witness memories** — For each witness NPC: `source: rumor`, `weight = primary * 0.4`, body reflects uncertainty.
3. **Event log** — Append entry to `world/town/event_log.md`.

**Error handling:** skip missing `soul.md`, reject malformed dates, silently skip witnesses without soul files.

**Acceptance:**
- [ ] Produces schema-valid memory files
- [ ] Witness memories at reduced weight with rumor source
- [ ] Emotional valence is soul-aware (conflicting values = different valence)
- [ ] Event log appended
- [ ] Unit tests: positive interaction, negative interaction, multi-witness event

---

## 7. Soul Drift Engine

**Status:** `done` ✓
**Depends on:** #1 (done), #3, #6

Update each NPC's mutable `lived` traits based on accumulated memories.

**Output:** `engine/drift_soul.ts`

**Input:** `npc_id`, `since_date`, `current_date`

**Process:**
1. Load soul + memories in date window (sorted by weight desc)
2. For each memory with weight >= 0.5: determine trait drift direction/magnitude using memory type x valence x core value match matrix
3. Cap total drift per trait at +/-0.10
4. Apply attractor pull (+0.02 toward seed) for unaffected traits
5. Update tendencies when trait thresholds crossed
6. Write wounds[]/growth[] entries citing causal memory
7. Regenerate `lived.current_state` via LLM

**Design rule:** Every drift must cite a memory. No invisible drift. Core section is never modified.

**Acceptance:**
- [ ] Drift rules applied correctly for all memory types
- [ ] Capped at +/-0.10 per trait per step
- [ ] Attractor pull on untouched traits
- [ ] Tendency updates on threshold crossings
- [ ] Wounds/growth written with event_ref citations
- [ ] Core section never modified
- [ ] Unit test: death of close person → bitterness up, hope down, proportional to family rank

---

## 8. World Simulation Engine

**Status:** `done` ✓
**Depends on:** #1 (done), #3, #4, #5

Simulate the world forward when the player returns from a quest.

**Output:** `engine/advance_world.ts`

**Input:** `months_elapsed`, `current_date`, `event_log_since`

**Steps for each living NPC:**
1. **Aging** — increment `age` by `floor(months_elapsed / 12)`
2. **Death check** — age >= 60: `(age - 60) * 0.005 * months_elapsed`; also low-rate illness/accident for all ages. On death: set `alive: false`, write memories to close NPCs, add to obituaries.
3. **Economic drift** — every 3 months: weighted random up/down/same based on `ambition` trait
4. **Housing change** — if economic status shifted 2+ steps: update home, write memories
5. **Relationships** — every 2 months: form (shared values + proximity) or dissolve (diverging status)
6. **Child aging** — if new age >= 18: flag `recruitable: true`
7. **Skill growth** — +0.01 to profession-relevant trait per month, capped at seed + 0.3
8. **Call soul drift** — `drift_soul(npc_id)` for each NPC
9. **Call environment advance** — `advance_environment()` (#11)

**Output:** `world/town/changelog_<new_date>.md` summarizing deaths, economic changes, housing, relationships, coming of age. Then refresh `state.md` (#9).

**Acceptance:**
- [ ] All steps execute in correct order
- [ ] Death check math correct
- [ ] Economic drift capped at one step per interval
- [ ] Changelog written
- [ ] Integration test: 12-month input → verify aging, drift, changelog

---

## 9. Town State Snapshot

**Status:** `done` ✓
**Depends on:** #7, #8

Maintain a single queryable snapshot of current world state — the "return to town" context document.

**Output:** `world/town/state.md` (auto-generated) + `engine/build_state.ts`

**Sections:**
- Current date (human-readable in-world)
- Living residents table (name, age, occupation, home, economic status, relationship status, recruitable)
- Emotional currents (1-3 sentences per NPC from `lived.current_state`)
- Recent deaths
- "What People Are Saying" — 3-7 LLM-generated in-world rumors from event log
- Relationships changed
- Newly recruitable NPCs

**Token budget:** under 2,000 tokens total. Truncate low-relationship NPCs in emotional currents, cap rumors at 7.

**Acceptance:**
- [ ] Reads all NPC soul files, generates complete `state.md`
- [ ] All sections populated with accurate data
- [ ] Rumors LLM-generated from event log
- [ ] Under 2,000 tokens
- [ ] Deterministically regeneratable from NPC folder contents

---

## 10. NPC Judgment System

**Status:** `done` ✓
**Depends on:** #1 (done), #3, #5

NPCs evaluate the player's conduct and form opinions.

**Output:** `engine/judge_player.ts` + `docs/reputation-schema.md`

**Reputation file:** `world/town/npcs/<npc_id>/reputation/player.md`

**Scoring algorithm:**
1. **Direct memory score** — weighted average of direct player memories by valence
2. **Rumor score** — same formula, capped at 30% of total
3. **Values alignment** — player actions vs NPC `core.values[]` (top-ranked = 3x weight)
4. **Soul modifier** — grudge-holders weight negatives +40%, forgiving NPCs decay negatives -20%/step, ruthless NPCs ignore mild negatives, selfless NPCs amplify strong negatives +50%
5. **Composite:** `(direct * 0.5) + (rumor * 0.2) + (values * 0.3) + soul_modifier`, clamped to [-1.0, 1.0]

**Disposition labels:**
| Score | Label |
|-------|-------|
| 0.75 to 1.0 | adoring |
| 0.4 to 0.74 | friendly |
| -0.15 to 0.39 | neutral |
| -0.4 to -0.16 | wary |
| -0.74 to -0.41 | hostile |
| -1.0 to -0.75 | hated |

**Internal monologue** generated via LLM after scoring (2-4 sentences, specific to memories and values).

**Called:** after every `write_memory` involving the player + after every `advance_world` run.

**Acceptance:**
- [ ] 4-part scoring algorithm implemented
- [ ] Soul modifiers applied
- [ ] Disposition label derived correctly
- [ ] Internal monologue generated
- [ ] Top 3 key memories cited
- [ ] Unit tests: one liked player, one distrusted player

---

## 11. Town Environment as Living Entity

**Status:** `done` ✓
**Depends on:** #1 (done), #3, #4

Model the town as a first-class entity with its own soul file, memories, and simulation.

**Output:** `world/town/environment/town.md` + `engine/advance_environment.ts` + `docs/environment-schema.md` + `docs/templates/environment.md`

**Town soul:** Same two-layer schema adapted for a place:
- Core: `archetype`, `founding_story`, `character`, `geographic_traits[]`, `cultural_values[]`
- Lived: `population`, `prosperity` (0.0-1.0), `infrastructure` (condition + buildings), `social_atmosphere` (0.0-1.0), `safety` (0.0-1.0), `current_state`, `wounds[]`, `growth[]`

**Gradual drift (high probability):**
| Event | Trigger |
|-------|---------|
| Population growth | Every 6 months if prosperity > 0.5 |
| New building | Every 12 months if prosperity > 0.6 |
| Town expansion | Every 24 months if population grew > 20% |
| Prosperity drift | Every 3 months, +/-0.03 |
| Road improvement | Every 18 months if prosperity > 0.65 |
| Population decline | Every 6 months if prosperity < 0.35 |

**Catastrophic events (low probability):**
| Event | Base Prob | Effect |
|-------|-----------|--------|
| Plague | 0.5%/step | 20-60% population killed |
| Invasion/Raid | 1%/step (3% if safety < 0.5) | 5-30% killed, buildings destroyed |
| Great Fire | 0.8%/step | Buildings destroyed, prosperity drops |
| Flood | 1.2%/step (2.5% if river) | Infrastructure damage |
| Famine | 0.7%/step (if prosperity < 0.3) | Population loss |

Catastrophic events write memories to ALL living NPCs, leave wounds on town.md, trigger multi-step recovery arcs.

**Town reputation:** `world/town/environment/reputation/player.md` — player's relationship with the town as a whole, soft modifier on all NPC dispositions.

**Acceptance:**
- [ ] Town soul file created with full schema
- [ ] Gradual drift rolls implemented
- [ ] Catastrophic events with correct probabilities/conditions
- [ ] Memories cascade to all living NPCs
- [ ] Recovery arcs tracked across steps
- [ ] Integration test: trigger plague → verify population drop, NPC memories, recovery arc

---

## 12. Dialogue Tone System

**Status:** `done` ✓
**Depends on:** #10, #9, #13

Use NPC disposition to shape how they speak to the player.

**Output:** `engine/dialogue_tone.ts` + `docs/dialogue-tone-matrix.md` + `content/dialogue-examples/` (10 examples)

**Concept:** Disposition sets the **register** (how guarded/warm). Soul sets the **voice** (how they express it). Together they produce unique NPC dialogue.

**Tone matrix:** adoring → friendly → neutral → wary → hostile → hated, each with rules for general tone, information sharing, and player references.

**Soul modifiers on top:** warm + wary = sadness not bitterness; suspicious + friendly = warm but still questioning; high bitterness at any disposition = edge in every line.

**Memory cues:** top 2-3 reputation key memories formatted as natural references. Rumor memories use uncertainty language.

**10 example dialogues required** covering different archetype x disposition combinations.

**Acceptance:**
- [ ] Accepts `DialogueRequest`, returns `DialogueToneContext`
- [ ] Tone derived from disposition x soul traits
- [ ] Memory cues from reputation key memories
- [ ] 10 example dialogues demonstrating genuine tonal difference

---

## 13. NPC Loader / Context Builder

**Status:** `done` ✓
**Depends on:** #1 (done), #3, #9, #10

Assemble a full, token-budgeted NPC context for LLM prompts.

**Output:** `engine/load_npc.ts`

**Input:** `npc_id`, `purpose` (dialogue | judgment | drift | debug), `player_approaching`, `topic_context`, `token_budget` (default 1500)

**Memory prioritization:** `priority = (weight * 0.5) + (recency * 0.3) + (topic_relevance * 0.2)`

**Token budget management:** required sections first (soul core ~200 tokens) → fill remaining with prioritized memories → truncate if needed.

**Output:** `NpcContext` — `soul_summary` (LLM-generated prose), `current_state`, `trait_snapshot` (with deltas from seed), `memories[]`, `disposition_summary`, `world_context`, `total_tokens_used`

**Also handles** `npc_id: "town"` for the environment entity.

**Acceptance:**
- [ ] Accepts `NpcLoadRequest`, returns `NpcContext`
- [ ] Memory prioritization uses composite formula
- [ ] Token budget enforced
- [ ] Soul summary is LLM prose, not raw YAML
- [ ] Works for `npc_id: "town"`
- [ ] Unit test: token budget limits enforced

---

## 14. File Structure & Conventions

**Status:** `done` ✓
**Depends on:** all above (documents the full system)

Single reference doc for the entire project file layout.

**Output:** `docs/file-structure.md`

**Covers:**
- Full directory tree with descriptions
- NPC ID format: `firstname_lastname` lowercase snake_case
- Memory filename format: `<YYYY-MM-DD>_<action-slug>.md`
- Changelog format: `changelog_<YYYY-MM-DD>.md`
- Cross-reference convention: always relative path from project root
- Data integrity rules (no orphan memories, no core mutations, valid dates, etc.)

**Acceptance:**
- [ ] Every directory and file type documented
- [ ] Naming conventions with examples
- [ ] Cross-reference format defined
- [ ] Data integrity rules listed

---

## Dependency Map

```
#1 Soul Schema (DONE)
 ├─→ #2 Starter NPCs
 ├─→ #3 Memory Schema
 ├─→ #7 Soul Drift Engine
 ├─→ #10 Judgment System
 ├─→ #11 Town Environment
 └─→ #13 NPC Loader

#4 Calendar
 ├─→ #3 Memory Schema (date format)
 ├─→ #5 Quest Outcome Payload
 ├─→ #8 World Simulation
 └─→ #11 Town Environment

#3 Memory Schema
 ├─→ #6 Memory Writer
 ├─→ #7 Soul Drift Engine
 ├─→ #10 Judgment System
 └─→ #13 NPC Loader

#5 Quest Outcome Payload
 ├─→ #6 Memory Writer
 ├─→ #8 World Simulation
 └─→ #10 Judgment System

#7 Soul Drift Engine ─→ #9 Town State Snapshot
#8 World Simulation ─→ #9 Town State Snapshot
#11 Town Environment ─→ #9 Town State Snapshot

#10 Judgment System ─→ #12 Dialogue Tone
#9 Town State ─→ #12 Dialogue Tone

#14 File Structure ← depends on all
```

**Suggested build order (parallelizable where shown):**

1. **#2** Starter NPCs + **#4** Calendar (parallel — no shared deps)
2. **#3** Memory Schema + **#5** Quest Outcome Payload (parallel)
3. **#6** Memory Writer
4. **#7** Soul Drift Engine + **#11** Town Environment (parallel)
5. **#8** World Simulation Engine
6. **#9** Town State Snapshot + **#10** Judgment System (parallel)
7. **#12** Dialogue Tone + **#13** NPC Loader (parallel)
8. **#14** File Structure (last — documents everything)
