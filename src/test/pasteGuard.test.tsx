import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
}));
const toastWarning = vi.fn();
vi.mock('sonner', () => ({ toast: { warning: (...args: unknown[]) => toastWarning(...args) } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { createPasteGuard, PASTE_BLOCKED_MESSAGE, PASTE_LOG_THROTTLE_MS } from '@/hooks/usePasteGuard';
import { CodeEditor } from '@/components/portal/CodeEditor';
import { QuestionDisplay } from '@/components/portal/ExamInterface';
import type { PortalQuestion } from '@/hooks/useCandidatePortal';

const SECRET = 'const answer = copiedFromSomewhere();';

function clipboard(text: string) {
  return { getData: (type: string) => (type === 'text/plain' ? text : '') } as unknown as DataTransfer;
}

function dragData(text: string, types = ['text/plain']) {
  return { types, getData: (type: string) => (type === 'text/plain' ? text : '') } as unknown as DataTransfer;
}

function setup(opts: { key?: string } = {}) {
  let clock = 1_000_000;
  let key = opts.key ?? 'q1';
  const onAttempt = vi.fn();
  const notify = vi.fn();
  const guard = createPasteGuard({
    inputKind: 'coding',
    getKey: () => key,
    onAttempt,
    notify,
    now: () => clock,
  });
  return {
    guard,
    onAttempt,
    notify,
    advance: (ms: number) => { clock += ms; },
    setKey: (k: string) => { key = k; },
  };
}

describe('createPasteGuard', () => {
  it('blocks paste, notifies and reports only the length', () => {
    const { guard, onAttempt, notify } = setup();
    const preventDefault = vi.fn();
    guard.onPaste({ preventDefault, clipboardData: clipboard(SECRET) });

    expect(preventDefault).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith({ inputKind: 'coding', chars: SECRET.length });
    expect(JSON.stringify(onAttempt.mock.calls)).not.toContain(SECRET);
  });

  it('blocks text drops but lets non-text drops through', () => {
    const { guard, onAttempt } = setup();
    const textDrop = vi.fn();
    guard.onDrop({ preventDefault: textDrop, dataTransfer: dragData('dragged') });
    expect(textDrop).toHaveBeenCalled();
    expect(onAttempt).toHaveBeenCalledWith({ inputKind: 'coding', chars: 7 });

    const fileDrop = vi.fn();
    guard.onDrop({ preventDefault: fileDrop, dataTransfer: dragData('', ['Files']) });
    expect(fileDrop).not.toHaveBeenCalled();
    expect(onAttempt).toHaveBeenCalledTimes(1);
  });

  it.each(['insertFromPaste', 'insertFromDrop', 'insertFromPasteAsQuotation'])(
    'blocks beforeinput %s',
    (inputType) => {
      const { guard, onAttempt } = setup();
      const preventDefault = vi.fn();
      guard.onBeforeInput({ preventDefault, inputType, data: SECRET, dataTransfer: null });
      expect(preventDefault).toHaveBeenCalled();
      expect(onAttempt).toHaveBeenCalledWith({ inputKind: 'coding', chars: SECRET.length });
    }
  );

  it('leaves ordinary typing alone', () => {
    const { guard, onAttempt, notify } = setup();
    const preventDefault = vi.fn();
    guard.onBeforeInput({ preventDefault, inputType: 'insertText', data: 'a', dataTransfer: null });
    guard.onBeforeInput({ preventDefault, inputType: 'historyUndo', data: null, dataTransfer: null });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onAttempt).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('omits chars when no text is readable', () => {
    const { guard, onAttempt } = setup();
    guard.onPaste({ preventDefault: vi.fn(), clipboardData: null });
    expect(onAttempt).toHaveBeenCalledWith({ inputKind: 'coding' });
  });

  it('always blocks but logs at most once per question per throttle window', () => {
    const { guard, onAttempt, notify, advance, setKey } = setup();
    const preventDefault = vi.fn();
    const paste = () => guard.onPaste({ preventDefault, clipboardData: clipboard('x') });

    paste();
    advance(1000);
    paste();
    advance(1000);
    paste();
    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledTimes(3);
    expect(onAttempt).toHaveBeenCalledTimes(1);

    setKey('q2');
    paste();
    expect(onAttempt).toHaveBeenCalledTimes(2);

    setKey('q1');
    advance(PASTE_LOG_THROTTLE_MS);
    paste();
    expect(onAttempt).toHaveBeenCalledTimes(3);
  });
});

function withQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function ControlledCodeEditor({ onPasteAttempt }: { onPasteAttempt: (a: unknown) => void }) {
  const [code, setCode] = useState('');
  return (
    <CodeEditor
      code={code}
      language="javascript"
      testCases={[]}
      questionId="q-code"
      onCodeChange={setCode}
      onPasteAttempt={onPasteAttempt}
    />
  );
}

describe('CodeEditor paste blocking', () => {
  beforeEach(() => toastWarning.mockClear());

  it('prevents paste and beforeinput paste without inserting text, typing still works', () => {
    const onPasteAttempt = vi.fn();
    render(withQuery(<ControlledCodeEditor onPasteAttempt={onPasteAttempt} />));
    const textarea = screen.getByPlaceholderText('Write your code here...') as HTMLTextAreaElement;

    const notCancelled = fireEvent.paste(textarea, { clipboardData: clipboard(SECRET) });
    expect(notCancelled).toBe(false);
    expect(textarea.value).toBe('');
    expect(toastWarning).toHaveBeenCalledWith(PASTE_BLOCKED_MESSAGE, expect.anything());
    expect(onPasteAttempt).toHaveBeenCalledWith({ inputKind: 'coding', chars: SECRET.length });

    const beforeInput = new InputEvent('beforeinput', {
      inputType: 'insertFromPaste',
      data: SECRET,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(beforeInput);
    expect(beforeInput.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('');

    fireEvent.change(textarea, { target: { value: 'function add(a, b) {' } });
    expect(textarea.value).toBe('function add(a, b) {');

    expect(screen.getByText(/Paste attempts are recorded for the reviewer/)).toBeInTheDocument();
  });

  it('does not block copy or cut', () => {
    render(withQuery(<ControlledCodeEditor onPasteAttempt={vi.fn()} />));
    const textarea = screen.getByPlaceholderText('Write your code here...');
    expect(fireEvent.copy(textarea)).toBe(true);
    expect(fireEvent.cut(textarea)).toBe(true);
  });
});

describe('Subjective answer paste blocking', () => {
  const question = {
    id: 'q-subj',
    type: 'subjective',
    question_text: 'Explain closures.',
    marks: 5,
    sectionTitle: 'Theory',
  } as unknown as PortalQuestion & { sectionTitle: string };

  function ControlledQuestion({ onPasteAttempt }: { onPasteAttempt: (a: unknown) => void }) {
    const [response, setResponse] = useState<string>('');
    return (
      <QuestionDisplay
        question={question}
        questionNumber={1}
        totalQuestions={1}
        response={response}
        onResponseChange={(v) => setResponse(String(v))}
        candidateAssessmentId="ca-1"
        onMediaIntegrityEvent={() => {}}
        mediaStream={null}
        onPasteAttempt={onPasteAttempt}
      />
    );
  }

  it('blocks paste and text drops but keeps typing', () => {
    const onPasteAttempt = vi.fn();
    render(withQuery(<ControlledQuestion onPasteAttempt={onPasteAttempt} />));
    const textarea = screen.getByPlaceholderText('Type your answer here...') as HTMLTextAreaElement;

    expect(fireEvent.paste(textarea, { clipboardData: clipboard(SECRET) })).toBe(false);
    expect(fireEvent.drop(textarea, { dataTransfer: dragData(SECRET) })).toBe(false);
    expect(textarea.value).toBe('');
    // Paste then drop within the throttle window on the same question: one logged attempt.
    expect(onPasteAttempt).toHaveBeenCalledTimes(1);
    expect(onPasteAttempt).toHaveBeenCalledWith({ inputKind: 'subjective', chars: SECRET.length });

    fireEvent.change(textarea, { target: { value: 'A closure captures its scope.' } });
    expect(textarea.value).toBe('A closure captures its scope.');
  });
});
