/**
 * API protection middleware (runs before Route Handlers)
 *
 * Security architecture:
 * - IP: 10 req/min + rapid-fire (burst) detection for all /api/* except Razorpay webhook.
 * - Auth: POST /api/generate, /api/queue, /api/voice, /api/image, /api/create-payment require a valid Supabase session.
 * - GET /api/queue requires session (job status).
 * - Free tier: POST /api/generate and POST /api/queue enforce duplicate-prompt blocking + daily budget
 *   (reservation + forwarded body; route must release slot on failure — see /api/generate).
 * - GET /api/voice and GET /api/share/audio stay public (authorization + signing in route).
 * - GET /share/*: dedicated per-IP limit + security headers (HTML 429, not JSON).
 * - POST /api/share/view: higher per-IP limit than default API quota.
 * - Webhooks: POST-only + per-IP limit + burst (signatures verified in route).
 * - Uses Edge-safe Supabase SSR client + env vars already available on Edge (no `server-only` env module).
 */

import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  MAX_JSON_PROMPT_CHARS,
  MAX_PROMPT_CHARS,
  MIN_PROMPT_CHARS,
  normalizePromptForPipeline,
  promptPolicyViolationMessage,
} from "@/lib/prompt-policy";
import {
  checkRapidFire,
  getClientIp,
  hasPromptFingerprint,
  limitApiRequestsByIp,
  limitSharePageByIp,
  limitShareViewPostByIp,
  limitWebhookPostByIp,
  sha256Hex,
  tryConsumeDailyGenerationSlot,
} from "@/lib/rate-limit";

const WEBHOOK_PATHS = ["/api/webhook-razorpay", "/api/webhook-nowpayments"];

function requiresAuthPost(pathname: string): boolean {
  return (
    pathname === "/api/generate" ||
    pathname === "/api/voice" ||
    pathname === "/api/image" ||
    pathname === "/api/create-payment"
  );
}

/** Copy cookies refreshed by Supabase onto the outgoing middleware response. */
function applyRefreshedCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value, c);
  });
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method;

  if (WEBHOOK_PATHS.some((p) => path.startsWith(p))) {
    if (method !== "POST") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    const webhookIp = getClientIp(request);
    const whLim = await limitWebhookPostByIp(webhookIp);
    if (!whLim.success) {
      const retry = Math.max(1, Math.ceil((whLim.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retry) } },
      );
    }
    const whBurst = checkRapidFire(webhookIp);
    if (!whBurst.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(whBurst.retryAfterMs / 1000)) },
        },
      );
    }
    return NextResponse.next();
  }

  const ip = getClientIp(request);

  if (path.startsWith("/share/") && method === "GET") {
    const shareLim = await limitSharePageByIp(ip);
    if (!shareLim.success) {
      const retry = Math.max(1, Math.ceil((shareLim.reset - Date.now()) / 1000));
      return new NextResponse("Too many requests. Try again later.", {
        status: 429,
        headers: { "Retry-After": String(retry) },
      });
    }
    const shareBurst = checkRapidFire(ip);
    if (!shareBurst.ok) {
      return new NextResponse("Too many requests. Please slow down.", {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(shareBurst.retryAfterMs / 1000)) },
      });
    }
    const res = NextResponse.next();
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return res;
  }

  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  const isShareViewPost = path === "/api/share/view" && method === "POST";
  const ipLimit = isShareViewPost
    ? await limitShareViewPostByIp(ip)
    : await limitApiRequestsByIp(ip);
  if (!ipLimit.success) {
    const retry = Math.max(1, Math.ceil((ipLimit.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Too many requests from this network. Try again later." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  const burst = checkRapidFire(ip);
  if (!burst.ok) {
    return NextResponse.json(
      { error: "Requests are too rapid. Please slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(burst.retryAfterMs / 1000)) },
      },
    );
  }

  const needSession = method === "POST" && requiresAuthPost(path);
  const isGenerateLikePost = method === "POST" && (path === "/api/generate" || path === "/api/queue");
  const isQueueGet = method === "GET" && path === "/api/queue";

  if (!needSession && !isGenerateLikePost && !isQueueGet) {
    return NextResponse.next();
  }

  if (isGenerateLikePost) {
    let authResponse = NextResponse.next({ request: { headers: request.headers } });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            authResponse = NextResponse.next({ request: { headers: request.headers } });
            cookiesToSet.forEach(({ name, value, options }) =>
              authResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bodyText = await request.text();
    let parsed: { prompt?: unknown; website?: unknown };
    try {
      parsed = JSON.parse(bodyText) as { prompt?: unknown; website?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof parsed.prompt !== "string") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    if (parsed.prompt.length > MAX_JSON_PROMPT_CHARS) {
      return NextResponse.json({ error: "Prompt is too long" }, { status: 400 });
    }

    const normalized = normalizePromptForPipeline(parsed.prompt);
    const policyErr = promptPolicyViolationMessage(normalized);
    if (policyErr) {
      return NextResponse.json({ error: policyErr }, { status: 400 });
    }

    if (normalized.length < MIN_PROMPT_CHARS || normalized.length > MAX_PROMPT_CHARS) {
      return NextResponse.json({ error: "Invalid prompt length" }, { status: 400 });
    }

    const fingerprint = await sha256Hex(normalized);
    if (await hasPromptFingerprint(user.id, fingerprint)) {
      return NextResponse.json(
        { error: "You recently used this exact prompt. Try a different idea." },
        { status: 429 },
      );
    }

    const reserved = await tryConsumeDailyGenerationSlot(user.id);
    if (!reserved) {
      return NextResponse.json(
        { error: "Daily free generation limit reached. Try again tomorrow or upgrade." },
        { status: 429 },
      );
    }

    const reqHeaders = new Headers(request.headers);
    reqHeaders.delete("x-sacred-voice-daily-slot");
    reqHeaders.delete("x-sacred-voice-prompt-fp");
    reqHeaders.delete("x-sacred-voice-sub");
    reqHeaders.set("x-sacred-voice-daily-slot", "reserved");
    reqHeaders.set("x-sacred-voice-prompt-fp", fingerprint);
    reqHeaders.set("x-sacred-voice-sub", user.id);

    const forwarded = NextResponse.next({
      request: new NextRequest(request.url, {
        method: "POST",
        headers: reqHeaders,
        body: bodyText,
      }),
    });

    applyRefreshedCookies(authResponse, forwarded);
    return forwarded;
  }

  if (isQueueGet) {
    let authResponse = NextResponse.next({ request: { headers: request.headers } });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            authResponse = NextResponse.next({ request: { headers: request.headers } });
            cookiesToSet.forEach(({ name, value, options }) =>
              authResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return authResponse;
  }

  if (needSession) {
    let authResponse = NextResponse.next({ request: { headers: request.headers } });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            authResponse = NextResponse.next({ request: { headers: request.headers } });
            cookiesToSet.forEach(({ name, value, options }) =>
              authResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return authResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/share/:path*"],
};
