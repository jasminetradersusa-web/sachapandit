# Sacred Voice — production layout

Next.js 14 App Router stack: Supabase (Postgres + Auth + Storage + RLS), optional Ollama (local LLM + image models), Razorpay + NOWPayments, Upstash rate limits.

## Top-level

```
app/                    # Routes (App Router)
  api/                  # Route handlers (server)
    generate/           # POST — Ollama text, cache by prompt_hash, credits
    image/              # POST — Ollama image → Storage, base64 + credits
    create-payment/     # POST — Razorpay order | NOWPayments invoice
    webhook-nowpayments/
    webhook-razorpay/
    share/              # Public proxies (audio, image, view counter)
    queue/ worker/ voice/ …  # Optional batch / voice pipeline
  auth/
  create/ dashboard/ share/[shareId]/
  layout.tsx globals.css page.tsx
components/             # Client + server UI
lib/                    # Server utilities (supabase, ollama, payments, rate-limit, hash)
middleware.ts           # IP limits, auth gates, daily free-tier hints
supabase/migrations/    # Schema, RLS, RPCs (credits, webhooks)
types/database.ts       # Generated / hand-maintained DB types
```

## Feature → code map

| Area | Location |
|------|-----------|
| Ollama text | `lib/ollama.ts`, `app/api/generate/route.ts` |
| Ollama image + Storage | `lib/ollama.ts`, `app/api/image/route.ts` |
| SHA-256 prompt cache | `lib/prompt-hash.ts`, `generations.prompt_hash` |
| Credits (3/day UTC free + balance) | `supabase/migrations/*ollama*credits*`, `consume_generation_credit` RPC |
| NOWPayments | `lib/payments.ts` (`createNowPaymentsInvoice`, `verifyNowPaymentsIpnSignature`), `app/api/create-payment`, `app/api/webhook-nowpayments` |
| Razorpay | `lib/payments.ts`, `app/api/create-payment`, `app/api/webhook-razorpay` |
| Public share (no prompt / user id) | `lib/share-data.ts`, `app/share/[shareId]/page.tsx`, `app/api/share/*` |
| Rate limits | `lib/rate-limit.ts`, `middleware.ts` |
| Env (no secrets on client) | `lib/env.ts`, `.env.example` |

## Deploy checklist

1. Run all `supabase/migrations` in order; confirm RLS enabled on user tables.
2. Set `NEXT_PUBLIC_*`, `SUPABASE_SERVICE_ROLE_KEY`, payment keys, `NOWPAYMENTS_IPN_SECRET`, optional `UPSTASH_*`.
3. Point NOWPayments IPN to `https://<domain>/api/webhook-nowpayments`.
4. Ollama: `OLLAMA_BASE_URL` reachable from the Node server (not the browser).
