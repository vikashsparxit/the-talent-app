import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const updateAsync = vi.fn();
let retentionValue: unknown = null;
let consentValue: unknown = null;
vi.mock('@/hooks/useSystemConfig', () => ({
  useSystemConfig: (key: string) => ({
    configValue: key === 'assessment_recording_retention' ? retentionValue : consentValue,
    isLoading: false,
    updateAsync: key === 'assessment_recording_retention' ? updateAsync : vi.fn(),
    isUpdating: false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }));
const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (fn: string) => rpc(fn) },
}));

import { RecordingRetentionSettings } from '@/components/settings/RecordingRetentionSettings';
import { DEFAULT_CONSENT_FIELDS, consentClaimsAutomaticDeletion } from '@/lib/mediaConsent';

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<RecordingRetentionSettings />, { wrapper });
}

// hidden: the page behind the open confirmation is aria-hidden.
const toggle = () => screen.getByRole('switch', { name: /delete assessment recordings after 90 days/i, hidden: true });

beforeEach(() => {
  updateAsync.mockReset();
  updateAsync.mockResolvedValue(undefined);
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 12, error: null });
  retentionValue = null;
  consentValue = null;
});

describe('consentClaimsAutomaticDeletion', () => {
  it('matches the default wording only', () => {
    expect(consentClaimsAutomaticDeletion(DEFAULT_CONSENT_FIELDS.consent_text)).toBe(true);
    expect(consentClaimsAutomaticDeletion('Recordings are kept until you ask us to delete them.')).toBe(false);
  });
});

describe('RecordingRetentionSettings', () => {
  it('is off by default', () => {
    renderSettings();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/Last turned on/)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('asks for confirmation, warns about the backlog with its count, then saves', async () => {
    renderSettings();
    fireEvent.click(toggle());
    expect(await screen.findByText(/already older than 90 days will be deleted on the next cleanup run/)).toBeInTheDocument();
    expect(screen.getByText(/except\s+those of hired candidates/)).toBeInTheDocument();
    expect(await screen.findByText('12 recordings would be deleted now.')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('count_expired_assessment_recordings');
    expect(updateAsync).not.toHaveBeenCalled();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(updateAsync).toHaveBeenCalledTimes(1));
    const saved = updateAsync.mock.calls[0][0];
    expect(saved).toMatchObject({ enabled: true, enabled_by: 'admin-1' });
    expect(saved.enabled_at).toBe(saved.updated_at);
    expect(typeof saved.enabled_at).toBe('string');
  });

  it('does not save when the confirmation is cancelled', async () => {
    renderSettings();
    fireEvent.click(toggle());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(updateAsync).not.toHaveBeenCalled();
  });

  it('turning off needs confirmation and keeps who last turned it on', async () => {
    retentionValue = {
      enabled: true,
      enabled_at: '2026-11-17T10:00:00Z',
      enabled_by: 'admin-0',
      updated_at: '2026-11-17T10:00:00Z',
    };
    renderSettings();
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Last turned on Nov 17, 2026/)).toBeInTheDocument();

    fireEvent.click(toggle());
    expect(await screen.findByText(/Recordings that were already deleted stay deleted/)).toBeInTheDocument();
    expect(updateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(updateAsync).toHaveBeenCalledTimes(1));
    expect(updateAsync.mock.calls[0][0]).toMatchObject({
      enabled: false,
      enabled_at: '2026-11-17T10:00:00Z',
      enabled_by: 'admin-0',
    });
    expect(updateAsync.mock.calls[0][0].updated_at).not.toBe('2026-11-17T10:00:00Z');
  });

  it('warns that the default consent wording promises deletion while it is off', () => {
    renderSettings();
    expect(screen.getByText(/tells candidates that recordings are deleted automatically/)).toBeInTheDocument();
  });

  it('does not warn when it is on or the wording was changed', () => {
    retentionValue = { enabled: true, enabled_at: '2026-11-17T10:00:00Z', enabled_by: 'admin-0', updated_at: null };
    const { unmount } = renderSettings();
    expect(screen.queryByText(/tells candidates that recordings are deleted automatically/)).toBeNull();
    unmount();

    retentionValue = null;
    consentValue = {
      ...DEFAULT_CONSENT_FIELDS,
      consent_text: DEFAULT_CONSENT_FIELDS.consent_text.replace(
        'They are deleted automatically **90 days** after the assessment.',
        'They are kept until you ask us to delete them.',
      ),
    };
    renderSettings();
    expect(screen.queryByText(/tells candidates that recordings are deleted automatically/)).toBeNull();
  });
});
