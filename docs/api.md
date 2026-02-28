# API Reference

Base URL: `http://localhost:3000`

---

## GET /health

Health check.

**Response**
```json
{ "status": "ok" }
```

---

## GET /state

Returns the current game state including active objectives.

**Response**
```json
{
  "currentDate": "0009-01-01",
  "objectives": [
    {
      "npcId": "brynn-ashford",
      "npcName": "Brynn Ashford",
      "position": { "x": -42, "z": 117 },
      "completed": false
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `currentDate` | `string` | Current in-world date (`YYYY-MM-DD`) |
| `objectives[].npcId` | `string` | NPC identifier — use as `npcId` in `POST /chat` |
| `objectives[].npcName` | `string` | Display name |
| `objectives[].position.x` | `number` | X position on world grid (-150 to 150) |
| `objectives[].position.z` | `number` | Z position on world grid (-150 to 150) |
| `objectives[].completed` | `boolean` | `true` once the player has concluded a conversation with this NPC |

---

## POST /chat

Send a player message to an NPC and receive their response. Persists a new memory and updates the NPC's soul state.

**Request**
```json
{
  "npcId": "brynn-ashford",
  "playerMessage": "Hello Brynn, how are you today?"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `npcId` | `string` | yes | Kebab-case NPC identifier (from `GET /state`) |
| `playerMessage` | `string` | yes | What the player says to the NPC |

**Response**
```json
{
  "npcResponse": "Well enough, thank you for asking. The inn's been busy. What can I do for you?",
  "conversationEnded": false
}
```

| Field | Type | Description |
|---|---|---|
| `npcResponse` | `string` | What the NPC says aloud |
| `conversationEnded` | `boolean` | `true` if the NPC ended the conversation with `"Good bye."` — the UI should disengage and call `GET /state` to refresh objectives |

**Error Responses**

| Status | Reason |
|---|---|
| `400` | `npcId` or `playerMessage` missing |
| `404` | NPC not found |
| `500` | Gemini call failed |

---

## POST /advance-time

Simulates N years passing. Updates all NPC souls and memories, generates world events, and resets objectives. Blocked if any objective is incomplete.

**Request**
```json
{
  "years": 2
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `years` | `number` | yes | Number of years to advance (positive integer) |

**Response**
```json
{
  "environmentContext": "A bountiful harvest brought prosperity to Hearthfield. The following year saw a harsh winter that tested the town's resilience.",
  "objectives": [
    {
      "npcId": "rowan-steelmark",
      "npcName": "Rowan Steelmark",
      "position": { "x": 88, "z": -134 },
      "completed": false
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `environmentContext` | `string` | Narrative of what happened in the world during the elapsed years (one sentence per year) |
| `objectives` | `Objective[]` | Fresh set of objectives for the new era (same shape as `GET /state`) |
| `errors` | `string[]` | *(optional)* List of NPCs that failed to update |

**Error Responses**

| Status | Reason |
|---|---|
| `400` | `years` missing or not a positive integer |
| `403` | Not all objectives are complete — includes `incompleteObjectives: string[]` listing the NPC names still outstanding |
| `500` | Gemini world call failed |

**403 Example**
```json
{
  "error": "Cannot advance time until all objectives are complete.",
  "incompleteObjectives": ["Brynn Ashford", "Rowan Steelmark"]
}
```
