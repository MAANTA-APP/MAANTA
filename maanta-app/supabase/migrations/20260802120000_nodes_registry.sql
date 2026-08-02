-- Promote nodes (malls) from a hardcoded TypeScript array to a real table.
-- Drift row D60.
--
-- Two problems, one of which is dangerous:
--
--   1. `src/lib/nodes.ts` was an `as const` array, so opening a mall was a code
--      change, a PR and a redeploy rather than a row.
--   2. The join key was the mall's **display name**. `deals.node` and
--      `merchants.node` are `TEXT NOT NULL DEFAULT 'BBS Mall'` with no foreign
--      key, so renaming a mall for display silently orphaned every deal,
--      merchant and node-scoped cache entry that referenced the old label, and
--      a typo in a node value was simply accepted.
--
-- (2) is what this migration fixes structurally, and it fixes it **without
-- rewriting a single row of live data**. `nodes.id` grandfathers the string
-- already stored in those columns, and a separate `label` column becomes what
-- humans see. Renaming a mall now updates `label` and touches no foreign key.
--
-- Read that trade-off before "improving" it: a surrogate UUID key would be
-- tidier and would require rewriting `node` on every deal and merchant row on
-- the money path, in a project whose production migration ledger is already
-- known to disagree with this repo (D24). The opaque-grandfathered-key form
-- gets the integrity guarantee at no data-migration risk. `slug` is here for
-- when a URL or a surrogate key is wanted later.
--
-- **`nodes.id` is an opaque key that happens to read like a label.** It is
-- historical, not descriptive. Never render it — render `label` or
-- `short_label`. `nodes_id_is_not_display_copy` below is the reason it can stay
-- safe: the id is frozen, the label is free to change.

