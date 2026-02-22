'use server';

import * as turf from '@turf/turf';

// --- TYPES ---
export interface ScrapedBusiness {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  address?: string;
  phone?: string;
  website?: string;
  opening_hours?: string;
  city?: string;
  last_updated?: string;
  details?: Record<string, any>;
}

export interface ScrapeTileResult {
    success: boolean;
    data: ScrapedBusiness[];
    error?: string;
    status?: number;
    tileIndex?: number;
    shouldSplit?: boolean;
}

// --- CONSTANTS & MIRRORS ---
// We rotate between these to avoid rate limits and increase concurrency.
const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://api.openstreetmap.fr/oapi/interpreter'
];

// --- HELPER: Build Query ---
function buildOverpassQuery(bbox: number[], types: string[]): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  let queryParts = '';
  const hasGeneric = types.includes('generic');

  if (hasGeneric) {
      const broadKeys = ['amenity', 'shop', 'office', 'craft', 'tourism', 'leisure', 'club'];
      broadKeys.forEach(key => queryParts += `nwr["${key}"](${bboxStr});\n`);

      queryParts += `nwr["building"="commercial"]["name"](${bboxStr});\n`;
      queryParts += `nwr["building"="retail"]["name"](${bboxStr});\n`;
      queryParts += `nwr["landuse"="retail"]["name"](${bboxStr});\n`;
  } else {
      const tagsToSearch = types.length > 0 ? types : ['amenity=restaurant'];
      tagsToSearch.forEach(tag => {
        if (tag.includes('=')) {
            const [key, value] = tag.split('=');
            if (value === '*') queryParts += `nwr["${key}"](${bboxStr});\n`;
            else queryParts += `nwr["${key}"="${value}"](${bboxStr});\n`;
        }
      });
  }

  return `[out:json][timeout:25];( ${queryParts} ); out meta center;`;
}

// --- HELPER: Smart Fetch with Failover ---
async function fetchWithFailover(query: string): Promise<any> {
    // Randomize start index to distribute load across mirrors from the get-go
    let startIndex = Math.floor(Math.random() * OVERPASS_MIRRORS.length);
    let lastError: any = null;

    for (let i = 0; i < OVERPASS_MIRRORS.length; i++) {
        const mirror = OVERPASS_MIRRORS[(startIndex + i) % OVERPASS_MIRRORS.length];

        try {
            const response = await fetch(mirror, {
                method: 'POST',
                body: query,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'NextN_Dashboard_Scraper/2.0'
                },
                cache: 'no-store'
            });

            if (response.ok) {
                return await response.json();
            }

            // If 429 (Rate Limit) or 504 (Timeout), try next mirror immediately
            if (response.status === 429 || response.status === 504 || response.status >= 500) {
                console.warn(`Mirror ${mirror} failed with ${response.status}. Switching...`);
                lastError = { status: response.status, message: response.statusText };
                continue;
            }

            // 400 Bad Request usually means query issue, don't retry elsewhere
            if (response.status === 400) {
                throw { status: 400, message: "Bad Request" };
            }

        } catch (e: any) {
            console.warn(`Mirror ${mirror} connection error. Switching...`, e.message);
            lastError = { status: 0, message: e.message };
        }
    }

    throw lastError || { status: 500, message: "All mirrors failed" };
}

// --- ACTION 1: Generate Grid ---
export async function generateScrapeGrid(lat: number, lng: number, radiusMeters: number) {
    try {
        const centerPoint = turf.point([lng, lat]);
        const circle = turf.circle(centerPoint, radiusMeters, { steps: 64, units: 'meters' });
        const bbox = turf.bbox(circle);

        // OPTIMIZED TILE SIZES
        // Smaller default tiles = fewer timeouts = faster overall (less retries/splits)
        let cellSideKm = 0.5; // Default 500m
        if (radiusMeters < 2000) cellSideKm = 0.25; // 250m for small areas
        else if (radiusMeters > 15000) cellSideKm = 2; // 2km for huge areas

        const grid = turf.squareGrid(bbox, cellSideKm, { units: 'kilometers' });
        const relevantCells = grid.features.filter(cell => !turf.booleanDisjoint(cell, circle));

        return {
            success: true,
            tiles: relevantCells.map(cell => turf.bbox(cell)),
            totalAreaKm2: (Math.PI * (radiusMeters/1000)**2).toFixed(2),
            estimatedTiles: relevantCells.length
        };

    } catch (e) {
        console.error("Grid Generation Error", e);
        return { success: false, error: "Failed to generate grid." };
    }
}

// --- ACTION 3: Split Tile (Quadtree) ---
export async function splitTile(bbox: number[]): Promise<number[][]> {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const midLon = (minLon + maxLon) / 2;
    const midLat = (minLat + maxLat) / 2;

    return [
        [minLon, midLat, midLon, maxLat], // Top-Left
        [midLon, midLat, maxLon, maxLat], // Top-Right
        [minLon, minLat, midLon, midLat], // Bottom-Left
        [midLon, minLat, maxLon, midLat]  // Bottom-Right
    ];
}

// --- ACTION 2: Scrape Single Tile ---
export async function scrapeTile(bbox: number[], types: string[], tileIndex: number): Promise<ScrapeTileResult> {
    const query = buildOverpassQuery(bbox, types);

    try {
        // Use Smart Fetch
        const data = await fetchWithFailover(query);

        const results = (data.elements || []).map((el: any) => {
            const tags = el.tags || {};

            let itemLat = el.lat;
            let itemLng = el.lon;
            if (el.center) {
                itemLat = el.center.lat;
                itemLng = el.center.lon;
            }

            // Data extraction
            const house = tags['addr:housenumber'] || '';
            const street = tags['addr:street'] || '';
            const city = tags['addr:city'] || '';
            let address = `${house} ${street}, ${city}`.trim();
            if (address.startsWith(',')) address = address.substring(1).trim();
            if (address === ',') address = '';

            const typeKeys = ['amenity', 'shop', 'office', 'craft', 'tourism', 'leisure', 'club', 'man_made', 'building'];
            let type = 'business';
            for (const key of typeKeys) {
                if (tags[key] && tags[key] !== 'yes') {
                    type = `${key}=${tags[key]}`;
                    break;
                }
            }

            return {
                id: `${el.type}/${el.id}`,
                name: tags.name || `Unnamed ${type.split('=')[1] || 'Business'}`,
                lat: itemLat,
                lng: itemLng,
                type: type,
                address: address || undefined,
                phone: tags.phone || tags['contact:phone'],
                website: tags.website || tags['contact:website'] || tags['url'] || tags['facebook'] || tags['instagram'],
                opening_hours: tags.opening_hours,
                city: city || undefined,
                last_updated: el.timestamp || undefined,
                details: {
                    cuisine: tags.cuisine,
                    brand: tags.brand,
                    operator: tags.operator,
                    capacity: tags.capacity,
                    stars: tags.stars,
                    ...tags
                }
            };
        });

        return { success: true, data: results, status: 200, tileIndex, shouldSplit: false };

    } catch (error: any) {
        // If we exhausted all mirrors and still failed
        console.error(`Tile ${tileIndex}: Exhausted Mirrors. Error:`, error);

        // Decide if we should split based on final error
        const status = error.status || 500;
        const shouldSplit = status === 504 || status === 400 || (status === 0 && error.message?.includes('timeout'));

        return {
            success: false,
            data: [],
            error: error.message || "Unknown Error",
            status: status,
            tileIndex,
            shouldSplit
        };
    }
}
