/**
 * POST /api/create-payment
 *
 * Providers:
 * - `razorpay` (default): Razorpay order; client opens Checkout with publishable key.
 * - `nowpayments`: hosted crypto invoice; JSON includes `payment_url` (and `payUrl` alias).
 *
 * Security: authenticated session only; secrets server-side; ledger rows before redirect.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createNowPaymentsInvoice,
  createRazorpayClient,
  getCreditsPack,
  getNowPaymentsCreditsPack,
} from "@/lib/payments";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const bodySchema = z.object({
  provider: z.enum(["razorpay", "nowpayments"]).optional(),
  payCurrency: z.string().min(2).max(32).optional(),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      rawBody = JSON.parse(text) as unknown;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const provider = parsed.data.provider ?? "razorpay";
  const env = getServerEnv();
  const appUrl = (env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const admin = createAdminSupabaseClient();

  if (provider === "nowpayments") {
    if (!env.NOWPAYMENTS_API_KEY) {
      return NextResponse.json({ error: "NOWPayments is not configured" }, { status: 503 });
    }

    const pack = getNowPaymentsCreditsPack(env);
    const payCurrency = (parsed.data.payCurrency ?? pack.defaultPayCurrency).toLowerCase();
    const orderId = `np_${user.id.replace(/-/g, "").slice(0, 8)}_${Date.now().toString(36)}`;
    const amountCents = Math.round(pack.priceUsd * 100);

    const { error: insErr } = await admin.from("payments").insert({
      user_id: user.id,
      provider: "nowpayments",
      status: "pending",
      amount: amountCents,
      currency: "USD",
      provider_order_id: orderId,
      credits_granted: 0,
      metadata: {
        credits_purchased: pack.creditsPurchased,
        pay_currency: payCurrency,
      },
    });

    if (insErr) {
      console.error("payments insert nowpayments", insErr);
      return NextResponse.json({ error: "Could not record payment" }, { status: 500 });
    }

    try {
      const npResult = await createNowPaymentsInvoice(env, {
        orderId,
        payCurrency,
        ipnCallbackUrl: `${appUrl}/api/webhook-nowpayments`,
        successUrl: `${appUrl}/dashboard?np=success`,
        cancelUrl: `${appUrl}/dashboard?np=cancel`,
      });

      return NextResponse.json({
        provider: "nowpayments" as const,
        payment_url: npResult.payUrl,
        payUrl: npResult.payUrl,
        orderId,
      });
    } catch (e) {
      console.error("NOWPayments create", e);
      await admin.from("payments").delete().eq("provider", "nowpayments").eq("provider_order_id", orderId);
      return NextResponse.json({ error: "Payment provider error" }, { status: 502 });
    }
  }

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json({ error: "Razorpay is not configured" }, { status: 503 });
  }

  const pack = getCreditsPack(env);
  const razorpay = createRazorpayClient(env);
  const receipt = `sv_${user.id.replace(/-/g, "").slice(0, 12)}_${Date.now()}`;

  let order: { id: string; amount: number; currency: string };
  try {
    order = (await razorpay.orders.create({
      amount: pack.amount_paise,
      currency: "INR",
      receipt,
      notes: {
        userId: user.id,
        credits_purchased: String(pack.credits_purchased),
        app: "sacred_voice",
      },
    })) as { id: string; amount: number; currency: string };
  } catch (e) {
    console.error("Razorpay order create", e);
    return NextResponse.json({ error: "Payment provider error" }, { status: 502 });
  }

  const { error: insErr } = await admin.from("payments").insert({
    user_id: user.id,
    provider: "razorpay",
    status: "pending",
    amount: pack.amount_paise,
    currency: "INR",
    provider_order_id: order.id,
    credits_granted: 0,
    metadata: {
      credits_purchased: pack.credits_purchased,
      userId: user.id,
      currency: order.currency,
    },
  });

  if (insErr) {
    console.error("payments insert", insErr);
    return NextResponse.json({ error: "Could not record payment" }, { status: 500 });
  }

  return NextResponse.json({ provider: "razorpay" as const, orderId: order.id });
}
