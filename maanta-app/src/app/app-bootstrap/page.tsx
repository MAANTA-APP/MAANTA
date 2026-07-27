import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/data";
import { getDefaultRouteForRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Post-login / PWA cold-start router.
 * Sends each role to its default console; signed-out users go to /download.
 */
export default async function AppBootstrapPage() {
  const user = await getAppUser();
  if (!user) redirect("/download");
  redirect(getDefaultRouteForRole(user.role));
}
