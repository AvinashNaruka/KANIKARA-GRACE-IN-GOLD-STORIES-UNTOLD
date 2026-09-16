const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const money = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
const esc = s => (s ?? '').toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const state = {
  session: null,
  profile: null,
  isAdmin: false,
  categories: [],
  settings: {},
  cart: [],
  wishlistIds: new Set(),
  productCache: new Map(),
  filters: { category: '', sort: 'newest', minPrice: null, maxPrice: null, search: '', tags: [] },
  currentProduct: null,
  selectedAddressId: null,
  selectedPayMethod: 'cod',
  appliedCoupon: null,
  appliedGiftCard: null
};

function toast(msg, type = ''){
  const host = $('#toastHost');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(()=>el.remove(), 300); }, 3200);
}

const PAGES = ['home','shop','product','wishlist','dashboard','checkout','order-confirm','custom-order','account-gate','gift-store','corporate-gifting','smart-plan','store-locator','jewellery-care','policies'];
function showPage(id, { push = true } = {}){
  PAGES.forEach(p => { const el = $('#page-' + p); if (el) el.classList.remove('active'); });
  const target = $('#page-' + id);
  if (target) target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  $$('.main-nav a').forEach(a => a.classList.toggle('active', a.dataset.page === id));
  closeCart(); closeAllModals();
  if (push) history.pushState({ page: id }, '', '#' + id);
  routeInit(id);
}
window.addEventListener('popstate', () => {
  const id = (location.hash || '#home').slice(1).split('/')[0];
  showPage(PAGES.includes(id) ? id : 'home', { push: false });
});

function routeInit(id){
  if (id === 'home') loadHome();
  if (id === 'shop') loadShop();
  if (id === 'wishlist') loadWishlistPage();
  if (id === 'dashboard') loadDashboard();
  if (id === 'checkout') loadCheckout();
  if (id === 'custom-order') { /* static form, nothing to load */ }
  if (id === 'gift-store') loadGiftStore();
  if (id === 'smart-plan') loadSmartPlan();
  if (id === 'store-locator') loadStoreLocator();
}

function goProduct(slug){
  location.hash = '#product/' + slug;
  loadProductPage(slug);
  PAGES.forEach(p => { const el = $('#page-' + p); if (el) el.classList.remove('active'); });
  $('#page-product').classList.add('active');
  window.scrollTo(0,0);
  closeCart(); closeAllModals();
}

function initScrollReveal(){
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .15 });
  $$('.reveal').forEach(el => io.observe(el));
}

async function initAuth(){
  const session = await api.getSession();
  await applySession(session);
  api.onAuthChange(async (session) => { await applySession(session); });
}
async function applySession(session){
  state.session = session;
  if (session) {
    state.profile = await api.getProfile(session.user.id).catch(()=>null);
    state.isAdmin = state.profile && ['admin','superadmin'].includes(state.profile.role);
    await Promise.all([refreshCart(), refreshWishlist()]);
  } else {
    state.profile = null; state.isAdmin = false; state.cart = []; state.wishlistIds = new Set();
  }
  renderAuthState();
  renderCartBadge();
  renderWishlistBadge();
}
function renderAuthState(){
  const btn = $('#accountBtn');
  if (!btn) return;
  btn.title = state.session ? (state.profile?.full_name || 'Account') : 'Login / Signup';
  $('#adminLink')?.classList.toggle('hide', !state.isAdmin);
}
function requireAuth(next){
  if (state.session) { next?.(); return true; }
  openAuth('login', next);
  return false;
}

function openAuth(tab = 'login', onSuccess){
  window.__authSuccess = onSuccess;
  $('#authModal').classList.add('open');
  switchAuthTab(tab);
}
function closeAuth(){ $('#authModal').classList.remove('open'); }
function switchAuthTab(tab){
  $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $$('.auth-pane').forEach(p => p.classList.toggle('hide', p.dataset.pane !== tab));
}
async function handleLogin(e){
  e.preventDefault();
  const email = $('#loginEmail').value.trim(), pass = $('#loginPass').value;
  try {
    await api.signIn(email, pass);
    toast('Welcome back!');
    closeAuth();
    window.__authSuccess?.(); window.__authSuccess = null;
  } catch (err) { toast(err.message || 'Login failed', 'err'); }
}
async function handleSignup(e){
  e.preventDefault();
  const name = $('#signupName').value.trim(), phone = $('#signupPhone').value.trim();
  const email = $('#signupEmail').value.trim(), pass = $('#signupPass').value;
  if (pass.length < 6) return toast('Password must be at least 6 characters', 'err');
  try {
    await api.signUp(email, pass, name, phone);
    toast('Account created! You can sign in now.');
    switchAuthTab('login');
  } catch (err) { toast(err.message || 'Signup failed', 'err'); }
}
async function handleForgot(e){
  e.preventDefault();
  const email = $('#forgotEmail').value.trim();
  try { await api.resetPassword(email); toast('Password reset link sent to your email'); switchAuthTab('login'); }
  catch (err) { toast(err.message || 'Could not send reset link', 'err'); }
}
async function handleLogout(){
  await api.signOut();
  toast('Signed out');
  showPage('home');
}

async function refreshCart(){
  if (!state.session) return;
  state.cart = await api.getCart(state.session.user.id).catch(()=>[]);
  renderCartBadge(); renderCartDrawer();
}
function renderCartBadge(){
  const n = state.cart.reduce((s,i)=>s+i.quantity,0);
  const b = $('#cartBadge'); if (b) { b.textContent = n; b.classList.toggle('hide', n === 0); }
}
async function addToCart(productId, qty = 1){
  requireAuth(async () => {
    await api.addToCart(state.session.user.id, productId, qty);
    await refreshCart();
    toast('Added to bag');
    openCart();
  });
}
async function buyNow(productId){
  requireAuth(async () => {
    await api.addToCart(state.session.user.id, productId, 1);
    await refreshCart();
    showPage('checkout');
  });
}
function openCart(){ $('#cartDrawer').classList.add('open'); $('#overlay').classList.add('open'); }
function closeCart(){ $('#cartDrawer')?.classList.remove('open'); if (!anyModalOpen()) $('#overlay')?.classList.remove('open'); }
function toggleCart(){ $('#cartDrawer').classList.contains('open') ? closeCart() : openCart(); }
function anyModalOpen(){ return $$('.modal.open').length > 0; }
function closeAllModals(){ $$('.modal').forEach(m=>m.classList.remove('open')); }

