import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// SERVER ONLY. Bypasses RLS. Never import into a Client Component.
// Use only for privileged ops: redemption verification, IntaSend webhook,
// web-push dispatch, trial management. RLS is the real backstop everywhere else.

let cached: SupabaseClient | null = null;

/**
 * Shared service-role client for the current process.
 * Reuses one client per warm serverless isolate instead of allocating on every call.
 */
export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/** Test-only: drop the cached client so env changes are picked up. */
export function resetServiceClientForTests(): void {
  cached = null;
}
