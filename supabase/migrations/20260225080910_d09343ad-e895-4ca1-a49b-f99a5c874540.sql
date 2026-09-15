
-- Phase 1: Add structured_skills column to candidates
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS structured_skills jsonb DEFAULT '[]'::jsonb;

-- Phase 6: Add skill_tags column to assessment_sections
ALTER TABLE public.assessment_sections
ADD COLUMN IF NOT EXISTS skill_tags jsonb DEFAULT '[]'::jsonb;

-- Migrate existing skills + skills_tags into structured_skills
-- Merges both arrays, deduplicates by lowercase name, sets defaults
UPDATE public.candidates
SET structured_skills = (
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'name', skill_name,
    'category', 'other',
    'proficiency', 'beginner',
    'confidence', 0.3,
    'sources', jsonb_build_array(
      CASE WHEN skill_name IN (SELECT jsonb_array_elements_text(COALESCE(skills, '[]'::jsonb))) THEN 'resume_parse' ELSE 'enrichment' END
    )
  )), '[]'::jsonb)
  FROM (
    SELECT DISTINCT lower(trim(s.val)) as skill_name
    FROM (
      SELECT jsonb_array_elements_text(COALESCE(skills, '[]'::jsonb)) as val
      UNION
      SELECT jsonb_array_elements_text(COALESCE(skills_tags, '[]'::jsonb)) as val
    ) s
    WHERE trim(s.val) != ''
  ) merged
)
WHERE (skills IS NOT NULL AND skills != '[]'::jsonb)
   OR (skills_tags IS NOT NULL AND skills_tags != '[]'::jsonb);

-- Add index for skill-based queries
CREATE INDEX IF NOT EXISTS idx_candidates_structured_skills ON public.candidates USING GIN (structured_skills);
CREATE INDEX IF NOT EXISTS idx_assessment_sections_skill_tags ON public.assessment_sections USING GIN (skill_tags);
