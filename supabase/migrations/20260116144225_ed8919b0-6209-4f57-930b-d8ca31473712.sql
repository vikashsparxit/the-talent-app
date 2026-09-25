-- =====================================================
-- SPARXIT CANDIDATE ASSESSMENT SYSTEM - DATABASE SCHEMA
-- =====================================================

-- 1. ENUMS
-- =====================================================

-- Role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'hr');

-- Question type enum
CREATE TYPE public.question_type AS ENUM ('mcq', 'coding', 'subjective');

-- Assessment status enum
CREATE TYPE public.assessment_status AS ENUM ('draft', 'active', 'archived');

-- Candidate assessment status enum
CREATE TYPE public.candidate_assessment_status AS ENUM ('invited', 'in_progress', 'completed', 'evaluated', 'expired');

-- =====================================================
-- 2. CORE TABLES
-- =====================================================

-- Profiles table for user information
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (user_id, role)
);

-- Assessments table
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

-- Assessment sections table
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

-- Questions table
CREATE TABLE public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID REFERENCES public.assessment_sections(id) ON DELETE CASCADE NOT NULL,
    type public.question_type NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB, -- For MCQ: array of options
    correct_answer JSONB, -- For MCQ: correct option index(es), For Coding: test cases
    marks INTEGER NOT NULL DEFAULT 1,
    order_index INTEGER NOT NULL DEFAULT 0,
    coding_language TEXT, -- For coding questions
    coding_starter_code TEXT, -- For coding questions
    coding_test_cases JSONB, -- For coding: [{input: "", expected_output: "", is_hidden: false}]
    subjective_max_words INTEGER, -- For subjective questions
    subjective_rubric TEXT, -- For subjective evaluation criteria
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Candidates table
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

-- Candidate assessments (assignment) table
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

-- Candidate responses table
CREATE TABLE public.candidate_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_assessment_id UUID REFERENCES public.candidate_assessments(id) ON DELETE CASCADE NOT NULL,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
    response JSONB, -- The candidate's answer
    auto_score NUMERIC(5,2), -- Auto-calculated score
    manual_score NUMERIC(5,2), -- Manually assigned score
    final_score NUMERIC(5,2), -- Final score (manual if exists, else auto)
    evaluated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    feedback TEXT,
    evaluated_at TIMESTAMP WITH TIME ZONE,
    time_spent_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (candidate_assessment_id, question_id)
);

-- =====================================================
-- 3. INDEXES
-- =====================================================

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

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Function to check if user has admin or hr role
CREATE OR REPLACE FUNCTION public.is_admin_or_hr(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role IN ('admin', 'hr')
    )
$$;

-- Function to check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role = _role
    )
$$;

-- Function to handle new user creation (create profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
        NEW.email
    );
    RETURN NEW;
END;
$$;

-- Trigger for new user profile creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assessment_sections_updated_at BEFORE UPDATE ON public.assessment_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_candidate_assessments_updated_at BEFORE UPDATE ON public.candidate_assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_candidate_responses_updated_at BEFORE UPDATE ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate final score for a response
CREATE OR REPLACE FUNCTION public.calculate_response_final_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.final_score = COALESCE(NEW.manual_score, NEW.auto_score);
    RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_response_score BEFORE INSERT OR UPDATE ON public.candidate_responses FOR EACH ROW EXECUTE FUNCTION public.calculate_response_final_score();

-- Function to calculate total assessment score
CREATE OR REPLACE FUNCTION public.calculate_assessment_total_score(_candidate_assessment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _total_score NUMERIC;
    _max_score NUMERIC;
    _percentage NUMERIC;
    _passing_score INTEGER;
    _passed BOOLEAN;
BEGIN
    -- Get total score from responses
    SELECT COALESCE(SUM(final_score), 0) INTO _total_score
    FROM public.candidate_responses
    WHERE candidate_assessment_id = _candidate_assessment_id;
    
    -- Get max possible score
    SELECT COALESCE(SUM(q.marks), 0) INTO _max_score
    FROM public.candidate_assessments ca
    JOIN public.assessments a ON ca.assessment_id = a.id
    JOIN public.assessment_sections s ON s.assessment_id = a.id
    JOIN public.questions q ON q.section_id = s.id
    WHERE ca.id = _candidate_assessment_id;
    
    -- Calculate percentage
    IF _max_score > 0 THEN
        _percentage = (_total_score / _max_score) * 100;
    ELSE
        _percentage = 0;
    END IF;
    
    -- Get passing score
    SELECT a.passing_score INTO _passing_score
    FROM public.candidate_assessments ca
    JOIN public.assessments a ON ca.assessment_id = a.id
    WHERE ca.id = _candidate_assessment_id;
    
    _passed = _percentage >= _passing_score;
    
    -- Update candidate assessment
    UPDATE public.candidate_assessments
    SET total_score = _total_score,
        percentage = _percentage,
        passed = _passed
    WHERE id = _candidate_assessment_id;
END;
$$;

-- =====================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_responses ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. RLS POLICIES
-- =====================================================

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admin/HR can view all profiles" ON public.profiles
    FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

-- User roles policies
CREATE POLICY "Admin/HR can view roles" ON public.user_roles
    FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin can manage roles" ON public.user_roles
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own role" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);

-- Assessments policies
CREATE POLICY "Admin/HR can view all assessments" ON public.assessments
    FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create assessments" ON public.assessments
    FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update assessments" ON public.assessments
    FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete assessments" ON public.assessments
    FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

-- Assessment sections policies
CREATE POLICY "Admin/HR can view all sections" ON public.assessment_sections
    FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create sections" ON public.assessment_sections
    FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update sections" ON public.assessment_sections
    FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete sections" ON public.assessment_sections
    FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

-- Questions policies
CREATE POLICY "Admin/HR can view all questions" ON public.questions
    FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create questions" ON public.questions
    FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update questions" ON public.questions
    FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete questions" ON public.questions
    FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

-- Candidates policies
CREATE POLICY "Admin/HR can view all candidates" ON public.candidates
    FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create candidates" ON public.candidates
    FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update candidates" ON public.candidates
    FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete candidates" ON public.candidates
    FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

-- Candidate assessments policies
CREATE POLICY "Admin/HR can view all candidate assessments" ON public.candidate_assessments
    FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create candidate assessments" ON public.candidate_assessments
    FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update candidate assessments" ON public.candidate_assessments
    FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete candidate assessments" ON public.candidate_assessments
    FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

-- Candidate responses policies
CREATE POLICY "Admin/HR can view all responses" ON public.candidate_responses
    FOR SELECT USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can create responses" ON public.candidate_responses
    FOR INSERT WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can update responses" ON public.candidate_responses
    FOR UPDATE USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete responses" ON public.candidate_responses
    FOR DELETE USING (public.is_admin_or_hr(auth.uid()));

-- =====================================================
-- 7. VIEWS FOR CANDIDATE ACCESS (via Edge Functions)
-- =====================================================

-- View for assessment details (excluding sensitive data)
CREATE OR REPLACE VIEW public.assessment_details AS
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

-- =====================================================
-- 8. INSERT FIRST ADMIN USER HELPER
-- =====================================================

-- Function to make a user admin (call this for first user setup)
CREATE OR REPLACE FUNCTION public.make_user_admin(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;