import { redirect } from "next/navigation";
import { getAppUser, type AppUser } from "@/lib/data";

/**
 * Founder/co-founder dashboard guard.
 * Launch uses the `admin` role in public.users — founders are provisioned as admin.
 */
export async function requireFounderPage(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/founder");
  if (user.role !== "admin") redirect("/");
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
  if (user.role !== "admin") {
    return {
      error: new Response(JSON.stringify({ error: "Not authorized." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { user };
}
