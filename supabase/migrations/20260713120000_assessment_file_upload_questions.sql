-- Assessment file_upload question type + private storage for candidate submissions.
-- Per-question only (questions.file_config). Manual scoring like subjective.
-- DO NOT apply automatically — super admin reviews before running.

-- ── 1. Enum value ─────────────────────────────────────────────────────────────
ALTER TYPE public.question_type ADD VALUE IF NOT EXISTS 'file_upload';

-- ── 2. Optional per-question file config ──────────────────────────────────────
-- Shape:
-- {
--   "allow_file": true,
--   "allow_link": true,
--   "allowed_mime_types": ["image/jpeg","image/png","image/gif","image/webp","application/pdf"],
--   "max_file_bytes": 10485760,
--   "max_files": 1
-- }
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS file_config JSONB;

COMMENT ON COLUMN public.questions.file_config IS
  'Optional config for file_upload questions: allow_file, allow_link, allowed_mime_types, max_file_bytes (10MB), max_files (1).';

-- ── 3. Private storage bucket (image + PDF, 10 MB) ────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assessment-artifacts',
  'assessment-artifacts',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];

-- ── 4. Storage RLS — staff read only; uploads via service role (edge) ─────────
DROP POLICY IF EXISTS "Staff can read assessment artifacts" ON storage.objects;
CREATE POLICY "Staff can read assessment artifacts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'assessment-artifacts'
    AND public.is_staff_user(auth.uid())
  );

DROP POLICY IF EXISTS "Staff can delete assessment artifacts" ON storage.objects;
CREATE POLICY "Staff can delete assessment artifacts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assessment-artifacts'
    AND public.is_staff_user(auth.uid())
  );

-- No INSERT/UPDATE policies for authenticated — candidate uploads go through
-- candidate-portal edge function using the service role.
