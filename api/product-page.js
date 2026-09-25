module.exports = async function handler(req, res) {
  const slug = (req.query.slug || '').toString();
  const SUPABASE_URL = 'https://gmlfsygirhnutunodeec.supabase.co';       
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbGZzeWdpcmhudXR1bm9kZWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MjMzOTksImV4cCI6MjA5MjM5OTM5OX0.DY8P9u1Epz2Dm9p05jxw7pzba2hdj3LAdIIX_aT1GVM';
             

  let product = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/products?select=name,description,images,price,slug&slug=eq.${encodeURIComponent(slug)}&is_active=eq.true`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const rows = await r.json();
    product = rows && rows[0];
  } catch (e) { console.error(e); }

  const siteUrl = `https://${req.headers.host}`;
  const title = product ? `${product.name} | Kanikara` : 'Kanikara — Grace in Gold, Stories Untold';
  const desc = product ? (product.description || '').slice(0, 160) : 'Fine gold, diamond and bridal jewellery crafted in Rajasthan.';
  const image = product && product.images && product.images[0] ? product.images[0] : `${siteUrl}/assets/img/logo.jpeg`;
  const redirectTo = `${siteUrl}/#product/${slug}`;

  function escapeHtml(s){
    return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:type" content="product">
<meta property="og:url" content="${siteUrl}/p/${slug}">
${product ? `<meta property="product:price:amount" content="${product.price}">` : ''}
<meta property="product:price:currency" content="INR">
<meta http-equiv="refresh" content="0;url=${redirectTo}">
<script>window.location.replace(${JSON.stringify(redirectTo)});</script>
</head><body>Redirecting to <a href="${redirectTo}">${escapeHtml(title)}</a>…</body></html>`);
};
