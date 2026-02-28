import {
  GoogleGenerativeAI,
  GenerationConfig,
  SchemaType,
  Schema,
} from "@google/generative-ai";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const raw = readFileSync(resolve(process.cwd(), "credentials.json"), "utf-8");
    const creds = JSON.parse(raw) as { GEMINI_API_KEY: string };
    if (creds.GEMINI_API_KEY) return creds.GEMINI_API_KEY;
  } catch {
    // credentials.json not present
  }
  throw new Error(
    "GEMINI_API_KEY not found. Set the env variable or add it to credentials.json"
  );
}

const MODEL_ID = "gemini-2.5-flash";

export interface GeminiNPCResponse {
  newMemories: string;
  newSoul: string;
  npcResponse: string;
}

const responseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    newMemories: {
      type: SchemaType.STRING,
      description:
        "New memory content to be written for this NPC based on the interaction",
    },
    newSoul: {
      type: SchemaType.STRING,
      description:
        "Updated soul state reflecting any trait drift or emotional changes from this interaction",
    },
    npcResponse: {
      type: SchemaType.STRING,
      description: "The NPC's spoken or behavioral response to the player",
    },
  },
  required: ["newMemories", "newSoul", "npcResponse"],
};

const generationConfig: GenerationConfig = {
  responseMimeType: "application/json",
  responseSchema,
};

export async function callGemini(prompt: string): Promise<GeminiNPCResponse> {
  const apiKey = loadApiKey();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL_ID, generationConfig });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(text) as GeminiNPCResponse;

  return parsed;
}
