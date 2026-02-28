# Environment Schema Specification

**Version:** 1.0
**Status:** Canonical
**Defined by:** TODO-13
**Consumed by:** advance_environment.ts, advance_world.ts

---

## Overview

The town environment is treated as a character in its own right. Like an NPC soul file, the town has a two-layer identity: a **Core** layer (immutable founding identity) and a **Lived** layer (mutable state shaped by time and events). The town does not have YAML frontmatter or individual traits like NPCs. Instead, its mutable state tracks population, prosperity, infrastructure condition, social atmosphere, and safety.

The town soul file lives at:

```
world/town/environment/town.md
```

Town memories (catastrophic events) are stored at:

```
world/town/environment/memories/<YYYY-MM-DD>_<slug>.md
```

The environment advance engine (`engine/advance_environment.ts`) simulates the passage of time for the town, applying gradual drift, rolling for catastrophic events, processing recovery arcs, and regenerating the town's `current_state` via LLM.

---

## Document Structure

A town soul file has two parts, in order:

1. **Core section** -- immutable town identity (YAML block under `## Core`)
2. **Lived section** -- mutable state shaped by time (YAML block under `## Lived`)

There is no YAML frontmatter. The town does not have an `id`, `age`, or `last_simulated` field. It is a singular entity advanced as part of the world simulation.

---

## Part 1 -- Core Identity (`## Core`)

The core defines the town's founding character. These fields are set at world creation and never change. They influence how the town responds to events and what kinds of catastrophic events it is vulnerable to.

### Core Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `archetype` | `string` | yes | What kind of settlement this is. e.g. `"agricultural village"`, `"mining outpost"`, `"coastal trading town"` |
| `founding_story` | `string` | yes | 1-2 paragraphs describing how the town was founded and what shaped its early identity. Written from a neutral historical perspective. |
| `character` | `string` | yes | One-sentence description of the town's personality. e.g. `"tight-knit and self-reliant, with a streak of hospitality for those who earn it"` |
| `geographic_traits` | `string[]` | yes | 2-5 geographic features that define the town's location. These affect catastrophic event probabilities (e.g. `"river access"` increases flood chance). |
| `cultural_values` | `string[]` | yes | 2-5 values that define what the townspeople hold dear. Parallel to an NPC's `core.values[]`. |

### Core Rules

- Core fields are **write-once**. After world creation, no system may modify them.
- `geographic_traits` are checked by the catastrophic event system to modify probabilities.
- `cultural_values` inform LLM-generated narrative for `current_state` and event descriptions.

---

## Part 2 -- Lived State (`## Lived`)

The lived layer tracks the town's current condition. These fields change over time due to gradual drift, catastrophic events, and recovery arcs.

### Lived Fields

| Field | Type | Range | Required | Description |
|---|---|---|---|---|
| `population` | `integer` | 1+ | yes | Current population count. Changes via gradual growth/decline and catastrophic events. |
| `prosperity` | `float` | 0.0-1.0 | yes | Overall economic health. Affects population growth triggers, building construction, and famine vulnerability. |
| `infrastructure` | `TownInfrastructure` | -- | yes | Nested object tracking buildings and overall condition. See below. |
| `social_atmosphere` | `float` | 0.0-1.0 | yes | How cohesive and positive the community feels. Drops sharply from catastrophic events, recovers slowly. |
| `safety` | `float` | 0.0-1.0 | yes | How safe the town and surrounding area are. Affects invasion probability. |
| `current_state` | `string` | -- | yes | 2-3 sentences describing the town's current feel, written from a returning traveler's perspective. Regenerated each simulation step via LLM. |
| `wounds` | `Wound[]` | -- | yes (may be `[]`) | Active catastrophic injuries. Same structure as NPC wounds: `event_ref`, `trait_affected`, `drift_amount`, `since_date`. |
| `growth` | `Growth[]` | -- | yes (may be `[]`) | Recovery completions. Same structure as NPC growth: `event_ref`, `trait_affected`, `drift_amount`, `since_date`. |

### Infrastructure Sub-Object

| Field | Type | Valid Values | Description |
|---|---|---|---|
| `condition` | `enum` | `thriving`, `stable`, `declining`, `damaged`, `ruined` | Overall infrastructure state. Set to `damaged` by floods, degrades or recovers over time. |
| `notable_buildings` | `string[]` | -- | List of named buildings in the town. Buildings can be destroyed by catastrophic events or added via construction. |
| `recent_construction` | `string[]` | -- | Buildings added during the most recent advance step. Cleared each step. |

---

## Gradual Drift Events

Gradual drift represents the slow, organic changes a town undergoes over time. These are applied for each relevant interval within `monthsElapsed`.

| Event | Interval | Trigger | Effect |
|---|---|---|---|
| Prosperity drift | Every 3 months | Always | Prosperity shifts +/-0.03. Slight bias toward continuing current trajectory (>0.5 biases up, <0.5 biases down). Clamped to [0.0, 1.0]. |
| Population growth | Every 6 months | Prosperity > 0.5 | Population increases by 2-8 people. |
| Population decline | Every 6 months | Prosperity < 0.35 | Population decreases by 1-5 people (minimum 1). |
| New construction | Once per step | Prosperity > 0.6 AND 12+ months elapsed | One new building added to `notable_buildings` and `recent_construction`. Chosen from a candidate pool, excluding duplicates. |

