"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField, inputClass } from "@/components/ui/inputs";
import { cn } from "@/lib/ui";

/** 12g Contact (form + success). Delivery lands on WhatsApp/email ops side. */
export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <main className="mx-auto max-w-xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">Contact us</h1>
      {sent ? (
        <p className="mt-8 rounded-card bg-verified-tint px-5 py-4 text-sm font-semibold text-verified">
          ✓ We&apos;ll get back to you within 24 hours
        </p>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
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
          <Button type="submit" full>
            Send message
          </Button>
        </form>
      )}
    </main>
  );
}
