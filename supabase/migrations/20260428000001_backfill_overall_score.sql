-- Backfill overall_score from rating_categories now that overall_score is
-- auto-calculated (average of 1-5 category scores) instead of a manual 1-10 slider.

-- Recalculate from categories for rows that have them
UPDATE public.candidate_interviews
SET overall_score = ROUND(
  (
    COALESCE((rating_categories->>'technical')::numeric, 0) +
    COALESCE((rating_categories->>'communication')::numeric, 0) +
    COALESCE((rating_categories->>'problem_solving')::numeric, 0) +
    COALESCE((rating_categories->>'culture_fit')::numeric, 0)
  ) / NULLIF(
    (CASE WHEN rating_categories->>'technical'       IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN rating_categories->>'communication'   IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN rating_categories->>'problem_solving' IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN rating_categories->>'culture_fit'     IS NOT NULL THEN 1 ELSE 0 END),
    0
  ), 1
)
WHERE rating_categories IS NOT NULL
  AND rating_categories != 'null'::jsonb;

-- Null out scores for rows that had only the old slider value (no categories)
UPDATE public.candidate_interviews
SET overall_score = NULL
WHERE (rating_categories IS NULL OR rating_categories = 'null'::jsonb)
  AND overall_score IS NOT NULL;