### Drift Notes

- Prosperity drift is random but biased. A town doing well tends to keep doing well; a town in decline tends to keep declining. This creates momentum without determinism.
- Population changes are tied to prosperity thresholds. A town in the middle range (0.35-0.5) neither grows nor shrinks -- it holds steady.
- Construction requires sustained prosperity over a long period, representing the accumulation of surplus.

---

## Catastrophic Events

Catastrophic events are rare, high-impact occurrences that can dramatically alter the town. At most one catastrophic event can occur per advance step. Probabilities are rolled using `Math.random()`.

| Event | Base Probability | Condition | Effects |
|---|---|---|---|
| **Plague** | 0.5% | None | Kills 20-60% of population. Social atmosphere drops to 0.1. Prosperity -0.2. Safety -0.1. |
| **Invasion** | 1.0% (3.0% if safety < 0.5) | None | Kills 5-30% of population. Destroys 1-3 buildings. Safety -0.3. Prosperity -0.15. Social atmosphere -0.2. |
| **Fire** | 0.8% | None | Destroys 1-2 buildings. Prosperity -0.15. 0-5 casualties. Safety -0.05. Social atmosphere -0.1. |
| **Flood** | 1.2% (2.5% if geographic traits include "river") | None | Infrastructure condition set to `damaged`. 2-15 casualties. Prosperity -0.12. Safety -0.1. Social atmosphere -0.15. |
| **Famine** | 0.7% | Prosperity < 0.3 | Kills 5-20% of population. Social atmosphere -0.3. Prosperity -0.1. |

### Catastrophic Event Processing

When a catastrophic event occurs:

1. **Apply stat changes** -- population, prosperity, safety, social atmosphere are modified immediately.
2. **Destroy buildings** -- for invasion and fire, buildings are randomly selected and removed from `notable_buildings`.
3. **Write town memory** -- a memory file is created at `world/town/environment/memories/<date>_<slug>.md`.
4. **Write NPC memories** -- a high-weight (`0.85`) observation memory is written to every living NPC's memories directory.
5. **Add wound** -- a wound entry is added to `lived.wounds[]` with the event reference, affected trait, drift amount, and date.

---

## Recovery Arc Rules

Recovery arcs model the town slowly healing from catastrophic events. Each wound in `lived.wounds[]` is processed every advance step.

### Recovery Timeline

| Phase | Duration | Behavior |
|---|---|---|
| **Shock** | First 6 months | No recovery. The wound's full effects persist. |
| **Gradual recovery** | Months 7-18 | Incremental restoration: prosperity and safety recover by small amounts each step. Infrastructure condition may improve from `damaged` to `declining` after 50% of the recovery period. Social atmosphere recovers by +0.01 per step. |
| **Full recovery** | After 18 months | Wound is removed from `lived.wounds[]`. A growth entry is added documenting the recovery. Affected stats are restored by 50% of the original wound's drift amount. Infrastructure returns to `stable`. |

### Recovery Notes

- Population recovery is handled organically through the gradual drift system (prosperity-driven growth), not through direct restoration.
- A town can accumulate multiple wounds. Each is tracked and recovered independently.
- Recovery is not guaranteed to return the town to its pre-wound state. A town that suffers multiple catastrophic events may end up permanently diminished.
- Growth entries created by recovery reference the original wound's `event_ref`.

---

## Current State Generation

After all drift, catastrophic events, and recovery processing, the town's `current_state` is regenerated via LLM using this prompt:

```
You are describing the current condition of a town.

Town type: {archetype}
Town character: {character}
Current: infrastructure {condition}, prosperity {X}, social atmosphere {Y}, safety {Z}
Population: {N}
Recent events: {list of gradual and catastrophic events}
Active recovery: {list of active wounds, if any}

Write 2-3 sentences describing what the town feels like right now.
Write as what a returning traveler would notice first -- sensory, specific, honest.
```

The generated text replaces `lived.current_state` in the town soul file.

---

## Town Reputation

The town's collective opinion of the player is tracked separately in the player file, not in the town soul. Individual NPC reputations aggregate into a town-wide disposition, but the town soul file itself does not store player reputation. See the player reputation system for details on how town-wide opinion is calculated from individual NPC scores.

---

## Memory Cross-Reference

Town memories use the same naming convention as NPC memories:

```
<YYYY-MM-DD>_<slug>.md
```

When a catastrophic event occurs, the same memory content is written to:
- `world/town/environment/memories/` (the town's own memory)
- `world/town/npcs/<npc_id>/memories/` for every living NPC (as individual memories)

The `event_ref` in wound and growth entries references the filename (not the full path).

---

## Complete Example -- Hearthfield

See `world/town/environment/town.md` for the canonical example of Hearthfield, a fully realized agricultural village.

---

## Schema Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | Initial | Full schema definition |
