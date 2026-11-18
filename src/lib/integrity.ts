import type { IntegrityEvent, MediaIntegrityEventType } from '@/types/database';

const MEDIA_EVENT_TYPES: ReadonlySet<string> = new Set<MediaIntegrityEventType>([
  'camera_denied',
  'mic_denied',
  'camera_stopped',
  'recording_interrupted',
  'recording_upload_failed',
  'media_incomplete_at_submit',
]);

export function isMediaIntegrityEventType(type: unknown): type is MediaIntegrityEventType {
  return typeof type === 'string' && MEDIA_EVENT_TYPES.has(type);
}

export type RawIntegrityEvent = {
  type?: string;
  timestamp?: string;
  duration_seconds?: number;
  question_id?: string;
  question_index?: number;
  section_title?: string;
  chars?: number;
  input_kind?: string;
  submitted_by?: string;
  pending_segments?: number;
  unsaved_spoken_questions?: unknown;
};

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set<IntegrityEvent['type']>([
  'tab_switch',
  'focus_lost',
  'fullscreen_exit',
  'paste_attempt',
  'auto_submit_time_limit',
  'auto_complete_browser_close',
]);

export function normalizeIntegrityEventType(type?: string): IntegrityEvent['type'] {
  if (type === 'focus_loss') return 'focus_lost';
  if (type && KNOWN_EVENT_TYPES.has(type)) return type as IntegrityEvent['type'];
  if (isMediaIntegrityEventType(type)) return type;
  return 'tab_switch';
}

export function normalizeIntegrityEvent(event: RawIntegrityEvent): IntegrityEvent {
  return {
    type: normalizeIntegrityEventType(event.type),
    timestamp: event.timestamp || new Date().toISOString(),
    duration_seconds: typeof event.duration_seconds === 'number' ? event.duration_seconds : undefined,
    question_id: typeof event.question_id === 'string' ? event.question_id : undefined,
    question_index: typeof event.question_index === 'number' ? event.question_index : undefined,
    section_title: typeof event.section_title === 'string' ? event.section_title : undefined,
    chars: typeof event.chars === 'number' ? event.chars : undefined,
    input_kind: typeof event.input_kind === 'string' ? event.input_kind : undefined,
    submitted_by:
      event.submitted_by === 'candidate' || event.submitted_by === 'timer' ? event.submitted_by : undefined,
    pending_segments: typeof event.pending_segments === 'number' ? event.pending_segments : undefined,
    unsaved_spoken_questions: Array.isArray(event.unsaved_spoken_questions)
      ? event.unsaved_spoken_questions.filter((n): n is number => typeof n === 'number')
      : undefined,
  };
}

export function normalizeIntegrityLog(log: unknown): IntegrityEvent[] {
  if (!Array.isArray(log)) return [];
  return log.map((event) =>
    typeof event === 'object' && event !== null
      ? normalizeIntegrityEvent(event as RawIntegrityEvent)
      : { type: 'tab_switch', timestamp: new Date().toISOString() }
  );
}

export interface IntegrityStats {
  tabSwitchCount: number;
  /** Blocked paste/drop attempts into answer inputs — a signal for review, never a penalty. */
  pasteAttempts: number;
  totalSecondsAway: number;
  eventCount: number;
}

export function computeIntegrityStats(
  log: RawIntegrityEvent[],
  currentSessionAwaySeconds = 0
): IntegrityStats {
  let tabSwitchCount = 0;
  let pasteAttempts = 0;
  let totalSecondsAway = currentSessionAwaySeconds;

  for (const raw of log) {
    const type = normalizeIntegrityEventType(raw.type);
    if (type === 'tab_switch') tabSwitchCount++;
    if (type === 'paste_attempt') pasteAttempts++;
    if (type === 'focus_lost' && typeof raw.duration_seconds === 'number') {
      totalSecondsAway += raw.duration_seconds;
    }
  }

  return {
    tabSwitchCount,
    pasteAttempts,
    totalSecondsAway,
    eventCount: log.length,
  };
}

export function formatSecondsAway(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function getIntegrityEventLabel(type?: string): string {
  switch (normalizeIntegrityEventType(type)) {
    case 'tab_switch':
      return 'Tab switch';
    case 'focus_lost':
      return 'Focus lost';
    case 'fullscreen_exit':
      return 'Fullscreen exit';
    case 'camera_denied':
      return 'Camera blocked';
    case 'mic_denied':
      return 'Microphone blocked';
    case 'camera_stopped':
      return 'Camera or microphone stopped';
    case 'recording_interrupted':
      return 'Recording interrupted';
    case 'recording_upload_failed':
      return 'Recording upload failed';
    case 'media_incomplete_at_submit':
      return 'Submitted before recording finished uploading';
    case 'paste_attempt':
      return 'Paste attempt blocked';
    case 'auto_submit_time_limit':
      return 'Auto-submitted (time limit)';
    case 'auto_complete_browser_close':
      return 'Auto-completed (browser closed)';
    default:
      return 'Unknown event';
  }
}

export function getTabSwitchWarningMessage(switchCount: number): {
  title: string;
  description: string;
  variant?: 'default' | 'destructive';
} {
  if (switchCount >= 5) {
    return {
      title: 'Integrity warning',
      description: 'Repeated tab switches may affect your evaluation. Stay on this page.',
      variant: 'destructive',
    };
  }
  if (switchCount >= 3) {
    return {
      title: 'Serious integrity notice',
      description: 'Multiple tab switches have been recorded. Please return to your assessment.',
      variant: 'destructive',
    };
  }
  return {
    title: 'Tab switch recorded',
    description: 'Leaving this tab is monitored and shared with the hiring team.',
  };
}
