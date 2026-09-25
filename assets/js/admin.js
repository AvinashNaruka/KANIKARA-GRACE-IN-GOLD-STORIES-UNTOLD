function openAdmin(){
  if (!state.session) { toast('Please sign in first', 'err'); openAuth('login', openAdmin); return; }
  if (!state.isAdmin) { toast('Admin access only', 'err'); return; }
  $('#page-admin').classList.add('active');
  PAGES.forEach(p => $('#page-'+p)?.classList.remove('active'));
  document.body.classList.add('admin-mode');
  switchAdmin('dashboard');
}
function closeAdmin(){
  document.body.classList.remove('admin-mode');
  $('#page-admin').classList.remove('active');
  showPage('home');
}
function switchAdmin(tab){
  $$('.admin-side a').forEach(a=>a.classList.toggle('active', a.dataset.tab===tab));
  $$('.admin-pane').forEach(p=>p.classList.toggle('hide', p.dataset.pane!==tab));
  const loaders = {
    dashboard: loadAdminDashboard, products: loadAdminProducts, categories: loadAdminCats,banners: loadAdminBanners, materials: loadAdminMaterials,
    orders: loadAdminOrders, coupons: loadAdminCoupons, custom: loadAdminCustom,
    reviews: loadAdminReviews, customers: loadAdminCustomers, settings: loadAdminSettings,
    giftcards: loadAdminGiftCards, corporate: loadAdminCorporate, plans: loadAdminPlans,
    stores: loadAdminStores, press: loadAdminPress
  };
  loaders[tab]?.();
}

async function loadAdminDashboard(){
  const s = await api.adminStats();
  $('#adminStats').innerHTML = `
    <div class="stat"><div class="num">${money(s.revenue)}</div><div class="lbl">Revenue (paid)</div></div>
    <div class="stat"><div class="num">${s.orderCount}</div><div class="lbl">Orders</div></div>
    <div class="stat"><div class="num">${s.productCount}</div><div class="lbl">Products</div></div>
    <div class="stat"><div class="num">${s.userCount}</div><div class="lbl">Customers</div></div>`;
  const orders = await api.adminAllOrders();
  $('#adminRecentOrders').innerHTML = orders.slice(0,6).map(o=>`
    <tr><td>${esc(o.order_number)}</td><td>${esc(o.profiles?.full_name||'—')}</td><td>${money(o.total_amount)}</td><td><span class="status-badge status-${o.status}">${o.status}</span></td></tr>`).join('') ||
    `<tr><td colspan="4">No orders yet</td></tr>`;
}

const adminProdState = { mode: 'folders', categoryId: null };

async function loadAdminProducts(){
  const [products, cats] = await Promise.all([api.adminAllProducts(), api.adminAllCategories()]);
  state.categories = cats.length ? cats : state.categories;
  window.__adminCats = cats;
  window.__adminProducts = products;
  renderAdminProductsView();
}

function toggleAdminProductView(){
  adminProdState.mode = (adminProdState.mode === 'all') ? 'folders' : 'all';
  adminProdState.categoryId = null;
  renderAdminProductsView();
}
function openAdminCategoryFolder(catId){
  adminProdState.mode = 'category';
  adminProdState.categoryId = catId; 
  renderAdminProductsView();
}
function backToAdminFolders(){
  adminProdState.mode = 'folders';
  adminProdState.categoryId = null;
  renderAdminProductsView();
}

function renderAdminProductsView(){
  const products = window.__adminProducts || [];
  const cats = window.__adminCats || [];
  const foldersEl = $('#adminProdFolders');
  const catViewEl = $('#adminProdCategoryView');
  const allViewEl = $('#adminProdAllView');
  const toggleBtn = $('#adminProdViewToggle');
  if (!foldersEl || !catViewEl || !allViewEl) return;

  foldersEl.classList.add('hide');
  catViewEl.classList.add('hide');
  allViewEl.classList.add('hide');

  if (adminProdState.mode === 'all'){
    if (toggleBtn) toggleBtn.textContent = '📁 Group by Category';
    allViewEl.classList.remove('hide');
    renderAdminProductsTable(products);
    return;
  }

  if (adminProdState.mode === 'category'){
    if (toggleBtn) toggleBtn.textContent = 'View All';
    catViewEl.classList.remove('hide');
    const catId = adminProdState.categoryId;
    const cat = catId && catId !== 'uncategorized' ? cats.find(c=>c.id===catId) : null;
    const catProducts = catId === 'uncategorized'
      ? products.filter(p=>!p.category_id)
      : products.filter(p=>p.category_id===catId);
    const title = cat ? `${esc(cat.icon||'')} ${esc(cat.name)}` : 'Uncategorised';
    catViewEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;flex-wrap:wrap">
        <button class="btn-ghost" onclick="backToAdminFolders()">← All Categories</button>
        <h2 style="font-family:var(--serif);font-size:24px">${title}
          <span style="font-size:14px;color:rgba(34,31,28,.5);font-weight:400">(${catProducts.length} piece${catProducts.length===1?'':'s'})</span>
        </h2>
      </div>
      <div class="p-grid">
        ${catProducts.length ? catProducts.map(adminProductCardHTML).join('') :
          `<p class="lede-light" style="grid-column:1/-1">No products in this category yet.</p>`}
      </div>`;
    return;
  }

  if (toggleBtn) toggleBtn.textContent = 'View All';
  foldersEl.classList.remove('hide');
  const countFor = id => products.filter(p=>p.category_id===id).length;
  const tops = cats.filter(c=>!c.parent_id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const uncategorized = products.filter(p=>!p.category_id);

  const folderTile = (c, sub) => {
    const total = sub ? countFor(c.id) : countFor(c.id) + cats.filter(ch=>ch.parent_id===c.id).reduce((s,ch)=>s+countFor(ch.id),0);
    const img = c.image_url || placeholderImg();
    return `
    <a class="cat-tile" href="#" onclick="event.preventDefault();openAdminCategoryFolder('${c.id}')" style="${sub?'opacity:.9':''}">
      <div class="arch-frame" style="aspect-ratio:1/1"><img src="${esc(img)}" alt=""></div>
      <span style="${sub?'font-size:14px':''}">${sub?'↳ ':''}${esc(c.icon||'')} ${esc(c.name)}</span>
      <div style="font-size:11.5px;color:rgba(34,31,28,.5);margin-top:4px">${total} piece${total===1?'':'s'}</div>
    </a>`;
  };

  let html = `<div class="cat-scroll" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));overflow:visible">`;
  tops.forEach(c => {
    html += folderTile(c, false);
    cats.filter(ch=>ch.parent_id===c.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).forEach(ch => { html += folderTile(ch, true); });
  });
  if (uncategorized.length){
    html += `
    <a class="cat-tile" href="#" onclick="event.preventDefault();openAdminCategoryFolder('uncategorized')">
      <div class="arch-frame" style="aspect-ratio:1/1"><img src="${placeholderImg()}" alt=""></div>
      <span>Uncategorised</span>
      <div style="font-size:11.5px;color:rgba(34,31,28,.5);margin-top:4px">${uncategorized.length} piece${uncategorized.length===1?'':'s'}</div>
    </a>`;
  }
  html += `</div>`;
  if (!tops.length && !uncategorized.length) html = `<p class="lede-light">Add a category first, then your products will be grouped here automatically.</p>`;
  foldersEl.innerHTML = html;
}

