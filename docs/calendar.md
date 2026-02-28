# In-World Calendar System

**Version:** 1.0
**Status:** Canonical
**Defined by:** TODO-05
**Consumed by:** TODO-03 (memory file naming), TODO-06 (advance_world), TODO-07 (state snapshot tracking)

---

## Overview

Time in MindGame is not cosmetic. The calendar drives aging, memory timestamps, world simulation, economic shifts, relationship changes, and death. Every date recorded in a soul file, memory file, or state snapshot uses this calendar.

The world uses a 12-month year divided into 4 seasons of 3 months each. Each month has exactly 30 days, giving every year a clean 360-day cycle. The calendar begins at Year 1 — the player's first day in town.

---

## Year Structure

Each year contains 4 seasons. Each season contains 3 months. Each month contains 30 days.

| Season | Month # | Month Name | Flavor |
|---|---|---|---|
| **Season of Thaw** | 1 | Firstmelt | Snow retreats. Icicles weep from eaves. The ground softens and the first brave green pushes through mud. |
| | 2 | Greenrise | The world remembers how to grow. Fields turn, saplings bud, and birdsong returns to the morning air. |
| | 3 | Bloomtide | Wildflowers flood the meadows. The air is thick with pollen and promise. Planting season reaches its peak. |
| **Season of Heat** | 4 | Sundrift | Long days and lazy heat. The sun lingers as if reluctant to set. Rivers slow and the roads turn to dust. |
| | 5 | Highburn | The hottest month. Wells run low, tempers run high, and shade becomes currency. Work slows to a crawl. |
| | 6 | Ashmonth | The land is spent. Grass browns, fires break out in dry timber, and the air smells of char and exhaustion. |
| **Season of Harvest** | 7 | Goldfall | The first cool wind. Leaves turn amber and copper. The harvest begins and the town works from dawn to dark. |
| | 8 | Reapmoon | The second harvest month, lit by a low orange moon. Granaries fill. Debts are settled before winter. |
| | 9 | Lastlight | The final warmth. Days shorten noticeably. What isn't stored now won't be stored at all. A bittersweet month. |
| **Season of Dark** | 10 | Deepcold | Winter arrives without apology. Snow buries the roads. The town turns inward, living on what it saved. |
| | 11 | Ironwatch | The hardest month. The cold is iron, the nights are long, and the old and the sick are most at risk. |
| | 12 | Stillnight | The world holds its breath. The longest nights of the year. Then, near the end, the first distant thaw. |

### Season Boundaries

- **Season of Thaw:** Months 1-3 (Firstmelt through Bloomtide)
- **Season of Heat:** Months 4-6 (Sundrift through Ashmonth)
- **Season of Harvest:** Months 7-9 (Goldfall through Lastlight)
- **Season of Dark:** Months 10-12 (Deepcold through Stillnight)

### Month Name Lookup

For programmatic use, the mapping from month number to name:

```
1  → Firstmelt
2  → Greenrise
3  → Bloomtide
4  → Sundrift
5  → Highburn
6  → Ashmonth
7  → Goldfall
8  → Reapmoon
9  → Lastlight
10 → Deepcold
11 → Ironwatch
12 → Stillnight
```

---

## Date Format

### Canonical Format

All dates in MindGame use the format:

```
YYYY-MM-DD
```

- **YYYY** — Year, zero-padded to 4 digits. Year 1 = `0001`, Year 42 = `0042`.
- **MM** — Month, zero-padded to 2 digits. Firstmelt = `01`, Stillnight = `12`.
- **DD** — Day, zero-padded to 2 digits. Day 1 = `01`, Day 30 = `30`.

This format is used everywhere: soul file `last_simulated` fields, memory file prefixes, wound and growth `since_date` fields, and state snapshots.

### Examples

| In-World Meaning | Canonical Date |
|---|---|
| The very first day of the game | `0001-01-01` |
| Year 1, Highburn 15 | `0001-05-15` |
| Year 3, Goldfall 4 | `0003-07-04` |
| Year 10, Stillnight 30 (last day of Year 10) | `0010-12-30` |
| Year 14, Ashmonth 22 | `0014-06-22` |

### Human-Readable Rendering

When displaying dates to the player or in narrative text, use one of these forms:

- **Short form:** `"Year 3, Goldfall 4"` — used in UI elements, memory headers, and compact references.
- **Long form:** `"the 4th of Goldfall, Year 3"` — used in narrative prose, dialogue, and flavor text.
- **Seasonal form:** `"early in the Season of Harvest, Year 3"` — used for vague references where exact dates are not important.

### Conversion Rule

To convert canonical format to human-readable:
1. Strip leading zeros from the year: `0003` becomes `3`.
2. Map the month number to its name: `07` becomes `Goldfall`.
3. Strip the leading zero from the day: `04` becomes `4`.
4. Assemble: `"Year 3, Goldfall 4"` or `"the 4th of Goldfall, Year 3"`.

---

## Quest Duration Guidelines

These are guidelines, not hard rules. Individual quests may set any `duration_months` value in their metadata. The table provides a reference for typical pacing.

| Quest Type | Example | In-World Time |
|---|---|---|
| Local errand | Resolve a dispute in town | 0 months (same day) |
| Short local quest | Investigate something in the woods | 1 month |
| Regional quest | Travel to a nearby settlement | 2-3 months |
| Long expedition | Journey to a distant land | 6-12 months |
| Epic campaign | Campaign across multiple regions | 12-24 months |

### How Quest Duration Drives Simulation

When a quest completes, the world advances by `duration_months` months. This means:

