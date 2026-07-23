-- Business branding: optional primary_foreground_color (hex). Client defaults to #FFFFFF when absent.

UPDATE public.system_config
SET description = 'Tenant branding: company logos, display name, primary brand color (hex), and button text color (hex)'
WHERE config_key = 'business_branding';

UPDATE public.system_config
SET config_value = config_value || '{"primary_foreground_color": "#FFFFFF"}'::jsonb
WHERE config_key = 'business_branding'
  AND NOT (config_value ? 'primary_foreground_color');