function adminProductCardHTML(p){
  const img = (p.images && p.images[0]) || placeholderImg();
  return `
  <div class="p-card">
    <div class="thumb" onclick="editProduct('${p.id}')" style="cursor:pointer">
      <img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">
      <span class="tag">${p.serial_no ? esc(p.serial_no) : '—'}</span>
      ${p.is_active === false ? `<span class="tag" style="left:auto;right:10px;background:var(--danger)">Hidden</span>` : ''}
    </div>
    <div class="info">
      <div class="cat">${esc(p.categories?.name || '')}</div>
      <h3 onclick="editProduct('${p.id}')" style="cursor:pointer">${esc(p.name)}</h3>
      <div class="price-row">
        <span class="price">${money(p.price)}</span>
        ${p.mrp && p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span>` : ''}
      </div>
      <div style="font-size:11.5px;color:rgba(34,31,28,.5);margin-top:6px">Stock: ${p.stock_quantity ?? 0}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="action-btn" style="flex:1" onclick="editProduct('${p.id}')">Edit</button>
        <button class="action-btn" style="flex:1;color:var(--danger)" onclick="deleteProduct('${p.id}')">Delete</button>
      </div>
    </div>
  </div>`;
}

function renderAdminProductsTable(products){
  const tbl = $('#adminProductsTbl');
  if (!tbl) return;
  tbl.innerHTML = products.map(p=>`
    <tr>
      <td>${p.serial_no ? esc(p.serial_no) : '—'}</td>
      <td><img src="${esc((p.images||[])[0]||placeholderImg())}" style="width:42px;height:42px;object-fit:cover"></td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.categories?.name||'—')}</td>
      <td>${money(p.price)}</td>
      <td>${p.stock_quantity}</td>
      <td>${p.is_active ? '<span class="status-badge status-delivered">Active</span>' : '<span class="status-badge status-cancelled">Hidden</span>'}</td>
      <td><button class="action-btn" onclick="editProduct('${p.id}')">Edit</button> <button class="action-btn" onclick="deleteProduct('${p.id}')">Delete</button></td>
    </tr>`).join('') || `<tr><td colspan="8">No products yet. Add your first piece →</td></tr>`;
}

function categoryPrefix(cat){
  if (!cat || !cat.name) return 'KX';
  const letter = cat.name.trim().charAt(0).toUpperCase() || 'X';
  return 'K' + letter;
}
function nextSerialNoForCategory(categoryId){
  const cats = window.__adminCats || state.categories || [];
  const cat = cats.find(c=>c.id===categoryId);
  const prefix = categoryPrefix(cat);
  const products = window.__adminProducts || [];
  const nums = products
    .filter(p => p.serial_no && String(p.serial_no).toUpperCase().startsWith(prefix))
    .map(p => parseInt(String(p.serial_no).slice(prefix.length), 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + String(next).padStart(3, '0');
}

async function backfillSerialNumbers(){
  const products = window.__adminProducts || [];
  const cats = window.__adminCats || [];
  if (!products.length) { toast('No products to number', 'err'); return; }
  if (!confirm('This assigns a fresh serial number (like KP001) to every product based on its category, ordered by when it was added — oldest first. Existing serial numbers will be overwritten. Continue?')) return;

  const groups = {};
  products.forEach(p => {
    const key = p.category_id || 'uncategorized';
    (groups[key] = groups[key] || []).push(p);
  });

  const updates = [];
  Object.keys(groups).forEach(key => {
    const cat = key === 'uncategorized' ? null : cats.find(c=>c.id===key);
    const prefix = categoryPrefix(cat);
    const list = groups[key].slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    list.forEach((p, i) => {
      const code = prefix + String(i + 1).padStart(3, '0');
      if (p.serial_no !== code) updates.push({ id: p.id, serial_no: code });
    });
  });

  if (!updates.length) { toast('All products are already numbered correctly'); return; }

  toast(`Numbering ${updates.length} product(s)…`);
  try {
    const results = await Promise.allSettled(updates.map(u => api.adminSaveProduct(u)));
    const failed = results.filter(r => r.status === 'rejected').length;
    toast(failed ? `Done, but ${failed} product(s) could not be updated` : `Serial numbers assigned to ${updates.length} product(s) ✓`, failed ? 'err' : '');
    loadAdminProducts();
  } catch (err) {
    toast(err.message || 'Could not assign serial numbers', 'err');
  }
}
function showAddProduct(){
  $('#productForm').reset(); $('#productFormId').value = '';
  $('#productFormTitle').textContent = 'Add Product';
  $('#productCat').innerHTML = (window.__adminCats||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    api.getMaterials().then(mats => $('#productMaterial').innerHTML = mats.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join(''));
  $('#productImgPreview').innerHTML = '';
  $('#productModal').classList.add('open'); $('#overlay').classList.add('open');
    window.__productVariants = [];
  renderVariantList();
  updateSerialPreview();
}
function updateSerialPreview(){
  const box = $('#serialPreview');
  if (!box) return;
  const isEdit = !!$('#productFormId').value;
  if (isEdit) { box.textContent = ''; return; }
  const catId = $('#productCat').value;
  if (!catId) { box.textContent = ''; return; }
  box.textContent = 'This product will be numbered: ' + nextSerialNoForCategory(catId);
}
function compressImage(file, maxDim = 1400, quality = 0.82){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Compression failed'));
          resolve(new File([blob], file.name.replace(/\.(png|jpe?g|webp|heic)$/i, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function uploadProductVideo(input){
  const file = input.files?.[0];
  if (!file) return;
  const status = $('#uploadStatus');
  status.textContent = `Uploading video…`;
  try {
    const path = `video-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g,'-')}`;
    const { error } = await sb.storage.from('product-images').upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = sb.storage.from('product-images').getPublicUrl(path);
    $('#productVideo').value = data.publicUrl;
    status.textContent = 'Video uploaded ✓';
  } catch (err) { toast(`Could not upload video: ${err.message || 'unknown error'}`, 'err'); }
  input.value = '';
}
async function uploadProductImages(input){
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const status = $('#uploadStatus');
  status.textContent = `Compressing & uploading ${files.length} image(s)…`;
  const existing = $('#productImages').value.split(',').map(s=>s.trim()).filter(Boolean);
  const uploaded = [];
  for (const original of files) {
    try {
      const file = await compressImage(original).catch(() => original); 
      const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${file.name.replace(/[^a-zA-Z0-9.]+/g,'-')}`;
      const { error } = await sb.storage.from('product-images').upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data } = sb.storage.from('product-images').getPublicUrl(path);
      uploaded.push(data.publicUrl);
    } catch (err) {
      toast(`Could not upload ${original.name}: ${err.message || 'unknown error'}`, 'err');
    }
  }
  const all = [...existing, ...uploaded];
  $('#productImages').value = all.join(', ');
  renderImgPreview(all);
  status.textContent = uploaded.length ? `${uploaded.length} image(s) uploaded ✓ (auto-compressed for fast loading)` : '';
  input.value = '';
}
function renderImgPreview(urls){
  $('#productImgPreview').innerHTML = urls.map((u,i)=>`
    <div style="position:relative">
      <img src="${esc(u)}" style="width:96px;height:96px;object-fit:cover;border:1px solid var(--line-light)">
      <button type="button" onclick="removeImgFromField(${i})" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;background:var(--danger);color:#fff;border-radius:50%;font-size:11px;line-height:1">✕</button>
    </div>`).join('');
}
function removeImgFromField(idx){
  const urls = $('#productImages').value.split(',').map(s=>s.trim()).filter(Boolean);
  urls.splice(idx,1);
  $('#productImages').value = urls.join(', ');
  renderImgPreview(urls);
}
function hideAddProduct(){ $('#productModal').classList.remove('open'); }
function editProduct(id){
  const p = (window.__adminProducts||[]).find(x=>x.id===id);
  if (!p) return;
  showAddProduct();
  $('#productFormTitle').textContent = 'Edit Product';
  $('#productFormId').value = p.id;
  $('#productName').value = p.name || '';
  $('#productCat').value = p.category_id || '';
  api.getMaterials().then(mats => { $('#productMaterial').innerHTML = mats.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join(''); $('#productMaterial').value = p.material || ''; });
  $('#productPrice').value = p.price || '';
  $('#productMrp').value = p.mrp || '';
  $('#productStock').value = p.stock_quantity || 0;
  $('#productMaterial').value = p.material || '';
  $('#productPurity').value = p.purity || '';
  $('#productWeight').value = p.weight_grams || '';
  $('#productImages').value = (p.images||[]).join(', ');
    $('#productVideo').value = p.video_url || '';
  renderImgPreview(p.images||[]);
  $('#productDesc').value = p.description || '';
  $('#productTags').value = (p.tags||[]).join(', ');
  $('#productFeatured').checked = !!p.is_featured;
  $('#productBestseller').checked = !!p.is_bestseller;
  $('#productActive').checked = p.is_active !== false;
  updateSerialPreview();
}
async function saveProduct(e){
  e.preventDefault();
  const name = $('#productName').value.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '-' + Math.random().toString(36).slice(2,6);
  const payload = {
    id: $('#productFormId').value || undefined,
    name,
    category_id: $('#productCat').value || null,
    price: Number($('#productPrice').value),
    mrp: $('#productMrp').value ? Number($('#productMrp').value) : null,
    stock_quantity: Number($('#productStock').value || 0),
    material: $('#productMaterial').value,
    purity: $('#productPurity').value,
    weight_grams: $('#productWeight').value ? Number($('#productWeight').value) : null,
    images: $('#productImages').value.split(',').map(s=>s.trim()).filter(Boolean),
            video_url: $('#productVideo').value.trim() || null,
    description: $('#productDesc').value,
    tags: $('#productTags').value.split(',').map(s=>s.trim()).filter(Boolean),
    is_featured: $('#productFeatured').checked,
    is_bestseller: $('#productBestseller').checked,
    is_active: $('#productActive').checked,
    variants: window.__productVariants || []
  };
  if (!payload.id) {
    payload.slug = slug;
    payload.serial_no = nextSerialNoForCategory(payload.category_id);
  }
  try {
    await api.adminSaveProduct(payload);
    toast('Product saved');
    hideAddProduct();
    loadAdminProducts();
  } catch (err) { toast(err.message||'Could not save product', 'err'); }
}
async function deleteProduct(id){
  const p = (window.__adminProducts||[]).find(x=>x.id===id);
  const name = p ? p.name : 'this product';
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try { await api.adminDeleteProduct(id); toast('Product deleted'); loadAdminProducts(); }
  catch (err) { toast(err.message||'Could not delete', 'err'); }
}

