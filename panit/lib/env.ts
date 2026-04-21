/**
 * Sacred Voice — environment validation
 *
 * Security architecture:
 * - Validate configuration once per process (fail fast in production).
 * - Never import `getServerEnv` from Client Components — secrets would not ship, but keep the
 *   contract clear and avoid accidental client bundles pulling Node-only code paths.
 * - `NEXT_PUBLIC_*` keys are intentionally public; all other keys are server-only by convention.
 *
 * Edge note: `middleware.ts` must not import this module; keep Upstash reads direct there.
 */

import { z } from "zod";

const emptyToUndef = (v: unknown) => (v === "" ? undefined : v);

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "Invalid anon key"),

  /** Publishable checkout key (safe to expose). Prefer this over duplicating RAZORPAY_KEY_ID. */
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.preprocess(emptyToUndef, z.string().min(8).optional()),

  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "Invalid service role key"),

  /** Legacy OpenAI + voice pipeline (optional if using Ollama-only generation). */
  OPENAI_API_KEY: z.preprocess(emptyToUndef, z.string().min(10).optional()),
  ELEVENLABS_API_KEY: z.preprocess(emptyToUndef, z.string().min(10).optional()),
  ELEVENLABS_VOICE_ID: z.preprocess(emptyToUndef, z.string().min(1).optional()),

  RAZORPAY_KEY_ID: z.preprocess(emptyToUndef, z.string().min(8).optional()),
  RAZORPAY_KEY_SECRET: z.preprocess(emptyToUndef, z.string().min(8).optional()),
  RAZORPAY_WEBHOOK_SECRET: z.preprocess(emptyToUndef, z.string().min(8).optional()),

  /** Local Ollama (`/api/generate` text + image). */
  OLLAMA_BASE_URL: z.preprocess(emptyToUndef, z.string().url().optional()),
  OLLAMA_MODEL: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  OLLAMA_IMAGE_MODEL: z.preprocess(emptyToUndef, z.string().min(1).optional()),

  /** NOWPayments REST (`x-api-key`) for invoice creation. */
  NOWPAYMENTS_API_KEY: z.preprocess(emptyToUndef, z.string().min(10).optional()),
  /** e.g. `https://api.nowpayments.io/v1` or sandbox base — no trailing slash. */
  NOWPAYMENTS_API_BASE: z.preprocess(emptyToUndef, z.string().url().optional()),
  NOWPAYMENTS_CREDITS_PRICE_USD: z.preprocess(emptyToUndef, z.coerce.number().positive().optional()),
  NOWPAYMENTS_CREDITS_COUNT: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).optional()),
  /** Cryptocurrency to pay in (NOWPayments `pay_currency`), e.g. btc, eth, usdttrc20 */
  NOWPAYMENTS_PAY_CURRENCY: z.preprocess(emptyToUndef, z.string().min(2).max(32).optional()),

  RAZORPAY_CREDITS_PACK_AMOUNT_PAISE: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(100).optional(),
  ),
  RAZORPAY_CREDITS_PACK_COUNT: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1).optional(),
  ),

  NEXT_PUBLIC_APP_URL: z.preprocess(emptyToUndef, z.string().url().optional()),

  UPSTASH_REDIS_REST_URL: z.preprocess(emptyToUndef, z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: z.preprocess(emptyToUndef, z.string().min(10).optional()),

  /** NOWPayments IPN signature secret (optional; required to verify webhooks). */
  NOWPAYMENTS_IPN_SECRET: z.preprocess(emptyToUndef, z.string().min(8).optional()),

  /**
   * Cosine distance threshold for semantic_story_cache `<=>` match (lower = stricter).
   * Default in code: 0.22 if unset.
   */
  SEMANTIC_MATCH_MAX_DISTANCE: z.preprocess(emptyToUndef, z.coerce.number().min(0.05).max(0.6).optional()),

  /** Bearer secret for POST /api/worker (batch queue processor). Use a long random value in production. */
  WORKER_SECRET: z.preprocess(emptyToUndef, z.string().min(8).optional()),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Parsed, typed server environment. Throws if required vars are missing/invalid.
 *
 * For container/CI image builds that only inject secrets at runtime, set
 * `SKIP_ENV_VALIDATION=1` (see `.env.example`). Never enable that in a running production server.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    cached = process.env as unknown as ServerEnv;
    return cached;
  }
  cached = serverSchema.parse(process.env);
  return cached;
}

/** Razorpay key id for Checkout: public env first, then server key id (same value in most setups). */
export function getRazorpayKeyIdForClient(env: ServerEnv): string {
  return env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? env.RAZORPAY_KEY_ID ?? "";
}

export function getOllamaConfig(env: ServerEnv) {
  return {
    baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    textModel: env.OLLAMA_MODEL ?? "llama3",
    /** Ollama image model (e.g. `stablediffusion`, `flux` — must match `ollama pull`). */
    imageModel: env.OLLAMA_IMAGE_MODEL ?? "stablediffusion",
  };
}
