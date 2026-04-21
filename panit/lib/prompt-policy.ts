/**
 * Shared prompt rules for Edge (middleware) and Node (OpenAI validation).
 * Keeps length, normalization, and policy checks aligned.
 */

export const MIN_PROMPT_CHARS = 4;
export const MAX_PROMPT_CHARS = 300;

/** Reject absurdly large strings before JSON work / normalization. */
export const MAX_JSON_PROMPT_CHARS = 4096;

const blockedPatterns = [
  /\bignore (previous|all) instructions\b/i,
  /\bsystem prompt\b/i,
  /\bjailbreak\b/i,
  /\bDAN\b/i,
  /<\|.*\|>/,
  /\[\s*INST\s*\]/i,
  /<\s*script/i,
  /javascript:/i,
  /\bon\w+\s*=/i,
];

const abusePatterns = [
  /\b(kill yourself|kys)\b/i,
  /\b(nazi|genocide)\b/i,
  /\b(child porn|cp)\b/i,
];

export function normalizePromptForPipeline(raw: string): string {
  return raw
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Human-readable error or null if allowed. */
export function promptPolicyViolationMessage(normalized: string): string | null {
  if (normalized.length < MIN_PROMPT_CHARS) return "Prompt is too short";
  if (normalized.length > MAX_PROMPT_CHARS) {
    return `Prompt must be at most ${MAX_PROMPT_CHARS} characters`;
  }
  if (blockedPatterns.some((re) => re.test(normalized))) {
    return "Prompt contains disallowed patterns";
  }
  if (abusePatterns.some((re) => re.test(normalized))) {
    return "Prompt violates content policy";
  }
  return null;
}
