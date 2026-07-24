/**
 * Environment self-check (tracker E10 support / launch-audit "healthz").
 *
 * Reports whether the essential env wiring is PRESENT — booleans only, never a
 * value — so an operator can confirm from outside that a running deployment has
 * its Supabase/Clerk/Stripe/monitoring/analytics config without exposing any
 * secret. It only reports; it never mutates or "fixes" env.
 *
 * A var reads as present only when it is a non-empty, non-whitespace string, so
 * a blank Vercel var counts as missing (matching the /api/waitlist?healthz=1
 * convention).
 */
export type EnvSource = Record<string, string | undefined>;

export interface HealthGroup {
  /** All the group's required vars are present. */
  complete: boolean;
  /** This integration is not launch-blocking if absent (no-op by design). */
  optional: boolean;
  /** Per-var presence (booleans only, never values). */
  vars: Record<string, boolean>;
  /** Extra non-secret context (e.g. Stripe/IntaSend live-vs-test mode). */
  note?: string;
}

export interface HealthReport {
  /** True when every non-optional group is complete. */
  ready: boolean;
  nodeEnv: string;
  groups: Record<string, HealthGroup>;
}

const present = (env: EnvSource, key: string): boolean =>
  Boolean(env[key]?.trim());

function group(
  env: EnvSource,
  keys: string[],
  optional: boolean,
  note?: string
): HealthGroup {
  const vars: Record<string, boolean> = {};
  for (const k of keys) vars[k] = present(env, k);
  const complete = keys.every((k) => vars[k]);
  return { complete, optional, vars, ...(note ? { note } : {}) };
}

/**
 * Build the health report from an env source (defaults to process.env, but
 * injectable for tests). Grouping mirrors .env.example and the launch-audit env
 * table. `ready` ignores optional groups (Sentry/PostHog no-op safely when
 * unset), so it reflects "can the core signed-in + money flows work".
 */
export function envHealth(env: EnvSource = process.env): HealthReport {
  const modeNote = (key: string) =>
    env[key]?.trim() === "live" ? "live mode" : "test/sandbox mode (default)";

  const groups: Record<string, HealthGroup> = {
    supabase: group(
      env,
      [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ],
      false
    ),
    auth: group(env, ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"], false),
    appUrl: group(env, ["NEXT_PUBLIC_APP_URL"], false),
    stripe: group(
      env,
      ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      false,
      modeNote("STRIPE_ENV")
    ),
    intasend: group(
      env,
      ["INTASEND_API_KEY", "INTASEND_SECRET", "INTASEND_WEBHOOK_SECRET"],
      // M-Pesa/IntaSend is blocked on account access (tracker E6) — not
      // launch-blocking for a KES card-only rehearsal, so optional here.
      true,
      modeNote("INTASEND_ENV")
    ),
    w3w: group(env, ["W3W_API_KEY"], false),
    monitoring: group(env, ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"], true),
    analytics: group(
      env,
      [
        "POSTHOG_PROJECT_KEY",
        "POSTHOG_HOST",
        "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
        "NEXT_PUBLIC_POSTHOG_HOST",
      ],
      true
    ),
    resend: group(
      env,
      ["RESEND_API_KEY", "RESEND_AUDIENCE_ID", "RESEND_FROM_EMAIL"],
      true
    ),
    push: group(env, ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"], true),
  };

  const ready = Object.values(groups).every((g) => g.optional || g.complete);
  return { ready, nodeEnv: env.NODE_ENV ?? "unknown", groups };
}