async function loadAdminCats(){
  const cats = await api.adminAllCategories();
  window.__adminCats = cats;
  $('#catParent').innerHTML = '<option value="">— None —</option>' + cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const tops = cats.filter(c=>!c.parent_id).sort((a,b)=>a.sort_order-b.sort_order);
  const ordered = [];
  tops.forEach(p => {
    ordered.push(p);
    cats.filter(c=>c.parent_id===p.id).sort((a,b)=>a.sort_order-b.sort_order).forEach(c=>ordered.push(c));
  });
  cats.filter(c=>c.parent_id && !cats.find(p=>p.id===c.parent_id)).forEach(c=>ordered.push(c));
  $('#adminCatsTbl').innerHTML = ordered.map(c=>{
    const parentName = c.parent_id ? (cats.find(p=>p.id===c.parent_id)?.name || '') : '';
    return `
    <tr><td>${c.icon||''}</td><td>${parentName?'&nbsp;&nbsp;&nbsp;&nbsp;↳ ':''}${esc(c.name)}</td><td>${esc(c.slug)}</td><td>${c.sort_order}</td>
    <td>${c.is_active?'<span class="status-badge status-delivered">Active</span>':'<span class="status-badge status-cancelled">Hidden</span>'}</td>
    <td><button class="action-btn" onclick="editCategory('${c.id}')">Edit</button> <button class="action-btn" onclick="deleteCategory('${c.id}')">Delete</button></td></tr>`;
  }).join('');
}

