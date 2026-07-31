import { AppProviders } from "@/components/auth/app-providers";

/**
 * Mall selection, behind authentication.
 *
 * Exists to mount `AppProviders`. Clerk moved out of the root layout so marketing
 * pages do not ship the auth SDK; every route that authenticates therefore needs
 * a shell that puts it back.
 */
export default function SelectMallLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
