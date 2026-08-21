# Complete Migration Guide for The Talent App — Local Supabase Setup

This document contains ALL migrations needed to replicate the database locally on a self-hosted Supabase instance.

## Quick Setup (Recommended)

```bash
# From your project root
supabase start        # Start local Supabase (first time)
supabase db reset     # Drop and recreate DB with all migrations
```

This applies all files in `supabase/migrations/` in chronological order automatically.

## Edge Functions Config

Your `supabase/config.toml` should have:

```toml
project_id = "your-project-ref"

[functions.send-invitation-email]
verify_jwt = false

[functions.execute-code]
verify_jwt = false

[functions.send-completion-email]
verify_jwt = false

[functions.candidate-portal]
verify_jwt = false

[functions.send-applicant-email]
verify_jwt = false

[functions.parse-resume]
verify_jwt = false

[functions.analyze-candidate]
verify_jwt = false

[functions.enrich-profile]
verify_jwt = false
```

## Local Secrets

Create `supabase/.env.local`:
```
GOOGLE_AI_API_KEY=your_google_ai_key
RESEND_API_KEY=your_resend_key
```

---

## All Migration Files (in order)

If running manually in SQL Editor, execute **in this exact order**.

---

### Migration 1: `20260116144225` — Base Schema

Creates all core tables, enums, indexes, helper functions, RLS policies, and views.

