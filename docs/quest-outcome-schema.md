# Quest Outcome Payload Schema

**Version:** 1.0
**Status:** Canonical
**Defined by:** TODO-10
**Consumed by:** TODO-04 (memory writer), TODO-06 (world advance), TODO-08 (judgment system)

---

## Overview

A quest outcome payload is the structured data produced when a quest completes. It captures everything that happened during the quest — what the player did, who they helped or harmed, what moral choices they made, and who witnessed it all.

This payload is the bridge between the quest narrative and the downstream systems that react to player behavior. It feeds into:

- **`engine/write_memory.ts`** — creates NPC memory files from `player_actions` and `npc_interactions`
- **`engine/judge_player.ts`** — evaluates player conduct from `moral_choices` and `player_actions`
- **`engine/advance_world.ts`** — uses `duration_months` to simulate the passage of time while the player was away

Getting this schema right is load-bearing for everything downstream.

---

## TypeScript Type Definitions

### QuestOutcome (Top-Level Payload)

```typescript
interface QuestOutcome {
  quest_id: string;              // unique identifier for this quest
  quest_name: string;            // human-readable name
  duration_months: number;       // how much in-world time elapsed
  start_date: string;            // YYYY-MM-DD in-world date quest began
  end_date: string;              // start_date + duration_months (calendar math)
  outcome: "success" | "partial" | "failure" | "abandoned";
  player_actions: PlayerAction[];
  moral_choices: MoralChoice[];
  npc_interactions: NpcInteraction[];
  witnesses: string[];           // npc_ids of NPCs who were present and aware
  party_members: string[];       // npc_ids who traveled with the player
  summary: string;               // 2-3 sentence human-readable quest summary
}
```

### PlayerAction

Each individual action the player took during the quest that has moral or social weight.

```typescript
interface PlayerAction {
  type: string;              // "helped" | "threatened" | "deceived" | "killed" | "sacrificed" | "abandoned" | custom
  description: string;       // 1-2 sentence description of what happened
  moral_weight: number;      // -1.0 (maximally cruel) to +1.0 (maximally noble); 0.0 = neutral
  target_npc_id: string | null;  // if this action was directed at a specific NPC
  location: string;          // where this happened (in-world place name)
  in_world_date: string;     // YYYY-MM-DD when this happened
  witnesses: string[];       // npc_ids who saw this specific action
  known_to_town: boolean;    // will this become a rumor back home?
}
```

### MoralChoice

High-stakes decision points where the player explicitly chose between paths.

```typescript
interface MoralChoice {
  choice_id: string;         // unique ID for this decision point
  description: string;       // what the choice was about
  options_available: string[]; // what the player could have done
  choice_made: string;       // what the player actually did
  moral_weight: number;      // same -1.0 to +1.0 scale
  affected_npcs: string[];   // npc_ids whose opinions are affected by this choice
  known_to_town: boolean;    // does this come back as a rumor?
}
```

### NpcInteraction

Specific interactions with named NPCs during the quest, distinct from general player actions.

```typescript
interface NpcInteraction {
  npc_id: string;
  type: "helped" | "wronged" | "deceived" | "recruited" | "abandoned" | "killed" | "befriended";
  description: string;
  moral_weight: number;      // -1.0 to +1.0
  in_world_date: string;     // YYYY-MM-DD
  memory_worthy: boolean;    // should this generate a memory file for this NPC?
}
```

---

## Moral Weight Scale

The `moral_weight` field appears on `PlayerAction`, `MoralChoice`, and `NpcInteraction`. It uses the same scale everywhere.

| Weight | Example |
|---|---|
| +1.0 | Sacrificed something personal to save an innocent |
| +0.6 | Helped someone at personal cost |
| +0.2 | Chose honest path when deception was easier |
| 0.0 | Neutral, no moral dimension |
| -0.2 | Lied to get what was needed |
| -0.6 | Threatened or coerced an innocent |
| -1.0 | Killed in cold blood |

