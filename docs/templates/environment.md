## Core

<!-- Core Identity -- IMMUTABLE after creation.
     These fields define the town's founding character.
     They influence catastrophic event probabilities and LLM narrative.
     See docs/environment-schema.md for full field definitions and rules. -->

```core
# What kind of settlement this is.
# Examples: "agricultural village", "mining outpost", "coastal trading town",
#           "forest commune", "border fortress town"
archetype: ""

# 1-2 paragraphs describing how the town was founded and what shaped
# its early identity. Written from a neutral historical perspective.
# Use YAML multiline syntax (|) for multi-line text.
founding_story: |
  [Write the town's founding story here. Describe who settled it,
  why they chose this location, and how the settlement grew into
  what it is today. 1-2 paragraphs, in-world perspective.]

# One-sentence description of the town's personality.
# Think of this as the town's temperament -- how outsiders would
# describe its collective character.
# Example: "tight-knit and self-reliant, with a streak of hospitality for those who earn it"
character: ""

# 2-5 geographic features that define the town's location.
# These affect catastrophic event probabilities:
#   - "river" in a trait increases flood chance (1.2% -> 2.5%)
#   - Other traits may be used by future systems
# Examples: "river access", "forest border", "coastal cliffs",
#           "mountain pass", "fertile valley", "arid plateau"
geographic_traits:
  - ""
  - ""

# 2-5 values that define what the townspeople hold dear.
# Parallel to an NPC's core.values[]. Used by LLM narrative generation.
# Examples: "self-reliance", "hospitality", "tradition", "honest labor",
#           "faith", "commerce", "military discipline", "artistic expression"
cultural_values:
  - ""
  - ""
```

## Lived

<!-- Lived State -- MUTABLE, updated by the Environment Advance Engine.
     These fields change over time due to gradual drift, catastrophic events,
     and recovery arcs.
     See docs/environment-schema.md for drift rules, event tables, and recovery arcs. -->

```lived
# Current population count. Changes via gradual growth/decline
# and catastrophic events. Minimum value: 1.
population: 0

# Overall economic health. Range: 0.0-1.0.
# Key thresholds:
#   > 0.6  -- triggers new construction (if 12+ months elapsed)
#   > 0.5  -- triggers population growth (2-8 per 6 months)
#   < 0.35 -- triggers population decline (1-5 per 6 months)
#   < 0.3  -- enables famine catastrophic event
prosperity: 0.5

# Infrastructure tracks buildings and overall structural condition.
infrastructure:
  # Overall condition. One of: thriving | stable | declining | damaged | ruined
  # Set to "damaged" by floods. Recovers through recovery arcs.
  condition: stable
  # Named buildings in the town. Can be destroyed by catastrophic events
  # (invasion, fire) or added via prosperity-driven construction.
  notable_buildings:
    - ""
  # Buildings added during the most recent advance step.
  # Cleared each step. Empty list [] at creation.
  recent_construction: []

# How cohesive and positive the community feels. Range: 0.0-1.0.
# Drops sharply from catastrophic events (especially plague and famine).
# Recovers slowly through recovery arcs (+0.01 per step).
social_atmosphere: 0.5

# How safe the town and surrounding area are. Range: 0.0-1.0.
# Key threshold:
#   < 0.5 -- triples invasion probability (1% -> 3%)
safety: 0.5

# 2-3 sentences describing the town's current feel.
# Written as what a returning traveler would notice first.
# Regenerated each simulation step by the Environment Advance Engine via LLM.
current_state: |
  [Describe what the town feels like right now. Write from the
  perspective of a returning traveler -- sensory, specific, honest.
  2-3 sentences.]

# Active catastrophic injuries. Empty list [] at creation.
# Populated by the Environment Advance Engine when catastrophic events occur.
# Each entry:
#   event_ref:      memory filename, format: <YYYY-MM-DD>_<slug>.md
#   trait_affected:  which town stat was damaged (population, prosperity, safety, infrastructure)
#   drift_amount:    magnitude of the damage (negative)
#   since_date:      in-world date, format: YYYY-MM-DD
wounds: []

# Recovery completions. Empty list [] at creation.
# Populated when wounds fully heal after 18+ months.
# Same structure as wounds, but drift_amount is positive (recovery).
growth: []
```
