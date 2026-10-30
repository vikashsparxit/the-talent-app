import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  deleteEq: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    from: (...args: unknown[]) => mocks.from(...args),
  },
}));

type WebPush = typeof import('@/lib/webPush');

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const keyBytes = new Uint8Array(65).map((_, i) => (i === 0 ? 4 : i));
const KEY = btoa(String.fromCharCode(...keyBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fakeSubscription(endpoint: string, key: Uint8Array) {
  return {
    endpoint,
    options: { applicationServerKey: key.slice().buffer },
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-secret' } }),
  };
}

let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let requestPermission: ReturnType<typeof vi.fn>;
let permission: NotificationPermission;

function installBrowser() {
  pushManager = { getSubscription: vi.fn(async () => null), subscribe: vi.fn() };
  const registration = { pushManager };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) },
  });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: CHROME_UA });
  (window as unknown as { PushManager: unknown }).PushManager = function PushManager() {};
  permission = 'default';
  requestPermission = vi.fn(async () => permission);
  const NotificationStub = Object.assign(function Notification() {}, { requestPermission });
  Object.defineProperty(NotificationStub, 'permission', { get: () => permission });
  (window as unknown as { Notification: unknown }).Notification = NotificationStub;
  vi.stubGlobal('Notification', NotificationStub);
}

let wp: WebPush;

