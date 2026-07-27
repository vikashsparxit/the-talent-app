import { supabase } from '@/integrations/supabase/client';
import type { InterviewMode } from '@/hooks/useInterviewPipeline';
import { triggerInterviewKitGeneration } from '@/lib/interviewKit';
import { notifyStaffEmail } from '@/lib/staffEmail';

export interface InterviewPanelist {
  user_id: string;
  full_name: string;
  email: string;
}

export interface ScheduleInterviewData {
  scheduled_at: string | null;
  interviewer_user_ids: string[];
  interview_mode: InterviewMode;
  meeting_link?: string;
}

export interface InterviewSessionBase {
  candidate_id: string;
  job_interview_stage_id: string;
  stage_name_snapshot?: string;
  round?: number;
}

type PostgresError = { code?: string; message?: string };

/** User-facing message for schedule/reschedule failures (incl. unique-constraint 409). */
export function formatInterviewScheduleError(err: unknown): string {
  const e = err as PostgresError;
  if (e?.code === '23505') {
    if (
      e.message?.includes('candidate_interviews_candidate_stage_interviewer_unique_idx') ||
      e.message?.includes('candidate_stage_interviewer')
    ) {
      return 'An interview already exists for this candidate, stage, and panelist. Reschedule the existing interview instead.';
    }
    if (e.message?.includes('candidate_interviews_candidate_stage_round_key')) {
      return 'This candidate already has an interview for this stage and round.';
    }
    return 'An interview record already exists for this candidate at this stage.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Failed to schedule interview';
}

/** First panelist is stored on candidate_interviews.interviewer_user_id for backward compat. */
export function primaryPanelistId(userIds: string[]): string {
  return userIds[0];
}

export function formatPanelistNames(
  panelists: Array<{ full_name?: string | null }>,
  maxShown = 2,
): string {
  if (!panelists.length) return '';
  const names = panelists.map(p => (p.full_name || '').trim() || 'Unknown');
  if (names.length <= maxShown) return names.join(', ');
  return `${names.slice(0, maxShown).join(', ')} +${names.length - maxShown}`;
}

export async function syncInterviewPanelists(
  interviewId: string,
  userIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('candidate_interview_panelists')
    .delete()
    .eq('candidate_interview_id', interviewId);
  if (deleteError) throw deleteError;

  if (userIds.length === 0) return;

  const { error: insertError } = await supabase
    .from('candidate_interview_panelists')
    .insert(
      userIds.map(interviewer_user_id => ({
        candidate_interview_id: interviewId,
        interviewer_user_id,
      })),
    );
  if (insertError) throw insertError;
}

async function updateInterviewSessionRow(
  interviewId: string,
  panelistId: string,
  data: ScheduleInterviewData,
): Promise<void> {
  const { error } = await supabase
    .from('candidate_interviews')
    .update({
      scheduled_at: data.scheduled_at,
      interviewer_user_id: panelistId,
      interview_mode: data.interview_mode,
      meeting_link: data.meeting_link ?? null,
    })
    .eq('id', interviewId);
  if (error) throw error;
}

/** Insert a new interview session row (preserves prior completed sessions). */
export async function insertInterviewSession(
  base: InterviewSessionBase,
  panelistId: string,
  data: ScheduleInterviewData,
): Promise<string> {
  const { data: created, error } = await supabase
    .from('candidate_interviews')
    .insert({
      candidate_id: base.candidate_id,
      job_interview_stage_id: base.job_interview_stage_id,
      stage_name_snapshot: base.stage_name_snapshot ?? null,
      interviewer_user_id: panelistId,
      scheduled_at: data.scheduled_at,
      interview_mode: data.interview_mode,
      meeting_link: data.meeting_link ?? null,
      round: base.round ?? 1,
    })
    .select('id')
    .single();
  if (error) throw error;
  await syncInterviewPanelists(created.id, [panelistId]);
  triggerInterviewKitGeneration(created.id);
  notifyStaffEmail('interview_scheduled', created.id);
  return created.id;
}

/** After a verdict, each panelist gets their own session row so feedback is not overwritten. */
export async function insertInterviewSessionsAfterVerdict(
  base: InterviewSessionBase,
  data: ScheduleInterviewData,
): Promise<string[]> {
  const ids: string[] = [];
  for (const panelistId of data.interviewer_user_ids) {
    const id = await insertInterviewSession(base, panelistId, data);
    ids.push(id);
  }
  return ids;
}

export async function applyInterviewSchedule(
  interviewId: string,
  data: ScheduleInterviewData,
): Promise<void> {
  const panelistIds = data.interviewer_user_ids;
  if (panelistIds.length === 0) throw new Error('At least one panelist required');

  const { data: base, error: fetchErr } = await supabase
    .from('candidate_interviews')
    .select(`
      id,
      candidate_id,
      job_interview_stage_id,
      stage_name_snapshot,
      round,
      verdict,
      job_interview_stage:job_interview_stages!candidate_interviews_job_interview_stage_id_fkey(stage_name)
    `)
    .eq('id', interviewId)
    .single();
  if (fetchErr) throw fetchErr;

  if (base.verdict) {
    throw new Error('Cannot reschedule a completed interview; schedule a new session instead.');
  }

  const sessionBase: InterviewSessionBase = {
    candidate_id: base.candidate_id,
    job_interview_stage_id: base.job_interview_stage_id,
    stage_name_snapshot:
      base.stage_name_snapshot
      ?? (base.job_interview_stage as { stage_name?: string } | null)?.stage_name
      ?? undefined,
    round: base.round ?? 1,
  };

  if (panelistIds.length === 1) {
    await updateInterviewSessionRow(interviewId, panelistIds[0], data);
    await syncInterviewPanelists(interviewId, panelistIds);
    triggerInterviewKitGeneration(interviewId);
    notifyStaffEmail('interview_scheduled', interviewId);
    return;
  }

  // Multiple panelists: one row per person so each can submit independent feedback.
  await updateInterviewSessionRow(interviewId, panelistIds[0], data);
  await syncInterviewPanelists(interviewId, [panelistIds[0]]);
  triggerInterviewKitGeneration(interviewId);
  notifyStaffEmail('interview_scheduled', interviewId);

  for (let i = 1; i < panelistIds.length; i++) {
    await insertInterviewSession(sessionBase, panelistIds[i], data);
  }
}

export async function moveCandidateToStage(
  interview: {
    id: string;
    candidate_id: string;
    job_interview_stage_id: string;
    verdict?: string | null;
    round?: number | null;
  },
  targetStage: { id: string; stage_name: string },
  advancedBy: string,
): Promise<void> {
  if (interview.verdict) {
    const { error } = await supabase.from('candidate_interviews').insert({
      candidate_id: interview.candidate_id,
      job_interview_stage_id: targetStage.id,
      stage_name_snapshot: targetStage.stage_name,
      round: interview.round ?? 1,
      advanced_by: advancedBy,
      advanced_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('candidate_interviews')
    .update({
      job_interview_stage_id: targetStage.id,
      advanced_by: advancedBy,
      advanced_at: new Date().toISOString(),
    })
    .eq('id', interview.id);
  if (error) throw error;
}

export async function fetchPanelInterviewIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('candidate_interview_panelists')
    .select('candidate_interview_id')
    .eq('interviewer_user_id', userId);
  if (error) throw error;
  return (data ?? []).map(row => row.candidate_interview_id);
}
