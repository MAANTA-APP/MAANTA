import { AppProviders } from "@/components/auth/app-providers";

/**
 * Every merchant surface — the app shell, onboarding and the onboard wizard.
 *
 * Exists to mount `AppProviders`. Clerk moved out of the root layout so marketing
 * pages do not ship the auth SDK; every route that authenticates therefore needs
 * a shell that puts it back.
 */
export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
