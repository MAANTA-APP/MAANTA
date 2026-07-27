import type { AppUser } from "@/lib/data";

const FOUNDER_EMAIL = "founder@maanta.app";

/** Role-aware post-login / PWA start destination. */
export function dashboardPathForUser(
  role: AppUser["role"],
  email?: string | null,
): string {
  if (email?.toLowerCase() === FOUNDER_EMAIL) {
    return "/founder";
  }

  switch (role) {
    case "customer":
      return "/feed";
    case "merchant_admin":
    case "merchant_staff":
      return "/merchant/dashboard";
    case "admin":
      return "/admin";
    case "agent":
      return "/agent";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}
