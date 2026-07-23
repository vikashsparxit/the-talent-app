-- Fix MCQ auto-scoring when correct_answer is a JSON array of option ids.
-- Builder + generate-assessment store e.g. ["b"]; prior trigger only handled
-- string / { "correct": "..." }, so arrays scored as 0.
-- Do NOT apply remediating SQL automatically — review inspect queries first.

CREATE OR REPLACE FUNCTION public.auto_score_mcq_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    _question_type text;
    _correct_answer jsonb;
    _question_marks integer;
    _options jsonb;
    _correct_ids jsonb;
    _candidate_ids jsonb;
    _is_correct boolean := false;
BEGIN
    SELECT type, correct_answer, marks, options
    INTO _question_type, _correct_answer, _question_marks, _options
    FROM public.questions
    WHERE id = NEW.question_id;

    IF _question_type IS DISTINCT FROM 'mcq' THEN
        RETURN NEW;
    END IF;

    -- Resolve correct option id(s) into a jsonb array of strings
    IF _correct_answer IS NOT NULL THEN
        IF jsonb_typeof(_correct_answer) = 'array' THEN
            _correct_ids := _correct_answer;
        ELSIF jsonb_typeof(_correct_answer) = 'string' THEN
            _correct_ids := jsonb_build_array(_correct_answer #>> '{}');
        ELSIF jsonb_typeof(_correct_answer) = 'object' THEN
            IF jsonb_typeof(_correct_answer->'correct') = 'array' THEN
                _correct_ids := _correct_answer->'correct';
            ELSIF (_correct_answer->>'correct') IS NOT NULL THEN
                _correct_ids := jsonb_build_array(_correct_answer->>'correct');
            ELSE
                _correct_ids := '[]'::jsonb;
            END IF;
        ELSE
            _correct_ids := '[]'::jsonb;
        END IF;
    ELSIF _options IS NOT NULL AND jsonb_typeof(_options) = 'array' THEN
        -- Fallback: options[].is_correct = true
        SELECT COALESCE(jsonb_agg(opt->>'id'), '[]'::jsonb)
        INTO _correct_ids
        FROM jsonb_array_elements(_options) AS opt
        WHERE COALESCE((opt->>'is_correct')::boolean, false);
    ELSE
        _correct_ids := NULL;
    END IF;

    IF _correct_ids IS NULL OR _correct_ids = '[]'::jsonb THEN
        RETURN NEW;
    END IF;

    -- Normalize candidate response to a jsonb array of option id strings
    IF NEW.response IS NULL THEN
        _candidate_ids := '[]'::jsonb;
    ELSIF jsonb_typeof(NEW.response) = 'string' THEN
        _candidate_ids := jsonb_build_array(NEW.response #>> '{}');
    ELSIF jsonb_typeof(NEW.response) = 'object' THEN
        IF jsonb_typeof(NEW.response->'selected') = 'array' THEN
            _candidate_ids := NEW.response->'selected';
        ELSIF (NEW.response->>'selected') IS NOT NULL THEN
            _candidate_ids := jsonb_build_array(NEW.response->>'selected');
        ELSE
            _candidate_ids := '[]'::jsonb;
        END IF;
    ELSIF jsonb_typeof(NEW.response) = 'array' THEN
        _candidate_ids := NEW.response;
    ELSE
        _candidate_ids := '[]'::jsonb;
    END IF;

    -- Scoring (simple):
    --   one selected id  → full marks if that id is in the correct set
    --   multiple selected → full marks if non-empty and every selected id is correct
    -- Use ? (existence) for the single-id path — clearer than @> scalar and identical
    -- for string option ids. (`["c"]` @> `"c"` is also true in Postgres.)
    IF jsonb_array_length(_candidate_ids) = 1 THEN
        _is_correct := _correct_ids ? (_candidate_ids->>0);
    ELSIF jsonb_array_length(_candidate_ids) > 1 THEN
        _is_correct := (_candidate_ids <@ _correct_ids);
    ELSE
        _is_correct := false;
    END IF;

    IF _is_correct THEN
        NEW.auto_score := _question_marks;
    ELSE
        NEW.auto_score := 0;
    END IF;

    -- MCQs do not need manual review
    NEW.final_score := NEW.auto_score;

    RETURN NEW;
END;
$$;

-- Triggers already exist (auto_score_mcq_on_insert / auto_score_mcq_on_update).
-- Function REPLACE is sufficient; keep WHEN (OLD.response IS DISTINCT FROM NEW.response).

-- =============================================================================
-- REMEDIATE (run manually after deploy, after reviewing inspect queries)
-- =============================================================================
--
-- Prerequisites: CREATE OR REPLACE FUNCTION auto_score_mcq_response() above
-- must already be applied on the target DB.
-- The UPDATE trigger only runs when response IS DISTINCT FROM the old value,
-- so a literal no-op `SET response = response` will NOT re-fire scoring.
-- Use the two-step toggle below (tmp → restore) to force the trigger.
--
-- Scope: MCQ responses belonging to completed/evaluated candidate_assessments,
-- then recalculate totals for every completed/evaluated assessment.
--
-- IMPORTANT: Do NOT uncomment and run this block as part of `supabase db push`.
-- Copy the uncommented runbook from the deploy notes / agent report into the
-- SQL editor, inspect first, then remediate inside one transaction.
--
-- ---------------------------------------------------------------------------
-- INSPECT (read-only) — review before remediating
-- ---------------------------------------------------------------------------
--
-- -- Confirm fixed function is live
-- SELECT pg_get_functiondef('public.auto_score_mcq_response()'::regprocedure);
--
-- -- MCQ questions whose correct_answer is an array (the broken format)
-- SELECT id, left(question_text, 80) AS question_text, correct_answer, marks, options
-- FROM public.questions
-- WHERE type = 'mcq'
--   AND jsonb_typeof(correct_answer) = 'array'
-- ORDER BY created_at DESC
-- LIMIT 50;
--
-- -- Stuck MCQ responses: likely auto_score = 0 / null despite a selected answer
-- SELECT
--     cr.id AS response_id,
--     cr.candidate_assessment_id,
--     ca.status AS assessment_status,
--     c.name AS candidate_name,
--     q.id AS question_id,
--     q.correct_answer,
--     cr.response,
--     cr.auto_score,
--     cr.final_score,
--     q.marks
-- FROM public.candidate_responses cr
-- JOIN public.questions q ON q.id = cr.question_id
-- JOIN public.candidate_assessments ca ON ca.id = cr.candidate_assessment_id
-- JOIN public.candidates c ON c.id = ca.candidate_id
-- WHERE q.type = 'mcq'
--   AND ca.status IN ('completed', 'evaluated')
--   AND cr.response IS NOT NULL
--   AND COALESCE(cr.auto_score, 0) = 0
--   AND (
--         jsonb_typeof(q.correct_answer) = 'array'
--      OR (q.correct_answer IS NULL AND q.options IS NOT NULL)
--   )
-- ORDER BY cr.created_at DESC
-- LIMIT 100;
--
-- -- Completed/evaluated assessments that may need total recalculation
-- SELECT ca.id, c.name, ca.status, ca.total_score, ca.percentage, ca.passed, ca.completed_at
-- FROM public.candidate_assessments ca
-- JOIN public.candidates c ON c.id = ca.candidate_id
-- WHERE ca.status IN ('completed', 'evaluated')
-- ORDER BY ca.completed_at DESC NULLS LAST
-- LIMIT 50;
--
-- ---------------------------------------------------------------------------
-- FULL REMEDIATE (preferred) — direct UPDATE, no trigger toggle
-- ---------------------------------------------------------------------------
-- Why not the two-step response toggle?
--   TEMP TABLE … ON COMMIT DROP is fragile in the Supabase SQL Editor
--   (autocommit / multi-tab). Prefer scoring matched MCQs in SQL directly.
--
-- BEGIN;
--
-- -- Correct MCQ matches → full marks (array / string / object correct_answer)
-- UPDATE public.candidate_responses cr
-- SET
--     auto_score = q.marks,
--     final_score = q.marks
-- FROM public.questions q
-- JOIN public.candidate_assessments ca ON ca.id = cr.candidate_assessment_id
-- WHERE cr.question_id = q.id
--   AND q.type = 'mcq'
--   AND ca.status IN ('completed', 'evaluated')
--   AND cr.response IS NOT NULL
--   AND q.marks IS NOT NULL
--   AND (
--         (
--           jsonb_typeof(q.correct_answer) = 'array'
--           AND q.correct_answer ? (
--                 CASE jsonb_typeof(cr.response)
--                   WHEN 'string' THEN cr.response #>> '{}'
--                   WHEN 'object' THEN COALESCE(cr.response->>'selected', cr.response->>'selected_option')
--                   WHEN 'array'  THEN CASE WHEN jsonb_array_length(cr.response) = 1
--                                          THEN cr.response->>0 ELSE NULL END
--                   ELSE NULL
--                 END
--               )
--         )
--      OR (
--           jsonb_typeof(q.correct_answer) = 'string'
--           AND (q.correct_answer #>> '{}') = (
--                 CASE jsonb_typeof(cr.response)
--                   WHEN 'string' THEN cr.response #>> '{}'
--                   WHEN 'object' THEN COALESCE(cr.response->>'selected', cr.response->>'selected_option')
--                   ELSE NULL
--                 END
--               )
--         )
--      OR (
--           jsonb_typeof(q.correct_answer) = 'object'
--           AND COALESCE(q.correct_answer->>'correct', q.correct_answer#>>'{correct,0}') IS NOT NULL
--           AND (
--                 CASE
--                   WHEN jsonb_typeof(q.correct_answer->'correct') = 'array'
--                     THEN (q.correct_answer->'correct') ? (
--                       CASE jsonb_typeof(cr.response)
--                         WHEN 'string' THEN cr.response #>> '{}'
--                         WHEN 'object' THEN COALESCE(cr.response->>'selected', cr.response->>'selected_option')
--                         ELSE NULL
--                       END
--                     )
--                   ELSE (q.correct_answer->>'correct') = (
--                       CASE jsonb_typeof(cr.response)
--                         WHEN 'string' THEN cr.response #>> '{}'
--                         WHEN 'object' THEN COALESCE(cr.response->>'selected', cr.response->>'selected_option')
--                         ELSE NULL
--                       END
--                     )
--                 END
--               )
--         )
--   );
--
-- -- Wrong / unanswered MCQs with a known correct_answer → 0
-- UPDATE public.candidate_responses cr
-- SET
--     auto_score = 0,
--     final_score = 0
-- FROM public.questions q
-- JOIN public.candidate_assessments ca ON ca.id = cr.candidate_assessment_id
-- WHERE cr.question_id = q.id
--   AND q.type = 'mcq'
--   AND ca.status IN ('completed', 'evaluated')
--   AND q.correct_answer IS NOT NULL
--   AND jsonb_typeof(q.correct_answer) IN ('array', 'string', 'object')
--   AND (
--         cr.response IS NULL
--      OR NOT (
--           (
--             jsonb_typeof(q.correct_answer) = 'array'
--             AND q.correct_answer ? (
--                   CASE jsonb_typeof(cr.response)
--                     WHEN 'string' THEN cr.response #>> '{}'
--                     WHEN 'object' THEN COALESCE(cr.response->>'selected', cr.response->>'selected_option')
--                     WHEN 'array'  THEN CASE WHEN jsonb_array_length(cr.response) = 1
--                                            THEN cr.response->>0 ELSE NULL END
--                     ELSE NULL
--                   END
--                 )
--           )
--        OR (
--             jsonb_typeof(q.correct_answer) = 'string'
--             AND (q.correct_answer #>> '{}') = (
--                   CASE jsonb_typeof(cr.response)
--                     WHEN 'string' THEN cr.response #>> '{}'
--                     WHEN 'object' THEN COALESCE(cr.response->>'selected', cr.response->>'selected_option')
--                     ELSE NULL
--                   END
--                 )
--           )
--        OR (
--             jsonb_typeof(q.correct_answer) = 'object'
--             AND (
--                   CASE
--                     WHEN jsonb_typeof(q.correct_answer->'correct') = 'array'
--                       THEN (q.correct_answer->'correct') ? (
--                         CASE jsonb_typeof(cr.response)
--                           WHEN 'string' THEN cr.response #>> '{}'
--                           WHEN 'object' THEN COALESCE(cr.response->>'selected', cr.response->>'selected_option')
--                           ELSE NULL
--                         END
--                       )
--                     ELSE (q.correct_answer->>'correct') = (
--                         CASE jsonb_typeof(cr.response)
--                           WHEN 'string' THEN cr.response #>> '{}'
--                           WHEN 'object' THEN COALESCE(cr.response->>'selected', cr.response->>'selected_option')
--                           ELSE NULL
--                         END
--                       )
--                   END
--                 )
--           )
--         )
--   );
--
-- DO $$
-- DECLARE
--     r RECORD;
-- BEGIN
--     FOR r IN
--         SELECT id
--         FROM public.candidate_assessments
--         WHERE status IN ('completed', 'evaluated')
--     LOOP
--         PERFORM public.calculate_assessment_total_score(r.id);
--     END LOOP;
-- END;
-- $$;
--
-- -- Spot-check then COMMIT or ROLLBACK (see agent report for Yogesh/Arjun queries)
--
-- =============================================================================
