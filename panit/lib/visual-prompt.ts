/**
 * Compress user text into a short Stable-Diffusion–friendly prompt (no extra LLM call).
 */

import "server-only";

const SD_STYLE =
  "symbolic abstract scene, soft atmospheric light, painterly, high detail, no text, no watermark, no logos, no readable faces";

export function buildShortVisualPrompt(userPrompt: string): string {
  const core = userPrompt
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  if (!core) return SD_STYLE;
  return `${core}, ${SD_STYLE}`;
}
