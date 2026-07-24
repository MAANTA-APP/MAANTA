-- ============================================================================
-- Fee-reversal decision note — DB-COLUMN backstop (Decisions Log 2026-07-23).
--
-- Founder ruling 2026-07-23 made the reversal decision note mandatory end to
-- end. Three layers already enforce it: the admin modal disables Confirm until
-- a note is entered, the admin route rejects an empty/whitespace note with 400,
-- and public.reverse_success_fee trims all surrounding whitespace and raises
-- note_required (mapped back to 400). This migration adds the FOURTH, deepest
-- layer the ruling calls for: the public.fee_reversals.note column itself is now
-- NOT NULL with a length CHECK, so no path — RPC, direct insert, or a future
-- refactor — can persist a reversal row without a real rationale.
--
-- The incident number (incident_ref) stays optional and is untouched. Nothing
-- else about a reversal changes.
-- ============================================================================

-- 1. Backfill defensively. During the BBS pilot there should be no reversal
--    rows with a null/blank note (the RPC has written a trimmed non-empty note
--    since 2026-07-22 / 2026-07-23), but a SET NOT NULL fails hard on even one
--    offending row, so normalise any legacy/blank value to an explicit sentinel
--    that satisfies the constraint and is obvious in the audit log.
UPDATE public.fee_reversals
   SET note = '(migrated — no decision note was recorded before 2026-07-23)'
 WHERE note IS NULL
    OR btrim(note, E' \t\n\r\f\v') = '';

-- 2. The column may never again be null.
ALTER TABLE public.fee_reversals
  ALTER COLUMN note SET NOT NULL;

-- 3. Length CHECK: after stripping ALL surrounding whitespace (spaces, tabs,
--    newlines, CR, form-feed, vertical tab — matching the RPC's normalisation)
--    the note must be 1..2000 chars. The lower bound is the whitespace-only
--    backstop at the storage layer; the upper bound keeps the audit column
--    bounded. Guarded with a NOT VALID + VALIDATE-free single statement since
--    the table is small (pilot) and the backfill above guarantees compliance.
ALTER TABLE public.fee_reversals
  ADD CONSTRAINT fee_reversals_note_not_blank
  CHECK (char_length(btrim(note, E' \t\n\r\f\v')) BETWEEN 1 AND 2000);

COMMENT ON COLUMN public.fee_reversals.note IS
  'Required reviewer rationale for the reversal (Decisions Log 2026-07-23). NOT NULL with a 1..2000-char trimmed-length CHECK (fee_reversals_note_not_blank); the RPC also trims and rejects a blank note (note_required) and the admin route rejects it with 400. The incident number (incident_ref) stays optional.';
