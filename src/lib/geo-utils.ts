import * as turf from '@turf/turf';

/**
 * Creates an obfuscated version of the input polygons using a hexagonal grid.
 *
 * @param featureCollection The input GeoJSON FeatureCollection of polygons.
 * @param cellSize The size of each hex cell in kilometers (default: 0.5km).
 * @returns A new FeatureCollection of hexagonal polygons.
 */
export function obfuscatePolygons(featureCollection: any, cellSize: number = 0.5): any {
  if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
    return featureCollection;
  }

  // 1. Calculate Bounding Box of all polygons
  const bbox = turf.bbox(featureCollection);

  // 2. Generate Hex Grid over the bounding box
  // Extend bbox slightly to ensure full coverage
  const extendedBbox: [number, number, number, number] = [bbox[0] - 0.05, bbox[1] - 0.05, bbox[2] + 0.05, bbox[3] + 0.05];

  // Use hexGrid directly
  // Note: turf.hexGrid returns a FeatureCollection of Polygons
  const grid = turf.hexGrid(extendedBbox, cellSize, { units: 'kilometers' });

  const obfuscatedFeatures: any[] = [];

  // 3. Filter Hexes
  // Optimization: Pre-calculate bboxes for all input polygons
  const polygonBBoxes = featureCollection.features.map((poly: any) => ({
      poly,
      bbox: turf.bbox(poly)
  }));

  grid.features.forEach((hex: any) => {
    let intersects = false;
    let overlappingPoly: any = null;
    const hexBBox = turf.bbox(hex);

    // Check intersection with each original polygon
    for (const item of polygonBBoxes) {
      // Fast BBox overlap check first
      if (bboxesIntersect(hexBBox, item.bbox)) {
          // Expensive precise intersection check
          if (turf.booleanIntersects(hex, item.poly)) {
            intersects = true;
            overlappingPoly = item.poly;
            break; // Assign to the first matching polygon
          }
      }
    }

    if (intersects && overlappingPoly) {
      // 4. Inherit Properties
      const props = { ...overlappingPoly.properties };

      props.obfuscated = true;
      props.original_id = props.id;

      const center = turf.centroid(hex);
      props.centroid = {
          lat: center.geometry.coordinates[1],
          lng: center.geometry.coordinates[0]
      };

      hex.properties = props;
      obfuscatedFeatures.push(hex);
    }
  });

  return {
    type: 'FeatureCollection',
    features: obfuscatedFeatures
  };
}

// Simple helper for bbox intersection [minX, minY, maxX, maxY]
function bboxesIntersect(a: any, b: any) {
    return (a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]);
}
