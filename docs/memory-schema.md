# Memory Schema Specification

**Version:** 1.0
**Status:** Canonical
**Defined by:** TODO-03
**Consumed by:** TODO-04, TODO-06b, TODO-08, TODO-11

---

## Overview

A memory file is a first-person record of a significant experience as perceived by a single NPC. Memories are the raw material that drives personality drift (TODO-06b), reputation scoring (TODO-08), and dialogue tone (TODO-09). Every kindness, betrayal, rumor, and loss becomes a file — and the accumulation of those files is what makes a character feel alive.

Each NPC's memories are stored as individual Markdown files with structured YAML frontmatter and a narrative body written in the NPC's own voice.

---

## File Location & Naming

```
world/town/npcs/<npc_id>/memories/<YYYY-MM-DD>_<slug>.md
```

**Naming rules:**

- `<YYYY-MM-DD>` is the **in-world calendar date** the memory was formed, zero-padded (e.g. `0001-04-12`).
- `<slug>` is a **lowercase kebab-case** summary of the event, 2-5 words (e.g. `player-helped-harvest`, `heard-about-ashfall-fire`).
- Files are **append-only** — memories are never deleted, only marked `faded: true`.

**Examples:**

- `0001-03-15_player-helped-repair.md`
- `0001-04-02_player-argued-with-tomas.md`
- `0001-05-10_heard-player-stole-from-merchant.md`

---

## Document Structure

A memory file has two parts:

1. **YAML Frontmatter** — structured metadata (between `---` fences)
2. **Memory Body** — narrative paragraph in the NPC's first-person voice

---

## Part 1 — YAML Frontmatter

| Field | Type | Required | Description |
|---|---|---|---|
| `date` | `string` | yes | In-world date this memory was formed. Format: `YYYY-MM-DD`. e.g. `"0001-04-12"` |
| `type` | `enum` | yes | One of: `interaction`, `observation`, `rumor`, `secondhand` |
| `subject` | `string` | yes | Who this memory is about: `"player"` or an `npc_id` (e.g. `"tomas-greenhollow"`) |
| `emotional_valence` | `enum` | yes | One of: `positive`, `neutral`, `negative` |
| `weight` | `float` | yes | `0.0`–`1.0` — how much this memory matters to the NPC. See Memory Types for default ranges. |
| `source` | `enum` | yes | One of: `direct`, `rumor` |
| `faded` | `boolean` | yes | `false` when active. Set to `true` when memory is too old or low-weight to surface in active context. |
| `fade_date` | `string \| null` | yes | In-world date when the memory was marked faded. `null` while still active. Format: `YYYY-MM-DD`. |

### Frontmatter Example

```yaml
---
date: "0001-04-12"
type: interaction
subject: "player"
emotional_valence: positive
weight: 0.7
source: direct
faded: false
fade_date: null
---
```

---

## Part 2 — Memory Body

The body of the file is a **short narrative paragraph written in the NPC's first-person voice**.

### Rules

- **2-5 sentences** maximum.
- Written as **internal thought**, not a log entry or summary.
- Reflects the NPC's `core.temperament` and `lived.current_state` at the time of the event.
- **Emotionally honest** — not neutral documentation. The NPC's feelings, doubts, and biases should come through.
- For rumors, the body should reflect the NPC's **uncertainty**: hedging, second-guessing, or weighing the source's reliability.

### Body Examples

**Direct interaction (negative):**

> The stranger — the one they call a hero — asked me for help finding Aldric's son. I told them what I knew. They thanked me with a coin and walked away. I saw the way they looked at the boy when they found him. There was something cold in it that I can't shake.

**Rumor (uncertain):**

> Tomas at the mill says the traveler burned half the village in the Ashfall valley to drive out the bandits. Could be exaggeration. Tomas has always been dramatic. But people don't usually make that face when they're exaggerating.

---

## Memory Types

