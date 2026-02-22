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
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  let queryParts = '';

  // If user selects "generic", we want to search for *everything* that looks like a business.
  // We can look for named nodes/ways with *any* of the major business keys.
  const hasGeneric = types.includes('generic');

  if (hasGeneric) {
      // Broad Search: Any Node/Way/Relation with a NAME + one of these primary keys
      const broadKeys = ['amenity', 'shop', 'office', 'craft', 'tourism', 'leisure', 'club'];

      // We construct a query that unions these possibilities.
      // nwr = node, way, relation
      broadKeys.forEach(key => {
          queryParts += `nwr["${key}"](${bboxStr});\n`;
      });

      // Also catch anything with a name that is a building (often malls or major POIs are just named buildings)
      // queryParts += `nwr["building"]["name"](${bboxStr});\n`;
      // ^ This might be too broad (houses), let's stick to commercial markers if possible,
      // or just assume if it has a name and is a building=commercial/retail.
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
    out center;
  `;
}

// --- ACTION 1: Generate Grid ---
export async function generateScrapeGrid(lat: number, lng: number, radiusMeters: number) {
    try {
        const centerPoint = turf.point([lng, lat]);
        const circle = turf.circle(centerPoint, radiusMeters, { steps: 64, units: 'meters' });
        const bbox = turf.bbox(circle);

        // Adjust grid size
        let cellSideKm = 1;
        if (radiusMeters < 2000) cellSideKm = 0.5;
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
            if (response.status === 429) {
                console.warn("Overpass Rate Limit Hit");
                throw new Error("RATE_LIMIT");
            }
            return [];
        }

        const data = await response.json();

        return (data.elements || []).map((el: any) => {
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
            // We iterate through common keys to find the most specific "type" label
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
                type: type, // Now returns "key=value" format for better filtering later if needed
                address: address || undefined,
                phone: tags.phone || tags['contact:phone'],
                website: tags.website || tags['contact:website'] || tags['url'] || tags['facebook'] || tags['instagram'],
                opening_hours: tags.opening_hours,
                city: city || undefined,
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

    } catch (error) {
        console.error("Tile Scrape Error", error);
        return [];
    }
}
