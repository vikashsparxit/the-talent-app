
-- Replace the existing trigger function to also assign 'interviewer' to non-first users
CREATE OR REPLACE FUNCTION public.auto_assign_first_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Check if this is the first user (no existing roles)
    IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.user_id, 'admin');
    ELSE
        -- Assign interviewer as default role if user doesn't already have one
        IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id) THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (NEW.user_id, 'interviewer');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