```sql
-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'hr');
CREATE TYPE public.question_type AS ENUM ('mcq', 'coding', 'subjective');
CREATE TYPE public.assessment_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE public.candidate_assessment_status AS ENUM ('invited', 'in_progress', 'completed', 'evaluated', 'expired');

-- 2. CORE TABLES
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (user_id, role)
);

CREATE TABLE public.assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    passing_score INTEGER NOT NULL DEFAULT 60,
    status public.assessment_status NOT NULL DEFAULT 'draft',
    settings JSONB DEFAULT '{"randomize_questions": false, "show_score_immediately": false, "allow_review": false}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.assessment_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    weightage INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID REFERENCES public.assessment_sections(id) ON DELETE CASCADE NOT NULL,
    type public.question_type NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB,
    correct_answer JSONB,
    marks INTEGER NOT NULL DEFAULT 1,
    order_index INTEGER NOT NULL DEFAULT 0,
    coding_language TEXT,
    coding_starter_code TEXT,
    coding_test_cases JSONB,
    subjective_max_words INTEGER,
    subjective_rubric TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role_applied TEXT,
    resume_url TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.candidate_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
    assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
    access_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    status public.candidate_assessment_status NOT NULL DEFAULT 'invited',
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_score NUMERIC(5,2),
    percentage NUMERIC(5,2),
    passed BOOLEAN,
    integrity_log JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (candidate_id, assessment_id)
);

CREATE TABLE public.candidate_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_assessment_id UUID REFERENCES public.candidate_assessments(id) ON DELETE CASCADE NOT NULL,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
    response JSONB,
    auto_score NUMERIC(5,2),
    manual_score NUMERIC(5,2),
    final_score NUMERIC(5,2),
    evaluated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    feedback TEXT,
    evaluated_at TIMESTAMP WITH TIME ZONE,
    time_spent_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (candidate_assessment_id, question_id)
);

-- 3. INDEXES
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_assessments_created_by ON public.assessments(created_by);
CREATE INDEX idx_assessments_status ON public.assessments(status);
CREATE INDEX idx_assessment_sections_assessment_id ON public.assessment_sections(assessment_id);
CREATE INDEX idx_questions_section_id ON public.questions(section_id);
CREATE INDEX idx_candidates_email ON public.candidates(email);
CREATE INDEX idx_candidate_assessments_candidate_id ON public.candidate_assessments(candidate_id);
CREATE INDEX idx_candidate_assessments_assessment_id ON public.candidate_assessments(assessment_id);
CREATE INDEX idx_candidate_assessments_access_token ON public.candidate_assessments(access_token);
CREATE INDEX idx_candidate_assessments_status ON public.candidate_assessments(status);
CREATE INDEX idx_candidate_responses_candidate_assessment_id ON public.candidate_responses(candidate_assessment_id);
CREATE INDEX idx_candidate_responses_question_id ON public.candidate_responses(question_id);

-- 4. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin_or_hr(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'hr')) $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), NEW.email);
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assessment_sections_updated_at BEFORE UPDATE ON public.assessment_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_candidate_assessments_updated_at BEFORE UPDATE ON public.candidate_assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_candidate_responses_updated_at BEFORE UPDATE ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.calculate_response_final_score()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$ BEGIN NEW.final_score = COALESCE(NEW.manual_score, NEW.auto_score); RETURN NEW; END; $$;

CREATE TRIGGER calculate_response_score BEFORE INSERT OR UPDATE ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.calculate_response_final_score();

CREATE OR REPLACE FUNCTION public.calculate_assessment_total_score(_candidate_assessment_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    _total_score NUMERIC; _max_score NUMERIC; _percentage NUMERIC; _passing_score INTEGER; _passed BOOLEAN;
BEGIN
    SELECT COALESCE(SUM(final_score), 0) INTO _total_score FROM public.candidate_responses WHERE candidate_assessment_id = _candidate_assessment_id;
    SELECT COALESCE(SUM(q.marks), 0) INTO _max_score FROM public.candidate_assessments ca JOIN public.assessments a ON ca.assessment_id = a.id JOIN public.assessment_sections s ON s.assessment_id = a.id JOIN public.questions q ON q.section_id = s.id WHERE ca.id = _candidate_assessment_id;
    IF _max_score > 0 THEN _percentage = (_total_score / _max_score) * 100; ELSE _percentage = 0; END IF;
    SELECT a.passing_score INTO _passing_score FROM public.candidate_assessments ca JOIN public.assessments a ON ca.assessment_id = a.id WHERE ca.id = _candidate_assessment_id;
    _passed = _percentage >= _passing_score;
    UPDATE public.candidate_assessments SET total_score = _total_score, percentage = _percentage, passed = _passed WHERE id = _candidate_assessment_id;
END;
$$;

-- 5. ENABLE RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_responses ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin/HR can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view roles" ON public.user_roles FOR SELECT USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin/HR can view all assessments" ON public.assessments FOR SELECT USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can create assessments" ON public.assessments FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can update assessments" ON public.assessments FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can delete assessments" ON public.assessments FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all sections" ON public.assessment_sections FOR SELECT USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can create sections" ON public.assessment_sections FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can update sections" ON public.assessment_sections FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can delete sections" ON public.assessment_sections FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all questions" ON public.questions FOR SELECT USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can create questions" ON public.questions FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can update questions" ON public.questions FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can delete questions" ON public.questions FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all candidates" ON public.candidates FOR SELECT USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can create candidates" ON public.candidates FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can update candidates" ON public.candidates FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can delete candidates" ON public.candidates FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all candidate assessments" ON public.candidate_assessments FOR SELECT USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can create candidate assessments" ON public.candidate_assessments FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can update candidate assessments" ON public.candidate_assessments FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can delete candidate assessments" ON public.candidate_assessments FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can view all responses" ON public.candidate_responses FOR SELECT USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can create responses" ON public.candidate_responses FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can update responses" ON public.candidate_responses FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can delete responses" ON public.candidate_responses FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

-- 7. VIEWS
CREATE OR REPLACE VIEW public.assessment_details AS
SELECT a.id, a.title, a.description, a.duration_minutes, a.passing_score, a.settings,
    COUNT(DISTINCT s.id) as section_count, COUNT(DISTINCT q.id) as question_count, SUM(q.marks) as total_marks
FROM public.assessments a
LEFT JOIN public.assessment_sections s ON s.assessment_id = a.id
LEFT JOIN public.questions q ON q.section_id = s.id
WHERE a.status = 'active' GROUP BY a.id;

-- 8. ADMIN HELPER
CREATE OR REPLACE FUNCTION public.make_user_admin(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'admin') ON CONFLICT (user_id, role) DO NOTHING; END; $$;
```

