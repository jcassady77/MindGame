import express from "express";
import { callGemini } from "./gemini.js";
import { loadNPC, loadEnvironment, listNPCIds } from "./npc-loader.js";
import {
  replaceLivedBlock,
  replaceTownLivedBlock,
  updateLastSimulated,
  writeSoul,
  writeNPCMemory,
  writeEnvironmentContext,
  writeEnvironmentMemory,
  writeTownSoul,
  addYearsToDate,
} from "./npc-writer.js";

const app = express();
app.use(express.json());
const PORT = process.env.PORT ?? 3000;

// POST /chat
// Body: { npcId: string, playerMessage: string }
// Returns: { npcResponse: string }
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/chat", async (req, res) => {
  const { npcId, playerMessage } = req.body as { npcId: string; playerMessage: string };

  if (!npcId || !playerMessage) {
    res.status(400).json({ error: "npcId and playerMessage are required" });
    return;
  }

  let npc;
  try {
    npc = loadNPC(npcId);
  } catch {
    res.status(404).json({ error: `NPC not found: ${npcId}` });
    return;
  }

  const prompt = buildChatPrompt(npc.name, npc.coreBlock, npc.livedBlock, npc.memoriesContent, npc.lastSimulated, playerMessage);

  let geminiResponse;
  try {
    geminiResponse = await callGemini(prompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Gemini call failed: ${message}` });
    return;
  }

  const { newMemories, newSoul, npcResponse } = geminiResponse;

  // Write new memory file
  const slug = `player-interaction-${Date.now()}`;
  writeNPCMemory(npcId, npc.lastSimulated, slug, newMemories);

  // Update soul's lived section
  let updatedSoul = replaceLivedBlock(npc.soulContent, newSoul);
  writeSoul(npcId, updatedSoul);

  res.json({ npcResponse });
});

// POST /advance-time
// Body: { years: number }
// Returns: { environmentContext: string }
app.post("/advance-time", async (req, res) => {
  const { years } = req.body as { years: number };

  if (!years || typeof years !== "number" || years < 1) {
    res.status(400).json({ error: "years must be a positive integer" });
    return;
  }

  // Step 1: Generate world events
  const env = loadEnvironment();
  const worldPrompt = buildWorldPrompt(env.currentContext, env.livedBlock, years);

  let worldResponse;
  try {
    worldResponse = await callGemini(worldPrompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Gemini world call failed: ${message}` });
    return;
  }

  const environmentContext = worldResponse.npcResponse;

  // Persist environment context and update town soul
  writeEnvironmentContext(environmentContext);
  if (worldResponse.newMemories) {
    writeEnvironmentMemory(`${String(new Date().getFullYear()).padStart(4, "0")}-01-01`, "world-advance", worldResponse.newMemories);
  }
  if (worldResponse.newSoul && env.townContent) {
    const updatedTown = replaceTownLivedBlock(env.townContent, worldResponse.newSoul);
    writeTownSoul(updatedTown);
  }

  // Step 2: Update all NPCs in parallel
  const npcIds = listNPCIds();

  const results = await Promise.allSettled(
    npcIds.map(async (npcId) => {
      const npc = loadNPC(npcId);
      const newDate = addYearsToDate(npc.lastSimulated, years);
      const newAge = npc.age + years;

      const npcPrompt = buildTimeAdvancePrompt(
        npc.name,
        npc.age,
        newAge,
        environmentContext,
        npc.soulContent,
        npc.coreBlock,
        npc.livedBlock,
        npc.memoriesContent,
        newDate,
        years
      );

      const npcResponse = await callGemini(npcPrompt);

      writeNPCMemory(npcId, newDate, "time-passage", npcResponse.newMemories);

      let updatedSoul = replaceLivedBlock(npc.soulContent, npcResponse.newSoul);
      updatedSoul = updateLastSimulated(updatedSoul, newDate);
      writeSoul(npcId, updatedSoul);
    })
  );

  const npcErrors = results
    .map((r, i) => r.status === "rejected" ? `${npcIds[i]}: ${r.reason}` : null)
    .filter(Boolean) as string[];

  const response: { environmentContext: string; errors?: string[] } = { environmentContext };
  if (npcErrors.length > 0) response.errors = npcErrors;

  res.json(response);
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`MindGame server running on http://0.0.0.0:${PORT}`);
});

