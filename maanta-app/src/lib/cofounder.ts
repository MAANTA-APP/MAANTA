import { redirect } from "next/navigation";
import { getAppUser, type AppUser } from "@/lib/data";
import { canAccessFounderDashboard } from "@/lib/roles";

/** Server-component guard for `/founder` — admin or cofounder. */
export async function requireFounderPage(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/founder");
  if (!canAccessFounderDashboard(user.role)) redirect("/");
  return user;
}
