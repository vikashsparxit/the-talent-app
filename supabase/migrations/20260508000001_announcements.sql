CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  link_label TEXT,
  link_url TEXT,
  type TEXT NOT NULL DEFAULT 'info'
    CHECK (type IN ('info', 'warning', 'release', 'maintenance')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (bar only queries is_active = true)
CREATE POLICY "authenticated users can read announcements"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (true);

-- Admin, HR, and super admin can manage announcements
CREATE POLICY "admins can manage announcements"
  ON public.announcements FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'hr'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_super_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'hr'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND is_super_admin = true)
  );
