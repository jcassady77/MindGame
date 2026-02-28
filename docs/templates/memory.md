---
# ============================================================
# MEMORY FILE — NPC Experience Record
# ============================================================
# Copy this template and fill in all fields for a new memory.
# See docs/memory-schema.md for full field definitions and rules.
# ============================================================
# File naming: <YYYY-MM-DD>_<slug>.md
#   Date = in-world calendar date, zero-padded (e.g. 0001-04-12)
#   Slug = lowercase kebab-case, 2-5 words (e.g. player-helped-harvest)
# Place in: world/town/npcs/<npc_id>/memories/
# ============================================================

# In-world date this memory was formed. Format: YYYY-MM-DD.
# Example: "0001-04-12"
date: ""

# What kind of experience this was.
# One of: interaction | observation | rumor | secondhand
#   interaction — NPC directly interacted with subject (weight 0.5–0.9)
#   observation — NPC witnessed without direct involvement (weight 0.3–0.6)
#   rumor       — heard from the grapevine, no trusted source (weight 0.1–0.4)
#   secondhand  — told by a trusted specific source (weight 0.3–0.6)
type: interaction

# Who this memory is about: "player" or an npc_id (e.g. "tomas-greenhollow").
subject: "player"

# Emotional color of this memory for the NPC.
# One of: positive | neutral | negative
emotional_valence: neutral

# How much this memory matters to the NPC. Range: 0.0–1.0.
# See docs/memory-schema.md Memory Types table for default ranges by type.
# Memories with weight > 0.7 never fade. Memories with weight < 0.3 fade first.
weight: 0.5

# How the NPC learned about this event.
# One of: direct | rumor
#   direct — NPC experienced or witnessed it firsthand
#   rumor  — NPC heard about it from someone else
source: direct

# Whether this memory has faded from active recall.
# Always false when first created. Set to true by the simulation engine
# when the memory is too old or low-weight to surface actively.
# Faded memories stay on disk but are excluded from context loading.
faded: false

# In-world date when this memory was marked faded, or null if still active.
# Format: YYYY-MM-DD. Only set when faded is changed to true.
fade_date: null
---

<!-- MEMORY BODY
     Write 2-5 sentences in the NPC's first-person voice.
     This is an internal thought, not a log entry or summary.
     It should reflect the NPC's core.temperament and lived.current_state.
     Be emotionally honest — let the NPC's feelings, doubts, and biases show.
     For rumors, reflect uncertainty: hedge, attribute the source, acknowledge
     that details may be wrong.

     Example (direct, positive):
       They didn't have to help. Nobody asked them to. But they saw
       the fence was down and just started working alongside me, quiet
       as anything. I don't trust easy, but that meant something.

     Example (rumor, uncertain):
       Mira says the traveler was seen near the granary the night it
       caught fire. I don't know what to make of that. Mira doesn't
       lie, but she does worry, and worry has a way of filling in
       gaps with the worst possible shape.
-->

[Write the NPC's memory here in their own voice. 2-5 sentences.
 Internal thought, emotionally honest, not a neutral log entry.]
