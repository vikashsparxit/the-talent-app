/// <reference types="node" />
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decodePng, maskableIconFile, renderMaskableIcon } from '../../scripts/maskable-icons';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

type Handler = (event: Record<string, unknown>) => void;

function loadWorker(clients: Array<{ url: string; postMessage: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }> = []) {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: 'https://talent.example.com' },
    navigator: { setAppBadge: vi.fn(async () => undefined), clearAppBadge: vi.fn(async () => undefined) },
    registration: {
      showNotification: vi.fn(async () => undefined),
      pushManager: { subscribe: vi.fn(async () => ({})) },
    },
    clients: { matchAll: vi.fn(async () => clients), openWindow: vi.fn(async () => null) },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
  };
  new Function('self', read('public/push-sw.js'))(self);
  return { self, handlers };
}

async function dispatch(handler: Handler, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  handler({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

describe('push-sw.js', () => {
  it('shows the payload text with a deep link and updates the app badge', async () => {
    const { self, handlers } = loadWorker();
    const payload = { id: 'n1', title: 'Interview scheduled', body: 'You have a new interview. Tap to view.', link: '/calendar', tag: 'interview_scheduled:/calendar', badge: 3 };
    await dispatch(handlers.push, { data: { json: () => payload } });
    expect(self.registration.showNotification).toHaveBeenCalledWith('Interview scheduled', expect.objectContaining({
      body: 'You have a new interview. Tap to view.',
      tag: 'interview_scheduled:/calendar',
      data: { link: '/calendar', id: 'n1' },
    }));
    expect(self.navigator.setAppBadge).toHaveBeenCalledWith(3);
  });

  it('still shows a notification for an unreadable payload and clears a zero badge', async () => {
    const { self, handlers } = loadWorker();
    await dispatch(handlers.push, { data: { json: () => { throw new Error('bad'); } } });
    expect(self.registration.showNotification).toHaveBeenCalledWith('The Talent App', expect.objectContaining({ data: { link: '/', id: null } }));
    await dispatch(handlers.push, { data: { json: () => ({ badge: 0, link: 'https://evil.example' }) } });
    expect(self.navigator.clearAppBadge).toHaveBeenCalled();
    expect(self.registration.showNotification).toHaveBeenLastCalledWith('The Talent App', expect.objectContaining({ data: { link: '/', id: null } }));
  });

  it('routes a tap through an open app window', async () => {
    const client = { url: 'https://talent.example.com/jobs', postMessage: vi.fn(), focus: vi.fn(async () => undefined) };
    const { self, handlers } = loadWorker([client]);
    const close = vi.fn();
    await dispatch(handlers.notificationclick, { notification: { close, data: { link: '/pipeline?job=1', id: 'n1' } } });
    expect(close).toHaveBeenCalled();
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'tta:push-navigate', link: '/pipeline?job=1', id: 'n1' });
    expect(client.focus).toHaveBeenCalled();
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens the deep link when no app window is open, never another origin', async () => {
    const { self, handlers } = loadWorker();
    await dispatch(handlers.notificationclick, { notification: { close: vi.fn(), data: { link: '/calendar' } } });
    expect(self.clients.openWindow).toHaveBeenCalledWith('https://talent.example.com/calendar');
    await dispatch(handlers.notificationclick, { notification: { close: vi.fn(), data: { link: '//evil.example/x' } } });
    expect(self.clients.openWindow).toHaveBeenLastCalledWith('https://talent.example.com/');
  });

  it('re-subscribes with the same key when the push service rotates the subscription', async () => {
    const { self, handlers } = loadWorker();
    const key = new Uint8Array([4, 1, 2]).buffer;
    await dispatch(handlers.pushsubscriptionchange, { oldSubscription: { options: { applicationServerKey: key } } });
    expect(self.registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: key });
  });
});

describe('PWA config for push', () => {
  const vite = read('vite.config.ts');

  it('imports the push handlers into the generated worker with a content version', () => {
    expect(vite).toMatch(/importScripts: \[`\/push-sw\.js\?v=\$\{pushSwVersion\}`\]/);
    expect(vite).toMatch(/createHash\("sha256"\)[\s\S]{0,80}public\/push-sw\.js/);
  });

  it('ships one manifest with separate any and maskable icons', () => {
    expect(read('index.html')).not.toContain('site.webmanifest');
    expect(vite).toMatch(/purpose: "maskable"[\s\S]*purpose: "maskable"/);
    expect(vite).not.toMatch(/android-chrome-512x512\.png", sizes: "512x512", type: "image\/png", purpose: "maskable"/);
    expect(vite).toMatch(/maskableIconsPlugin\(/);
  });

  it('redirects the old manifest URL and never caches push-sw.js', () => {
    const conf = read('nginx.conf');
    expect(conf).toMatch(/location = \/site\.webmanifest \{\s*return 301 \/manifest\.webmanifest;\s*\}/);
    expect(conf).toMatch(/push-sw\\\.js/);
  });
});

describe('maskable icons', () => {
  const source = readFileSync(path.join(root, 'public/android-chrome-512x512.png'));

  it.each([192, 512])('renders an opaque %ipx icon with a full-bleed background', (size) => {
    const icon = decodePng(renderMaskableIcon(source, size));
    expect(icon.width).toBe(size);
    expect(icon.height).toBe(size);
    const px = (x: number, y: number) => Array.from(icon.pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4));
    // Corners are cropped away by launchers, so they must be background, not transparent.
    const corner = px(0, 0);
    expect(corner[3]).toBe(255);
    expect(px(size - 1, size - 1)).toEqual(corner);
    expect(px(size - 1, 0)).toEqual(corner);
    // Outside the safe-zone circle (radius 40%) there is only background.
    const edge = Math.round(size * 0.06);
    expect(px(edge, Math.round(size / 2))).toEqual(corner);
    expect(px(Math.round(size / 2), size - 1 - edge)).toEqual(corner);
    // The artwork (white on red) is present in the middle.
    let light = 0;
    for (let i = 0; i < icon.pixels.length; i += 4) if (icon.pixels[i + 1] > 200) light++;
    expect(light).toBeGreaterThan(size * size * 0.05);
  });

  it('names the files the manifest points at', () => {
    expect(maskableIconFile(192)).toBe('maskable-icon-192x192.png');
  });
});
