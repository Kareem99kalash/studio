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
  details?: Record<string, any>;
}

// --- CONSTANTS ---
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// --- HELPER: Build Query ---
function buildOverpassQuery(bbox: number[], types: string[]): string {
  // bbox: [minLon, minLat, maxLon, maxLat]
  const [minLon, minLat, maxLon, maxLat] = bbox;

  // Construct a slightly larger bbox string for Overpass to ensure we catch everything on the edge
  // Overpass order: south, west, north, east (minLat, minLon, maxLat, maxLon)
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  let queryParts = '';
  const tagsToSearch = types.length > 0 ? types : ['amenity=restaurant', 'amenity=cafe', 'shop=*'];

  tagsToSearch.forEach(tag => {
    // Basic support for "key=value" or "key=*"
    if (tag.includes('=')) {
        const [key, value] = tag.split('=');
        // We query nodes, ways, and relations to get points and polygons (buildings)
        // For ways/relations, we need "center" in the out statement, which we handle below
        if (value === '*') {
            queryParts += `node["${key}"](${bboxStr});\n`;
            queryParts += `way["${key}"](${bboxStr});\n`;
            queryParts += `relation["${key}"](${bboxStr});\n`;
        } else {
            queryParts += `node["${key}"="${value}"](${bboxStr});\n`;
            queryParts += `way["${key}"="${value}"](${bboxStr});\n`;
            queryParts += `relation["${key}"="${value}"](${bboxStr});\n`;
        }
    }
  });

  return `
    [out:json][timeout:25];
    (
      ${queryParts}
    );
    out center;
  `;
}

// --- ACTION 1: Generate Grid ---
// Returns a list of BBox arrays [minLon, minLat, maxLon, maxLat] representing the tiles
export async function generateScrapeGrid(lat: number, lng: number, radiusMeters: number) {
    try {
        const centerPoint = turf.point([lng, lat]);
        const circle = turf.circle(centerPoint, radiusMeters, { steps: 64, units: 'meters' });
        const bbox = turf.bbox(circle); // [minLon, minLat, maxLon, maxLat]

        // Dynamic Cell Size based on Radius to optimize request count
        // For small radius (< 2km), use 500m tiles.
        // For medium radius (2km - 10km), use 2km tiles.
        // For large radius (> 10km), use 5km tiles.
        let cellSideKm = 1;
        if (radiusMeters < 2000) cellSideKm = 0.5;
        else if (radiusMeters > 10000) cellSideKm = 5;
        else cellSideKm = 2;

        const grid = turf.squareGrid(bbox, cellSideKm, { units: 'kilometers' });

        // Filter cells that intersect with the circle
        const relevantCells = grid.features.filter(cell => !turf.booleanDisjoint(cell, circle));

        // Return array of bboxes
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

// --- ACTION 2: Scrape Single Tile ---
export async function scrapeTile(bbox: number[], types: string[]): Promise<ScrapedBusiness[]> {
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
            // If 429 (Too Many Requests), we might want to return a specific error so client can retry
            if (response.status === 429) {
                console.warn("Overpass Rate Limit Hit");
                throw new Error("RATE_LIMIT");
            }
            return [];
        }

        const data = await response.json();

        return (data.elements || []).map((el: any) => {
            const tags = el.tags || {};

            // Normalize Coordinates
            // For ways/relations, 'out center' provides el.center.lat/lon
            let itemLat = el.lat;
            let itemLng = el.lon;
            if (el.center) {
                itemLat = el.center.lat;
                itemLng = el.center.lon;
            }

            // Normalize Address
            const house = tags['addr:housenumber'] || '';
            const street = tags['addr:street'] || '';
            const city = tags['addr:city'] || '';
            let address = `${house} ${street}, ${city}`.trim();
            if (address.startsWith(',')) address = address.substring(1).trim();
            if (address === ',') address = '';

            // Normalize Type (Prioritize amenity, then shop, then generic)
            const type = tags.amenity || tags.shop || tags.tourism || tags.leisure || 'business';

            return {
                id: `${el.type}/${el.id}`,
                name: tags.name || `Unnamed ${type}`,
                lat: itemLat,
                lng: itemLng,
                type: type,
                address: address || undefined,
                phone: tags.phone || tags['contact:phone'],
                website: tags.website || tags['contact:website'] || tags['url'],
                opening_hours: tags.opening_hours,
                city: city || undefined,
                details: {
                    cuisine: tags.cuisine,
                    brand: tags.brand,
                    operator: tags.operator,
                    capacity: tags.capacity,
                    ...tags
                }
            };
        });

    } catch (error) {
        console.error("Tile Scrape Error", error);
        return [];
    }
}
