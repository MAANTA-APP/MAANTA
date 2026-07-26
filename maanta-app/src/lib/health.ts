/**
 * Health / readiness primitives for GET /api/healthz.
 *
 * Three independent concerns, kept separate on purpose:
 *
 *  - `liveness()` — cheap, dependency-free "is this process up" info. Safe to
 *    expose publicly and safe for an uptime probe to hammer: it touches no DB,
 *    no network, and no secrets.
 *  - `envPresence()` — a boolean-only map of whether each critical env var is
 *    set on the running deployment. It NEVER returns a value, only presence, so
 *    it can't leak a secret. Even so, knowing *which* rails are wired is
 *    operational detail, so the route gates it behind an admin check.
 *  - `probeSupabase()` — admin-gated connectivity + schema check (no secret
 *    values; machine-readable reasons only).
 *
 * Env helpers only READ `process.env`. They never mutate or "fix" config.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { isMissingLatLngColumnError } from "@/lib/supabase/postgrest-errors";

/** True when an env var is set to a non-blank value (whitespace-only = unset). */
function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/**
 * Env presence grouped by rail, booleans only. Names mirror `.env.example`; add
 * new keys here as new rails are wired so healthz stays an honest mirror of what
 * the app actually reads.
 */
export type EnvPresence = {
  supabase: {
    NEXT_PUBLIC_SUPABASE_URL: boolean;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: boolean;
    SUPABASE_SERVICE_ROLE_KEY: boolean;
  };
  auth: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: boolean;
    CLERK_SECRET_KEY: boolean;
  };
  payments: {
    STRIPE_SECRET_KEY: boolean;
    STRIPE_WEBHOOK_SECRET: boolean;
    INTASEND_API_KEY: boolean;
    INTASEND_SECRET: boolean;
    INTASEND_WEBHOOK_SECRET: boolean;
  };
  monitoring: {
    SENTRY_DSN: boolean;
    NEXT_PUBLIC_SENTRY_DSN: boolean;
    POSTHOG_PROJECT_KEY: boolean;
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: boolean;
  };
  email: {
    RESEND_API_KEY: boolean;
    RESEND_AUDIENCE_ID: boolean;
    RESEND_FROM_EMAIL: boolean;
  };
  push: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: boolean;
    VAPID_PRIVATE_KEY: boolean;
  };
  geo: {
    W3W_API_KEY: boolean;
  };
};

export function envPresence(): EnvPresence {
  return {
    supabase: {
      NEXT_PUBLIC_SUPABASE_URL: present("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: present("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: present("SUPABASE_SERVICE_ROLE_KEY"),
    },
    auth: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: present("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
      CLERK_SECRET_KEY: present("CLERK_SECRET_KEY"),
    },
    payments: {
      STRIPE_SECRET_KEY: present("STRIPE_SECRET_KEY"),
      STRIPE_WEBHOOK_SECRET: present("STRIPE_WEBHOOK_SECRET"),
      INTASEND_API_KEY: present("INTASEND_API_KEY"),
      INTASEND_SECRET: present("INTASEND_SECRET"),
      INTASEND_WEBHOOK_SECRET: present("INTASEND_WEBHOOK_SECRET"),
    },
    monitoring: {
      SENTRY_DSN: present("SENTRY_DSN"),
      NEXT_PUBLIC_SENTRY_DSN: present("NEXT_PUBLIC_SENTRY_DSN"),
      POSTHOG_PROJECT_KEY: present("POSTHOG_PROJECT_KEY"),
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: present("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"),
    },
    email: {
      RESEND_API_KEY: present("RESEND_API_KEY"),
      RESEND_AUDIENCE_ID: present("RESEND_AUDIENCE_ID"),
      RESEND_FROM_EMAIL: present("RESEND_FROM_EMAIL"),
    },
    push: {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: present("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
      VAPID_PRIVATE_KEY: present("VAPID_PRIVATE_KEY"),
    },
    geo: {
      W3W_API_KEY: present("W3W_API_KEY"),
    },
  };
}

export type Liveness = {
  status: "ok";
  nodeEnv: string;
  runtime: string;
  /** Whole seconds this server process has been up (0 if unavailable). */
  uptimeSeconds: number;
  /** Short git SHA of the deployed build, when the platform exposes it. */
  commit: string | null;
};

export function liveness(): Liveness {
  const uptime =
    typeof process !== "undefined" && typeof process.uptime === "function"
      ? Math.round(process.uptime())
      : 0;
  // Vercel exposes the build's commit SHA at runtime; redact to the short form
  // and never assume it exists (local/other hosts won't set it).
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return {
    status: "ok",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    uptimeSeconds: uptime,
    commit: sha ? sha.slice(0, 7) : null,
  };
}

/**
 * Admin-only Supabase probe. Never returns connection strings, keys, or raw
 * provider error text — only coarse reasons an operator can act on.
 */
export type SupabaseProbe = {
  configured: boolean;
  reachable: boolean | null;
  merchantLatLng: boolean | null;
  reason: "ok" | "missing_env" | "unreachable" | "missing_lat_lng";
};

export async function probeSupabase(): Promise<SupabaseProbe> {
  const configured =
    present("NEXT_PUBLIC_SUPABASE_URL") && present("SUPABASE_SERVICE_ROLE_KEY");
  if (!configured) {
    return {
      configured: false,
      reachable: null,
      merchantLatLng: null,
      reason: "missing_env",
    };
  }

  try {
    const service = createServiceClient();
    const { error: dealsError } = await service.from("deals").select("id").limit(1);
    if (dealsError) {
      return {
        configured: true,
        reachable: false,
        merchantLatLng: null,
        reason: "unreachable",
      };
    }

    const { error: latError } = await service
      .from("merchants")
      .select("id, lat, lng")
      .limit(1);
    if (latError) {
      if (isMissingLatLngColumnError(latError)) {
        return {
          configured: true,
          reachable: true,
          merchantLatLng: false,
          reason: "missing_lat_lng",
        };
      }
      return {
        configured: true,
        reachable: false,
        merchantLatLng: null,
        reason: "unreachable",
      };
    }

    return {
      configured: true,
      reachable: true,
      merchantLatLng: true,
      reason: "ok",
    };
  } catch {
    return {
      configured: true,
      reachable: false,
      merchantLatLng: null,
      reason: "unreachable",
    };
  }
}
