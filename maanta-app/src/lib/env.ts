/**
 * Environment variable catalog and soft validation for MAANTA.
 *
 * - Catalog documents every var the app reads (mirrors `.env.example`).
 * - `warnMissingCriticalEnv()` logs once at startup when critical rails are
 *   missing for the active auth strategy — never throws (build/CI must work
 *   with placeholders).
 * - Hard throws remain in feature modules that cannot function without secrets
 *   (e.g. `createServiceClient`, Stripe client).
 *
 * See `docs/ops/vercel-production-env-checklist.md` for operator steps.
 */

import { authStrategy, type AuthStrategy } from "@/lib/auth/strategy";

export type EnvScope = "development" | "preview" | "production" | "all";
export type EnvRequirement = "required" | "optional" | "strategy-dependent";

export type EnvVarDoc = {
  name: string;
  purpose: string;
  requirement: EnvRequirement;
  scopes: EnvScope[];
  /** True when Next.js inlines the value at build time (NEXT_PUBLIC_*). */
  buildTimePublic: boolean;
  /** Redeploy required after changing on Vercel (true for all; emphasized for public). */
  redeployRequired: boolean;
  example?: string;
  notes?: string;
};

/** Single source of truth for env documentation (kept in sync with .env.example). */
export const ENV_CATALOG: readonly EnvVarDoc[] = [
  {
    name: "MAANTA_AUTH_STRATEGY",
    purpose: "Server auth strategy: clerk | supabase | authjs",
    requirement: "required",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    example: "clerk",
    notes: "Must match NEXT_PUBLIC_MAANTA_AUTH_STRATEGY.",
  },
  {
    name: "NEXT_PUBLIC_MAANTA_AUTH_STRATEGY",
    purpose: "Client auth strategy mirror",
    requirement: "required",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
    example: "clerk",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    purpose: "Supabase project URL",
    requirement: "required",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
    example: "https://axrrslqssmbngbataejg.supabase.co",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    purpose: "Supabase anon/publishable key",
    requirement: "required",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    purpose: "Supabase service-role secret (server only)",
    requirement: "required",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    notes: "Never expose to the browser. Used by SSR browse and money-path APIs.",
  },
  {
    name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    purpose: "Clerk publishable key",
    requirement: "strategy-dependent",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
    notes: "Required when MAANTA_AUTH_STRATEGY=clerk. Optional in supabase rehearsal.",
  },
  {
    name: "CLERK_SECRET_KEY",
    purpose: "Clerk secret key",
    requirement: "strategy-dependent",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    notes: "Required when MAANTA_AUTH_STRATEGY=clerk. Must match publishable key instance.",
  },
  {
    name: "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
    purpose: "Clerk sign-in route",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
    example: "/login",
  },
  {
    name: "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
    purpose: "Clerk sign-up route",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
    example: "/sign-up",
  },
  {
    name: "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
    purpose: "Post-login role router",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
    example: "/app-bootstrap",
  },
  {
    name: "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
    purpose: "Post-signup role router",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
    example: "/app-bootstrap",
  },
  {
    name: "NEXT_PUBLIC_LAUNCH_AUTH_MODE",
    purpose: "Launch sign-up mix: email_and_phone | phone_only",
    requirement: "optional",
    scopes: ["production", "preview"],
    buildTimePublic: true,
    redeployRequired: true,
    example: "email_and_phone",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    purpose: "Canonical public origin (Stripe redirects, emails)",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
    example: "https://www.maanta.app",
    notes: "Required on production for correct Stripe success/cancel URLs.",
  },
  {
    name: "STRIPE_SECRET_KEY",
    purpose: "Stripe API secret",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    notes: "Required for card top-up. Use sk_test_ until live cutover.",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    purpose: "Stripe webhook signing secret",
    requirement: "optional",
    scopes: ["preview", "production"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "STRIPE_ENV",
    purpose: 'Set to "live" for live charges; otherwise test-mode guard',
    requirement: "optional",
    scopes: ["production"],
    buildTimePublic: false,
    redeployRequired: true,
    example: "live",
  },
  {
    name: "INTASEND_API_KEY",
    purpose: "IntaSend public key (M-Pesa STK)",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    notes: "Do not assume IntaSend availability (tracker E6).",
  },
  {
    name: "INTASEND_SECRET",
    purpose: "IntaSend secret key",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "INTASEND_WEBHOOK_SECRET",
    purpose: "IntaSend webhook challenge secret",
    requirement: "optional",
    scopes: ["preview", "production"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "INTASEND_ENV",
    purpose: 'Set to "live" for production IntaSend API',
    requirement: "optional",
    scopes: ["production"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "SENTRY_DSN",
    purpose: "Sentry server/edge DSN",
    requirement: "optional",
    scopes: ["preview", "production"],
    buildTimePublic: false,
    redeployRequired: true,
    notes: "No-op when unset. Recommended for production.",
  },
  {
    name: "NEXT_PUBLIC_SENTRY_DSN",
    purpose: "Sentry browser DSN",
    requirement: "optional",
    scopes: ["preview", "production"],
    buildTimePublic: true,
    redeployRequired: true,
  },
  {
    name: "SENTRY_AUTH_TOKEN",
    purpose: "Sentry source-map upload token (build only)",
    requirement: "optional",
    scopes: ["preview", "production"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "POSTHOG_PROJECT_KEY",
    purpose: "PostHog server project key",
    requirement: "optional",
    scopes: ["preview", "production"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "POSTHOG_HOST",
    purpose: "PostHog ingest host",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    example: "https://eu.i.posthog.com",
  },
  {
    name: "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
    purpose: "PostHog client project token",
    requirement: "optional",
    scopes: ["preview", "production"],
    buildTimePublic: true,
    redeployRequired: true,
  },
  {
    name: "NEXT_PUBLIC_POSTHOG_HOST",
    purpose: "PostHog client host (if used)",
    requirement: "optional",
    scopes: ["preview", "production"],
    buildTimePublic: true,
    redeployRequired: true,
  },
  {
    name: "RESEND_API_KEY",
    purpose: "Resend API key (waitlist)",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "RESEND_AUDIENCE_ID",
    purpose: "Resend waitlist audience ID",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "RESEND_FROM_EMAIL",
    purpose: "Verified Resend from address",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    example: "MAANTA <hello@mail.maanta.app>",
  },
  {
    name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    purpose: "Web Push VAPID public key",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: true,
    redeployRequired: true,
  },
  {
    name: "VAPID_PRIVATE_KEY",
    purpose: "Web Push VAPID private key",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
  },
  {
    name: "VAPID_SUBJECT",
    purpose: "VAPID contact URI",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    example: "mailto:admin@maanta.app",
  },
  {
    name: "W3W_API_KEY",
    purpose: "what3words API key",
    requirement: "optional",
    scopes: ["all"],
    buildTimePublic: false,
    redeployRequired: true,
    notes: "Dev fallback exists for /api/w3w/validate when unset.",
  },
] as const;

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** Critical env names for the active auth strategy (server). */
export function criticalEnvNames(strategy?: AuthStrategy): string[] {
  const s = strategy ?? authStrategy();
  const base = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  if (s === "clerk") {
    return [
      ...base,
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
    ];
  }
  return base;
}

export type CriticalEnvReport = {
  strategy: AuthStrategy;
  missing: string[];
  ok: boolean;
};

/** Report which critical env vars are missing for the active strategy. */
export function reportCriticalEnv(strategy?: AuthStrategy): CriticalEnvReport {
  const s = strategy ?? authStrategy();
  const missing = criticalEnvNames(s).filter((name) => !present(name));
  return { strategy: s, missing, ok: missing.length === 0 };
}

let warned = false;

/**
 * Soft warn once when critical env is incomplete.
 * Safe for import from instrumentation / health — never throws.
 */
export function warnMissingCriticalEnv(strategy?: AuthStrategy): CriticalEnvReport {
  const report = reportCriticalEnv(strategy);
  if (!report.ok && !warned && process.env.NODE_ENV !== "test") {
    warned = true;
    console.warn(
      `[maanta/env] Missing critical env for strategy="${report.strategy}": ${report.missing.join(", ")}. ` +
        `See docs/ops/vercel-production-env-checklist.md`
    );
  }
  return report;
}

/** Reset warn-once latch (tests only). */
export function __resetEnvWarnLatchForTests(): void {
  warned = false;
}

/** Build-time public vars that require a full redeploy after Vercel change. */
export function buildTimePublicEnvNames(): string[] {
  return ENV_CATALOG.filter((e) => e.buildTimePublic).map((e) => e.name);
}