beforeEach(async () => {
  vi.resetModules();
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.invoke.mockReset().mockResolvedValue({ data: { publicKey: KEY }, error: null });
  mocks.deleteEq.mockReset().mockResolvedValue({ error: null });
  mocks.from.mockReset().mockImplementation(() => ({ delete: () => ({ eq: mocks.deleteEq }) }));
  installBrowser();
  wp = await import('@/lib/webPush');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('pushAvailability', () => {
  const env = { userAgent: CHROME_UA, maxTouchPoints: 0, standalone: false, hasPushApi: true };

  it('is available in browsers with the Push API', () => {
    expect(wp.pushAvailability(env)).toBe('available');
    expect(wp.pushAvailability({ ...env, hasPushApi: false })).toBe('unsupported');
  });

  it('asks iPhone and iPad Safari tabs to install first', () => {
    expect(wp.pushAvailability({ ...env, userAgent: IPHONE_UA, hasPushApi: false })).toBe('needs-install');
    expect(wp.pushAvailability({ ...env, userAgent: IPAD_UA, maxTouchPoints: 5 })).toBe('needs-install');
    expect(wp.pushAvailability({ ...env, userAgent: IPHONE_UA, standalone: true })).toBe('available');
  });

  it('does not mistake a Mac for an iPad', () => {
    expect(wp.isIosDevice({ userAgent: IPAD_UA, maxTouchPoints: 0 })).toBe(false);
    expect(wp.pushPlatform({ userAgent: IPAD_UA, maxTouchPoints: 0 })).toBe('macos');
    expect(wp.pushPlatform({ userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe('ios');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes unpadded base64url', () => {
    expect([...wp.urlBase64ToUint8Array(KEY)]).toEqual([...keyBytes]);
    expect([...wp.urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });
});

describe('subscriptionRow', () => {
  const env = { userAgent: CHROME_UA, maxTouchPoints: 0, standalone: false, hasPushApi: true };

  it('maps a browser subscription to register_push_subscription arguments', () => {
    expect(wp.subscriptionRow({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }, env)).toEqual({
      p_endpoint: 'https://push.example/1',
      p_p256dh: 'p',
      p_auth: 'a',
      p_user_agent: CHROME_UA,
      p_platform: 'linux',
    });
  });

  it('rejects subscriptions without keys', () => {
    expect(wp.subscriptionRow({ endpoint: 'https://push.example/1' }, env)).toBeNull();
  });
});

describe('syncPushSubscription', () => {
  it('never prompts when permission has not been granted', async () => {
    expect(await wp.syncPushSubscription()).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('re-subscribes after the service worker was unregistered', async () => {
    permission = 'granted';
    pushManager.subscribe.mockResolvedValue(fakeSubscription('https://push.example/new', keyBytes));
    expect(await wp.syncPushSubscription()).toBe(true);
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: keyBytes });
    expect(mocks.rpc).toHaveBeenCalledWith('register_push_subscription', expect.objectContaining({ p_endpoint: 'https://push.example/new' }));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('refreshes an existing subscription made with the current key', async () => {
    permission = 'granted';
    pushManager.getSubscription.mockResolvedValue(fakeSubscription('https://push.example/kept', keyBytes));
    expect(await wp.syncPushSubscription()).toBe(true);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('register_push_subscription', expect.objectContaining({ p_endpoint: 'https://push.example/kept' }));
  });

  it('replaces a subscription made with a different server key', async () => {
    permission = 'granted';
    const stale = fakeSubscription('https://push.example/old', new Uint8Array(65).fill(9));
    pushManager.getSubscription.mockResolvedValue(stale);
    pushManager.subscribe.mockResolvedValue(fakeSubscription('https://push.example/new', keyBytes));
    expect(await wp.syncPushSubscription()).toBe(true);
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalled();
  });

  it('does nothing when push is not configured on the server', async () => {
    permission = 'granted';
    mocks.invoke.mockResolvedValue({ data: { publicKey: null }, error: null });
    expect(await wp.syncPushSubscription()).toBe(false);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});

describe('enablePush', () => {
  it('reports a denied permission without subscribing', async () => {
    permission = 'denied';
    expect(await wp.enablePush()).toBe('denied');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes and registers after the user allows it', async () => {
    permission = 'granted';
    pushManager.subscribe.mockResolvedValue(fakeSubscription('https://push.example/1', keyBytes));
    expect(await wp.enablePush()).toBe('enabled');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('reports a failed registration', async () => {
    permission = 'granted';
    pushManager.subscribe.mockResolvedValue(fakeSubscription('https://push.example/1', keyBytes));
    mocks.rpc.mockResolvedValue({ error: { message: 'forbidden' } });
    expect(await wp.enablePush()).toBe('failed');
  });
});

describe('disablePush', () => {
  it('deletes the server row and unsubscribes the device', async () => {
    const sub = fakeSubscription('https://push.example/1', keyBytes);
    pushManager.getSubscription.mockResolvedValue(sub);
    await wp.disablePush();
    expect(mocks.from).toHaveBeenCalledWith('push_subscriptions');
    expect(mocks.deleteEq).toHaveBeenCalledWith('endpoint', 'https://push.example/1');
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('is a no-op without a subscription', async () => {
    await wp.disablePush();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('setAppBadge', () => {
  it('sets the count and clears it at zero', () => {
    const setAppBadge = vi.fn(async () => undefined);
    const clearAppBadge = vi.fn(async () => undefined);
    Object.assign(navigator, { setAppBadge, clearAppBadge });
    wp.setAppBadge(4);
    wp.setAppBadge(0);
    expect(setAppBadge).toHaveBeenCalledWith(4);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
  });
});

describe('push prompt snooze', () => {
  it('hides the prompt for two weeks after "Not now"', () => {
    const now = 1_000_000_000_000;
    expect(wp.isPushPromptSnoozed(now)).toBe(false);
    wp.snoozePushPrompt(now);
    expect(wp.isPushPromptSnoozed(now + 1000)).toBe(true);
    expect(wp.isPushPromptSnoozed(now + wp.PUSH_PROMPT_SNOOZE_MS + 1)).toBe(false);
  });
});

describe('normalizeNotificationPrefs', () => {
  it('defaults to push on with no overrides', () => {
    expect(wp.normalizeNotificationPrefs(null)).toEqual({
      push_enabled: true,
      types: {},
      quiet_hours_start: null,
      quiet_hours_end: null,
    });
  });

  it('trims Postgres times and drops non-boolean type values', () => {
    expect(
      wp.normalizeNotificationPrefs({
        push_enabled: false,
        types: { interview_reminder: false, bogus: 'yes' },
        quiet_hours_start: '22:00:00',
        quiet_hours_end: '07:30:00',
      }),
    ).toEqual({
      push_enabled: false,
      types: { interview_reminder: false },
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:30',
    });
  });
});

describe('isPushNavigateMessage', () => {
  it('accepts only same-origin app paths from the service worker', () => {
    expect(wp.isPushNavigateMessage({ type: 'tta:push-navigate', link: '/calendar', id: 'n1' })).toBe(true);
    expect(wp.isPushNavigateMessage({ type: 'tta:push-navigate', link: '//evil.example', id: null })).toBe(false);
    expect(wp.isPushNavigateMessage({ type: 'tta:push-navigate', link: 'https://evil.example', id: null })).toBe(false);
    expect(wp.isPushNavigateMessage({ type: 'other', link: '/calendar' })).toBe(false);
  });
});
