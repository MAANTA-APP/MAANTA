import { IconGlobe, IconHome } from "@/components/ui/icons";

/**
 * The "go look at the real thing" destinations, shared by the admin sidebar and
 * the founder header.
 *
 * One list, because two lists is two places to drift — the admin console and the
 * founder dashboard should never disagree about where the live product is.
 *
 * Both destinations are reachable by every role that can open either shell, and
 * that is the part worth stating: `/` is public marketing, and the shopper layout
 * carries no role guard, so `/feed` renders for an admin or co-founder instead of
 * bouncing them. A nav link whose target redirects is worse than no link.
 *
 * They open in a new tab. An operator checking what a shopper sees is doing it
 * *while* working a queue; replacing the console in place would cost them their
 * place in it, and the shopper surfaces have no route back to admin.
 */
export const LIVE_PRODUCT_LINKS = [
  { href: "/", label: "View site", Icon: IconGlobe },
  { href: "/feed", label: "Shopper feed", Icon: IconHome },
] as const;

/** Appended to each label for screen readers, since the tab change is otherwise silent. */
export const NEW_TAB_HINT = " (opens in a new tab)";
