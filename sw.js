// sw.js — Max Dinamyte PWA Service Worker
// Handles: app shell caching, offline support, map tile caching

const APP_CACHE = 'md-app-v1';
const TILE_CACHE = 'md-tiles-v1';
const DATA_CACHE = 'md-data-v1';

// App shell files to cache immediately on install
// These make the app load instantly and work offline
const APP_SHELL = [
  '/mapapp.html',
  '/firebase-config.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://fonts.googleapis.com/css2?family=Cormorant:wght@300;400;600&family=Jost:wght@300;400;500;600&display=swap'
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────
// Cache the app shell when the service worker is first installed
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('[SW] Some app shell files failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
// Clean up old caches when a new service worker takes over
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => ![APP_CACHE, TILE_CACHE, DATA_CACHE].includes(key))
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Never try to cache POST requests (Firebase auth, etc.)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Map tiles — cache aggressively (tiles don't change)
  if (url.hostname.includes('cartocdn.com') || url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(tileStrategy(event.request));
    return;
  }

  // App shell files — cache first, fall back to network
  if (event.request.mode === 'navigate' || APP_SHELL.includes(event.request.url)) {
    event.respondWith(cacheFirstStrategy(event.request, APP_CACHE));
    return;
  }

  // Firebase/Stripe/everything else — network first, fall back to cache
  event.respondWith(networkFirstStrategy(event.request));
});

// ─── CACHING STRATEGIES ──────────────────────────────────────────────────────

// Cache first — great for app shell and static assets
async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — content not available', { status: 503 });
  }
}

// Network first — great for dynamic data
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// Tile strategy — cache tiles forever (they're immutable by zoom/coord)
async function tileStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(TILE_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return a transparent tile when offline and tile not cached
    return new Response('', { status: 204 });
  }
}

// ─── PRE-CACHE TILES FOR A PURCHASED MAP ─────────────────────────────────────
// Called from the main app after a successful purchase
// Downloads and caches all tiles for a city at useful zoom levels (10-16)
self.addEventListener('message', event => {
  if (event.data?.type === 'CACHE_MAP_TILES') {
    const { mapKey, center, bounds } = event.data;
    console.log(`[SW] Pre-caching tiles for ${mapKey}`);
    cacheTilesForMap(center, bounds).then(() => {
      event.source.postMessage({ type: 'TILES_CACHED', mapKey });
    });
  }
});

async function cacheTilesForMap(center, bounds) {
  const cache = await caches.open(TILE_CACHE);
  const subdomains = ['a', 'b', 'c', 'd'];
  const tileUrls = [];

  // Generate tile URLs for zoom levels 10-16 within the bounds
  for (let zoom = 10; zoom <= 16; zoom++) {
    const [minX, minY] = latLngToTile(bounds.south, bounds.west, zoom);
    const [maxX, maxY] = latLngToTile(bounds.north, bounds.east, zoom);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const subdomain = subdomains[(x + y) % 4];
        tileUrls.push(
          `https://${subdomain}.basemaps.cartocdn.com/dark_all/${zoom}/${x}/${y}.png`
        );
      }
    }
  }

  console.log(`[SW] Caching ${tileUrls.length} tiles for offline use`);

  // Batch fetch to avoid overwhelming the tile server
  const BATCH_SIZE = 10;
  for (let i = 0; i < tileUrls.length; i += BATCH_SIZE) {
    const batch = tileUrls.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async url => {
        try {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        } catch {
          // Silently skip failed tiles
        }
      })
    );
  }
}

// Convert lat/lng to OSM tile coordinates at a given zoom level
function latLngToTile(lat, lng, zoom) {
  const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI)
    / 2 * Math.pow(2, zoom)
  );
  return [x, y];
}
