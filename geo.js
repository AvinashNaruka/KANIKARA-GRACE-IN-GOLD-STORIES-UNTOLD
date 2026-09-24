module.exports = function handler(req, res) {
  var h = req.headers || {};
  var dec = function (v) { try { return decodeURIComponent(v || ''); } catch (e) { return v || ''; } };
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: !!h['x-vercel-ip-country'],
    country: h['x-vercel-ip-country'] || null,          
    regionCode: h['x-vercel-ip-country-region'] || null,
    city: dec(h['x-vercel-ip-city']) || null,           
    latitude: h['x-vercel-ip-latitude'] || null,
    longitude: h['x-vercel-ip-longitude'] || null,
    timezone: h['x-vercel-ip-timezone'] || null,
    postal: h['x-vercel-ip-postal-code'] || null
  });
};