- A local errand (`0 months`) triggers no world simulation — the town is exactly as you left it.
- A short local quest (`1 month`) triggers one simulation step. Minor changes may occur.
- A regional quest (`2-3 months`) allows relationships to shift, economic statuses to update, and aging to tick forward.
- A long expedition (`6-12 months`) can produce births, deaths, new relationships, and significant economic change.
- An epic campaign (`12-24 months`) may transform the town. Children grow up. The elderly may die. Entire relationship networks can reshape.

The `advance_world` function (TODO-06) processes each elapsed month as a simulation step, applying life events, drift, and state changes accordingly.

---

## Life Pacing

This table defines how major life events are timed against the calendar. All intervals are measured in elapsed in-world months.

| Event | Check Interval | Notes |
|---|---|---|
| Aging | Every 12 months | NPC `age` field increments by 1. Checked against the NPC's `last_simulated` date. |
| Elderly death check | Every 6 months | Random roll, weighted by age. Probability increases sharply past age 65. |
| Pregnancy to birth | ~9 months | Counted from the relationship milestone that triggers conception. |
| Child to adult (recruitable) | At age 18 | Tracked via the soul file `age` field. At 18, the NPC becomes available for party recruitment. |
| Economic status shift | Every 3 months | Random check influenced by occupation, faction, and recent events. Status may move up or down one tier. |
| Relationship formation/dissolution | Every 2 months | NPCs may form friendships, romances, marriages, or break existing bonds. Influenced by proximity, shared experiences, and trait compatibility. |
| Memory fade check | Every 6 months | Memories with `weight < 0.3` are candidates for fading. Faded memories are not deleted but may lose further weight or be summarized. |
| Soul drift step | Once per `advance_world` call | Applied every simulation step regardless of how many months elapsed. Drift follows the rules defined in the Soul Schema (TODO-01). |

### Pacing Example

A player departs on a 12-month expedition. When they return, the simulation has processed 12 monthly steps. During those steps:

- Every NPC has aged 1 year.
- 2 elderly death checks have occurred (at month 6 and month 12).
- 4 economic status checks have occurred (at months 3, 6, 9, and 12).
- 6 relationship checks have occurred (at months 2, 4, 6, 8, 10, and 12).
- 2 memory fade checks have occurred (at months 6 and 12).
- 12 soul drift steps have been applied.
- Any NPC who was 8+ months pregnant at departure may have given birth.

---

## Calendar Math

### Months Between Two Dates

To compute the number of months elapsed between date A and date B:

```
months_elapsed = (yearB - yearA) * 12 + (monthB - monthA)
```

The day component is ignored for month-level simulation. If finer granularity is needed in the future, days can be compared directly (all months have 30 days, so day math is straightforward).

**Examples:**

| Date A | Date B | Calculation | Result |
|---|---|---|---|
| `0001-01-01` | `0001-04-15` | (1-1)*12 + (4-1) | 3 months |
| `0001-01-01` | `0002-01-01` | (2-1)*12 + (1-1) | 12 months |
| `0003-07-04` | `0005-02-18` | (5-3)*12 + (2-7) | 19 months |
| `0001-01-01` | `0001-01-20` | (1-1)*12 + (1-1) | 0 months (same month) |

### Adding N Months to a Date

To add `N` months to a date:

```
new_month = ((month - 1 + N) % 12) + 1
new_year  = year + floor((month - 1 + N) / 12)
day       = unchanged (clamped to 30 if needed, though all months are 30 days)
```

**Examples:**

| Start Date | Add | Calculation | Result |
|---|---|---|---|
| `0001-01-15` | 3 months | month: ((1-1+3)%12)+1=4, year: 1+floor(3/12)=1 | `0001-04-15` |
| `0001-10-01` | 5 months | month: ((10-1+5)%12)+1=3, year: 1+floor(14/12)=2 | `0002-03-01` |
| `0003-12-30` | 1 month | month: ((12-1+1)%12)+1=1, year: 3+floor(12/12)=4 | `0004-01-30` |
| `0001-01-01` | 24 months | month: ((1-1+24)%12)+1=1, year: 1+floor(24/12)=3 | `0003-01-01` |

### Year Boundaries and Aging

Aging is tracked by months elapsed, not by calendar year rollover. An NPC ages 1 year every 12 months of simulation time, regardless of where those months fall in the calendar.

- An NPC born at the start of Year 1 who is simulated through to `0002-01-01` has experienced 12 months and ages by 1 year.
- An NPC whose `last_simulated` is `0003-07-01` and who is next simulated at `0004-07-01` has experienced 12 months and ages by 1 year.
- Partial years do not count. If only 11 months have elapsed since the last aging event, the NPC does not age. The remaining month carries forward.

For implementation, each NPC tracks when they last aged (derived from `last_simulated`). The simulation computes months elapsed since that point and applies `floor(months_elapsed / 12)` years of aging.

---

## Starting Date

The game world begins at:

```
0001-01-01 — Year 1, Firstmelt 1
```

This is the player's first day in town. The first morning. Snow is melting. The Season of Thaw is just beginning.

All NPC ages at game start represent how old they are on this date. All backstory events — the fever winter, old wars, founding of the town — are expressed as narrative text in soul file `backstory` fields, not as simulated dates. There are no dates before `0001-01-01`.

### Why Firstmelt?

Starting in the Season of Thaw means the player arrives as the world is waking up. The town is shaking off winter. There is a sense of beginning — new growth, new possibilities. It also means the player's first long expedition will likely carry them through summer and into harvest, returning to a town that has visibly changed with the seasons.

---

## Schema Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | Initial | Full calendar specification |
