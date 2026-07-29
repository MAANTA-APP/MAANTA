import { redirect } from "next/navigation";
import { getAppUser, type AppUser } from "@/lib/data";
import { hasFounderAccess } from "@/lib/roles";

/**
 * Founder/co-founder dashboard guard.
 * Launch uses the `admin` role in public.users — founders are provisioned as
 * admin, so FOUNDER_ROLES currently equals OPERATOR_ROLES. The two lists are
 * kept apart in `src/lib/roles.ts` so narrowing founder access later (see
 * docs/skills/founder-role-split.md) doesn't have to touch this file.
 */
export async function requireFounderPage(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/founder");
  if (!hasFounderAccess(user)) redirect("/");
  return user;
}

/** Route-handler guard for founder API routes. */
export async function requireFounderApi(): Promise<
  { user: AppUser } | { error: Response }
> {
  const user = await getAppUser();
  if (!user) {
    return {
      error: new Response(JSON.stringify({ error: "Sign in required." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  if (!hasFounderAccess(user)) {
    return {
      error: new Response(JSON.stringify({ error: "Not authorized." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { user };
}