---

### Migration 2: `20260116145321` — Security Fixes

```sql
DROP VIEW IF EXISTS public.assessment_details;

CREATE VIEW public.assessment_details WITH (security_invoker = on) AS
SELECT a.id, a.title, a.description, a.duration_minutes, a.passing_score, a.settings,
    COUNT(DISTINCT s.id) as section_count, COUNT(DISTINCT q.id) as question_count, SUM(q.marks) as total_marks
FROM public.assessments a
LEFT JOIN public.assessment_sections s ON s.assessment_id = a.id
LEFT JOIN public.questions q ON q.section_id = s.id
WHERE a.status = 'active' GROUP BY a.id;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.calculate_response_final_score()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.final_score = COALESCE(NEW.manual_score, NEW.auto_score); RETURN NEW; END; $$;
```

---

### Migration 3: `20260117150818` — Auto-Assign First Admin

```sql
CREATE OR REPLACE FUNCTION public.auto_assign_first_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'admin');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_assign_admin
    AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.auto_assign_first_admin();
```

---

### Migration 4: `20260119092911` — Candidate Portal RLS (later dropped in Migration 9)

```sql
CREATE POLICY "Candidates can view own assessment via token" ON public.candidate_assessments FOR SELECT USING (true);
CREATE POLICY "Candidates can update own assessment via token" ON public.candidate_assessments FOR UPDATE USING (true);
CREATE POLICY "Candidates can view assigned assessment" ON public.assessments FOR SELECT USING (EXISTS (SELECT 1 FROM public.candidate_assessments ca WHERE ca.assessment_id = id));
CREATE POLICY "Candidates can view assigned sections" ON public.assessment_sections FOR SELECT USING (EXISTS (SELECT 1 FROM public.candidate_assessments ca WHERE ca.assessment_id = assessment_id));
CREATE POLICY "Candidates can view assigned questions" ON public.questions FOR SELECT USING (EXISTS (SELECT 1 FROM public.assessment_sections s JOIN public.candidate_assessments ca ON ca.assessment_id = s.assessment_id WHERE s.id = section_id));
CREATE POLICY "Candidates can create own responses" ON public.candidate_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Candidates can view own responses" ON public.candidate_responses FOR SELECT USING (true);
CREATE POLICY "Candidates can update own responses" ON public.candidate_responses FOR UPDATE USING (true);
```

---

### Migration 5: `20260119114213` — MCQ Auto-Scoring

```sql
CREATE OR REPLACE FUNCTION public.auto_score_mcq_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    _question_type text; _correct_answer jsonb; _question_marks integer; _candidate_answer text; _correct_option text;
BEGIN
    SELECT type, correct_answer, marks INTO _question_type, _correct_answer, _question_marks FROM public.questions WHERE id = NEW.question_id;
    IF _question_type = 'mcq' AND _correct_answer IS NOT NULL THEN
        _candidate_answer := NEW.response->>'selected';
        IF jsonb_typeof(_correct_answer) = 'object' THEN _correct_option := _correct_answer->>'correct';
        ELSE _correct_option := _correct_answer #>> '{}'; END IF;
        IF _candidate_answer IS NOT NULL AND _candidate_answer = _correct_option THEN NEW.auto_score := _question_marks;
        ELSE NEW.auto_score := 0; END IF;
        NEW.final_score := NEW.auto_score;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_score_mcq_on_insert ON public.candidate_responses;
CREATE TRIGGER auto_score_mcq_on_insert BEFORE INSERT ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.auto_score_mcq_response();

DROP TRIGGER IF EXISTS auto_score_mcq_on_update ON public.candidate_responses;
CREATE TRIGGER auto_score_mcq_on_update BEFORE UPDATE ON public.candidate_responses FOR EACH ROW WHEN (OLD.response IS DISTINCT FROM NEW.response) EXECUTE FUNCTION public.auto_score_mcq_response();
```

---

