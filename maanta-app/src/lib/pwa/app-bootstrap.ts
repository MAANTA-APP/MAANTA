/**
 * Post-login / PWA `start_url` destinations by `public.users.role`.
 *
 * `cofounder` became a real value in `public.users.role` in migration
 * 20260804010000 and now reaches `/founder` on its own. `founder` is still not a
 * DB role — it is mapped defensively so a future enum addition routes correctly
 * without changing `/app-bootstrap`. See docs/skills/role-permissions.md.
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
