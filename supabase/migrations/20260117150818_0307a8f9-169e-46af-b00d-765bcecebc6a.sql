-- Create function to auto-assign admin role to first user
CREATE OR REPLACE FUNCTION public.auto_assign_first_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if this is the first user (no existing roles)
    IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.user_id, 'admin');
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger on profiles table (fires when new user signs up)
CREATE TRIGGER on_profile_created_assign_admin
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_assign_first_admin();