The scale is continuous. Values like +0.4 or -0.3 are valid and expected. The table above provides calibration anchors, not the only legal values.

---

## Validation Rules

Any system producing or consuming a `QuestOutcome` payload must enforce these constraints:

1. **`moral_weight` range:** Every `moral_weight` field must be in the range `[-1.0, 1.0]`. Values outside this range are invalid.

2. **`end_date` consistency:** `end_date` must equal `start_date + duration_months` using the in-world calendar math defined in `docs/calendar.md`. The formula:
   ```
   new_month = ((month - 1 + duration_months) % 12) + 1
   new_year  = year + floor((month - 1 + duration_months) / 12)
   day       = unchanged
   ```

3. **`duration_months` non-negative:** `duration_months` must be `>= 0`. A value of `0` indicates a same-day errand with no time passage.

4. **NPC ID referential integrity:** Every `target_npc_id`, witness ID (in both top-level `witnesses` and per-action `witnesses`), `party_members` entry, `affected_npcs` entry, and `npc_id` field must correspond to an existing NPC — i.e., a directory must exist at `world/town/npcs/<npc_id>/soul.md`. Quest-spawned NPCs (those met only during the quest) are exempt from this check but should still use consistent kebab-case IDs.

5. **Party members and death:** `party_members` may include NPCs who died during the quest. Their `alive` flag in their soul file will be updated to `false` by `advance_world.ts` when processing the outcome.

6. **Action date range:** Every `in_world_date` in `player_actions` and `npc_interactions` must fall within the range `[start_date, end_date]` inclusive.

7. **Non-empty summary:** The `summary` field must be a non-empty string of 2-3 sentences.

---

## Downstream Consumer Reference

### `engine/write_memory.ts`

Iterates over `player_actions` and `npc_interactions` to create memory files for affected NPCs. For each entry:

- If `target_npc_id` is set (for `PlayerAction`) or `npc_id` is set (for `NpcInteraction`), a memory file is written to that NPC's `memories/` directory.
- If `memory_worthy` is `true` (for `NpcInteraction`), the memory is always written regardless of weight.
- Witnesses also receive memory files, but at reduced weight (rumor-level).
- If `known_to_town` is `true`, a rumor-weight memory is generated for all town NPCs, not just witnesses.

### `engine/judge_player.ts`

Evaluates overall player conduct by aggregating:

- All `moral_weight` values from `moral_choices` (these carry the highest signal).
- All `moral_weight` values from `player_actions`.
- The `outcome` field (abandoning a quest carries implicit moral weight).

The judgment system produces a conduct score that influences how NPCs (especially those with strong `values` like `justice` or `honesty`) regard the player.

### `engine/advance_world.ts`

Uses `duration_months` to run that many simulation steps on the town while the player was away. Each step applies:

- Aging checks
- Economic status shifts
- Relationship formation/dissolution
- Memory fade checks
- Soul drift (per the drift rules in `docs/soul-schema.md`)
- Elderly death checks

The quest outcome is processed *after* time advancement, so NPC reactions to the player's return reflect the time that has passed.

---

## Worked Examples

### Example 1: The Noble Path — "The Lost Shepherd"

A regional quest to find a missing shepherd in the hills. The player traveled with Rowan Steelmark, helped villagers along the way, chose the honest path at a key decision, and brought the shepherd home safely.

