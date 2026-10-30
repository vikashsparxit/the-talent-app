/*
 * Boot guard. Loaded as a plain script before the app bundle, so it still runs
 * when the bundle itself fails to load (for example a stale cached index.html
 * that points at a build file removed by a deploy). It does one cache-busting
 * reload with the service worker and caches cleared, and shows a Reload link
 * if the app still has not started. Shares its sessionStorage key with
 * src/lib/appRecovery.ts.
 */
(function () {
  var KEY = 'tta:recovery-reload-at';
  var COOLDOWN = 60000;

  function recentlyRecovered() {
    try {
      var last = Number(sessionStorage.getItem(KEY)) || 0;
      return last > 0 && Date.now() - last < COOLDOWN;
    } catch (e) {
      return false;
    }
  }

  function reload() {
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch (e) {}
    var go = function () {
      var url = new URL(window.location.href);
      url.searchParams.set('__r', String(Date.now()));
      window.location.replace(url.toString());
    };
    var jobs = [];
    try {
      if ('serviceWorker' in navigator) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }));
      }
      if (window.caches) {
        jobs.push(caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }));
      }
    } catch (e) {}
    Promise.all(jobs).then(go, go);
  }

  function recover() {
    if (recentlyRecovered()) {
      showFallback();
      return;
    }
    reload();
  }

  function showFallback() {
    var root = document.getElementById('root');
    if (!root || root.childElementCount > 0 || document.getElementById('tta-boot-fallback')) return;
    var box = document.createElement('div');
    box.id = 'tta-boot-fallback';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;background:#fff';
    var h = document.createElement('h1');
    h.textContent = 'The app could not load';
    h.style.cssText = 'font-size:20px;font-weight:600;margin:0';
    var p = document.createElement('p');
    p.textContent = 'Check your connection, then reload to get the latest version.';
    p.style.cssText = 'max-width:360px;margin:0;color:#6b7280;font-size:14px';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Reload';
    b.style.cssText = 'padding:10px 20px;border-radius:8px;border:none;background:#D64541;color:#fff;font-size:14px;font-weight:600;cursor:pointer';
    b.onclick = reload;
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(b);
    document.body.appendChild(box);
  }

  window.addEventListener('error', function (event) {
    var t = event.target;
    if (!t || !t.tagName) return;
    var tag = String(t.tagName).toUpperCase();
    var url = tag === 'SCRIPT' ? t.src : tag === 'LINK' ? t.href : '';
    if (url && /\/assets\/[^/]+\.(?:js|mjs|css)(?:[?#]|$)/.test(url)) recover();
  }, true);

  // The app sets window.__ttaBooted once React has rendered. If it never does,
  // offer a way out instead of a blank page.
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (!window.__ttaBooted) showFallback();
    }, 10000);
  });
})();
