'use server';

import { z } from 'zod';
import { analyzeStoreCoverage } from '@/ai/flows/analyze-store-coverage';
import { cities } from './data';
import { parseMarkdownTable } from './utils';
import type { AnalysisResult } from './types';
import { analysisSchema } from './types';

const THRESHOLDS = {
    green: 5, // km
    yellow: 10, // km
};

const BRANCH_COLORS = ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#D81B60'];


export async function analyzeCoverageAction(
  values: z.infer<typeof analysisSchema>
): Promise<AnalysisResult[]> {
  const validation = analysisSchema.safeParse(values);
  if (!validation.success) {
    throw new Error('Invalid input.');
  }

  const { cityId, stores } = validation.data;
  const city = cities.find(c => c.id === cityId);

  if (!city) {
    throw new Error('City not found.');
  }
  
  const polygonDataStr = JSON.stringify(city.polygons);

  const analysisPromises = stores.map(store => 
    analyzeStoreCoverage({
      storeLocationCoordinates: `${store.lat},${store.lng}`,
      city: city.name,
      polygonData: polygonDataStr,
    }).then(output => ({
        store,
        parsedCoverage: parseMarkdownTable(output.coverageSummary),
    }))
  );
  
  const resultsByStore = await Promise.all(analysisPromises);

  const polygonAssignments: Record<string, { storeId: string; distance: number }> = {};

  for (const { store, parsedCoverage } of resultsByStore) {
    for (const row of parsedCoverage) {
        const polygonId = row['Polygon ID'];
        const distance = parseFloat(row['Distance to Store (km)']);
        if (polygonId && !isNaN(distance)) {
            if (!polygonAssignments[polygonId] || distance < polygonAssignments[polygonId].distance) {
                polygonAssignments[polygonId] = { storeId: store.id, distance };
            }
        }
    }
  }

  return resultsByStore.map(({ store, parsedCoverage }, index) => {
    const polygonStyles: Record<string, { fillColor: string; strokeColor: string, fillOpacity: number, strokeWeight: number }> = {};
    const storeColor = BRANCH_COLORS[index % BRANCH_COLORS.length];

    city.polygons.features.forEach(feature => {
        const polygonId = feature.properties.id as string;
        const assignment = polygonAssignments[polygonId];

        if (assignment && assignment.storeId === store.id) {
            let color = 'red';
            if (assignment.distance <= THRESHOLDS.green) color = 'green';
            else if (assignment.distance <= THRESHOLDS.yellow) color = 'yellow';
            
            const styleMap: Record<string, {fill:string, stroke: string}> = {
              green: { fill: '#4CAF50', stroke: '#388E3C' },
              yellow: { fill: '#FFEB3B', stroke: '#FBC02D' },
              red: { fill: '#F44336', stroke: '#D32F2F' }
            }

            polygonStyles[polygonId] = {
              fillColor: styleMap[color].fill,
              strokeColor: styleMap[color].stroke,
              fillOpacity: 0.5,
              strokeWeight: 1.5,
            };

        } else if (!assignment) {
             polygonStyles[polygonId] = {
                fillColor: '#9E9E9E',
                strokeColor: '#616161',
                fillOpacity: 0.2,
                strokeWeight: 1,
            };
        } else {
             polygonStyles[polygonId] = {
                fillColor: 'transparent',
                strokeColor: '#BDBDBD',
                fillOpacity: 0,
                strokeWeight: 0.5,
            };
        }
    });

    return {
      store: { ...store, color: storeColor },
      coverage: parsedCoverage,
      polygonStyles,
    };
  });
}
