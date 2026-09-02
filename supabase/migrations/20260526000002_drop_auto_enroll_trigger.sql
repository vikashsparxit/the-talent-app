-- Drop the auto-enroll trigger so all new candidates land in Pending Approval
-- instead of being automatically inserted into the first pipeline stage.
-- The Pending Approval column (frontend) is now the entry gate — recruiters
-- explicitly click "Approve" to move a candidate into the pipeline.

-- CASCADE drops all dependent triggers automatically (live DB has multiple trigger names)
DROP FUNCTION IF EXISTS public.auto_enroll_candidate_in_pipeline() CASCADE;
