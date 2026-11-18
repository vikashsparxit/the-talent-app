-- One-off cleanup: placeholder rounds created by the old reopenCandidate bug
-- (it inserted a verdict-less round N+1 row at EVERY stage in one insert, so
-- the board jumped the candidate to the final stage). NOT a migration.
--
-- HOW TO RUN
--   1. Take a database backup first (pg_dump / Supabase backup).
--   2. Run against a staging copy or a restored prod copy first and check the
--      printed counts and candidate list.
--   3. Dry run (default — everything is rolled back):
--        psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/20261024_cleanup_reopen_rows.sql
--   4. Apply (backs up, deletes, COMMITs):
--        psql "$DB_URL" -v ON_ERROR_STOP=1 -v commit=true -f supabase/scripts/20261024_cleanup_reopen_rows.sql
--      Outside psql (no \if support): run up to the final block by hand and
--      replace it with COMMIT.
--   Run as postgres / service role. Re-running is a no-op: the target rows
--   are gone and the backup insert is ON CONFLICT DO NOTHING.
--
-- WHAT IT DELETES
--   Only rows in rounds > 1 where, for that (candidate, job, round):
--     * the group matches the detection SELECT from the PR notes, AND
--     * every row in the group (removed ones included) is untouched: no verdict,
--       schedule, completion, advance, interviewer, score, ratings, feedback,
--       notes, rejection reason, artifacts, meeting link, mode, enrolment,
--       cancellation or removal, AND
--     * no row in the group is referenced by any table pointing at
--       candidate_interviews: FKs candidate_interview_panelists,
--       interview_kits, interview_reminder_log (all ON DELETE CASCADE, so a
--       delete would silently take them too), plus the soft references
--       audit_log.entity_id, notifications (message/link) and
--       email_delivery_log.metadata.
--   Rows are copied to public.candidate_interviews_bak_20261024 first and
--   only rows present there are deleted.
--
-- AFTER
--   The affected candidates fall back to their previous round (usually the
--   rejected row) on the board while candidate_status may still be
--   'reviewing'. The final SELECT lists them; re-open each from the Pipeline
--   UI if they should still be in process (it now resumes at the stopped stage).

\set ON_ERROR_STOP on

BEGIN;

-- Detection SELECT from pra_notes / PR body, verbatim (name column included).
CREATE TEMP TABLE _reopen_detected ON COMMIT DROP AS
SELECT ci.candidate_id, c.name, jis.job_id, ci.round, count(*) AS rows, min(ci.created_at) AS reopened_at
FROM public.candidate_interviews ci
JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
JOIN public.candidates c ON c.id = ci.candidate_id
WHERE ci.round > 1
  AND ci.removed_from_pipeline_at IS NULL
GROUP BY ci.candidate_id, c.name, jis.job_id, ci.round
HAVING count(*) > 1
   AND bool_and(ci.verdict IS NULL AND ci.scheduled_at IS NULL AND ci.advanced_at IS NULL)
   AND count(DISTINCT ci.created_at) = 1
ORDER BY reopened_at DESC;

-- Stricter target set: detected groups whose rows are ALL untouched
-- (removed rows included) and unreferenced.
CREATE TEMP TABLE _reopen_targets ON COMMIT DROP AS
WITH grp AS (
  SELECT ci.id, ci.candidate_id, jis.job_id, ci.round, ci.created_at,
    (    ci.verdict IS NULL
     AND ci.scheduled_at IS NULL
     AND ci.completed_at IS NULL
     AND ci.advanced_at IS NULL
     AND ci.advanced_by IS NULL
     AND ci.interviewer_user_id IS NULL
     AND ci.overall_score IS NULL
     AND COALESCE(ci.rating_categories, '{}'::jsonb) = '{}'::jsonb
     AND ci.feedback IS NULL
     AND ci.interview_notes IS NULL
     AND ci.rejection_reason IS NULL
     AND COALESCE(ci.artifacts, '[]'::jsonb) = '[]'::jsonb
     AND ci.meeting_link IS NULL
     AND ci.interview_mode IS NULL
     AND ci.enrolled_at IS NULL
     AND ci.cancelled_at IS NULL
     AND ci.cancelled_by IS NULL
     AND ci.cancellation_reason IS NULL
     AND ci.cancellation_meta IS NULL
     AND ci.removed_from_pipeline_at IS NULL
     AND ci.removed_by IS NULL
    ) AS untouched,
    (   EXISTS (SELECT 1 FROM public.candidate_interview_panelists x WHERE x.candidate_interview_id = ci.id)
     OR EXISTS (SELECT 1 FROM public.interview_kits x WHERE x.candidate_interview_id = ci.id)
     OR EXISTS (SELECT 1 FROM public.interview_reminder_log x WHERE x.candidate_interview_id = ci.id)
     OR EXISTS (SELECT 1 FROM public.audit_log x WHERE x.entity_id = ci.id)
     OR EXISTS (SELECT 1 FROM public.notifications x
                WHERE x.message LIKE '%' || ci.id::text || '%' OR x.link LIKE '%' || ci.id::text || '%')
     OR EXISTS (SELECT 1 FROM public.email_delivery_log x WHERE x.metadata::text LIKE '%' || ci.id::text || '%')
    ) AS referenced
  FROM public.candidate_interviews ci
  JOIN public.job_interview_stages jis ON jis.id = ci.job_interview_stage_id
  JOIN _reopen_detected d
    ON d.candidate_id = ci.candidate_id AND d.job_id = jis.job_id AND d.round = ci.round
),
ok_groups AS (
  SELECT candidate_id, job_id, round
  FROM grp
  GROUP BY candidate_id, job_id, round
  HAVING bool_and(untouched) AND NOT bool_or(referenced) AND count(DISTINCT created_at) = 1
)
SELECT g.id, g.candidate_id, g.job_id, g.round
FROM grp g
JOIN ok_groups o USING (candidate_id, job_id, round);

