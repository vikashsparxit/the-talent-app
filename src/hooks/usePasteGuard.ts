import { useCallback, useMemo, useRef } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import { toast } from 'sonner';

export type PasteInputKind = 'subjective' | 'coding';

/** What a blocked paste reports. Only the length is kept — never the pasted text. */
export interface PasteAttempt {
  inputKind: PasteInputKind;
  chars?: number;
}

export const PASTE_BLOCKED_MESSAGE = 'Pasting is disabled for this assessment. Please type your answer.';
export const PASTE_LOG_THROTTLE_MS = 3000;

const BLOCKED_INPUT_TYPES = new Set(['insertFromPaste', 'insertFromDrop', 'insertFromPasteAsQuotation']);

interface PasteGuardOptions {
  inputKind: PasteInputKind;
  /** Throttle bucket, normally the question id. */
  getKey: () => string;
  onAttempt: (attempt: PasteAttempt) => void;
  notify: () => void;
  now?: () => number;
}

function textLength(data: DataTransfer | null | undefined): number | undefined {
  if (!data) return undefined;
  const text = data.getData('text/plain') || data.getData('text');
  return text ? text.length : undefined;
}

/**
 * Blocks paste / text drop into an answer input. Every attempt is blocked and
 * shown a notice; onAttempt (the integrity log) fires at most once per key per
 * PASTE_LOG_THROTTLE_MS. Attempts are a signal for human reviewers only.
 */
export function createPasteGuard({ inputKind, getKey, onAttempt, notify, now = Date.now }: PasteGuardOptions) {
  const lastLoggedAt = new Map<string, number>();

  const block = (event: { preventDefault: () => void }, chars: number | undefined) => {
    event.preventDefault();
    notify();
    const key = getKey();
    const at = now();
    const last = lastLoggedAt.get(key);
    if (last !== undefined && at - last < PASTE_LOG_THROTTLE_MS) return;
    lastLoggedAt.set(key, at);
    onAttempt(chars === undefined ? { inputKind } : { inputKind, chars });
  };

  return {
    onPaste: (event: Pick<ClipboardEvent, 'preventDefault' | 'clipboardData'>) => {
      block(event, textLength(event.clipboardData));
    },
    onDrop: (event: Pick<DragEvent, 'preventDefault' | 'dataTransfer'>) => {
      // Only text drops are blocked; anything else falls through to the browser.
      const types = Array.from(event.dataTransfer?.types ?? []);
      if (!types.some((t) => t === 'text' || t.startsWith('text/'))) return;
      block(event, textLength(event.dataTransfer));
    },
    /** Native beforeinput: catches mobile / Safari paste paths that skip the paste event. */
    onBeforeInput: (event: Pick<InputEvent, 'preventDefault' | 'inputType' | 'data' | 'dataTransfer'>) => {
      if (!BLOCKED_INPUT_TYPES.has(event.inputType)) return;
      block(event, event.data ? event.data.length : textLength(event.dataTransfer));
    },
  };
}

interface UsePasteGuardOptions {
  inputKind: PasteInputKind;
  throttleKey: string;
  onAttempt?: (attempt: PasteAttempt) => void;
}

/** Props to spread on an answer <Textarea>: ref (for native beforeinput), onPaste, onDrop. */
export function usePasteGuard({ inputKind, throttleKey, onAttempt }: UsePasteGuardOptions) {
  const keyRef = useRef(throttleKey);
  keyRef.current = throttleKey;
  const onAttemptRef = useRef(onAttempt);
  onAttemptRef.current = onAttempt;

  const guard = useMemo(
    () =>
      createPasteGuard({
        inputKind,
        getKey: () => keyRef.current,
        onAttempt: (attempt) => onAttemptRef.current?.(attempt),
        notify: () => toast.warning(PASTE_BLOCKED_MESSAGE, { id: 'paste-blocked' }),
      }),
    [inputKind]
  );

  // React's onBeforeInput is a keypress/textInput polyfill without inputType, so listen natively.
  // React calls the ref with null on unmount, which detaches the listener.
  const elementRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = useCallback(
    (el: HTMLTextAreaElement | null) => {
      elementRef.current?.removeEventListener('beforeinput', guard.onBeforeInput);
      elementRef.current = el;
      el?.addEventListener('beforeinput', guard.onBeforeInput);
    },
    [guard]
  );

  return { ref, onPaste: guard.onPaste, onDrop: guard.onDrop };
}
