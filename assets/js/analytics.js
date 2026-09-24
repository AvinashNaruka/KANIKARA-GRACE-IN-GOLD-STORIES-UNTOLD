(function () {
  'use strict';

  var CFG = {
    TRACK_ADMINS: false,
    LOOKBACK_DAYS: 30,
    MAX_ROWS: 15000,              
    GEO_URL: 'https://ipwho.is/', 
    GEO_TTL_HOURS: 24,
    MIN_TIME_SPENT_SEC: 3
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
  var E = function (s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  };
  var val = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var safeDecode = function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } };

  function S() { return (typeof state !== 'undefined') ? state : null; }

  function normPhone(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length > 10) d = d.slice(-10);
    return d.length === 10 ? d : null;
  }

  function deviceInfo() {
    var ua = navigator.userAgent || '';
    var device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua) ? 'tablet'
               : /Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua) ? 'mobile' : 'desktop';
    var browser = /Edg\//i.test(ua) ? 'Edge' : /OPR\//i.test(ua) ? 'Opera' : /Chrome\//i.test(ua) ? 'Chrome'
                : /Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : 'Other';
    var os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android'
           : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Mac OS X/i.test(ua) ? 'macOS'
           : /Linux/i.test(ua) ? 'Linux' : 'Other';
    return { device: device, browser: browser, os: os };
  }

  function hostOf(url) {
    try {
      if (!url) return null;
      var h = new URL(url).hostname.replace(/^www\./, '');
      if (h === location.hostname.replace(/^www\./, '')) return null;
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
    var hp = new URLSearchParams((location.hash || '').split('?')[1] || '');
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
      var v = qs.get(k) || hp.get(k);
      if (v) utm[k] = v;
    });
    if (Object.keys(utm).length) ss.set(UTMKEY, JSON.stringify(utm));
  })();

  var firstReferrer = ss.get('kk_ref');
  if (firstReferrer === null) { firstReferrer = document.referrer || ''; ss.set('kk_ref', firstReferrer); }

  var geoPromise = null;
  function getGeo() {
    if (geoPromise) return geoPromise;
    var cached = null;
    try { cached = JSON.parse(ls.get('kk_geo') || 'null'); } catch (e) {}
    if (cached && cached.g && Date.now() - cached.t < CFG.GEO_TTL_HOURS * 36e5) {
      geoPromise = Promise.resolve(cached.g);
      return geoPromise;
    }
    geoPromise = fetch(CFG.GEO_URL, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || j.success === false) return {};
        var g = {
          country: j.country || null,
          region: j.region || null,
          city: j.city || null,
          postal_code: j.postal || null,
          latitude: j.latitude != null ? j.latitude : null,
          longitude: j.longitude != null ? j.longitude : null,
          timezone: (j.timezone && j.timezone.id) || null,
          isp: (j.connection && (j.connection.isp || j.connection.org)) || null
        };
        ls.set('kk_geo', JSON.stringify({ t: Date.now(), g: g }));
        return g;
      })
      .catch(function () { return {}; });
    return geoPromise;
  }
  function geoWithTimeout(ms) {
    return Promise.race([getGeo(), new Promise(function (r) { setTimeout(function () { r({}); }, ms); })]);
  }

  function identify(phone, name, email, source) {
    var p = normPhone(phone);
    if (!p || typeof sb === 'undefined' || !sb) return;
    var key = 'kk_id_' + p;
    if (ls.get(key) === visitorId) return;
    ls.set(key, visitorId);
    var s = S();
    sb.from('visitor_identities').upsert({
      visitor_id: visitorId, phone: p,
      name: name || null, email: email || null, source: source || null,
      user_id: (s && s.session && s.session.user) ? s.session.user.id : null
    }, { onConflict: 'visitor_id,phone', ignoreDuplicates: true }).then(function (r) {
      if (r && r.error) { ls.set(key, ''); console.warn('[analytics:identify]', r.error.message); }
    });
  }
  function autoIdentify() {
    var s = S();
    if (s && s.profile && s.profile.phone) {
      identify(s.profile.phone, s.profile.full_name, s.session && s.session.user && s.session.user.email, 'profile');
    }
  }

  function shouldTrack() {
    if (typeof sb === 'undefined' || !sb) return false;
    var s = S();
    if (!CFG.TRACK_ADMINS && s && s.isAdmin) return false;
    if (document.body.classList.contains('admin-mode')) return false;
    return true;
  }

  function baseRow(pageId, slug) {
    var s = S();
    var hash = (location.hash || '#home').slice(1).split('?')[0];
    var parts = hash.split('/');
    var page = pageId || parts[0] || 'home';
    if (slug === undefined) slug = (page === 'product' && parts[1]) ? safeDecode(parts[1]) : null;
    var d = deviceInfo();
    return {
      visitor_id: visitorId,
      session_id: sessionId,
      user_id: (s && s.session && s.session.user) ? s.session.user.id : null,
      page: page,
      path: '#' + page + (slug ? '/' + slug : ''),
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
      is_new_visitor: isNew,
      entered_pincode: ls.get('kk_pincode') || null,
      event: 'page_view',
      detail: null
    };
  }

  function send(row) {
    autoIdentify();
    geoWithTimeout(2500).then(function (g) {
      Object.keys(g || {}).forEach(function (k) { row[k] = g[k]; });
      sb.from('page_views').insert(row).then(function (r) {
        if (r && r.error) console.warn('[analytics]', r.error.message);
      });
    });
  }

  function logEvent(event, detail) {
    if (!shouldTrack()) return;
    var row = baseRow();
    row.event = event;
    row.detail = detail || null;
    send(row);
  }

  var lastKey = '', lastAt = 0;
  var cur = { key: null, page: null, slug: null, since: null };

  function flushTime() {
    if (!cur.key || !cur.since || !shouldTrack()) { cur.since = null; return; }
    var sec = Math.round((Date.now() - cur.since) / 1000);
    cur.since = null;
    if (sec < CFG.MIN_TIME_SPENT_SEC) return;
    var row = baseRow(cur.page, cur.slug);
    row.event = 'time_spent';
    row.detail = { seconds: Math.min(sec, 1800) };
    send(row);
  }

  function pageDetail(page) {
    var s = S();
    if (!s || page !== 'shop') return null;
    var f = s.filters || {}, d = {};
    if (f.category) d.category = f.category;
    if (f.search) d.search = f.search;
    if (f.tags && f.tags.length) d.tags = f.tags;
    return Object.keys(d).length ? d : null;
  }

  function track(pageId) {
    if (!shouldTrack()) return;
    var row = baseRow(pageId);
    var key = row.page + '|' + (row.product_slug || '');
    var now = Date.now();
    if (key === lastKey && now - lastAt < 1500) return;
    lastKey = key; lastAt = now;
    flushTime();
    cur = { key: key, page: row.page, slug: row.product_slug, since: now };
    row.detail = pageDetail(row.page);
    isNew = false;
    send(row);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushTime();
    else if (cur.key) cur.since = Date.now();
  });
  window.addEventListener('pagehide', flushTime);

  function wrapAfter(name, after) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__kkA) return;
    var fn = function () {
      var out = orig.apply(this, arguments);
      try { after.apply(null, arguments); } catch (e) {}
      return out;
    };
    fn.__kkA = true;
    window[name] = fn;
  }
  function wrapBefore(name, before) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__kkB) return;
    var fn = function () {
      try { before.apply(null, arguments); } catch (e) {}
      return orig.apply(this, arguments);
    };
    fn.__kkB = true;
    window[name] = fn;
  }

  function installHooks() {
    wrapAfter('showPage', function (id) { setTimeout(function () { track(id); }, 30); });
    wrapAfter('goProduct', function () { setTimeout(function () { track('product'); }, 30); });
    window.addEventListener('popstate', function () { setTimeout(function () { track(); }, 60); });

    // shopping behaviour
    wrapBefore('addToCart', function (pid, qty, variant) {
      logEvent('add_to_cart', { product_id: pid, qty: qty || 1, variant: variant ? variant.color_name : null });
    });
    wrapBefore('buyNow', function (pid, variant) {
      logEvent('buy_now', { product_id: pid, variant: variant ? variant.color_name : null });
    });
    wrapBefore('toggleWishlist', function (pid) { logEvent('wishlist_toggle', { product_id: pid }); });
    wrapBefore('doSearch', function () { var t = val('searchInput').trim(); if (t) logEvent('search', { term: t }); });
    wrapBefore('doSearchMobile', function () { var t = val('mqSearchInput').trim(); if (t) logEvent('search', { term: t }); });
    wrapBefore('setShopCategory', function (slug) { logEvent('category_filter', { category: slug || 'all' }); });
    wrapBefore('toggleTagFilter', function (tag, on) { if (on) logEvent('tag_filter', { tag: tag }); });
    wrapAfter('applyPriceFilter', function () {
      var s = S(); if (!s) return;
      logEvent('price_filter', { min: s.filters.minPrice, max: s.filters.maxPrice });
    });
    wrapBefore('applyCoupon', function () { logEvent('coupon_try', { code: val('couponInput').trim().toUpperCase() }); });
    wrapBefore('proceedCheckout', function () {
      var s = S();
      logEvent('checkout_click', { method: s ? s.selectedPayMethod : null, items: s ? s.cart.length : null });
    });
    wrapAfter('openPincodePrompt', function () {
      var p = ls.get('kk_pincode');
      if (p) logEvent('pincode_set', { pincode: p });
    });

    wrapBefore('handleSignup', function () {
      identify(val('signupPhone'), val('signupName'), val('signupEmail'), 'signup');
      logEvent('signup_submit');
    });
    wrapBefore('saveNewAddress', function () {
      identify(val('addrPhone'), val('addrName'), null, 'address');
    });
    wrapBefore('submitCustomOrder', function () {
      identify(val('coPhone'), val('coFullName'), val('coEmail'), 'custom_order');
      logEvent('custom_order_submit', { type: val('coType'), budget: val('coBudget') });
    });
    wrapBefore('submitCorporateEnquiry', function () {
      identify(val('corpPhone'), val('corpContact'), val('corpEmail'), 'corporate');
      logEvent('corporate_enquiry', { company: val('corpCompany') });
    });
  }

  function waitForAuthThenTrack() {
    var authCheck = (typeof sb !== 'undefined' && sb.auth && sb.auth.getSession)
      ? sb.auth.getSession().catch(function () { return null; }) : Promise.resolve(null);
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 6000); });
    Promise.race([authCheck, timeout]).then(function () { setTimeout(track, 400); });
  }

  var CSS = '' +
    '.kk-an-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:18px}' +
    '@media(max-width:900px){.kk-an-grid{grid-template-columns:1fr 1fr}}' +
    '.kk-an-card{background:var(--ivory-2,#faf7f2);border:1px solid var(--line-light,#e7e0d5);padding:18px;overflow-x:auto}' +
    '.kk-an-card .n{font-family:var(--serif,serif);font-size:30px;font-weight:700;line-height:1}' +
    '.kk-an-card .l{font-size:12px;opacity:.6;margin-top:6px;letter-spacing:.04em;text-transform:uppercase}' +
    '.kk-an-two{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}' +
    '@media(max-width:900px){.kk-an-two{grid-template-columns:1fr}}' +
    '.kk-bars{display:flex;align-items:flex-end;justify-content:center;gap:5px;height:150px;padding-top:10px}' +
    '.kk-bars>div{flex:1;max-width:70px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px}' +
    '.kk-bars .b{width:100%;background:linear-gradient(180deg,#d4af37,#b8912b);min-height:2px;border-radius:2px 2px 0 0}' +
    '.kk-bars .t{font-size:9px;opacity:.55;white-space:nowrap}' +
    '.kk-live{display:inline-flex;align-items:center;gap:7px;font-size:12px}' +
    '.kk-live i{width:8px;height:8px;border-radius:50%;background:#1f9d55;display:inline-block;animation:kkpulse 1.6s infinite}' +
    '@keyframes kkpulse{0%,100%{opacity:1}50%{opacity:.25}}' +
    '.kk-an-card h3{font-family:var(--serif,serif);margin-bottom:12px;font-size:17px}' +
    '.kk-an-card table.data td,.kk-an-card table.data th{font-size:12.5px;vertical-align:top}' +
    '.kk-seg{display:flex;gap:8px;flex-wrap:wrap}' +
    '.kk-seg button{border:1px solid var(--line-light,#e7e0d5);background:#fff;padding:7px 14px;font-size:12px;cursor:pointer;letter-spacing:.04em}' +
    '.kk-seg button.on{background:#221f1c;color:#fff;border-color:#221f1c}' +
    '.kk-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}' +
    '.kk-filters select,.kk-filters input[type=text]{border:1px solid var(--line-light,#e7e0d5);padding:8px 10px;font-size:12.5px;background:#fff}' +
    '.kk-filters label{font-size:12.5px;display:flex;gap:6px;align-items:center}' +
    '.kk-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:10px;background:#DCEEDF;color:#3F7156;margin-left:6px}' +
    '.kk-small{font-size:11px;opacity:.6;line-height:1.5}' +
    '.kk-tl{padding:6px 4px 10px 4px}' +
    '.kk-tl-meta{font-size:12px;margin-bottom:10px;line-height:1.7;opacity:.8}' +
    '.kk-tl-row{display:flex;gap:12px;padding:5px 0;border-bottom:1px dashed var(--line-light,#e7e0d5);font-size:12.5px}' +
    '.kk-tl-row .t{flex:0 0 118px;opacity:.55;font-size:11.5px}' +
    '.kk-tl-row i{opacity:.55;font-style:normal;margin-left:6px}' +
    '.kk-tl-sess{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:12px 0 4px;color:var(--gold,#C9A24B)}';

  var cache = { rows: null, idents: null, byId: {}, bySlug: {}, idByVisitor: {}, at: 0 };
  var ui = { days: 7, state: '', q: '', only: false };
  var vList = [], shownList = [];

  function injectUI() {
    var side = document.querySelector('.admin-side');
    var main = document.querySelector('.admin-main');
    if (!side || !main || document.querySelector('[data-pane="analytics"]')) return;

    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);

    var link = document.createElement('a');
    link.href = '#'; link.dataset.tab = 'analytics'; link.textContent = 'Analytics';
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
        ui.days = Number(b.dataset.d);
        renderAll();
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

  async function fetchAllRows(sel, since) {
    var out = [], size = 1000;
    for (var from = 0; from < CFG.MAX_ROWS; from += size) {
      var r = await sb.from('page_views').select(sel)
        .gte('created_at', since).order('created_at', { ascending: false })
        .range(from, from + size - 1);
      if (r.error) return { error: r.error };
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < size) break;
    }
    return { data: out };
  }

  window.loadAdminAnalytics = async function (force) {
    var body = document.getElementById('kkAnBody');
    if (!body) return;
    if (force || !cache.rows || Date.now() - cache.at > 60000) {
      body.innerHTML = '<p style="opacity:.6">Loading analytics…</p>';
      var since = new Date(Date.now() - CFG.LOOKBACK_DAYS * 864e5).toISOString();
      var res = await fetchAllRows('*, profiles(full_name, phone)', since);
      if (res.error) res = await fetchAllRows('*', since);
      if (res.error) {
        body.innerHTML = '<div class="dash-card"><b>Could not load analytics.</b><br><span style="opacity:.7">' +
          E(res.error.message) + '</span><br><br>Run <code>analytics-upgrade.sql</code> in the Supabase SQL Editor (after <code>analytics-schema.sql</code>).</div>';
        return;
      }
      var extra = await Promise.all([
        sb.from('visitor_identities').select('*').limit(10000),
        sb.from('products').select('id,name,slug,serial_no').limit(5000)
      ]);
      cache.rows = res.data || [];
      cache.idents = (extra[0] && extra[0].data) || [];
      cache.byId = {}; cache.bySlug = {}; cache.idByVisitor = {};
      ((extra[1] && extra[1].data) || []).forEach(function (p) { cache.byId[p.id] = p; cache.bySlug[p.slug] = p; });
      cache.idents.forEach(function (i) { (cache.idByVisitor[i.visitor_id] = cache.idByVisitor[i.visitor_id] || []).push(i); });
      cache.at = Date.now();
    }
    renderAll();
  };

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function timeAgo(ts) {
    var s = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }
  function fmtDT(ts) {
    return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function fmtDur(sec) {
    sec = Math.round(sec || 0);
    if (!sec) return '—';
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
  }
  function pName(ref) {
    var p = cache.bySlug[ref] || cache.byId[ref];
    return p ? p.name : (ref || '—');
  }
  function pFull(ref) {
    var p = cache.bySlug[ref] || cache.byId[ref];
    return p ? ((p.serial_no ? p.serial_no + ' · ' : '') + p.name) : (ref || '—');
  }
  var PAGE_TITLES = {
    home: 'Home', shop: 'Shop', product: 'Product', wishlist: 'Wishlist', dashboard: 'My Account / Orders',
    checkout: 'Checkout', 'order-confirm': 'Order confirmation ✅', 'custom-order': 'Custom Order',
    'gift-store': 'Gift Store', 'corporate-gifting': 'Corporate Gifting', 'smart-plan': 'Smart Plan',
    'store-locator': 'Store Locator', 'jewellery-care': 'Jewellery Care', policies: 'Policies'
  };
  function pageTitle(p) { return PAGE_TITLES[p] || p || '—'; }
  function geoText(g) {
    if (!g) return '<span style="opacity:.55">Unknown</span>';
    var a = [g.city, g.region].filter(Boolean).join(', ');
    if (g.country && g.country !== 'India') a += (a ? ', ' : '') + g.country;
    return a ? E(a) : '<span style="opacity:.55">Unknown</span>';
  }
  function countBy(rows, keyFn) {
    var m = {};
    rows.forEach(function (r) { var k = keyFn(r); if (k == null || k === '') return; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { k: k, v: m[k] }; }).sort(function (a, b) { return b.v - a.v; });
  }
  function card(n, label) { return '<div class="kk-an-card"><div class="n">' + n + '</div><div class="l">' + label + '</div></div>'; }
  function tableCard(title, heads, rowsHtml) {
    return '<div class="kk-an-card"><h3>' + title + '</h3><table class="data"><thead><tr>' +
      heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rowsHtml || '<tr><td colspan="' + heads.length + '">No data yet</td></tr>') + '</tbody></table></div>';
  }
  function simpleTop(title, colA, items, limit) {
    return tableCard(title, [colA, 'Views'], items.slice(0, limit || 8).map(function (x) {
      return '<tr><td>' + E(x.k) + '</td><td>' + x.v + '</td></tr>';
    }).join(''));
  }

  function buildVisitors(rows) {
    var map = {}, list = [];
    rows.forEach(function (r) {            
      var v = map[r.visitor_id];
      if (!v) {
        v = map[r.visitor_id] = { id: r.visitor_id, rows: [], last: r.created_at, sessions: {}, views: 0, seconds: 0,
          geo: null, dev: null, profile: null, user_id: null, pin: null, products: {} };
        list.push(v);
      }
      v.rows.push(r);
      v.firstRow = r;                      // ends as the oldest row
      v.sessions[r.session_id] = 1;
      if (!v.geo && (r.city || r.region || r.country)) v.geo = r;
      if (!v.dev) v.dev = r;
      if (!v.pin && r.entered_pincode) v.pin = r.entered_pincode;
      if (r.user_id && !v.user_id) { v.user_id = r.user_id; v.profile = r.profiles || null; }
      var ev = r.event || 'page_view';
      if (ev === 'page_view') {
        v.views++;
        if (r.product_slug) v.products[r.product_slug] = (v.products[r.product_slug] || 0) + 1;
      }
      if (ev === 'time_spent' && r.detail) v.seconds += Number(r.detail.seconds) || 0;
    });
    list.forEach(function (v) {
      var ids = cache.idByVisitor[v.id] || [];
      var phones = [], seen = {};
      function addPhone(p) { p = normPhone(p); if (p && !seen[p]) { seen[p] = 1; phones.push(p); } }
      if (v.profile && v.profile.phone) addPhone(v.profile.phone);
      ids.forEach(function (i) { addPhone(i.phone); });
      v.phones = phones;
      v.name = (v.profile && v.profile.full_name) ||
               (ids.filter(function (i) { return i.name; })[0] || {}).name || null;
      v.emails = ids.map(function (i) { return i.email; }).filter(Boolean);
      v.sessionCount = Object.keys(v.sessions).length;
    });
    return list;
  }

  function eventLine(r) {
    var ev = r.event || 'page_view', d = r.detail || {};
    switch (ev) {
      case 'page_view':
        if (r.page === 'product') return { icon: '👁', text: 'Viewed product: <b>' + E(pFull(r.product_slug)) + '</b>' };
        var extra = '';
        if (d.category) extra += ' · category: ' + E(d.category);
        if (d.search) extra += ' · search: “' + E(d.search) + '”';
        if (Array.isArray(d.tags) && d.tags.length) extra += ' · ' + E(d.tags.join(', '));
        return { icon: '📄', text: 'Opened <b>' + E(pageTitle(r.page)) + '</b>' + extra };
      case 'search': return { icon: '🔍', text: 'Searched “<b>' + E(d.term) + '</b>”' };
      case 'category_filter': return { icon: '📂', text: 'Filtered category: <b>' + E(d.category) + '</b>' };
      case 'tag_filter': return { icon: '🏷', text: 'Filter: <b>' + E(d.tag) + '</b>' };
      case 'price_filter': return { icon: '₹', text: 'Price filter ' + E(d.min == null ? '' : d.min) + ' – ' + E(d.max == null ? '' : d.max) };
      case 'add_to_cart': return { icon: '🛍', text: 'Added to bag: <b>' + E(pFull(d.product_id)) + '</b>' + (d.variant ? ' (' + E(d.variant) + ')' : '') + ' × ' + E(d.qty || 1) };
      case 'buy_now': return { icon: '⚡', text: 'Clicked Buy Now: <b>' + E(pFull(d.product_id)) + '</b>' };
      case 'wishlist_toggle': return { icon: '♡', text: 'Wishlist tapped: <b>' + E(pFull(d.product_id)) + '</b>' };
      case 'coupon_try': return { icon: '🎟', text: 'Tried coupon <b>' + E(d.code) + '</b>' };
      case 'checkout_click': return { icon: '💳', text: 'Clicked Place Order (' + E(d.method || '—') + ', ' + E(d.items || 0) + ' item(s) in bag)' };
      case 'pincode_set': return { icon: '📍', text: 'Set delivery pincode <b>' + E(d.pincode) + '</b>' };
      case 'signup_submit': return { icon: '👤', text: 'Submitted sign-up form' };
      case 'custom_order_submit': return { icon: '✧', text: 'Submitted custom order (' + E(d.type || '') + ', ' + E(d.budget || '') + ')' };
      case 'corporate_enquiry': return { icon: '🏢', text: 'Submitted corporate enquiry' + (d.company ? ' — ' + E(d.company) : '') };
      default: return { icon: '•', text: E(ev) };
    }
  }

  function journeyHTML(v) {
    var asc = v.rows.slice().reverse();
    var lines = [], lastBy = {};
    asc.forEach(function (r) {
      if ((r.event || 'page_view') === 'time_spent') {
        var k = r.page + '|' + (r.product_slug || '');
        if (lastBy[k]) lastBy[k].sec = (lastBy[k].sec || 0) + (Number(r.detail && r.detail.seconds) || 0);
        return;
      }
      var l = eventLine(r);
      l.t = r.created_at; l.sid = r.session_id;
      if ((r.event || 'page_view') === 'page_view') lastBy[r.page + '|' + (r.product_slug || '')] = l;
      lines.push(l);
    });
    var g = v.geo || {};
    var meta = '<div class="kk-tl-meta">' +
      '<b>Location:</b> ' + geoText(v.geo) +
      (g.postal_code ? ' · IP area PIN ~' + E(g.postal_code) : '') +
      (v.pin ? ' · <b>PIN entered by visitor: ' + E(v.pin) + '</b>' : '') +
      (g.isp ? '<br><b>Network:</b> ' + E(g.isp) : '') +
      (v.dev ? '<br><b>Device:</b> ' + E((v.dev.device || '') + ' · ' + (v.dev.browser || '') + ' · ' + (v.dev.os || '') + (v.dev.screen_w ? ' · ' + v.dev.screen_w + '×' + v.dev.screen_h : '')) : '') +
      (v.emails.length ? '<br><b>Email:</b> ' + E(v.emails.join(', ')) : '') +
      '<br><b>First seen:</b> ' + fmtDT(v.firstRow.created_at) + ' · <b>Visitor ID:</b> ' + E(String(v.id).slice(0, 8)) +
      '</div>';
    var html = '', lastSid = null;
    lines.forEach(function (l) {
      if (l.sid !== lastSid) { html += '<div class="kk-tl-sess">Session · ' + fmtDT(l.t) + '</div>'; lastSid = l.sid; }
      html += '<div class="kk-tl-row"><span class="t">' + fmtDT(l.t) + '</span><span>' + l.icon + ' ' + l.text +
        (l.sec ? '<i>· stayed ' + fmtDur(l.sec) + '</i>' : '') + '</span></div>';
    });
    return '<div class="kk-tl">' + meta + (html || '<p style="opacity:.6">No activity in this range.</p>') + '</div>';
  }

  function renderAll() {
    var body = document.getElementById('kkAnBody');
    if (!body || !cache.rows) return;
    var days = ui.days;
    var from = days === 1 ? startOfDay(new Date()) : new Date(Date.now() - days * 864e5);
    var all = cache.rows;
    var rows = all.filter(function (r) { return new Date(r.created_at) >= from; });
    var views = rows.filter(function (r) { return (r.event || 'page_view') === 'page_view'; });
    var ev = function (name) { return rows.filter(function (r) { return r.event === name; }); };
    var uniq = function (arr, key) { var s = {}; arr.forEach(function (r) { if (r[key]) s[r[key]] = 1; }); return Object.keys(s).length; };

    vList = buildVisitors(rows);
    var liveRows = all.filter(function (r) { return Date.now() - new Date(r.created_at) < 5 * 60000; });
    var withPhone = vList.filter(function (v) { return v.phones.length; }).length;
    var loggedIn = vList.filter(function (v) { return v.user_id; }).length;
    var orders = views.filter(function (r) { return r.page === 'order-confirm'; });

    var kpi =
      '<div class="kk-an-grid">' +
        card(views.length, 'Page views (' + (days === 1 ? 'today' : days + 'd') + ')') +
        card(vList.length, 'Unique visitors') +
        card(uniq(rows, 'session_id'), 'Sessions') +
        card(uniq(liveRows, 'visitor_id'), '<span class="kk-live"><i></i>Online now</span>') +
      '</div><div class="kk-an-grid">' +
        card(withPhone, 'Visitors with phone no.') +
        card(loggedIn, 'Logged-in visitors') +
        card(ev('add_to_cart').length, 'Add-to-bag clicks') +
        card(uniq(orders, 'session_id'), 'Order confirmations') +
      '</div>';

    // chart
    var buckets = [], chartTitle;
    var pv = all.filter(function (r) { return (r.event || 'page_view') === 'page_view'; });
    if (days === 1) {
      chartTitle = 'Views by hour (today)';
      var day0 = startOfDay(new Date());
      for (var h = 0; h < 24; h++) {
        var h0 = new Date(day0.getTime() + h * 36e5), h1 = new Date(h0.getTime() + 36e5);
        buckets.push({ label: (h % 3 === 0 ? h + 'h' : ''), views: pv.filter(function (r) { var t = new Date(r.created_at); return t >= h0 && t < h1; }).length });
      }
    } else {
      chartTitle = 'Daily views';
      for (var i = days - 1; i >= 0; i--) {
        var d0 = startOfDay(new Date(Date.now() - i * 864e5)), d1 = new Date(d0.getTime() + 864e5);
        buckets.push({ label: d0.getDate() + '/' + (d0.getMonth() + 1), views: pv.filter(function (r) { var t = new Date(r.created_at); return t >= d0 && t < d1; }).length });
      }
    }
    var max = Math.max.apply(null, buckets.map(function (b) { return b.views; }).concat([1]));
    var bars = '<div class="kk-an-card" style="margin-bottom:18px"><h3>' + chartTitle + '</h3><div class="kk-bars">' +
      buckets.map(function (b) {
        return '<div><span style="font-size:10px;opacity:.6">' + (b.views || '') + '</span><div class="b" style="height:' +
          Math.round((b.views / max) * 110) + 'px"></div><span class="t">' + b.label + '</span></div>';
      }).join('') + '</div></div>';

    var stateMap = {}, cityMap = {};
    vList.forEach(function (v) {
      var st = (v.geo && v.geo.region) || 'Unknown';
      var ct = v.geo && v.geo.city ? v.geo.city + (v.geo.region ? ', ' + v.geo.region : '') : 'Unknown';
      (stateMap[st] = stateMap[st] || { vis: 0, views: 0 }); stateMap[st].vis++; stateMap[st].views += v.views;
      (cityMap[ct] = cityMap[ct] || { vis: 0, views: 0 }); cityMap[ct].vis++; cityMap[ct].views += v.views;
    });
    var geoRows = function (m) {
      return Object.keys(m).sort(function (a, b) { return m[b].vis - m[a].vis; }).slice(0, 10).map(function (k) {
        return '<tr><td>' + E(k) + '</td><td>' + m[k].vis + '</td><td>' + m[k].views + '</td></tr>';
      }).join('');
    };
    var statesCard = tableCard('Visitors by state', ['State', 'Visitors', 'Views'], geoRows(stateMap));
    var citiesCard = tableCard('Visitors by city', ['City', 'Visitors', 'Views'], geoRows(cityMap));

    var pm = {};
    var pget = function (ref) { var p = cache.bySlug[ref] || cache.byId[ref]; var k = p ? p.id : ref; return pm[k] = pm[k] || { ref: ref, views: 0, vis: {}, atc: 0, wish: 0 }; };
    views.forEach(function (r) { if (r.product_slug) { var x = pget(r.product_slug); x.views++; x.vis[r.visitor_id] = 1; } });
    rows.forEach(function (r) {
      if (r.event === 'add_to_cart' && r.detail) pget(r.detail.product_id).atc++;
      if (r.event === 'wishlist_toggle' && r.detail) pget(r.detail.product_id).wish++;
    });
    var prodRows = Object.keys(pm).map(function (k) { return pm[k]; })
      .sort(function (a, b) { return (b.views + b.atc * 3) - (a.views + a.atc * 3); }).slice(0, 10)
      .map(function (x) {
        return '<tr><td>' + E(pFull(x.ref)) + '</td><td>' + x.views + '</td><td>' + Object.keys(x.vis).length + '</td><td>' + x.atc + '</td><td>' + x.wish + '</td></tr>';
      }).join('');
    var prodCard = tableCard('Most viewed products', ['Product', 'Views', 'Visitors', 'Bag', '♡'], prodRows);

    var searchCard = simpleTop('What people searched', 'Search term',
      countBy(ev('search'), function (r) { return r.detail && r.detail.term ? String(r.detail.term).toLowerCase() : null; }), 10)
      .replace('<th>Views</th>', '<th>Times</th>');

    var pagesCard = simpleTop('Pages', 'Page', countBy(views, function (r) { return pageTitle(r.page); }), 10);
    var srcCard = simpleTop('Traffic sources', 'Source', countBy(views, function (r) { return r.referrer_host || (r.utm_source ? 'utm: ' + r.utm_source : 'Direct'); }));
    var devCard = simpleTop('Devices', 'Device', countBy(views, function (r) { return (r.device || '—') + ' · ' + (r.browser || '—'); }));

    var stateOpts = Object.keys(stateMap).sort(function (a, b) { return stateMap[b].vis - stateMap[a].vis; });
    if (stateOpts.indexOf(ui.state) < 0) ui.state = '';

    var filters =
      '<div class="kk-filters">' +
        '<select onchange="kkSetFilter(\'state\',this.value)"><option value="">All states</option>' +
          stateOpts.map(function (s) { return '<option value="' + E(s) + '"' + (ui.state === s ? ' selected' : '') + '>' + E(s) + ' (' + stateMap[s].vis + ')</option>'; }).join('') +
        '</select>' +
        '<input type="text" placeholder="Search name / phone / city / PIN" value="' + E(ui.q) + '" oninput="kkSetFilter(\'q\',this.value)" style="min-width:250px">' +
        '<label><input type="checkbox" ' + (ui.only ? 'checked' : '') + ' onchange="kkSetFilter(\'only\',this.checked)"> Only with phone no.</label>' +
        '<button class="btn btn-line-dark btn-sm" onclick="kkExportCsv()">⬇ Export CSV</button>' +
      '</div>';

    body.innerHTML = kpi + bars +
      '<div class="kk-an-two">' + statesCard + citiesCard + '</div>' +
      '<div class="kk-an-two">' + prodCard + searchCard + '</div>' +
      '<div class="kk-an-two">' + pagesCard + srcCard + '</div>' +
      '<div class="kk-an-two">' + devCard + '<div class="kk-an-card"><h3>Good to know</h3><p class="kk-small" style="font-size:12.5px;opacity:.75">' +
        'Location is detected from the visitor\'s IP, so it is approximate (city level). On mobile data it can show a nearby city. ' +
        'Exact area comes from the PIN the visitor types in “Delivery Pincode” or in their address. ' +
        'Phone numbers appear only when the visitor themself submitted them (sign-up, address, custom order, corporate enquiry, or their account profile).</p></div></div>' +
      '<div class="kk-an-card"><h3>Visitors <span class="kk-small" id="kkVisCount"></span></h3>' + filters +
      '<div id="kkVisTbl"></div></div>';

    renderVisitors();
  }

  function filteredVisitors() {
    var q = ui.q.trim().toLowerCase();
    return vList.filter(function (v) {
      if (ui.state && ((v.geo && v.geo.region) || 'Unknown') !== ui.state) return false;
      if (ui.only && !v.phones.length) return false;
      if (q) {
        var hay = [v.name, v.phones.join(' '), v.geo && v.geo.city, v.geo && v.geo.region, v.pin, v.geo && v.geo.postal_code,
          Object.keys(v.products).map(pName).join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderVisitors() {
    var host = document.getElementById('kkVisTbl');
    if (!host) return;
    var all = filteredVisitors();
    shownList = all.slice(0, 200);
    var cnt = document.getElementById('kkVisCount');
    if (cnt) cnt.textContent = '— showing ' + shownList.length + ' of ' + all.length;

    host.innerHTML = '<div style="overflow-x:auto"><table class="data"><thead><tr>' +
      '<th>Last seen</th><th>Who</th><th>Phone</th><th>Location</th><th>Device</th><th>Came from</th><th>Viewed</th><th>Time</th><th></th></tr></thead><tbody>' +
      (shownList.map(function (v, i) {
        var prodKeys = Object.keys(v.products);
        var g = v.geo || {};
        var who = (v.name ? '<b>' + E(v.name) + '</b>' : '<span style="opacity:.6">Guest</span>') +
          (v.user_id ? '<span class="kk-tag">Member</span>' : '') +
          '<div class="kk-small">' + E(String(v.id).slice(0, 8)) + ' · ' + v.sessionCount + ' visit' + (v.sessionCount === 1 ? '' : 's') + '</div>';
        var ph = v.phones.length
          ? v.phones.map(function (p) {
              return '<a href="tel:+91' + p + '">' + p + '</a> <a href="https://wa.me/91' + p + '" target="_blank" rel="noopener" title="WhatsApp" style="color:#25D366;font-weight:700">WA</a>';
            }).join('<br>')
          : '<span class="kk-small">Not shared</span>';
        var loc = geoText(v.geo) +
          '<div class="kk-small">' + (v.pin ? 'PIN entered: <b>' + E(v.pin) + '</b>' : (g.postal_code ? 'IP area PIN ~' + E(g.postal_code) : '')) + '</div>';
        var src = (v.firstRow && (v.firstRow.referrer_host || (v.firstRow.utm_source ? 'utm: ' + v.firstRow.utm_source : ''))) || 'Direct';
        var viewed = v.views + ' page' + (v.views === 1 ? '' : 's') +
          (prodKeys.length ? '<div class="kk-small">' + prodKeys.length + ' product' + (prodKeys.length === 1 ? '' : 's') + ': ' +
            E(prodKeys.slice(0, 2).map(pName).join(', ') + (prodKeys.length > 2 ? '…' : '')) + '</div>' : '');
        return '<tr><td>' + timeAgo(v.last) + '</td><td>' + who + '</td><td>' + ph + '</td><td>' + loc + '</td><td>' +
          E((v.dev && v.dev.device || '') + ' · ' + (v.dev && v.dev.os || '')) + '</td><td>' + E(src) + '</td><td>' + viewed + '</td><td>' +
          fmtDur(v.seconds) + '</td><td><button class="action-btn" onclick="kkJourney(' + i + ')">Journey ▾</button></td></tr>' +
          '<tr class="hide" id="kkj_' + i + '"><td colspan="9" style="background:rgba(201,162,75,.05)"></td></tr>';
      }).join('') || '<tr><td colspan="9">No visitors match.</td></tr>') +
      '</tbody></table></div>';
  }

  window.kkSetFilter = function (k, v) { ui[k] = v; renderVisitors(); };
  window.kkJourney = function (i) {
    var tr = document.getElementById('kkj_' + i);
    if (!tr) return;
    if (tr.classList.contains('hide')) {
      if (!tr.firstChild.innerHTML) tr.firstChild.innerHTML = journeyHTML(shownList[i]);
      tr.classList.remove('hide');
    } else tr.classList.add('hide');
  };

  window.kkExportCsv = function () {
    var out = [['Last seen', 'Name', 'Phone(s)', 'Email(s)', 'City', 'State', 'Country', 'PIN entered', 'IP area PIN', 'Device', 'Browser', 'OS',
      'Came from', 'Visits', 'Page views', 'Products viewed', 'Time on site (sec)']];
    filteredVisitors().forEach(function (v) {
      var g = v.geo || {}, d = v.dev || {};
      out.push([new Date(v.last).toLocaleString('en-IN'), v.name || '', v.phones.join(' / '), v.emails.join(' / '),
        g.city || '', g.region || '', g.country || '', v.pin || '', g.postal_code || '', d.device || '', d.browser || '', d.os || '',
        (v.firstRow && (v.firstRow.referrer_host || v.firstRow.utm_source)) || 'Direct', v.sessionCount, v.views,
        Object.keys(v.products).map(pName).join(' | '), v.seconds]);
    });
    var csv = '\ufeff' + out.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'kanikara-visitors-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  };

  function start() {
    installHooks();
    injectUI();
    waitForAuthThenTrack();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.KanikaraAnalytics = { track: track, logEvent: logEvent, identify: identify, config: CFG, visitorId: visitorId };
})();
