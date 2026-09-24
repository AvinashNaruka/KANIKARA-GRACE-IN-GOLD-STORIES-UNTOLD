(function () {
  'use strict';

  var CFG = {
    TRACK_ADMINS: false,
    LOOKBACK_DAYS: 30,
    MAX_ROWS: 15000,
    GEO_TTL_HOURS: 24,
    MIN_TIME_SPENT_SEC: 3,
    LEAD_POPUP: true,         
    LEAD_AFTER_PRODUCTS: 2,    
    LEAD_AFTER_SEC: 60,         
    LEAD_COOLDOWN_DAYS: 7
  };

  var BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|whatsapp\/|telegrambot|curl|wget|python|node-fetch|vercel|screenshot/i;
  var DC_ISP = /amazon|aws|digitalocean|ovh|hetzner|linode|vultr|contabo|leaseweb|vercel|datacamp|m247|scaleway|choopa/i;
  function isBotRow(r) { return r.is_bot === true || DC_ISP.test(r.isp || ''); }

  var uid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
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
           : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Mac OS X/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Other';
    return { device: device, browser: browser, os: os };
  }
  function hostOf(url) {
    try {
      if (!url) return null;
      var h = new URL(url).hostname.replace(/^www\./, '');
      return h === location.hostname.replace(/^www\./, '') ? null : h;
    } catch (e) { return null; }
  }
  var IS_BOT_UA = BOT_UA.test(navigator.userAgent || '') || navigator.webdriver === true;
  var startedAt = Date.now();

  var isNew = false;
  var visitorId = ls.get('kk_visitor_id');
  if (!visitorId) { visitorId = uid(); ls.set('kk_visitor_id', visitorId); isNew = true; }
  var sessionId = ss.get('kk_session_id');
  if (!sessionId) { sessionId = uid(); ss.set('kk_session_id', sessionId); }
  var utm = {};
  try { utm = JSON.parse(ss.get('kk_utm') || '{}'); } catch (e) { utm = {}; }
  (function () {
    var qs = new URLSearchParams(location.search || '');
    var hp = new URLSearchParams((location.hash || '').split('?')[1] || '');
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) { var v = qs.get(k) || hp.get(k); if (v) utm[k] = v; });
    if (Object.keys(utm).length) ss.set('kk_utm', JSON.stringify(utm));
  })();
  var firstReferrer = ss.get('kk_ref');
  if (firstReferrer === null) { firstReferrer = document.referrer || ''; ss.set('kk_ref', firstReferrer); }

  /* ---------------- geo: Vercel edge (same-origin, ad-block proof) + ipwho.is + ipapi.co fallback ---------------- */
  var IN_STATES = {AN:'Andaman and Nicobar Islands',AP:'Andhra Pradesh',AR:'Arunachal Pradesh',AS:'Assam',BR:'Bihar',CH:'Chandigarh',CG:'Chhattisgarh',CT:'Chhattisgarh',
    DD:'Daman and Diu',DH:'Dadra and Nagar Haveli and Daman and Diu',DN:'Dadra and Nagar Haveli',DL:'Delhi',GA:'Goa',GJ:'Gujarat',HR:'Haryana',HP:'Himachal Pradesh',
    JK:'Jammu and Kashmir',JH:'Jharkhand',KA:'Karnataka',KL:'Kerala',LA:'Ladakh',LD:'Lakshadweep',MP:'Madhya Pradesh',MH:'Maharashtra',MN:'Manipur',ML:'Meghalaya',
    MZ:'Mizoram',NL:'Nagaland',OD:'Odisha',OR:'Odisha',PY:'Puducherry',PB:'Punjab',RJ:'Rajasthan',SK:'Sikkim',TN:'Tamil Nadu',TG:'Telangana',TS:'Telangana',
    TR:'Tripura',UP:'Uttar Pradesh',UK:'Uttarakhand',UT:'Uttarakhand',WB:'West Bengal'};
  function countryName(code) { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code); } catch (e) { return code; } }
  function parseVercel(j) {
    if (!j || !j.ok) return null;
    return { country: countryName(j.country), region: j.country === 'IN' ? (IN_STATES[j.regionCode] || j.regionCode) : j.regionCode, city: j.city || null,
      postal_code: j.postal || null, latitude: j.latitude != null ? Number(j.latitude) : null, longitude: j.longitude != null ? Number(j.longitude) : null,
      timezone: j.timezone || null, isp: null };
  }
  function parseIpwho(j) {
    if (!j || j.success === false) return null;
    return { country: j.country || null, region: j.region || null, city: j.city || null, postal_code: j.postal || null,
      latitude: j.latitude != null ? j.latitude : null, longitude: j.longitude != null ? j.longitude : null,
      timezone: (j.timezone && j.timezone.id) || null, isp: (j.connection && (j.connection.isp || j.connection.org)) || null };
  }
  function parseIpapi(j) {
    if (!j || j.error) return null;
    return { country: j.country_name || null, region: j.region || null, city: j.city || null, postal_code: j.postal || null,
      latitude: j.latitude != null ? j.latitude : null, longitude: j.longitude != null ? j.longitude : null, timezone: j.timezone || null, isp: j.org || null };
  }
  function tryGeo(url, parse, ms) {
    var req = fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(function (j) {
      var g = parse(j); if (!g || !(g.city || g.region || g.country)) throw new Error('empty'); return g;
    });
    return Promise.race([req, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms || 2000); })]);
  }
  var geoPromise = null;
  function getGeo() {
    if (geoPromise) return geoPromise;
    var cached = null;
    try { cached = JSON.parse(ls.get('kk_geo2') || 'null'); } catch (e) {}
    if (cached && cached.g && Date.now() - cached.t < CFG.GEO_TTL_HOURS * 36e5) return (geoPromise = Promise.resolve(cached.g));
    var safe = function (p) { return p.catch(function () { return null; }); };
    geoPromise = Promise.all([safe(tryGeo('/api/geo', parseVercel, 1500)), safe(tryGeo('https://ipwho.is/', parseIpwho, 1800))])
      .then(function (r) {
        var v = r[0], w = r[1];
        if (v || w) {
          var g = Object.assign({}, v || w);
          if (v && w) {                                   
            if (v.country !== 'India') g.region = w.region || g.region;
            g.isp = w.isp; g.postal_code = g.postal_code || w.postal_code;
          }
          return g;
        }
        return safe(tryGeo('https://ipapi.co/json/', parseIpapi, 2000));
      })
      .then(function (g) { if (g) ls.set('kk_geo2', JSON.stringify({ t: Date.now(), g: g })); return g || {}; })
      .catch(function () { return {}; });
    return geoPromise;
  }
  function geoWithTimeout(ms) {
    return Promise.race([getGeo(), new Promise(function (r) { setTimeout(function () { r({}); }, ms); })]);
  }

  function identify(phone, name, email, source, opts) {
    var p = normPhone(phone);
    if (!p || typeof sb === 'undefined' || !sb) return;
    opts = opts || {};
    ls.set('kk_has_phone', '1');
    var key = 'kk_id_' + p;
    if (ls.get(key) === visitorId) return;
    ls.set(key, visitorId);
    var s = S();
    sb.from('visitor_identities').upsert({
      visitor_id: visitorId, phone: p, name: name || null, email: email || null, source: source || null,
      user_id: (s && s.session && s.session.user) ? s.session.user.id : null,
      consent: !!opts.consent, consent_at: opts.consent ? new Date().toISOString() : null, note: opts.note || null
    }, { onConflict: 'visitor_id,phone', ignoreDuplicates: true }).then(function (r) {
      if (r && r.error) { ls.set(key, ''); console.warn('[analytics:identify]', r.error.message); }
    });
  }
  function autoIdentify() {
    var s = S();
    if (!s || !s.session || !s.session.user) return;
    var u = s.session.user, meta = u.user_metadata || {}, prof = s.profile || {};
    var phone = prof.phone || meta.phone;
    if (phone) identify(phone, prof.full_name || meta.full_name, u.email, prof.phone ? 'profile' : 'signup');
    if (s.profile && !prof.phone && meta.phone && typeof api !== 'undefined' && api.updateProfile && !ls.get('kk_phfix_' + u.id)) {
      ls.set('kk_phfix_' + u.id, '1');
      var clean = normPhone(meta.phone) || meta.phone;
      api.updateProfile(u.id, { phone: clean }).then(function () { s.profile.phone = clean; }).catch(function () {});
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
    var parts = (location.hash || '#home').slice(1).split('?')[0].split('/');
    var page = pageId || parts[0] || 'home';
    if (slug === undefined) slug = (page === 'product' && parts[1]) ? safeDecode(parts[1]) : null;
    var d = deviceInfo();
    return {
      visitor_id: visitorId, session_id: sessionId,
      user_id: (s && s.session && s.session.user) ? s.session.user.id : null,
      page: page, path: '#' + page + (slug ? '/' + slug : ''), product_slug: slug,
      referrer: firstReferrer || null, referrer_host: hostOf(firstReferrer),
      utm_source: utm.utm_source || null, utm_medium: utm.utm_medium || null, utm_campaign: utm.utm_campaign || null,
      device: d.device, browser: d.browser, os: d.os,
      screen_w: window.screen ? screen.width : null, screen_h: window.screen ? screen.height : null,
      lang: navigator.language || null, is_new_visitor: isNew,
      entered_pincode: ls.get('kk_pincode') || null, is_bot: IS_BOT_UA, event: 'page_view', detail: null
    };
  }
  function send(row) {
    autoIdentify();
    geoWithTimeout(2500).then(function (g) {
      Object.keys(g || {}).forEach(function (k) { row[k] = g[k]; });
      if (DC_ISP.test(row.isp || '')) row.is_bot = true;
      sb.from('page_views').insert(row).then(function (r) { if (r && r.error) console.warn('[analytics]', r.error.message); });
    });
  }
  function logEvent(event, detail) {
    if (!shouldTrack()) return;
    var row = baseRow(); row.event = event; row.detail = detail || null; send(row);
  }

  var lastKey = '', lastAt = 0;
  var cur = { key: null, page: null, slug: null, since: null };
  function flushTime() {
    if (!cur.key || !cur.since || !shouldTrack()) { cur.since = null; return; }
    var sec = Math.round((Date.now() - cur.since) / 1000);
    cur.since = null;
    if (sec < CFG.MIN_TIME_SPENT_SEC) return;
    var row = baseRow(cur.page, cur.slug); row.event = 'time_spent'; row.detail = { seconds: Math.min(sec, 1800) }; send(row);
  }
  function pageDetail(page) {
    var s = S(); if (!s || page !== 'shop') return null;
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
    if (row.page === 'product') {
      var n = Number(ss.get('kk_pv_prod') || 0) + 1; ss.set('kk_pv_prod', String(n));
      if (n >= CFG.LEAD_AFTER_PRODUCTS) setTimeout(function () { showLead('products'); }, 4000);
    }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushTime(); else if (cur.key) cur.since = Date.now();
  });
  window.addEventListener('pagehide', flushTime);

  var LEAD_CSS =
    '.kk-lead{position:fixed;left:50%;transform:translateX(-50%);bottom:20px;width:min(390px,calc(100vw - 24px));z-index:150;background:var(--ivory,#F7F2E7);color:var(--charcoal,#221F1C);border:1px solid var(--gold-line,rgba(201,162,75,.35));box-shadow:0 24px 64px rgba(14,22,48,.28);padding:22px 22px 18px;animation:kkLeadIn .35s ease}' +
    '@keyframes kkLeadIn{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}' +
    '.kk-lead h4{font-family:var(--serif,Georgia,serif);font-size:20px;margin:0 22px 6px 0;line-height:1.2}' +
    '.kk-lead p{font-size:13px;line-height:1.55;color:rgba(34,31,28,.68);margin:0 0 12px}' +
    '.kk-lead input[type=text],.kk-lead input[type=tel]{width:100%;border:1px solid var(--line-light,rgba(34,31,28,.12));background:#fff;padding:11px 12px;font-size:14px;margin-bottom:8px;font-family:inherit}' +
    '.kk-lead-c{display:flex;gap:8px;align-items:flex-start;font-size:11.5px;line-height:1.45;color:rgba(34,31,28,.65);margin:4px 0 8px}' +
    '.kk-lead-c input{margin-top:2px;accent-color:var(--gold,#C9A24B)}' +
    '.kk-lead-err{color:var(--danger,#A23B3B);font-size:12px;min-height:16px}' +
    '.kk-lead-go{width:100%;background:var(--gold,#C9A24B);color:var(--ink,#0E1630);border:0;padding:12px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}' +
    '.kk-lead-x{position:absolute;top:8px;right:10px;background:none;border:0;font-size:16px;cursor:pointer;color:rgba(34,31,28,.5)}' +
    '@media(max-width:720px){.kk-lead{bottom:10px}}';
  function leadEligible() {
    if (!CFG.LEAD_POPUP || IS_BOT_UA || !shouldTrack()) return false;
    if (document.getElementById('kkLead') || document.querySelector('.modal.open')) return false;
    if (ls.get('kk_has_phone') === '1') return false;
    if (Date.now() - Number(ls.get('kk_lead_seen') || 0) < CFG.LEAD_COOLDOWN_DAYS * 864e5) return false;
    var s = S();
    if (s && s.profile && s.profile.phone) return false;
    if (['checkout', 'order-confirm', 'dashboard'].indexOf(cur.page) >= 0) return false;
    return true;
  }
  function showLead(trigger) {
    if (!leadEligible()) return;
    var s = S();
    var prod = (s && s.currentProduct && cur.page === 'product') ? s.currentProduct.name : null;
    var box = document.createElement('div');
    box.id = 'kkLead'; box.className = 'kk-lead'; box.setAttribute('role', 'dialog');
    box.innerHTML = '<button class="kk-lead-x" aria-label="Close">✕</button><h4></h4><p></p>' +
      '<input type="text" id="kkLeadName" placeholder="Your name (optional)" autocomplete="name">' +
      '<input type="tel" id="kkLeadPhone" placeholder="WhatsApp number (10 digits)" inputmode="numeric" maxlength="10" autocomplete="tel-national">' +
      '<label class="kk-lead-c"><input type="checkbox" id="kkLeadOk"><span>I agree to be contacted by Kanikara on WhatsApp / call about products and offers. I can opt out anytime.</span></label>' +
      '<div class="kk-lead-err"></div><button class="kk-lead-go">Notify me on WhatsApp</button>';
    box.querySelector('h4').textContent = prod ? 'Liked “' + prod + '”?' : 'Looking for something special?';
    box.querySelector('p').textContent = 'Share your WhatsApp number — our team will help with size, price and availability, and you get a first look at new collections.';
    document.body.appendChild(box);
    ls.set('kk_lead_seen', String(Date.now()));
    logEvent('lead_popup_shown', { trigger: trigger });
    var close = function () { box.remove(); };
    box.querySelector('.kk-lead-x').onclick = function () { logEvent('lead_popup_dismiss', { trigger: trigger }); close(); };
    box.querySelector('.kk-lead-go').onclick = function () {
      var phone = normPhone(val('kkLeadPhone')), err = box.querySelector('.kk-lead-err');
      if (!phone || !/^[6-9]/.test(phone)) { err.textContent = 'Please enter a valid 10-digit mobile number.'; return; }
      if (!document.getElementById('kkLeadOk').checked) { err.textContent = 'Please tick the consent box to continue.'; return; }
      identify(phone, val('kkLeadName').trim() || null, null, 'lead_popup', { consent: true, note: prod || (cur.page || 'site') });
      logEvent('lead_captured', { trigger: trigger });
      close();
      if (typeof toast === 'function') toast('Thank you! Our team will message you on WhatsApp.');
    };
  }

  function wrapAfter(name, after) {
    var orig = window[name]; if (typeof orig !== 'function' || orig.__kkA) return;
    var fn = function () { var out = orig.apply(this, arguments); try { after.apply(null, arguments); } catch (e) {} return out; };
    fn.__kkA = true; window[name] = fn;
  }
  function wrapBefore(name, before) {
    var orig = window[name]; if (typeof orig !== 'function' || orig.__kkB) return;
    var fn = function () { try { before.apply(null, arguments); } catch (e) {} return orig.apply(this, arguments); };
    fn.__kkB = true; window[name] = fn;
  }
  function installHooks() {
    wrapAfter('showPage', function (id) { setTimeout(function () { track(id); }, 30); });
    wrapAfter('goProduct', function () { setTimeout(function () { track('product'); }, 30); });
    window.addEventListener('popstate', function () { setTimeout(function () { track(); }, 60); });

    wrapBefore('addToCart', function (pid, qty, variant) { logEvent('add_to_cart', { product_id: pid, qty: qty || 1, variant: variant ? variant.color_name : null }); });
    wrapBefore('buyNow', function (pid, variant) { logEvent('buy_now', { product_id: pid, variant: variant ? variant.color_name : null }); });
    wrapBefore('toggleWishlist', function (pid) { logEvent('wishlist_toggle', { product_id: pid }); });
    wrapBefore('doSearch', function () { var t = val('searchInput').trim(); if (t) logEvent('search', { term: t }); });
    wrapBefore('doSearchMobile', function () { var t = val('mqSearchInput').trim(); if (t) logEvent('search', { term: t }); });
    wrapBefore('setShopCategory', function (slug) { logEvent('category_filter', { category: slug || 'all' }); });
    wrapBefore('toggleTagFilter', function (tag, on) { if (on) logEvent('tag_filter', { tag: tag }); });
    wrapAfter('applyPriceFilter', function () { var s = S(); if (s) logEvent('price_filter', { min: s.filters.minPrice, max: s.filters.maxPrice }); });
    wrapBefore('applyCoupon', function () { logEvent('coupon_try', { code: val('couponInput').trim().toUpperCase() }); });
    wrapBefore('proceedCheckout', function () { var s = S(); logEvent('checkout_click', { method: s ? s.selectedPayMethod : null, items: s ? s.cart.length : null }); });
    wrapAfter('openPincodePrompt', function () { var p = ls.get('kk_pincode'); if (p) logEvent('pincode_set', { pincode: p }); });

    wrapBefore('handleSignup', function () { identify(val('signupPhone'), val('signupName'), val('signupEmail'), 'signup'); logEvent('signup_submit'); });
    wrapBefore('saveNewAddress', function () { identify(val('addrPhone'), val('addrName'), null, 'address'); });
    wrapBefore('submitCustomOrder', function () {
      identify(val('coPhone'), val('coFullName'), val('coEmail'), 'custom_order');
      logEvent('custom_order_submit', { type: val('coType'), budget: val('coBudget') });
    });
    wrapBefore('submitCorporateEnquiry', function () {
      identify(val('corpPhone'), val('corpContact'), val('corpEmail'), 'corporate');
      logEvent('corporate_enquiry', { company: val('corpCompany') });
    });

    setTimeout(function () { showLead('time'); }, CFG.LEAD_AFTER_SEC * 1000);
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY <= 0 && window.innerWidth > 900 && Date.now() - startedAt > 20000) showLead('exit');
    });
  }
  function waitForAuthThenTrack() {
    var authCheck = (typeof sb !== 'undefined' && sb.auth && sb.auth.getSession) ? sb.auth.getSession().catch(function () { return null; }) : Promise.resolve(null);
    Promise.race([authCheck, new Promise(function (r) { setTimeout(r, 6000); })]).then(function () { setTimeout(track, 400); });
  }

  var CSS = '' +
    '.kk-an-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:18px}' +
    '@media(max-width:900px){.kk-an-grid{grid-template-columns:1fr 1fr}}' +
    '.kk-an-card{background:var(--ivory-2,#faf7f2);border:1px solid var(--line-light,#e7e0d5);padding:18px;overflow-x:auto}' +
    '.kk-an-card .n{font-family:var(--serif,serif);font-size:28px;font-weight:700;line-height:1.1}' +
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
    '.kk-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:6px;background:#DCEEDF;color:#3F7156}' +
    '.kk-t-hot{background:#F5DCDC;color:#A23B3B}.kk-t-warm{background:#F0E3C6;color:#7A5E1E}.kk-t-cold{background:#E6E9F0;color:#4a5570}.kk-t-cust{background:#DCEEDF;color:#3F7156}' +
    '.kk-t-opt{background:#DCE7F5;color:#2A4E7A}' +
    '.kk-small{font-size:11px;opacity:.6;line-height:1.5}' +
    '.kk-delta{font-size:11px;font-weight:700;margin-left:6px}.kk-up{color:#3F7156}.kk-down{color:#A23B3B}' +
    '.kk-btn{display:inline-block;font-size:11.5px;font-weight:700;padding:5px 10px;border:1px solid var(--line-light,#e7e0d5);background:#fff;margin:2px 4px 2px 0;text-decoration:none;color:inherit}' +
    '.kk-wa{background:#25D366;color:#fff;border-color:#25D366}' +
    '.kk-tl{padding:6px 4px 10px 4px}.kk-tl-meta{font-size:12px;margin-bottom:10px;line-height:1.7;opacity:.85}' +
    '.kk-tl-row{display:flex;gap:12px;padding:5px 0;border-bottom:1px dashed var(--line-light,#e7e0d5);font-size:12.5px}' +
    '.kk-tl-row .t{flex:0 0 118px;opacity:.55;font-size:11.5px}.kk-tl-row i{opacity:.55;font-style:normal;margin-left:6px}' +
    '.kk-tl-sess{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:12px 0 4px;color:var(--gold,#C9A24B)}';

  var cache = { rows: null, idents: null, byId: {}, bySlug: {}, idByVisitor: {}, idByUser: {}, profBy: {}, emails: {}, addrBy: {}, geoStart: null, at: 0 };
  var ui = { days: 7, state: '', q: '', temp: '', contact: '', sort: 'recent', bots: false };
  var vList = [], shownList = [];

  function injectStyle(id, css) { if (document.getElementById(id)) return; var st = document.createElement('style'); st.id = id; st.textContent = css; document.head.appendChild(st); }

  function injectUI() {
    injectStyle('kkLeadCss', LEAD_CSS);
    var side = document.querySelector('.admin-side'), main = document.querySelector('.admin-main');
    if (!side || !main || document.querySelector('[data-pane="analytics"]')) return;
    injectStyle('kkAdminCss', CSS);
    var link = document.createElement('a');
    link.href = '#'; link.dataset.tab = 'analytics'; link.textContent = 'Analytics';
    link.onclick = function (e) { e.preventDefault(); switchAdmin('analytics'); };
    var settingsLink = side.querySelector('a[data-tab="settings"]');
    settingsLink ? side.insertBefore(link, settingsLink) : side.appendChild(link);

    var pane = document.createElement('div');
    pane.className = 'admin-pane hide'; pane.dataset.pane = 'analytics';
    pane.innerHTML = '<div class="admin-topbar"><h1>Analytics</h1><div class="kk-seg" id="kkRange">' +
      '<button data-d="1">Today</button><button data-d="7" class="on">7 days</button><button data-d="30">30 days</button>' +
      '<button onclick="loadAdminAnalytics(true)">↻ Refresh</button></div></div><div id="kkAnBody"><p style="opacity:.6">Loading…</p></div>';
    main.appendChild(pane);
    pane.querySelectorAll('#kkRange button[data-d]').forEach(function (b) {
      b.onclick = function () {
        pane.querySelectorAll('#kkRange button[data-d]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); ui.days = Number(b.dataset.d); renderAll();
      };
    });
    var orig = window.switchAdmin;
    if (typeof orig === 'function' && !orig.__kkWrapped) {
      var fn = function (tab) { var out = orig.apply(this, arguments); if (tab === 'analytics') loadAdminAnalytics(); return out; };
      fn.__kkWrapped = true; window.switchAdmin = fn;
    }
  }

  async function fetchAllRows(since) {
    var out = [], size = 1000;
    for (var from = 0; from < CFG.MAX_ROWS; from += size) {
      var r = await sb.from('page_views').select('*').gte('created_at', since)
        .order('created_at', { ascending: false }).range(from, from + size - 1);
      if (r.error) return { error: r.error };
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < size) break;
    }
    return { data: out };
  }
  window.loadAdminAnalytics = async function (force) {
    var body = document.getElementById('kkAnBody'); if (!body) return;
    if (force || !cache.rows || Date.now() - cache.at > 60000) {
      body.innerHTML = '<p style="opacity:.6">Loading analytics…</p>';
      var res = await fetchAllRows(new Date(Date.now() - CFG.LOOKBACK_DAYS * 864e5).toISOString());
      if (res.error) {
        body.innerHTML = '<div class="dash-card"><b>Could not load analytics.</b><br><span style="opacity:.7">' + E(res.error.message) +
          '</span><br><br>Run <code>analytics-upgrade.sql</code> and <code>analytics-upgrade-2.sql</code> in the Supabase SQL Editor.</div>';
        return;
      }
      var extra = await Promise.all([
        sb.from('visitor_identities').select('*').limit(10000),
        sb.from('products').select('id,name,slug,serial_no').limit(5000),
        sb.from('profiles').select('id,full_name,phone,role,created_at').limit(5000),
        sb.from('addresses').select('user_id,city,state,pincode,is_default').limit(5000)
      ]);
      cache.rows = res.data || [];
      cache.idents = (extra[0] && extra[0].data) || [];
      cache.byId = {}; cache.bySlug = {}; cache.idByVisitor = {}; cache.idByUser = {}; cache.profBy = {}; cache.emails = {}; cache.addrBy = {};
      ((extra[1] && extra[1].data) || []).forEach(function (p) { cache.byId[p.id] = p; cache.bySlug[p.slug] = p; });
      ((extra[2] && extra[2].data) || []).forEach(function (p) { cache.profBy[p.id] = p; });
      ((extra[3] && extra[3].data) || []).forEach(function (a) { if (a.user_id && (!cache.addrBy[a.user_id] || a.is_default)) cache.addrBy[a.user_id] = a; });
      cache.geoStart = null;  
      cache.rows.forEach(function (r) { if ((r.city || r.region) && (!cache.geoStart || r.created_at < cache.geoStart)) cache.geoStart = r.created_at; });
      cache.idents.forEach(function (i) {
        (cache.idByVisitor[i.visitor_id] = cache.idByVisitor[i.visitor_id] || []).push(i);
        if (i.user_id) (cache.idByUser[i.user_id] = cache.idByUser[i.user_id] || []).push(i);
      });
      try {  
        var ids = {}; cache.rows.forEach(function (r) { if (r.user_id) ids[r.user_id] = 1; });
        ids = Object.keys(ids);
        if (ids.length && typeof api !== 'undefined' && api.adminListEmails) cache.emails = await api.adminListEmails(ids);
      } catch (e) { cache.emails = {}; }
      cache.at = Date.now();
    }
    renderAll();
  };

  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function timeAgo(ts) {
    var s = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }
  function fmtDT(ts) { return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function fmtDur(sec) {
    sec = Math.round(sec || 0); if (!sec) return '—';
    if (sec < 60) return sec + 's'; if (sec < 3600) return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
  }
  function pName(ref) { var p = cache.bySlug[ref] || cache.byId[ref]; return p ? p.name : (ref || '—'); }
  function pFull(ref) { var p = cache.bySlug[ref] || cache.byId[ref]; return p ? ((p.serial_no ? p.serial_no + ' · ' : '') + p.name) : (ref || '—'); }
  var PAGE_TITLES = { home: 'Home', shop: 'Shop', product: 'Product', wishlist: 'Wishlist', dashboard: 'My Account / Orders', checkout: 'Checkout',
    'order-confirm': 'Order confirmation ✅', 'custom-order': 'Custom Order', 'gift-store': 'Gift Store', 'corporate-gifting': 'Corporate Gifting',
    'smart-plan': 'Smart Plan', 'store-locator': 'Store Locator', 'jewellery-care': 'Jewellery Care', policies: 'Policies' };
  function pageTitle(p) { return PAGE_TITLES[p] || p || '—'; }
  function pinState(pin) {
    var p = String(pin || '').replace(/\D/g, ''); if (p.length !== 6) return null;
    var n = Number(p.slice(0, 2));
    var T = [[11, 11, 'Delhi'], [12, 13, 'Haryana'], [14, 16, 'Punjab'], [17, 17, 'Himachal Pradesh'], [18, 19, 'Jammu and Kashmir'], [20, 28, 'Uttar Pradesh / Uttarakhand'],
      [30, 34, 'Rajasthan'], [36, 39, 'Gujarat'], [40, 44, 'Maharashtra'], [45, 48, 'Madhya Pradesh'], [49, 49, 'Chhattisgarh'], [50, 53, 'Telangana / Andhra Pradesh'],
      [56, 59, 'Karnataka'], [60, 64, 'Tamil Nadu'], [67, 69, 'Kerala'], [70, 74, 'West Bengal'], [75, 77, 'Odisha'], [78, 78, 'Assam'], [79, 79, 'North-East'], [80, 85, 'Bihar / Jharkhand']];
    for (var k = 0; k < T.length; k++) if (n >= T[k][0] && n <= T[k][1]) return T[k][2];
    return null;
  }
  function geoText(g, v) {
    var none = '<span style="opacity:.55">' + (v && v.noGeo === 'before' ? 'Before location tracking' : 'Unknown') + '</span>';
    if (!g) return none;
    var a = [g.city, g.region].filter(Boolean).join(', ');
    if (g.country && g.country !== 'India') a += (a ? ', ' : '') + g.country;
    if (!a) return none;
    return E(a) + (g._src ? ' <span class="kk-small">(from ' + E(g._src) + ')</span>' : '');
  }
  function stateKey(v) { return (v.geo && v.geo.region) || (v.noGeo === 'before' ? 'Before location tracking' : 'Unknown'); }
  function cityKey(v) {
    if (v.geo && v.geo.city) return v.geo.city + (v.geo.region ? ', ' + v.geo.region : '');
    if (v.geo && v.geo.region) return v.geo.region + ' (city unknown)';
    return v.noGeo === 'before' ? 'Before location tracking' : 'Unknown';
  }
  function countBy(rows, keyFn) {
    var m = {}; rows.forEach(function (r) { var k = keyFn(r); if (k == null || k === '') return; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { k: k, v: m[k] }; }).sort(function (a, b) { return b.v - a.v; });
  }
  function card(n, label) { return '<div class="kk-an-card"><div class="n">' + n + '</div><div class="l">' + label + '</div></div>'; }
  function delta(cur, prev) {
    if (!prev) return '';
    var p = Math.round((cur - prev) / prev * 100);
    return '<span class="kk-delta ' + (p >= 0 ? 'kk-up' : 'kk-down') + '">' + (p >= 0 ? '▲' : '▼') + ' ' + Math.abs(p) + '%</span>';
  }
  function tableCard(title, heads, rowsHtml) {
    return '<div class="kk-an-card"><h3>' + title + '</h3><table class="data"><thead><tr>' + heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="' + heads.length + '">No data yet</td></tr>') + '</tbody></table></div>';
  }
  function simpleTop(title, colA, colB, items, limit) {
    return tableCard(title, [colA, colB], items.slice(0, limit || 8).map(function (x) { return '<tr><td>' + E(x.k) + '</td><td>' + x.v + '</td></tr>'; }).join(''));
  }
  function barsHTML(title, buckets) {
    var max = Math.max.apply(null, buckets.map(function (b) { return b.views; }).concat([1]));
    return '<div class="kk-an-card"><h3>' + title + '</h3><div class="kk-bars">' + buckets.map(function (b) {
      return '<div><span style="font-size:10px;opacity:.6">' + (b.views || '') + '</span><div class="b" style="height:' + Math.round((b.views / max) * 110) +
        'px"></div><span class="t">' + b.label + '</span></div>';
    }).join('') + '</div></div>';
  }
  function funnelHTML(steps) {
    var top = steps[0].n || 1;
    return '<div class="kk-an-card"><h3>Conversion funnel</h3>' + steps.map(function (s, i) {
      var pt = Math.round(s.n / top * 100), pv = i && steps[i - 1].n ? ' · ' + Math.round(s.n / steps[i - 1].n * 100) + '% of previous step' : '';
      return '<div style="margin:11px 0"><div style="display:flex;justify-content:space-between;font-size:12.5px"><span>' + s.l + '</span><b>' + s.n +
        ' <span class="kk-small">(' + pt + '%' + pv + ')</span></b></div><div style="background:#ece7db;height:8px;border-radius:4px"><div style="width:' + pt +
        '%;height:8px;border-radius:4px;background:linear-gradient(90deg,#d4af37,#b8912b)"></div></div></div>';
    }).join('') + '</div>';
  }

  function buildVisitors(rows) {
    var map = {}, list = [];
    rows.forEach(function (r) {  
      var v = map[r.visitor_id];
      if (!v) {
        v = map[r.visitor_id] = { id: r.visitor_id, rows: [], last: r.created_at, sessions: {}, views: 0, prodViews: 0, seconds: 0,
          geo: null, dev: null, user_id: null, pin: null, products: {}, counts: {}, pages: {}, converted: false, returning: true };
        list.push(v);
      }
      v.rows.push(r); v.firstRow = r; v.sessions[r.session_id] = 1;
      if (!v.geo && (r.city || r.region || r.country)) v.geo = r;
      if (!v.dev) v.dev = r;
      if (!v.pin && r.entered_pincode) v.pin = r.entered_pincode;
      if (r.user_id && !v.user_id) v.user_id = r.user_id;
      if (r.is_new_visitor) v.returning = false;
      var ev = r.event || 'page_view';
      v.counts[ev] = (v.counts[ev] || 0) + 1;
      if (ev === 'page_view') {
        v.views++; v.pages[r.page] = 1;
        if (r.page === 'order-confirm') v.converted = true;
        if (r.product_slug) { v.prodViews++; v.products[r.product_slug] = (v.products[r.product_slug] || 0) + 1; }
      }
      if (ev === 'time_spent' && r.detail) v.seconds += Number(r.detail.seconds) || 0;
    });
    list.forEach(function (v) {
      v.sessionCount = Object.keys(v.sessions).length;
      if (v.sessionCount >= 2) v.returning = true;
      var prof = v.user_id ? cache.profBy[v.user_id] : null;
      var ids = (cache.idByVisitor[v.id] || []).concat(v.user_id ? (cache.idByUser[v.user_id] || []) : []);
      var phones = [], seen = {}, srcs = {};
      function add(p, src) { p = normPhone(p); if (p && !seen[p]) { seen[p] = 1; phones.push(p); srcs[p] = src; } }
      if (prof && prof.phone) add(prof.phone, 'account');
      ids.forEach(function (i) { add(i.phone, i.source); });
      v.phones = phones; v.phoneSrc = srcs;
      v.optin = ids.some(function (i) { return i.consent; });
      v.name = (prof && prof.full_name) || (ids.filter(function (i) { return i.name; })[0] || {}).name || null;
      v.emails = []; if (v.user_id && cache.emails[v.user_id]) v.emails.push(cache.emails[v.user_id]);
      ids.forEach(function (i) { if (i.email && v.emails.indexOf(i.email) < 0) v.emails.push(i.email); });
      v.notes = ids.map(function (i) { return i.note; }).filter(Boolean);
      var c = v.counts, s = Math.min(v.prodViews, 6) * 4;
      if (c.add_to_cart) s += 25; if (c.buy_now) s += 30; if (c.checkout_click) s += 35; if (c.wishlist_toggle) s += 10;
      if (c.search) s += 4; if (c.coupon_try) s += 8; if (v.seconds >= 120) s += 8;
      if (v.sessionCount >= 2) s += 10; if (v.sessionCount >= 4) s += 5;
      v.score = Math.min(100, s);
      v.temp = v.converted ? 'Customer' : v.score >= 60 ? 'Hot' : v.score >= 30 ? 'Warm' : 'Cold';
      v.contact = v.phones.length ? 'phone' : (v.emails.length ? 'email' : 'none');
      if (!v.geo) { 
        var ad = v.user_id ? cache.addrBy[v.user_id] : null;
        if (ad && (ad.city || ad.state)) v.geo = { city: ad.city, region: ad.state, country: 'India', _src: 'saved address' };
        else if (pinState(v.pin)) v.geo = { region: pinState(v.pin), country: 'India', _src: 'delivery PIN ' + v.pin };
        else if (cache.geoStart && v.last < cache.geoStart) v.noGeo = 'before';
      }
    });
    return list;
  }
  function tempTag(v) {
    var cls = { Hot: 'kk-t-hot', Warm: 'kk-t-warm', Cold: 'kk-t-cold', Customer: 'kk-t-cust' }[v.temp];
    return '<span class="kk-tag ' + cls + '" style="margin-left:0">' + v.temp + ' · ' + v.score + '</span>';
  }
  function waLink(v, p) {
    var top = Object.keys(v.products).sort(function (a, b) { return v.products[b] - v.products[a]; })[0];
    var msg = 'Hi' + (v.name ? ' ' + v.name.split(' ')[0] : '') + ', this is Kanikara Jewellery. ' +
      (top ? 'We noticed you were looking at "' + pName(top) + '". ' : '') + 'Can we help you with size, price or availability?';
    return 'https://wa.me/91' + p + '?text=' + encodeURIComponent(msg);
  }
  function contactHTML(v, compact) {
    if (v.phones.length) return v.phones.map(function (p) {
      return '<a href="tel:+91' + p + '">' + p + '</a>' +
        (v.optin && v.phoneSrc[p] === 'lead_popup' ? '<span class="kk-tag kk-t-opt">opted-in</span>' : '<span class="kk-tag kk-t-opt" style="background:#eee;color:#666">' + E(v.phoneSrc[p] || '') + '</span>') +
        '<br><a class="kk-btn kk-wa" href="' + waLink(v, p) + '" target="_blank" rel="noopener">WhatsApp</a><a class="kk-btn" href="tel:+91' + p + '">Call</a>';
    }).join('<br>');
    if (v.emails.length) {
      var top = Object.keys(v.products).sort(function (a, b) { return v.products[b] - v.products[a]; })[0];
      return '<a href="mailto:' + E(v.emails[0]) + '?subject=' + encodeURIComponent('Kanikara — ' + (top ? pName(top) : 'your visit')) + '">' + E(v.emails[0]) + '</a>' +
        '<span class="kk-tag kk-t-opt">email only</span>' + (compact ? '' : '<div class="kk-small">No phone shared yet</div>');
    }
    return '<span class="kk-small">Not shared — popup will ask</span>';
  }

  function eventLine(r) {
    var ev = r.event || 'page_view', d = r.detail || {};
    switch (ev) {
      case 'page_view':
        if (r.page === 'product') return { icon: '👁', text: 'Viewed product: <b>' + E(pFull(r.product_slug)) + '</b>' };
        var x = '';
        if (d.category) x += ' · category: ' + E(d.category);
        if (d.search) x += ' · search: “' + E(d.search) + '”';
        if (Array.isArray(d.tags) && d.tags.length) x += ' · ' + E(d.tags.join(', '));
        return { icon: '📄', text: 'Opened <b>' + E(pageTitle(r.page)) + '</b>' + x };
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
      case 'lead_popup_shown': return { icon: '💬', text: 'WhatsApp popup shown (' + E(d.trigger) + ')' };
      case 'lead_popup_dismiss': return { icon: '✖', text: 'Closed the WhatsApp popup' };
      case 'lead_captured': return { icon: '✅', text: 'Shared WhatsApp number via popup (with consent)' };
      default: return { icon: '•', text: E(ev) };
    }
  }
  function journeyHTML(v) {
    var lines = [], lastBy = {};
    v.rows.slice().reverse().forEach(function (r) {
      if ((r.event || 'page_view') === 'time_spent') {
        var k = r.page + '|' + (r.product_slug || '');
        if (lastBy[k]) lastBy[k].sec = (lastBy[k].sec || 0) + (Number(r.detail && r.detail.seconds) || 0);
        return;
      }
      var l = eventLine(r); l.t = r.created_at; l.sid = r.session_id;
      if ((r.event || 'page_view') === 'page_view') lastBy[r.page + '|' + (r.product_slug || '')] = l;
      lines.push(l);
    });
    var g = v.geo || {};
    var meta = '<div class="kk-tl-meta"><b>Lead:</b> ' + tempTag(v) + ' &nbsp; <b>Location:</b> ' + geoText(v.geo, v) +
      (g.postal_code ? ' · IP area PIN ~' + E(g.postal_code) : '') + (v.pin ? ' · <b>PIN entered: ' + E(v.pin) + '</b>' : '') +
      (g.isp ? '<br><b>Network:</b> ' + E(g.isp) : '') +
      (v.dev ? '<br><b>Device:</b> ' + E((v.dev.device || '') + ' · ' + (v.dev.browser || '') + ' · ' + (v.dev.os || '') + (v.dev.screen_w ? ' · ' + v.dev.screen_w + '×' + v.dev.screen_h : '')) : '') +
      (v.notes.length ? '<br><b>Interested in (as told by visitor):</b> ' + E(v.notes.join(', ')) : '') +
      '<br><b>First seen:</b> ' + fmtDT(v.firstRow.created_at) + ' · <b>Visitor ID:</b> ' + E(String(v.id).slice(0, 8)) + '</div>';
    var html = '', lastSid = null;
    lines.forEach(function (l) {
      if (l.sid !== lastSid) { html += '<div class="kk-tl-sess">Session · ' + fmtDT(l.t) + '</div>'; lastSid = l.sid; }
      html += '<div class="kk-tl-row"><span class="t">' + fmtDT(l.t) + '</span><span>' + l.icon + ' ' + l.text + (l.sec ? '<i>· stayed ' + fmtDur(l.sec) + '</i>' : '') + '</span></div>';
    });
    return '<div class="kk-tl">' + meta + (html || '<p style="opacity:.6">No activity in this range.</p>') + '</div>';
  }

  function renderAll() {
    var body = document.getElementById('kkAnBody'); if (!body || !cache.rows) return;
    var days = ui.days;
    var from = days === 1 ? startOfDay(new Date()) : new Date(Date.now() - days * 864e5);
    var span = days === 1 ? 864e5 : days * 864e5, prevFrom = new Date(from.getTime() - span);
    var botRows = cache.rows.filter(isBotRow);
    var all = ui.bots ? cache.rows : cache.rows.filter(function (r) { return !isBotRow(r); });
    var inR = function (r, a, b) { var t = +new Date(r.created_at); return t >= a && t < b; };
    var rows = all.filter(function (r) { return inR(r, from, Infinity); });
    var prevRows = days <= 7 ? all.filter(function (r) { return inR(r, prevFrom, from); }) : [];
    var isPV = function (r) { return (r.event || 'page_view') === 'page_view'; };
    var views = rows.filter(isPV), prevViews = prevRows.filter(isPV);
    var evt = function (name) { return rows.filter(function (r) { return r.event === name; }); };
    var uniq = function (arr, key) { var s = {}; arr.forEach(function (r) { if (r[key]) s[r[key]] = 1; }); return Object.keys(s).length; };
    var botCount = botRows.filter(function (r) { return inR(r, from, Infinity) && isPV(r); }).length;

    vList = buildVisitors(rows);
    var liveRows = all.filter(function (r) { return Date.now() - new Date(r.created_at) < 5 * 60000; });
    var withPhone = vList.filter(function (v) { return v.phones.length; }).length;
    var emailOnly = vList.filter(function (v) { return v.contact === 'email'; }).length;
    var optins = vList.filter(function (v) { return v.optin; }).length;
    var ordered = vList.filter(function (v) { return v.converted; }).length;
    var returning = vList.filter(function (v) { return v.returning; }).length;

    var sess = {};
    rows.forEach(function (r) {
      var s = sess[r.session_id] = sess[r.session_id] || { pv: 0, act: 0 };
      var e = r.event || 'page_view';
      if (e === 'page_view') s.pv++; else if (e !== 'time_spent' && e.indexOf('lead_popup') !== 0) s.act++;
    });
    var sk = Object.keys(sess), bounced = sk.filter(function (k) { return sess[k].pv <= 1 && !sess[k].act; }).length;
    var withTime = vList.filter(function (v) { return v.seconds > 0; });
    var avgTime = withTime.length ? withTime.reduce(function (a, v) { return a + v.seconds; }, 0) / withTime.length : 0;

    var shown = evt('lead_popup_shown').length, captured = evt('lead_captured').length;

    var kpi =
      '<div class="kk-an-grid">' +
        card(views.length + delta(views.length, prevViews.length), 'Page views (' + (days === 1 ? 'today' : days + 'd') + ')') +
        card(vList.length + delta(vList.length, uniq(prevRows, 'visitor_id')), 'Unique visitors') +
        card(sk.length, 'Sessions') +
        card(uniq(liveRows, 'visitor_id'), '<span class="kk-live"><i></i>Online now</span>') +
      '</div><div class="kk-an-grid">' +
        card(withPhone, 'Visitors with phone no.') +
        card(emailOnly, 'Email only (no phone)') +
        card(optins, 'WhatsApp opt-ins' + (shown ? ' · ' + Math.round(captured / shown * 100) + '% of popups' : '')) +
        card(vList.length - withPhone - emailOnly, 'Anonymous visitors') +
      '</div><div class="kk-an-grid">' +
        card(evt('add_to_cart').length, 'Add-to-bag clicks') +
        card(ordered, 'Visitors who ordered') +
        card(sk.length ? Math.round(bounced / sk.length * 100) + '%' : '—', 'Bounce rate') +
        card(fmtDur(avgTime), 'Avg time on site') +
      '</div>' +
      '<p class="kk-small" style="margin:-6px 0 16px">' + (vList.length - returning) + ' new · ' + returning + ' returning visitors · ' +
      (botCount ? botCount + ' bot/crawler/data-centre page views ' + (ui.bots ? 'included' : 'hidden') + ' — <a href="#" onclick="kkToggleBots();return false" style="text-decoration:underline">' + (ui.bots ? 'hide them' : 'show them') + '</a>' : 'no bot traffic detected') + '</p>';

    var pvAll = all.filter(isPV), buckets = [], title;
    if (days === 1) {
      title = 'Views by hour (today)';
      var d00 = startOfDay(new Date());
      for (var h = 0; h < 24; h++) {
        var h0 = new Date(d00.getTime() + h * 36e5), h1 = new Date(h0.getTime() + 36e5);
        buckets.push({ label: (h % 3 === 0 ? h + 'h' : ''), views: pvAll.filter(function (r) { return inR(r, h0, h1); }).length });
      }
    } else {
      title = 'Daily views';
      for (var i = days - 1; i >= 0; i--) {
        var a = startOfDay(new Date(Date.now() - i * 864e5)), b = new Date(a.getTime() + 864e5);
        buckets.push({ label: a.getDate() + '/' + (a.getMonth() + 1), views: pvAll.filter(function (r) { return inR(r, a, b); }).length });
      }
    }
    var hours = []; for (var q = 0; q < 24; q++) hours.push({ label: q % 3 === 0 ? q + 'h' : '', views: 0 });
    views.forEach(function (r) { hours[new Date(r.created_at).getHours()].views++; });

    var funnel = funnelHTML([
      { l: 'Visitors', n: vList.length },
      { l: 'Viewed a product', n: vList.filter(function (v) { return v.prodViews > 0; }).length },
      { l: 'Added to bag / Buy now', n: vList.filter(function (v) { return v.counts.add_to_cart || v.counts.buy_now; }).length },
      { l: 'Reached checkout', n: vList.filter(function (v) { return v.pages.checkout || v.counts.checkout_click; }).length },
      { l: 'Order confirmed', n: ordered }
    ]);

    var stM = {}, ctM = {};
    vList.forEach(function (v) {
      var st = stateKey(v), ct = cityKey(v);
      (stM[st] = stM[st] || { vis: 0, views: 0, ph: 0 }); stM[st].vis++; stM[st].views += v.views; if (v.phones.length) stM[st].ph++;
      (ctM[ct] = ctM[ct] || { vis: 0, views: 0, ph: 0 }); ctM[ct].vis++; ctM[ct].views += v.views; if (v.phones.length) ctM[ct].ph++;
    });
    var geoRows = function (m) {
      return Object.keys(m).sort(function (x, y) { return m[y].vis - m[x].vis; }).slice(0, 10).map(function (k) {
        return '<tr><td>' + E(k) + '</td><td>' + m[k].vis + '</td><td>' + m[k].views + '</td><td>' + m[k].ph + '</td></tr>';
      }).join('');
    };

    var pm = {};
    var pget = function (ref) { var p = cache.bySlug[ref] || cache.byId[ref]; var k = p ? p.id : ref; return pm[k] = pm[k] || { ref: ref, views: 0, vis: {}, atc: 0, wish: 0 }; };
    views.forEach(function (r) { if (r.product_slug) { var x = pget(r.product_slug); x.views++; x.vis[r.visitor_id] = 1; } });
    rows.forEach(function (r) {
      if (r.event === 'add_to_cart' && r.detail) pget(r.detail.product_id).atc++;
      if (r.event === 'wishlist_toggle' && r.detail) pget(r.detail.product_id).wish++;
    });
    var prodRows = Object.keys(pm).map(function (k) { return pm[k]; }).sort(function (x, y) { return (y.views + y.atc * 3) - (x.views + x.atc * 3); }).slice(0, 10)
      .map(function (x) { return '<tr><td>' + E(pFull(x.ref)) + '</td><td>' + x.views + '</td><td>' + Object.keys(x.vis).length + '</td><td>' + x.atc + '</td><td>' + x.wish + '</td></tr>'; }).join('');

    var srcM = {};
    vList.forEach(function (v) {
      var f = v.firstRow, k = (f && (f.referrer_host || (f.utm_source ? 'utm: ' + f.utm_source : ''))) || 'Direct';
      var o = srcM[k] = srcM[k] || { vis: 0, bag: 0, ord: 0 }; o.vis++; if (v.counts.add_to_cart) o.bag++; if (v.converted) o.ord++;
    });
    var srcRows = Object.keys(srcM).sort(function (x, y) { return srcM[y].vis - srcM[x].vis; }).slice(0, 8)
      .map(function (k) { return '<tr><td>' + E(k) + '</td><td>' + srcM[k].vis + '</td><td>' + srcM[k].bag + '</td><td>' + srcM[k].ord + '</td></tr>'; }).join('');

    var hot = vList.filter(function (v) { return !v.converted && v.score >= 30; }).sort(function (x, y) { return y.score - x.score; }).slice(0, 10);
    var hotRows = hot.map(function (v) {
      var pk = Object.keys(v.products).sort(function (x, y) { return v.products[y] - v.products[x]; }).slice(0, 2);
      var did = [v.counts.add_to_cart ? '🛍 bag' : '', v.counts.checkout_click ? '💳 checkout' : '', v.counts.wishlist_toggle ? '♡ wishlist' : '', v.sessionCount > 1 ? '↻ ' + v.sessionCount + ' visits' : ''].filter(Boolean).join(' · ');
      return '<tr><td>' + tempTag(v) + '</td><td>' + (v.name ? '<b>' + E(v.name) + '</b>' : '<span style="opacity:.6">Guest</span>') + '<div class="kk-small">' + geoText(v.geo, v) + '</div></td><td>' +
        E(pk.map(pName).join(', ') || '—') + '<div class="kk-small">' + E(did) + '</div></td><td>' + contactHTML(v, true) + '</td></tr>';
    }).join('');

    var stateOpts = Object.keys(stM).sort(function (x, y) { return stM[y].vis - stM[x].vis; });
    if (stateOpts.indexOf(ui.state) < 0) ui.state = '';
    var sel = function (k, v) { return ui[k] === v ? ' selected' : ''; };
    var filters = '<div class="kk-filters">' +
      '<select onchange="kkSetFilter(\'state\',this.value)"><option value="">All states</option>' + stateOpts.map(function (s) { return '<option value="' + E(s) + '"' + sel('state', s) + '>' + E(s) + ' (' + stM[s].vis + ')</option>'; }).join('') + '</select>' +
      '<select onchange="kkSetFilter(\'temp\',this.value)"><option value="">All lead types</option>' + ['Hot', 'Warm', 'Cold', 'Customer'].map(function (t) { return '<option' + sel('temp', t) + '>' + t + '</option>'; }).join('') + '</select>' +
      '<select onchange="kkSetFilter(\'contact\',this.value)"><option value="">Any contact status</option><option value="phone"' + sel('contact', 'phone') + '>Has phone</option><option value="email"' + sel('contact', 'email') + '>Email only</option><option value="none"' + sel('contact', 'none') + '>Anonymous</option></select>' +
      '<select onchange="kkSetFilter(\'sort\',this.value)"><option value="recent"' + sel('sort', 'recent') + '>Sort: latest</option><option value="score"' + sel('sort', 'score') + '>Sort: lead score</option></select>' +
      '<input type="text" placeholder="Search name / phone / city / PIN / product" value="' + E(ui.q) + '" oninput="kkSetFilter(\'q\',this.value)" style="min-width:260px">' +
      '<button class="btn btn-line-dark btn-sm" onclick="kkExportCsv()">⬇ Export CSV</button></div>';

    body.innerHTML = kpi +
      '<div class="kk-an-two">' + barsHTML(title, buckets) + funnel + '</div>' +
      '<div class="kk-an-card" style="margin-bottom:18px"><h3>🔥 Hot leads — not ordered yet</h3><table class="data"><thead><tr><th>Lead</th><th>Who</th><th>Interested in</th><th>Reach out</th></tr></thead><tbody>' +
        (hotRows || '<tr><td colspan="4">No warm/hot leads in this range yet.</td></tr>') + '</tbody></table></div>' +
      '<div class="kk-an-two">' + tableCard('Visitors by state', ['State', 'Visitors', 'Views', 'With phone'], geoRows(stM)) + tableCard('Visitors by city', ['City', 'Visitors', 'Views', 'With phone'], geoRows(ctM)) + '</div>' +
      '<div class="kk-an-two">' + tableCard('Most viewed products', ['Product', 'Views', 'Visitors', 'Bag', '♡'], prodRows) +
        simpleTop('What people searched', 'Search term', 'Times', countBy(evt('search'), function (r) { return r.detail && r.detail.term ? String(r.detail.term).toLowerCase() : null; }), 10) + '</div>' +
      '<div class="kk-an-two">' + barsHTML('Peak hours (views by hour of day)', hours) + tableCard('Traffic sources → conversion', ['Source', 'Visitors', 'Added to bag', 'Ordered'], srcRows) + '</div>' +
      '<div class="kk-an-two">' + simpleTop('Pages', 'Page', 'Views', countBy(views, function (r) { return pageTitle(r.page); }), 10) +
        simpleTop('Devices', 'Device', 'Views', countBy(views, function (r) { return (r.device || '—') + ' · ' + (r.browser || '—'); })) + '</div>' +
      '<div class="kk-an-card" style="margin-bottom:18px"><h3>Good to know</h3><p class="kk-small" style="font-size:12.5px;opacity:.75;line-height:1.7">' +
        '• Location comes from the IP address → approximate (city level). Exact area = PIN the visitor types.<br>' +
        '• Phone numbers appear only if the visitor shared them (sign-up, address, custom/corporate form, account, or the consent popup). “opted-in” = ticked the WhatsApp consent box; use those for marketing. Other numbers → service/order follow-up only.<br>' +
        '• WhatsApp popup this period: shown ' + shown + ' · numbers captured ' + captured + '.</p></div>' +
      '<div class="kk-an-card"><h3>Visitors <span class="kk-small" id="kkVisCount"></span></h3>' + filters + '<div id="kkVisTbl"></div></div>';
    renderVisitors();
  }

  function filteredVisitors() {
    var q = ui.q.trim().toLowerCase();
    var out = vList.filter(function (v) {
      if (ui.state && stateKey(v) !== ui.state) return false;
      if (ui.temp && v.temp !== ui.temp) return false;
      if (ui.contact && v.contact !== ui.contact) return false;
      if (q) {
        var hay = [v.name, v.phones.join(' '), v.emails.join(' '), v.geo && v.geo.city, v.geo && v.geo.region, v.pin, v.geo && v.geo.postal_code,
          Object.keys(v.products).map(pName).join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (ui.sort === 'score') out = out.slice().sort(function (a, b) { return b.score - a.score; });
    return out;
  }
  function renderVisitors() {
    var host = document.getElementById('kkVisTbl'); if (!host) return;
    var all = filteredVisitors(); shownList = all.slice(0, 200);
    var cnt = document.getElementById('kkVisCount'); if (cnt) cnt.textContent = '— showing ' + shownList.length + ' of ' + all.length;
    host.innerHTML = '<div style="overflow-x:auto"><table class="data"><thead><tr><th>Last seen</th><th>Who</th><th>Lead</th><th>Contact</th><th>Location</th><th>Device</th><th>Came from</th><th>Activity</th><th>Time</th><th></th></tr></thead><tbody>' +
      (shownList.map(function (v, i) {
        var pk = Object.keys(v.products), g = v.geo || {};
        var who = (v.name ? '<b>' + E(v.name) + '</b>' : '<span style="opacity:.6">Guest</span>') + (v.user_id ? '<span class="kk-tag">Member</span>' : '') +
          '<div class="kk-small">' + E(String(v.id).slice(0, 8)) + ' · ' + v.sessionCount + ' visit' + (v.sessionCount === 1 ? '' : 's') + '</div>';
        var loc = geoText(v.geo, v) + '<div class="kk-small">' + (v.pin ? 'PIN entered: <b>' + E(v.pin) + '</b>' : (g.postal_code ? 'IP area PIN ~' + E(g.postal_code) : '')) + '</div>';
        var src = (v.firstRow && (v.firstRow.referrer_host || (v.firstRow.utm_source ? 'utm: ' + v.firstRow.utm_source : ''))) || 'Direct';
        var act = v.views + ' page' + (v.views === 1 ? '' : 's') + (v.counts.add_to_cart ? ' · 🛍' + v.counts.add_to_cart : '') + (v.counts.wishlist_toggle ? ' · ♡' + v.counts.wishlist_toggle : '') +
          (pk.length ? '<div class="kk-small">' + E(pk.slice(0, 2).map(pName).join(', ') + (pk.length > 2 ? ' +' + (pk.length - 2) : '')) + '</div>' : '');
        return '<tr><td>' + timeAgo(v.last) + '</td><td>' + who + '</td><td>' + tempTag(v) + '</td><td>' + contactHTML(v) + '</td><td>' + loc + '</td><td>' +
          E(((v.dev && v.dev.device) || '') + ' · ' + ((v.dev && v.dev.os) || '')) + '</td><td>' + E(src) + '</td><td>' + act + '</td><td>' + fmtDur(v.seconds) +
          '</td><td><button class="action-btn" onclick="kkJourney(' + i + ')">Journey ▾</button></td></tr><tr class="hide" id="kkj_' + i + '"><td colspan="10" style="background:rgba(201,162,75,.05)"></td></tr>';
      }).join('') || '<tr><td colspan="10">No visitors match.</td></tr>') + '</tbody></table></div>';
  }

  window.kkSetFilter = function (k, v) { ui[k] = v; renderVisitors(); };
  window.kkToggleBots = function () { ui.bots = !ui.bots; renderAll(); };
  window.kkJourney = function (i) {
    var tr = document.getElementById('kkj_' + i); if (!tr) return;
    if (tr.classList.contains('hide')) { if (!tr.firstChild.innerHTML) tr.firstChild.innerHTML = journeyHTML(shownList[i]); tr.classList.remove('hide'); }
    else tr.classList.add('hide');
  };
  window.kkExportCsv = function () {
    var out = [['Last seen', 'Name', 'Phone(s)', 'Phone source', 'WhatsApp opt-in', 'Email(s)', 'Lead type', 'Lead score', 'City', 'State', 'Country', 'PIN entered', 'IP area PIN',
      'Device', 'OS', 'Came from', 'Visits', 'Page views', 'Products viewed', 'Bag clicks', 'Ordered', 'Time on site (sec)']];
    filteredVisitors().forEach(function (v) {
      var g = v.geo || {}, d = v.dev || {};
      out.push([new Date(v.last).toLocaleString('en-IN'), v.name || '', v.phones.join(' / '), v.phones.map(function (p) { return v.phoneSrc[p]; }).join(' / '), v.optin ? 'yes' : 'no', v.emails.join(' / '),
        v.temp, v.score, g.city || '', g.region || '', g.country || '', v.pin || '', g.postal_code || '', d.device || '', d.os || '',
        (v.firstRow && (v.firstRow.referrer_host || v.firstRow.utm_source)) || 'Direct', v.sessionCount, v.views,
        Object.keys(v.products).map(pName).join(' | '), v.counts.add_to_cart || 0, v.converted ? 'yes' : 'no', v.seconds]);
    });
    var csv = '\ufeff' + out.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'kanikara-visitors-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  };

  function start() { installHooks(); injectUI(); waitForAuthThenTrack(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.KanikaraAnalytics = { track: track, logEvent: logEvent, identify: identify, showLead: showLead, config: CFG, visitorId: visitorId };
})();
