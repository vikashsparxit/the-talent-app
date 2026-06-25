-- Split combined prescreen question #6 into two separate bank entries (10 questions total)

UPDATE public.prescreen_question_bank
SET
  question_text = 'What are you looking for in your next career move?',
  sort_hint = 8,
  is_active = true
WHERE question_key = 'next_career_move'
  AND question_text LIKE '%/%';

UPDATE public.prescreen_question_bank
SET sort_hint = 10
WHERE question_key = 'on_time_vs_perfect';

INSERT INTO public.prescreen_question_bank (question_key, question_text, sort_hint)
VALUES (
  'ideal_workplace',
  'Describe the workplace where you''ll be the most happy and productive?',
  9
)
ON CONFLICT (question_key) DO UPDATE
SET
  question_text = EXCLUDED.question_text,
  sort_hint = EXCLUDED.sort_hint,
  is_active = true;

-- Deactivate any deprecated combined-only row if it was added separately
UPDATE public.prescreen_question_bank
SET is_active = false
WHERE question_key = 'next_career_move_and_workplace';
