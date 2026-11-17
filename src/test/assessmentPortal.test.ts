import { describe, it, expect } from 'vitest';
import {
  attemptTimeLimit,
  DEFAULT_LINK_POLICY,
  gateAnswerWrite,
  gradingClaimFilter,
  GRADING_REQUEUE_AFTER_MS,
  isPastTimeLimit,
  isTokenExpired,
  needsAiGrading,
  parseLinkPolicy,
  sanitizeResponseForQuestion,
  shouldRequeueGrading,
  type PortalQuestionRow,
} from '../../supabase/functions/_shared/assessmentPortal.ts';

const CA = 'ca-1';
const ASSESSMENT = 'assessment-1';
const ctx = (questionId: string) => ({ candidateAssessmentId: CA, assessmentId: ASSESSMENT, questionId });
const q = (over: Partial<PortalQuestionRow> = {}): PortalQuestionRow => ({
  id: 'q-1',
  type: 'subjective',
  file_config: null,
  section: { assessment_id: ASSESSMENT },
  ...over,
});

describe('link expiry (bug 2)', () => {
  const now = new Date('2026-10-11T12:00:00Z');

  it('treats a null expiry as never expiring, so links issued before expiry existed keep working', () => {
    expect(isTokenExpired(null, now)).toBe(false);
    expect(isTokenExpired(undefined, now)).toBe(false);
  });

  it('expires at and after token_expires_at', () => {
    expect(isTokenExpired('2026-10-11T11:59:59Z', now)).toBe(true);
    expect(isTokenExpired('2026-10-11T12:00:00Z', now)).toBe(true);
    expect(isTokenExpired('2026-10-11T12:00:01Z', now)).toBe(false);
  });

  it('reads the configurable policy and falls back to defaults on bad values', () => {
    expect(parseLinkPolicy(null)).toEqual(DEFAULT_LINK_POLICY);
    expect(parseLinkPolicy({ expiry_days_without_deadline: 3, time_limit_grace_seconds: 'x' })).toEqual({
      ...DEFAULT_LINK_POLICY,
      expiry_days_without_deadline: 3,
    });
    expect(parseLinkPolicy({ time_limit_grace_seconds: -5 }).time_limit_grace_seconds).toBe(
      DEFAULT_LINK_POLICY.time_limit_grace_seconds,
    );
  });
});

describe('server-side time limit (bug 3)', () => {
  const startedAt = '2026-10-11T10:00:00Z';

  it('ends at started_at + duration plus grace', () => {
    const limit = attemptTimeLimit({ startedAt, durationMinutes: 30, deadline: null }, 120);
    expect(limit?.toISOString()).toBe('2026-10-11T10:32:00.000Z');
  });

  it('ends at the deadline when that comes first', () => {
    const limit = attemptTimeLimit({ startedAt, durationMinutes: 90, deadline: '2026-10-11T10:15:00Z' }, 60);
    expect(limit?.toISOString()).toBe('2026-10-11T10:16:00.000Z');
  });

  it('has no limit without a duration or deadline', () => {
    expect(attemptTimeLimit({ startedAt, durationMinutes: 0, deadline: null })).toBeNull();
    expect(attemptTimeLimit({ startedAt: null, durationMinutes: 30, deadline: null })).toBeNull();
  });

  it('allows writes inside the grace window and blocks them after', () => {
    const limit = attemptTimeLimit({ startedAt, durationMinutes: 30, deadline: null }, 120);
    expect(gateAnswerWrite('in_progress', limit, new Date('2026-10-11T10:31:59Z'))).toEqual({ allowed: true });
    const late = gateAnswerWrite('in_progress', limit, new Date('2026-10-11T10:32:01Z'));
    expect(late).toMatchObject({ allowed: false, status: 409, code: 'time_limit_exceeded' });
    expect(isPastTimeLimit(limit, new Date('2026-10-11T10:32:01Z'))).toBe(true);
  });
});

describe('save after submit (bug 5)', () => {
  it('returns a clear already_submitted error instead of success', () => {
    for (const status of ['completed', 'evaluated']) {
      expect(gateAnswerWrite(status, null, new Date())).toEqual({
        allowed: false,
        status: 409,
        code: 'already_submitted',
        error: 'This assessment has already been submitted',
      });
    }
  });

  it('rejects writes before the attempt is started', () => {
    expect(gateAnswerWrite('invited', null, new Date())).toMatchObject({ allowed: false, code: 'not_started' });
  });
});

