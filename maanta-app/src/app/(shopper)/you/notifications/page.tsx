import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/data";
import {
  BackToYouLink,
  Body,
  HeadingLg,
  Page,
  Section,
} from "@/components/ui/claude";
import { NotificationToggles } from "@/components/notifications/notification-toggles";

export const dynamic = "force-dynamic";

/** Notification preferences — three toggles per wireframe. */
export default async function YouNotificationsPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/you/notifications");

  return (
    <Page className="px-0 pt-4">
      <div className="px-4">
        <BackToYouLink />
        <HeadingLg className="mt-4">Notifications</HeadingLg>
        <Body className="mt-1">Choose which deal alerts you receive.</Body>
      </div>

      <Section className="mt-6">
        <NotificationToggles />
      </Section>
    </Page>
  );
}
