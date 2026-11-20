(function(){
  /* First-party events (spec 20 Nov 2026): POST /api/event {event,path,ref,props}. No cookies, no IPs, no emails. */
  var q; try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function(){ return null; } }; }
  var ref = '';
  var src = q.get('utm_source');
  if (src) ref = 'utm:' + [src, q.get('utm_medium') || '', q.get('utm_campaign') || ''].join('/').slice(0, 170);
  else if (document.referrer && document.referrer.indexOf(location.origin) !== 0) ref = document.referrer;
  function ping(event, props) {
    try {
      var body = JSON.stringify({ event: event, path: location.pathname, ref: ref, props: props || {} });
      if (navigator.sendBeacon && navigator.sendBeacon('/api/event', new Blob([body], { type: 'application/json' }))) return;
      fetch('/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true }).catch(function(){});
    } catch (e) {}
  }
  window.ping = ping;
  ping('landing_view');
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, bad) {
      try { var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); var r = document.execCommand('copy'); document.body.removeChild(t); r ? ok() : bad(); } catch (e) { bad(e); }
    });
  }
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-copy],[data-event]');
    if (!el) return;
    var copyId = el.getAttribute('data-copy');
    if (copyId) {
      var srcEl = document.getElementById(copyId);
      var text = srcEl ? (srcEl.value != null && srcEl.tagName === 'TEXTAREA' ? srcEl.value : srcEl.textContent) : '';
      var label = el.textContent;
      copyText(text).then(function () {
        el.textContent = 'Copied';
        setTimeout(function () { el.textContent = label; }, 1600);
        var ev = el.getAttribute('data-event');
        if (ev) ping(ev, el.getAttribute('data-tier') ? { tier: el.getAttribute('data-tier') } : {});
      }).catch(function () { el.textContent = 'Select and copy'; });
      return;
    }
    var name = el.getAttribute('data-event');
    var props = {};
    if (el.getAttribute('data-tier')) props.tier = el.getAttribute('data-tier');
    ping(name, props);
    var go = el.getAttribute('data-goto');
    if (go) {
      var target = document.getElementById(go);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var input = target.querySelector('input[type=email]');
        if (input) setTimeout(function () { input.focus({ preventScroll: true }); }, 350);
      }
    }
  }, true);
})();