### Migration 6: `20260119125308` — MCQ Scoring Fix + Auto-Calculate on Completion

```sql
CREATE OR REPLACE FUNCTION public.auto_score_mcq_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    _question_type text; _correct_answer jsonb; _question_marks integer; _candidate_answer text; _correct_option text;
BEGIN
    SELECT type, correct_answer, marks INTO _question_type, _correct_answer, _question_marks FROM public.questions WHERE id = NEW.question_id;
    IF _question_type = 'mcq' AND _correct_answer IS NOT NULL THEN
        IF jsonb_typeof(NEW.response) = 'string' THEN _candidate_answer := NEW.response #>> '{}';
        ELSIF jsonb_typeof(NEW.response) = 'object' THEN _candidate_answer := NEW.response->>'selected';
        ELSE _candidate_answer := NULL; END IF;
        IF jsonb_typeof(_correct_answer) = 'string' THEN _correct_option := _correct_answer #>> '{}';
        ELSIF jsonb_typeof(_correct_answer) = 'object' THEN _correct_option := _correct_answer->>'correct';
        ELSE _correct_option := NULL; END IF;
        IF _candidate_answer IS NOT NULL AND _correct_option IS NOT NULL AND _candidate_answer = _correct_option THEN NEW.auto_score := _question_marks;
        ELSE NEW.auto_score := 0; END IF;
        NEW.final_score := NEW.auto_score;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_total_on_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        PERFORM public.calculate_assessment_total_score(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calculate_total_on_completion ON public.candidate_assessments;
CREATE TRIGGER calculate_total_on_completion AFTER UPDATE ON public.candidate_assessments FOR EACH ROW EXECUTE FUNCTION public.calculate_total_on_completion();
```

---

### Migration 7: `20260119152919` — Assessment Templates

```sql
CREATE TABLE public.assessment_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, description TEXT,
  template_data JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates are viewable by authenticated users" ON public.assessment_templates FOR SELECT TO authenticated USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Templates can be created by authenticated users" ON public.assessment_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Templates can be updated by creator or admin" ON public.assessment_templates FOR UPDATE TO authenticated USING (public.is_admin_or_hr(auth.uid()));
CREATE POLICY "Templates can be deleted by creator or admin" ON public.assessment_templates FOR DELETE TO authenticated USING (public.is_admin_or_hr(auth.uid()));

CREATE TRIGGER update_assessment_templates_updated_at BEFORE UPDATE ON public.assessment_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

---

### Migration 8: `20260202133746` — Jobs & Applications

```sql
CREATE TYPE public.job_status AS ENUM ('draft', 'open', 'paused', 'closed');
CREATE TYPE public.job_type AS ENUM ('full_time', 'part_time', 'contract', 'internship', 'freelance');
CREATE TYPE public.experience_level AS ENUM ('entry', 'mid', 'senior', 'lead', 'executive');

CREATE TABLE public.jobs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL, description TEXT, department TEXT, location TEXT,
    job_type public.job_type NOT NULL DEFAULT 'full_time',
    experience_level public.experience_level,
    salary_min NUMERIC, salary_max NUMERIC, salary_currency TEXT DEFAULT 'USD',
    required_skills JSONB DEFAULT '[]'::jsonb, benefits JSONB DEFAULT '[]'::jsonb,
    application_deadline TIMESTAMP WITH TIME ZONE,
    status public.job_status NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.candidates ADD COLUMN job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL;