async function loadAdminMaterials(){
  const mats = await api.getMaterials();
  window.__adminMaterials = mats;
  $('#adminMaterialsTbl').innerHTML = mats.map(m=>`
    <tr><td>${esc(m.name)}</td><td><button class="action-btn" style="color:var(--danger)" onclick="deleteMaterial('${m.id}')">Delete</button></td></tr>`).join('') || `<tr><td colspan="2">No materials yet</td></tr>`;
}
async function addMaterial(){
  const name = $('#newMaterialName').value.trim();
  if (!name) return;
  try { await api.adminSaveMaterial(name); $('#newMaterialName').value=''; toast('Material added'); loadAdminMaterials(); }
  catch (err) { toast(err.message||'Could not add material', 'err'); }
}
async function deleteMaterial(id){
  const m = (window.__adminMaterials||[]).find(x=>x.id===id);
  const name = m ? m.name : 'this material';
  if (!confirm(`Delete "${name}"?`)) return;
  try { await api.adminDeleteMaterial(id); toast('Material deleted'); loadAdminMaterials(); }
  catch (err) { toast(err.message||'Could not delete', 'err'); }
}
function showAddCat(){
  $('#categoryForm').reset(); $('#categoryFormId').value = '';
  $('#categoryModal').classList.add('open'); $('#overlay').classList.add('open');
}
function editCategory(id){
  const c = (window.__adminCats||[]).find(x=>x.id===id); if (!c) return;
  showAddCat();
  $('#categoryFormId').value = c.id;
  $('#catName').value = c.name; $('#catIcon').value = c.icon||''; $('#catOrder').value = c.sort_order||0;
  $('#catActive').checked = c.is_active !== false;
  $('#catImage').value = c.image_url || ''; $('#catParent').value = c.parent_id || '';
}
async function saveCategory(e){
  e.preventDefault();
  const name = $('#catName').value.trim();
  const payload = { id: $('#categoryFormId').value || undefined, name, icon: $('#catIcon').value, sort_order: Number($('#catOrder').value||0), is_active: $('#catActive').checked , image_url: $('#catImage').value.trim() || null, parent_id: $('#catParent').value || null};
  if (!payload.id) payload.slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  try { await api.adminSaveCategory(payload); toast('Category saved'); $('#categoryModal').classList.remove('open'); loadAdminCats(); }
  catch (err) { toast(err.message||'Could not save category','err'); }
}
async function deleteCategory(id){
  if (!confirm('Delete this category? Products in it will become uncategorised, not deleted.')) return;
  try { await sb.from('categories').delete().eq('id', id); toast('Category deleted'); loadAdminCats(); }
  catch (err) { toast(err.message||'Could not delete', 'err'); }
}

