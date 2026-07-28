import * as Sentry from "@sentry/nextjs";
import { warnMissingCriticalEnv } from "@/lib/env";

export async function register() {
  // Soft warn when critical env is incomplete for the active auth strategy.
  // Never throws — CI/build uses placeholders; production operators should
  // check GET /api/healthz?ready=1 after deploy.
  warnMissingCriticalEnv();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
