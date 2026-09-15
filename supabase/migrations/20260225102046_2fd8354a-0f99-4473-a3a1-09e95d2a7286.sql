
-- System configuration table for dynamic tier lists
CREATE TABLE public.system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL UNIQUE,
  config_value jsonb NOT NULL DEFAULT '{}',
  description text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- Only admin can manage config
CREATE POLICY "Admin can view config"
  ON public.system_config FOR SELECT
  TO authenticated
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "Admin can insert config"
  ON public.system_config FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update config"
  ON public.system_config FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete config"
  ON public.system_config FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow edge functions to read config (anon role for service calls)
CREATE POLICY "Anon can read config for edge functions"
  ON public.system_config FOR SELECT
  TO anon
  USING (true);

-- Auto-update timestamp
CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default data: certification tiers
INSERT INTO public.system_config (config_key, config_value, description) VALUES
('cert_tiers', '{
  "pmp": {"tier": 1, "category": "project_management", "skill_upgrade": "Project Management"},
  "cissp": {"tier": 1, "category": "security", "skill_upgrade": "Cybersecurity"},
  "cfa": {"tier": 1, "category": "other", "skill_upgrade": "Financial Analysis"},
  "ca": {"tier": 1, "category": "other", "skill_upgrade": "Chartered Accountancy"},
  "cpa": {"tier": 1, "category": "other", "skill_upgrade": "Accounting"},
  "aws solutions architect professional": {"tier": 1, "category": "cloud", "skill_upgrade": "AWS"},
  "aws sa professional": {"tier": 1, "category": "cloud", "skill_upgrade": "AWS"},
  "gcp professional cloud architect": {"tier": 1, "category": "cloud", "skill_upgrade": "Google Cloud"},
  "azure solutions architect expert": {"tier": 1, "category": "cloud", "skill_upgrade": "Azure"},
  "cism": {"tier": 1, "category": "security", "skill_upgrade": "Information Security"},
  "cisa": {"tier": 1, "category": "security", "skill_upgrade": "IT Audit"},
  "oscp": {"tier": 1, "category": "security", "skill_upgrade": "Penetration Testing"},
  "togaf": {"tier": 1, "category": "other", "skill_upgrade": "Enterprise Architecture"},
  "six sigma black belt": {"tier": 1, "category": "project_management", "skill_upgrade": "Process Improvement"},
  "prince2 practitioner": {"tier": 1, "category": "project_management", "skill_upgrade": "Project Management"},
  "itil expert": {"tier": 1, "category": "devops", "skill_upgrade": "ITIL"},
  "aws solutions architect associate": {"tier": 2, "category": "cloud", "skill_upgrade": "AWS"},
  "aws sa associate": {"tier": 2, "category": "cloud", "skill_upgrade": "AWS"},
  "aws developer associate": {"tier": 2, "category": "cloud", "skill_upgrade": "AWS"},
  "azure administrator": {"tier": 2, "category": "cloud", "skill_upgrade": "Azure"},
  "gcp associate cloud engineer": {"tier": 2, "category": "cloud", "skill_upgrade": "Google Cloud"},
  "kubernetes ckad": {"tier": 2, "category": "devops", "skill_upgrade": "Kubernetes"},
  "kubernetes cka": {"tier": 2, "category": "devops", "skill_upgrade": "Kubernetes"},
  "comptia security+": {"tier": 2, "category": "security", "skill_upgrade": "Security"},
  "scrum master": {"tier": 2, "category": "project_management", "skill_upgrade": "Agile"},
  "csm": {"tier": 2, "category": "project_management", "skill_upgrade": "Agile"},
  "safe agilist": {"tier": 2, "category": "project_management", "skill_upgrade": "Agile"},
  "terraform associate": {"tier": 2, "category": "devops", "skill_upgrade": "Terraform"},
  "pmi-acp": {"tier": 2, "category": "project_management", "skill_upgrade": "Agile"},
  "prince2 foundation": {"tier": 2, "category": "project_management", "skill_upgrade": "Project Management"},
  "itil foundation": {"tier": 2, "category": "devops", "skill_upgrade": "ITIL"},
  "six sigma green belt": {"tier": 2, "category": "project_management", "skill_upgrade": "Process Improvement"},
  "google analytics": {"tier": 3, "category": "other", "skill_upgrade": "Analytics"},
  "hubspot": {"tier": 3, "category": "other", "skill_upgrade": "Marketing"},
  "meta blueprint": {"tier": 3, "category": "other", "skill_upgrade": "Digital Marketing"},
  "salesforce administrator": {"tier": 3, "category": "other", "skill_upgrade": "Salesforce"},
  "comptia a+": {"tier": 3, "category": "other", "skill_upgrade": "IT Support"}
}'::jsonb, 'Premium certification tier mapping with categories and skill upgrades');

-- Seed default data: tier 1 colleges
INSERT INTO public.system_config (config_key, config_value, description) VALUES
('tier1_colleges', '["iit", "indian institute of technology", "iim", "indian institute of management", "nit", "national institute of technology", "bits", "birla institute of technology and science", "iisc", "indian institute of science", "iiit", "international institute of information technology", "isb", "indian school of business", "xlri", "mit", "massachusetts institute of technology", "stanford", "harvard", "oxford", "cambridge", "iiser", "nlu", "national law university", "aiims", "delhi university", "jawaharlal nehru university", "jnu"]'::jsonb, 'Tier 1 college name patterns for credential scoring');
