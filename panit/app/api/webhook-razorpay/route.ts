/**
 * POST /api/webhook-razorpay
 *
 * Security architecture:
 * - Verifies Razorpay HMAC on the **raw** body; rejects tampered payloads.
 * - Processes `payment.captured` only; Razorpay success state is `captured` (maps to paid/success).
 * - Idempotency: `webhook_events` + conditional `payments` update + unique `transaction_id`.
 * - Credits and `profiles.plan` are updated only after verification (never from the client).
 */

import { NextResponse } from "next/server";
import {
  applyRazorpayPaymentCaptured,
  verifyRazorpayWebhookSignature,
  type RazorpayWebhookBody,
} from "@/lib/payments";

export const runtime = "nodejs";

const MAX_WEBHOOK_BODY_BYTES = 512 * 1024;

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyRazorpayWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(raw) as RazorpayWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.event !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: body.event });
  }

  const payment = body.payload?.payment?.entity;
  if (!payment) {
    return NextResponse.json({ ok: true, ignored: "no_payment" });
  }

  const result = await applyRazorpayPaymentCaptured(raw, body, payment);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message ?? "Webhook failed" },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({ ok: true, note: result.message });
}
