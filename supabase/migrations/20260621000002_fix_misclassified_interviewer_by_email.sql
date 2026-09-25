-- Follow-up to 20260621000001: that cleanup joined user_roles.user_id = applicant_profiles.user_id.
-- Duplicate auth accounts (same applicant, different user_id — e.g. typo email on re-signup) kept a stray
-- interviewer role on the staff-only account while applicant_profiles lived on another user_id.
--
-- Remove legacy interviewer rows when the user is applicant-only:
--   • applicant_profiles on same user_id, OR
--   • profile email matches any applicant_profiles email (cross-account duplicate signup)

DELETE FROM user_roles ur
WHERE ur.role = 'interviewer'
  AND COALESCE(
    (SELECT can_conduct_interviews FROM profiles p WHERE p.user_id = ur.user_id),
    false
  ) = false
  AND (
    EXISTS (SELECT 1 FROM applicant_profiles ap WHERE ap.user_id = ur.user_id)
    OR EXISTS (
      SELECT 1
      FROM profiles p
      INNER JOIN applicant_profiles ap
        ON lower(trim(ap.email)) = lower(trim(p.email))
      WHERE p.user_id = ur.user_id
    )
  );