CREATE TABLE public.job_applications (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
    applicant_name TEXT NOT NULL, applicant_email TEXT NOT NULL, applicant_phone TEXT,
    resume_url TEXT, cover_letter TEXT, status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR can create jobs" ON public.jobs FOR INSERT WITH CHECK (is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can view all jobs" ON public.jobs FOR SELECT USING (is_admin_or_hr(auth.uid()) OR status = 'open');
CREATE POLICY "Admin/HR can update jobs" ON public.jobs FOR UPDATE USING (is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can delete jobs" ON public.jobs FOR DELETE USING (is_admin_or_hr(auth.uid()));
CREATE POLICY "Anyone can view open jobs" ON public.jobs FOR SELECT TO anon USING (status = 'open');

CREATE POLICY "Admin/HR can view all applications" ON public.job_applications FOR SELECT USING (is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can update applications" ON public.job_applications FOR UPDATE USING (is_admin_or_hr(auth.uid()));
CREATE POLICY "Admin/HR can delete applications" ON public.job_applications FOR DELETE USING (is_admin_or_hr(auth.uid()));
CREATE POLICY "Anyone can submit applications" ON public.job_applications FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_job_applications_updated_at BEFORE UPDATE ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_department ON public.jobs(department);
CREATE INDEX idx_job_applications_job_id ON public.job_applications(job_id);
CREATE INDEX idx_candidates_job_id ON public.candidates(job_id);
```

---

### Migration 9: `20260202140655` — Security Fixes (Drop broken policies)

```sql
DROP POLICY IF EXISTS "Candidates can view own assessment via token" ON public.candidate_assessments;
DROP POLICY IF EXISTS "Candidates can update own assessment via token" ON public.candidate_assessments;
DROP POLICY IF EXISTS "Candidates can view assigned assessment" ON public.assessments;
DROP POLICY IF EXISTS "Candidates can view assigned sections" ON public.assessment_sections;
DROP POLICY IF EXISTS "Candidates can view assigned questions" ON public.questions;
DROP POLICY IF EXISTS "Candidates can create own responses" ON public.candidate_responses;
DROP POLICY IF EXISTS "Candidates can view own responses" ON public.candidate_responses;
DROP POLICY IF EXISTS "Candidates can update own responses" ON public.candidate_responses;

DROP POLICY IF EXISTS "Anyone can view open jobs" ON public.jobs;
CREATE POLICY "Public can view limited open job info" ON public.jobs FOR SELECT USING (status = 'open'::job_status);

REVOKE EXECUTE ON FUNCTION public.calculate_assessment_total_score(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_assessment_total_score(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_assessment_total_score(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.calculate_assessment_total_score(UUID) TO postgres;

CREATE OR REPLACE VIEW public.public_job_listings AS
SELECT id, title, description, department, location, job_type, experience_level, application_deadline, created_at, updated_at
FROM public.jobs WHERE status = 'open'::job_status;
```

---

### Migration 10: `20260202140707` — Fix public_job_listings view

```sql
DROP VIEW IF EXISTS public.public_job_listings;
CREATE VIEW public.public_job_listings WITH (security_invoker = true) AS
SELECT id, title, description, department, location, job_type, experience_level, application_deadline, created_at, updated_at
FROM public.jobs WHERE status = 'open'::job_status;
```

---

### Migration 11: `20260202143140` — Fix job_applications INSERT policy

```sql
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.job_applications;
CREATE POLICY "Anyone can submit applications" ON public.job_applications FOR INSERT TO public WITH CHECK (true);
```

---

### Migration 12: `20260202143500` — Fix job_applications INSERT policy (again)

```sql
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.job_applications;
CREATE POLICY "Anyone can submit applications" ON public.job_applications FOR INSERT TO anon, authenticated WITH CHECK (true);
```

---

### Migration 13: `20260202143816` — Grant permissions + recreate policy

```sql
GRANT INSERT ON public.job_applications TO anon;
GRANT INSERT ON public.job_applications TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

DROP POLICY IF EXISTS "Anyone can submit applications" ON public.job_applications;
CREATE POLICY "Public can submit applications" ON public.job_applications FOR INSERT WITH CHECK (true);
```

---

### Migration 14: `20260202145401` — Final fix for job_applications INSERT

```sql
DROP POLICY IF EXISTS "Public can submit applications" ON public.job_applications;
DROP POLICY IF EXISTS "Anyone can submit applications" ON public.job_applications;

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT INSERT ON public.job_applications TO anon;
GRANT INSERT ON public.job_applications TO authenticated;
GRANT SELECT ON public.job_applications TO anon;
GRANT SELECT ON public.job_applications TO authenticated;

CREATE POLICY "Allow anon to submit applications" ON public.job_applications FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow authenticated to submit applications" ON public.job_applications FOR INSERT TO authenticated WITH CHECK (true);
```

---

### Migration 15: `20260202151123` — LinkedIn URL + Resumes Storage

```sql
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload resumes" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'resumes');
CREATE POLICY "Anyone can view resumes" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'resumes');
CREATE POLICY "Authenticated can delete resumes" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'resumes');
```

---

### Migration 16: `20260202152930` — Applicant Profiles + Applicant RLS

```sql
CREATE TABLE public.applicant_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, phone TEXT, linkedin_url TEXT, resume_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.applicant_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_applicant(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.applicant_profiles WHERE user_id = _user_id) $$;

CREATE POLICY "Applicants can view own profile" ON public.applicant_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Applicants can update own profile" ON public.applicant_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Applicants can insert own profile" ON public.applicant_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin/HR can view all applicant profiles" ON public.applicant_profiles FOR SELECT USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Applicants can view own applications" ON public.job_applications FOR SELECT
USING (EXISTS (SELECT 1 FROM public.applicant_profiles ap WHERE ap.user_id = auth.uid() AND ap.email = job_applications.applicant_email));

CREATE POLICY "Applicants can view own candidate record" ON public.candidates FOR SELECT
USING (EXISTS (SELECT 1 FROM public.applicant_profiles ap WHERE ap.user_id = auth.uid() AND ap.email = candidates.email));

CREATE POLICY "Applicants can update own candidate record" ON public.candidates FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.applicant_profiles ap WHERE ap.user_id = auth.uid() AND ap.email = candidates.email));

CREATE POLICY "Applicants can view own assessments" ON public.candidate_assessments FOR SELECT
USING (EXISTS (SELECT 1 FROM public.candidates c JOIN public.applicant_profiles ap ON ap.email = c.email WHERE c.id = candidate_assessments.candidate_id AND ap.user_id = auth.uid()));

CREATE POLICY "Applicants can update own assessments" ON public.candidate_assessments FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.candidates c JOIN public.applicant_profiles ap ON ap.email = c.email WHERE c.id = candidate_assessments.candidate_id AND ap.user_id = auth.uid()));