\echo '== Dry run: detection SELECT (groups / rows) =='
SELECT count(*) AS detected_groups, COALESCE(sum(rows), 0) AS detected_rows FROM _reopen_detected;

\echo '== Targets after the stricter checks (groups / rows) =='
SELECT count(DISTINCT (candidate_id, job_id, round)) AS target_groups, count(*) AS target_rows FROM _reopen_targets;

\echo '== Detected but skipped (touched, referenced, or removed rows in the round) =='
SELECT d.candidate_id, d.name, d.job_id, d.round, d.rows, d.reopened_at
FROM _reopen_detected d
WHERE NOT EXISTS (
  SELECT 1 FROM _reopen_targets t
  WHERE t.candidate_id = d.candidate_id AND t.job_id = d.job_id AND t.round = d.round
)
ORDER BY d.reopened_at DESC;

-- Backup table: same columns, defaults, PK and checks (LIKE never copies FKs
-- or triggers), plus backed_up_at. RLS on with no policies: service role only.
CREATE TABLE IF NOT EXISTS public.candidate_interviews_bak_20261024
  (LIKE public.candidate_interviews INCLUDING ALL);
ALTER TABLE public.candidate_interviews_bak_20261024
  ADD COLUMN IF NOT EXISTS backed_up_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.candidate_interviews_bak_20261024 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.candidate_interviews_bak_20261024 FROM PUBLIC, anon, authenticated;

INSERT INTO public.candidate_interviews_bak_20261024
SELECT ci.*, now()
FROM public.candidate_interviews ci
JOIN _reopen_targets t ON t.id = ci.id
ON CONFLICT (id) DO NOTHING;

\echo '== Deleting (only rows present in the backup) =='
WITH deleted AS (
  DELETE FROM public.candidate_interviews ci
  USING _reopen_targets t, public.candidate_interviews_bak_20261024 b
  WHERE ci.id = t.id AND b.id = ci.id
  RETURNING ci.id
)
SELECT count(*) AS deleted_rows FROM deleted;

\echo '== Affected candidates (re-open from the Pipeline UI if still in process) =='
SELECT DISTINCT t.candidate_id, c.name, c.candidate_status, t.job_id, t.round
FROM _reopen_targets t
JOIN public.candidates c ON c.id = t.candidate_id
ORDER BY c.name;

-- RESTORE (run manually if needed; restores every backed-up row not present):
--   BEGIN;
--   INSERT INTO public.candidate_interviews
--   SELECT (jsonb_populate_record(NULL::public.candidate_interviews, to_jsonb(b) - 'backed_up_at')).*
--   FROM public.candidate_interviews_bak_20261024 b
--   WHERE NOT EXISTS (SELECT 1 FROM public.candidate_interviews ci WHERE ci.id = b.id)
--   ON CONFLICT (id) DO NOTHING;
--   COMMIT;

\if :{?commit}
\else
  \set commit false
\endif
\if :commit
  \echo '== COMMIT =='
  COMMIT;
\else
  \echo '== Dry run: ROLLBACK (pass -v commit=true to apply) =='
  ROLLBACK;
\endif