describe('answer validation shared by save-response and auto-complete (bug 4)', () => {
  it('rejects a question from another assessment', () => {
    const foreign = q({ section: { assessment_id: 'other' } });
    expect(sanitizeResponseForQuestion(foreign, ctx('q-1'), { text: 'x' })).toEqual({
      ok: false,
      error: 'Invalid question for this assessment',
    });
    expect(sanitizeResponseForQuestion(undefined, ctx('q-1'), { text: 'x' }).ok).toBe(false);
    expect(sanitizeResponseForQuestion(q({ id: 'q-2' }), ctx('q-1'), { text: 'x' }).ok).toBe(false);
  });

  it('accepts the section relation as an array too', () => {
    const row = q({ section: [{ assessment_id: ASSESSMENT }] });
    expect(sanitizeResponseForQuestion(row, ctx('q-1'), { text: 'ok' }).ok).toBe(true);
  });

  it('strips client-supplied score fields', () => {
    const result = sanitizeResponseForQuestion(q({ type: 'coding' }), ctx('q-1'), {
      code: 'print(1)',
      execution_result: { passed_count: 99 },
      auto_score: 10,
      final_score: 10,
      manual_score: 10,
    });
    expect(result).toEqual({ ok: true, response: { code: 'print(1)' } });
  });

  const fileQ = q({ id: 'f-1', type: 'file_upload', file_config: { allow_file: true, allow_link: true } });

  it('only accepts uploaded files under this attempt and question', () => {
    const good = { file: { path: `${CA}/f-1/abc_cv.pdf`, name: 'cv.pdf', mime: 'application/pdf', size: 1000 } };
    expect(sanitizeResponseForQuestion(fileQ, ctx('f-1'), good)).toEqual({
      ok: true,
      response: { mode: 'file', file: good.file },
    });
    const otherAttempt = { file: { path: `other-ca/f-1/x.pdf`, mime: 'application/pdf', size: 10 } };
    expect(sanitizeResponseForQuestion(fileQ, ctx('f-1'), otherAttempt)).toEqual({
      ok: false,
      error: 'Invalid uploaded file path',
    });
    const traversal = { file: { path: `${CA}/f-1/../../x.pdf` } };
    expect(sanitizeResponseForQuestion(fileQ, ctx('f-1'), traversal).ok).toBe(false);
  });

  it('enforces file type, size and Drive-only links', () => {
    const exe = { file: { path: `${CA}/f-1/x.exe`, mime: 'application/x-msdownload', size: 10 } };
    expect(sanitizeResponseForQuestion(fileQ, ctx('f-1'), exe)).toEqual({ ok: false, error: 'File type not allowed' });
    const big = { file: { path: `${CA}/f-1/x.pdf`, mime: 'application/pdf', size: 11 * 1024 * 1024 } };
    expect(sanitizeResponseForQuestion(fileQ, ctx('f-1'), big).ok).toBe(false);
    const evil = { link: { url: 'https://evil.example.com/file' } };
    expect(sanitizeResponseForQuestion(fileQ, ctx('f-1'), evil)).toEqual({
      ok: false,
      error: 'Only Google Drive / Docs share links are allowed',
    });
    const drive = { link: { url: ' https://drive.google.com/file/d/abc/view ', label: 'cv' }, auto_score: 5 };
    expect(sanitizeResponseForQuestion(fileQ, ctx('f-1'), drive)).toEqual({
      ok: true,
      response: { mode: 'link', link: { url: 'https://drive.google.com/file/d/abc/view', label: 'cv' } },
    });
  });

  it('respects a question that disallows links or files', () => {
    const fileOnly = q({ id: 'f-1', type: 'file_upload', file_config: { allow_file: true, allow_link: false } });
    expect(
      sanitizeResponseForQuestion(fileOnly, ctx('f-1'), { link: { url: 'https://drive.google.com/x' } }),
    ).toEqual({ ok: false, error: 'Drive links are not allowed for this question' });
    expect(sanitizeResponseForQuestion(fileOnly, ctx('f-1'), {}).ok).toBe(false);
  });
});

describe('grading runs once per attempt (bug 1)', () => {
  const now = new Date('2026-10-11T12:00:00Z');

  it('only needs AI grading when the assessment has non-MCQ questions', () => {
    expect(needsAiGrading(['mcq', 'mcq'])).toBe(false);
    expect(needsAiGrading(['mcq', 'subjective'])).toBe(true);
    expect(needsAiGrading(['coding'])).toBe(true);
    expect(needsAiGrading(['file_upload'])).toBe(true);
  });

  it('queues on the first submit/notify and not again on repeats', () => {
    expect(shouldRequeueGrading(null, null, now)).toBe(true);
    expect(shouldRequeueGrading('queued', now.toISOString(), now)).toBe(false);
    expect(shouldRequeueGrading('grading', null, now)).toBe(false);
    expect(shouldRequeueGrading('graded', null, now)).toBe(false);
    expect(shouldRequeueGrading('not_required', null, now)).toBe(false);
  });

  it('re-sends a queued request that looks lost', () => {
    const old = new Date(now.getTime() - GRADING_REQUEUE_AFTER_MS).toISOString();
    expect(shouldRequeueGrading('queued', old, now)).toBe(true);
  });

  it('claims a run only when no fresh run is in progress', () => {
    const filter = gradingClaimFilter(now);
    expect(filter).toContain('grading_status.is.null');
    expect(filter).toContain('grading_status.neq.grading');
    expect(filter).toContain('grading_started_at.lt.2026-10-11T11:45:00.000Z');
  });
});

