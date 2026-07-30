/**
 * Post-login / PWA `start_url` destinations by `public.users.role`.
 *
 * `founder` / `cofounder` are not DB roles today (founder UI is gated by
 * `admin` — see docs/skills/role-permissions.md). They are mapped here so a
 * future enum addition routes correctly without changing `/app-bootstrap`.
 */
export function destinationForRole(role: string | null | undefined): string {
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
    case "founder":
    case "cofounder":
      return "/founder";
    default:
      if (role) {
        console.warn(
          `[app-bootstrap] unknown role "${role}" — falling back to /feed`
        );
      } else {
        console.warn("[app-bootstrap] missing role — falling back to /feed");
      }
      return "/feed";
  }
}
