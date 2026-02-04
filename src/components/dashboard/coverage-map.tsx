'use client';

import { MapContainer, TileLayer, Polygon, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { City, AnalysisResult, AnalysisFormValues } from '@/lib/types';
import { useEffect } from 'react';

// Component to update map view when city changes
function MapUpdater({ city }: { city: City | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (city) {
      map.setView(city.center, 11);
    }
  }, [city, map]);
  return null;
}

type CoverageMapProps = {
  selectedCity: City | undefined;
  stores: AnalysisFormValues['stores'];
  analysisResults: AnalysisResult[];
};

export function CoverageMap({ selectedCity, stores, analysisResults }: CoverageMapProps) {
  const getPolygonStyle = (polygonId: string) => {
    for (const result of analysisResults) {
      if (result.polygonStyles[polygonId]) {
        const { fillColor, fillOpacity, strokeColor, strokeWeight } = result.polygonStyles[polygonId];
        return {
          color: strokeColor,
          weight: strokeWeight,
          fillColor: fillColor,
          fillOpacity: fillOpacity,
        };
      }
    }
    // Default style
    return {
      fillColor: 'gray',
      color: 'black',
      fillOpacity: 0.3,
      weight: 1,
    };
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden">
      <MapContainer
      key={selectedCity ? JSON.stringify(selectedCity.center) : "default-map"}
        center={selectedCity?.center || [51.505, -0.09]}
        zoom={11}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <MapUpdater city={selectedCity} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {selectedCity?.polygons.features.map(feature => {
          if (!feature.properties?.id) return null;
          const polygonId = feature.properties.id as string;
          const styleOptions = getPolygonStyle(polygonId);
          // Leaflet expects [lat, lng], GeoJSON is [lng, lat]
          const positions = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as L.LatLngExpression);
          return <Polygon key={polygonId} positions={positions} pathOptions={styleOptions} />;
        })}

        {stores.map((store) => {
            const position = { lat: parseFloat(store.lat), lng: parseFloat(store.lng) };
            if (isNaN(position.lat) || isNaN(position.lng)) return null;

            const storeResult = analysisResults.find(r => r.store.id === store.id);
            const color = storeResult?.store.color || '#4285F4';

            const icon = L.divIcon({
                html: `<div class="w-4 h-4 rounded-full border-2 border-white" style="background-color: ${color}; box-shadow: 0 2px 4px rgba(0,0,0,0.4);"></div>`,
                className: '', // leaflet adds a default class, we don't want it
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            
            return (
                <Marker 
                    key={store.id} 
                    position={[position.lat, position.lng]} 
                    icon={icon}
                    title={store.name}
                />
            );
        })}
      </MapContainer>
    </div>
  );
}
