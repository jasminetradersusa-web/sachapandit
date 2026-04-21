# Supabase security model (Sacred Voice)

## Auth flow (Supabase Auth + Next.js)

1. **Browser** calls `signInWithOtp` with the **anon** key only; no service role in the client.
2. Supabase emails a **one-time magic link** pointing to `/auth/callback?code=...&next=...`.
3. **Route handler** `app/auth/callback` runs `exchangeCodeForSession` via `@supabase/ssr`; session tokens are stored in **HttpOnly** cookies.
4. **Middleware** and **server clients** (`createServerSupabaseClient`) read the session from cookies; **`auth.uid()`** is set for RLS.
5. **Privileged work** (webhooks, storage cache paths, signing URLs, payment inserts) uses **`createAdminSupabaseClient`** (service role) only on the server, never in client bundles.

### Hardening checklist (Dashboard)

- Authentication → enable **email confirmations** as required for your threat model.
- Consider **MFA** for admin accounts; restrict Dashboard access.
- URL configuration: set **Site URL** and **Redirect URLs** to your production domain; disallow open redirects.
- Use **JWT expiry** appropriate for your app; rely on refresh via SSR.

## Row Level Security

- **RLS is enabled** on `profiles`, `generations`, `payment_orders`, `payments`, `webhook_events`.
- **`anon`** has **no** privileges on those tables (see migration `20260423120000_rls_hardening.sql`).
- **Authenticated** users may only **SELECT** (and where noted **INSERT/UPDATE/DELETE**) rows tied to **`auth.uid()`** via policies.
- **`profiles`**: clients may **not** `UPDATE` credits/plan; changes go through **`consume_one_credit`** (security definer) or **service_role** webhooks. **`INSERT`** of one’s own row is only allowed with **`credits = 0`** and **`plan = 'free'`** (see `20260425100000_security_hardening.sql`) so users cannot mint balances via the REST API.

## Public share pages

- There is **no** RLS policy allowing anonymous reads of `generations`.
- The share route loads **`is_public`** rows using the **service role** on the server after validating the id, so share links work without logging in while **PostgREST anon** cannot scrape the table.

## Storage (`audio` bucket)

- Bucket is **private**; paths under `{user_id}/` are readable/writable by that user via RLS on `storage.objects`.
- **`cache/`** paths are written only with the **service role** from API routes.

## Migrations

Apply all files under `supabase/migrations/` in order. The hardening migration assumes prior init + payments + `generation_meta` migrations exist.

## Edge / app middleware

- **Webhooks** (`/api/webhook-*`): **POST-only**, per-IP rate limit + burst, then HMAC verification in the route. Oversized bodies are rejected (**413**).
- **Rate-limit IP**: `getClientIp` prefers **Cloudflare** / **Vercel** / **Fly** headers when present; for raw `X-Forwarded-For`, set **`RATE_LIMIT_TRUST_PROXY_COUNT`** in `.env` when sitting behind trusted reverse proxies so the client IP is not taken from a spoofable leftmost hop.

## RPC hardening

- **`increment_share_public_view`**: executable only by **`service_role`** (explicit revoke for **`anon`** / **`authenticated`**).
