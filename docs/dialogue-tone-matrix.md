# Dialogue Tone Matrix

## Overview

The dialogue tone system shapes how NPCs speak to the player based on two independent axes:

- **Disposition** sets the **register** -- how guarded, how warm, how forthcoming the NPC is. This comes from the reputation system and reflects the NPC's accumulated opinion of the player.
- **Soul** sets the **voice** -- how the NPC actually expresses that register. This comes from the NPC's core temperament, values, traits, and quirks.

These two axes interact. A `friendly` innkeeper sounds very different from a `friendly` guard captain. A `hostile` priest with a melancholic temperament speaks differently from a `hostile` farmer with a stoic one. The same NPC sounds different on this visit than on the last if their traits have drifted through experience.

The system does not generate dialogue. It assembles a `DialogueToneContext` object that gets passed to the dialogue LLM, providing the structured context needed to produce accurate, character-consistent responses.

---

## The 6-Level Tone Matrix

Disposition is derived from the reputation system's `opinion_score` and maps to one of six levels. Each level defines three behavioral dimensions:

| Disposition | General Tone | Information Sharing | Player References |
|---|---|---|---|
| **adoring** | Warm, eager, genuinely happy to see the player | Shares freely, volunteers extras, may reveal secrets | References past help warmly and specifically |
| **friendly** | Welcoming, honest, at ease | Shares most things willingly, helpful | Acknowledges player positively, may bring up shared history |
| **neutral** | Polite, transactional, neither warm nor cold | Answers what's asked, no more | Treats player like any visitor |
| **wary** | Guarded, clipped responses, watchful | Minimal answers, evasive on sensitive topics | Doesn't reference history unless pressed |
| **hostile** | Cold, dismissive, may be confrontational | Refuses optional help, may misdirect | References past wrongs, cynical about player's motives |
| **hated** | Barely civil or openly contemptuous | Refuses interaction, may actively lie | Directly references the wrong done, no pretense |

The jump between each level should feel significant. A `wary` NPC is not just a slightly less warm `friendly` NPC -- they are fundamentally withholding, watching, guarded. The player should feel the shift in register immediately.

---

## Soul Modifier Rules

After the base tone template is selected from the matrix, soul-specific modifiers adjust the expression. These modifiers interact with the disposition to create character-specific variations.

| Condition | Effect |
|---|---|
| `temperament == "warm"` + `wary` disposition | Guarded with sadness, not bitterness. Sorrow behind the distance -- this NPC used to think better of the player. |
| `temperament == "suspicious"` or `"anxious"` + `friendly` disposition | Warm but still asks questions. Never fully relaxed -- friendliness is genuine but comes with a watchful edge. |
| `bitterness > 0.7` at any disposition | An edge or weariness colors every line. Even kind words carry the weight of accumulated disappointment. |
| `courage < 0.2` + `hostile` disposition | Passive-aggressive rather than confrontational. Hostility comes out sideways -- through omission, implication, and turned backs rather than direct challenge. |
| `temperament == "stoic"` at any disposition | Economy of words. Says less than most people would. Silence carries meaning. |
| `temperament == "melancholic"` at any disposition | Emotional undercurrents run deep. May express feelings through metaphor, story, or oblique reference. |
| `temperament == "gentle"` + `hostile` or `wary` disposition | Even disapproval is delivered gently. Disappointment rather than anger. More sorrow than confrontation. |

Multiple modifiers can stack. A stoic NPC with high bitterness at a wary disposition will produce clipped, weary, minimal dialogue that feels worn rather than aggressive.

---

## Memory Cue Formatting Rules

Memory cues prompt the dialogue LLM to reference specific past events naturally during conversation. They are drawn from the NPC's memories of the player and formatted differently based on the memory source.

### Direct memories (source: "direct")

The NPC witnessed or experienced this firsthand.

Format:
> "Reference, if natural, that you remember when the traveler {action}. You felt {valence}."

Example:
> "Reference, if natural, that you remember when the traveler defended the inn from brigands. You felt positive."

### Rumor memories (source: "rumor")

The NPC heard about this from someone else and is not certain of the details.

Format:
> "You heard (but aren't sure) that the traveler {action}. You're uncertain."

Example:
> "You heard (but aren't sure) that the traveler destroyed the shrine in the western woods. You're uncertain."

### Rules

- Maximum 3 memory cues per dialogue context
- Cues are selected by relevance to the current topic (if provided), falling back to highest-weight memories
- Cues are suggestions, not mandates -- the LLM should only reference them if it feels natural in the flow of conversation
- Valence guides emotional coloring but does not dictate exact words

---

## DialogueToneContext Assembly

The `buildDialogueTone` function in `engine/dialogue_tone.ts` assembles all pieces into a single `DialogueToneContext` object. Here is how each field is constructed:

### 1. npc_summary

A prose paragraph built from the soul file:

> "{name} is a {age}-year-old {occupation} with a {temperament} nature. They value {values} above all else, and their moral outlook is {moral_grain}. Quirks: {quirks}."

This gives the LLM the NPC's identity at a glance.

### 2. current_state

Passed directly from `soul.lived.current_state`. This is the NPC's present emotional and situational condition, which colors everything they say.

### 3. disposition_toward_player

Built from the reputation file:

- If reputation exists: `"Disposition: {disposition}. {first 2 sentences of internal_monologue}"`
- If no reputation: `"No prior relationship with the traveler."`

### 4. key_memories_summary

Top 2 most relevant memories, each summarized in one sentence:

- If a topic is provided, memories matching that topic are prioritized
- Otherwise, highest-weight memories are used
- Each summary is prefixed with its emotional valence: `[positive]`, `[neutral]`, or `[negative]`

### 5. tone_instructions

Derived from the disposition x soul matrix:

1. Look up the base tone template from the 6-level matrix
2. Apply soul modifier rules based on temperament and trait values
3. Combine into a single instruction string covering general tone, information sharing, player references, and any soul-specific adjustments

### 6. memory_cues

Max 3 cues formatted per the memory cue rules above. Selected from the most relevant or highest-weight memories.

### 7. world_context

Passed through directly from the caller. This is a snippet from `state.md` describing the current state of the world -- season, recent events, town atmosphere -- that the NPC would naturally be aware of.

---

## Input/Output Types

The function signature:

```typescript
function buildDialogueTone(
  request: DialogueRequest,
  soul: Soul,
  reputation: Reputation | null,
  memories: Memory[],
  worldContext: string,
): DialogueToneContext
```

All types are defined in `engine/types.ts`. The function is pure -- no async, no file I/O, no side effects.

---

## Design Notes

- The tone matrix is intentionally broad. It provides register guidance, not scripts. The LLM fills in the specifics using the soul and memory context.
- Soul modifiers stack but should not overwhelm the base disposition. Disposition is the primary axis; soul adjusts the expression.
- Memory cues are optional. A conversation with no relevant memories should still feel correctly toned -- the cues add specificity, not foundation.
- The system is designed for moments of return -- when the player comes back to a town after being away. The disposition they face is the consequence of everything they did before they left.
