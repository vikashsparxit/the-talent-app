
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
