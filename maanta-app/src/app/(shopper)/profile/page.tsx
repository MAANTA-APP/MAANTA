import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/data";
import { maskPhone } from "@/lib/ui";
import { SettingsRow } from "@/components/ui/cards";
import SignOutButton from "@/app/sign-out-button";

export const dynamic = "force-dynamic";

/** 8q Profile / settings. */
export default async function ProfilePage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/profile");

  return (
    <main className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-ink">Profile</h1>

      <div className="mt-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-cream-dark bg-cream text-[10px] text-faint">
          photo
        </div>
        <div>
          <p className="text-base font-bold text-ink">
            {user.full_name || "Maanta shopper"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Nairobi{user.phone ? ` · ${maskPhone(user.phone)}` : ""}
          </p>
        </div>
      </div>

      {user.email ? (
        <div className="mt-6 flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
          <span className="text-sm font-semibold text-ink">Email</span>
          <span className="text-sm text-muted">{user.email}</span>
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        <SettingsRow href="/profile" label="Edit profile" />
        <SettingsRow href="/notifications/preferences" label="Notification preferences" />
        <SettingsRow href="/profile" label="Theme" value="Light" />
        <SettingsRow href="/help" label="Help & support" />
      </div>

      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
