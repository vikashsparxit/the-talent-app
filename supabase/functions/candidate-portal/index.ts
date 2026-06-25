import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { sendTransactionalEmail } from "../_shared/email.ts";
import { buildAppLink, buildCandidateDrawerPath, getEmailBranding } from "../_shared/emailLayout.ts";
import { shouldSendEmail } from "../_shared/emailNotificationSettings.ts";
import { buildStaffAssessmentCompletedEmail } from "../_shared/transactionalEmailTemplates.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-access-token',
};

interface CandidatePortalRequest {
  action: 'validate' | 'start' | 'save-response' | 'submit' | 'log-integrity' | 'get-responses' | 'auto-complete' | 'notify-staff-complete';
  access_token?: string;
  data?: Record<string, unknown>;
}

function getSectionAssessmentId(section: unknown): string | null {
  if (!section) return null;
  if (Array.isArray(section)) {
    const first = section[0] as { assessment_id?: string } | undefined;
    return first?.assessment_id ?? null;
  }
  if (typeof section === 'object' && 'assessment_id' in section) {
    return (section as { assessment_id: string }).assessment_id;
  }
  return null;
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

async function notifyStaffOnAssessmentComplete(
  supabaseAdmin: ReturnType<typeof createClient>,
  candidateAssessmentId: string,
): Promise<void> {
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
  const passedLabel = row.passed ? 'Passed' : 'Did not pass';
  const scorePart = row.percentage != null ? ` (${Math.round(row.percentage)}%)` : '';
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

serve(async (req) => {
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

    if (action === 'notify-staff-complete') {
      const candidateAssessmentId = data?.candidate_assessment_id as string | undefined;
      if (!candidateAssessmentId) {
        return new Response(JSON.stringify({ error: 'candidate_assessment_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await notifyStaffOnAssessmentComplete(supabaseAdmin, candidateAssessmentId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!access_token) {
      return new Response(
        JSON.stringify({ error: 'Access token is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate access token and get candidate assessment
    const { data: caData, error: caError } = await supabaseAdmin
      .from('candidate_assessments')
      .select(`
        id, status, started_at, completed_at, deadline, total_score, percentage, passed, access_token,
        candidate_id, assessment_id, job_id, consent_given, integrity_log,
        candidate:candidates(id, name, email),
        assessment:assessments(
          id, title, description, duration_minutes, settings, passing_score
        )
      `)
      .eq('access_token', access_token)
      .maybeSingle();

    if (caError) {
      console.error('Database error:', caError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!caData) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired access token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Safely extract the candidate and assessment from the joined result
    // Supabase returns joined data as object for single relations, or array for multi
    const rawCandidate = caData.candidate as unknown;
    const rawAssessment = caData.assessment as unknown;
    
    const candidate = Array.isArray(rawCandidate) ? rawCandidate[0] ?? null : rawCandidate ?? null;
    const assessment = Array.isArray(rawAssessment) ? rawAssessment[0] ?? null : rawAssessment ?? null;
    
    const ca = {
      id: caData.id,
      status: caData.status,
      started_at: caData.started_at,
      completed_at: caData.completed_at,
      deadline: caData.deadline,
      total_score: caData.total_score,
      percentage: caData.percentage,
      passed: caData.passed,
      integrity_log: caData.integrity_log,
      candidate_id: caData.candidate_id,
      assessment_id: caData.assessment_id,
      candidate: candidate as { id: string; name: string; email: string } | null,
      assessment: assessment as { id: string; title: string; description: string | null; duration_minutes: number; settings: Record<string, unknown>; passing_score: number } | null,
    };

    // Check deadline
    if (ca.deadline && new Date(ca.deadline) < new Date() && ca.status === 'invited') {
      return new Response(
        JSON.stringify({ 
          success: true,
          data: { ...ca, status: 'expired' }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
              coding_language, coding_starter_code, subjective_max_words, section_id
            )
          `)
          .eq('assessment_id', ca.assessment_id)
          .order('order_index');

        if (sectionsError) {
          console.error('Sections error:', sectionsError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch assessment data' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
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

            return safeQuestion;
          }),
        }));

        // Build response without access_token
        const responseData = {
          id: ca.id,
          status: ca.status,
          started_at: ca.started_at,
          completed_at: ca.completed_at,
          deadline: ca.deadline,
          total_score: ca.total_score,
          percentage: ca.percentage,
          passed: ca.passed,
          integrity_log: Array.isArray(ca.integrity_log) ? ca.integrity_log : [],
          candidate: ca.candidate,
          assessment: {
            ...ca.assessment,
            sections: safeSections.sort((a, b) => a.order_index - b.order_index),
          },
        };

        return new Response(
          JSON.stringify({ success: true, data: responseData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'start': {
        if (ca.status !== 'invited') {
          return new Response(
            JSON.stringify({ error: 'Assessment already started or completed' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const consentGiven = data?.consent_given === true;
        const consentSource = (data?.consent_source as string) || 'exam_portal_magic_link';
        if (!consentGiven) {
          return new Response(
            JSON.stringify({ error: 'Consent is required before starting the assessment' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateError } = await supabaseAdmin
          .from('candidate_assessments')
          .update({
            status: 'in_progress',
            started_at: new Date().toISOString(),
            consent_given: true,
            consent_given_at: new Date().toISOString(),
            consent_source: consentSource,
          })
          .eq('id', ca.id);

        if (updateError) {
          console.error('Update error:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to start assessment' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get-responses': {
        const { data: responses, error: respError } = await supabaseAdmin
          .from('candidate_responses')
          .select('id, question_id, response, time_spent_seconds')
          .eq('candidate_assessment_id', ca.id);

        if (respError) {
          console.error('Responses error:', respError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch responses' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, data: responses }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'save-response': {
        if (ca.status === 'completed' || ca.status === 'evaluated') {
          return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (ca.status !== 'in_progress') {
          return new Response(
            JSON.stringify({ error: 'Assessment not in progress' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { question_id, response, time_spent, auto_score } = data || {};

        if (!question_id) {
          return new Response(
            JSON.stringify({ error: 'Question ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify question belongs to this assessment
        const { data: questionData, error: qError } = await supabaseAdmin
          .from('questions')
          .select('id, section:assessment_sections!inner(assessment_id)')
          .eq('id', question_id)
          .maybeSingle();

        if (qError || !questionData) {
          return new Response(
            JSON.stringify({ error: 'Invalid question for this assessment' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const sectionAssessmentId = getSectionAssessmentId(questionData.section);
        
        if (sectionAssessmentId !== ca.assessment_id) {
          return new Response(
            JSON.stringify({ error: 'Invalid question for this assessment' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if response exists
        const { data: existing } = await supabaseAdmin
          .from('candidate_responses')
          .select('id')
          .eq('candidate_assessment_id', ca.id)
          .eq('question_id', question_id)
          .maybeSingle();

        if (existing) {
          const { error: updateError } = await supabaseAdmin
            .from('candidate_responses')
            .update({
              response,
              time_spent_seconds: time_spent,
              auto_score: auto_score,
            })
            .eq('id', existing.id);

          if (updateError) {
            console.error('Update response error:', updateError);
            return new Response(
              JSON.stringify({ error: 'Failed to save response' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          const { error: insertError } = await supabaseAdmin
            .from('candidate_responses')
            .insert({
              candidate_assessment_id: ca.id,
              question_id,
              response,
              time_spent_seconds: time_spent,
              auto_score: auto_score,
            });

          if (insertError) {
            console.error('Insert response error:', insertError);
            return new Response(
              JSON.stringify({ error: 'Failed to save response' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'submit': {
        if (ca.status === 'completed' || ca.status === 'evaluated') {
          return new Response(
            JSON.stringify({
              success: true,
              data: { percentage: ca.percentage, passed: ca.passed },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (ca.status !== 'in_progress') {
          return new Response(
            JSON.stringify({ error: 'Assessment not in progress' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const completedAt = new Date().toISOString();

        // Update status to completed
        const { error: updateError } = await supabaseAdmin
          .from('candidate_assessments')
          .update({
            status: 'completed',
            completed_at: completedAt,
          })
          .eq('id', ca.id);

        if (updateError) {
          console.error('Submit error:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to submit assessment' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // The trigger will calculate the score automatically
        // Fetch updated data
        const { data: updated } = await supabaseAdmin
          .from('candidate_assessments')
          .select('percentage, passed')
          .eq('id', ca.id)
          .single();

        try {
          await notifyStaffOnAssessmentComplete(supabaseAdmin, ca.id);
        } catch (notifyError) {
          console.error('Failed to notify staff on assessment complete:', notifyError);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: { percentage: updated?.percentage, passed: updated?.passed } 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'log-integrity': {
        const { event } = data || {};

        if (!event) {
          return new Response(
            JSON.stringify({ error: 'Event data is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
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
          return new Response(
            JSON.stringify({ error: 'Failed to log event' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'auto-complete': {
        // Called via sendBeacon when candidate closes browser or as fallback
        // Only auto-complete if still in_progress
        if (ca.status !== 'in_progress') {
          return new Response(
            JSON.stringify({ success: true, message: 'Assessment already completed' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Save any pending responses sent with the beacon
        const beaconResponses = (data?.responses || {}) as Record<string, unknown>;
        for (const [questionId, response] of Object.entries(beaconResponses)) {
          if (response === null || response === undefined || response === '') continue;

          const { data: existing } = await supabaseAdmin
            .from('candidate_responses')
            .select('id')
            .eq('candidate_assessment_id', ca.id)
            .eq('question_id', questionId)
            .maybeSingle();

          if (existing) {
            await supabaseAdmin
              .from('candidate_responses')
              .update({ response })
              .eq('id', existing.id);
          } else {
            await supabaseAdmin
              .from('candidate_responses')
              .insert({
                candidate_assessment_id: ca.id,
                question_id: questionId,
                response,
              });
          }
        }

        // Log the auto-complete integrity event
        const { data: currentLog } = await supabaseAdmin
          .from('candidate_assessments')
          .select('integrity_log')
          .eq('id', ca.id)
          .single();

        const existingLog = Array.isArray(currentLog?.integrity_log) ? currentLog.integrity_log : [];
        const autoCompleteLog = [...existingLog, { type: 'auto_complete_browser_close', timestamp: new Date().toISOString() }];

        const autoCompleteTime = new Date().toISOString();

        // Mark as completed
        const { error: completeError } = await supabaseAdmin
          .from('candidate_assessments')
          .update({
            status: 'completed',
            completed_at: autoCompleteTime,
            integrity_log: autoCompleteLog,
          })
          .eq('id', ca.id);

        if (completeError) {
          console.error('Auto-complete error:', completeError);
          return new Response(
            JSON.stringify({ error: 'Failed to auto-complete assessment' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch updated scores (trigger calculates them)
        const { data: updatedAC } = await supabaseAdmin
          .from('candidate_assessments')
          .select('percentage, passed')
          .eq('id', ca.id)
          .single();

        try {
          await notifyStaffOnAssessmentComplete(supabaseAdmin, ca.id);
        } catch (notifyError) {
          console.error('Failed to notify staff on assessment complete:', notifyError);
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Handler error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
