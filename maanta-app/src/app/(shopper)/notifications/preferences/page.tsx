import { redirect } from "next/navigation";

/** Preferences live on /notifications — keep this path as a redirect. */
export default function NotificationPreferencesRedirect() {
  redirect("/notifications");
}
