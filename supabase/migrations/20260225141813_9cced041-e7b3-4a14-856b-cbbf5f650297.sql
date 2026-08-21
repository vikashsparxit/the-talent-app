-- Recreate the trigger on job_applications that was lost
CREATE OR REPLACE TRIGGER on_new_job_application
  BEFORE INSERT ON public.job_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_candidate_from_application();