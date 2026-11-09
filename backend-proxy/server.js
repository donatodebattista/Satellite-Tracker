/**
 * Lightweight Node.js Proxy for Satellite Tracker (PRD Section 4.3)
 * Keeps Space-Track.org login credentials and N2YO API keys securely outside mobile bundle.
 */

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;
const SPACETRACK_IDENTITY = process.env.SPACETRACK_IDENTITY || '';
const SPACETRACK_PASSWORD = process.env.SPACETRACK_PASSWORD || '';
const N2YO_API_KEY = process.env.N2YO_API_KEY || '';

let spaceTrackCookie = null;

async function authenticateSpaceTrack() {
  if (!SPACETRACK_IDENTITY || !SPACETRACK_PASSWORD) return null;

  const res = await fetch('https://www.space-track.org/ajaxauth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      identity: SPACETRACK_IDENTITY,
      password: SPACETRACK_PASSWORD,
    }).toString(),
  });

  if (!res.ok) return null;
  const cookie = res.headers.get('set-cookie');
  if (cookie) {
    spaceTrackCookie = cookie.split(';')[0];
  }
  return spaceTrackCookie;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  try {
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'satellite-tracker-proxy',
          spaceTrackConfigured: Boolean(SPACETRACK_IDENTITY),
          n2yoConfigured: Boolean(N2YO_API_KEY),
        }),
      );
      return;
    }

    // CelesTrak proxy endpoint
    if (pathname === '/api/celestrak') {
      const category = parsedUrl.query.category || 'stations';
      let targetUrl =
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json';

      if (category === 'starlink-sup') {
        targetUrl =
          'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json';
      } else if (category === 'gps-ops') {
        targetUrl =
          'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json';
      } else if (category === 'weather') {
        targetUrl =
          'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json';
      }

      const ctRes = await fetch(targetUrl);
      const data = await ctRes.json();
      res.writeHead(ctRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // Space-Track catalog proxy
    if (pathname === '/api/spacetrack/catalog') {
      if (!spaceTrackCookie) {
        await authenticateSpaceTrack();
      }

      const stUrl =
        'https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/25544,48274/format/json';
      const stRes = await fetch(stUrl, {
        headers: { Cookie: spaceTrackCookie || '' },
      });
      const data = await stRes.json();
      res.writeHead(stRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // N2YO TLE endpoint
    if (pathname.startsWith('/api/n2yo/tle/')) {
      const parts = pathname.split('/');
      const noradId = parts[parts.length - 1];
      const targetUrl = `https://api.n2yo.com/rest/v1/satellite/tle/${noradId}&apiKey=${N2YO_API_KEY}`;
      const n2yoRes = await fetch(targetUrl);
      const data = await n2yoRes.json();
      res.writeHead(n2yoRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // N2YO Positions endpoint
    if (pathname.startsWith('/api/n2yo/positions/')) {
      const parts = pathname.split('/').slice(4); // noradId, lat, lng, alt, seconds
      const [id, lat, lng, alt, sec] = parts;
      const targetUrl = `https://api.n2yo.com/rest/v1/satellite/positions/${id}/${lat}/${lng}/${alt}/${sec}&apiKey=${N2YO_API_KEY}`;
      const n2yoRes = await fetch(targetUrl);
      const data = await n2yoRes.json();
      res.writeHead(n2yoRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    // Where the ISS at? endpoints
    if (pathname === '/api/wheretheiss/position') {
      const issRes = await fetch(
        'https://api.wheretheiss.at/v1/satellites/25544',
      );
      const data = await issRes.json();
      res.writeHead(issRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === '/api/wheretheiss/tles') {
      const issRes = await fetch(
        'https://api.wheretheiss.at/v1/satellites/25544/tles',
      );
      const data = await issRes.json();
      res.writeHead(issRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Satellite Tracker Backend Proxy listening on http://localhost:${PORT}`);
});
