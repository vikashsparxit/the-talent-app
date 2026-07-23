
-- Drop the security definer view and recreate with security_invoker 
-- Since we're using the RPC function for interviewer access, the view is redundant
DROP VIEW IF EXISTS public.interviewer_prescreens;
