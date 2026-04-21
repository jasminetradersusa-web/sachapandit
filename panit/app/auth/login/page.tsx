"use client";

/**
 * Magic-link login (client)
 *
 * Security architecture:
 * - Uses only the public anon key; session tokens live in HttpOnly cookies after callback.
 * - Does not embed payment or model provider secrets.
 */

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage(null);
    const supabase = createBrowserSupabaseClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
    setMessage("Check your email for the Sacred Voice sign-in link.");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="surface-card max-w-md w-full p-8 sm:p-10 space-y-6">
        <div className="text-center space-y-2">
          <p className="eyebrow">Sacred Voice</p>
          <h1 className="font-display text-display text-ink">Sign in</h1>
        </div>
        <p className="text-sm text-ink-muted text-center leading-relaxed">
          AI storytelling and reflection—never prediction or authority. We&apos;ll email you a secure
          link.
        </p>
        <form onSubmit={sendMagicLink} className="space-y-4">
          <label className="block text-sm font-medium text-ink/90">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-mystic mt-2"
            />
          </label>
          <button
            type="submit"
            disabled={status === "sending"}
            className="btn-primary w-full disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Email me a link"}
          </button>
        </form>
        {message && (
          <p
            className={`text-sm text-center ${status === "error" ? "text-red-300" : "text-ink-muted"}`}
            role="status"
          >
            {message}
          </p>
        )}
        <p className="text-center text-sm text-ink-muted">
          <Link href="/" className="text-accent-light hover:text-white transition-colors duration-layout">
            Back home
          </Link>
        </p>
      </div>
    </main>
  );
}
