-- ============================================
-- SEED DATA EXPORT - Run on local Supabase
-- ============================================
-- Tables: jobs, interview_stage_templates, assessments,
--         assessment_sections, questions, job_interview_stages,
--         candidates (one row for prescreen FK), candidate_prescreens
-- assessment_templates: EMPTY (no data in cloud)
--
-- Run order: This script respects FK dependencies.
-- ============================================

BEGIN;

-- ============================================
-- 1. JOBS (no FK deps)
-- ============================================
INSERT INTO public.jobs (id, title, description, department, location, job_type, experience_level, experience_years_range, required_skills, benefits, salary_min, salary_max, salary_currency, status, domain, position_type, total_openings, application_deadline, created_by)
VALUES
  ('de080bb3-4730-4426-a449-898a4ba92815', 'Product Designer',
   'Join our design team to create intuitive user experiences for our SaaS platform. You will work closely with product and engineering teams.',
   'Design', 'New York, NY', 'full_time', 'mid', NULL,
   '["Figma","UI/UX Design","Prototyping","Design Systems"]'::jsonb,
   '["Health Insurance","Hybrid Work","401k Matching"]'::jsonb,
   70000, 100000, 'INR', 'open', NULL, 'tech', 1, NULL, NULL),

  ('8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'DevOps Engineer',
   'Looking for a DevOps Engineer to help us scale our infrastructure and improve our CI/CD pipelines.',
   'Engineering', 'Remote', 'contract', 'senior', NULL,
   '["Kubernetes","Docker","Terraform","AWS","CI/CD"]'::jsonb,
   '["Remote Work","Flexible Hours"]'::jsonb,
   100, 150, 'INR', 'open', NULL, 'tech', 1, NULL, NULL),

  ('1319f710-8b3e-4292-9c05-6702eacde038', 'Senior Full Stack Developer',
   'We are looking for a Senior Full Stack Developer to join our engineering team. You will be responsible for building scalable web applications using modern technologies.',
   'Frontend', 'Remote', 'full_time', 'mid', '3_years_plus',
   '["React","Node.js","TypeScript","PostgreSQL","AWS"]'::jsonb,
   '["Health Insurance","Remote Work","Stock Options","Unlimited PTO","Learning Budget"]'::jsonb,
   80000, 120000, 'INR', 'open', 'Engineering', 'tech', 2,
   '2026-03-30 00:00:00+00', NULL)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  updated_at = now();

