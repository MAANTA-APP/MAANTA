import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  APP_ROLES,
  ROLE_LABELS,
  canAccessAdminConsole,
  canAccessFounderDashboard,
  canViewAgentConsole,
  canWriteAgentLeads,
} from "@/lib/roles";

/**
 * The access matrix, asserted rather than described.
 *
 * `cofounder` exists to be *narrower* than admin. That is a claim about what a
 * role cannot do, and a claim of that shape is only worth anything if something
 * fails when it stops being true. Widening `canAccessAdminConsole` to include
 * cofounder — the single most likely way this design gets quietly undone — has
 * to break a test, not merely contradict a comment.
 *
 * Table-driven on purpose: adding a role to `APP_ROLES` without adding a row
 * here fails the completeness check at the bottom, so a new role cannot slip in
 * with its access untested.
 */

type Access = {
  admin: boolean;
  founder: boolean;
  agentView: boolean;
  agentWrite: boolean;
};

const MATRIX: Record<string, Access> = {
  customer: { admin: false, founder: false, agentView: false, agentWrite: false },
  merchant_admin: { admin: false, founder: false, agentView: false, agentWrite: false },
  merchant_staff: { admin: false, founder: false, agentView: false, agentWrite: false },
  agent: { admin: false, founder: false, agentView: true, agentWrite: true },
  admin: { admin: true, founder: true, agentView: true, agentWrite: true },
  // The point of the role: the founder dashboard and a read of the pipeline,
  // and neither the admin console nor the ability to write leads.
  cofounder: { admin: false, founder: true, agentView: true, agentWrite: false },
};

describe("role access matrix", () => {
  for (const [role, want] of Object.entries(MATRIX)) {
    it(`${role}`, () => {
      expect(canAccessAdminConsole(role), `${role} → admin console`).toBe(want.admin);
      expect(canAccessFounderDashboard(role), `${role} → founder dashboard`).toBe(
        want.founder
      );
      expect(canViewAgentConsole(role), `${role} → agent console (read)`).toBe(
        want.agentView
      );
      expect(canWriteAgentLeads(role), `${role} → lead writes`).toBe(want.agentWrite);
    });
  }

  it("covers every role in APP_ROLES", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...APP_ROLES].sort());
  });

  it("nobody can write leads without being able to read the console", () => {
    // A write predicate wider than its read predicate would mean a role that can
    // POST a lead but gets redirected off the page that lists it.
    const violators = APP_ROLES.filter((r) => canWriteAgentLeads(r) && !canViewAgentConsole(r));
    expect(violators, "write access must be a subset of read access").toEqual([]);
  });

  it("every role has a human label", () => {
    // `/admin/customers` renders ROLE_LABELS[user.role]. A role without an entry
    // shows an operator the raw DB value in a list they use to find people.
    const unlabelled = APP_ROLES.filter((r) => !ROLE_LABELS[r]?.trim());
    expect(unlabelled, "roles missing a label in ROLE_LABELS").toEqual([]);
  });

  it("an unknown role gets nothing", () => {
    // Roles arrive as strings from the database. A value outside the union —
    // a typo in a manual UPDATE, a future enum applied to prod before the app
    // ships — must fail closed on every surface.
    for (const bogus of ["", "cofounder ", "Cofounder", "superadmin", "null"]) {
      expect(canAccessAdminConsole(bogus), bogus).toBe(false);
      expect(canAccessFounderDashboard(bogus), bogus).toBe(false);
      expect(canViewAgentConsole(bogus), bogus).toBe(false);
      expect(canWriteAgentLeads(bogus), bogus).toBe(false);
    }
  });
});

/**
 * The TypeScript union and the database CHECK constraint have to agree.
 *
 * They are two independent declarations of the same list, and nothing else makes
 * them agree. A role added to `APP_ROLES` but not to the constraint produces a
 * runtime INSERT failure; added to the constraint but not the union produces a
 * user whose role the app treats as unknown and redirects to `/`. Both are
 * confusing at exactly the moment someone is provisioning an account.
 *
 * This parses the migration rather than trusting a comment. It reads the *latest*
 * migration that rewrites `users_role_check`, so the day someone adds a seventh
 * role in a new migration, this points at that file instead of silently checking
 * a superseded one.
 */
const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");

function latestRoleConstraintMigration(): { file: string; sql: string } | null {
  if (!existsSync(MIGRATIONS)) return null;
  const candidates = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse();
  for (const file of candidates) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
    if (/ADD\s+CONSTRAINT\s+users_role_check/i.test(sql)) return { file, sql };
  }
  return null;
}

describe("APP_ROLES matches the users_role_check constraint", () => {
  const found = latestRoleConstraintMigration();

  it("found a migration that defines the constraint", () => {
    // Without this, every assertion below would pass by having nothing to check.
    expect(found, `no migration under ${MIGRATIONS} adds users_role_check`).not.toBeNull();
  });

  it("declares exactly the roles in APP_ROLES", () => {
    if (!found) throw new Error("constraint migration not found");
    // Every 'quoted'::text literal inside the ADD CONSTRAINT statement.
    const stmt = found.sql.slice(found.sql.search(/ADD\s+CONSTRAINT\s+users_role_check/i));
    const inSql = Array.from(stmt.matchAll(/'([a-z_]+)'::text/g)).map((m) => m[1]);
    expect(
      inSql.sort(),
      `${found.file} and src/lib/roles.ts disagree about the role vocabulary`
    ).toEqual([...APP_ROLES].sort());
  });
});
