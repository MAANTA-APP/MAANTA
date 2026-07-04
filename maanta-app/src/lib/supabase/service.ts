import { createClient } from '@supabase/supabase-js';

// SERVER ONLY. Bypasses RLS. Never import into a Client Component.
// Use only for privileged ops: redemption verification, IntaSend webhook,
// web-push dispatch, trial management. RLS is the real backstop everywhere else.
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
