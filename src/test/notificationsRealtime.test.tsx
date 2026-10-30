import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Realtime double with the realtime-js 2.1xx rules that blanked the app after
// login: channel(topic) returns the already registered channel for a topic,
// and .on('postgres_changes') throws once that channel is joining/joined.
type FakeChannel = { topic: string; joining: boolean; on: () => FakeChannel; subscribe: () => FakeChannel };
const channels: FakeChannel[] = [];
const removed: string[] = [];

function channel(name: string): FakeChannel {
  const topic = `realtime:${name}`;
  const existing = channels.find((c) => c.topic === topic);
  if (existing) return existing;
  const c: FakeChannel = {
    topic,
    joining: false,
    on() {
      if (c.joining) throw new Error(`cannot add \`postgres_changes\` callbacks for ${topic} after \`subscribe()\`.`);
      return c;
    },
    subscribe() {
      c.joining = true;
      return c;
    },
  };
  channels.push(c);
  return c;
}

function tableChain() {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'update']) c[m] = vi.fn(() => c);
  c.limit = vi.fn(async () => ({ data: [], error: null }));
  return c;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => tableChain()),
    channel: (name: string) => channel(name),
    removeChannel: vi.fn(async (c: FakeChannel) => {
      removed.push(c.topic);
      channels.splice(channels.indexOf(c), 1);
      return 'ok';
    }),
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import { useNotifications, notificationsChannelTopic } from '@/hooks/useNotifications';

function Consumer() {
  useNotifications();
  return null;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  channels.length = 0;
  removed.length = 0;
});

describe('useNotifications realtime subscription', () => {
  it('the double reproduces the crash when two hooks share a topic', () => {
    channel('notifications:user-1').on().subscribe();
    expect(() => channel('notifications:user-1').on()).toThrow(/after `subscribe\(\)`/);
  });

  it('several mounted consumers (bell + Chitra widget) subscribe without throwing', async () => {
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.error);
    window.addEventListener('error', onError);
    const { unmount } = render(
      <>
        <Consumer />
        <Consumer />
        <Consumer />
      </>,
      { wrapper },
    );
    await waitFor(() => expect(channels).toHaveLength(3));
    expect(new Set(channels.map((c) => c.topic)).size).toBe(3);
    for (const c of channels) expect(c.topic).toMatch(/^realtime:notifications:user-1:\d+$/);
    expect(errors).toEqual([]);
    unmount();
    await waitFor(() => expect(removed).toHaveLength(3));
    expect(channels).toHaveLength(0);
    window.removeEventListener('error', onError);
    cleanup();
  });

  it('topics are unique per call', () => {
    expect(notificationsChannelTopic('u')).not.toBe(notificationsChannelTopic('u'));
  });
});
