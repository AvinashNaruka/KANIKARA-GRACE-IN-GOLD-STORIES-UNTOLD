async function openAdmin(){
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
    dashboard: loadAdminDashboard, products: loadAdminProducts, categories: loadAdminCats, materials: loadAdminMaterials,
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

async function loadAdminProducts(){
  const [products, cats] = await Promise.all([api.adminAllProducts(), api.adminAllCategories()]);
  state.categories = cats.length ? cats : state.categories;
  window.__adminCats = cats;
  $('#adminProductsTbl').innerHTML = products.map(p=>`
    <tr>
      <td>#${p.serial_no||'—'}</td>
      <td><img src="${esc((p.images||[])[0]||placeholderImg())}" style="width:42px;height:42px;object-fit:cover"></td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.categories?.name||'—')}</td>
      <td>${money(p.price)}</td>
      <td>${p.stock_quantity}</td>
      <td>${p.is_active ? '<span class="status-badge status-delivered">Active</span>' : '<span class="status-badge status-cancelled">Hidden</span>'}</td>
      <td><button class="action-btn" onclick="editProduct('${p.id}')">Edit</button> <button class="action-btn" onclick="deleteProduct('${p.id}','${esc(p.name)}')">Delete</button></td>
    </tr>`).join('') || `<tr><td colspan="7">No products yet. Add your first piece →</td></tr>`;
  window.__adminProducts = products;
}
function showAddProduct(){
  $('#productForm').reset(); $('#productFormId').value = '';
  $('#productFormTitle').textContent = 'Add Product';
  $('#productCat').innerHTML = (window.__adminCats||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    api.getMaterials().then(mats => $('#productMaterial').innerHTML = mats.map(m=>`<option value="${esc(m.name)}">${esc(m.name)}</option>`).join(''));
  $('#productImgPreview').innerHTML = '';
  $('#productModal').classList.add('open'); $('#overlay').classList.add('open');
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
      const file = await compressImage(original).catch(() => original); // fall back to original if compression fails
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
    is_active: $('#productActive').checked
  };
  if (!payload.id) payload.slug = slug;
  try {
    await api.adminSaveProduct(payload);
    toast('Product saved');
    hideAddProduct();
    loadAdminProducts();
  } catch (err) { toast(err.message||'Could not save product', 'err'); }
}
async function deleteProduct(id, name){
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
    <tr><td>${esc(m.name)}</td><td><button class="action-btn" style="color:var(--danger)" onclick="deleteMaterial('${m.id}','${esc(m.name)}')">Delete</button></td></tr>`).join('') || `<tr><td colspan="2">No materials yet</td></tr>`;
}
async function addMaterial(){
  const name = $('#newMaterialName').value.trim();
  if (!name) return;
  try { await api.adminSaveMaterial(name); $('#newMaterialName').value=''; toast('Material added'); loadAdminMaterials(); }
  catch (err) { toast(err.message||'Could not add material', 'err'); }
}
async function deleteMaterial(id, name){
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
      <td><button class="action-btn" onclick="generateInvoicePDF((window.__adminOrders||[]).find(x=>x.id==='${o.id}'), true)">📄 Download</button></td>
    </tr>`).join('') || `<tr><td colspan="7">No orders yet</td></tr>`;
}
async function adminUpdateOrderStatus(id, status){
  try { await api.adminUpdateOrderStatus(id, status); toast('Order status updated'); }
  catch (err) { toast(err.message||'Could not update order','err'); }
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
  let emails = {};
  try { emails = await api.adminListEmails(rows.map(r=>r.id)); } catch(e){ console.error(e); }
  $('#adminCustomersTbl').innerHTML = rows.map(c=>`
    <tr><td>${esc(c.full_name||'—')}</td><td>${esc(c.phone||'—')}</td><td>${esc(emails[c.id]||'—')}</td><td>${c.total_orders||0}</td>
    <td>${money(c.total_spent||0)}</td><td>${c.loyalty_points||0} pts</td>
    <td><span class="status-badge ${c.role==='customer'?'status-pending':'status-delivered'}">${c.role}</span></td>
    <td>${c.role==='customer' ? `
      <button class="action-btn" onclick="editCustomerEmail('${c.id}','${esc(emails[c.id]||'')}')">✏️ Email</button>
      <button class="action-btn" style="color:var(--danger)" onclick="deleteCustomer('${c.id}','${esc(c.full_name||'this customer')}')">🗑 Delete</button>
    ` : ''}</td></tr>`).join('');
}
async function editCustomerEmail(userId, currentEmail){
  const newEmail = prompt('Enter new email for this customer:', currentEmail);
  if (!newEmail || newEmail === currentEmail) return;
  try { await api.adminUpdateCustomerEmail(userId, newEmail); toast('Email updated'); loadAdminCustomers(); }
  catch (err) { toast(err.message || 'Could not update email', 'err'); }
}
async function deleteCustomer(userId, name){
  if (!confirm(`Delete ${name}? This permanently removes their login and profile. Their past orders stay in Orders history.`)) return;
  try { await api.adminDeleteCustomer(userId); toast('Customer deleted'); loadAdminCustomers(); }
  catch (err) { toast(err.message || 'Could not delete customer', 'err'); }
}

async function loadAdminSettings(){
  const settings = await api.getSettings();
  const fields = ['gold_rate_22k','gold_rate_24k','silver_rate','announcement_text','whatsapp_number','store_phone','store_email','store_address'];
  $('#adminSettingsForm').innerHTML = fields.map(k=>`
    <div class="field"><label>${k.replace(/_/g,' ')}</label><input id="set_${k}" value="${esc(settings[k]||'')}"></div>`).join('');
}
async function saveAllSettings(){
  const fields = ['gold_rate_22k','gold_rate_24k','silver_rate','announcement_text','whatsapp_number','store_phone','store_email','store_address'];
  try {
    await Promise.all(fields.map(k => api.updateSetting(k, $('#set_'+k).value)));
    toast('Settings saved');
    state.settings = await api.getSettings();
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

// ------------------------------------------------------- press mentions ---
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
