import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildSpokenAnswerResponse,
  clampSpokenConfig,
  DEFAULT_SPOKEN_CONFIG,
  formatSpokenSeconds,
  isSpokenAnswered,
  parseSpokenAnswerResponse,
} from '@/lib/spokenAnswer';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('spoken question settings (builder)', () => {
  it('defaults to 120 s, no prep, one attempt', () => {
    expect(DEFAULT_SPOKEN_CONFIG).toEqual({ max_seconds: 120, prep_seconds: 0, max_attempts: 1 });
    expect(clampSpokenConfig({})).toEqual(DEFAULT_SPOKEN_CONFIG);
  });

  it('clamps builder input to 15-600 s, 0-120 s prep and 1-3 attempts', () => {
    expect(clampSpokenConfig({ max_seconds: 5, prep_seconds: -3, max_attempts: 0 })).toEqual({
      max_seconds: 15,
      prep_seconds: 0,
      max_attempts: 1,
    });
    expect(clampSpokenConfig({ max_seconds: '900', prep_seconds: '500', max_attempts: '7' })).toEqual({
      max_seconds: 600,
      prep_seconds: 120,
      max_attempts: 3,
    });
    expect(clampSpokenConfig({ max_seconds: 'abc', prep_seconds: 30.4, max_attempts: 2 })).toEqual({
      max_seconds: 120,
      prep_seconds: 30,
      max_attempts: 2,
    });
  });

  it('formats durations as m:ss', () => {
    expect(formatSpokenSeconds(7)).toBe('0:07');
    expect(formatSpokenSeconds(120)).toBe('2:00');
    expect(formatSpokenSeconds(600)).toBe('10:00');
  });
});

describe('spoken answer response shape', () => {
  it('builds the audio response with a pending transcript', () => {
    expect(
      buildSpokenAnswerResponse({ key: 'spoken/a/b/1.webm', mime: 'audio/webm', size: 10, durationSeconds: 12.345, attempt: 1 }),
    ).toEqual({
      mode: 'audio',
      file: { key: 'spoken/a/b/1.webm', mime: 'audio/webm', size: 10, duration_seconds: 12.3 },
      attempt: 1,
      transcript_status: 'pending',
    });
  });

  it('treats only a saved audio file as answered', () => {
    expect(isSpokenAnswered({ mode: 'audio', file: { key: 'spoken/a/b/1.webm' } })).toBe(true);
    expect(isSpokenAnswered({ mode: 'audio', file: {} })).toBe(false);
    expect(isSpokenAnswered({ mode: 'file', file: { key: 'x' } })).toBe(false);
    expect(isSpokenAnswered('some text')).toBe(false);
    expect(isSpokenAnswered(null)).toBe(false);
  });

  it('reads transcripts written by grading', () => {
    const parsed = parseSpokenAnswerResponse({
      mode: 'audio',
      file: { key: 'k', mime: 'audio/mp4', size: 1, duration_seconds: 3 },
      attempt: 2,
      transcript_status: 'done',
      transcript: 'hello',
    });
    expect(parsed).toMatchObject({ attempt: 2, transcript_status: 'done', transcript: 'hello' });
    expect(parseSpokenAnswerResponse({ mode: 'audio', file: { key: 'k' }, transcript_status: 'weird' })?.transcript_status)
      .toBe('pending');
  });
});

describe('spoken type is handled wherever question types are switched on', () => {
  it('is offered in the question builder with its settings and rubric', () => {
    const form = read('src/components/assessment/QuestionForm.tsx');
    expect(form).toContain('<SelectItem value="spoken">Spoken answer</SelectItem>');
    expect(form).toContain('questionData.spoken_config = clampSpokenConfig(form.spoken_config)');
  });

  it('is never AI-generated (coerced like file_upload)', () => {
    const gen = read('supabase/functions/generate-assessment/index.ts');
    expect(gen).toMatch(/t === "spoken"[^\n]*return "subjective"/);
  });

  it('is copied with templates', () => {
    expect(read('src/hooks/useTemplates.tsx')).toContain('spoken_config: q.spoken_config ?? null');
    expect(read('src/components/assessments/CreateFromTemplateDialog.tsx')).toContain('spoken_config:');
  });

  it('is ignored by the MCQ auto-score trigger', () => {
    const baseline = read('supabase/migrations/20261011000000_baseline.sql');
    const start = baseline.indexOf('CREATE FUNCTION public.auto_score_mcq_response()');
    expect(start).toBeGreaterThan(-1);
    const trigger = baseline.slice(start, baseline.indexOf('$$;', start));
    expect(trigger).toContain("IF _question_type IS DISTINCT FROM 'mcq' THEN");
  });
});
