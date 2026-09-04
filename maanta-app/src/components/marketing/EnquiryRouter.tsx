"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TextField, inputClass } from "@/components/ui/inputs";
import { cn } from "@/lib/ui";
import {
  CONTACT_TOPICS,
  isEmailAddress,
  normaliseTopic,
  type ContactTopic,
} from "@/lib/contact";
import { ENTITY } from "@/lib/marketing/demo";
import { CLOSED_FORM_COPY, isFormCollecting } from "@/lib/marketing/forms";
import { MARKETING_EVENTS, trackMarketing } from "@/lib/marketing/analytics";

/**
 * `/contact` enquiry router and form.
 *
 * Reads `?topic=` and pre-selects. `/mall-operators` links here with
 * `?topic=mall-operator`, so this had to ship before that page's primary CTA
 * went live — otherwise the CTA lands on an unrouted form.
 *
 * Selecting a topic surfaces the recommended channel and sets the subject on the
 * message. The form is never hidden: some people want a written record.
 *
 * "I want to list my shop" is a route, not a topic. The copy deck is explicit —
 * "this is not a contact enquiry" — so it links straight to `/merchants/join`
 * rather than dropping a would-be merchant into a support queue.
 *
 * ## Why the topic is read from `window`, not `useSearchParams` (drift D41)
 *
 * This component called `useSearchParams()`, which opts the calling subtree out
 * of static rendering. `/contact` wrapped it in `Suspense` to contain that — and
 * the containment worked exactly as designed: React server-rendered the
 * *fallback*, a grey pulsing rectangle, and nothing else. The page shipped **zero
 * `<form>` elements and zero inputs** directly above server-rendered copy
 * promising "This form and email — We reply within 1 business day". The form was
 * correctly written, correctly wired to `/api/contact`, and never rendered.
 *
 * It is D28's successor. D28 was a form that POSTed nowhere while telling the
 * sender it had arrived; that was fixed, and the same promise then broke one
 * layer down.
 *
 * Reading the parameter in an effect keeps the whole page a static prerender —
 * the markup is in the HTML at build time and the topic is selected on hydration.
 * The alternative in `marketing-site-repo-map.md` §6, taking `searchParams` as a
 * prop on the page, also puts the form in the HTML but makes `/contact`
 * dynamically rendered, which is what `/waitlist` did and why it has no build
 * artefact for the canonical guard to read. That trade buys nothing here.
 *
 * The cost of an effect is that it reads the URL once, on mount, instead of
 * tracking it. That is not a regression in practice: the only inbound links
 * carrying `?topic=` are the two `/mall-operators` CTAs, both to
 * `?topic=mall-operator`, and nothing on `/contact` changes the parameter while
 * you are on the page — so the reactive dependency never fired. If a future
 * surface links between topics *within* `/contact`, this needs a `popstate`
 * listener, not `useSearchParams`.
 */

type Choice = ContactTopic | "list-shop";