async function updateCartQty(cartItemId, qty){
  await api.updateCartQty(cartItemId, qty);
  await refreshCart();
}
async function removeCartItem(cartItemId){
  await api.removeCartItem(cartItemId);
  await refreshCart();
  toast('Removed from bag');
}
function cartTotals(){
  const subtotal = state.cart.reduce((s,i)=> s + (i.products?.price || 0) * i.quantity, 0);
  const shipping = 0; // shipping is always free
  const discount = state.appliedCoupon?.discount || 0;
  const afterDiscount = Math.max(subtotal - discount, 0) + shipping;
  const giftCardUsed = state.appliedGiftCard ? Math.min(state.appliedGiftCard.balance, afterDiscount) : 0;
  const total = Math.max(afterDiscount - giftCardUsed, 0);
  return { subtotal, shipping, discount, giftCardUsed, total };
}
async function applyGiftCard(){
  const code = $('#giftCardInput').value.trim();
  if (!code) return;
  const card = await api.checkGiftCard(code);
  if (!card) { $('#giftCardMsg').textContent = 'Invalid or already-used gift card code'; $('#giftCardMsg').style.color = 'var(--danger)'; state.appliedGiftCard = null; }
  else { state.appliedGiftCard = card; $('#giftCardMsg').textContent = `Applied — ${money(card.balance)} available on this card`; $('#giftCardMsg').style.color = 'var(--success)'; }
  renderCheckoutSummary();
}
function renderCartDrawer(){
  const body = $('#drawerBody');
  if (!state.cart.length) {
    body.innerHTML = `<div class="empty-state"><div style="font-size:34px">✧</div><p class="h-section" style="font-size:20px">Your bag is empty</p><p class="lede-light">Discover pieces made to be kept.</p></div>`;
  } else {
    body.innerHTML = state.cart.map(i => `
      <div class="cart-row">
        <img src="${esc((i.products?.images||[])[0] || placeholderImg())}" alt="">
        <div class="meta">
          <h4>${esc(i.products?.name)}</h4>
          <div class="price">${money(i.products?.price)}</div>
          <div class="qty-box" style="margin-top:8px">
            <button onclick="updateCartQty('${i.id}', ${i.quantity-1})">−</button>
            <span>${i.quantity}</span>
            <button onclick="updateCartQty('${i.id}', ${i.quantity+1})">+</button>
          </div>
        </div>
        <div class="rm" onclick="removeCartItem('${i.id}')" style="cursor:pointer;font-size:11px;color:rgba(34,31,28,.45);text-decoration:underline;height:fit-content">Remove</div>
      </div>`).join('');
  }
  const t = cartTotals();
  $('#drawerSubtotal').textContent = money(t.subtotal);
  $('#drawerShipping').textContent = t.shipping === 0 ? 'Free' : money(t.shipping);
  $('#drawerTotal').textContent = money(t.total);
  $('#drawerCheckoutBtn').disabled = state.cart.length === 0;
}

async function refreshWishlist(){
  if (!state.session) return;
  const rows = await api.getWishlist(state.session.user.id).catch(()=>[]);
  state.wishlistIds = new Set(rows.map(r=>r.product_id));
  renderWishlistBadge();
}
function renderWishlistBadge(){
  const b = $('#wishBadge'); if (!b) return;
  b.textContent = state.wishlistIds.size;
  b.classList.toggle('hide', state.wishlistIds.size === 0);
}
async function toggleWishlist(productId, btnEl){
  if (!state.session) { openAuth('login', () => toggleWishlist(productId, btnEl)); return; }
  const nowIn = await api.toggleWishlist(state.session.user.id, productId);
  if (nowIn) state.wishlistIds.add(productId); else state.wishlistIds.delete(productId);
  renderWishlistBadge();
  $$('.wish-btn[data-pid="'+productId+'"]').forEach(b => b.classList.toggle('active', nowIn));
  toast(nowIn ? 'Added to wishlist' : 'Removed from wishlist');
}

