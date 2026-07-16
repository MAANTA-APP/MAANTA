# Skill — Wiring the local MAANTA app to GitHub (`maantamvp/MAANTA-APP`)

Handoff runbook for connecting the existing local MAANTA app (already live on
Vercel as `maanta-nuia`, already wired to Supabase) to the new GitHub repo
`maantamvp/MAANTA-APP` and making `main` the canonical source.

> **Run these on your local machine**, in the MAANTA app directory. They are not
> run from a Claude web/cloud session — that session works on a separate cloud
> clone and cannot touch your local remote.

## Scope of this change

- Change GitHub wiring only.
- Do **not** touch Supabase config.
- Do **not** change Vercel project settings yet (see checklist at the end).

## Step 0 — Be in the right directory

```bash
cd /path/to/your/MAANTA        # the folder that contains maanta-app/ and CLAUDE.md
```

## Step 1 — Inspect current state (read-only)

```bash
git status        # confirm what's staged / uncommitted and which branch you're on
git remote -v     # see if an origin already exists and where it points
git branch        # see local branches; the * marks your current branch
```

Interpretation:
- `git status` → make sure the working tree is clean (or intentionally commit
  first) before pushing. `On branch X` tells you your current branch.
- `git remote -v` → if there's **no output**, you have no remote yet (go to Step 3a).
  If it lists an `origin` pointing at an old/wrong URL, go to Step 3b.
- `git branch` → the branch marked `*` is current. If it's not `main`, Step 2 fixes that.

## Step 2 — Make sure your branch is `main`

If `git branch` shows you're on `master` (or anything else) and that branch holds
the code you want to publish, rename it in place:

```bash
git branch -M main    # -M renames the current branch to main (force, safe here)
```

`-M` renames the branch you're currently on; it does not create a second copy.

## Step 3 — Point `origin` at the new repo

### 3a. No remote exists yet

```bash
git remote add origin https://github.com/maantamvp/MAANTA-APP.git
```

### 3b. An `origin` already exists but is wrong/outdated

```bash
git remote set-url origin https://github.com/maantamvp/MAANTA-APP.git
```

(Alternatively remove then re-add: `git remote remove origin` then the Step 3a
command. `set-url` is cleaner.)

Verify either way:

```bash
git remote -v      # both fetch and push lines should show the maantamvp URL
```

## Step 4 — Push `main` and set upstream

```bash
git push -u origin main
```

`-u` sets `origin/main` as the upstream so future `git push` / `git pull` need no
arguments.

### Troubleshooting the push

- **Auth prompt / `could not read Username` / 403**: you need credentials for the
  private repo. Easiest robust option is the GitHub CLI:
  ```bash
  gh auth login        # choose GitHub.com → HTTPS → authenticate in browser
  git push -u origin main
  ```
  Or use a Personal Access Token (repo scope) as the password when prompted, or
  switch to SSH:
  ```bash
  git remote set-url origin git@github.com:maantamvp/MAANTA-APP.git
  git push -u origin main
  ```
- **`! [rejected] ... (fetch first)` / non-fast-forward**: GitHub created the repo
  with an initial commit (README/.gitignore/license) that your local history
  doesn't contain. Reconcile the unrelated histories, then push:
  ```bash
  git pull --rebase origin main --allow-unrelated-histories
  # resolve any conflicts, then:
  git push -u origin main
  ```
  If the remote's initial commit is disposable and you're certain your local
  history is the one you want as canonical, you may instead force it:
  ```bash
  git push -u --force-with-lease origin main
  ```
  `--force-with-lease` refuses to clobber if the remote moved unexpectedly — safer
  than a bare `--force`.
- **`remote origin already exists`** when you meant to add: use `set-url` (Step 3b).

## Step 5 — Verify locally

```bash
git remote -v      # origin → https://github.com/maantamvp/MAANTA-APP.git (fetch+push)
git log -1         # the commit you expect to be at the tip of main
git status         # "Your branch is up to date with 'origin/main'."
```

## Step 6 — Verify on GitHub

Open `https://github.com/maantamvp/MAANTA-APP`. You should see:
- The full MAANTA tree (`maanta-app/`, `docs/`, `CLAUDE.md`, `README.md`).
- **`main`** listed as the default/primary branch (branch dropdown).
- The latest commit hash/message matching your local `git log -1`.
- Commit count and file tree matching your local project.

If the default branch isn't `main`: repo **Settings → General → Default branch**
→ switch to `main`.

This repo is now the canonical MAANTA source once `main` on GitHub matches your
local `main`.

## Next session — Vercel checklist (do NOT do in this session)

Repointing `maanta-nuia` at the new repo without breaking the live green prod:

1. Vercel → project **maanta-nuia** → **Settings → Git**.
2. Disconnect the current Git repository (if one is connected).
3. Connect Git → select **maantamvp/MAANTA-APP** (authorize the Vercel GitHub app
   for the `maantamvp` org/repo if prompted).
4. Set **Production Branch = `main`**.
5. Confirm the **Root Directory** is still `maanta-app` (this is a monorepo — the
   Next.js app lives under `maanta-app/`, not the repo root).
6. Confirm **Environment Variables** (Supabase URL/keys, Stripe, IntaSend, web
   push) are unchanged and still present — reconnecting Git does **not** touch
   them, but verify before relying on it.
7. Trigger a deploy: push a trivial commit to `main` (or use Vercel's
   **Redeploy**) and confirm auto-deploy fires from `main`.
8. Verify the resulting Production deployment is green and the live URL still
   serves the app; check the deploy's commit hash matches `main`.
9. Only after prod is confirmed green, consider this migration complete.

Nothing above changes Supabase — env vars point at the same Supabase project.
