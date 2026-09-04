import { ENTITY } from "./demo";

/**
 * Whether each public form is collecting — founder ruling 2026-09-04
 * (`10 §4`, form safety).
 *
 * ## The rule
 *
 * A public form may collect personal data only when two gates both pass:
 * its complete data path is proven by static inspection (form → request →
 * destination → storage → processor → fields → consent → retention → access
 * → deletion), **and** founder/legal review has cleared it to collect real
 * pilot information. The ruling names the two gates separately (instructions
 * 2 and 3), they can disagree, and which governs is an open founder question
 * (**FC1**). Until it is ruled, the forms are non-collecting — the state the
 * package asks PR-2 to implement, reversible here in one line each.
 *
 * ## What the static traces found (2026-09-04, no submission made)
 *
 * - **`/contact`** → `POST /api/contact` → Resend `sendEmail` to `ENTITY.email`
 *   (plus an autoresponder to the sender). Storage is the recipient inbox and
 *   Resend's sent-mail log, in the United States. Fields: name, contact,
 *   message, topic. No consent record (purpose is replying, and the form said
 *   so). No retention mechanism — nothing deletes an email. Deletion is manual,
 *   in the inbox and in Resend. **Destination proven.** Legal review: not done.
 * - **`/waitlist`** → `POST /api/waitlist` → Resend Audience contact
 *   (`addWaitlistContact`) plus a confirmation email. Storage is the Resend
 *   audience, US. Fields: email, name, phone, segment, business name, note,
 *   UTM source; **consent is persisted** as `consent_at` and the full
 *   `consent_text`. No retention mechanism. Access: anyone holding the Resend
 *   API key or dashboard. Deletion: remove the contact by email in Resend.
 *   **Destination proven.** Legal review: not done. The consent text itself
 *   said "relaunch marketing emails" — MAANTA has never launched (X-WAITLIST).
 * - **`/merchants/join`** → **no request at all.** The form stores nothing:
 *   it pushes the shop name into the `/login?next=/merchant/onboard` URL and
 *   the phone into `sessionStorage` (`@/lib/merchant-join-handoff`), and the
 *   data is only written when the merchant signs in and completes onboarding
 *   through `onboard_merchant` — the product's own authenticated path, which
 *   is Merchant 01's path under the 2026-08-23 GO ruling. It is a door, not a
 *   collector, and `public.leads` (the table the package checked) is the
 *   agent workflow, unrelated to it. The ruling's disable copy exists for it
 *   below so the founder can close the door with one word, but it is left
 *   **open** on the reading that closing it would block the pilot's front
 *   door over a form that holds no data (**D273** records this judgment for
 *   the founder to confirm or overrule).
 *
 * ## Disabled means disabled
 *
 * A closed form renders none of its inputs and its API route refuses with a
 * 503 that says why — never a form that accepts input and discards it, which
 * is the D28 failure. The copy gives the real reason and a working
 * alternative (`ENTITY.email`, verified live and receiving), and carries no
 * count, no "N people already joined", no queue position — not now and not
 * when it reopens.
 */
export type PublicForm = "contact" | "waitlist" | "merchantJoin";

export const FORM_STATUS: Record<PublicForm, "open" | "closed"> = {
  contact: "closed",
  waitlist: "closed",
  merchantJoin: "open",
};

export const isFormCollecting = (form: PublicForm): boolean => FORM_STATUS[form] === "open";

/**
 * The closed-state copy, verbatim from the ruling (`10 §4.3`). Each block is a
 * heading and two short paragraphs; the email is the one working alternative.
 */
export const CLOSED_FORM_COPY: Record<
  PublicForm,
  { heading: string; body: string; alternative: string }
> = {
  waitlist: {
    heading: "The waitlist is closed for now",
    body: "We are checking how we store and protect the details people send us before we ask for any more. We would rather pause than hold your information without being certain of that.",
    alternative: `MAANTA opens first at BBS Mall, Eastleigh. Until the waitlist reopens, email ${ENTITY.email} and we will let you know when we are live.`,
  },
  merchantJoin: {
    heading: "Shop sign-up is closed for now",
    body: "We are checking how we store and protect the details shops send us before we ask for any more. We would rather pause than hold your details without being certain of that.",
    alternative: `If you have a shop at BBS Mall, Eastleigh and want to hear from us first, email ${ENTITY.email}.`,
  },
  contact: {
    heading: "The contact form is temporarily unavailable",
    body: `Email ${ENTITY.email} or message us on WhatsApp — both reach us directly.`,
    alternative: "",
  },
};

/** The message the API route returns while its form is closed. */
export const CLOSED_FORM_API_MESSAGE: Record<PublicForm, string> = {
  contact: `The contact form is temporarily unavailable. Email ${ENTITY.email} or message us on WhatsApp.`,
  waitlist: `The waitlist is closed for now. Email ${ENTITY.email} and we will let you know when we are live.`,
  merchantJoin: `Shop sign-up is closed for now. Email ${ENTITY.email}.`,
};
