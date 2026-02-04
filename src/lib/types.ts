import type { z } from 'zod';
import type { analysisSchema } from './actions';

export type City = {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
};

export type AnalysisResult = {
  store: { id: string; name: string, color: string };
  coverage: Record<string, string>[];
  polygonStyles: Record<string, {
    fillColor: string;
    strokeColor: string;
  }>
};

export type AnalysisFormValues = z.infer<typeof analysisSchema>;