```json
{
  "quest_id": "quest-lost-shepherd-001",
  "quest_name": "The Lost Shepherd",
  "duration_months": 2,
  "start_date": "0001-04-01",
  "end_date": "0001-06-01",
  "outcome": "success",

  "player_actions": [
    {
      "type": "helped",
      "description": "Shared rations with a stranded hill-farming family whose stores had been raided by wolves. Gave them enough food to last until the next trade caravan.",
      "moral_weight": 0.6,
      "target_npc_id": null,
      "location": "Greymoss Foothills",
      "in_world_date": "0001-04-18",
      "witnesses": ["rowan-steelmark"],
      "known_to_town": false
    },
    {
      "type": "helped",
      "description": "Tracked the missing shepherd to a collapsed cave and dug him out by hand over the course of a day, risking a further collapse.",
      "moral_weight": 0.7,
      "target_npc_id": null,
      "location": "Thornridge Caves",
      "in_world_date": "0001-05-10",
      "witnesses": ["rowan-steelmark"],
      "known_to_town": true
    },
    {
      "type": "sacrificed",
      "description": "Left behind a valuable salvage find in the caves to carry the injured shepherd on a makeshift stretcher instead.",
      "moral_weight": 0.5,
      "target_npc_id": null,
      "location": "Thornridge Caves",
      "in_world_date": "0001-05-11",
      "witnesses": ["rowan-steelmark"],
      "known_to_town": false
    }
  ],

  "moral_choices": [
    {
      "choice_id": "mc-shepherd-ransom",
      "description": "A band of opportunistic traders found the shepherd first and offered to sell his location for a steep price. The player could pay, threaten them, or search alone.",
      "options_available": [
        "Pay the traders' price",
        "Threaten the traders into revealing the location",
        "Refuse and continue searching on your own"
      ],
      "choice_made": "Refuse and continue searching on your own",
      "moral_weight": 0.2,
      "affected_npcs": ["rowan-steelmark"],
      "known_to_town": false
    }
  ],

  "npc_interactions": [
    {
      "npc_id": "rowan-steelmark",
      "type": "befriended",
      "description": "Rowan and the player endured two months of hard travel together. The player consistently chose the harder but more honorable path, earning Rowan's genuine respect.",
      "moral_weight": 0.5,
      "in_world_date": "0001-06-01",
      "memory_worthy": true
    },
    {
      "npc_id": "tomas-greenhollow",
      "type": "helped",
      "description": "The shepherd turned out to be a distant relative of Tomas. Word reached Tomas that the player brought his cousin home alive.",
      "moral_weight": 0.4,
      "in_world_date": "0001-06-01",
      "memory_worthy": true
    }
  ],

  "witnesses": ["rowan-steelmark"],
  "party_members": ["rowan-steelmark"],

  "summary": "The player set out with Rowan Steelmark to find a shepherd who had gone missing in the Greymoss Foothills. After two months of searching, they tracked him to a collapsed cave in Thornridge, dug him out, and carried him home safely. The player turned down shortcuts and helped strangers along the way."
}
```

**Date validation check:** `start_date` is `0001-04-01`. Adding 2 months: `month = ((4-1+2)%12)+1 = 6`, `year = 1+floor(5/12) = 1`. Result: `0001-06-01`. Matches `end_date`.

---

### Example 2: The Burned Bridge — "The Merchant's Debt"

A short local quest about a debt dispute. The player succeeded in resolving the debt but used threats and deception to do it, taking a personal cut. The town will hear about what happened.