-- ============================================
-- 2. INTERVIEW STAGE TEMPLATES (no FK deps)
-- ============================================
INSERT INTO public.interview_stage_templates (id, name, description, stages)
VALUES
  ('6059dd2e-c9a4-4c77-9f24-bdeccfa28d0e', 'Standard Hiring Pipeline',
   'Default multi-round hiring pipeline with screening through final selection. Maps to L1-L10 + HR structure.',
   '[{"name":"Screening","order":0},{"name":"L1 — Technical","order":1},{"name":"L2 — Technical Deep Dive","order":2},{"name":"L3 — System Design","order":3},{"name":"L4 — Managerial","order":4},{"name":"L5 — Leadership","order":5},{"name":"HR Round","order":6},{"name":"Final Review","order":7}]'::jsonb),

  ('1d0e9e08-81a9-4d04-b314-f62b5fb8c308', 'Extended Technical Pipeline',
   'Full 10-round technical pipeline for senior/specialized roles.',
   '[{"name":"Screening","order":0},{"name":"L1 — Technical Basics","order":1},{"name":"L2 — Technical Deep Dive","order":2},{"name":"L3 — System Design","order":3},{"name":"L4 — Architecture","order":4},{"name":"L5 — Problem Solving","order":5},{"name":"L6 — Domain Expertise","order":6},{"name":"L7 — Cross-functional","order":7},{"name":"L8 — Managerial","order":8},{"name":"L9 — Leadership","order":9},{"name":"L10 — Executive Review","order":10},{"name":"HR Round","order":11},{"name":"Final Review","order":12}]'::jsonb),

  ('1457ac2d-224e-4763-847a-d47c9b9f03ec', 'Quick Hire',
   'Simplified 3-round pipeline for junior roles or fast-track hiring.',
   '[{"name":"Screening","order":0},{"name":"Technical Round","order":1},{"name":"HR Round","order":2},{"name":"Final Review","order":3}]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  stages = EXCLUDED.stages,
  updated_at = now();

-- ============================================
-- 3. ASSESSMENTS (no FK deps)
-- ============================================
INSERT INTO public.assessments (id, title, description, duration_minutes, passing_score, status, settings)
VALUES
  ('21f8eb3b-ccd3-4e8c-8710-a3432c0829d4', 'MERN Full Stack Developer Assessment',
   'Comprehensive assessment covering MongoDB, Express.js, React, and Node.js skills for full-stack developer candidates.',
   90, 70, 'active',
   '{"allow_review":true,"randomize_questions":false,"show_score_immediately":false}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  settings = EXCLUDED.settings,
  updated_at = now();

-- ============================================
-- 4. ASSESSMENT SECTIONS (depends on assessments)
-- ============================================
INSERT INTO public.assessment_sections (id, assessment_id, title, description, order_index, weightage, skill_tags)
VALUES
  ('98ffafdf-20a8-4cac-85a5-e0a475437452', '21f8eb3b-ccd3-4e8c-8710-a3432c0829d4',
   'MongoDB & Database', 'NoSQL database concepts, MongoDB queries, aggregation, and schema design',
   0, 25, '[]'::jsonb),
  ('5025b2c3-b5ea-4e7f-bf19-1f73b5d6c813', '21f8eb3b-ccd3-4e8c-8710-a3432c0829d4',
   'Express.js & API Development', 'REST API design, middleware, routing, and backend development',
   1, 25, '[]'::jsonb),
  ('3287f592-9310-4fae-8177-9ac41efb7313', '21f8eb3b-ccd3-4e8c-8710-a3432c0829d4',
   'React & Frontend', 'React components, hooks, state management, and modern frontend practices',
   2, 30, '[]'::jsonb),
  ('6e04b95d-12de-4f63-9040-1ef7efce6970', '21f8eb3b-ccd3-4e8c-8710-a3432c0829d4',
   'Node.js & Core Concepts', 'Node.js fundamentals, async programming, and server-side JavaScript',
   3, 20, '[]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  weightage = EXCLUDED.weightage,
  updated_at = now();

-- ============================================
-- 5. QUESTIONS (depends on assessment_sections)
-- ============================================
INSERT INTO public.questions (id, section_id, type, question_text, options, correct_answer, marks, order_index, coding_language, coding_starter_code, coding_test_cases, subjective_max_words, subjective_rubric)
VALUES
  ('d7136c2e-3b18-4d7b-8e5b-58f962838fc9', '98ffafdf-20a8-4cac-85a5-e0a475437452',
   'mcq', 'Which MongoDB operator is used to match documents where the value of a field equals any value in an array?',
   '[{"id":"a","text":"$eq"},{"id":"b","text":"$in"},{"id":"c","text":"$all"},{"id":"d","text":"$match"}]'::jsonb,
   '"b"'::jsonb, 5, 0, NULL, NULL, NULL, NULL, NULL),

  ('e658ab09-fb15-41a9-81d0-98f85659e364', '98ffafdf-20a8-4cac-85a5-e0a475437452',
   'mcq', 'What is the default port number for MongoDB?',
   '[{"id":"a","text":"3000"},{"id":"b","text":"5432"},{"id":"c","text":"27017"},{"id":"d","text":"8080"}]'::jsonb,
   '"c"'::jsonb, 5, 1, NULL, NULL, NULL, NULL, NULL),

  ('3b3f0f11-65b5-40ce-b47b-e52cfd576903', '98ffafdf-20a8-4cac-85a5-e0a475437452',
   'subjective', 'Explain the difference between embedding and referencing in MongoDB schema design. When would you use each approach?',
   NULL, NULL, 10, 2, NULL, NULL, NULL, 300,
   'Award points for: Understanding of embedding (0-3), Understanding of referencing (0-3), Use cases and trade-offs (0-4)'),

  ('e35695d6-d6b5-4242-bc55-5fd58a1f7a74', '5025b2c3-b5ea-4e7f-bf19-1f73b5d6c813',
   'mcq', 'What is the correct order of middleware execution in Express.js?',
   '[{"id":"a","text":"Route handlers → Error handlers → Application middleware"},{"id":"b","text":"Application middleware → Route handlers → Error handlers"},{"id":"c","text":"Error handlers → Application middleware → Route handlers"},{"id":"d","text":"Route handlers → Application middleware → Error handlers"}]'::jsonb,
   '"b"'::jsonb, 5, 0, NULL, NULL, NULL, NULL, NULL),

  ('495d65f3-5388-40a3-941b-c8ab31827f48', '5025b2c3-b5ea-4e7f-bf19-1f73b5d6c813',
   'coding', 'Write an Express.js middleware function that logs the request method, URL, and timestamp for every incoming request.',
   NULL, NULL, 15, 1, 'javascript',
   E'const loggerMiddleware = (req, res, next) => {\n  // Your code here\n};',
   '[{"input":"","expected_output":"Middleware should log method, URL, timestamp and call next()","is_hidden":false}]'::jsonb,
   NULL, NULL),

  ('4b7025e8-3775-483d-a8f0-ed5c490fa8c2', '3287f592-9310-4fae-8177-9ac41efb7313',
   'mcq', 'Which hook should be used to perform side effects in a functional component?',
   '[{"id":"a","text":"useState"},{"id":"b","text":"useContext"},{"id":"c","text":"useEffect"},{"id":"d","text":"useReducer"}]'::jsonb,
   '"c"'::jsonb, 5, 0, NULL, NULL, NULL, NULL, NULL),

  ('af1066ca-d6d4-4a63-8f91-66a64876e9a8', '3287f592-9310-4fae-8177-9ac41efb7313',
   'mcq', 'What is the purpose of the key prop when rendering a list in React?',
   '[{"id":"a","text":"To style list items uniquely"},{"id":"b","text":"To help React identify which items have changed, added, or removed"},{"id":"c","text":"To set the order of list items"},{"id":"d","text":"To encrypt list data"}]'::jsonb,
   '"b"'::jsonb, 5, 1, NULL, NULL, NULL, NULL, NULL),

  ('b6d2f495-b331-488c-a69b-72335163150f', '3287f592-9310-4fae-8177-9ac41efb7313',
   'coding', 'Create a custom React hook called useDebounce that delays updating a value until a specified delay has passed since the last change.',
   NULL, NULL, 20, 2, 'javascript',
   E'import { useState, useEffect } from "react";\n\nfunction useDebounce(value, delay) {\n  // Your code here\n}\n\nexport default useDebounce;',
   '[{"input":"value changes rapidly","expected_output":"Returns debounced value after delay","is_hidden":false}]'::jsonb,
   NULL, NULL),

  ('74af0b10-8664-410e-9024-4077156b9e80', '6e04b95d-12de-4f63-9040-1ef7efce6970',
   'mcq', 'What is the Event Loop in Node.js?',
   '[{"id":"a","text":"A loop that iterates over arrays"},{"id":"b","text":"A mechanism that handles asynchronous callbacks"},{"id":"c","text":"A function that creates events"},{"id":"d","text":"A debugging tool"}]'::jsonb,
   '"b"'::jsonb, 5, 0, NULL, NULL, NULL, NULL, NULL),

  ('e3ce1472-1633-4ceb-a6e5-8a4831e29f69', '6e04b95d-12de-4f63-9040-1ef7efce6970',
   'subjective', 'Explain the difference between process.nextTick() and setImmediate() in Node.js. Provide an example scenario where you would use each.',
   NULL, NULL, 10, 1, NULL, NULL, NULL, 250,
   'Award points for: Correct explanation of nextTick (0-3), Correct explanation of setImmediate (0-3), Practical examples (0-4)')
ON CONFLICT (id) DO UPDATE SET
  question_text = EXCLUDED.question_text,
  options = EXCLUDED.options,
  correct_answer = EXCLUDED.correct_answer,
  updated_at = now();

-- ============================================
-- 6. JOB INTERVIEW STAGES (depends on jobs)
-- ============================================
INSERT INTO public.job_interview_stages (id, job_id, stage_name, order_index, is_eliminatory)
VALUES
  ('55eb7bf5-a230-4479-a60c-236f7f311fc1', '1319f710-8b3e-4292-9c05-6702eacde038', 'Screening', 0, false),
  ('4d5036c2-b922-48a3-8bf9-837a8ca57914', '1319f710-8b3e-4292-9c05-6702eacde038', 'L1 — Technical Basics', 1, false),
  ('c6cecbcf-d75f-43d6-abdf-a23566adc861', '1319f710-8b3e-4292-9c05-6702eacde038', 'L2 — Technical Deep Dive', 2, false),
  ('0747522f-a4ca-4e3e-af48-c3acb7e1123f', '1319f710-8b3e-4292-9c05-6702eacde038', 'L3 — System Design', 3, false),
  ('8a653ba4-afef-4999-8f43-0c299feef369', '1319f710-8b3e-4292-9c05-6702eacde038', 'L4 — Architecture', 4, false),
  ('0d910637-7444-4f83-b487-7bb002b6d524', '1319f710-8b3e-4292-9c05-6702eacde038', 'L5 — Problem Solving', 5, false),
  ('b47bfacf-3e84-4d7e-be64-4bd680a20cb8', '1319f710-8b3e-4292-9c05-6702eacde038', 'L6 — Domain Expertise', 6, false),
  ('7e4d6861-07fc-437e-8aca-cdec9035e455', '1319f710-8b3e-4292-9c05-6702eacde038', 'L7 — Cross-functional', 7, false),
  ('690c88f3-d020-44a7-891a-71f337d3cd56', '1319f710-8b3e-4292-9c05-6702eacde038', 'L8 — Managerial', 8, false),
  ('00918baf-4b52-4acf-a7a4-bc647ffa1d25', '1319f710-8b3e-4292-9c05-6702eacde038', 'L9 — Leadership', 9, false),
  ('30ef323b-3ac8-4ed8-8953-8e5775846c89', '1319f710-8b3e-4292-9c05-6702eacde038', 'L10 — Executive Review', 10, false),
  ('d1753ab8-f867-4aca-b929-03aeceb39ebf', '1319f710-8b3e-4292-9c05-6702eacde038', 'HR Round', 11, false),
  ('b4a73cce-d5b1-4f84-be51-6695e664201c', '1319f710-8b3e-4292-9c05-6702eacde038', 'Final Review', 12, false),

  ('78b03fb7-dd85-4dc1-b9a2-074c2fcb7728', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'Screening', 0, false),
  ('3296f0fa-4a99-4c5d-8bef-5a5e7861567e', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L1 — Technical', 1, false),
  ('41798a7f-f953-416a-8e36-558b3bd8ca44', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L1 — Technical Basics', 1, false),
  ('ad69f25a-f4c1-4867-b92d-aeb3d600de1a', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L2 — Technical Deep Dive', 2, false),
  ('0d21e316-4d18-4b6a-9afd-5aa2f91461ec', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L3 — System Design', 3, false),
  ('0807ee01-205d-49d7-a8f3-4bedfd1c45d9', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L4 — Managerial', 4, false),
  ('e82a3fac-e8cb-43ef-8b54-7c9ef0b878d8', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L4 — Architecture', 4, false),
  ('33d08e19-8c51-4901-b5dd-74da50089fa3', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L5 — Problem Solving', 5, false),
  ('0b40eb04-8116-4fe0-9dc6-5e9fe10eddff', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L5 — Leadership', 5, false),
  ('757db3c8-13a4-4a41-b29c-266cb76a6e40', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L6 — Domain Expertise', 6, false),
  ('e46086b4-cc00-4b89-bb04-af0940fe6ef7', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L7 — Cross-functional', 7, false),
  ('97fea278-43af-48c8-bc9f-a318475a95a8', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L8 — Managerial', 8, false),
  ('1efba44e-a280-45b4-bbb8-18f1f045143e', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L9 — Leadership', 9, false),
  ('b614c37e-8e33-4504-b6db-8f6f5c7f1b7c', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'L10 — Executive Review', 10, false),
  ('c4bd9940-78ff-475c-a618-26924647817a', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'HR Round', 11, false),
  ('2a8b3e78-4473-4c98-90bf-7d5d7f06bb45', '8ad7ed6b-7f99-4e33-9ebe-a7bb86a4aaa3', 'Final Review', 12, false),

  ('a7c0dc7d-3dd4-4bcd-84f2-9d0aaff7f0d6', 'de080bb3-4730-4426-a449-898a4ba92815', 'Screening', 0, false),
  ('71fe85b5-e04b-4b47-af42-26f466038129', 'de080bb3-4730-4426-a449-898a4ba92815', 'L1 — Technical Basics', 1, false),
  ('5db2bf16-7289-478a-b9a1-7a3c4189257e', 'de080bb3-4730-4426-a449-898a4ba92815', 'L2 — Technical Deep Dive', 2, false),
  ('83d18e25-ef36-49c3-a4b1-b7db8ef411e7', 'de080bb3-4730-4426-a449-898a4ba92815', 'L3 — System Design', 3, false),
  ('79ccc1e1-ef7a-4a85-baa4-b283056d3fef', 'de080bb3-4730-4426-a449-898a4ba92815', 'L4 — Architecture', 4, false),
  ('6f2c4f2f-487b-4a0b-bfd5-2ece6ff4445b', 'de080bb3-4730-4426-a449-898a4ba92815', 'L5 — Problem Solving', 5, false),
  ('b3ebd429-8125-4014-ad1e-70a5956fb2dc', 'de080bb3-4730-4426-a449-898a4ba92815', 'L6 — Domain Expertise', 6, false),
  ('4abe03f0-945a-4b3b-94dd-78e5885f3618', 'de080bb3-4730-4426-a449-898a4ba92815', 'L7 — Cross-functional', 7, false),
  ('cfb5538b-ba88-4997-b732-2ee14b1f7481', 'de080bb3-4730-4426-a449-898a4ba92815', 'L8 — Managerial', 8, false),
  ('a7435b2f-10bb-4335-ae38-7028192d45dc', 'de080bb3-4730-4426-a449-898a4ba92815', 'L9 — Leadership', 9, false),
  ('0697887a-bba2-4970-b390-0b22ea5d5219', 'de080bb3-4730-4426-a449-898a4ba92815', 'L10 — Executive Review', 10, false),
  ('baad1fac-750a-41db-91d1-90f95e99e480', 'de080bb3-4730-4426-a449-898a4ba92815', 'HR Round', 11, false),
  ('4434a71c-8bb1-4ea2-a318-7bee33b7ee43', 'de080bb3-4730-4426-a449-898a4ba92815', 'Final Review', 12, false)
ON CONFLICT (id) DO UPDATE SET
  stage_name = EXCLUDED.stage_name,
  order_index = EXCLUDED.order_index,
  updated_at = now();

-- ============================================
-- 7. CANDIDATES (required for candidate_prescreens FK)
-- ============================================
-- Insert the candidate referenced by candidate_prescreens so the FK is satisfied.
-- If this candidate already exists (e.g. from cloud), ON CONFLICT keeps it.
INSERT INTO public.candidates (id, name, email, phone, resume_url, job_id, source)
VALUES
  ('1881abec-2e82-4e91-a670-e910a16be115', 'Seed prescreen candidate',
   'seed-prescreen-candidate@example.com', NULL, NULL,
   '1319f710-8b3e-4292-9c05-6702eacde038', 'manual')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now();

-- ============================================
-- 8. CANDIDATE PRESCREENS (depends on candidates)
-- ============================================
-- screened_by: NULL so seed runs without requiring a specific auth user.
INSERT INTO public.candidate_prescreens (id, candidate_id, total_experience_years, relevant_experience_years, relevant_experience_domain, current_ctc, expected_ctc, notice_period, lwd, current_location, preferred_location, comms_rating, academics, nutshell, screened_by)
VALUES
  ('5dd8cfd1-1643-41dc-9319-b0114dfe5044', '1881abec-2e82-4e91-a670-e910a16be115',
   6, 3, 'B2B sales, pre-sales', '10', '12', '15', '10 march 2026',
   'Noida', 'Noida', 8,
   '[{"institution":"test school","level":"12th","marks":"85%","percentile":""},{"institution":"test university","level":"graduation","marks":"8.5","percentile":""},{"institution":"test university","level":"post_graduation","marks":"9","percentile":""}]'::jsonb,
   'This is test summary', NULL)
ON CONFLICT (id) DO UPDATE SET
  nutshell = EXCLUDED.nutshell,
  updated_at = now();

-- ============================================
-- 9. ASSESSMENT TEMPLATES (empty - no data)
-- ============================================
-- No assessment_templates exist in cloud DB.

COMMIT;
