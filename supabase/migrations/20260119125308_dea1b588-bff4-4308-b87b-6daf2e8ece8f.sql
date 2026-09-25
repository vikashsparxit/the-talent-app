-- Update auto_score_mcq_response to handle both formats (plain string or { "selected": "..." })
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
    _candidate_answer text;
    _correct_option text;
BEGIN
    -- Get question details
    SELECT type, correct_answer, marks INTO _question_type, _correct_answer, _question_marks
    FROM public.questions
    WHERE id = NEW.question_id;
    
    -- Only auto-score MCQ questions
    IF _question_type = 'mcq' AND _correct_answer IS NOT NULL THEN
        -- Extract the candidate's selected answer
        -- Handle both formats: plain string "option_id" or { "selected": "option_id" }
        IF jsonb_typeof(NEW.response) = 'string' THEN
            _candidate_answer := NEW.response #>> '{}';
        ELSIF jsonb_typeof(NEW.response) = 'object' THEN
            _candidate_answer := NEW.response->>'selected';
        ELSE
            _candidate_answer := NULL;
        END IF;
        
        -- Extract the correct answer
        -- Handle both formats: plain string "option_id" or { "correct": "option_id" }
        IF jsonb_typeof(_correct_answer) = 'string' THEN
            _correct_option := _correct_answer #>> '{}';
        ELSIF jsonb_typeof(_correct_answer) = 'object' THEN
            _correct_option := _correct_answer->>'correct';
        ELSE
            _correct_option := NULL;
        END IF;
        
        -- Compare and assign score
        IF _candidate_answer IS NOT NULL AND _correct_option IS NOT NULL AND _candidate_answer = _correct_option THEN
            NEW.auto_score := _question_marks;
        ELSE
            NEW.auto_score := 0;
        END IF;
        
        -- Set final_score since MCQs don't need manual review
        NEW.final_score := NEW.auto_score;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to calculate total score when assessment is completed
CREATE OR REPLACE FUNCTION public.calculate_total_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- When status changes to 'completed', calculate total score
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        PERFORM public.calculate_assessment_total_score(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS calculate_total_on_completion ON public.candidate_assessments;
CREATE TRIGGER calculate_total_on_completion
    AFTER UPDATE ON public.candidate_assessments
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_total_on_completion();