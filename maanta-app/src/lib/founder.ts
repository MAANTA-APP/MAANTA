import { redirect } from "next/navigation";
import { getAppUser, type AppUser } from "@/lib/data";
import { canAccessFounderDashboard } from "@/lib/roles";

/**
 * Founder/co-founder dashboard guard — `admin` or `cofounder`.
 *
 * `cofounder` is a real value in `public.users.role` as of migration
 * 20260804010000. Before it, co-founders were provisioned as `admin`, so
 * reaching this dashboard also carried every money action in `/admin/*`.
 */
export async function requireFounderPage(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/founder");
  if (!canAccessFounderDashboard(user.role)) redirect("/");
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
  if (!canAccessFounderDashboard(user.role)) {
    return {
      error: new Response(JSON.stringify({ error: "Not authorized." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { user };
}