const GUIDANCE: Record<Choice, { hint: React.ReactNode; fastest: React.ReactNode }> = {
  shopper: {
    hint: "A code that did not work, a deal, or a shop.",
    fastest: (
      <>
        Fastest: WhatsApp. Have your 6-digit code ready if you have one.
      </>
    ),
  },
  merchant: {
    hint: "Deals, your balance, staff accounts, a redemption you want looked at.",
    fastest: <>Fastest: WhatsApp.</>,
  },
  "list-shop": {
    hint: "A shop name is enough to start. You finish setting up on your phone.",
    fastest: <>This is not a contact enquiry — go straight to the sign-up.</>,
  },
  "mall-operator": {
    hint: "A pilot, a partnership, or a question about how a node works.",
    fastest: <>Use the form, or email {ENTITY.email}. Goes to a named person, not a queue.</>,
  },
  press: {
    hint: "Interviews, background, or a comment on the record.",
    fastest: <>Email {ENTITY.email}. Tell us your deadline and we will work to it.</>,
  },
  privacy: {
    hint: "A data request, a takedown, or a question about our terms.",
    fastest: (
      <>
        Email {ENTITY.email}. See also our{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </>
    ),
  },
};

const CHOICES: ReadonlyArray<{ slug: Choice; label: string }> = [
  { slug: "shopper", label: "I am a shopper" },
  { slug: "merchant", label: "I run a shop on MAANTA" },
  { slug: "list-shop", label: "I want to list my shop" },
  { slug: "mall-operator", label: "I am a mall operator" },
  { slug: "press", label: "Press" },
  { slug: "privacy", label: "Privacy or legal" },
];

/**
 * Whether the message form collects at all — `lib/marketing/forms.ts`
 * (founder ruling 2026-09-04, form safety). While closed, the topic router
 * above the form stays (it routes people to WhatsApp and email, which work)
 * and the form is replaced by the ruling's closed-state block: no inputs, the
 * real reason, a working alternative. `/api/contact` refuses in step, so a
 * cached page cannot post into a closed form either.
 */
const COLLECTING = isFormCollecting("contact");

export function EnquiryRouter() {
  const [choice, setChoice] = useState<Choice | null>(null);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [hpUrl, setHpUrl] = useState("");
  // Null until submitted; then whether the API actually sent an autoresponder.
  // The form must not promise a confirmation email it did not send.
  const [sent, setSent] = useState<null | { autoresponded: boolean }>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Pre-select from the URL, on mount only, so an inbound link from
  // /mall-operators lands on the right topic. Reading `window.location` in an
  // effect rather than calling `useSearchParams` is what keeps this whole page a
  // static prerender — see the docblock above and drift D41. The effect never
  // runs on the server, so it cannot affect the rendered HTML.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("topic");
    if (raw === "list-shop") {
      setChoice("list-shop");
      return;
    }
    const t = normaliseTopic(raw);
    if (t !== "general") setChoice(t);
  }, []);

  // The topic sent to the API. "list-shop" is never submitted — it is a redirect.
  const submittedTopic: ContactTopic | "general" =
    choice && choice !== "list-shop" ? choice : "general";

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
          name,
          contact,
          message,
          topic: submittedTopic,
          hp_url: hpUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        autoresponded?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "We could not send your message. Please try WhatsApp.");
        return;
      }
      // Records that a submission succeeded and which topic it was routed to.
      // Never the name, contact detail or message body.
      trackMarketing(MARKETING_EVENTS.formSubmit, { form: "contact", topic: submittedTopic });
      setSent({ autoresponded: Boolean(data.autoresponded) });
    } catch {
      setError(
        "We could not reach the server. Check your connection, or message us on WhatsApp."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div id="router">
        <h2 className="text-2xl font-black text-ink sm:text-3xl">What is this about?</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {CHOICES.map((c) => {
            const active = choice === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setChoice(c.slug)}
                aria-pressed={active}
                className={`rounded-card border p-4 text-left transition ${
                  active ? "border-ink bg-paper" : "border-line bg-white hover:border-ink"
                }`}
              >
                <span className="block text-sm font-bold text-ink">{c.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-secondary">
                  {GUIDANCE[c.slug].hint}
                </span>
              </button>
            );
          })}
        </div>

        {choice ? (
          <div className="mt-5 rounded-card border border-line bg-paper p-5">
            <p className="text-sm leading-relaxed text-ink">{GUIDANCE[choice].fastest}</p>
            {choice === "list-shop" ? (
              <Link
                href="/merchants/join"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-ink-soft transition hover:brightness-95"
              >
                List your shop
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div id="form" className="mt-14">
        {!COLLECTING ? (
          <div className="rounded-card border border-line bg-paper p-6">
            <h2 className="text-xl font-black text-ink sm:text-2xl">
              {CLOSED_FORM_COPY.contact.heading}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-secondary">
              Email{" "}
              <a
                className="font-semibold text-ink underline underline-offset-4"
                href={`mailto:${ENTITY.email}`}
              >
                {ENTITY.email}
              </a>{" "}
              or message us on{" "}
              <a
                className="font-semibold text-ink underline underline-offset-4"
                href={ENTITY.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
              {" "}— both reach us directly.
            </p>
          </div>
        ) : null}
        {COLLECTING ? (
          <>
        <h2 className="text-2xl font-black text-ink sm:text-3xl">Send a message</h2>
        <p className="mt-3 text-base leading-relaxed text-secondary">
          If you would rather have it in writing, or your question does not fit any of the
          above.
        </p>

        {sent ? (
          /*
            The form is replaced by this block, so a screen-reader user gets no
            focus change and no announcement — submit, and nothing appears to
            happen. `role="status"` with `aria-live="polite"` announces the
            result without stealing focus mid-sentence.
          */
          <div
            role="status"
            aria-live="polite"
            className="mt-6 rounded-card bg-verified-tint px-5 py-4"
          >
            <p className="text-sm font-semibold text-verified">✓ Message sent</p>
            {sent.autoresponded ? (
              <p className="mt-1 text-sm text-ink">
                A confirmation is on its way to your email.
              </p>
            ) : null}
            <p className="mt-1 text-sm text-ink">
              We read every message and a person will reply. If it is urgent,{" "}
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
          <form className="mt-6 max-w-xl space-y-4" onSubmit={onSubmit}>
            <TextField
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Email or phone"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              required
            />

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                What is this about?
              </span>
              {/*
                Bound to `submittedTopic`, not `choice`. "list-shop" is a route
                rather than a topic and has no <option>, so binding to `choice`
                left the select rendering "General enquiry" while React believed
                the value was "list-shop" — and the next keyboard selection of
                "General enquiry" fired no change event, stranding it.
                `submittedTopic` is what the API would actually receive, which
                is the honest thing to show.
              */}
              <select
                value={submittedTopic === "general" ? "" : submittedTopic}
                onChange={(e) => setChoice((e.target.value || null) as Choice | null)}
                className={cn(inputClass)}
              >
                <option value="">General enquiry</option>
                {CONTACT_TOPICS.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">Your message</span>
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

            {/*
              The confirmation email only exists for people who gave an email
              address — the API sends the autoresponder to `contact` and skips
              it otherwise. Promising it unconditionally told everyone who left
              a phone number to watch an inbox that would stay empty.
            */}
            <p className="text-xs leading-relaxed text-muted">
              We read every message.{" "}
              {isEmailAddress(contact.trim())
                ? "You will get a confirmation by email as soon as it arrives."
                : "Leave an email address and we will confirm as soon as it arrives."}
            </p>
            <p className="text-xs leading-relaxed text-muted">
              We use what you send here only to reply to you. See our{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
                Privacy Policy
              </Link>
              .
            </p>
            <p className="text-xs leading-relaxed text-muted">
              Never send passwords, card numbers or M-Pesa PINs to us, here or anywhere else.
              We will not ask for them.
            </p>
          </form>
        )}
          </>
        ) : null}
      </div>
    </>
  );
}
