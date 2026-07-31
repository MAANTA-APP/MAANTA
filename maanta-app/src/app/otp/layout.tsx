import { AppProviders } from "@/components/auth/app-providers";

/**
 * OTP entry, behind authentication.
 *
 * Exists to mount `AppProviders`. Clerk moved out of the root layout so marketing
 * pages do not ship the auth SDK; every route that authenticates therefore needs
 * a shell that puts it back.
 */
export default function OtpLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
