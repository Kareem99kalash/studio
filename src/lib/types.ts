import { z } from 'zod';
import type { FeatureCollection } from 'geojson'; // We need this type!

export const analysisSchema = z.object({
  cityId: z.string().min(1, 'Please select a city'),
  stores: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1, 'Name is required'),
      lat: z.string().min(1, 'Latitude is required'),
      lng: z.string().min(1, 'Longitude is required'),
      coords: z.string().optional(), // We added this field recently
    })
  ).min(1, 'Add at least one store'),
});

export type AnalysisFormValues = z.infer<typeof analysisSchema>;

export type City = {
  id: string;
  name: string;
  center: {
    lat: number;
    lng: number;
  };
  polygons: FeatureCollection; // The map now expects standard GeoJSON
  thresholds?: {
    green: number;
    yellow: number;
  };
};

export type AnalysisResult = {
  storeId?: string;
  storeName?: string;
  status?: string;
  zoneName?: string;
  matchColor?: string;
  assignments?: Record<string, string>; // For the distance logic
};
//test