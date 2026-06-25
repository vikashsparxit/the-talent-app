-- Tighten overly permissive RLS policies flagged by Supabase Advisor.
-- Service role bypasses RLS; SECURITY DEFINER triggers bypass RLS on INSERT.
-- These policies incorrectly allowed any authenticated user to insert/update.

DROP POLICY IF EXISTS "Service role inserts notifications" ON public.notifications;

DROP POLICY IF EXISTS "Service role full access to chitra escalations" ON public.chitra_escalations;