CREATE POLICY "Applicants can view own responses" ON public.candidate_responses FOR SELECT
USING (EXISTS (SELECT 1 FROM public.candidate_assessments ca JOIN public.candidates c ON c.id = ca.candidate_id JOIN public.applicant_profiles ap ON ap.email = c.email WHERE ca.id = candidate_responses.candidate_assessment_id AND ap.user_id = auth.uid()));

CREATE POLICY "Applicants can insert own responses" ON public.candidate_responses FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.candidate_assessments ca JOIN public.candidates c ON c.id = ca.candidate_id JOIN public.applicant_profiles ap ON ap.email = c.email WHERE ca.id = candidate_responses.candidate_assessment_id AND ap.user_id = auth.uid()));

CREATE POLICY "Applicants can update own responses" ON public.candidate_responses FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.candidate_assessments ca JOIN public.candidates c ON c.id = ca.candidate_id JOIN public.applicant_profiles ap ON ap.email = c.email WHERE ca.id = candidate_responses.candidate_assessment_id AND ap.user_id = auth.uid()));

CREATE POLICY "Applicants can view assigned assessment metadata" ON public.assessments FOR SELECT
USING (is_admin_or_hr(auth.uid()) OR EXISTS (SELECT 1 FROM public.candidate_assessments ca JOIN public.candidates c ON c.id = ca.candidate_id JOIN public.applicant_profiles ap ON ap.email = c.email WHERE ca.assessment_id = assessments.id AND ap.user_id = auth.uid()));

