/**
 * Sacred Voice — payment providers (Razorpay + NowPayments hooks)
 *
 * Security architecture:
 * - Never trust browser payment success; ledger updates ONLY after verified webhooks.
 * - HMAC verification on raw bodies (timing-safe compare).
 * - `webhook_events` table claims each provider event_id once → replay protection.
 * - `payments.transaction_id` unique + status transitions prevent double crediting.
 * - Profile `plan` / credits updated only after amount + order reconciliation.
 */

import "server-only";

import crypto from "node:crypto";
import Razorpay from "razorpay";
import type { Json } from "@/types/database";
import { createAdminSupabaseClient } from "@/lib/supabase-server";
import { getServerEnv, type ServerEnv } from "@/lib/env";

// ---------------------------------------------------------------------------
// Razorpay
// ---------------------------------------------------------------------------

export function createRazorpayClient(env: ServerEnv) {
  return new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
}

export function verifyRazorpayWebhookSignature(body: string, signature: string | null): boolean {
  const env = getServerEnv();
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

export function getCreditsPack(env: ServerEnv) {
  const amount = env.RAZORPAY_CREDITS_PACK_AMOUNT_PAISE ?? 49900;
  const count = env.RAZORPAY_CREDITS_PACK_COUNT ?? 25;
  return { amount_paise: amount, credits_purchased: count };
}

export type RazorpayPaymentEntity = {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  currency?: string;
};

/** Razorpay event envelope (subset). */
export type RazorpayWebhookBody = {
  id?: string;
  entity?: string;
  event: string;
  created_at?: number;
  payload?: {
    payment?: { entity: RazorpayPaymentEntity };
  };
};

// ---------------------------------------------------------------------------
// NowPayments (IPN)
// ---------------------------------------------------------------------------

export type NowPaymentsIpnBody = {
  payment_status?: string;
  order_id?: string;
  payment_id?: string | number;
  pay_amount?: string | number;
  pay_currency?: string;
  price_amount?: string | number;
  price_currency?: string;
  signature?: string;
  [key: string]: unknown;
};

/**
 * NOWPayments signs IPN payloads — algorithm per dashboard docs (HMAC-SHA512 over sorted key=value pairs).
 * https://documenter.getpostman.com/view/4874089/SWLE57MF
 */
export function verifyNowPaymentsIpnSignature(body: NowPaymentsIpnBody, secret: string | undefined): boolean {
  if (!secret) return false;
  const received = body.signature;
  if (typeof received !== "string") return false;

  const clone: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "signature") continue;
    if (v === undefined || v === null) continue;
    clone[k] = typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v);
  }

  const sortedKeys = Object.keys(clone).sort();
  const payload = sortedKeys.map((k) => `${k}=${clone[k]}`).join("&");
  const expected = crypto.createHmac("sha512", secret).update(payload).digest("hex");
  if (expected.length !== received.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
  } catch {
    return false;
  }
}

/** Credits are granted only on terminal `finished` (NOWPayments IPN). */
export function isNowPaymentsFinishedStatus(status: string | undefined): boolean {
  return status?.toLowerCase() === "finished";
}

const DEFAULT_NOWPAYMENTS_API_BASE = "https://api.nowpayments.io/v1";

export function getNowPaymentsCreditsPack(env: ServerEnv) {
  return {
    priceUsd: env.NOWPAYMENTS_CREDITS_PRICE_USD ?? 9.99,
    creditsPurchased: env.NOWPAYMENTS_CREDITS_COUNT ?? 25,
    defaultPayCurrency: (env.NOWPAYMENTS_PAY_CURRENCY ?? "btc").toLowerCase(),
  };
}

/**
 * Create a hosted crypto checkout (NOWPayments `POST /v1/payment`).
 * `order_id` must match the `payments.provider_order_id` row created for webhook reconciliation.
 */
export async function createNowPaymentsInvoice(
  env: ServerEnv,
  params: {
    orderId: string;
    payCurrency: string;
    ipnCallbackUrl: string;
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ payUrl: string; npPaymentId: string }> {
  const apiKey = env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error("NOWPAYMENTS_API_KEY is not configured");
  }

  const pack = getNowPaymentsCreditsPack(env);
  const base = (env.NOWPAYMENTS_API_BASE ?? DEFAULT_NOWPAYMENTS_API_BASE).replace(/\/$/, "");

  const res = await fetch(`${base}/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      price_amount: pack.priceUsd,
      price_currency: "usd",
      pay_currency: params.payCurrency.toLowerCase(),
      order_id: params.orderId,
      order_description: `Sacred Voice · ${pack.creditsPurchased} credits`,
      ipn_callback_url: params.ipnCallbackUrl,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`NOWPayments HTTP ${res.status}: ${rawText.slice(0, 400)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error("NOWPayments: invalid JSON response");
  }

  const payUrl =
    (typeof data.payment_url === "string" && data.payment_url) ||
    (typeof data.pay_url === "string" && data.pay_url) ||
    (typeof data.invoice_url === "string" && data.invoice_url) ||
    "";

  if (!payUrl) {
    throw new Error("NOWPayments: missing payment_url / pay_url / invoice_url");
  }

  const npPaymentId = String(data.payment_id ?? data.paymentId ?? data.id ?? params.orderId);

  return { payUrl, npPaymentId };
}

// ---------------------------------------------------------------------------
// Shared: claim webhook event (replay guard)
// ---------------------------------------------------------------------------

export async function claimWebhookEvent(
  provider: "razorpay" | "nowpayments",
  eventId: string,
): Promise<{ claimed: boolean }> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("webhook_events").insert({
    provider,
    event_id: eventId,
  });
  if (error) {
    if (error.code === "23505") {
      return { claimed: false };
    }
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return { claimed: false };
    }
    console.error("webhook_events insert", error);
    throw new Error("webhook_claim_failed");
  }
  return { claimed: true };
}

