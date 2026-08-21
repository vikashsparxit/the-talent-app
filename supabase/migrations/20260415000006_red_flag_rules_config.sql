-- ──────────────────────────────────────────────────────────────
-- Red Flag Rules: insert default thresholds into system_config
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'red_flag_rules',
  '{"employment_gap_months": 3, "frequent_switching_months": 12, "short_senior_tenure_months": 6}'::jsonb,
  'Thresholds for automated red flag detection during candidate profile enrichment'
)
ON CONFLICT (config_key) DO NOTHING;
