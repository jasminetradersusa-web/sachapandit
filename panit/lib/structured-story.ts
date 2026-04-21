import { z } from "zod";

export const structuredStorySchema = z.object({
  text: z.string().min(20).max(8000),
  tone: z.string().min(2).max(80),
  suggestedVoiceStyle: z.enum([
    "warm_narrator",
    "calm_reflective",
    "soft_whisper",
    "clear_storyteller",
  ]),
});

export type StructuredStory = z.infer<typeof structuredStorySchema>;
