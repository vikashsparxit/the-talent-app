-- Add artifacts column to candidate_interviews
-- Stores both uploaded file refs and external links as JSONB array.
-- Schema per item: { id, type: 'file'|'link', url, name, mime?, size?, added_at }

ALTER TABLE public.candidate_interviews
  ADD COLUMN IF NOT EXISTS artifacts JSONB DEFAULT '[]'::jsonb;

-- ─── Storage bucket ───────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interview-artifacts',
  'interview-artifacts',
  true,
  10485760, -- 10 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ─── Storage RLS ──────────────────────────────────────────────────────────────

-- All authenticated users can read (artifacts visible to all roles)
CREATE POLICY "Authenticated users can read interview artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'interview-artifacts');

-- Any authenticated user can upload
CREATE POLICY "Authenticated users can upload interview artifacts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'interview-artifacts');

-- Uploader or admin/hr can delete
CREATE POLICY "Staff can delete interview artifacts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'interview-artifacts'
    AND (
      owner_id::text = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('admin', 'hr')
      )
    )
  );
