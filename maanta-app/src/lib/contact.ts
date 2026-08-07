import { ENTITY } from "@/lib/marketing/demo";
import { escapeHtml } from "@/lib/escape-html";

/**
 * Contact enquiry model — shared by `/contact` and `/api/contact`.
 *
 * The topics are the six from `docs/ops/copy/contact.md` §3 `#router`. Their
 * slugs are part of the URL contract: `/mall-operators` links here with
 * `?topic=mall-operator`, so renaming one breaks an inbound CTA.
 *
 * `list-shop` is deliberately not a form topic. The copy deck routes it straight
 * to `/merchants/join` — "this is not a contact enquiry" — because a shop owner
 * who wants to list should be in the lead funnel, not in a support queue.
 */
export const CONTACT_TOPICS = [
  { slug: "shopper", label: "I am a shopper" },
  { slug: "merchant", label: "I run a shop on MAANTA" },
  { slug: "mall-operator", label: "I am a mall operator" },
  { slug: "press", label: "Press" },
  { slug: "privacy", label: "Privacy or legal" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["slug"];

const CONTACT_TOPIC_SLUGS = CONTACT_TOPICS.map((t) => t.slug) as readonly string[];

/** Unknown or absent `?topic=` falls back to the general queue rather than erroring. */
export function normaliseTopic(raw: string | null | undefined): ContactTopic | "general" {
  if (!raw) return "general";
  return (CONTACT_TOPIC_SLUGS as string[]).includes(raw) ? (raw as ContactTopic) : "general";
}

function topicLabel(topic: ContactTopic | "general"): string {
  return CONTACT_TOPICS.find((t) => t.slug === topic)?.label ?? "General enquiry";
}

export type ContactSubmission = {
  /** Optional. Improves routing and lets a reply open properly. */
  name?: string;
  /** Email or phone — the live form accepts either, and that is kept. */
  contact: string;
  message: string;
  topic: ContactTopic | "general";
};

const CONTACT_MESSAGE_MAX = 5_000;
const CONTACT_FIELD_MAX = 200;

/**
 * Validate without being precious about the format. The live form's field is
 * "Your email or phone", so this accepts either and does not attempt to parse
 * a Kenyan mobile number — rejecting a real person's contact detail to enforce a
 * regex costs more than accepting a malformed one.
 *
 * Returns the cleaned submission or a human-readable error.
 */
export function validateContactSubmission(
  body: Record<string, unknown>
): { ok: true; value: ContactSubmission } | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, CONTACT_FIELD_MAX) : "";
  const contact = typeof body.contact === "string" ? body.contact.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const topic = normaliseTopic(typeof body.topic === "string" ? body.topic : null);

  if (!contact) return { ok: false, error: "Add an email address or phone number." };
  if (contact.length > CONTACT_FIELD_MAX) {
    return { ok: false, error: "That contact detail is too long." };
  }
  if (!message) return { ok: false, error: "Add a message." };
  if (message.length > CONTACT_MESSAGE_MAX) {
    return { ok: false, error: "That message is too long." };
  }

  return { ok: true, value: { name: name || undefined, contact, message, topic } };
}

/** True when the value looks like an email, so we know whether we can autorespond. */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}


/** The message that reaches the monitored inbox. */
export function enquiryEmail(s: ContactSubmission): {
  subject: string;
  text: string;
  html: string;
} {
  const label = topicLabel(s.topic);
  const subject = `[MAANTA contact] ${label}`;
  const text = [
    `Topic: ${label}`,
    `From: ${s.name ? `${s.name} <${s.contact}>` : s.contact}`,
    "",
    s.message,
    "",
    "— sent from the contact form on maanta.app",
  ].join("\n");
  const html = [
    `<p><strong>Topic:</strong> ${escapeHtml(label)}</p>`,
    `<p><strong>From:</strong> ${escapeHtml(s.name ? `${s.name} <${s.contact}>` : s.contact)}</p>`,
    `<hr />`,
    `<p style="white-space:pre-wrap">${escapeHtml(s.message)}</p>`,
    `<hr /><p style="color:#5C5C5C;font-size:12px">Sent from the contact form on maanta.app</p>`,
  ].join("");
  return { subject, text, html };
}

/**
 * Autoresponder to the sender.
 *
 * Not a nicety — `copy/contact.md` §0 is explicit that "it is the thing that
 * proves the message arrived". The page it replaces claimed "We'll get back to
 * you within 24 hours" while sending nothing at all, so a confirmation the
 * sender can see in their own inbox is the repair for that specific breach.
 *
 * **States no response time.** Every stated response time is a held claim
 * (`website-handoff.md` §9: "publish only what can be met") and none has been
 * committed to. Confirming receipt is true; promising 24 hours is not yet.
 */
export function autoresponderEmail(s: ContactSubmission): {
  subject: string;
  text: string;
  html: string;
} {
  const label = topicLabel(s.topic);
  const subject = "We got your message — MAANTA";
  const text = [
    s.name ? `Hello ${s.name},` : "Hello,",
    "",
    "Thanks for getting in touch with MAANTA.",
    "",
    `We have your message about: ${label}.`,
    "A person will read it and reply to this address.",
    "",
    `If it is urgent, WhatsApp is faster: ${ENTITY.whatsappLink}`,
    "",
    "Your message:",
    s.message,
    "",
    `— ${ENTITY.name}, ${ENTITY.address}, ${ENTITY.city}`,
  ].join("\n");
  const html = [
    `<p>Thanks for getting in touch with MAANTA.</p>`,
    `<p>We have your message about: <strong>${escapeHtml(label)}</strong>.`,
    ` A person will read it and reply to this address.</p>`,
    `<p>If it is urgent, WhatsApp is faster: `,
    `<a href="${ENTITY.whatsappLink}">${escapeHtml(ENTITY.whatsapp)}</a></p>`,
    `<hr /><p style="color:#5C5C5C;font-size:13px">Your message:</p>`,
    `<p style="white-space:pre-wrap;color:#5C5C5C;font-size:13px">${escapeHtml(s.message)}</p>`,
    `<hr /><p style="color:#5C5C5C;font-size:12px">${escapeHtml(ENTITY.name)}, `,
    `${escapeHtml(ENTITY.address)}, ${escapeHtml(ENTITY.city)}</p>`,
  ].join("");
  return { subject, text, html };
}
