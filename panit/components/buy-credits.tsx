"use client";

/**
 * Razorpay Checkout launcher (client)
 *
 * Security architecture:
 * - `orderId` comes from `/api/create-payment` only; publishable key from `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
 * - Never send payment “success” to the server — balances/plan change only via webhooks.
 */

import Script from "next/script";
import { useCallback, useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function BuyCredits() {
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cryptoBusy, setCryptoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const startCheckout = useCallback(async () => {
    setMessage(null);
    if (!scriptReady || !window.Razorpay) {
      setMessage("Payment script is still loading. Try again in a moment.");
      return;
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!keyId) {
      setMessage("Payments are not configured (missing NEXT_PUBLIC_RAZORPAY_KEY_ID).");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/create-payment", { method: "POST" });
      const data = (await res.json()) as { error?: string; orderId?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Could not start checkout");
        return;
      }
      if (!data.orderId) {
        setMessage("Invalid response from server");
        return;
      }

      const options = {
        key: keyId,
        order_id: data.orderId,
        name: "Sacred Voice",
        description: "Credit pack — processing via Razorpay",
        notes: {
          product: "sacred_voice_credits",
        },
        handler: () => {
          setMessage(
            "Payment submitted. Credits and plan update only after the provider confirms via webhook (usually seconds).",
          );
          window.setTimeout(() => window.location.reload(), 2500);
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      };
      const rz = new window.Razorpay(options);
      rz.open();
    } catch {
      setMessage("Network error starting checkout");
    } finally {
      setBusy(false);
    }
  }, [scriptReady]);

  const startNowPayments = useCallback(async () => {
    setMessage(null);
    setCryptoBusy(true);
    try {
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "nowpayments" }),
      });
      const data = (await res.json()) as { error?: string; payment_url?: string; payUrl?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Could not start checkout");
        return;
      }
      const url = data.payment_url ?? data.payUrl;
      if (!url) {
        setMessage("Invalid response from server");
        return;
      }
      window.location.assign(url);
    } catch {
      setMessage("Network error starting crypto checkout");
    } finally {
      setCryptoBusy(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setScriptReady(true)}
      />
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap">
        <button
          type="button"
          onClick={startCheckout}
          disabled={busy || cryptoBusy || !scriptReady}
          className="rounded-xl border border-accent/40 text-accent-light px-4 py-2 text-sm font-medium hover:bg-accent/15 hover:border-accent/60 hover:shadow-glow-sm disabled:opacity-50 transition-all duration-layout"
        >
          {scriptReady ? "Buy credits (Razorpay)" : "Loading checkout…"}
        </button>
        <button
          type="button"
          onClick={startNowPayments}
          disabled={busy || cryptoBusy}
          className="rounded-xl border border-accent/30 text-ink/90 px-4 py-2 text-sm font-medium hover:bg-parchment-deep/80 hover:border-accent/50 disabled:opacity-50 transition-all duration-layout"
        >
          {cryptoBusy ? "Opening…" : "Buy credits (crypto)"}
        </button>
      </div>
      {message && (
        <p className="text-sm text-ink-muted" role="status">
          {message}
        </p>
      )}
      <p className="text-xs text-ink-muted max-w-md leading-relaxed">
        Never trust the browser for payment success — only verified webhooks update your balance and
        plan.
      </p>
    </div>
  );
}
