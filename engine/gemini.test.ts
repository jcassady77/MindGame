import { callGemini } from "./gemini.js";

const TEST_PROMPT = `
You are roleplaying as Mira Blackwood, a warm herbalist in a small medieval town.
A traveler just helped rescue a child from a collapsed well. You witnessed the whole thing.

Respond with:
- newMemories: a short first-person memory of what you just saw
- newSoul: a one-sentence update to your emotional state after this event
- npcResponse: what you say out loud to the traveler
`;

async function main() {
  console.log("Testing Gemini connector...\n");

  const result = await callGemini(TEST_PROMPT);

  console.log("✓ Response received\n");
  console.log("newMemories:", result.newMemories);
  console.log("\nnewSoul:", result.newSoul);
  console.log("\nnpcResponse:", result.npcResponse);

  const keys: (keyof typeof result)[] = ["newMemories", "newSoul", "npcResponse"];
  for (const key of keys) {
    if (typeof result[key] !== "string" || result[key].trim() === "") {
      throw new Error(`Field "${key}" is missing or empty`);
    }
  }

  console.log("\n✓ All fields present and non-empty");
}

main().catch((err) => {
  console.error("✗ Test failed:", err.message);
  process.exit(1);
});
