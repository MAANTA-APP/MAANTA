// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The privileged session journey, end to end, in a DOM:
 *
 *   landing page → shared Sign in → (role-routed by /app-bootstrap) →
 *   Admin / Founder shell → explicit Sign out → /login
 *
 * Until 2026-09-03 both ends were missing (D258, D259): the public header
 * offered no way in, and neither privileged shell offered a way out. These
 * are interaction tests, not source scans — the sheet and the drawer are
 * opened by clicking their toggles, and the sign-out button is clicked
 * under each auth strategy with the provider faked, so what is asserted is
 * what a person gets: an `/login` link they can see on a phone and on a
 * desktop, a `Sign out` they can reach in both shells, and a click that ends
 * the session through the provider production actually uses and lands on
 * `/login` — or, when the provider refuses, stays put and says so (D260).
 *
 * Removing the Sign in link from either responsive navigation, or the Sign
 * out control from either shell, fails a test here (mutation-proved on
 * 2026-09-03 — see docs/skills/admin-founder-command-centre-2026-09-03.md §15).
 */

// ---- provider fakes ---------------------------------------------------------
const fakes = vi.hoisted(() => ({
  pathname: "/",
  clerkSignOut: vi.fn<(o: { redirectUrl: string }) => Promise<unknown>>(),
  supabaseSignOut: vi.fn<() => Promise<{ error: { message?: string } | null }>>(),
  push: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => fakes.pathname,
  useRouter: () => ({ push: fakes.push, refresh: fakes.refresh, replace: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    createElement("img", { alt: "", ...props, priority: undefined } as never),
}));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: fakes.clerkSignOut }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: fakes.supabaseSignOut } }),
}));

import { SiteHeader } from "@/components/marketing/SiteHeader";
import { AdminSidebar } from "@/components/nav/admin-sidebar";
import { FounderHeader } from "@/components/nav/founder-header";
import SignOutButton, { SIGN_OUT_LABEL } from "@/app/sign-out-button";
import { HEADER_CTA, HEADER_SIGN_IN } from "@/lib/marketing/nav";
import { SIGN_OUT_FAILED_MESSAGE } from "@/lib/auth/sign-out";

// ---- DOM harness -----------------------------------------------------------
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(el: ReactElement) {
  act(() => root.render(el));
}

async function click(el: Element | null | undefined) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

const byText = (root: ParentNode, selector: string, text: string) =>
  Array.from(root.querySelectorAll(selector)).find((e) => e.textContent?.trim() === text) ??
  null;

/** True when the element or any ancestor carries a class that hides it. */
function hiddenByClass(el: Element, hidingClasses: RegExp): boolean {
  let cur: Element | null = el;
  while (cur && cur !== container) {
    if (hidingClasses.test(cur.className)) return true;
    cur = cur.parentElement;
  }
  return false;
}

const ORIGINAL_STRATEGY = process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fakes.pathname = "/";
  fakes.clerkSignOut.mockReset();
  fakes.supabaseSignOut.mockReset();
  fakes.push.mockReset();
  fakes.refresh.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (ORIGINAL_STRATEGY === undefined) delete process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY;
  else process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY = ORIGINAL_STRATEGY;
});

// ---- 1. the way in ---------------------------------------------------------
describe("the public header exposes the shared /login entry (D259)", () => {
  it("names it Sign in, points it at the one shared login, and never at a role-specific route", () => {
    expect(HEADER_SIGN_IN.href).toBe("/login");
    expect(HEADER_SIGN_IN.label).toBe("Sign in");
    expect(HEADER_SIGN_IN.label).not.toMatch(/admin|founder|merchant/i);
  });

  it("desktop bar: a Sign in link to /login is present outside the mobile sheet", () => {
    mount(createElement(SiteHeader));
    const link = byText(container, 'a[href="/login"]', "Sign in");
    expect(link, "no Sign in link to /login in the desktop bar").toBeTruthy();
    // Outside the sheet, and not hidden at the desktop breakpoint.
    expect(link!.closest("#marketing-mobile-nav")).toBeNull();
    expect(hiddenByClass(link!, /\blg:hidden\b/)).toBe(false);
  });

  it("mobile sheet: opening the menu reveals a Sign in link to /login", async () => {
    mount(createElement(SiteHeader));
    expect(container.querySelector("#marketing-mobile-nav")).toBeNull();
    await click(container.querySelector('button[aria-controls="marketing-mobile-nav"]'));
    const sheet = container.querySelector("#marketing-mobile-nav");
    expect(sheet, "the mobile sheet did not open").toBeTruthy();
    const link = byText(sheet!, 'a[href="/login"]', "Sign in");
    expect(link, "no Sign in link to /login inside the mobile sheet").toBeTruthy();
    // Nothing on the path to it is hidden at phone widths: no bare `hidden`
    // (the sheet's own `lg:hidden` is the desktop side, and correct).
    expect(hiddenByClass(link!, /(^|\s)hidden(\s|$)|\bmax-lg:hidden\b/)).toBe(false);
  });

  it("keeps Browse deals as the only amber element and styles Sign in as secondary", async () => {
    mount(createElement(SiteHeader));
    await click(container.querySelector('button[aria-controls="marketing-mobile-nav"]'));
    const amber = Array.from(container.querySelectorAll("[class*='bg-brand']"));
    // One in the bar, one pinned at the top of the open sheet — both the CTA.
    expect(amber.map((a) => a.getAttribute("href"))).toEqual([HEADER_CTA.href, HEADER_CTA.href]);
    for (const link of Array.from(container.querySelectorAll('a[href="/login"]'))) {
      expect(link.className).not.toMatch(/bg-brand|text-brand|border-brand/);
    }
  });
});

