import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/data";
import { dashboardPathForUser } from "@/lib/app-bootstrap";

export const dynamic = "force-dynamic";

export default async function AppBootstrapPage() {
  const user = await getAppUser();
  if (!user) {
    redirect("/login?next=/app-bootstrap");
  }

  redirect(dashboardPathForUser(user.role, user.email));
}
