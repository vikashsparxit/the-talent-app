-- Add foreign key from candidate_interviews.interviewer_user_id to profiles.user_id
ALTER TABLE public.candidate_interviews
ADD CONSTRAINT candidate_interviews_interviewer_user_id_fkey
FOREIGN KEY (interviewer_user_id) REFERENCES public.profiles(user_id);