# Game State

**Endpoint:** `GET /state`
**File:** `world/state.json`

---

## Response Shape

```json
{
  "currentDate": "0009-01-01",
  "objectives": [
    {
      "npcId": "brynn-ashford",
      "npcName": "Brynn Ashford",
      "position": { "x": 342, "z": 718 },
      "completed": false
    }
  ]
}
```

## Fields

| Field | Type | Description |
|---|---|---|
| `currentDate` | `string` | Current in-world date (`YYYY-MM-DD`). Updated on each `advance-time` call. |
| `objectives` | `Objective[]` | The active set of NPCs the player must speak with before time can advance. |

### Objective

| Field | Type | Description |
|---|---|---|
| `npcId` | `string` | Kebab-case NPC identifier. Use this as the `npcId` param in `POST /chat`. |
| `npcName` | `string` | Display name. |
| `position` | `{ x: number, z: number }` | NPC's position on the 1000×1000 world grid. Stable across sessions — generated once in `world/positions.json`. |
| `completed` | `boolean` | `true` once the player has spoken with this NPC and the conversation ended with `"Good bye."` |

---

## Lifecycle

1. **On server start** — if `world/state.json` does not exist, it is created with 4 randomly selected alive NPCs and the current in-world date.
2. **After `POST /chat`** — if the NPC's response ends with `"Good bye."`, their objective is marked `completed: true`.
3. **`POST /advance-time`** — blocked with `403` if any objective is incomplete. On success, resets objectives with a new random set of alive NPCs for the next era.

---

## Related Files

| File | Purpose |
|---|---|
| `world/state.json` | Live game state (objectives + current date) |
| `world/positions.json` | Persistent NPC positions on the world grid |