async function loadAdminOrders(){
  const orders = await api.adminAllOrders();
  window.__adminOrders = orders;
  $('#adminOrdersTbl').innerHTML = orders.map(o=>`
    <tr>
      <td>${esc(o.order_number)}</td>
      <td>${esc(o.profiles?.full_name||'—')}<br><span style="font-size:11px;color:rgba(34,31,28,.5)">${esc(o.profiles?.phone||'')}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('en-IN')}</td>
      <td>${money(o.total_amount)}</td>
      <td>${esc(o.payment_method||'—')} / ${esc(o.payment_status)}</td>
      <td>
        <select onchange="adminUpdateOrderStatus('${o.id}', this.value)">
          ${['pending','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled','returned','refunded'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>
        <button class="action-btn" onclick="generateInvoicePDF((window.__adminOrders||[]).find(x=>x.id==='${o.id}'), true)">📄 Download</button>
        <button class="action-btn" style="margin-top:6px" onclick="openDeliveryDetails('${o.id}')">🚚 Delivery Details</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7">No orders yet</td></tr>`;
}
async function adminUpdateOrderStatus(id, status){
  try { await api.adminUpdateOrderStatus(id, status); toast('Order status updated'); }
  catch (err) { toast(err.message||'Could not update order','err'); }
}

function openDeliveryDetails(orderId){
  const order = (window.__adminOrders||[]).find(o=>o.id===orderId);
  if (!order) return toast('Order not found', 'err');
  const courier = prompt('Courier / shipping partner name:', order.courier_name || '');
  if (courier === null) return; // cancelled
  const tracking = prompt('Tracking number:', order.tracking_number || '');
  if (tracking === null) return;
  const url = prompt('Tracking link (optional — customer can click "Track shipment"):', order.tracking_url || '');
  if (url === null) return;
  saveDeliveryDetails(orderId, order.status, {
    courier_name: courier.trim() || null,
    tracking_number: tracking.trim() || null,
    tracking_url: url.trim() || null
  });
}
async function saveDeliveryDetails(orderId, currentStatus, details){
  try {

    await api.adminUpdateOrderStatus(orderId, currentStatus, details);
    toast('Delivery details saved — the customer can now see them');
    loadAdminOrders();
  } catch (err) { toast(err.message || 'Could not save delivery details', 'err'); }
}

async function loadAdminCoupons(){
  const coupons = await api.adminAllCoupons();
  window.__adminCoupons = coupons;
  $('#adminCouponsTbl').innerHTML = coupons.map(c=>`
    <tr><td><b>${esc(c.code)}</b></td><td>${esc(c.description||'')}</td>
    <td>${c.discount_type==='percent'?c.discount_value+'%':money(c.discount_value)}</td>
    <td>${c.used_count}${c.usage_limit?'/'+c.usage_limit:''}</td>
    <td>${c.is_active?'<span class="status-badge status-delivered">Active</span>':'<span class="status-badge status-cancelled">Off</span>'}</td>
    <td><button class="action-btn" onclick="editCoupon('${c.id}')">Edit</button></td></tr>`).join('') || `<tr><td colspan="6">No coupons yet</td></tr>`;
}
function showAddCoupon(){ $('#couponForm').reset(); $('#couponFormId').value=''; $('#couponModal').classList.add('open'); $('#overlay').classList.add('open'); }
function editCoupon(id){
  const c = (window.__adminCoupons||[]).find(x=>x.id===id); if (!c) return;
  showAddCoupon();
  $('#couponFormId').value = c.id; $('#couponCode').value = c.code; $('#couponDesc').value = c.description||'';
  $('#couponType').value = c.discount_type; $('#couponValue').value = c.discount_value; $('#couponMin').value = c.min_order_amount||0;
  $('#couponMaxDiscount').value = c.max_discount || ''; $('#couponPerUser').value = c.per_user_limit || 1;
  $('#couponActive').checked = c.is_active !== false;
}
async function saveCoupon(e){
  e.preventDefault();
  const payload = {
    id: $('#couponFormId').value || undefined,
    code: $('#couponCode').value.trim().toUpperCase(),
    description: $('#couponDesc').value,
    discount_type: $('#couponType').value,
    discount_value: Number($('#couponValue').value),
    min_order_amount: Number($('#couponMin').value||0),
    max_discount: $('#couponMaxDiscount').value ? Number($('#couponMaxDiscount').value) : null,
    per_user_limit: Number($('#couponPerUser').value || 1),
    is_active: $('#couponActive').checked
  };
  try { await api.adminSaveCoupon(payload); toast('Coupon saved'); $('#couponModal').classList.remove('open'); loadAdminCoupons(); }
  catch (err) { toast(err.message||'Could not save coupon','err'); }
}

async function loadAdminCustom(){
  const rows = await api.adminAllCustomOrders();
  $('#adminCustomTbl').innerHTML = rows.map(r=>`
    <tr><td>${esc(r.full_name)}<br><span style="font-size:11px;color:rgba(34,31,28,.5)">${esc(r.phone)}</span></td>
    <td>${esc(r.jewellery_type||'—')}</td><td>${esc(r.budget_range||'—')}</td>
    <td>
      <select onchange="adminUpdateCustom('${r.id}', this.value)">
        ${['new','reviewing','quoted','accepted','in_production','completed','cancelled'].map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td></tr>`).join('') || `<tr><td colspan="5">No custom requests yet</td></tr>`;
}
async function adminUpdateCustom(id, status){
  try { await api.adminUpdateCustomOrder(id, { status }); toast('Request updated'); }
  catch (err) { toast(err.message||'Could not update','err'); }
}

async function loadAdminReviews(){
  const rows = await api.adminAllReviews();
  $('#adminReviewsTbl').innerHTML = rows.map(r=>`
    <tr><td>${esc(r.products?.name||'—')}</td><td>${esc(r.profiles?.full_name||'—')}</td>
    <td style="color:var(--gold)">${stars(r.rating)}</td><td style="max-width:260px">${esc(r.body||'')}</td>
    <td>${r.is_approved?'<span class="status-badge status-delivered">Approved</span>':'<span class="status-badge status-pending">Pending</span>'}</td>
    <td>${!r.is_approved ? `<button class="action-btn" onclick="approveReview('${r.id}')">Approve</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="6">No reviews yet</td></tr>`;
}
async function approveReview(id){
  try { await api.adminApproveReview(id, true); toast('Review approved'); loadAdminReviews(); }
  catch (err) { toast(err.message||'Could not approve','err'); }
}

async function loadAdminCustomers(){
  const rows = await api.adminAllCustomers();
  window.__adminCustomersData = rows;
  let emails = {};
  try { emails = await api.adminListEmails(rows.map(r=>r.id)); } catch(e){ console.error(e); }
  window.__adminCustomersEmails = emails;
  $('#adminCustomersTbl').innerHTML = rows.map(c=>`
    <tr><td>${esc(c.full_name||'—')}</td><td>${esc(c.phone||'—')}</td><td>${esc(emails[c.id]||'—')}</td><td>${c.total_orders||0}</td>
    <td>${money(c.total_spent||0)}</td><td>${c.loyalty_points||0} pts</td>
    <td><span class="status-badge ${c.role==='customer'?'status-pending':'status-delivered'}">${c.role}</span></td>
    <td>${c.role==='customer' ? `
      <button class="action-btn" onclick="editCustomerEmail('${c.id}')">✏️ Email</button>
      <button class="action-btn" style="color:var(--danger)" onclick="deleteCustomer('${c.id}')">🗑 Delete</button>
    ` : ''}</td></tr>`).join('');
}
async function editCustomerEmail(userId){
  const currentEmail = (window.__adminCustomersEmails||{})[userId] || '';
  const newEmail = prompt('Enter new email for this customer:', currentEmail);
  if (!newEmail || newEmail === currentEmail) return;
  try { await api.adminUpdateCustomerEmail(userId, newEmail); toast('Email updated'); loadAdminCustomers(); }
  catch (err) { toast(err.message || 'Could not update email', 'err'); }
}
async function deleteCustomer(userId){
  const c = (window.__adminCustomersData||[]).find(x=>x.id===userId);
  const name = c ? c.full_name || 'this customer' : 'this customer';
  if (!confirm(`Delete ${name}? This permanently removes their login and profile. Their past orders stay in Orders history.`)) return;
  try { await api.adminDeleteCustomer(userId); toast('Customer deleted'); loadAdminCustomers(); }
  catch (err) { toast(err.message || 'Could not delete customer', 'err'); }
}

async function loadAdminSettings(){
  const settings = await api.getSettings();
    const fields = ['cod_fee','announcement_text','whatsapp_number','store_phone','store_email','store_address'];
  $('#adminSettingsForm').innerHTML = fields.map(k=>`
    <div class="field"><label>${k.replace(/_/g,' ')}</label><input id="set_${k}" value="${esc(settings[k]||'')}"></div>`).join('') +
    `<div class="field" style="grid-column:1/-1;border-top:1px solid var(--line-light);padding-top:16px;margin-top:4px">
      <label style="font-size:13px;font-weight:800;letter-spacing:.04em;color:var(--charcoal)">⚡ Flash Sale</label>
    </div>
    <div class="field"><label class="filter-opt" style="padding:0"><input type="checkbox" id="set_flash_sale_active" ${settings.flash_sale_active==='true'?'checked':''}> Flash sale active</label></div>
    <div class="field"><label>Banner Title</label><input id="set_flash_sale_title" placeholder="Festive Flash Sale" value="${esc(settings.flash_sale_title||'')}"></div>
    <div class="field"><label>Discount % (auto-applies to tagged products' current price)</label><input type="number" min="1" max="90" id="set_flash_sale_discount_percent" placeholder="20" value="${esc(settings.flash_sale_discount_percent||'')}"></div>
    <div class="field"><label>Ends At</label><input type="datetime-local" id="set_flash_sale_end" value="${esc(toLocalDatetimeValue(settings.flash_sale_end))}"></div>
    <div class="field"><label>Applies to Tag (Products tagged with this get the % off)</label><input id="set_flash_sale_tag" placeholder="collection:flash-sale" value="${esc(settings.flash_sale_tag||'collection:flash-sale')}">
      <div style="font-size:11.5px;color:rgba(34,31,28,.5);margin-top:5px">Tag your sale products with this exact tag from Products → Tags. No need to touch their Price/MRP — the % above is applied automatically on their current price for as long as the sale is active, and reverts on its own when it ends.</div>
    </div>
    <div class="field" style="grid-column:1/-1;border-top:1px solid var(--line-light);padding-top:16px;margin-top:4px">
      <label style="font-size:13px;font-weight:800;letter-spacing:.04em;color:var(--charcoal)">🎁 Refer & Earn</label>
    </div>
    <div class="field"><label>Discount Amount (₹, both sides get this)</label><input type="number" min="0" id="set_referral_discount_amount" placeholder="300" value="${esc(settings.referral_discount_amount||'300')}"></div>
    <div class="field"><label>Minimum Order Amount (₹, to use the coupon)</label><input type="number" min="0" id="set_referral_min_order" placeholder="1000" value="${esc(settings.referral_min_order||'1000')}"></div>`;
}
function toLocalDatetimeValue(iso){
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function saveAllSettings(){
  const fields = ['cod_fee','announcement_text','whatsapp_number','store_phone','store_email','store_address','flash_sale_title','flash_sale_tag','flash_sale_discount_percent','referral_discount_amount','referral_min_order'];
  try {
    const endVal = $('#set_flash_sale_end').value;
    await Promise.all([
      ...fields.map(k => api.updateSetting(k, $('#set_'+k).value)),
      api.updateSetting('flash_sale_active', $('#set_flash_sale_active').checked ? 'true' : 'false'),
      api.updateSetting('flash_sale_end', endVal ? new Date(endVal).toISOString() : '')
    ]);
    toast('Settings saved');
    state.settings = await api.getSettings();
    if (typeof initFlashSale === 'function') initFlashSale(state.settings);
  } catch (err) { toast(err.message||'Could not save settings','err'); }
}

async function loadAdminGiftCards(){
  const cards = await api.adminAllGiftCards();
  $('#adminGiftCardsTbl').innerHTML = cards.map(c=>`
    <tr><td><b>${esc(c.code)}</b></td><td>${esc(c.profiles?.full_name||'—')}</td>
    <td>${esc(c.recipient_name||'—')}</td><td>${money(c.initial_amount)}</td><td>${money(c.balance)}</td>
    <td><span class="status-badge status-${c.status==='active'?'delivered':'cancelled'}">${c.status}</span></td></tr>`).join('') || `<tr><td colspan="6">No gift cards sold yet</td></tr>`;
}

async function loadAdminCorporate(){
  const rows = await api.adminAllCorporateEnquiries();
  $('#adminCorporateTbl').innerHTML = rows.map(r=>`
    <tr><td>${esc(r.company_name)}<br><span style="font-size:11px;color:rgba(34,31,28,.5)">${esc(r.contact_name)} · ${esc(r.phone)}</span></td>
    <td>${esc(r.estimated_quantity||'—')}</td><td style="max-width:240px">${esc(r.requirement||'')}</td>
    <td><select onchange="adminUpdateCorporate('${r.id}', this.value)">
      ${['new','contacted','quoted','closed'].map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join('')}
    </select></td>
    <td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td></tr>`).join('') || `<tr><td colspan="5">No corporate enquiries yet</td></tr>`;
}
async function adminUpdateCorporate(id, status){
  try { await api.adminUpdateCorporateEnquiry(id, status); toast('Enquiry updated'); }
  catch (err) { toast(err.message||'Could not update','err'); }
}

async function loadAdminPlans(){
  const [plans, subs] = await Promise.all([api.adminAllSavingsPlans(), api.adminAllSubscriptions()]);
  window.__adminPlans = plans;
  $('#adminPlansTbl').innerHTML = plans.map(p=>`
    <tr><td>${esc(p.name)}</td><td>${money(p.monthly_amount)}</td><td>${p.duration_months} mo</td>
    <td>${p.bonus_percent}%</td><td>${p.is_active?'<span class="status-badge status-delivered">Active</span>':'<span class="status-badge status-cancelled">Off</span>'}</td>
    <td><button class="action-btn" onclick="editPlan('${p.id}')">Edit</button></td></tr>`).join('') || `<tr><td colspan="6">No plans yet</td></tr>`;
  $('#adminSubsTbl').innerHTML = subs.map(s=>`
    <tr><td>${esc(s.profiles?.full_name||'—')}</td><td>${esc(s.savings_plans?.name||'—')}</td>
    <td>${s.months_paid}</td><td>${money(s.total_paid)}</td>
    <td><span class="status-badge status-${s.status==='active'?'pending':s.status==='matured'?'delivered':'cancelled'}">${s.status}</span></td></tr>`).join('') || `<tr><td colspan="5">No subscriptions yet</td></tr>`;
}
function showAddPlan(){ $('#planForm').reset(); $('#planFormId').value=''; $('#planModal').classList.add('open'); $('#overlay').classList.add('open'); }
function editPlan(id){
  const p = (window.__adminPlans||[]).find(x=>x.id===id); if (!p) return;
  showAddPlan();
  $('#planFormId').value = p.id; $('#planName').value = p.name; $('#planAmount').value = p.monthly_amount;
  $('#planMonths').value = p.duration_months; $('#planBonus').value = p.bonus_percent; $('#planDesc').value = p.description||'';
  $('#planActive').checked = p.is_active !== false;
}
async function savePlan(e){
  e.preventDefault();
  const payload = {
    id: $('#planFormId').value || undefined,
    name: $('#planName').value, monthly_amount: Number($('#planAmount').value),
    duration_months: Number($('#planMonths').value), bonus_percent: Number($('#planBonus').value||0),
    description: $('#planDesc').value, is_active: $('#planActive').checked
  };
  try { await api.adminSaveSavingsPlan(payload); toast('Plan saved'); $('#planModal').classList.remove('open'); loadAdminPlans(); }
  catch (err) { toast(err.message||'Could not save plan','err'); }
}

async function showAssignPlan(){
  const [customers, plans] = await Promise.all([api.adminAllCustomers(), api.adminAllSavingsPlans()]);
  $('#assignCustomer').innerHTML = customers.filter(c=>c.role==='customer').map(c=>`<option value="${c.id}">${esc(c.full_name||'—')} (${esc(c.phone||'no phone')})</option>`).join('');
  $('#assignPlanSelect').innerHTML = plans.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#assignPlanModal').classList.add('open'); $('#overlay').classList.add('open');
}
async function assignPlanToCustomer(e){
  e.preventDefault();
  try {
    await api.subscribeToPlan($('#assignCustomer').value, $('#assignPlanSelect').value);
    toast('Plan assigned to customer');
    $('#assignPlanModal').classList.remove('open');
    loadAdminPlans();
  } catch (err) { toast(err.message||'Could not assign plan', 'err'); }
}

async function loadAdminStores(){
  const stores = await api.adminAllStoreLocations();
  window.__adminStores = stores;
  $('#adminStoresTbl').innerHTML = stores.map(s=>`
    <tr><td>${esc(s.name)}</td><td>${esc(s.city||'—')}</td><td>${esc(s.phone||'—')}</td>
    <td>${s.is_active?'<span class="status-badge status-delivered">Active</span>':'<span class="status-badge status-cancelled">Hidden</span>'}</td>
    <td><button class="action-btn" onclick="editStore('${s.id}')">Edit</button> <button class="action-btn" onclick="deleteStore('${s.id}')">Delete</button></td></tr>`).join('') || `<tr><td colspan="5">No store locations yet</td></tr>`;
}
function showAddStore(){ $('#storeForm').reset(); $('#storeFormId').value=''; $('#storeModal').classList.add('open'); $('#overlay').classList.add('open'); }
function editStore(id){
  const s = (window.__adminStores||[]).find(x=>x.id===id); if (!s) return;
  showAddStore();
  $('#storeFormId').value = s.id; $('#storeName').value = s.name; $('#storeAddress').value = s.address;
  $('#storeCity').value = s.city||''; $('#storeState').value = s.state||''; $('#storePincode').value = s.pincode||'';
  $('#storePhone').value = s.phone||''; $('#storeHours').value = s.hours||''; $('#storeActive').checked = s.is_active !== false;
}
async function saveStore(e){
  e.preventDefault();
  const payload = {
    id: $('#storeFormId').value || undefined,
    name: $('#storeName').value, address: $('#storeAddress').value, city: $('#storeCity').value,
    state: $('#storeState').value, pincode: $('#storePincode').value, phone: $('#storePhone').value,
    hours: $('#storeHours').value, is_active: $('#storeActive').checked
  };
  try { await api.adminSaveStoreLocation(payload); toast('Store saved'); $('#storeModal').classList.remove('open'); loadAdminStores(); }
  catch (err) { toast(err.message||'Could not save store','err'); }
}
async function deleteStore(id){
  if (!confirm('Delete this store location?')) return;
  try { await api.adminDeleteStoreLocation(id); toast('Store deleted'); loadAdminStores(); }
  catch (err) { toast(err.message||'Could not delete','err'); }
}

async function loadAdminPress(){
  const rows = await api.adminAllPressMentions();
  window.__adminPress = rows;
  $('#adminPressTbl').innerHTML = rows.map(p=>`
    <tr><td>${esc(p.publication_name)}</td><td style="max-width:260px">${esc(p.quote||'')}</td>
    <td>${p.is_active?'<span class="status-badge status-delivered">Active</span>':'<span class="status-badge status-cancelled">Hidden</span>'}</td>
    <td><button class="action-btn" onclick="editPress('${p.id}')">Edit</button> <button class="action-btn" onclick="deletePress('${p.id}')">Delete</button></td></tr>`).join('') || `<tr><td colspan="4">No press mentions yet</td></tr>`;
}
function showAddPress(){ $('#pressForm').reset(); $('#pressFormId').value=''; $('#pressModal').classList.add('open'); $('#overlay').classList.add('open'); }
function editPress(id){
  const p = (window.__adminPress||[]).find(x=>x.id===id); if (!p) return;
  showAddPress();
  $('#pressFormId').value = p.id; $('#pressName').value = p.publication_name; $('#pressLogo').value = p.logo_url||'';
  $('#pressUrl').value = p.article_url||''; $('#pressQuote').value = p.quote||''; $('#pressActive').checked = p.is_active !== false;
}
async function savePress(e){
  e.preventDefault();
  const payload = {
    id: $('#pressFormId').value || undefined,
    publication_name: $('#pressName').value, logo_url: $('#pressLogo').value,
    article_url: $('#pressUrl').value, quote: $('#pressQuote').value, is_active: $('#pressActive').checked
  };
  try { await api.adminSavePressMention(payload); toast('Press mention saved'); $('#pressModal').classList.remove('open'); loadAdminPress(); }
  catch (err) { toast(err.message||'Could not save','err'); }
}
async function deletePress(id){
  if (!confirm('Delete this press mention?')) return;
  try { await api.adminDeletePressMention(id); toast('Deleted'); loadAdminPress(); }
  catch (err) { toast(err.message||'Could not delete','err'); }
}

async function loadAdminBanners(){
  const rows = await api.adminAllBanners();
  window.__adminBanners = rows;
  $('#adminBannersTbl').innerHTML = rows.map(b=>`
    <tr>
      <td><img src="${esc(b.image_url)}" style="width:70px;height:40px;object-fit:cover"></td>
      <td>${esc(b.title||'—')}</td>
      <td>${b.sort_order}</td>
      <td>${b.is_active?'<span class="status-badge status-delivered">Active</span>':'<span class="status-badge status-cancelled">Hidden</span>'}</td>
      <td><button class="action-btn" onclick="editBanner('${b.id}')">Edit</button> <button class="action-btn" style="color:var(--danger)" onclick="deleteBanner('${b.id}')">Delete</button></td>
    </tr>`).join('') || `<tr><td colspan="5">No banners yet — add one to activate the homepage carousel.</td></tr>`;
}
function showAddBanner(){
  $('#bannerForm').reset(); $('#bannerFormId').value = '';
  $('#bannerUploadStatus').textContent = '';
  $('#bannerModal').classList.add('open'); $('#overlay').classList.add('open');
}
function editBanner(id){
  const b = (window.__adminBanners||[]).find(x=>x.id===id); if (!b) return;
  showAddBanner();
  $('#bannerFormId').value = b.id;
  $('#bannerImage').value = b.image_url || '';
  $('#bannerTitle').value = b.title || '';
  $('#bannerSubtitle').value = b.subtitle || '';
  $('#bannerCta').value = b.cta_text || '';
  $('#bannerLink').value = b.link_url || '';
  $('#bannerOrder').value = b.sort_order || 0;
  $('#bannerActive').checked = b.is_active !== false;
}
async function uploadBannerImage(input){
  const file = input.files?.[0];
  if (!file) return;
  const status = $('#bannerUploadStatus');
  status.textContent = 'Uploading…';
  try {
    const compressed = await compressImage(file, 1920, 0.85).catch(()=>file);
    const path = `banner-${Date.now()}-${compressed.name.replace(/[^a-zA-Z0-9.]+/g,'-')}`;
    const { error } = await sb.storage.from('product-images').upload(path, compressed, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = sb.storage.from('product-images').getPublicUrl(path);
    $('#bannerImage').value = data.publicUrl;
    status.textContent = 'Uploaded ✓';
  } catch (err) { toast(`Could not upload: ${err.message||'unknown error'}`, 'err'); }
  input.value = '';
}
async function saveBanner(e){
  e.preventDefault();
  if (!$('#bannerImage').value.trim()) return toast('Please upload a banner image', 'err');
  const payload = {
    id: $('#bannerFormId').value || undefined,
    image_url: $('#bannerImage').value.trim(),
    title: $('#bannerTitle').value.trim(),
    subtitle: $('#bannerSubtitle').value.trim(),
    cta_text: $('#bannerCta').value.trim(),
    link_url: $('#bannerLink').value.trim(),
    position: 'hero',
    sort_order: Number($('#bannerOrder').value || 0),
    is_active: $('#bannerActive').checked
  };
  try {
    await api.adminSaveBanner(payload);
    toast('Banner saved');
    $('#bannerModal').classList.remove('open');
    loadAdminBanners();
  } catch (err) { toast(err.message||'Could not save banner', 'err'); }
}
async function deleteBanner(id){
  if (!confirm('Delete this banner?')) return;
  try { await api.adminDeleteBanner(id); toast('Banner deleted'); loadAdminBanners(); }
  catch (err) { toast(err.message||'Could not delete', 'err'); }
}

function renderVariantList(){
  const host = $('#variantList');
  if (!host) return;
  const list = window.__productVariants || [];
  host.innerHTML = list.map(v => `
    <div class="variant-card">
      <div class="variant-swatch" style="background:${esc(v.color_hex||'#ccc')}"></div>
      <div class="variant-body">
        <input value="${esc(v.color_name)}" onchange="renameVariant('${v.id}', this.value)">
        <input type="file" accept="image/*" multiple onchange="uploadVariantImage('${v.id}', this)" style="margin-top:8px;border:1px dashed var(--gold-line);padding:8px;background:var(--ivory);font-size:12px">
        <div class="variant-imgs">
          ${(v.images||[]).map((img,i)=>`
            <div><img src="${esc(img)}"><button type="button" class="variant-remove-img" onclick="removeVariantImage('${v.id}',${i})">✕</button></div>`).join('')}
        </div>
      </div>
      <button type="button" class="action-btn" style="color:var(--danger)" onclick="removeVariant('${v.id}')">Remove</button>
    </div>`).join('') || '';
}
function addVariantRow(){
  const name = $('#variantColorName').value.trim();
  if (!name) return toast('Color name daalo', 'err');
  const hex = $('#variantColorPicker').value;
  window.__productVariants = window.__productVariants || [];
  window.__productVariants.push({ id: 'v_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), color_name: name, color_hex: hex, images: [] });
  $('#variantColorName').value = '';
  renderVariantList();
}
function renameVariant(id, name){
  const v = (window.__productVariants||[]).find(x=>x.id===id);
  if (v) v.color_name = name.trim();
}
function removeVariant(id){
  window.__productVariants = (window.__productVariants||[]).filter(x=>x.id!==id);
  renderVariantList();
}
async function uploadVariantImage(variantId, input){
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const v = (window.__productVariants||[]).find(x=>x.id===variantId);
  if (!v) return;
  for (const original of files) {
    try {
      const file = await compressImage(original).catch(() => original);
      const path = `variant-${Date.now()}-${Math.random().toString(36).slice(2,8)}-${file.name.replace(/[^a-zA-Z0-9.]+/g,'-')}`;
      const { error } = await sb.storage.from('product-images').upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data } = sb.storage.from('product-images').getPublicUrl(path);
      v.images = v.images || [];
      v.images.push(data.publicUrl);
    } catch (err) { toast(`Could not upload: ${err.message||'unknown error'}`, 'err'); }
  }
  renderVariantList();
  input.value = '';
}
function removeVariantImage(variantId, idx){
  const v = (window.__productVariants||[]).find(x=>x.id===variantId);
  if (!v) return;
  v.images.splice(idx,1);
  renderVariantList();
}