// ---- 2. the way out, in both privileged shells --------------------------------
describe("the admin shell exposes Sign out on desktop and mobile (D258)", () => {
  beforeEach(() => {
    fakes.pathname = "/admin";
  });

  it("desktop sidebar: a Sign out button sits inside the ink <aside>", () => {
    mount(createElement(AdminSidebar));
    const aside = container.querySelector("aside");
    expect(aside).toBeTruthy();
    const btn = byText(aside!, "button", SIGN_OUT_LABEL);
    expect(btn, "no Sign out button in the desktop sidebar").toBeTruthy();
    expect(btn!.getAttribute("type")).toBe("button");
  });

  it("mobile drawer: opening the menu reveals a Sign out button", async () => {
    mount(createElement(AdminSidebar));
    // Closed: the drawer is not in the document at all.
    expect(container.querySelectorAll("nav").length).toBe(1);
    await click(byText(container, "button[aria-label='Open menu']", "") ?? container.querySelector("button[aria-label='Open menu']"));
    const navs = Array.from(container.querySelectorAll("nav"));
    expect(navs.length, "the drawer did not open").toBe(2);
    const drawerNav = navs[1];
    expect(drawerNav.closest("aside"), "second nav must be the drawer, not the aside").toBeNull();
    const btn = byText(drawerNav, "button", SIGN_OUT_LABEL);
    expect(btn, "no Sign out button in the mobile drawer").toBeTruthy();
    // The drawer is the only shell on a phone: nothing on the path to the
    // button may be hidden below `lg`.
    expect(hiddenByClass(btn!, /(^|\s)hidden(\s|$)|\bmax-lg:hidden\b/)).toBe(false);
  });

  it("is legible on the black sidebar: ≥ 4.5:1 against bg-ink, and never the default ink label", async () => {
    delete process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY;
    fakes.supabaseSignOut.mockResolvedValue({ error: { message: "refused" } });
    mount(createElement(AdminSidebar));
    const aside = container.querySelector("aside")!;
    expect(aside.className).toMatch(/\bbg-ink\b/);
    const ink = hexFromTailwind("ink", "DEFAULT");
    const legibleOnInk = (el: Element, what: string) => {
      expect(el.className, `${what} carries the default ink label`).not.toMatch(/\btext-ink\b/);
      const m = el.className.match(/\btext-white(?:\/(\d{1,3}))?\b/);
      expect(m, `${what} must use a white text token on the sidebar`).toBeTruthy();
      const alpha = m![1] ? Number(m![1]) / 100 : 1;
      // Composite white at that alpha over the sidebar's ink and measure.
      expect(contrast(composite([255, 255, 255], alpha, ink), ink)).toBeGreaterThanOrEqual(4.5);
    };
    const btn = byText(aside, "button", SIGN_OUT_LABEL)!;
    legibleOnInk(btn, "the Sign out button");
    // And the failure line it shows when the provider refuses (D260) — which
    // would otherwise inherit the page's ink and vanish on this ground.
    await click(btn);
    const alert = aside.querySelector("[role='alert']");
    expect(alert, "the refusal line did not render in the sidebar").toBeTruthy();
    legibleOnInk(alert!, "the sign-out failure line");
  });
});

describe("the founder shell exposes Sign out on desktop and mobile (D258)", () => {
  for (const canOpenAdminConsole of [true, false]) {
    it(`renders Sign out for ${canOpenAdminConsole ? "an admin" : "a co-founder"}, never hidden behind a breakpoint`, () => {
      mount(createElement(FounderHeader, { canOpenAdminConsole }));
      const header = container.querySelector("header")!;
      const btn = byText(header, "button", SIGN_OUT_LABEL);
      expect(btn, "no Sign out in the founder header").toBeTruthy();
      // The founder header has no drawer, so it must be one wrapping bar with
      // nothing responsive-hidden on the path to the button.
      expect(hiddenByClass(btn!, /\bhidden\b|\b(?:sm|md|lg|xl):hidden\b|\bmax-\w+:hidden\b/)).toBe(false);
      expect(header.querySelector("nav")?.className).toMatch(/flex-wrap/);
    });
  }

  it("styles it as one more quiet link — no amber, ink on white", () => {
    mount(createElement(FounderHeader, { canOpenAdminConsole: true }));
    const btn = byText(container, "button", SIGN_OUT_LABEL)!;
    expect(btn.className).not.toMatch(/brand/);
  });
});

