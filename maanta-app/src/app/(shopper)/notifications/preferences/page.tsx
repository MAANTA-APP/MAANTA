import { redirect } from "next/navigation";

/** Legacy route — wireframe canonical is /you/notifications. */
export default function NotificationPreferencesRedirect() {
  redirect("/you/notifications");
}
