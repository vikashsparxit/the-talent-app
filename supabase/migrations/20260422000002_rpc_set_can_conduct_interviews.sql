-- RPC for admins to toggle can_conduct_interviews on any profile
-- SECURITY DEFINER so it bypasses RLS, but internally validates the caller is admin

CREATE OR REPLACE FUNCTION public.set_can_conduct_interviews(
  _target_user_id UUID,
  _value BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins/HR may call this
  IF NOT public.is_admin_or_hr(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE profiles
  SET can_conduct_interviews = _value
  WHERE user_id = _target_user_id;
END;
$$;