```json
{
  "quest_id": "quest-merchants-debt-002",
  "quest_name": "The Merchant's Debt",
  "duration_months": 1,
  "start_date": "0001-06-01",
  "end_date": "0001-07-01",
  "outcome": "success",

  "player_actions": [
    {
      "type": "threatened",
      "description": "Cornered the debtor in his workshop and threatened to expose his gambling habits to the town council unless he paid up immediately.",
      "moral_weight": -0.6,
      "target_npc_id": "kael-driftwood",
      "location": "Driftwood Workshop, west quarter",
      "in_world_date": "0001-06-10",
      "witnesses": ["brynn-ashford"],
      "known_to_town": true
    },
    {
      "type": "deceived",
      "description": "Told the merchant Gareth that the full debt had been collected, but skimmed a portion off the top before handing the money over.",
      "moral_weight": -0.5,
      "target_npc_id": "gareth-coinsworth",
      "location": "Coinsworth Trading Post",
      "in_world_date": "0001-06-22",
      "witnesses": [],
      "known_to_town": false
    },
    {
      "type": "deceived",
      "description": "Told Kael the debt was larger than it actually was, pocketing the difference between what Kael paid and what Gareth was owed.",
      "moral_weight": -0.4,
      "target_npc_id": "kael-driftwood",
      "location": "Driftwood Workshop, west quarter",
      "in_world_date": "0001-06-10",
      "witnesses": [],
      "known_to_town": false
    }
  ],

  "moral_choices": [
    {
      "choice_id": "mc-debt-method",
      "description": "Gareth asked the player to collect a debt from Kael Driftwood. The player had to decide how to approach the situation.",
      "options_available": [
        "Mediate fairly between both parties",
        "Threaten Kael into paying",
        "Investigate whether the debt is legitimate first"
      ],
      "choice_made": "Threaten Kael into paying",
      "moral_weight": -0.6,
      "affected_npcs": ["kael-driftwood", "gareth-coinsworth", "brynn-ashford"],
      "known_to_town": true
    }
  ],

  "npc_interactions": [
    {
      "npc_id": "kael-driftwood",
      "type": "wronged",
      "description": "The player used intimidation and inflated the debt amount to extract more money from Kael than he actually owed. Kael paid out of fear, not fairness.",
      "moral_weight": -0.7,
      "in_world_date": "0001-06-10",
      "memory_worthy": true
    },
    {
      "npc_id": "gareth-coinsworth",
      "type": "deceived",
      "description": "The player skimmed money from the collection, giving Gareth less than what Kael actually paid. Gareth believes the full debt was smaller than it was.",
      "moral_weight": -0.4,
      "in_world_date": "0001-06-22",
      "memory_worthy": true
    }
  ],

  "witnesses": ["brynn-ashford", "gareth-coinsworth", "kael-driftwood"],
  "party_members": [],

  "summary": "The player was hired by Gareth Coinsworth to collect a debt from Kael Driftwood. Instead of mediating, the player threatened Kael, inflated the debt amount, and skimmed from the proceeds. The debt was technically resolved, but both parties were cheated and Brynn Ashford witnessed the threats."
}
```

**Date validation check:** `start_date` is `0001-06-01`. Adding 1 month: `month = ((6-1+1)%12)+1 = 7`, `year = 1+floor(6/12) = 1`. Result: `0001-07-01`. Matches `end_date`.

---

## How Downstream Systems Use These Examples

### Example 1 processed by `write_memory.ts`:

- **Rowan Steelmark** receives a memory: befriended the player during a two-month journey, witnessed honorable behavior. High positive weight. This memory will push Rowan's `trust` and `loyalty` traits upward via soul drift.
- **Tomas Greenhollow** receives a memory: the player rescued his relative. Moderate positive weight. This memory pushes `hope` and `trust` upward.
- Because `known_to_town` is `true` on the cave rescue action, all town NPCs receive a rumor-weight memory that the player dug a man out of a collapsed cave.

### Example 2 processed by `write_memory.ts`:

- **Kael Driftwood** receives a memory: was threatened and extorted by the player. High negative weight (`-0.7`). This memory will push `trust` downward and `bitterness`/`resentment` upward.
- **Gareth Coinsworth** receives a memory: was deceived by the player. Moderate negative weight (`-0.4`). If Gareth later discovers the deception, this memory's weight could increase.
- **Brynn Ashford** receives a witness memory: saw the player threaten Kael. Because `known_to_town` is `true` on the threatening action, this becomes a town-wide rumor.

### Example 2 processed by `judge_player.ts`:

- Moral choices: `-0.6` (chose threats over mediation)
- Player actions: `-0.6`, `-0.5`, `-0.4` (threats and deception)
- NPC interactions: `-0.7`, `-0.4` (wronged Kael, deceived Gareth)
- Overall conduct: strongly negative. NPCs with `justice` or `honesty` in their core values will react most strongly.

---

## Schema Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | Initial | Full schema definition with type definitions, validation rules, and worked examples |
