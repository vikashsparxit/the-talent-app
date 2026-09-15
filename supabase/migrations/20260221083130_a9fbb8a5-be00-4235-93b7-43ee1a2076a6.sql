
-- Add evaluator_notes column to candidate_assessments
ALTER TABLE public.candidate_assessments
ADD COLUMN evaluator_notes text;
