-- Step 1 of 3 for the advance_candidate_stage authorization fix. READ-ONLY (SELECTs only, changes nothing).
-- Run this first and SAVE THE OUTPUT: current_definition is the rollback copy
-- (the rollback block at the bottom of 20261027000001_advance_candidate_stage_authz_fix.sql restores the same definition).
-- Also shows the function owner: the next migration must be run as that role (supabase_admin or postgres),
-- otherwise it fails with "must be owner".

SELECT p.oid::regprocedure AS fn,
       p.proowner::regrole AS owner,
       p.prosecdef AS security_definer,
       p.proacl AS grants
FROM pg_proc p
WHERE p.proname = 'advance_candidate_stage'
  AND p.pronamespace = 'public'::regnamespace;

SELECT pg_get_functiondef('public.advance_candidate_stage(uuid,uuid,uuid,uuid)'::regprocedure) AS current_definition;
