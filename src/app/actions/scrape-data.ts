'use server';

import * as turf from '@turf/turf';
import { parse } from 'terraformer-wkt-parser';

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
const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://api.openstreetmap.fr/oapi/interpreter'
];

// --- HELPER: Parse WKT to GeoJSON ---
function parseWktToGeoJson(wkt: string): any {
    const cleanWkt = wkt.replace(/^"|"$/g, '').trim();
    const parsed = parse(cleanWkt) as any;
    // terraformer-wkt-parser returns an object with prototype methods (bbox)
    // which confuses turf.bbox(). We must convert it to a plain GeoJSON object.
    return {
        type: parsed.type,
        coordinates: parsed.coordinates
    };
}

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

            if (response.ok) return await response.json();

            if (response.status === 429 || response.status === 504 || response.status >= 500) {
                console.warn(`Mirror ${mirror} failed with ${response.status}. Switching...`);
                lastError = { status: response.status, message: response.statusText };
                continue;
            }

            if (response.status === 400) throw { status: 400, message: "Bad Request" };

        } catch (e: any) {
            console.warn(`Mirror ${mirror} connection error. Switching...`, e.message);
            lastError = { status: 0, message: e.message };
        }
    }

    throw lastError || { status: 500, message: "All mirrors failed" };
}

// --- ACTION 1: Generate Grid (Optimistic Strategy) ---
export async function generateScrapeGrid(
    lat: number,
    lng: number,
    radiusMeters: number,
    polygonWkt?: string
) {
    try {
        let geometry: any;
        let bbox: any;
        let areaSqMeters = 0;

        // MODE 1: POLYGON WKT
        if (polygonWkt) {
            try {
                geometry = parseWktToGeoJson(polygonWkt);

                if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
                    throw new Error("WKT must be a Polygon or MultiPolygon");
                }
                bbox = turf.bbox(geometry);
                areaSqMeters = turf.area(geometry);

                // --- NEW LOGIC: Single Tile Coverage ---
                // Instead of generating a grid, return the single bounding box.
                // This ensures full coverage and delegates splitting to the client if needed.
                return {
                    success: true,
                    tiles: [bbox],
                    totalAreaKm2: (areaSqMeters / 1_000_000).toFixed(2),
                    estimatedTiles: 1,
                    bounds: bbox
                };

            } catch (e) {
                console.error("WKT Parse Error", e);
                return { success: false, error: "Invalid WKT format" };
            }
        }
        // MODE 2: RADIUS
        else {
            const centerPoint = turf.point([lng, lat]);
            const circle = turf.circle(centerPoint, radiusMeters, { steps: 64, units: 'meters' });
            geometry = circle;
            bbox = turf.bbox(circle);
            areaSqMeters = Math.PI * (radiusMeters)**2;
        }

        const areaSqKm = areaSqMeters / 1_000_000;
        let cellSideKm = 2; // Default 2km

        if (areaSqKm < 10) cellSideKm = 1;
        if (areaSqKm < 1) cellSideKm = 0.5;
        if (areaSqKm > 400) cellSideKm = 5;

        const grid = turf.squareGrid(bbox, cellSideKm, { units: 'kilometers' });

        // Filter cells that intersect with the geometry
        const relevantCells = grid.features.filter(cell => !turf.booleanDisjoint(cell, geometry));

        return {
            success: true,
            tiles: relevantCells.map(cell => turf.bbox(cell)),
            totalAreaKm2: areaSqKm.toFixed(2),
            estimatedTiles: relevantCells.length,
            bounds: bbox
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
        [minLon, midLat, midLon, maxLat],
        [midLon, midLat, maxLon, maxLat],
        [minLon, minLat, midLon, midLat],
        [midLon, minLat, maxLon, midLat]
    ];
}

// --- ACTION 2: Scrape Single Tile ---
export async function scrapeTile(
    bbox: number[],
    types: string[],
    tileIndex: number,
    polygonWkt?: string
): Promise<ScrapeTileResult> {
    const query = buildOverpassQuery(bbox, types);

    try {
        const data = await fetchWithFailover(query);

        let results = (data.elements || []).map((el: any) => {
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
                details: { ...tags }
            };
        });

        // --- NEW LOGIC: Polygon Filtering ---
        if (polygonWkt) {
            try {
                const polygonGeoJson = parseWktToGeoJson(polygonWkt);
                results = results.filter((item: ScrapedBusiness) => {
                    // Turf expects [lng, lat]
                    const pt = turf.point([item.lng, item.lat]);
                    return turf.booleanPointInPolygon(pt, polygonGeoJson);
                });
            } catch (e) {
                console.error("Polygon Filtering Error", e);
                // On error, we proceed with unfiltered results to avoid total data loss,
                // but logs will indicate the issue.
            }
        }

        return { success: true, data: results, status: 200, tileIndex, shouldSplit: false };

    } catch (error: any) {
        console.error(`Tile ${tileIndex}: Exhausted Mirrors. Error:`, error);

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
