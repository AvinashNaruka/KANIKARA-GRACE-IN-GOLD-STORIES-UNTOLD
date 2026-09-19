(function () {
  'use strict';

  var CFG = {
    TRACK_ADMINS: false,   // true karein to apni khud ki views bhi count hongi
    LOOKBACK_DAYS: 30,     // admin panel kitne din ka data padhe
    MAX_ROWS: 8000
  };

  var uid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var ss = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };
  var E = function (s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (m) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
  }); };

  function deviceInfo() {
    var ua = navigator.userAgent || '';
    var device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua) ? 'tablet'
               : /Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua) ? 'mobile' : 'desktop';
    var browser = /Edg\//i.test(ua) ? 'Edge'
                : /OPR\//i.test(ua) ? 'Opera'
                : /Chrome\//i.test(ua) ? 'Chrome'
                : /Firefox\//i.test(ua) ? 'Firefox'
                : /Safari\//i.test(ua) ? 'Safari' : 'Other';
    var os = /Windows/i.test(ua) ? 'Windows'
           : /Android/i.test(ua) ? 'Android'
           : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
           : /Mac OS X/i.test(ua) ? 'macOS'
           : /Linux/i.test(ua) ? 'Linux' : 'Other';
    return { device: device, browser: browser, os: os };
  }

  function hostOf(url) {
    try {
      if (!url) return null;
      var h = new URL(url).hostname.replace(/^www\./, '');
      if (h === location.hostname.replace(/^www\./, '')) return null; // internal
      return h;
    } catch (e) { return null; }
  }

  var VKEY = 'kk_visitor_id', SKEY = 'kk_session_id', UTMKEY = 'kk_utm';
  var isNew = false;
  var visitorId = ls.get(VKEY);
  if (!visitorId) { visitorId = uid(); ls.set(VKEY, visitorId); isNew = true; }
  var sessionId = ss.get(SKEY);
  if (!sessionId) { sessionId = uid(); ss.set(SKEY, sessionId); }

  var utm = {};
  try { utm = JSON.parse(ss.get(UTMKEY) || '{}'); } catch (e) { utm = {}; }
  (function () {
    var qs = new URLSearchParams(location.search || '');
    var hq = (location.hash || '').split('?')[1] || '';
    var hp = new URLSearchParams(hq);
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
      var v = qs.get(k) || hp.get(k);
      if (v) utm[k] = v;
    });
    if (Object.keys(utm).length) ss.set(UTMKEY, JSON.stringify(utm));
  })();

  var firstReferrer = ss.get('kk_ref');
  if (firstReferrer === null) { firstReferrer = document.referrer || ''; ss.set('kk_ref', firstReferrer); }

  var lastKey = '', lastAt = 0;

  function track(pageId) {
    if (typeof sb === 'undefined' || !sb) return;
    if (!CFG.TRACK_ADMINS && window.state && state.isAdmin) return;
    if (document.body.classList.contains('admin-mode')) return;

    var hash = (location.hash || '#home').slice(1).split('?')[0];
    var parts = hash.split('/');
    var page = pageId || parts[0] || 'home';
    var slug = (page === 'product' && parts[1]) ? decodeURIComponent(parts[1]) : null;

    var key = page + '|' + (slug || '');
    var now = Date.now();
    if (key === lastKey && now - lastAt < 1500) return; // duplicate guard
    lastKey = key; lastAt = now;

    var d = deviceInfo();
    var row = {
      visitor_id: visitorId,
      session_id: sessionId,
      user_id: (window.state && state.session && state.session.user) ? state.session.user.id : null,
      page: page,
      path: '#' + hash,
      product_slug: slug,
      referrer: firstReferrer || null,
      referrer_host: hostOf(firstReferrer),
      utm_source: utm.utm_source || null,
      utm_medium: utm.utm_medium || null,
      utm_campaign: utm.utm_campaign || null,
      device: d.device, browser: d.browser, os: d.os,
      screen_w: window.screen ? screen.width : null,
      screen_h: window.screen ? screen.height : null,
      lang: navigator.language || null,
      is_new_visitor: isNew
    };
    isNew = false;
    sb.from('page_views').insert(row).then(function (r) {
      if (r && r.error) console.warn('[analytics]', r.error.message);
    });
  }

  function wrap(name, after) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__kkWrapped) return;
    var fn = function () {
      var out = orig.apply(this, arguments);
      try { after.apply(null, arguments); } catch (e) {}
      return out;
    };
    fn.__kkWrapped = true;
    window[name] = fn;
  }

  function installHooks() {
    wrap('showPage', function (id) { setTimeout(function () { track(id); }, 30); });
    wrap('goProduct', function () { setTimeout(function () { track('product'); }, 30); });
    window.addEventListener('popstate', function () { setTimeout(function () { track(); }, 60); });
  }

  var CSS = '' +
    '.kk-an-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:26px}' +
    '@media(max-width:900px){.kk-an-grid{grid-template-columns:1fr 1fr}}' +
    '.kk-an-card{background:var(--ivory-2,#faf7f2);border:1px solid var(--line-light,#e7e0d5);padding:18px}' +
    '.kk-an-card .n{font-family:var(--serif,serif);font-size:30px;font-weight:700;line-height:1}' +
    '.kk-an-card .l{font-size:12px;opacity:.6;margin-top:6px;letter-spacing:.04em;text-transform:uppercase}' +
    '.kk-an-two{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}' +
    '@media(max-width:900px){.kk-an-two{grid-template-columns:1fr}}' +
    '.kk-bars{display:flex;align-items:flex-end;gap:5px;height:150px;padding-top:10px}' +
    '.kk-bars>div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px}' +
    '.kk-bars .b{width:100%;background:linear-gradient(180deg,#d4af37,#b8912b);min-height:2px;border-radius:2px 2px 0 0}' +
    '.kk-bars .t{font-size:9px;opacity:.55;white-space:nowrap}' +
    '.kk-live{display:inline-flex;align-items:center;gap:7px;font-size:12px}' +
    '.kk-live i{width:8px;height:8px;border-radius:50%;background:#1f9d55;display:inline-block;animation:kkpulse 1.6s infinite}' +
    '@keyframes kkpulse{0%,100%{opacity:1}50%{opacity:.25}}' +
    '.kk-an-card h3{font-family:var(--serif,serif);margin-bottom:12px;font-size:17px}' +
    '.kk-an-card table.data td,.kk-an-card table.data th{font-size:12.5px}' +
    '.kk-seg{display:flex;gap:8px;flex-wrap:wrap}' +
    '.kk-seg button{border:1px solid var(--line-light,#e7e0d5);background:#fff;padding:7px 14px;font-size:12px;cursor:pointer;letter-spacing:.04em}' +
    '.kk-seg button.on{background:#221f1c;color:#fff;border-color:#221f1c}';

  function injectUI() {
    var side = document.querySelector('.admin-side');
    var main = document.querySelector('.admin-main');
    if (!side || !main || document.querySelector('[data-pane="analytics"]')) return;

    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    var link = document.createElement('a');
    link.href = '#'; link.dataset.tab = 'analytics';
    link.textContent = 'Analytics';
    link.onclick = function (e) { e.preventDefault(); switchAdmin('analytics'); };
    var settingsLink = side.querySelector('a[data-tab="settings"]');
    settingsLink ? side.insertBefore(link, settingsLink) : side.appendChild(link);

    var pane = document.createElement('div');
    pane.className = 'admin-pane hide';
    pane.dataset.pane = 'analytics';
    pane.innerHTML =
      '<div class="admin-topbar"><h1>Analytics</h1>' +
      '<div class="kk-seg" id="kkRange">' +
        '<button data-d="1">Today</button>' +
        '<button data-d="7" class="on">7 days</button>' +
        '<button data-d="30">30 days</button>' +
        '<button onclick="loadAdminAnalytics(true)">↻ Refresh</button>' +
      '</div></div>' +
      '<div id="kkAnBody"><p style="opacity:.6">Loading…</p></div>';
    main.appendChild(pane);

    pane.querySelectorAll('#kkRange button[data-d]').forEach(function (b) {
      b.onclick = function () {
        pane.querySelectorAll('#kkRange button[data-d]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        render(Number(b.dataset.d));
      };
    });

    var orig = window.switchAdmin;
    if (typeof orig === 'function' && !orig.__kkWrapped) {
      var fn = function (tab) {
        var out = orig.apply(this, arguments);
        if (tab === 'analytics') loadAdminAnalytics();
        return out;
      };
      fn.__kkWrapped = true;
      window.switchAdmin = fn;
    }
  }

  var cache = { rows: null, at: 0 };

  window.loadAdminAnalytics = async function (force) {
    var body = document.getElementById('kkAnBody');
    if (!body) return;
    if (force || !cache.rows || Date.now() - cache.at > 60000) {
      body.innerHTML = '<p style="opacity:.6">Loading analytics…</p>';
      var since = new Date(Date.now() - CFG.LOOKBACK_DAYS * 864e5).toISOString();
      var res = await sb.from('page_views')
        .select('*, profiles(full_name, email)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(CFG.MAX_ROWS);
      if (res.error) {
        body.innerHTML = '<div class="dash-card"><b>Analytics table nahi mili.</b><br><span style="opacity:.7">' +
          E(res.error.message) + '</span><br><br>Supabase SQL Editor me <code>analytics-schema.sql</code> run karein.</div>';
        return;
      }
      cache.rows = res.data || [];
      cache.at = Date.now();
    }
    var active = document.querySelector('#kkRange button.on');
    render(active ? Number(active.dataset.d) : 7);
  };

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  function render(days) {
    var body = document.getElementById('kkAnBody');
    if (!body || !cache.rows) return;
    var all = cache.rows;
    var from = days === 1 ? startOfDay(new Date()) : new Date(Date.now() - days * 864e5);
    var rows = all.filter(function (r) { return new Date(r.created_at) >= from; });

    var uniq = function (arr, key) {
      var s = new Set(); arr.forEach(function (r) { if (r[key]) s.add(r[key]); }); return s.size;
    };
    var live = all.filter(function (r) { return Date.now() - new Date(r.created_at) < 5 * 60000; });
    var todayRows = all.filter(function (r) { return new Date(r.created_at) >= startOfDay(new Date()); });
    var loggedIn = rows.filter(function (r) { return r.user_id; });

    var kpi =
      '<div class="kk-an-grid">' +
        card(rows.length, 'Page views (' + (days === 1 ? 'today' : days + 'd') + ')') +
        card(uniq(rows, 'visitor_id'), 'Unique visitors') +
        card(uniq(rows, 'session_id'), 'Sessions') +
        card(todayRows.length, 'Views today') +
      '</div>' +
      '<div class="kk-an-grid">' +
        card(uniq(live, 'visitor_id'), '<span class="kk-live"><i></i>Online abhi</span>') +
        card(uniq(loggedIn, 'user_id'), 'Logged-in viewers') +
        card(rows.filter(function (r) { return r.is_new_visitor; }).length, 'New visitors') +
        card(all.length, 'Total views (' + CFG.LOOKBACK_DAYS + 'd)') +
      '</div>';

    var nDays = days === 1 ? 1 : days;
    var buckets = [];
    for (var i = nDays - 1; i >= 0; i--) {
      var d0 = startOfDay(new Date(Date.now() - i * 864e5));
      var d1 = new Date(d0.getTime() + 864e5);
      var v = all.filter(function (r) { var t = new Date(r.created_at); return t >= d0 && t < d1; });
      buckets.push({ label: d0.getDate() + '/' + (d0.getMonth() + 1), views: v.length });
    }
    var max = Math.max.apply(null, buckets.map(function (b) { return b.views; }).concat([1]));
    var bars = '<div class="kk-an-card"><h3>Daily views</h3><div class="kk-bars">' +
      buckets.map(function (b) {
        return '<div><span style="font-size:10px;opacity:.6">' + b.views + '</span>' +
               '<div class="b" style="height:' + Math.round((b.views / max) * 110) + 'px"></div>' +
               '<span class="t">' + b.label + '</span></div>';
      }).join('') + '</div></div>';

    var pages = topTable(rows, function (r) { return r.page || '—'; }, 'Page', 'Views');
    var prods = topTable(rows.filter(function (r) { return r.product_slug; }),
                         function (r) { return r.product_slug; }, 'Product', 'Views');
    var srcs = topTable(rows, function (r) { return r.referrer_host || (r.utm_source ? 'utm: ' + r.utm_source : 'Direct'); }, 'Source', 'Views');
    var devs = topTable(rows, function (r) { return (r.device || '—') + ' · ' + (r.browser || '—'); }, 'Device', 'Views');

    var seen = {};
    var recent = rows.slice(0, 400).filter(function (r) {
      var k = r.session_id; if (seen[k]) return false; seen[k] = 1; return true;
    }).slice(0, 25);

    var recentTbl = '<div class="kk-an-card"><h3>Recent visitors</h3>' +
      '<table class="data"><thead><tr><th>When</th><th>Who</th><th>Page</th><th>Source</th><th>Device</th><th>Visitor</th></tr></thead><tbody>' +
      (recent.map(function (r) {
        var who = r.profiles && r.profiles.full_name ? E(r.profiles.full_name)
                : (r.profiles && r.profiles.email ? E(r.profiles.email) : '<span style="opacity:.55">Guest</span>');
        var pageTxt = E(r.page || '') + (r.product_slug ? ' · ' + E(r.product_slug) : '');
        return '<tr><td>' + timeAgo(r.created_at) + '</td><td>' + who + '</td><td>' + pageTxt + '</td><td>' +
          E(r.referrer_host || (r.utm_source ? 'utm: ' + r.utm_source : 'Direct')) + '</td><td>' +
          E((r.device || '') + ' · ' + (r.os || '')) + '</td><td style="opacity:.5">' +
          E(String(r.visitor_id).slice(0, 8)) + '</td></tr>';
      }).join('') || '<tr><td colspan="6">Abhi koi visit record nahi hui</td></tr>') +
      '</tbody></table></div>';

    body.innerHTML = kpi + bars +
      '<div class="kk-an-two" style="margin-top:18px">' + pages + prods + '</div>' +
      '<div class="kk-an-two">' + srcs + devs + '</div>' + recentTbl;
  }

  function card(n, label) {
    return '<div class="kk-an-card"><div class="n">' + n + '</div><div class="l">' + label + '</div></div>';
  }

  function topTable(rows, keyFn, colA, colB) {
    var map = {};
    rows.forEach(function (r) { var k = keyFn(r) || '—'; map[k] = (map[k] || 0) + 1; });
    var list = Object.keys(map).map(function (k) { return { k: k, v: map[k] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
    return '<div class="kk-an-card"><h3>' + colA + 's</h3><table class="data"><thead><tr><th>' + colA +
      '</th><th style="width:70px">' + colB + '</th></tr></thead><tbody>' +
      (list.map(function (x) { return '<tr><td>' + E(x.k) + '</td><td>' + x.v + '</td></tr>'; }).join('') ||
       '<tr><td colspan="2">No data</td></tr>') + '</tbody></table></div>';
  }

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  function start() {
    installHooks();
    injectUI();
    setTimeout(function () { track(); }, 1400); 
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.KanikaraAnalytics = { track: track, config: CFG, visitorId: visitorId };
})();