| Type | Description | Default Weight Range |
|---|---|---|
| `interaction` | NPC directly interacted with the player or another NPC | `0.5`–`0.9` |
| `observation` | NPC witnessed something without being directly involved | `0.3`–`0.6` |
| `rumor` | NPC heard about something from another character | `0.1`–`0.4` |
| `secondhand` | NPC was told about something by a trusted source — higher weight than pure rumor | `0.3`–`0.6` |

### Type Selection Guide

- Use `interaction` when the NPC was a direct participant in the event (spoke to the player, traded, fought, helped).
- Use `observation` when the NPC was physically present but not directly involved (watched from across the square, overheard a conversation).
- Use `rumor` when the NPC heard about the event through the grapevine — no trusted specific source.
- Use `secondhand` when a specific, trusted individual told the NPC about the event (e.g. a close friend or family member recounted what happened).

---

## Memory Degradation

Memories fade over time unless reinforced by new events. This models the natural process of forgetting unimportant details while retaining defining experiences.

### Fading Rules

1. After **N simulation steps** without reinforcement, low-weight memories (`weight < 0.3`) are **candidates for fading**.
2. Fading sets `faded: true` and records the in-world date in `fade_date`.
3. The file remains on disk — it is never deleted. Faded memories are simply **excluded from active context loading** during dialogue and drift calculations.
4. **High-weight memories (`weight > 0.7`) never fade.** They are defining experiences that permanently shape the NPC.
5. Memories with weight between `0.3` and `0.7` fade only after extended periods without reinforcement — the threshold is longer than for low-weight memories.

### Reactivation

Faded memories can be **reactivated** when a new event references the same subject:

- Set `faded` back to `false`.
- Clear `fade_date` (set to `null`).
- Bump `weight` slightly (e.g. `+0.1`, capped at `1.0`).

This models the experience of a half-forgotten memory suddenly becoming relevant again — "Wait, didn't something like this happen before?"

---

## Rumor Propagation

When the memory writer (TODO-04) creates a memory for an NPC who directly experienced an event, it may also create lower-weight `source: rumor` memories for other NPCs who would plausibly hear about it.

### Propagation Rules

1. **Default rumor weight** = original event's `weight * 0.4`.
2. Rumors **degrade faster** than direct memories — they are fading candidates at `weight < 0.4` instead of the usual `0.3`.
3. The rumor body should reflect the NPC's **uncertainty** about what they heard: hedging language, attribution to the source, acknowledgment that details may be wrong.
4. Rumor `type` is set to `rumor` and `source` is set to `rumor`.

### Propagation Example

If Brynn Ashford directly witnesses an event and gets a memory with `weight: 0.7`, then Tomas Greenhollow (who heard about it at the market) might receive a rumor memory with `weight: 0.28` (0.7 * 0.4).

---

## event_ref Convention

The `event_ref` field used in `soul.md` `wounds[]` and `growth[]` entries is the **memory filename only** — not the full path.

**Format:** `<YYYY-MM-DD>_<slug>.md`

**Examples:**

- `"0001-04-12_player-helped-harvest.md"`
- `"0001-03-15_player-helped-repair.md"`
- `"0001-05-10_heard-player-stole-from-merchant.md"`

The full path can always be reconstructed as:
```
world/town/npcs/<npc_id>/memories/<event_ref>
```

This convention is shared with the Soul Schema (docs/soul-schema.md) and must remain consistent across both specifications.

---

## Complete Worked Example

Below is a complete, valid memory file for Brynn Ashford (innkeeper), recording a direct positive interaction with the player.

```markdown
---
date: "0001-03-15"
type: interaction
subject: "player"
emotional_valence: positive
weight: 0.6
source: direct
faded: false
fade_date: null
---

The stranger showed up just as I was trying to hold the shutter frame steady and nail it back in at the same time — a fool's errand with two hands. They didn't ask permission, just walked over and braced the frame while I drove the nails. We barely spoke. But there's something about a person who helps without being asked that tells you more than an hour of conversation. I'll remember that.
```

---

## Schema Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | Initial | Full schema definition |
