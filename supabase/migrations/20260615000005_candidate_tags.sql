-- Talent pool tags: freeform labels on person records (Talent Database)

CREATE TABLE public.candidate_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT candidate_tags_candidate_tag_unique UNIQUE (candidate_id, tag),
  CONSTRAINT candidate_tags_tag_not_empty CHECK (char_length(trim(tag)) > 0)
);

CREATE INDEX idx_candidate_tags_candidate_id ON public.candidate_tags(candidate_id);
CREATE INDEX idx_candidate_tags_tag ON public.candidate_tags(tag);

ALTER TABLE public.candidate_tags ENABLE ROW LEVEL SECURITY;

-- Admin / HR
CREATE POLICY "Admin/HR can view candidate_tags"
  ON public.candidate_tags FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can insert candidate_tags"
  ON public.candidate_tags FOR INSERT
  WITH CHECK (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin/HR can delete candidate_tags"
  ON public.candidate_tags FOR DELETE
  USING (public.is_admin_or_hr(auth.uid()));

-- Recruiters (full candidate database access)
CREATE POLICY "Recruiters can view candidate_tags"
  ON public.candidate_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'recruiter'
    )
  );

CREATE POLICY "Recruiters can insert candidate_tags"
  ON public.candidate_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'recruiter'
    )
  );

CREATE POLICY "Recruiters can delete candidate_tags"
  ON public.candidate_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'recruiter'
    )
  );
