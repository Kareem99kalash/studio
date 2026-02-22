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

// --- CONSTANTS ---
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// --- HELPER: Build Query ---
function buildOverpassQuery(bbox: number[], types: string[]): string {
  // bbox: [minLon, minLat, maxLon, maxLat]
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  let queryParts = '';

  const hasGeneric = types.includes('generic');

  if (hasGeneric) {
      // Broad Search: Union of major keys
      const broadKeys = ['amenity', 'shop', 'office', 'craft', 'tourism', 'leisure', 'club'];

      broadKeys.forEach(key => {
          queryParts += `nwr["${key}"](${bboxStr});\n`;
      });

      // Also catch anything with a name that is a building (often malls or major POIs are just named buildings)
      // Assuming if it has a name and is a building=commercial/retail.
      queryParts += `nwr["building"="commercial"]["name"](${bboxStr});\n`;
      queryParts += `nwr["building"="retail"]["name"](${bboxStr});\n`;
      queryParts += `nwr["landuse"="retail"]["name"](${bboxStr});\n`;

  } else {
      // Specific Search based on selected tags
      const tagsToSearch = types.length > 0 ? types : ['amenity=restaurant', 'amenity=cafe', 'shop=*'];

      tagsToSearch.forEach(tag => {
        if (tag.includes('=')) {
            const [key, value] = tag.split('=');
            if (value === '*') {
                queryParts += `nwr["${key}"](${bboxStr});\n`;
            } else {
                queryParts += `nwr["${key}"="${value}"](${bboxStr});\n`;
            }
        }
      });
  }

  return `
    [out:json][timeout:25];
    (
      ${queryParts}
    );
    out meta center;
  `;
}

// --- ACTION 1: Generate Grid ---
export async function generateScrapeGrid(lat: number, lng: number, radiusMeters: number) {
    try {
        const centerPoint = turf.point([lng, lat]);
        const circle = turf.circle(centerPoint, radiusMeters, { steps: 64, units: 'meters' });
        const bbox = turf.bbox(circle);

        // SMALLER TILE SIZE for higher granularity & lower timeout risk
        // < 2km -> 0.25km (250m) tiles
        // 2km - 10km -> 1km tiles
        // > 10km -> 2.5km tiles
        let cellSideKm = 1;
        if (radiusMeters < 2000) cellSideKm = 0.5; // Back to 500m for initial pass (faster)
        else if (radiusMeters > 10000) cellSideKm = 5;
        else cellSideKm = 2;

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
    // bbox: [minLon, minLat, maxLon, maxLat]
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
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: query,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'NextN_Dashboard_Scraper/1.0'
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            // Specific Error Handling
            if (response.status === 429) {
                console.warn(`Tile ${tileIndex}: Rate Limit (429)`);
                return { success: false, data: [], error: "Rate Limit Exceeded", status: 429, tileIndex, shouldSplit: false };
            }
            if (response.status === 504) {
                 console.warn(`Tile ${tileIndex}: Gateway Timeout (504) -> Splitting`);
                 return { success: false, data: [], error: "Gateway Timeout (Too much data)", status: 504, tileIndex, shouldSplit: true };
            }
            if (response.status === 400) {
                 // Sometimes huge queries return 400 Bad Request if memory limit exceeded
                 console.warn(`Tile ${tileIndex}: Bad Request (400) -> Splitting`);
                 return { success: false, data: [], error: "Query too complex", status: 400, tileIndex, shouldSplit: true };
            }

             console.error(`Tile ${tileIndex}: HTTP Error ${response.status}`);
            return { success: false, data: [], error: `HTTP Error ${response.status}`, status: response.status, tileIndex, shouldSplit: false };
        }

        const data = await response.json();

        const results = (data.elements || []).map((el: any) => {
            const tags = el.tags || {};

            let itemLat = el.lat;
            let itemLng = el.lon;
            if (el.center) {
                itemLat = el.center.lat;
                itemLng = el.center.lon;
            }

            const house = tags['addr:housenumber'] || '';
            const street = tags['addr:street'] || '';
            const city = tags['addr:city'] || '';
            let address = `${house} ${street}, ${city}`.trim();
            if (address.startsWith(',')) address = address.substring(1).trim();
            if (address === ',') address = '';

            // Improved Type Detection
            const typeKeys = ['amenity', 'shop', 'office', 'craft', 'tourism', 'leisure', 'club', 'man_made', 'building'];
            let type = 'business';
            for (const key of typeKeys) {
                if (tags[key] && tags[key] !== 'yes') {
                    type = `${key}=${tags[key]}`; // e.g., amenity=restaurant
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
                last_updated: el.timestamp || undefined, // Extracted from 'out meta center;'
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
        console.error(`Tile ${tileIndex}: Unexpected Error`, error);
        return { success: false, data: [], error: error.message || "Unknown Error", status: 500, tileIndex, shouldSplit: false };
    }
}
