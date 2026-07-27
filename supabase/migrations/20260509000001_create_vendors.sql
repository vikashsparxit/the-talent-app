CREATE TABLE public.vendors (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  source_key     TEXT        NOT NULL UNIQUE,
  contact_name   TEXT,
  contact_email  TEXT,
  fee_pct        NUMERIC(5,2),
  guarantee_days INTEGER,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- Admin + HR can fully manage vendors
CREATE POLICY "admin_hr_manage_vendors" ON public.vendors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'hr')
    )
  );

-- All authenticated users can read (needed for the import vendor picker)
CREATE POLICY "authenticated_read_vendors" ON public.vendors
  FOR SELECT
  USING (auth.role() = 'authenticated');
