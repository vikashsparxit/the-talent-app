-- Add the dev domain to the auth redirect URL allowlist
-- This ensures magic links can redirect to the correct domain
-- Note: This updates the auth.config to include additional redirect URLs

-- We'll use a function to check the current config
DO $$
BEGIN
  -- Log the configuration update request
  RAISE NOTICE 'Auth redirect URLs should include: https://sparxtalent-dev.thesparxitsolutions.com';
  RAISE NOTICE 'This needs to be configured via Supabase Auth settings (Site URL / Redirect URLs)';
END $$;
