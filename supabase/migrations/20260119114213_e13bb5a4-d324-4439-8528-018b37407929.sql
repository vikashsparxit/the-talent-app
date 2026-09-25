-- Create function to auto-score MCQ responses
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
        -- Extract the candidate's selected answer (stored as { "selected": "option_id" })
        _candidate_answer := NEW.response->>'selected';
        
        -- Extract the correct answer (stored as { "correct": "option_id" } or just "option_id")
        IF jsonb_typeof(_correct_answer) = 'object' THEN
            _correct_option := _correct_answer->>'correct';
        ELSE
            _correct_option := _correct_answer #>> '{}';
        END IF;
        
        -- Compare and assign score
        IF _candidate_answer IS NOT NULL AND _candidate_answer = _correct_option THEN
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

-- Create trigger to auto-score on insert
DROP TRIGGER IF EXISTS auto_score_mcq_on_insert ON public.candidate_responses;
CREATE TRIGGER auto_score_mcq_on_insert
    BEFORE INSERT ON public.candidate_responses
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_score_mcq_response();

-- Create trigger to auto-score on update
DROP TRIGGER IF EXISTS auto_score_mcq_on_update ON public.candidate_responses;
CREATE TRIGGER auto_score_mcq_on_update
    BEFORE UPDATE ON public.candidate_responses
    FOR EACH ROW
    WHEN (OLD.response IS DISTINCT FROM NEW.response)
    EXECUTE FUNCTION public.auto_score_mcq_response();