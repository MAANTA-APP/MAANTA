const MAX_PUSH_SUBSCRIPTION_BYTES = 8_192;

export type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys?: { p256dh?: string; auth?: string };
};

/** Validate and bound a Web Push subscription before persisting to JSONB. */
export function parsePushSubscription(raw: unknown): PushSubscriptionPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const sub = raw as Record<string, unknown>;
  const endpoint = typeof sub.endpoint === "string" ? sub.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 2048) return null;

  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }

  const out: PushSubscriptionPayload = { endpoint };
  if (sub.expirationTime != null) {
    const exp = Number(sub.expirationTime);
    if (!Number.isFinite(exp)) return null;
    out.expirationTime = exp;
  }

  if (sub.keys != null) {
    if (typeof sub.keys !== "object" || Array.isArray(sub.keys)) return null;
    const keys = sub.keys as Record<string, unknown>;
    const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
    const auth = typeof keys.auth === "string" ? keys.auth : "";
    if (!p256dh || p256dh.length > 512 || !auth || auth.length > 256) return null;
    out.keys = { p256dh, auth };
  }

  const serialized = JSON.stringify(out);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PUSH_SUBSCRIPTION_BYTES) return null;

  return out;
}
