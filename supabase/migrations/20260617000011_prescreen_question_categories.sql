-- Expand prescreen question bank with categories (30–40 questions, 8 categories)

ALTER TABLE public.prescreen_question_bank
  ADD COLUMN category TEXT;

ALTER TABLE public.prescreen_question_bank
  ADD CONSTRAINT prescreen_question_bank_category_check
  CHECK (category IN (
    'about_you',
    'current_role',
    'achievements',
    'motivation',
    'career_goals',
    'workplace',
    'judgment',
    'challenges'
  ));

-- Categorize existing questions
UPDATE public.prescreen_question_bank SET category = 'about_you' WHERE question_key = 'about_yourself';
UPDATE public.prescreen_question_bank SET category = 'current_role' WHERE question_key IN ('typical_day', 'success_qualities');
UPDATE public.prescreen_question_bank SET category = 'achievements' WHERE question_key = 'greatest_achievement';
UPDATE public.prescreen_question_bank SET category = 'motivation' WHERE question_key = 'interest_in_company';
UPDATE public.prescreen_question_bank SET category = 'career_goals' WHERE question_key IN ('growth_vision', 'next_career_move');
UPDATE public.prescreen_question_bank SET category = 'workplace' WHERE question_key = 'ideal_workplace';
UPDATE public.prescreen_question_bank SET category = 'judgment' WHERE question_key = 'on_time_vs_perfect';
UPDATE public.prescreen_question_bank SET category = 'challenges' WHERE question_key = 'biggest_challenge';

ALTER TABLE public.prescreen_question_bank
  ALTER COLUMN category SET NOT NULL;

CREATE INDEX idx_prescreen_question_bank_category ON public.prescreen_question_bank (category)
  WHERE is_active = true;

-- Seed additional questions (36 total across 8 categories)
INSERT INTO public.prescreen_question_bank (question_key, question_text, category, sort_hint) VALUES
  -- about_you (5)
  ('core_strengths', 'What are your top three professional strengths?', 'about_you', 11),
  ('professional_background', 'Briefly describe your professional background and how it led you to apply.', 'about_you', 12),
  ('unique_value', 'What unique value do you bring to a team?', 'about_you', 13),
  ('work_style', 'How would colleagues describe your work style?', 'about_you', 14),

  -- current_role (5)
  ('role_responsibilities', 'What are your primary responsibilities in your current position?', 'current_role', 21),
  ('tools_and_process', 'What tools, technologies, or processes do you use most in your current role?', 'current_role', 22),
  ('team_structure', 'How is your team structured, and how do you collaborate day to day?', 'current_role', 23),

  -- achievements (5)
  ('proud_project', 'Describe a project you are especially proud of and your specific contribution.', 'achievements', 31),
  ('measurable_impact', 'Share an achievement where you can quantify your impact (metrics, outcomes, or results).', 'achievements', 32),
  ('learned_from_failure', 'Tell us about a setback you turned into a learning opportunity.', 'achievements', 33),
  ('recognition_received', 'Have you received recognition or awards for your work? Describe one.', 'achievements', 34),

  -- motivation (4)
  ('why_this_role', 'What specifically attracted you to this role?', 'motivation', 41),
  ('why_now', 'Why are you looking to make a move at this point in your career?', 'motivation', 42),
  ('company_research', 'What do you already know about {{company_name}}, and what excites you most?', 'motivation', 43),

  -- career_goals (4)
  ('three_year_vision', 'Where do you see yourself professionally in three years?', 'career_goals', 51),
  ('skills_to_develop', 'What skills or experiences are you hoping to gain in your next role?', 'career_goals', 52),

  -- workplace (4)
  ('team_culture', 'Describe the team culture where you do your best work.', 'workplace', 61),
  ('work_mode_preference', 'What is your preferred work arrangement (in-office, remote, hybrid), and why?', 'workplace', 62),
  ('manager_expectations', 'What do you expect from a manager to be successful?', 'workplace', 63),

  -- judgment (4)
  ('prioritization_approach', 'When everything seems urgent, how do you decide what to tackle first?', 'judgment', 71),
  ('quality_vs_speed', 'Describe a time you had to balance speed and quality. What did you decide and why?', 'judgment', 72),
  ('tradeoff_example', 'Tell us about a difficult tradeoff you made on a project and the reasoning behind it.', 'judgment', 73),

  -- challenges (5)
  ('biggest_weakness', 'What is an area you are actively working to improve?', 'challenges', 81),
  ('conflict_handling', 'Describe how you handle disagreement or conflict with a colleague.', 'challenges', 82),
  ('adaptability', 'Tell us about a time you had to adapt quickly to a major change at work.', 'challenges', 83),
  ('failure_response', 'How do you respond when a project does not go as planned?', 'challenges', 84)
ON CONFLICT (question_key) DO UPDATE
SET
  question_text = EXCLUDED.question_text,
  category = EXCLUDED.category,
  sort_hint = EXCLUDED.sort_hint,
  is_active = true;
