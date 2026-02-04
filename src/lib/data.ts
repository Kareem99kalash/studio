import type { City } from './types';

export const cities: City[] = [
  {
    id: 'erbil',
    name: 'Erbil',
    center: { lat: 36.1911, lng: 44.0094 },
    polygons: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'E01', name: 'Downtown Erbil' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [44.00, 36.20], [44.02, 36.20], [44.02, 36.18], [44.00, 36.18], [44.00, 36.20]
              ]
            ]
          }
        },
        {
          type: 'Feature',
          properties: { id: 'E02', name: 'Ainkawa' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [43.98, 36.23], [44.00, 36.23], [44.00, 36.21], [43.98, 36.21], [43.98, 36.23]
              ]
            ]
          }
        },
        {
            type: 'Feature',
            properties: { id: 'E03', name: 'Empire World' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [44.04, 36.17], [44.06, 36.17], [44.06, 36.15], [44.04, 36.15], [44.04, 36.17]
                ]
              ]
            }
          }
      ]
    }
  },
  {
    id: 'sulaimaniyah',
    name: 'Sulaimaniyah',
    center: { lat: 35.5643, lng: 45.4341 },
    polygons: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'S01', name: 'City Center' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [45.43, 35.57], [45.45, 35.57], [45.45, 35.55], [45.43, 35.55], [45.43, 35.57]
              ]
            ]
          }
        },
        {
          type: 'Feature',
          properties: { id: 'S02', name: 'Bakhiary' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [45.40, 35.58], [45.42, 35.58], [45.42, 35.56], [45.40, 35.56], [45.40, 35.58]
              ]
            ]
          }
        }
      ]
    }
  }
];