// ---- 3. the click ends the session through the real provider path -------------
describe("Sign out terminates through the existing provider path and returns to /login", () => {
  it("Clerk (production): asks Clerk to revoke the session and redirect to /login", async () => {
    process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY = "clerk";
    fakes.clerkSignOut.mockResolvedValue(undefined);
    mount(createElement(SignOutButton));
    await click(byText(container, "button", SIGN_OUT_LABEL));
    expect(fakes.clerkSignOut).toHaveBeenCalledTimes(1);
    expect(fakes.clerkSignOut).toHaveBeenCalledWith({ redirectUrl: "/login" });
    // Clerk owns the navigation; the app must not double-route.
    expect(fakes.push).not.toHaveBeenCalled();
    expect(fakes.supabaseSignOut).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("Supabase (CI / no auth env): signs out, then routes to /login and refreshes", async () => {
    delete process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY;
    fakes.supabaseSignOut.mockResolvedValue({ error: null });
    mount(createElement(SignOutButton));
    await click(byText(container, "button", SIGN_OUT_LABEL));
    expect(fakes.supabaseSignOut).toHaveBeenCalledTimes(1);
    expect(fakes.push).toHaveBeenCalledWith("/login");
    expect(fakes.refresh).toHaveBeenCalledTimes(1);
    expect(fakes.clerkSignOut).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("Supabase refusal: does NOT navigate, and says the session is still live (D260)", async () => {
    delete process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY;
    fakes.supabaseSignOut.mockResolvedValue({ error: { message: "network" } });
    mount(createElement(SignOutButton));
    await click(byText(container, "button", SIGN_OUT_LABEL));
    expect(fakes.push).not.toHaveBeenCalled();
    expect(fakes.refresh).not.toHaveBeenCalled();
    const alert = container.querySelector("[role='alert']");
    expect(alert?.textContent).toBe(SIGN_OUT_FAILED_MESSAGE);
    // The button is back and usable — not stuck in "Signing out…".
    const btn = byText(container, "button", SIGN_OUT_LABEL);
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    // Failure text is body ink, never red (frozen UI rule 4).
    expect(alert!.className).not.toMatch(/red|flame|rust|text-brand/);
  });

  it("Clerk rejection: is caught, not an unhandled rejection, and reported the same way", async () => {
    process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY = "clerk";
    fakes.clerkSignOut.mockRejectedValue(new Error("clerk down"));
    mount(createElement(SignOutButton));
    await click(byText(container, "button", SIGN_OUT_LABEL));
    expect(container.querySelector("[role='alert']")?.textContent).toBe(SIGN_OUT_FAILED_MESSAGE);
    expect(fakes.push).not.toHaveBeenCalled();
  });

  it("keeps the shopper and merchant default look when no className is passed", () => {
    delete process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY;
    mount(createElement(SignOutButton));
    const btn = byText(container, "button", SIGN_OUT_LABEL)!;
    expect(btn.className).toContain("text-ink");
    // And a passed className replaces it outright — no two colour tokens.
    mount(createElement(SignOutButton, { className: "text-white/80" }));
    const styled = byText(container, "button", SIGN_OUT_LABEL)!;
    expect(styled.className).toContain("text-white/80");
    expect(styled.className).not.toContain("text-ink");
  });
});

// ---- 4. the middle of the journey is unchanged ---------------------------------
describe("the role-routing contract between /login and the shells is unchanged", () => {
  it("there is one login route and no role-specific sign-in route to advertise", () => {
    const app = path.join(process.cwd(), "src", "app");
    const exists = (rel: string) => {
      try {
        readFileSync(path.join(app, rel));
        return true;
      } catch {
        return false;
      }
    };
    expect(exists("login/[[...sign-in]]/page.tsx")).toBe(true);
    for (const rogue of ["admin/login/page.tsx", "founder/login/page.tsx", "admin/sign-in/page.tsx"]) {
      expect(exists(rogue), `${rogue} must not exist — sign-in is shared`).toBe(false);
    }
  });

  it("the header's Sign in lands on the same /login that /app-bootstrap role-routes from", async () => {
    const { destinationForRole } = await import("@/lib/pwa/app-bootstrap");
    const { safeAuthNextPath } = await import("@/lib/auth/supabase-email-auth");
    expect(HEADER_SIGN_IN.href).toBe("/login");
    expect(safeAuthNextPath(null)).toBe("/app-bootstrap");
    expect(destinationForRole("admin")).toBe("/admin");
    expect(destinationForRole("cofounder")).toBe("/founder");
    expect(destinationForRole("customer")).toBe("/feed");
  });
});

// ---- colour maths for the legibility invariant ----------------------------------
type Rgb = [number, number, number];

function hexFromTailwind(token: string, shade: string): Rgb {
  const cfg = readFileSync(path.join(process.cwd(), "tailwind.config.ts"), "utf8");
  const block = cfg.slice(cfg.indexOf(`${token}: {`));
  const m = block.match(new RegExp(`${shade}:\\s*"#([0-9a-fA-F]{6})"`));
  if (!m) throw new Error(`tailwind token ${token}.${shade} not found`);
  const h = m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