// --- Prompt builders ---

function buildChatPrompt(
  name: string,
  coreBlock: string,
  livedBlock: string,
  memoriesContent: string,
  lastSimulated: string,
  playerMessage: string
): string {
  const memoriesSection = memoriesContent
    ? `## Your Memories (most recent first)\n${memoriesContent}`
    : "## Your Memories\nYou have no memories yet.";

  return `You are roleplaying as ${name}.

## Your Immutable Core
\`\`\`core
${coreBlock}
\`\`\`

## Your Current Soul State
\`\`\`lived
${livedBlock}
\`\`\`

${memoriesSection}

## The Player Says
"${playerMessage}"

Respond in character as ${name}.

Return exactly:
- npcResponse: What you say aloud (1–5 sentences, in your voice, shaped by your temperament and current emotional state)
- newMemories: A complete memory file for this interaction. Use YAML frontmatter between --- fences (fields: date: "${lastSimulated}", type, subject, emotional_valence, weight, source, faded: false, fade_date: null), then a blank line, then 2–5 sentences in first-person. Assign emotional_valence and weight based on how this felt to you.
- newSoul: Only the updated content that goes between the \`\`\`lived fences. Update current_state to reflect this interaction. You may adjust individual trait current values by at most ±0.05 if the interaction genuinely affected you. Keep all other fields identical.`;
}

function buildWorldPrompt(currentContext: string, livedBlock: string, years: number): string {
  return `You are the narrator of a living medieval town called Hearthfield.

## Current Town Soul State
\`\`\`lived
${livedBlock || "population: 247\nprosperity: 0.55\nsocial_atmosphere: 0.65\nsafety: 0.7\ncurrent_state: The town is newly established."}
\`\`\`

## Most Recent Historical Context
${currentContext}

${years} year${years > 1 ? "s have" : " has"} passed. Narrate what happened to the town during this period.
- Write exactly ${years} sentence${years > 1 ? "s" : ""}, one per year, in chronological order
- In most years (70%), the town grew or prospered quietly
- In some years (20%), there was hardship: drought, illness, political tension, or a harsh winter
- Rarely (10% per year), a catastrophic event struck: plague, invasion, great fire, flood, or famine
- Events should feel interconnected where natural (a drought leading to famine, an invasion leaving trauma)

Return:
- npcResponse: The full town narrative (${years} sentence${years > 1 ? "s" : ""}, one per year, written as an outside historical observer)
- newMemories: A summary memory entry for the town's record. YAML frontmatter between --- fences, then 2–5 sentences describing the period as a whole.
- newSoul: The updated content for the town's lived block — adjust prosperity, social_atmosphere, safety, population, and current_state to reflect these years.`;
}

function buildTimeAdvancePrompt(
  name: string,
  oldAge: number,
  newAge: number,
  environmentContext: string,
  soulContent: string,
  coreBlock: string,
  livedBlock: string,
  memoriesContent: string,
  newDate: string,
  years: number
): string {
  const memoriesSection = memoriesContent
    ? `## Your Memories Before These Years\n${memoriesContent}`
    : "## Your Memories Before These Years\nNone recorded.";

  return `${years} year${years > 1 ? "s have" : " has"} passed. You are ${name}, now ${newAge} years old (previously ${oldAge}).

## What Happened in the World During These Years
${environmentContext}

## Your Soul Before These Years
### Core (immutable)
\`\`\`core
${coreBlock}
\`\`\`

### Lived State
\`\`\`lived
${livedBlock}
\`\`\`

${memoriesSection}

Reflect on these years and generate:
- newMemories: 1–3 significant personal memories from this period. Write them as a single string containing one or more complete memory files (YAML frontmatter between --- fences, then 2–5 first-person sentences). Separate multiple memories with a line containing only "---". Use date "${newDate}". Let world events and your core values shape what you remember.
- newSoul: The updated content for your lived block. Age, time, and world events have changed you. Update current_state to reflect who you are now. Trait drift should feel earned — max ±0.10 change per trait across all ${years} year${years > 1 ? "s" : ""}. Update tendencies if any traits crossed a meaningful threshold.
- npcResponse: Write "N/A"`;
}