function stableRazorpayEventId(body: RazorpayWebhookBody, payment: RazorpayPaymentEntity): string {
  if (body.id && typeof body.id === "string") return `rzp_evt:${body.id}`;
  return `rzp_pay:${payment.id}:${body.event}`;
}

/**
 * Apply verified Razorpay `payment.captured` after signature checks.
 * Ordering: reconcile row → claim webhook idempotency key → conditional update prevents double credit.
 */
export async function applyRazorpayPaymentCaptured(
  rawBody: string,
  body: RazorpayWebhookBody,
  payment: RazorpayPaymentEntity,
): Promise<{ ok: boolean; httpStatus: number; message?: string }> {
  if (payment.status !== "captured") {
    return { ok: true, httpStatus: 200, message: "ignored_status" };
  }
  if (!payment.order_id) {
    return { ok: false, httpStatus: 400, message: "missing_order" };
  }

  const admin = createAdminSupabaseClient();

  const { data: payRow, error: payErr } = await admin
    .from("payments")
    .select("id, user_id, amount, currency, status, credits_granted, metadata, transaction_id")
    .eq("provider", "razorpay")
    .eq("provider_order_id", payment.order_id)
    .maybeSingle();

  if (payErr || !payRow) {
    console.error("payments lookup", payErr);
    return { ok: false, httpStatus: 404, message: "unknown_order" };
  }

  if (payRow.status === "success") {
    if (payRow.transaction_id === payment.id) {
      return { ok: true, httpStatus: 200, message: "idempotent_paid" };
    }
    return { ok: true, httpStatus: 200, message: "order_already_paid" };
  }

  if (payRow.status !== "pending" && payRow.status !== "processing") {
    return { ok: true, httpStatus: 200, message: "ignored_state" };
  }

  if (payment.amount !== payRow.amount) {
    console.error("amount mismatch", payment.amount, payRow.amount);
    return { ok: false, httpStatus: 400, message: "amount_mismatch" };
  }

  if (
    payment.currency &&
    payRow.currency &&
    payment.currency.toUpperCase() !== payRow.currency.toUpperCase()
  ) {
    console.error("currency mismatch", payment.currency, payRow.currency);
    return { ok: false, httpStatus: 400, message: "currency_mismatch" };
  }

  const eventId = stableRazorpayEventId(body, payment);
  try {
    const { claimed } = await claimWebhookEvent("razorpay", eventId);
    if (!claimed) {
      return { ok: true, httpStatus: 200, message: "replay_or_duplicate" };
    }
  } catch {
    return { ok: false, httpStatus: 500, message: "claim_failed" };
  }

  const { data: freshRow } = await admin
    .from("payments")
    .select("id, status, transaction_id")
    .eq("id", payRow.id)
    .maybeSingle();

  if (freshRow?.status === "success") {
    return { ok: true, httpStatus: 200, message: "already_processed" };
  }

  const meta = (payRow.metadata ?? {}) as { credits_purchased?: number };
  const env = getServerEnv();
  const creditsToAdd =
    typeof meta.credits_purchased === "number" && meta.credits_purchased > 0
      ? meta.credits_purchased
      : env.RAZORPAY_CREDITS_PACK_COUNT ?? 25;

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("credits")
    .eq("id", payRow.user_id)
    .single();

  if (profErr || !profile) {
    console.error("profile missing", profErr);
    return { ok: false, httpStatus: 500, message: "profile_missing" };
  }

  const newCredits = profile.credits + creditsToAdd;

  let webhookJson: Json;
  try {
    webhookJson = JSON.parse(rawBody) as Json;
  } catch {
    webhookJson = { raw: rawBody } as unknown as Json;
  }

  const { data: updatedRows, error: upPay } = await admin
    .from("payments")
    .update({
      status: "success",
      transaction_id: payment.id,
      credits_granted: creditsToAdd,
      updated_at: new Date().toISOString(),
      metadata: { ...(meta as Record<string, unknown>), last_webhook: webhookJson } as unknown as Json,
    })
    .eq("id", payRow.id)
    .in("status", ["pending", "processing"])
    .select("id");

  if (upPay) {
    console.error("payments update", upPay);
    return { ok: false, httpStatus: 500, message: "payment_update_failed" };
  }

  if (!updatedRows?.length) {
    return { ok: true, httpStatus: 200, message: "lost_race" };
  }

  const { error: upProf } = await admin
    .from("profiles")
    .update({
      credits: newCredits,
      plan: "supporter",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payRow.user_id);

  if (upProf) {
    console.error("profile update", upProf);
    return { ok: false, httpStatus: 500, message: "credit_grant_failed" };
  }

  return { ok: true, httpStatus: 200 };
}

/**
 * Apply verified NowPayments IPN when `payment_status` is `finished`.
 * `order_id` must match `payments.provider_order_id` created server-side.
 * Idempotency: `webhook_events` + conditional update on `payments`.
 */
export async function applyNowPaymentsIpn(
  rawParsed: NowPaymentsIpnBody,
): Promise<{ ok: boolean; httpStatus: number; message?: string }> {
  if (!isNowPaymentsFinishedStatus(rawParsed.payment_status)) {
    return { ok: true, httpStatus: 200, message: "ignored_status" };
  }

  const orderRef = String(rawParsed.order_id ?? "").trim();
  const payIdRaw = rawParsed.payment_id;
  const payId = payIdRaw !== undefined && payIdRaw !== null ? String(payIdRaw).trim() : "";
  if (!orderRef || !payId) {
    return { ok: false, httpStatus: 400, message: "missing_ids" };
  }

  const admin = createAdminSupabaseClient();

  const { data: payRow, error: payErr } = await admin
    .from("payments")
    .select("id, user_id, amount, currency, status, metadata, transaction_id")
    .eq("provider", "nowpayments")
    .eq("provider_order_id", orderRef)
    .maybeSingle();

  if (payErr || !payRow) {
    console.error("payments np lookup", payErr);
    return { ok: false, httpStatus: 404, message: "unknown_order" };
  }

  if (payRow.status === "success") {
    if (payRow.transaction_id === String(payId)) {
      return { ok: true, httpStatus: 200, message: "idempotent" };
    }
    return { ok: true, httpStatus: 200, message: "order_already_paid" };
  }

  const priceMinor =
    typeof rawParsed.price_amount === "number"
      ? Math.round(rawParsed.price_amount * 100)
      : typeof rawParsed.price_amount === "string"
        ? Math.round(parseFloat(rawParsed.price_amount) * 100)
        : payRow.amount;

  if (Math.abs(priceMinor - payRow.amount) > 1) {
    console.error("np amount mismatch", priceMinor, payRow.amount);
    return { ok: false, httpStatus: 400, message: "amount_mismatch" };
  }

  const eventId = `np:${payId}:finished`;
  try {
    const { claimed } = await claimWebhookEvent("nowpayments", eventId);
    if (!claimed) {
      return { ok: true, httpStatus: 200, message: "replay" };
    }
  } catch {
    return { ok: false, httpStatus: 500, message: "claim_failed" };
  }

  const { data: freshRow } = await admin
    .from("payments")
    .select("id, status")
    .eq("id", payRow.id)
    .maybeSingle();

  if (freshRow?.status === "success") {
    return { ok: true, httpStatus: 200, message: "already_processed" };
  }

  const meta = (payRow.metadata ?? {}) as { credits_purchased?: number };
  const creditsToAdd =
    typeof meta.credits_purchased === "number" && meta.credits_purchased > 0
      ? meta.credits_purchased
      : 25;

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("credits")
    .eq("id", payRow.user_id)
    .single();

  if (profErr || !profile) {
    return { ok: false, httpStatus: 500, message: "profile_missing" };
  }

  const { data: updatedRows, error: upPay } = await admin
    .from("payments")
    .update({
      status: "success",
      transaction_id: String(payId),
      credits_granted: creditsToAdd,
      updated_at: new Date().toISOString(),
      metadata: { ...(meta as Record<string, unknown>), ipn: rawParsed as unknown as Json } as unknown as Json,
    })
    .eq("id", payRow.id)
    .in("status", ["pending", "processing"])
    .select("id");

  if (upPay) {
    console.error("np payments update", upPay);
    return { ok: false, httpStatus: 500, message: "payment_update_failed" };
  }

  if (!updatedRows?.length) {
    return { ok: true, httpStatus: 200, message: "lost_race" };
  }

  const { error: upProf } = await admin
    .from("profiles")
    .update({
      credits: profile.credits + creditsToAdd,
      plan: "supporter",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payRow.user_id);

  if (upProf) {
    console.error("np profile", upProf);
    return { ok: false, httpStatus: 500, message: "credit_grant_failed" };
  }

  return { ok: true, httpStatus: 200 };
}

/** @deprecated use applyRazorpayPaymentCaptured(raw, body, payment) with raw string body */
export async function applyVerifiedPaymentCapture(
  payment: RazorpayPaymentEntity,
  rawBody: RazorpayWebhookBody,
): Promise<{ ok: boolean; httpStatus: number; message?: string }> {
  return applyRazorpayPaymentCaptured(JSON.stringify(rawBody), rawBody, payment);
}