CREATE POLICY "Applicants can view assigned assessment sections" ON public.assessment_sections FOR SELECT
USING (is_admin_or_hr(auth.uid()) OR EXISTS (SELECT 1 FROM public.candidate_assessments ca JOIN public.candidates c ON c.id = ca.candidate_id JOIN public.applicant_profiles ap ON ap.email = c.email WHERE ca.assessment_id = assessment_sections.assessment_id AND ap.user_id = auth.uid()));

CREATE POLICY "Applicants can view assigned assessment questions" ON public.questions FOR SELECT
USING (is_admin_or_hr(auth.uid()) OR EXISTS (SELECT 1 FROM public.assessment_sections s JOIN public.candidate_assessments ca ON ca.assessment_id = s.assessment_id JOIN public.candidates c ON c.id = ca.candidate_id JOIN public.applicant_profiles ap ON ap.email = c.email WHERE s.id = questions.section_id AND ap.user_id = auth.uid()));

CREATE TRIGGER update_applicant_profiles_updated_at BEFORE UPDATE ON public.applicant_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

---

### Migration 17: `20260212140150` — Fix Applicant Profile RLS (PERMISSIVE)

```sql
DROP POLICY IF EXISTS "Applicants can view own profile" ON public.applicant_profiles;
DROP POLICY IF EXISTS "Applicants can insert own profile" ON public.applicant_profiles;
DROP POLICY IF EXISTS "Applicants can update own profile" ON public.applicant_profiles;
DROP POLICY IF EXISTS "Admin/HR can view all applicant profiles" ON public.applicant_profiles;

CREATE POLICY "Applicants can view own profile" ON public.applicant_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Applicants can insert own profile" ON public.applicant_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Applicants can update own profile" ON public.applicant_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin/HR can view all applicant profiles" ON public.applicant_profiles FOR SELECT USING (is_admin_or_hr(auth.uid()));
```

---

### Migration 18: `20260218152913` — Add work_experience & education

```sql
ALTER TABLE public.applicant_profiles
ADD COLUMN work_experience jsonb DEFAULT '[]'::jsonb,
ADD COLUMN education jsonb DEFAULT '[]'::jsonb;
```

---

### Migration 19: `20260220085830` — Parsed Profile Fields on Candidates

```sql
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS parse_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experience_years numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS candidate_current_role text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS candidate_current_company text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS enrichment_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skills_tags jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_enriched_at timestamp with time zone DEFAULT NULL;

ALTER TABLE public.candidates ADD CONSTRAINT parse_score_range CHECK (parse_score >= 0 AND parse_score <= 100);
ALTER TABLE public.candidates ADD CONSTRAINT enrichment_score_range CHECK (enrichment_score IS NULL OR (enrichment_score >= 0 AND enrichment_score <= 100));

CREATE INDEX IF NOT EXISTS idx_candidates_source ON public.candidates(source);
CREATE INDEX IF NOT EXISTS idx_candidates_parse_score ON public.candidates(parse_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_enrichment_score ON public.candidates(enrichment_score DESC NULLS LAST);
```

---

### Migration 20: `20260220094816` — Enrich Applicant from Candidate Trigger

```sql
CREATE OR REPLACE FUNCTION public.enrich_applicant_from_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE _candidate RECORD;
BEGIN
    SELECT * INTO _candidate FROM public.candidates WHERE email = NEW.email LIMIT 1;
    IF FOUND THEN
        NEW.full_name := COALESCE(NULLIF(NEW.full_name, NEW.email), _candidate.name, NEW.full_name);
        NEW.phone := COALESCE(NEW.phone, _candidate.phone);
        NEW.resume_url := COALESCE(NEW.resume_url, _candidate.resume_url);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER enrich_applicant_from_candidate_trigger
BEFORE INSERT ON public.applicant_profiles FOR EACH ROW EXECUTE FUNCTION public.enrich_applicant_from_candidate();
```

---

### Migration 21: `20260220183040` — Auth Redirect Notice (no-op)

```sql
DO $$ BEGIN
  RAISE NOTICE 'Auth redirect URLs should include your app origin (e.g. https://your-app.example.com)';
  RAISE NOTICE 'This needs to be configured via Supabase Auth settings (Site URL / Redirect URLs)';
END $$;
```

