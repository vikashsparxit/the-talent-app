import { corsHeaders, serveWithCors } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import { sendTransactionalEmail } from "../_shared/email.ts";
import { buildAppLink, buildCandidateDrawerPath, getEmailBranding } from "../_shared/emailLayout.ts";
import { shouldSendEmail } from "../_shared/emailNotificationSettings.ts";
import { buildStaffAssessmentCompletedEmail } from "../_shared/transactionalEmailTemplates.ts";
import {
  ASSESSMENT_FILE_MIMES,
  attemptTimeLimit,
  type GradingStatus,
  gateAnswerWrite,
  getSectionAssessmentId,
  isPastTimeLimit,
  isTokenExpired,
  needsAiGrading,
  parseFileConfig,
  parseLinkPolicy,
  type PortalQuestionRow,
  sanitizeFileName,
  sanitizeResponseForQuestion,
  shouldRequeueGrading,
} from "../_shared/assessmentPortal.ts";

interface CandidatePortalRequest {
  action: 'validate' | 'start' | 'save-response' | 'submit' | 'log-integrity' | 'get-responses' | 'auto-complete' | 'notify-staff-complete' | 'create-file-upload';
  access_token?: string;
  data?: Record<string, unknown>;
}

type AdminClient = SupabaseClient;

const QUESTION_SELECT = 'id, type, file_config, section:assessment_sections!inner(assessment_id)';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseAssessmentConfig(raw: unknown): {
  notify_recruiter_on_complete: boolean;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { notify_recruiter_on_complete: true };
  }
  const c = raw as Record<string, unknown>;
  return { notify_recruiter_on_complete: c.notify_recruiter_on_complete !== false };
}

async function loadLinkPolicy(supabaseAdmin: AdminClient) {
  const { data } = await supabaseAdmin
    .from('system_config')
    .select('config_value')
    .eq('config_key', 'assessment_link_policy')
    .maybeSingle();
  return parseLinkPolicy(data?.config_value);
}

