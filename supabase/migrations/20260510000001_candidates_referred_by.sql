ALTER TABLE public.candidates
  ADD COLUMN referred_by TEXT;

COMMENT ON COLUMN public.candidates.referred_by IS 'Name of the employee who referred this candidate (only populated when source = ''referral'')';
