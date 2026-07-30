import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getAppUser, type AppUser } from "@/lib/data";
import { isOperator } from "@/lib/roles";

/** Server-component guard: only admins reach admin pages. */
export async function requireAdminPage(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/admin");
  if (!isOperator(user)) redirect("/");
  return user;
}

/** Route-handler guard. */
export async function requireAdminApi(): Promise<
  { user: AppUser } | { error: NextResponse }
> {
  const user = await getAppUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  if (!isOperator(user)) {
    return { error: NextResponse.json({ error: "Not authorized." }, { status: 403 }) };
  }
  return { user };
}
