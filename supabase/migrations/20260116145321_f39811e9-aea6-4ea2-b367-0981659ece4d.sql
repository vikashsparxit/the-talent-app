-- Fix security warnings

-- 1. Drop the view with SECURITY DEFINER issue and recreate with SECURITY INVOKER
DROP VIEW IF EXISTS public.assessment_details;

CREATE VIEW public.assessment_details 
WITH (security_invoker = on)
AS
SELECT 
    a.id,
    a.title,
    a.description,
    a.duration_minutes,
    a.passing_score,
    a.settings,
    COUNT(DISTINCT s.id) as section_count,
    COUNT(DISTINCT q.id) as question_count,
    SUM(q.marks) as total_marks
FROM public.assessments a
LEFT JOIN public.assessment_sections s ON s.assessment_id = a.id
LEFT JOIN public.questions q ON q.section_id = s.id
WHERE a.status = 'active'
GROUP BY a.id;

-- 2. Fix functions with mutable search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_response_final_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.final_score = COALESCE(NEW.manual_score, NEW.auto_score);
    RETURN NEW;
END;
$$;