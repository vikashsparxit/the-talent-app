import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const recover = vi.fn(async () => true);
vi.mock('@/lib/appRecovery', async (orig) => {
  const actual = await orig<typeof import('@/lib/appRecovery')>();
  return { ...actual, recoverFromStaleBuild: (...a: unknown[]) => recover(...(a as [])) };
});

import { AppErrorBoundary } from '@/components/AppErrorBoundary';

function Boom({ error }: { error: Error }): JSX.Element {
  throw error;
}

beforeEach(() => {
  recover.mockClear();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('AppErrorBoundary', () => {
  it('renders children when nothing fails', () => {
    render(<AppErrorBoundary><p>hello</p></AppErrorBoundary>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('shows a Reload screen instead of a blank page on a render/effect crash', () => {
    render(<AppErrorBoundary><Boom error={new Error('cannot add `postgres_changes` callbacks')} /></AppErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(recover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(recover).toHaveBeenCalledWith({ force: true });
  });

  it('reloads automatically once when a lazy chunk failed to load', () => {
    render(<AppErrorBoundary><Boom error={new TypeError('Failed to fetch dynamically imported module: /assets/Jobs-old.js')} /></AppErrorBoundary>);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith();
  });

  it('does not auto-reload again right after a recovery reload', () => {
    sessionStorage.setItem('tta:recovery-reload-at', String(Date.now()));
    render(<AppErrorBoundary><Boom error={new TypeError('Failed to fetch dynamically imported module')} /></AppErrorBoundary>);
    expect(recover).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