CREATE TABLE public.nodes (
  -- Grandfathered from the existing deals.node / merchants.node values.
  -- Opaque. Not for display. See the header note.
  id                  TEXT PRIMARY KEY,
  -- URL/analytics-safe stable handle. Unique so it can become a key later.
  slug                TEXT NOT NULL UNIQUE
                      CHECK (slug ~ '^[a-z0-9_]+$'),
  -- Everything below is display or geography and may be edited freely.
  label               TEXT NOT NULL,
  short_label         TEXT NOT NULL,
  mall_name           TEXT,
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,
  what3words_address  TEXT,
  -- Whether shoppers may select this node. A node can exist (so its historical
  -- rows keep their foreign key) while not being open for business.
  is_live             BOOLEAN NOT NULL DEFAULT FALSE,
  -- Ordering in the mall switcher; ties break by label.
  display_order       INTEGER NOT NULL DEFAULT 100,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.nodes IS
  'Registry of MAANTA nodes (malls). Source of truth for which nodes exist. `id` is an opaque grandfathered key — render `label`, never `id`. See D60.';
COMMENT ON COLUMN public.nodes.id IS
  'Opaque stable key, grandfathered from the pre-D60 deals.node / merchants.node text values. Never display it; never change it.';
COMMENT ON COLUMN public.nodes.label IS
  'Display name. Safe to change at any time — no foreign key points at it.';

-- ---------------------------------------------------------------------------
-- Seed: every node this app knows about, plus every node the data knows about.
--
-- The second half matters more than it looks. Adding a foreign key to a live
-- column fails if any existing row holds a value the parent table lacks, and
-- production is not a clean mirror of this repo (D24) — so seeding from
-- `src/lib/nodes.ts` alone would be betting the migration on an assumption
-- about production data. Instead every DISTINCT value already present in
-- deals.node and merchants.node is adopted as a row first. The FK below then
-- cannot fail on unexpected data, and anything unexpected shows up as a node
-- with a placeholder slug for a human to reconcile rather than as a failed
-- deploy.
-- ---------------------------------------------------------------------------

INSERT INTO public.nodes (id, slug, label, short_label, lat, lng, what3words_address, is_live, display_order)
VALUES
  ('BBS Mall',        'bbs_mall',       'BBS Mall, Eastleigh',  'BBS Mall',      -1.2746, 36.8501, 'stored.riches.shine', TRUE,  0),
  ('CBD Galleria',    'cbd_galleria',   'CBD Galleria, Nairobi','CBD Galleria',  -1.2864, 36.8172, 'market.square.entry', TRUE,  1),
  ('Westlands Hub',   'westlands_hub',  'Westlands Hub, Nairobi','Westlands Hub',-1.2674, 36.8075, 'bright.mango.lane',   TRUE,  2),
  ('Two Rivers Mall', 'two_rivers',     'Two Rivers Mall',      'Two Rivers',    -1.2105, 36.7958, NULL,                  FALSE, 3),
  ('Sarit Centre',    'sarit_centre',   'Sarit Centre',         'Sarit Centre',  -1.2615, 36.8025, NULL,                  FALSE, 4)
ON CONFLICT (id) DO NOTHING;

-- Adopt any node value already present in live data but absent above.
-- `slug` is derived and deliberately marked so a human can spot it.
DO $$
DECLARE
  v_value TEXT;
  v_slug  TEXT;
BEGIN
  FOR v_value IN
    SELECT DISTINCT node FROM public.deals WHERE node IS NOT NULL
    UNION
    SELECT DISTINCT node FROM public.merchants WHERE node IS NOT NULL
  LOOP
    IF EXISTS (SELECT 1 FROM public.nodes WHERE id = v_value) THEN
      CONTINUE;
    END IF;

    v_slug := regexp_replace(lower(v_value), '[^a-z0-9]+', '_', 'g');
    v_slug := trim(both '_' from v_slug);
    IF v_slug = '' THEN
      v_slug := 'node';
    END IF;
    -- Keep the unique constraint satisfiable without failing the deploy.
    WHILE EXISTS (SELECT 1 FROM public.nodes WHERE slug = v_slug) LOOP
      v_slug := v_slug || '_x';
    END LOOP;

    INSERT INTO public.nodes (id, slug, label, short_label, is_live, display_order)
    VALUES (v_value, v_slug, v_value, v_value, FALSE, 900);

    RAISE WARNING
      'nodes: adopted unrecognised node value % from live data (slug %). Reconcile it against src/lib/nodes.ts.',
      v_value, v_slug;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- The integrity guarantee: node values must name a real node.
--
-- NOT VALID + VALIDATE is deliberate rather than a single ALTER. The seed above
-- makes validation succeed, but splitting the steps means the table is only
-- briefly locked for new writes and the historical scan happens without holding
-- an exclusive lock — which matters on a live deals table.
-- ---------------------------------------------------------------------------

ALTER TABLE public.deals
  ADD CONSTRAINT deals_node_fkey
  FOREIGN KEY (node) REFERENCES public.nodes(id)
  ON UPDATE CASCADE ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE public.deals VALIDATE CONSTRAINT deals_node_fkey;

ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_node_fkey
  FOREIGN KEY (node) REFERENCES public.nodes(id)
  ON UPDATE CASCADE ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE public.merchants VALIDATE CONSTRAINT merchants_node_fkey;

-- ON DELETE RESTRICT: a node with history cannot be deleted out from under it.
-- Retire a node by setting is_live = FALSE, which is what the app reads.
-- ON UPDATE CASCADE: if a future change ever does re-key a node, the children
-- follow rather than orphaning — the exact failure D60 was opened for.

CREATE INDEX IF NOT EXISTS idx_deals_node ON public.deals(node);
CREATE INDEX IF NOT EXISTS idx_merchants_node ON public.merchants(node);

-- ---------------------------------------------------------------------------
-- Access. Reference data: world-readable, service_role-writable.
-- The mall switcher renders before sign-in, so anon must be able to read it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nodes_public_read ON public.nodes
  FOR SELECT USING (TRUE);

REVOKE ALL ON TABLE public.nodes FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.nodes FROM anon, authenticated;
GRANT SELECT ON TABLE public.nodes TO anon, authenticated;
GRANT ALL ON TABLE public.nodes TO service_role;

-- `updated_at` follows this schema's existing convention — a DEFAULT NOW()
-- column that writers set explicitly (`updated_at = NOW()`, as merchants and
-- deals do). Deliberately not a trigger: this repo has no shared
-- set_updated_at function, and adding one here would introduce a second
-- pattern for the same job in a schema that already has one.

-- ---------------------------------------------------------------------------
-- The id is frozen. This is what makes "rename the label freely" safe to
-- promise: without it, a well-meaning UPDATE on nodes.id would cascade through
-- every deal and merchant and quietly rewrite the money path's node scoping.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nodes_id_is_not_display_copy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION
      'node_id_immutable: nodes.id is an opaque key referenced by deals.node and merchants.node. Change label/short_label instead (D60).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nodes_id_immutable
  BEFORE UPDATE ON public.nodes
  FOR EACH ROW EXECUTE FUNCTION public.nodes_id_is_not_display_copy();

REVOKE ALL ON FUNCTION public.nodes_id_is_not_display_copy() FROM PUBLIC;
