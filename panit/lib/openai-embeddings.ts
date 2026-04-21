/**
 * OpenAI text embeddings for semantic cache (server-only).
 */

import "server-only";

import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

const MODEL = "text-embedding-3-small";
const DIM = 1536;

/** Embedding for a normalized prompt (cost: one small embedding call). */
export async function embedPromptForSemanticCache(normalizedPrompt: string): Promise<number[]> {
  const env = getServerEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const input = normalizedPrompt.slice(0, 8000);
  const res = await client.embeddings.create({
    model: MODEL,
    input,
    dimensions: DIM,
  });
  const out = res.data[0]?.embedding;
  if (!out || out.length !== DIM) {
    throw new Error("Invalid embedding response");
  }
  return out;
}
