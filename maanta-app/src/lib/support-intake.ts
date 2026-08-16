/**
 * Intake metadata for admin-created support tickets (11e).
 *
 * Issues reach an admin along two axes: an escalation path (agent → node
 * manager → admin → founder) and a contact channel (stall visit, WhatsApp,
 * social media, email, phone). Neither exists in the `agent_tasks` schema —
 * there is no channel column, and "node manager" is a staffing concept
 * (decisions log, 2026-07-31) rather than a database role — so both are
 * recorded as a structured first line of the ticket's description, the same
 * place the override flow already appends its audit line.
 *
 * That is a deliberate floor, not the end state. Making the channel a real
 * column, allowing a ticket with no merchant (merchant_id is NOT NULL), or
 * turning the escalation path into a tracked workflow each need a migration
 * and a founder ruling. Until then the tag keeps the information from being
 * lost, greppable (`[via whatsapp · escalated from agent]`), and out of the
 * free-text the admin writes.
 */

/** How the issue reached us. The user-facing labels are the vocabulary. */
export const INTAKE_CHANNELS = [
  { value: "stall_visit", label: "Stall visit" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "social_media", label: "Social media" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
] as const;

/** Who escalated it, if anyone — the ladder below admin, plus "direct". */
export const ESCALATION_ORIGINS = [
  { value: "direct", label: "Direct to admin" },
  { value: "agent", label: "Escalated from agent" },
  { value: "node_manager", label: "Escalated from node manager" },
] as const;

export type IntakeChannel = (typeof INTAKE_CHANNELS)[number]["value"];
export type EscalationOrigin = (typeof ESCALATION_ORIGINS)[number]["value"];

export function isIntakeChannel(v: string): v is IntakeChannel {
  return INTAKE_CHANNELS.some((c) => c.value === v);
}

export function isEscalationOrigin(v: string): v is EscalationOrigin {
  return ESCALATION_ORIGINS.some((o) => o.value === v);
}

/**
 * The structured first line: `[via whatsapp · escalated from agent]`.
 * "Direct to admin" contributes nothing — absence of an escalation tag IS
 * "direct", so the common case stays short.
 */
export function buildIntakeTag(channel: IntakeChannel, origin: EscalationOrigin): string {
  const parts = [`via ${channel.replace(/_/g, " ")}`];
  if (origin !== "direct") parts.push(`escalated from ${origin.replace(/_/g, " ")}`);
  return `[${parts.join(" · ")}]`;
}

/** Description as stored: tag first, then the admin's own words. */
export function buildTicketDescription(
  channel: IntakeChannel,
  origin: EscalationOrigin,
  body: string
): string {
  const text = body.trim();
  return text ? `${buildIntakeTag(channel, origin)}\n${text}` : buildIntakeTag(channel, origin);
}
