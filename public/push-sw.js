/*
 * Web Push handlers, loaded into the generated service worker with
 * workbox importScripts (see vite.config.ts). The import URL carries a hash
 * of this file, so a change here always produces a new service worker.
 *
 * Payloads come from supabase/functions/_shared/pushPayload.ts:
 *   { id, type, title, body, link, tag, badge }
 * They hold generic text only; the app loads the details after sign-in.
 */

var DEFAULT_TITLE = 'The Talent App';
var ICON = '/android-chrome-192x192.png';

function safeLink(link) {
  if (typeof link !== 'string' || link.charAt(0) !== '/' || link.charAt(1) === '/' || link.indexOf('\\') !== -1) {
    return '/';
  }
  return link;
}

function updateBadge(count) {
  var nav = self.navigator;
  if (!nav || typeof count !== 'number') return Promise.resolve();
  try {
    if (count > 0 && nav.setAppBadge) return nav.setAppBadge(count).catch(function () {});
    if (count <= 0 && nav.clearAppBadge) return nav.clearAppBadge().catch(function () {});
  } catch (e) {}
  return Promise.resolve();
}

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  var link = safeLink(data.link);
  var options = {
    body: typeof data.body === 'string' ? data.body : 'Open the app to view it.',
    icon: ICON,
    badge: ICON,
    data: { link: link, id: typeof data.id === 'string' ? data.id : null },
  };
  if (typeof data.tag === 'string' && data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }

  // Every push must show a notification: browsers revoke push permission
  // (iOS in particular) from apps that receive pushes silently.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(typeof data.title === 'string' && data.title ? data.title : DEFAULT_TITLE, options),
      updateBadge(data.badge),
    ]),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var info = event.notification.data || {};
  var link = safeLink(info.link);
  var target = new URL(link, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (new URL(client.url).origin !== self.location.origin) continue;
        // The app routes in place (src/components/PushNotificationsSync.tsx).
        client.postMessage({ type: 'tta:push-navigate', link: link, id: info.id || null });
        return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

// The push service rotated the subscription. Subscribe again with the same
// key; the app registers the new endpoint the next time it starts.
self.addEventListener('pushsubscriptionchange', function (event) {
  var options = event.oldSubscription && event.oldSubscription.options;
  if (!options || !options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .catch(function () {}),
  );
});