describe('spoken answers are sanitised server-side', () => {
  const CA_ID = '11111111-1111-4111-8111-111111111111';
  const Q_ID = '22222222-2222-4222-8222-222222222222';
  const OTHER = '33333333-3333-4333-8333-333333333333';
  const spokenCtx = { candidateAssessmentId: CA_ID, assessmentId: ASSESSMENT, questionId: Q_ID };
  const spokenQ = q({ id: Q_ID, type: 'spoken', spoken_config: { max_seconds: 60, prep_seconds: 0, max_attempts: 2 } });
  const answer = (over: Record<string, unknown> = {}, file: Record<string, unknown> = {}) => ({
    mode: 'audio',
    file: { key: `spoken/${CA_ID}/${Q_ID}/1.webm`, mime: 'audio/webm', size: 4000, duration_seconds: 12.34, ...file },
    attempt: 1,
    transcript_status: 'pending',
    ...over,
  });

  it('stores only the fixed audio shape, with a pending transcript', () => {
    const r = sanitizeResponseForQuestion(spokenQ, spokenCtx, answer({
      transcript_status: 'done',
      transcript: 'forged transcript',
      auto_score: 10,
      extra: 'x',
    }, { name: 'evil.exe' }));
    expect(r).toEqual({
      ok: true,
      response: {
        mode: 'audio',
        file: { key: `spoken/${CA_ID}/${Q_ID}/1.webm`, mime: 'audio/webm', size: 4000, duration_seconds: 12.3 },
        attempt: 1,
        transcript_status: 'pending',
      },
    });
  });

  it('normalises a codecs-qualified MIME type and accepts Safari m4a', () => {
    expect(sanitizeResponseForQuestion(spokenQ, spokenCtx, answer({}, { mime: 'audio/webm;codecs=opus' })).ok).toBe(true);
    expect(sanitizeResponseForQuestion(spokenQ, spokenCtx, answer({ attempt: 2 }, {
      key: `spoken/${CA_ID}/${Q_ID}/2.m4a`,
      mime: 'audio/mp4',
    })).ok).toBe(true);
  });

  it('rejects keys outside spoken/<attempt>/<question>/', () => {
    const bad = [
      `spoken/${OTHER}/${Q_ID}/1.webm`,
      `spoken/${CA_ID}/${OTHER}/1.webm`,
      `recordings/${CA_ID}/${Q_ID}/1.webm`,
      `spoken/${CA_ID}/${Q_ID}/../../x/1.webm`,
      `spoken/${CA_ID}/${Q_ID}/1.webm/extra`,
      `spoken/${CA_ID}/${Q_ID}/0.webm`,
      `${CA_ID}/${Q_ID}/1.webm`,
    ];
    for (const key of bad) {
      expect(sanitizeResponseForQuestion(spokenQ, spokenCtx, answer({}, { key })), key).toEqual({
        ok: false,
        error: 'Invalid recording key',
      });
    }
  });

  it('checks attempt, type, size and duration against the question', () => {
    const check = (over: Record<string, unknown>, file: Record<string, unknown> = {}) =>
      sanitizeResponseForQuestion(spokenQ, spokenCtx, answer(over, file)).ok;
    expect(check({ attempt: 2 })).toBe(false); // key says attempt 1
    expect(check({ attempt: 3 }, { key: `spoken/${CA_ID}/${Q_ID}/3.webm` })).toBe(false); // max_attempts 2
    expect(check({}, { mime: 'video/webm' })).toBe(false);
    expect(check({}, { mime: 'audio/mp4' })).toBe(false); // .webm key
    expect(check({}, { size: 0 })).toBe(false);
    expect(check({}, { size: 16 * 1024 * 1024 })).toBe(false);
    expect(check({}, { duration_seconds: 66 })).toBe(false); // max_seconds 60 + slack
    expect(check({}, { duration_seconds: -1 })).toBe(false);
    expect(check({ mode: 'file' })).toBe(false);
    expect(sanitizeResponseForQuestion(spokenQ, spokenCtx, 'free text').ok).toBe(false);
    expect(sanitizeResponseForQuestion(spokenQ, spokenCtx, null).ok).toBe(false);
  });

  it('still requires the question to belong to the attempt', () => {
    const foreign = { ...spokenQ, section: { assessment_id: 'other' } };
    expect(sanitizeResponseForQuestion(foreign, spokenCtx, answer()).ok).toBe(false);
  });
});
