-- Assessment recording consent: admin-editable wording in system_config.
--
-- Run manually after review. Not applied automatically.
-- Requires 20261114000002_assessment_media.sql (assessment_media_consents).
--
-- Key 'assessment_media_consent', value:
--   { company_name, privacy_email, consent_text, version, updated_at }
-- consent_text may use {company} and {privacyEmail}; they are filled in when
-- the text is shown. Edited in Settings -> Assessments (admins only).
--
-- The version is derived from company_name, privacy_email and consent_text
-- ('v-' + first 16 hex of SHA-256, supabase/functions/_shared/mediaConsent.ts).
-- The assessment-media function recomputes it on every read and ignores the
-- stored value, so a stale or hand-edited version cannot hide a text change:
-- candidates whose consent is for another version are asked again on their
-- next exam start. The stored version is for display only. The seed below
-- carries the version of the default wording (pinned by
-- src/test/mediaConsent.test.ts).
--
-- Who can read and write the row:
--   - admins (Settings): read and write.
--   - HR, recruiters, interviewers, applicants, anon: no access. Candidates get
--     the rendered text only through assessment-media (service role).
-- The existing policies already give non-admins no access to this key (anon
-- has no policy that matches it). The restrictive policy below keeps signed-in
-- non-admins out even if a broader permissive policy (such as the older
-- "Admin or HR can update config") is still present or added later.
--
-- Nothing here changes attempts, scores or stages.
--
-- Rollback:
--   DROP POLICY IF EXISTS "Media consent config is admin only" ON public.system_config;
--   DELETE FROM public.system_config WHERE config_key = 'assessment_media_consent';
--   (without the row, assessment-media falls back to the same default wording)

BEGIN;

INSERT INTO public.system_config (config_key, config_value, description)
VALUES (
  'assessment_media_consent',
  jsonb_build_object(
    'company_name', 'Your Company',
    'privacy_email', 'privacy@example.com',
    'consent_text', $consent$## Before you start: this assessment is recorded

**What we record**
- Your camera and microphone for the whole online assessment, from the moment you press Start until you submit.
- Your spoken answers to any questions that ask you to answer out loud.
- Activity signals: leaving the tab or window, and attempts to paste into answer boxes. Pasting is turned off.

**Why**
- So the hiring team can review your answers fairly and check that the assessment was taken by you, without outside help.
- Spoken answers are transcribed and may be given a suggested score by AI (Google Gemini). This only helps reviewers. **People make every hiring decision.** No recording, transcript or AI score rejects you or moves you forward on its own.

**Who can watch**
- Only the recruiters for this job, the HR/admin team at {company}, and the interviewers assigned to you.
- It is never shared publicly, and it is not used for any other purpose.

**Where it is stored and for how long**
- Recordings are stored privately and encrypted on Cloudflare R2, which is our storage provider.
- They are deleted automatically **90 days** after the assessment.
- If you are hired, your recordings are kept while you are employed with {company}.

**Your choices**
- You need to allow camera and microphone access to take this assessment. If you can't or don't want to be recorded, close this page and contact the recruiter, who can discuss other options with you.
- You can ask to see or delete your recordings at any time by writing to **{privacyEmail}**.$consent$,
    'version', 'v-7b9baeb0883238c1',
    'updated_at', to_jsonb(now())
  ),
  'Assessment recording consent shown to candidates before the online assessment ({company} and {privacyEmail} are filled in). Admin only.'
)
ON CONFLICT (config_key) DO NOTHING;

DROP POLICY IF EXISTS "Media consent config is admin only" ON public.system_config;
CREATE POLICY "Media consent config is admin only"
  ON public.system_config
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    config_key <> 'assessment_media_consent'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    config_key <> 'assessment_media_consent'
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

COMMIT;
