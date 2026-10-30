-- Step 3 of 3 for the advance_candidate_stage authorization fix. READ-ONLY (SELECT only, changes nothing).
-- Run after 20261027000001_advance_candidate_stage_authz_fix.sql.
-- Expected: has_fix = true, old_check_gone = true, grants include authenticated and service_role,
-- and no anon / PUBLIC entry (no "=X/..." item).
-- Version 000010 leaves 20261027000002..000009 free for the round-aware PR A migration, which must be
-- renumbered to run after the fix.

SELECT position('session_user' in pg_get_functiondef('public.advance_candidate_stage(uuid,uuid,uuid,uuid)'::regprocedure)) > 0 AS has_fix,
       position('current_user' in pg_get_functiondef('public.advance_candidate_stage(uuid,uuid,uuid,uuid)'::regprocedure)) = 0 AS old_check_gone,
       p.proowner::regrole AS owner,
       p.proacl AS grants
FROM pg_proc p
WHERE p.proname = 'advance_candidate_stage'
  AND p.pronamespace = 'public'::regnamespace;
