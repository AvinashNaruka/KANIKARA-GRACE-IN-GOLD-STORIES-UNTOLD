module.exports = async function handler(req, res) {
  const SUPABASE_URL = 'https://gmlfsygirhnutunodeec.supabase.co';        
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbGZzeWdpcmhudXR1bm9kZWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MjMzOTksImV4cCI6MjA5MjM5OTM5OX0.DY8P9u1Epz2Dm9p05jxw7pzba2hdj3LAdIIX_aT1GVM';
  const siteUrl = `https://${req.headers.host}`;

  let products = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/products?select=slug,updated_at&is_active=eq.true`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    products = await r.json();
  } catch (e) { console.error(e); }

  const staticPages = ['', 'shop', 'gift-store', 'smart-plan', 'custom-order', 'store-locator', 'jewellery-care', 'policies'];
  const urls = [
    ...staticPages.map(p => `<url><loc>${siteUrl}/${p ? '#' + p : ''}</loc></url>`),
    ...products.map(p => `<url><loc>${siteUrl}/p/${p.slug}</loc>${p.updated_at ? `<lastmod>${p.updated_at.slice(0,10)}</lastmod>` : ''}</url>`)
  ].join('');

  res.setHeader('Content-Type', 'application/xml');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
};
