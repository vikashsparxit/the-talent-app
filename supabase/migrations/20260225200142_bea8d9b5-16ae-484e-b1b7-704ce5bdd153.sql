-- Change cascade to SET NULL so deleting stages doesn't destroy interview history
ALTER TABLE public.candidate_interviews 
DROP CONSTRAINT candidate_interviews_job_interview_stage_id_fkey;

ALTER TABLE public.candidate_interviews
ADD CONSTRAINT candidate_interviews_job_interview_stage_id_fkey 
FOREIGN KEY (job_interview_stage_id) REFERENCES public.job_interview_stages(id) ON DELETE SET NULL;

-- Make job_interview_stage_id nullable to support SET NULL
ALTER TABLE public.candidate_interviews 
ALTER COLUMN job_interview_stage_id DROP NOT NULL;