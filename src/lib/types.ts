import { z } from 'zod';
import type { analysisSchema as analysisSchemaType } from './actions';

export const analysisSchema = z.object({
  cityId: z.string().min(1, 'City is required.'),
  stores: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1, 'Store name is required.'),
        lat: z.string().refine((val) => !isNaN(parseFloat(val)), {
          message: 'Must be a number.',
        }),
        lng: z.string().refine((val) => !isNaN(parseFloat(val)), {
          message: 'Must be a number.',
        }),
      })
    )
    .min(1, 'At least one store is required.'),
});

export type City = {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
};

export type AnalysisResult = {
  store: { id: string; name: string; color: string };
  coverage: Record<string, string>[];
  polygonStyles: Record<
    string,
    {
      fillColor: string;
      strokeColor: string;
      fillOpacity: number;
      strokeWeight: number;
    }
  >;
};

export type AnalysisFormValues = z.infer<typeof analysisSchema>;
