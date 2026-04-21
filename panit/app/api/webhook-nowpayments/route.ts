/**
 * POST /api/webhook-nowpayments
 *
 * Security:
 * - Verifies IPN `signature` with `NOWPAYMENTS_IPN_SECRET` (HMAC-SHA512, sorted `key=value` pairs).
 * - Rejects oversized bodies; invalid signature → 401 (no processing).
 * - Credits only when `payment_status` is `finished` (idempotent via `webhook_events` + DB update guard).
 */

import { NextResponse } from "next/server";
import { applyNowPaymentsIpn, verifyNowPaymentsIpnSignature, type NowPaymentsIpnBody } from "@/lib/payments";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const MAX_WEBHOOK_BODY_BYTES = 512 * 1024;

export async function POST(req: Request) {
  const env = getServerEnv();
  const secret = env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "NOWPayments webhook not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (raw.length > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: NowPaymentsIpnBody;
  try {
    body = JSON.parse(raw) as NowPaymentsIpnBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!verifyNowPaymentsIpnSignature(body, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const result = await applyNowPaymentsIpn(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message ?? "Webhook failed" },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({ ok: true, note: result.message });
}