/** Fire-and-forget AI grading for non-MCQ responses after submit. */
function invokeGradeAssessment(candidateAssessmentId: string): void {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;

  void fetch(`${supabaseUrl}/functions/v1/grade-assessment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ candidate_assessment_id: candidateAssessmentId }),
  }).catch((err) => console.error('grade-assessment invoke failed:', err));
}

/**
 * Queues AI grading once per attempt. The conditional update makes repeated
 * submit / notify calls safe: only the call that moves grading_status from
 * null sends the request; a queued request that looks lost is re-sent.
 * Returns the resulting grading status.
 */
async function queueGrading(
  supabaseAdmin: AdminClient,
  ca: { id: string; assessment_id: string; grading_status: GradingStatus; grading_requested_at: string | null },
): Promise<GradingStatus> {
  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('type, section:assessment_sections!inner(assessment_id)')
    .eq('section.assessment_id', ca.assessment_id);
  const gradeable = needsAiGrading((questions ?? []).map((q: { type: string }) => q.type));
  const now = new Date();

  if (!shouldRequeueGrading(ca.grading_status, ca.grading_requested_at, now)) {
    return ca.grading_status;
  }

  const nextStatus: GradingStatus = gradeable ? 'queued' : 'not_required';
  let claim = supabaseAdmin
    .from('candidate_assessments')
    .update({ grading_status: nextStatus, grading_requested_at: now.toISOString() })
    .eq('id', ca.id);
  if (ca.grading_status === null) {
    claim = claim.is('grading_status', null);
  } else {
    claim = claim.eq('grading_status', 'queued');
    claim = ca.grading_requested_at
      ? claim.eq('grading_requested_at', ca.grading_requested_at)
      : claim.is('grading_requested_at', null);
  }
  const { data: claimed, error } = await claim.select('id');

  if (error) {
    // Columns missing (migration not yet applied): keep the previous behaviour.
    console.error('grading claim failed, invoking directly:', error.message);
    if (gradeable) invokeGradeAssessment(ca.id);
    return null;
  }
  if (!claimed?.length) return ca.grading_status ?? nextStatus;
  if (gradeable) invokeGradeAssessment(ca.id);
  return nextStatus;
}

async function notifyStaffOnAssessmentComplete(
  supabaseAdmin: AdminClient,
  candidateAssessmentId: string,
  gradingPending: boolean,
): Promise<void> {
  // Notify once per attempt, however many times submit/notify is called.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('candidate_assessments')
    .update({ staff_notified_at: new Date().toISOString() })
    .eq('id', candidateAssessmentId)
    .is('staff_notified_at', null)
    .select('id');
  if (!claimError && !claimed?.length) return;
  if (claimError) console.error('staff notify claim failed, notifying anyway:', claimError.message);

  const { data: row } = await supabaseAdmin
    .from('candidate_assessments')
    .select(`
      id, passed, percentage, job_id, candidate_id,
      candidate:candidates(id, name, email, job_id),
      assessment:assessments(title)
    `)
    .eq('id', candidateAssessmentId)
    .maybeSingle();

  if (!row) return;

  const candidate = Array.isArray(row.candidate) ? row.candidate[0] : row.candidate;
  const assessment = Array.isArray(row.assessment) ? row.assessment[0] : row.assessment;
  const jobId = row.job_id ?? (candidate as { job_id?: string } | null)?.job_id ?? null;
  if (!jobId) return;

  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('assessment_config')
    .eq('id', jobId)
    .maybeSingle();

  const config = parseAssessmentConfig(job?.assessment_config);
  if (!config.notify_recruiter_on_complete) return;

  const candidateName = (candidate as { name?: string } | null)?.name ?? 'Candidate';
  const assessmentTitle = (assessment as { title?: string } | null)?.title ?? 'Assessment';
  // The score is not final until AI grading finishes, so do not report 0% / "did not pass".
  const passedLabel = gradingPending ? 'Submitted, grading in progress' : row.passed ? 'Passed' : 'Did not pass';
  const scorePart = !gradingPending && row.percentage != null ? ` (${Math.round(row.percentage)}%)` : '';
  const link = `/evaluations?candidate=${row.candidate_id}`;

  const { data: recruiters } = await supabaseAdmin
    .from('job_recruiters')
    .select('recruiter_user_id')
    .eq('job_id', jobId);

  const recruiterIds = [...new Set((recruiters ?? []).map((r) => r.recruiter_user_id).filter(Boolean))];
  const { data: profiles } = recruiterIds.length
    ? await supabaseAdmin.from('profiles').select('user_id, email, full_name').in('user_id', recruiterIds)
    : { data: [] as { user_id: string; email: string; full_name: string }[] };

  const emailByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p.email]));

  const notifiedUsers = new Set<string>();
  for (const userId of recruiterIds) {
    if (notifiedUsers.has(userId)) continue;
    notifiedUsers.add(userId);

    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type: 'assessment_completed',
      title: 'Assessment Completed',
      message: `${candidateName} completed ${assessmentTitle}: ${passedLabel}${scorePart}`.slice(0, 120),
      link,
    });

    const email = emailByUserId.get(userId);
    if (email && (await shouldSendEmail(supabaseAdmin, "assignment_completed"))) {
      const branding = await getEmailBranding(supabaseAdmin);
      const viewUrl = buildAppLink(branding, link);
      const candidateProfileUrl = row.candidate_id
        ? buildAppLink(branding, buildCandidateDrawerPath(row.candidate_id))
        : null;
      const emailContent = buildStaffAssessmentCompletedEmail(branding, {
        candidateName,
        assessmentTitle,
        passedLabel,
        scorePart,
        viewUrl,
        candidateProfileUrl,
      });
      await sendTransactionalEmail({
        supabase: supabaseAdmin,
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        templateType: "assignment_completed",
      });
    }
  }
}

/** Queue grading, then notify staff. Both steps run at most once per attempt. */
async function afterCompletion(
  supabaseAdmin: AdminClient,
  ca: { id: string; assessment_id: string; grading_status: GradingStatus; grading_requested_at: string | null },
): Promise<GradingStatus> {
  let gradingStatus: GradingStatus = ca.grading_status;
  try {
    gradingStatus = await queueGrading(supabaseAdmin, ca);
  } catch (err) {
    console.error('Failed to queue grading:', err);
  }
  try {
    await notifyStaffOnAssessmentComplete(
      supabaseAdmin,
      ca.id,
      gradingStatus === 'queued' || gradingStatus === 'grading',
    );
  } catch (notifyError) {
    console.error('Failed to notify staff on assessment complete:', notifyError);
  }
  return gradingStatus;
}

/**
 * Marks an in-progress attempt completed. The status filter makes it a no-op
 * when another request already completed it. Returns true when this call did.
 */
async function completeAttempt(
  supabaseAdmin: AdminClient,
  caId: string,
  integrityLog: unknown,
  reason: string | null,
): Promise<boolean> {
  const completedAt = new Date().toISOString();
  const update: Record<string, unknown> = { status: 'completed', completed_at: completedAt };
  if (reason) {
    const log = Array.isArray(integrityLog) ? integrityLog : [];
    update.integrity_log = [...log, { type: reason, timestamp: completedAt }];
  }
  const { data, error } = await supabaseAdmin
    .from('candidate_assessments')
    .update(update)
    .eq('id', caId)
    .eq('status', 'in_progress')
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function saveOrUpdateResponse(
  supabaseAdmin: AdminClient,
  caId: string,
  questionId: string,
  response: unknown,
  timeSpent: unknown,
): Promise<{ error: unknown }> {
  const { data: existing } = await supabaseAdmin
    .from('candidate_responses')
    .select('id')
    .eq('candidate_assessment_id', caId)
    .eq('question_id', questionId)
    .maybeSingle();

  const patch: Record<string, unknown> = { response };
  if (typeof timeSpent === 'number') patch.time_spent_seconds = timeSpent;

  if (existing) {
    const { error } = await supabaseAdmin.from('candidate_responses').update(patch).eq('id', existing.id);
    return { error };
  }
  const { error } = await supabaseAdmin
    .from('candidate_responses')
    .insert({ candidate_assessment_id: caId, question_id: questionId, ...patch });
  return { error };
}

serveWithCors(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: CandidatePortalRequest = await req.json();
    const { action, access_token, data } = body;

    if (!access_token) {
      return json({ error: 'Access token is required' }, 401);
    }

    // Validate access token and get candidate assessment
    const { data: caData, error: caError } = await supabaseAdmin
      .from('candidate_assessments')
      .select(`
        *,
        candidate:candidates(id, name, email),
        assessment:assessments(
          id, title, description, duration_minutes, settings, passing_score
        )
      `)
      .eq('access_token', access_token)
      .maybeSingle();

    if (caError) {
      console.error('Database error:', caError);
      return json({ error: 'Database error' }, 500);
    }

    if (!caData) {
      return json({ error: 'Invalid or expired access token' }, 401);
    }

    // Safely extract the candidate and assessment from the joined result
    // Supabase returns joined data as object for single relations, or array for multi
    const rawCandidate = caData.candidate as unknown;
    const rawAssessment = caData.assessment as unknown;

    const candidate = Array.isArray(rawCandidate) ? rawCandidate[0] ?? null : rawCandidate ?? null;
    const assessment = Array.isArray(rawAssessment) ? rawAssessment[0] ?? null : rawAssessment ?? null;

    const ca = {
      id: caData.id as string,
      status: caData.status as string,
      started_at: caData.started_at as string | null,
      completed_at: caData.completed_at as string | null,
      deadline: caData.deadline as string | null,
      token_expires_at: (caData.token_expires_at ?? null) as string | null,
      grading_status: (caData.grading_status ?? null) as GradingStatus,
      grading_requested_at: (caData.grading_requested_at ?? null) as string | null,
      total_score: caData.total_score,
      percentage: caData.percentage,
      passed: caData.passed,
      integrity_log: caData.integrity_log,
      candidate_id: caData.candidate_id as string,
      assessment_id: caData.assessment_id as string,
      candidate: candidate as { id: string; name: string; email: string } | null,
      assessment: assessment as { id: string; title: string; description: string | null; duration_minutes: number; settings: Record<string, unknown>; passing_score: number } | null,
    };
    const isFinished = ca.status === 'completed' || ca.status === 'evaluated';
    const now = new Date();

    // Expired link. Completed attempts may still notify staff (the signed-in
    // dashboard path completes via RLS and then calls notify-staff-complete).
    if (isTokenExpired(ca.token_expires_at, now) && !(action === 'notify-staff-complete' && isFinished)) {
      return json({ error: 'This assessment link has expired', code: 'link_expired' }, 401);
    }

    // Not started before the deadline: the attempt is expired. Only validate
    // reports it (so the portal can show the expired screen); nothing else runs.
    if (ca.deadline && new Date(ca.deadline) < now && ca.status === 'invited') {
      if (action === 'validate') {
        return json({ success: true, data: { ...publicView(ca), status: 'expired' } });
      }
      return json({ error: 'The deadline for this assessment has passed', code: 'expired' }, 400);
    }

    const policy = await loadLinkPolicy(supabaseAdmin);
    const timeLimit = attemptTimeLimit(
      { startedAt: ca.started_at, durationMinutes: ca.assessment?.duration_minutes, deadline: ca.deadline },
      policy.time_limit_grace_seconds,
    );

    // Server-side time limit: an in-progress attempt past its limit is
    // submitted with whatever was saved, whichever action arrives first.
    let autoSubmitted = false;
    if (ca.status === 'in_progress' && isPastTimeLimit(timeLimit, now)) {
      autoSubmitted = await completeAttempt(supabaseAdmin, ca.id, ca.integrity_log, 'auto_submit_time_limit');
      ca.status = 'completed';
      ca.completed_at = ca.completed_at ?? now.toISOString();
      ca.grading_status = await afterCompletion(supabaseAdmin, ca);
    }

    switch (action) {
      case 'validate': {
        // Get sections and questions WITHOUT correct answers
        const { data: sections, error: sectionsError } = await supabaseAdmin
          .from('assessment_sections')
          .select(`
            id, title, description, order_index, weightage,
            questions(
              id, question_text, type, marks, order_index, options,
              coding_language, coding_starter_code, subjective_max_words, subjective_rubric, file_config, section_id
            )
          `)
          .eq('assessment_id', ca.assessment_id)
          .order('order_index');

        if (sectionsError) {
          console.error('Sections error:', sectionsError);
          return json({ error: 'Failed to fetch assessment data' }, 500);
        }

        // Filter questions to remove hidden test cases and any answer hints
        const safeSections = (sections || []).map(section => ({
          ...section,
          questions: (section.questions || []).map((q: Record<string, unknown>) => {
            const safeQuestion: Record<string, unknown> = {
              id: q.id,
              question_text: q.question_text,
              type: q.type,
              marks: q.marks,
              order_index: q.order_index,
              section_id: q.section_id,
              coding_language: q.coding_language,
              coding_starter_code: q.coding_starter_code,
              subjective_max_words: q.subjective_max_words,
            };

            // For MCQ, include options but strip any is_correct flags
            if (q.type === 'mcq' && Array.isArray(q.options)) {
              safeQuestion.options = (q.options as Array<Record<string, unknown>>).map(opt => ({
                id: opt.id,
                text: opt.text,
              }));
            }

            // For coding, we intentionally don't include test cases here
            // They will be sent to execute-code function which handles scoring

            if (q.type === 'file_upload') {
              safeQuestion.file_config = parseFileConfig(q.file_config);
              // Rubric is staff-only — do not expose to candidates
            }

            return safeQuestion;
          }),
        }));

        return json({
          success: true,
          data: {
            ...publicView(ca),
            time_limit_at: timeLimit?.toISOString() ?? null,
            auto_submitted: autoSubmitted,
            assessment: {
              ...ca.assessment,
              sections: safeSections.sort((a, b) => a.order_index - b.order_index),
            },
          },
        });
      }

      case 'start': {
        if (ca.status !== 'invited') {
          return json({ error: 'Assessment already started or completed' }, 400);
        }

        const consentGiven = data?.consent_given === true;
        const consentSource = (data?.consent_source as string) || 'exam_portal_magic_link';
        if (!consentGiven) {
          return json({ error: 'Consent is required before starting the assessment' }, 400);
        }

        const startedAt = new Date().toISOString();
        const { error: updateError } = await supabaseAdmin
          .from('candidate_assessments')
          .update({
            status: 'in_progress',
            started_at: startedAt,
            consent_given: true,
            consent_given_at: startedAt,
            consent_source: consentSource,
          })
          .eq('id', ca.id)
          .eq('status', 'invited');

        if (updateError) {
          console.error('Update error:', updateError);
          return json({ error: 'Failed to start assessment' }, 500);
        }

        const limit = attemptTimeLimit(
          { startedAt, durationMinutes: ca.assessment?.duration_minutes, deadline: ca.deadline },
          policy.time_limit_grace_seconds,
        );
        return json({ success: true, data: { started_at: startedAt, time_limit_at: limit?.toISOString() ?? null } });
      }

      case 'get-responses': {
        const { data: responses, error: respError } = await supabaseAdmin
          .from('candidate_responses')
          .select('id, question_id, response, time_spent_seconds')
          .eq('candidate_assessment_id', ca.id);

        if (respError) {
          console.error('Responses error:', respError);
          return json({ error: 'Failed to fetch responses' }, 500);
        }

        return json({ success: true, data: responses });
      }

      case 'save-response': {
        const gate = gateAnswerWrite(autoSubmitted ? 'in_progress' : ca.status, timeLimit, now);
        if (!gate.allowed) {
          return json({ error: gate.error, code: gate.code }, gate.status);
        }

        const { question_id, response, time_spent } = data || {};

        if (!question_id || typeof question_id !== 'string') {
          return json({ error: 'Question ID is required' }, 400);
        }

        const { data: questionData, error: qError } = await supabaseAdmin
          .from('questions')
          .select(QUESTION_SELECT)
          .eq('id', question_id)
          .maybeSingle();

        if (qError) {
          return json({ error: 'Invalid question for this assessment' }, 400);
        }

        // Client-supplied scores are ignored; MCQ scoring is a DB trigger, others via grade-assessment.
        const checked = sanitizeResponseForQuestion(
          questionData as PortalQuestionRow | null,
          { candidateAssessmentId: ca.id, assessmentId: ca.assessment_id, questionId: question_id },
          response,
        );
        if (!checked.ok) {
          return json({ error: checked.error }, 400);
        }

        const { error: saveError } = await saveOrUpdateResponse(supabaseAdmin, ca.id, question_id, checked.response, time_spent);
        if (saveError) {
          console.error('Save response error:', saveError);
          return json({ error: 'Failed to save response' }, 500);
        }

        return json({ success: true });
      }

      case 'create-file-upload': {
        const gate = gateAnswerWrite(autoSubmitted ? 'in_progress' : ca.status, timeLimit, now);
        if (!gate.allowed) {
          return json({ error: gate.error, code: gate.code }, gate.status);
        }

        const question_id = data?.question_id as string | undefined;
        const file_name = (data?.file_name as string | undefined) || 'upload';
        const mime_type = data?.mime_type as string | undefined;
        const file_size = data?.file_size as number | undefined;

        if (!question_id || !mime_type || typeof file_size !== 'number') {
          return json({ error: 'question_id, mime_type, and file_size are required' }, 400);
        }

        const { data: questionData, error: qError } = await supabaseAdmin
          .from('questions')
          .select(QUESTION_SELECT)
          .eq('id', question_id)
          .maybeSingle();

        if (qError || !questionData || questionData.type !== 'file_upload') {
          return json({ error: 'Invalid file upload question' }, 400);
        }

        if (getSectionAssessmentId(questionData.section) !== ca.assessment_id) {
          return json({ error: 'Invalid question for this assessment' }, 400);
        }

        const cfg = parseFileConfig(questionData.file_config);
        if (!cfg.allow_file) {
          return json({ error: 'File upload is not allowed for this question' }, 400);
        }
        if (!cfg.allowed_mime_types.includes(mime_type) || !ASSESSMENT_FILE_MIMES.has(mime_type)) {
          return json({ error: 'Only images (JPEG, PNG, GIF, WebP) and PDF are allowed' }, 400);
        }
        if (file_size > cfg.max_file_bytes) {
          return json({ error: 'File exceeds the 10 MB limit. Please share a Google Drive link instead.' }, 400);
        }

        const safeName = sanitizeFileName(file_name);
        const path = `${ca.id}/${question_id}/${crypto.randomUUID()}_${safeName}`;

        const { data: signed, error: signError } = await supabaseAdmin.storage
          .from('assessment-artifacts')
          .createSignedUploadUrl(path);

        if (signError || !signed) {
          console.error('Signed upload URL error:', signError);
          return json({ error: 'Failed to create upload URL' }, 500);
        }

        // Return path + token only — never a public URL
        return json({
          success: true,
          data: {
            path: signed.path ?? path,
            token: signed.token,
            // Store these so the client can write response.file metadata after upload
            name: file_name,
            mime: mime_type,
            size: file_size,
          },
        });
      }

      case 'submit': {
        if (isFinished || autoSubmitted) {
          const { data: finished } = await supabaseAdmin
            .from('candidate_assessments')
            .select('percentage, passed')
            .eq('id', ca.id)
            .single();
          const pending = ca.grading_status === 'queued' || ca.grading_status === 'grading';
          return json({
            success: true,
            data: {
              percentage: pending ? null : finished?.percentage ?? ca.percentage,
              passed: pending ? null : finished?.passed ?? ca.passed,
              grading_pending: pending,
              auto_submitted: autoSubmitted,
            },
          });
        }

        if (ca.status !== 'in_progress') {
          return json({ error: 'Assessment not in progress' }, 400);
        }

        const didComplete = await completeAttempt(supabaseAdmin, ca.id, ca.integrity_log, null);
        if (!didComplete) {
          return json({ error: 'Failed to submit assessment' }, 409);
        }

        // The trigger calculates the MCQ score; queue AI grading for the rest.
        const gradingStatus = await afterCompletion(supabaseAdmin, ca);
        const pending = gradingStatus === 'queued' || gradingStatus === 'grading';

        const { data: updated } = await supabaseAdmin
          .from('candidate_assessments')
          .select('percentage, passed')
          .eq('id', ca.id)
          .single();

        return json({
          success: true,
          data: {
            percentage: pending ? null : updated?.percentage,
            passed: pending ? null : updated?.passed,
            grading_pending: pending,
          },
        });
      }

      case 'log-integrity': {
        if (isFinished || autoSubmitted) {
          return json({ error: 'This assessment has already been submitted', code: 'already_submitted' }, 409);
        }

        const { event } = data || {};

        if (!event || typeof event !== 'object' || Array.isArray(event)) {
          return json({ error: 'Event data is required' }, 400);
        }

        // Get current log
        const { data: current } = await supabaseAdmin
          .from('candidate_assessments')
          .select('integrity_log')
          .eq('id', ca.id)
          .single();

        const currentLog = Array.isArray(current?.integrity_log) ? current.integrity_log : [];
        const updatedLog = [...currentLog, event];

        const { error: updateError } = await supabaseAdmin
          .from('candidate_assessments')
          .update({ integrity_log: updatedLog })
          .eq('id', ca.id);

        if (updateError) {
          console.error('Log integrity error:', updateError);
          return json({ error: 'Failed to log event' }, 500);
        }

        return json({ success: true });
      }

      case 'auto-complete': {
        // Called via sendBeacon when candidate closes browser or as fallback
        // Only auto-complete if still in_progress
        if (ca.status !== 'in_progress') {
          return json({ success: true, message: 'Assessment already completed', auto_submitted: autoSubmitted });
        }

        // Save pending beacon answers with the same checks as save-response.
        const beaconResponses = (data?.responses || {}) as Record<string, unknown>;
        const entries = Object.entries(beaconResponses).filter(
          ([, response]) => response !== null && response !== undefined && response !== '',
        );
        let saved = 0;
        let rejected = 0;
        if (entries.length) {
          const { data: questionRows } = await supabaseAdmin
            .from('questions')
            .select(QUESTION_SELECT)
            .in('id', entries.map(([id]) => id));
          const byId = new Map(((questionRows ?? []) as PortalQuestionRow[]).map((q) => [q.id, q]));

          for (const [questionId, response] of entries) {
            const checked = sanitizeResponseForQuestion(
              byId.get(questionId),
              { candidateAssessmentId: ca.id, assessmentId: ca.assessment_id, questionId },
              response,
            );
            if (!checked.ok) {
              rejected++;
              continue;
            }
            const { error: saveError } = await saveOrUpdateResponse(supabaseAdmin, ca.id, questionId, checked.response, undefined);
            if (saveError) {
              console.error('Auto-complete save error:', saveError);
              rejected++;
            } else {
              saved++;
            }
          }
        }

        const { data: currentLog } = await supabaseAdmin
          .from('candidate_assessments')
          .select('integrity_log')
          .eq('id', ca.id)
          .single();

        const didComplete = await completeAttempt(
          supabaseAdmin,
          ca.id,
          currentLog?.integrity_log,
          'auto_complete_browser_close',
        );
        if (didComplete) {
          await afterCompletion(supabaseAdmin, ca);
        }

        return json({ success: true, saved, rejected });
      }

      case 'notify-staff-complete': {
        // Session-auth applicants complete via RLS and call this afterwards; token submit notifies inline.
        const candidateAssessmentId = data?.candidate_assessment_id;
        if (!candidateAssessmentId) {
          return json({ error: 'candidate_assessment_id required' }, 400);
        }

        // Same 404 whether the id is unknown or belongs to another token
        if (candidateAssessmentId !== ca.id) {
          return json({ error: 'Assessment not found' }, 404);
        }

        if (!isFinished) {
          return json({ error: 'Assessment not completed' }, 400);
        }

        // Same grading trigger as the link submit; both steps are idempotent.
        const gradingStatus = await afterCompletion(supabaseAdmin, ca);

        return json({
          success: true,
          data: { grading_pending: gradingStatus === 'queued' || gradingStatus === 'grading' },
        });
      }

      default:
        return json({ error: 'Invalid action' }, 400);
    }
  } catch (error) {
    return errorResponse('candidate-portal', error, corsHeaders);
  }
});

/** Attempt fields safe to return to the candidate (no token, no internal timestamps). */
function publicView(ca: {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  total_score: unknown;
  percentage: unknown;
  passed: unknown;
  integrity_log: unknown;
  grading_status: GradingStatus;
  candidate: unknown;
  assessment: unknown;
}) {
  const pending = ca.grading_status === 'queued' || ca.grading_status === 'grading';
  return {
    id: ca.id,
    status: ca.status,
    started_at: ca.started_at,
    completed_at: ca.completed_at,
    deadline: ca.deadline,
    total_score: pending ? null : ca.total_score,
    percentage: pending ? null : ca.percentage,
    passed: pending ? null : ca.passed,
    grading_pending: pending,
    integrity_log: Array.isArray(ca.integrity_log) ? ca.integrity_log : [],
    candidate: ca.candidate,
    assessment: ca.assessment,
  };
}
