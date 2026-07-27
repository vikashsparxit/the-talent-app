-- Business branding: optional primary_color (hex). Client defaults to #D64541 when absent.

UPDATE public.system_config
SET description = 'Tenant branding: company logos, display name, and primary brand color (hex)'
WHERE config_key = 'business_branding';

UPDATE public.system_config
SET config_value = config_value || '{"primary_color": "#D64541"}'::jsonb
WHERE config_key = 'business_branding'
  AND NOT (config_value ? 'primary_color');