---

### Migration 22: `20260221083130` — Evaluator Notes

```sql
ALTER TABLE public.candidate_assessments ADD COLUMN evaluator_notes text;
```

---

### Migration 23: `20260221094726` — Suitability Score Columns

```sql
ALTER TABLE public.candidates
ADD COLUMN suitability_score integer DEFAULT NULL,
ADD COLUMN suitability_analysis jsonb DEFAULT NULL,
ADD COLUMN last_analyzed_at timestamp with time zone DEFAULT NULL;
```

---

### Migration 24: `20260223_candidate_prescreens` — Pre-Screening Data

```sql
-- Create candidate_prescreens table for structured pre-screening data
CREATE TABLE public.candidate_prescreens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL UNIQUE REFERENCES public.candidates(id) ON DELETE CASCADE,
  
  -- Professional details
  total_experience_years NUMERIC,
  relevant_experience_years NUMERIC,
  relevant_experience_domain TEXT,
  current_ctc TEXT,
  expected_ctc TEXT,
  notice_period TEXT,
  lwd TEXT,
  current_location TEXT,
  preferred_location TEXT,
  
  -- Communication rating
  comms_rating NUMERIC CHECK (comms_rating >= 0 AND comms_rating <= 10),
  
  -- Nutshell / summary notes
  nutshell TEXT,
  
  -- Academics as JSONB (array of records)
  -- Each: { level: "10th"|"12th"|"graduation"|"post_graduation", institution: string, marks: string, percentile: string }
  academics JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  screened_by UUID REFERENCES auth.users(id),
  screened_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.candidate_prescreens ENABLE ROW LEVEL SECURITY;

-- RLS Policies - only Admin/HR
CREATE POLICY "Admin/HR can view all prescreens"
ON public.candidate_prescreens FOR SELECT
USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create prescreens"
ON public.candidate_prescreens FOR INSERT
WITH CHECK (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update prescreens"
ON public.candidate_prescreens FOR UPDATE
USING (is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete prescreens"
ON public.candidate_prescreens FOR DELETE
USING (is_admin_or_hr(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_candidate_prescreens_updated_at
BEFORE UPDATE ON public.candidate_prescreens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
```

---

## After Running Migrations

1. **Serve Edge Functions locally:**
   ```bash
   supabase functions serve --env-file supabase/.env.local
   ```

2. **Generate types:**
   ```bash
   supabase gen types typescript --local > src/integrations/supabase/types.ts
   ```

3. **First admin:** Sign up via the app — the first user is auto-assigned admin role via trigger.

---

## Migration 25: Skill Intelligence System — Structured Skills & Section Skill Tags

**File:** `20250225000000_skill_intelligence_system.sql`

```sql
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
```

**Purpose:** Implements the Skill Intelligence System:
- `structured_skills` on candidates: `[{ name, category, proficiency, confidence, sources }]`
- `skill_tags` on assessment_sections: Links sections to skills for assessment-driven verification
- Data migration: Merges existing `skills` + `skills_tags` into structured format
- GIN indexes for efficient JSON queries

---

### Migration 26: Work Experience & Education on Candidates

```sql
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS work_experience jsonb DEFAULT NULL;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS education jsonb DEFAULT NULL;
```

**Purpose:** Stores parsed resume work experience and education data directly on the candidate record for display in the detail drawer.

---

### Migration 27: Credential Intelligence System

```sql
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS awards jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS credential_score integer DEFAULT NULL;
```

**Purpose:** Implements the Credential Intelligence System:
- `certifications`: `[{ name, issuer, year, credential_id, expiry, tier, category, skill_upgrade, is_premium }]`
- `awards`: `[{ title, issuer, year, scope }]`
- `credential_score`: 0-100 score based on premium certifications (30%), college tier (25%), academic percentile (20%), awards (15%), recency (10%)
- Premium certifications (PMP, CISSP, AWS SA Pro, CFA, etc.) auto-upgrade structured_skills proficiency
