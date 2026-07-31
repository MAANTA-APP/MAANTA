"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField, inputClass } from "@/components/ui/inputs";
import { cn } from "@/lib/ui";
import { ENTITY } from "@/lib/marketing/demo";

/**
 * 12g Contact (form + success).
 *
 * **The success state now means something.** This page used to call
 * `setSent(true)` on submit and render "✓ We'll get back to you within 24 hours"
 * without sending anything anywhere — drift D28. It now POSTs to `/api/contact`,
 * which delivers to the monitored inbox via Resend and autoresponds to the
 * sender, and it only shows the confirmation once that request has succeeded.
 *
 * A failed send surfaces the error and offers WhatsApp and the direct address,
 * rather than showing a tick. Silently succeeding is the exact defect being
 * fixed, so it must not be reintroduced by an optimistic UI.
 *
 * The full enquiry-router rebuild (`?topic=` handling, channels-first layout,
 * the six topic options) is Phase 3, per `docs/ops/copy/contact.md`. This change
 * is the Phase 0 bug fix only: it keeps the existing two-field form and makes it
 * actually deliver. `topic` is sent as "general" until the router ships.
 */
export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [hpUrl, setHpUrl] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: email,
          message,
          topic: "general",
          hp_url: hpUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "We could not send your message. Please try WhatsApp.");
        return;
      }
      setSent(true);
    } catch {
      setError(
        "We could not reach the server. Check your connection, or message us on WhatsApp."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">Contact us</h1>
      {sent ? (
        <div className="mt-8 rounded-card bg-verified-tint px-5 py-4">
          <p className="text-sm font-semibold text-verified">✓ Message sent</p>
          <p className="mt-1 text-sm text-ink">
            A person will read it and reply. If it is urgent,{" "}
            <a
              className="underline underline-offset-2"
              href={ENTITY.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp is faster
            </a>
            .
          </p>
        </div>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <TextField
            label="Your email or phone"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              required
              className={cn(inputClass, "h-auto py-3")}
            />
          </label>

          {/* Honeypot — hidden from people, ignored by password managers. */}
          <div aria-hidden="true" className="hidden">
            <label>
              Do not fill this in
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hpUrl}
                onChange={(e) => setHpUrl(e.target.value)}
              />
            </label>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-card border border-flame px-4 py-3 text-sm text-ink"
            >
              {error} You can also email{" "}
              <a className="underline underline-offset-2" href={`mailto:${ENTITY.email}`}>
                {ENTITY.email}
              </a>
              .
            </p>
          ) : null}

          <Button type="submit" full disabled={sending}>
            {sending ? "Sending…" : "Send message"}
          </Button>
        </form>
      )}
    </main>
  );
}
