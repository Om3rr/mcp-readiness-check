/* Tiny first-party CTA tracker. No cookies, no third-party scripts, no IP or email in events.
 * Sends {event, product, path, ref, utm_*} to POST /api/event via sendBeacon.
 * Mark any element with data-track="<event>" (and optional data-track-label) to log clicks.
 * Allowed events are validated server-side; see MEASUREMENT.md. */
(function () {
  var P = document.currentScript && document.currentScript.dataset.product || 'unknown';
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var q = new URLSearchParams(location.search), utm = {};
  try { utm = JSON.parse(sessionStorage.getItem('utm') || '{}'); } catch (e) {}
  var fresh = false;
  KEYS.forEach(function (k) { var v = q.get(k); if (v) { utm[k] = v.slice(0, 80); fresh = true; } });
  if (!utm.utm_source && q.get('ref')) { utm.utm_source = q.get('ref').slice(0, 80); fresh = true; }
  if (fresh) try { sessionStorage.setItem('utm', JSON.stringify(utm)); } catch (e) {}
  var refHost = '';
  try { refHost = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
  if (refHost === location.hostname) refHost = '';
  function track(event, props) {
    var body = { event: event, product: P, path: location.pathname, ref: refHost, label: (props && props.label) || '', value: (props && props.value) || null };
    KEYS.forEach(function (k) { if (utm[k]) body[k] = utm[k]; });
    var s = JSON.stringify(body);
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/event', new Blob([s], { type: 'application/json' }))) return; } catch (e) {}
    try { fetch('/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: s, keepalive: true }); } catch (e) {}
  }
  window.track = track;
  window.utmParams = function () { return Object.assign({}, utm); };
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-track]');
    if (el) track(el.getAttribute('data-track'), { label: el.getAttribute('data-track-label') || '' });
  }, true);
  track('page_view');
})();
