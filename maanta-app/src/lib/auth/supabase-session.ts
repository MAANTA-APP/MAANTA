import { createClient } from "@/lib/supabase/server";

/** Supabase Auth user id (UUID) for the current request, or null when signed out. */
export async function currentSupabaseAuthUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Email from the Supabase Auth session, if present. */
export async function currentSupabaseAuthEmail(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}