function placeholderImg(){
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="672"><rect width="100%" height="100%" fill="#F0E9D8"/><text x="50%" y="52%" font-family="Georgia" font-size="20" fill="#C9A24B" text-anchor="middle">KANIKAARA</text></svg>`);
}
function stars(avg){
  const full = Math.round(avg || 0);
  return '★★★★★☆☆☆☆☆'.slice(5-full, 10-full);
}
function productCardHTML(p){
  const img = (p.images && p.images[0]) || placeholderImg();
  const wished = state.wishlistIds.has(p.id);
  return `
  <div class="p-card">
    <div class="thumb" onclick="goProduct('${p.slug}')" style="cursor:pointer">
      <img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">
      ${p.badge ? `<span class="tag">${esc(p.badge)}</span>` : (p.is_new_arrival ? `<span class="tag">New</span>` : '')}
      <div class="wish-btn ${wished?'active':''}" data-pid="${p.id}" onclick="event.stopPropagation();toggleWishlist('${p.id}', this)">
        <svg viewBox="0 0 24 24" stroke-width="1.6"><path d="M12 21s-7.5-4.6-10-9.2C.5 8.2 2.3 4.8 5.7 4.2c2-.3 3.9.7 5 2.3.1.1.3.1.4 0 1.1-1.6 3-2.6 5-2.3 3.4.6 5.2 4 3.7 7.6C19.5 16.4 12 21 12 21z"/></svg>
      </div>
    </div>
    <div class="info">
      <div class="cat">${esc(p.categories?.name || '')}</div>
      <h3 onclick="goProduct('${p.slug}')" style="cursor:pointer">${esc(p.name)}</h3>
      ${p.rating_count ? `<div class="rating"><span class="stars">${stars(p.rating_avg)}</span> (${p.rating_count})</div>` : ''}
      <div class="price-row">
        <span class="price">${money(p.price)}</span>
        ${p.mrp && p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span>` : ''}
      </div>
      <button class="add" onclick="addToCart('${p.id}')">Add to Bag</button>
    </div>
  </div>`;
}
function skeletonGrid(n = 8){
  return Array.from({length:n}).map(()=>`<div class="p-card"><div class="thumb skeleton"></div><div class="info"><div class="skeleton" style="height:12px;width:40%;margin-top:14px"></div><div class="skeleton" style="height:18px;width:80%;margin-top:8px"></div></div></div>`).join('');
}

let homeLoaded = false;
async function loadHome(){
  if (homeLoaded) { initScrollReveal(); return; }
  homeLoaded = true;
  try {
    const [cats, featured, bestsellers, reviews] = await Promise.all([
      api.getCategories(),
      api.getProducts({ featured: true, limit: 8 }),
      api.getProducts({ bestseller: true, limit: 4 }),
      api.getApprovedReviews(3)
    ]);
    state.categories = cats;
    $('#homeCats').innerHTML = cats.slice(0,6).map(c => `
      <a class="cat-tile" href="#shop" onclick="event.preventDefault();filterByCategory('${c.slug}')">
        <div class="arch-frame"><img src="${esc(c.image_url || placeholderImg())}" alt=""></div>
        <span>${esc(c.name)}</span>
      </a>`).join('');
    populateCatDropdowns(cats);

    $('#homeFeatured').innerHTML = featured.length ? featured.map(productCardHTML).join('') : emptyProductsMsg();
    $('#homeBest').innerHTML = bestsellers.length ? bestsellers.map(productCardHTML).join('') : emptyProductsMsg();

    if (reviews.length) {
      $('#homeReviews').innerHTML = reviews.map(r => `
        <div class="rev-card reveal">
          <div class="stars">${stars(r.rating)}</div>
          <p>"${esc(r.body || r.title || '')}"</p>
          <div class="who">${esc(r.profiles?.full_name || 'Verified Customer')}</div>
        </div>`).join('');
    } else {
      $('#reviewsSection')?.classList.add('hide');
    }
  } catch (e) { console.error(e); toast('Could not load homepage content', 'err'); }
  initScrollReveal();
}
function emptyProductsMsg(){
  return `<p class="lede-light" style="grid-column:1/-1;padding:30px 0">Products will appear here once added from the admin panel.</p>`;
}
function filterByCategory(slug){
  state.filters.category = slug;
  showPage('shop');
}
function filterByTag(tag){
  state.filters.tags = [tag];
  state.filters.category = '';
  showPage('shop');
}

async function loadShop(){
  try {
    const jobs = [];
    if (!state.categories.length) jobs.push(api.getCategories().then(c => state.categories = c));
    if (!state.tagGroups) jobs.push(api.getAllTagGroups().then(g => state.tagGroups = g));
    if (jobs.length) await Promise.all(jobs);
    renderShopFilters();
    renderTagFilters();
    await runShopQuery();
  } catch (e) { console.error(e); toast('Could not load shop', 'err'); }
}
const TAG_GROUP_LABELS = { metal:'Metal', colour:'Colour', style:'Style', occasion:'Occasion', theme:'Theme', recipient:'Recipient', collection:'Collection', audience:'Gift For' };
function renderTagFilters(){
  const host = $('#tagFilters');
  if (!host) return;
  const groups = state.tagGroups || {};
  const order = ['occasion','recipient','theme','metal','colour','style','collection','audience'];
  const keys = order.filter(k => groups[k]?.length).concat(Object.keys(groups).filter(k => !order.includes(k) && groups[k]?.length));
  if (!keys.length) { host.innerHTML = ''; return; }
  host.innerHTML = keys.map(g => `
    <div class="filter-group">
      <h5>${esc(TAG_GROUP_LABELS[g] || g)}</h5>
      ${groups[g].map(v => `
        <label class="filter-opt">
          <input type="checkbox" value="${g}:${v}" onchange="toggleTagFilter('${g}:${v}', this.checked)" ${state.filters.tags.includes(g+':'+v)?'checked':''}>
          ${esc(v.replace(/-/g,' '))}
        </label>`).join('')}
    </div>`).join('');
}
function toggleTagFilter(tag, checked){
  if (checked) { if (!state.filters.tags.includes(tag)) state.filters.tags.push(tag); }
  else { state.filters.tags = state.filters.tags.filter(t=>t!==tag); }
  runShopQuery();
}
function renderShopFilters(){
  const host = $('#catFilters');
  host.innerHTML = state.categories.map(c => `
    <label class="filter-opt">
      <input type="radio" name="catFilter" value="${c.slug}" ${state.filters.category===c.slug?'checked':''} onchange="setShopCategory('${c.slug}')">
      ${esc(c.icon||'')} ${esc(c.name)}
    </label>`).join('') + `
    <label class="filter-opt"><input type="radio" name="catFilter" value="" ${!state.filters.category?'checked':''} onchange="setShopCategory('')"> All Categories</label>`;
}
function setShopCategory(slug){ state.filters.category = slug; runShopQuery(); }
function setShopSort(v){ state.filters.sort = v; runShopQuery(); }
function applyPriceFilter(){
  const min = $('#priceMin').value, max = $('#priceMax').value;
  state.filters.minPrice = min ? Number(min) : null;
  state.filters.maxPrice = max ? Number(max) : null;
  runShopQuery();
}
async function runShopQuery(){
  $('#shopGrid').innerHTML = skeletonGrid();
  const products = await api.getProducts({
    categorySlug: state.filters.category || undefined,
    sort: state.filters.sort,
    minPrice: state.filters.minPrice,
    maxPrice: state.filters.maxPrice,
    search: state.filters.search || undefined,
    tags: state.filters.tags.length ? state.filters.tags : undefined
  });
  $('#shopCount').textContent = `${products.length} piece${products.length===1?'':'s'}`;
  $('#shopGrid').innerHTML = products.length ? products.map(productCardHTML).join('') :
    `<div class="empty-state" style="grid-column:1/-1"><div style="font-size:34px">✧</div><p class="h-section" style="font-size:22px">No pieces match yet</p><p class="lede-light">Try a different category or clear filters.</p></div>`;
}
function doSearch(e){
  if (e) e.preventDefault();
  state.filters.search = $('#searchInput').value.trim();
  showPage('shop');
}

async function loadProductPage(slug){
  $('#pdContent').innerHTML = `<div class="skeleton" style="height:400px"></div>`;
  const p = await api.getProductBySlug(slug);
  if (!p) { $('#pdContent').innerHTML = `<p>Product not found.</p>`; return; }
  state.currentProduct = p;
  const imgs = (p.images && p.images.length) ? p.images : [placeholderImg()];
    const videoHtml = p.video_url ? `<video src="${esc(p.video_url)}" controls style="width:100%;margin-top:10px;border:1px solid var(--line-light)"></video>` : '';
  const [reviews, related] = await Promise.all([
    api.getProductReviews(p.id).catch(()=>[]),
    p.category_id ? api.getRelatedProducts(p.category_id, p.id).catch(()=>[]) : []
  ]);
  $('#pdContent').innerHTML = `
    <div class="pd">
      <div class="pd-gallery reveal in">
        <div class="main-img"><img id="pdMainImg" src="${esc(imgs[0])}" alt="${esc(p.name)}"></div>
        ${imgs.length>1 ? `<div class="pd-thumbs">${imgs.map((im,i)=>`<img src="${esc(im)}" class="${i===0?'active':''}" onclick="setPdImg(this,'${esc(im)}')">`).join('')}
                ${videoHtml}</div>` : ''}
      </div>
      <div class="pd-info reveal in">
        <div class="cat">${esc(p.categories?.name||'')}</div>
        <h1>${esc(p.name)}</h1>
        ${p.rating_count ? `<div class="rating-line"><span style="color:var(--gold)">${stars(p.rating_avg)}</span> ${p.rating_avg} (${p.rating_count} reviews)</div>` : ''}
        <div class="pd-price">
          <span class="price">${money(p.price)}</span>
          ${p.mrp && p.mrp>p.price ? `<span class="mrp">${money(p.mrp)}</span><span class="off">${Math.round((1-p.price/p.mrp)*100)}% OFF</span>` : ''}
        </div>
        <div class="pd-specs">
          ${p.material ? `<div><span>Material</span><span>${esc(p.material)}</span></div>`:''}
          ${p.purity ? `<div><span>Purity</span><span>${esc(p.purity)}</span></div>`:''}
          ${p.weight_grams ? `<div><span>Weight</span><span>${p.weight_grams} g</span></div>`:''}
          ${p.hallmark ? `<div><span>Hallmark</span><span>${esc(p.hallmark)}</span></div>`:''}
          ${p.stone_details ? `<div><span>Stones</span><span>${esc(p.stone_details)}</span></div>`:''}
          <div><span>Delivery</span><span>${p.delivery_days||5} business days</span></div>
        </div>
        <div class="pd-qty">
          <div class="qty-box"><button onclick="pdQty(-1)">−</button><span id="pdQtyVal">1</span><button onclick="pdQty(1)">+</button></div>
        </div>
        <div class="pd-actions">
          <button class="btn btn-line-dark btn-block" onclick="addToCart('${p.id}', pdQtyGet())">Add to Bag</button>
          <button class="btn btn-gold btn-block" onclick="buyNow('${p.id}')">Buy Now</button>
        </div>
        <div style="margin-top:14px;display:flex;gap:16px">
          <button class="btn-ghost" onclick="toggleWishlist('${p.id}')">${state.wishlistIds.has(p.id)?'♥ In Wishlist':'♡ Add to Wishlist'}</button>
          <button class="btn-ghost" onclick="openSizeGuide()">Size Guide</button>
        </div>
        <p class="pd-desc">${esc(p.description||'')}</p>
        <div class="pd-tabs">
          <div class="pd-tab active" onclick="switchPdTab(this,'reviews')">Reviews (${reviews.length})</div>
          <div class="pd-tab" onclick="switchPdTab(this,'care')">Care & Returns</div>
        </div>
        <div id="pdTabReviews" style="margin-top:20px">
          ${reviews.length ? reviews.map(r=>`
            <div style="padding:14px 0;border-bottom:1px solid var(--line-light)">
              <div style="color:var(--gold);font-size:13px">${stars(r.rating)}</div>
              <b style="font-size:13.5px">${esc(r.title||'')}</b>
              <p style="font-size:13.5px;color:rgba(34,31,28,.65);margin-top:4px">${esc(r.body||'')}</p>
              <div style="font-size:11.5px;color:rgba(34,31,28,.4);margin-top:6px">${esc(r.profiles?.full_name||'Customer')}</div>
            </div>`).join('') : `<p class="lede-light">No reviews yet — be the first to share your experience.</p>`}
          ${state.session ? `<button class="btn-ghost" style="margin-top:14px" onclick="openReviewForm('${p.id}')">Write a review</button>` : ''}
        </div>
        <div id="pdTabCare" class="hide" style="margin-top:20px;font-size:13.5px;color:rgba(34,31,28,.65);line-height:1.7">
          ${esc(p.care_instructions || 'Store in a dry box, avoid contact with perfume and water, polish gently with a soft cloth.')}<br>${esc(p.return_policy || 'Orders can be cancelled before dispatch. See our Cancellation & Refund Policy for details.')}
        </div>
      </div>
    </div>
    ${related.length ? `
    <section class="block tight">
      <div class="block-inner">
        <div class="eyebrow">You may also like</div>
        <h2 class="h-section" style="margin-bottom:30px">Pairs beautifully with</h2>
        <div class="p-grid">${related.map(productCardHTML).join('')}</div>
      </div>
    </section>`:''}
  `;
  window.scrollTo(0,0);
  initScrollReveal();
}
function setPdImg(el, src){ $('#pdMainImg').src = src; $$('.pd-thumbs img').forEach(i=>i.classList.remove('active')); el.classList.add('active'); }
function pdQty(d){ const el = $('#pdQtyVal'); let v = Math.max(1, Number(el.textContent)+d); el.textContent = v; }
function pdQtyGet(){ return Number($('#pdQtyVal')?.textContent || 1); }
function switchPdTab(el, which){
  $$('.pd-tab').forEach(t=>t.classList.remove('active')); el.classList.add('active');
  $('#pdTabReviews').classList.toggle('hide', which!=='reviews');
  $('#pdTabCare').classList.toggle('hide', which!=='care');
}
function openSizeGuide(){ $('#sizeGuideModal').classList.add('open'); $('#overlay').classList.add('open'); }
function openReviewForm(productId){
  if (!state.session) { openAuth('login', ()=>openReviewForm(productId)); return; }
  window.__reviewProductId = productId;
  $('#reviewModal').classList.add('open'); $('#overlay').classList.add('open');
}
async function submitReviewForm(e){
  e.preventDefault();
  const rating = Number($('#reviewRating').value), title = $('#reviewTitle').value, body = $('#reviewBody').value;
  try {
    await api.submitReview({ product_id: window.__reviewProductId, user_id: state.session.user.id, rating, title, body });
    toast('Thanks! Your review will appear after approval.');
    closeAllModals();
  } catch (err) { toast(err.message||'Could not submit review','err'); }
}

async function loadWishlistPage(){
  if (!state.session) { openAuth('login', loadWishlistPage); return; }
  const rows = await api.getWishlist(state.session.user.id);
  $('#wishlistGrid').innerHTML = rows.length ? rows.map(r=>productCardHTML(r.products)).join('') :
    `<div class="empty-state" style="grid-column:1/-1"><div style="font-size:34px">♡</div><p class="h-section" style="font-size:22px">Nothing saved yet</p><p class="lede-light">Tap the heart on any piece to save it here.</p></div>`;
}

async function loadCheckout(){
  if (!state.session) { openAuth('login', loadCheckout); return; }
  if (!state.cart.length) { toast('Your bag is empty', 'err'); showPage('shop'); return; }
  const addresses = await api.getAddresses(state.session.user.id);
  renderAddressList(addresses);
  renderCheckoutSummary();
  $('#couponMsg').textContent = '';
}
function renderAddressList(addresses){
  const host = $('#addressList');
  if (!addresses.length) {
    host.innerHTML = `<p class="lede-light" style="margin-bottom:14px">No saved address yet. Add one below.</p>`;
  } else {
    host.innerHTML = addresses.map(a => `
      <div class="addr-card ${state.selectedAddressId===a.id?'selected':''}" onclick="selectAddress('${a.id}', this)">
        <b>${esc(a.full_name)} — ${esc(a.label)}</b>
        <p>${esc(a.address_line1)}, ${esc(a.address_line2||'')}<br>${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}<br>Phone: ${esc(a.phone)}</p>
      </div>`).join('');
    if (!state.selectedAddressId) state.selectedAddressId = addresses.find(a=>a.is_default)?.id || addresses[0].id;
    $$('.addr-card').forEach((el,i)=>el.classList.toggle('selected', addresses[i].id===state.selectedAddressId));
  }
}
function selectAddress(id, el){ state.selectedAddressId = id; $$('.addr-card').forEach(c=>c.classList.remove('selected')); el?.classList.add('selected'); }
function toggleNewAddressForm(){ $('#newAddressForm').classList.toggle('hide'); }
async function saveNewAddress(e){
  e.preventDefault();
  const payload = {
    user_id: state.session.user.id,
    label: $('#addrLabel').value || 'Home',
    full_name: $('#addrName').value,
    phone: $('#addrPhone').value,
    address_line1: $('#addrLine1').value,
    address_line2: $('#addrLine2').value,
    city: $('#addrCity').value,
    state: $('#addrState').value,
    pincode: $('#addrPincode').value,
    is_default: $('#addrDefault').checked
  };
  try {
    await api.saveAddress(payload);
    toast('Address saved');
    e.target.reset();
    $('#newAddressForm').classList.add('hide');
    const addrs = await api.getAddresses(state.session.user.id);
    state.selectedAddressId = addrs[addrs.length-1]?.id;
    renderAddressList(addrs);
  } catch (err) { toast(err.message||'Could not save address', 'err'); }
}
function renderReceipt(addr, items, totalAmount){
  const host = $('#confirmReceipt');
  if (!host) return;
  const addrHtml = addr ? `
    <p style="margin:4px 0">${esc(addr.full_name||'')}</p>
    <p style="margin:4px 0">${esc(addr.address_line1||'')}${addr.address_line2?', '+esc(addr.address_line2):''}</p>
    <p style="margin:4px 0">${esc(addr.city||'')}, ${esc(addr.state||'')} - ${esc(addr.pincode||'')}</p>
    <p style="margin:4px 0">Phone: ${esc(addr.phone||'')}</p>` : '<p>No address on file</p>';
  const itemsHtml = (items||[]).map(i=>`
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.08)">
      <span>${esc(i.name)} × ${i.quantity}</span><span>${money(i.price)}</span>
    </div>`).join('');
  host.innerHTML = `
    <div style="text-align:left;margin-top:24px;padding:20px;border:1px solid rgba(0,0,0,.1);border-radius:8px">
      <h3 style="margin-bottom:10px">Shipping to</h3>${addrHtml}
      <h3 style="margin:16px 0 10px">Items</h3>${itemsHtml}
      <div style="display:flex;justify-content:space-between;font-weight:700;margin-top:12px;padding-top:12px;border-top:2px solid #221f1c">
        <span>Total</span><span>${money(totalAmount)}</span>
      </div>
    </div>
    <button class="btn btn-line-dark no-print" style="margin-top:20px" onclick="window.print()">🖨 Print Receipt</button>`;
}
function selectPayMethod(m){
  state.selectedPayMethod = m;
  $$('.pay-opt').forEach(el=>{
    const isMatch = el.dataset.method===m;
    el.classList.toggle('selected', isMatch);
    const radio = el.querySelector('input[type=radio]');
    if (radio) radio.checked = isMatch;
  });
  if ($('#coTotal')) renderCheckoutSummary();
}
async function applyCoupon(){
  const code = $('#couponInput').value.trim();
  if (!code) return;
  const t = cartTotals();
  const res = await api.validateCoupon(code, t.subtotal);
  if (!res.valid) { $('#couponMsg').textContent = res.message; $('#couponMsg').style.color = 'var(--danger)'; state.appliedCoupon = null; }
  else { state.appliedCoupon = { code: res.coupon.code, discount: res.discount }; $('#couponMsg').textContent = `Coupon applied — you saved ${money(res.discount)}`; $('#couponMsg').style.color = 'var(--success)'; }
  renderCheckoutSummary();
}
function renderCheckoutSummary(){
  const t = cartTotals();
  const codFee = state.selectedPayMethod === 'cod' ? 250 : 0;
  $('#coItems').innerHTML = state.cart.map(i=>`
    <div class="mini-row">
      <img src="${esc((i.products?.images||[])[0]||placeholderImg())}">
      <div style="flex:1"><div style="font-size:13px">${esc(i.products?.name)}</div><div style="font-size:12px;color:rgba(34,31,28,.5)">Qty ${i.quantity}</div></div>
      <div style="font-size:13px;font-weight:700">${money((i.products?.price||0)*i.quantity)}</div>
    </div>`).join('');
  $('#coSubtotal').textContent = money(t.subtotal);
  $('#coShipping').textContent = t.shipping===0?'Free':money(t.shipping);
  $('#coDiscount').textContent = t.discount ? '−'+money(t.discount) : '—';
  $('#coGiftCard').textContent = t.giftCardUsed ? '−'+money(t.giftCardUsed) : '—';
  $('#coCodRow').style.display = codFee ? 'flex' : 'none';
  $('#coTotal').textContent = money(t.total + codFee);
}
async function proceedCheckout(){
  if (!$('#agreeTerms').checked) return toast('Please agree to the Terms & Refund Policy to continue', 'err');
  if (!state.selectedAddressId) return toast('Please select or add a delivery address', 'err');
  const t = cartTotals();
  if (state.selectedPayMethod === 'cod') t.total += 250;
  const addresses = await api.getAddresses(state.session.user.id);
  const addr = addresses.find(a=>a.id===state.selectedAddressId);
  if (t.total <= 0 && t.giftCardUsed > 0) { await placeOrder(addr, t, 'gift_card', 'paid'); return; }
  if (state.selectedPayMethod === 'upi') { openPayModal(t.total); return; }
  if (state.selectedPayMethod === 'payu') { payWithPayU(addr, t, 'order'); return; }
  await placeOrder(addr, t, 'cod', 'cod_pending');
}
async function payWithPayU(addr, t, purpose = 'order', extraPayload = {}){
  try {
    const body = {
      purpose,
      amount: t.total ?? t,
      firstname: state.profile?.full_name || addr?.full_name || 'Customer',
      email: state.session?.user?.email || '',
      phone: state.profile?.phone || addr?.phone || '',
      user_id: state.session.user.id,
      ...extraPayload
    };
    if (purpose === 'order') {
      body.shipping_address = addr;
      body.discount_amount = t.discount;
      body.coupon_code = state.appliedCoupon?.code || null;
      body.shipping_amount = t.shipping;
    }
    const { data, error } = await sb.functions.invoke('payu-initiate', { body });
    if (error) throw error;
    if (!data || data.error) throw new Error(data?.error || 'PayU did not return payment details');
    if (!data.action || !data.key || !data.hash) throw new Error('Incomplete response from payment gateway');

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = data.action;
    ['key','txnid','amount','productinfo','firstname','email','phone','surl','furl','udf1','hash'].forEach(k=>{
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = k; input.value = data[k] ?? '';
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  } catch (err) { toast(err.message || 'Could not start PayU payment', 'err'); }
}
async function placeOrder(addr, t, method, paymentStatus, paymentId = null){
  try {
    const order = await api.createOrder({
      user_id: state.session.user.id,
      status: 'pending',
      payment_status: paymentStatus,
      payment_method: method,
      payment_id: paymentId,
      subtotal: t.subtotal,
      discount_amount: t.discount,
      coupon_code: state.appliedCoupon?.code || null,
      shipping_amount: t.shipping,
      total_amount: t.total,
      shipping_address: addr
    }, state.cart);
    if (state.appliedGiftCard && t.giftCardUsed > 0) {
      try { await api.redeemGiftCardAmount(state.appliedGiftCard.id, state.appliedGiftCard.balance - t.giftCardUsed); } catch(_){}
    }
    await api.clearCart(state.session.user.id);
        const pointsEarned = Math.round(t.total * 0.02);
    if (pointsEarned > 0) { try { await api.addLoyaltyPoints(state.session.user.id, pointsEarned); } catch(e){ console.error(e); } }
    renderReceipt(addr, state.cart.map(i=>({name:i.products?.name||i.name, quantity:i.quantity, price:(i.products?.price??i.price)*i.quantity})), t.total);
    state.cart = []; state.appliedCoupon = null; state.appliedGiftCard = null;
    renderCartBadge();
    closePayModal();
    $('#confirmOrderNum').textContent = order.order_number;
    $('#confirmTotal').textContent = money(t.total);
    showPage('order-confirm');
  } catch (err) { toast(err.message || 'Could not place order', 'err'); }
}
function openPayModal(amount){
  $('#payAmount').textContent = money(amount);
  $('#payModal').classList.add('open'); $('#overlay').classList.add('open');
}
function closePayModal(){ $('#payModal').classList.remove('open'); }
function copyUpiId(){ navigator.clipboard.writeText('kanikaara@upi'); toast('UPI ID copied'); }
async function confirmPaymentDone(){
  const t = cartTotals();
  const addresses = await api.getAddresses(state.session.user.id);
  const addr = addresses.find(a=>a.id===state.selectedAddressId);
  await placeOrder(addr, t, 'upi', 'pending');
}

async function submitCustomOrder(e){
  e.preventDefault();
  const payload = {
    user_id: state.session?.user?.id || null,
    full_name: $('#coFullName').value,
    phone: $('#coPhone').value,
    email: $('#coEmail').value,
    jewellery_type: $('#coType').value,
    occasion: $('#coOccasion').value,
    budget_range: $('#coBudget').value,
    description: $('#coDesc').value
  };
  try {
    await api.submitCustomOrder(payload);
    toast('Request received! Our design team will reach out within 24 hours.');
    e.target.reset();
  } catch (err) { toast(err.message||'Could not submit request','err'); }
}

async function loadDashboard(tab = 'orders'){
  if (!state.session) { openAuth('login', ()=>loadDashboard(tab)); return; }
  $('#dashUserName').textContent = state.profile?.full_name || 'Welcome';
  switchDash(tab);
}
function switchDash(tab){
  $$('.dash-nav a').forEach(a=>a.classList.toggle('active', a.dataset.tab===tab));
  $$('.dash-pane').forEach(p=>p.classList.toggle('hide', p.dataset.pane!==tab));
  if (tab==='orders') loadUserOrders();
  if (tab==='wishlist') loadDashWishlist();
  if (tab==='addresses') loadUserAddresses();
  if (tab==='custom') loadUserCustomRequests();
  if (tab==='profile') fillProfileForm();
}
async function loadUserOrders(){
  const orders = await api.getUserOrders(state.session.user.id);
  window.__userOrders = orders;
  $('#dashOrders').innerHTML = orders.length ? orders.map(o=>`
    <div class="dash-card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div><b>${esc(o.order_number)}</b><div style="font-size:12px;color:rgba(34,31,28,.5)">${new Date(o.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} · ${o.order_items.length} item(s)</div></div>
        <div style="text-align:right"><span class="status-badge status-${o.status}">${o.status.replace(/_/g,' ')}</span><div style="margin-top:6px;font-weight:800">${money(o.total_amount)}</div></div>
      </div>
      <button class="action-btn" style="margin-top:10px" onclick="downloadInvoice('${o.id}')">📄 Download Invoice</button>
      ${o.status==='pending' ? `<button class="action-btn" style="margin-top:10px;margin-left:8px;color:var(--danger)" onclick="cancelMyOrder('${o.id}')">✕ Cancel Order</button>` : ''}
    </div>`).join('') : `<p class="lede-light">No orders yet. <a href="#shop" onclick="showPage('shop')" style="color:var(--gold);text-decoration:underline">Start shopping →</a></p>`;
}
async function cancelMyOrder(orderId){
  if (!confirm('Cancel this order? If you already paid online, refund will be processed manually to your original payment method within 7-10 business days.')) return;
  try { await api.cancelOrder(orderId); toast('Order cancelled'); loadUserOrders(); }
  catch (err) { toast(err.message || 'Could not cancel order', 'err'); }
}
async function loadDashWishlist(){
  const rows = await api.getWishlist(state.session.user.id);
  $('#dashWishlist').innerHTML = rows.length ? `<div class="p-grid">${rows.map(r=>productCardHTML(r.products)).join('')}</div>` : `<p class="lede-light">Nothing saved yet.</p>`;
}
async function loadUserAddresses(){
  const rows = await api.getAddresses(state.session.user.id);
  $('#dashAddresses').innerHTML = rows.map(a=>`
    <div class="addr-card"><b>${esc(a.full_name)} — ${esc(a.label)}</b><p>${esc(a.address_line1)}, ${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}<br>Phone: ${esc(a.phone)}</p></div>`).join('') || `<p class="lede-light">No addresses saved.</p>`;
}
async function loadUserCustomRequests(){
  const rows = await api.getUserCustomOrders(state.session.user.id);
  $('#dashCustom').innerHTML = rows.length ? rows.map(r=>`
    <div class="dash-card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between"><b>${esc(r.jewellery_type||'Custom piece')}</b><span class="status-badge status-pending">${esc(r.status)}</span></div>
      <p style="font-size:13px;color:rgba(34,31,28,.6);margin-top:6px">${esc(r.description||'')}</p>
      ${r.quote_amount ? `<p style="margin-top:6px;font-weight:700">Quoted: ${money(r.quote_amount)}</p>`:''}
    </div>`).join('') : `<p class="lede-light">No custom requests yet. <a href="#custom-order" onclick="showPage('custom-order')" style="color:var(--gold);text-decoration:underline">Start one →</a></p>`;
}
function fillProfileForm(){
  $('#profName').value = state.profile?.full_name || '';
  $('#profPhone').value = state.profile?.phone || '';
}
async function saveProfile(e){
  e.preventDefault();
  try {
    await api.updateProfile(state.session.user.id, { full_name: $('#profName').value, phone: $('#profPhone').value });
    state.profile.full_name = $('#profName').value;
    toast('Profile updated');
  } catch (err) { toast(err.message||'Could not update profile','err'); }
}

function generateInvoicePDF(order, isAdmin=false){
  if (typeof window.jspdf === 'undefined') { toast('PDF library still loading — try again in a moment', 'err'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const addr = order.shipping_address || {};
  const gold = [201, 162, 75], ink = [14, 22, 48], mute = [110, 110, 110];

  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...ink);
  doc.text('KANIKAARA', 14, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...gold);
  doc.text('Grace in Gold, Stories Untold', 14, 26);

  doc.setFontSize(16); doc.setTextColor(...ink); doc.setFont('helvetica', 'bold');
  doc.text('TAX INVOICE', 196, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...mute);
  doc.text(`Order: ${order.order_number}`, 196, 27, { align: 'right' });
  doc.text(`Date: ${new Date(order.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}`, 196, 32, { align: 'right' });

  doc.setDrawColor(...gold); doc.setLineWidth(0.5); doc.line(14, 37, 196, 37);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...ink);
  doc.text('Bill To', 14, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60,60,60);
  const billLines = [
    addr.full_name || '',
    addr.address_line1 || '',
    addr.address_line2 || '',
    [addr.city, addr.state, addr.pincode].filter(Boolean).join(', '),
    addr.phone ? `Phone: ${addr.phone}` : ''
  ].filter(Boolean);
  doc.text(billLines, 14, 52);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...ink);
  doc.text('Payment', 130, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60,60,60);
  doc.text([`Method: ${(order.payment_method||'—').toUpperCase()}`, `Status: ${(order.payment_status||'—').toUpperCase()}`], 130, 52);

    const rows = (order.order_items || []).map(i => isAdmin
    ? [i.products?.serial_no ? '#'+i.products.serial_no : '—', i.product_name || '', String(i.quantity), `Rs. ${Number(i.unit_price).toLocaleString('en-IN')}`, `Rs. ${Number(i.total_price).toLocaleString('en-IN')}`]
    : [i.product_name || '', String(i.quantity), `Rs. ${Number(i.unit_price).toLocaleString('en-IN')}`, `Rs. ${Number(i.total_price).toLocaleString('en-IN')}`]
  );
    doc.autoTable({
    startY: 74,
    head: [isAdmin ? ['Sr.No','Item', 'Qty', 'Unit Price', 'Total'] : ['Item', 'Qty', 'Unit Price', 'Total']],
    body: rows,
    theme: 'plain',
    headStyles: { fillColor: ink, textColor: [247,242,231], fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 4 },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
  });

  let y = (doc.lastAutoTable?.finalY || 90) + 10;
  const sumRow = (label, val, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(...(bold ? ink : mute));
    doc.text(label, 150, y); doc.text(val, 196, y, { align: 'right' });
    y += bold ? 8 : 6.5;
  };
  sumRow('Subtotal', `Rs. ${Number(order.subtotal||0).toLocaleString('en-IN')}`);
  if (order.discount_amount) sumRow('Discount', `− Rs. ${Number(order.discount_amount).toLocaleString('en-IN')}`);
  sumRow('Shipping', Number(order.shipping_amount||0) === 0 ? 'Free' : `Rs. ${Number(order.shipping_amount).toLocaleString('en-IN')}`);
  doc.setDrawColor(...gold); doc.line(150, y-4, 196, y-4);
  sumRow('Total', `Rs. ${Number(order.total_amount).toLocaleString('en-IN')}`, true);

  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...mute);
  doc.text('Thank you for shopping with Kanikaara — heritage jewellery from Jaipur, Rajasthan.', 14, 280);

  doc.save(`Kanikaara-Invoice-${order.order_number}.pdf`);
}
function downloadInvoice(orderId){
  const order = (window.__userOrders || []).find(o => o.id === orderId);
  if (!order) return toast('Order not found', 'err');
  generateInvoicePDF(order);
}

async function subscribeEmail(e){
  e.preventDefault();
  const email = e.target.querySelector('input[type=email]').value;
  try { await api.subscribeEmail(email, 'newsletter'); toast('Subscribed! Welcome to the inner circle.'); e.target.reset(); }
  catch { toast('Already subscribed with this email'); }
}

let giftStoreLoaded = false;
async function loadGiftStore(){
  if (!giftStoreLoaded) {
    giftStoreLoaded = true;
    try {
      const [forHer, forHim] = await Promise.all([
        api.getProducts({ tags: ['audience:her'], limit: 4 }),
        api.getProducts({ tags: ['audience:him'], limit: 4 })
      ]);
      $('#giftForHer').innerHTML = forHer.length ? forHer.map(productCardHTML).join('') : `<p class="lede-light" style="grid-column:1/-1">Tag products with "audience:her" from Admin → Products to feature them here.</p>`;
      $('#giftForHim').innerHTML = forHim.length ? forHim.map(productCardHTML).join('') : `<p class="lede-light" style="grid-column:1/-1">Tag products with "audience:him" from Admin → Products to feature them here.</p>`;
    } catch (e) { console.error(e); }
  }
  if (state.session) loadMyGiftCards();
}
function selectGiftAmount(el, amount){
  $$('.gift-amt').forEach(b=>b.classList.remove('selected'));
  el.classList.add('selected');
  $('#giftCustomAmount').value = amount;
}
async function buyGiftCard(e){
  e.preventDefault();
  if (!state.session) { openAuth('login', ()=>buyGiftCard(e)); return; }
  const amount = Number($('#giftCustomAmount').value);
  if (!amount || amount < 500) return toast('Minimum gift card amount is ₹500', 'err');
  const recipient_name = $('#giftRecipientName').value;
  const recipient_email = $('#giftRecipientEmail').value;
  const message = $('#giftMessage').value;
  await payWithPayU(null, amount, 'gift_card', { recipient_name, recipient_email, message });
}
async function loadMyGiftCards(){
  const host = $('#myGiftCards');
  if (!host) return;
  const cards = await api.getUserGiftCards(state.session.user.id);
  host.innerHTML = cards.length ? cards.map(c=>`
    <div class="addr-card"><b>${esc(c.code)}</b> <span class="status-badge status-${c.status==='active'?'delivered':'cancelled'}">${c.status}</span>
    <p>Balance: ${money(c.balance)} of ${money(c.initial_amount)} ${c.recipient_name?'· For: '+esc(c.recipient_name):''}</p></div>`).join('') :
    `<p class="lede-light">No gift cards purchased yet.</p>`;
}

async function submitCorporateEnquiry(e){
  e.preventDefault();
  const payload = {
    company_name: $('#corpCompany').value,
    contact_name: $('#corpContact').value,
    phone: $('#corpPhone').value,
    email: $('#corpEmail').value,
    estimated_quantity: $('#corpQty').value,
    requirement: $('#corpReq').value
  };
  try {
    await api.submitCorporateEnquiry(payload);
    toast('Enquiry received! Our B2B team will reach out within 2 business days.');
    e.target.reset();
  } catch (err) { toast(err.message||'Could not submit enquiry','err'); }
}

async function loadSmartPlan(){
  const plans = await api.getSavingsPlans();
  $('#planGrid').innerHTML = plans.length ? plans.map(p=>`
    <div class="dash-card">
      <h3 style="font-family:var(--serif);font-size:22px">${esc(p.name)}</h3>
      <p class="lede-light" style="margin-top:8px">${esc(p.description||'')}</p>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:16px">
        <span style="font-size:26px;font-weight:800">${money(p.monthly_amount)}</span><span style="font-size:13px;color:rgba(34,31,28,.55)">/ month × ${p.duration_months} months</span>
      </div>
      <p style="margin-top:6px;color:var(--gold);font-weight:700;font-size:13.5px">+${p.bonus_percent}% bonus value on maturity</p>
      <button class="btn btn-gold btn-block" style="margin-top:18px" onclick="subscribeSavingsPlan('${p.id}')">Start This Plan</button>
    </div>`).join('') : `<p class="lede-light">No plans available right now — check back soon.</p>`;
  if (state.session) loadMySubscriptions();
}
async function subscribeSavingsPlan(planId){
  if (!state.session) { openAuth('login', ()=>subscribeSavingsPlan(planId)); return; }
  try {
    await api.subscribeToPlan(state.session.user.id, planId);
    toast('Plan started! Pay your first installment below.');
    loadMySubscriptions();
  } catch (err) { toast(err.message||'Could not start plan','err'); }
}
async function loadMySubscriptions(){
  const host = $('#mySubscriptions');
  if (!host) return;
  const subs = await api.getUserSubscriptions(state.session.user.id);
  host.innerHTML = subs.length ? subs.map(s=>`
    <div class="dash-card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <b>${esc(s.savings_plans?.name)}</b>
        <span class="status-badge status-${s.status==='active'?'pending':s.status==='matured'?'delivered':'cancelled'}">${s.status}</span>
      </div>
      <p style="font-size:13px;color:rgba(34,31,28,.6);margin-top:6px">${s.months_paid}/${s.savings_plans?.duration_months} months paid · Total saved: ${money(s.total_paid)}</p>
${s.status==='active' ? `<button class="btn btn-line-dark btn-sm" style="margin-top:10px" onclick="paySavingsInstallment('${s.id}', ${s.savings_plans.monthly_amount})">Pay This Month (${money(s.savings_plans.monthly_amount)})</button>
        <button class="btn-ghost btn-sm" style="margin-top:10px;margin-left:8px;color:var(--danger)" onclick="cancelSavingsPlan('${s.id}')">Cancel Plan</button>` : ''}
      ${s.status==='matured' ? `<p style="margin-top:8px;font-size:13px;color:var(--success);font-weight:700">Matured! Visit the store or contact us to redeem towards a purchase.</p>` : ''}
    </div>`).join('') : `<p class="lede-light">No active plans yet.</p>`;
}
async function cancelSavingsPlan(subscriptionId){ if (!confirm('Are you sure you want to cancel this plan? This cannot be undone.')) return; try { await api.cancelSubscription(subscriptionId); toast('Plan cancelled'); loadMySubscriptions(); } catch (err) { toast(err.message || 'Could not cancel plan', 'err'); } }
async function paySavingsInstallment(subscriptionId, amount){
  await payWithPayU(null, amount, 'savings_payment', { subscription_id: subscriptionId });
}

async function loadStoreLocator(){
  const stores = await api.getStoreLocations();
  $('#storeList').innerHTML = stores.length ? stores.map(s=>`
    <div class="dash-card" style="margin-bottom:16px">
      <h3 style="font-family:var(--serif);font-size:20px">${esc(s.name)}</h3>
      <p class="lede-light" style="margin-top:8px">${esc(s.address)}${s.city?', '+esc(s.city):''}${s.state?', '+esc(s.state):''} ${esc(s.pincode||'')}</p>
      ${s.phone ? `<p style="font-size:13.5px;margin-top:6px">📞 ${esc(s.phone)}</p>`:''}
      ${s.hours ? `<p style="font-size:13.5px;margin-top:2px">🕐 ${esc(s.hours)}</p>`:''}
    </div>`).join('') : `<p class="lede-light">Store locations will appear here once added from the admin panel.</p>`;
}

function toggleMobileMenu(){ $('#mobileMenu').classList.toggle('open'); }
function populateCatDropdowns(cats){
  const el = $('#footerCatList');
  if (el) el.innerHTML = cats.slice(0,6).map(c=>`<li><a href="#shop" onclick="event.preventDefault();filterByCategory('${c.slug}')">${esc(c.name)}</a></li>`).join('');
}

async function boot(){
  const settingsJob = api.getSettings().then(s => {
    state.settings = s;
    if (s.announcement_text) $('#announceText').textContent = s.announcement_text;
    const wa = (s.whatsapp_number || '').replace(/[^0-9]/g,'');
    if (wa) { $('#waFloat').href = `https://wa.me/${wa}?text=${encodeURIComponent('Hi! I have a question about a Kanikaara piece.')}`; $('#waFloat').classList.remove('hide'); }
  }).catch(e => console.error(e));
  const authJob = initAuth();
  await Promise.all([settingsJob, authJob]);
  const rawHash = (location.hash || '#home').slice(1);
  const [hashPath, hashQuery] = rawHash.split('?');
  const [pageId, arg] = hashPath.split('/');
  if (pageId === 'product' && arg) { $('#page-home').classList.remove('active'); goProduct(arg); }
  else if (pageId === 'order-confirm' && arg) {
    showPage('order-confirm', { push: false });
    try {
      const order = await api.getOrderByNumber(arg);
      if (order) { renderReceipt(order.shipping_address, (order.order_items||[]).map(i=>({name:i.product_name, quantity:i.quantity, price:i.total_price})), order.total_amount); $('#confirmOrderNum').textContent = order.order_number; $('#confirmTotal').textContent = money(order.total_amount); }
    } catch(e){ console.error(e); }
  }
  else {
    showPage(PAGES.includes(pageId) ? pageId : 'home', { push: false });
    if (pageId === 'checkout' && hashQuery?.includes('payu=')) {
      toast('PayU payment did not complete — please try again or choose another payment method.', 'err');
    }
    if (pageId === 'gift-store' && hashQuery?.includes('payu=giftcard_success')) {
      toast('Gift card purchased! See it below under "My Gift Cards".');
    }
    if (pageId === 'smart-plan' && hashQuery?.includes('payu=payment_success')) {
      toast('Installment recorded — thank you!');
    }
  }

  $('#overlay').addEventListener('click', () => { closeCart(); closeAllModals(); });
  initScrollReveal();
}
document.addEventListener('DOMContentLoaded', boot);
