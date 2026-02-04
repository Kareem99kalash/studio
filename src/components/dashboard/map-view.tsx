'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { City } from '@/lib/types';

// Fix Leaflet Icons (Standard Next.js Fix)
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

const defaultIcon = L.icon({
  iconUrl, iconRetinaUrl, shadowUrl,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28], shadowSize: [41, 41]
});

type MapViewProps = {
  selectedCity?: City;
  stores: any[];
  analysisData: any; 
  isLoading: boolean;
};

export function MapView({ selectedCity, stores, analysisData, isLoading }: MapViewProps) {
  const centerPosition: [number, number] = selectedCity?.center 
    ? [selectedCity.center.lat, selectedCity.center.lng] 
    : [36.19, 44.01];

  // --- SAFE STYLE FUNCTION ---
  const getZoneStyle = (feature: any) => {
    // 1. DEFAULT (Before Analysis): Blue & Transparent
    if (!analysisData || !analysisData.assignments) {
      return { 
        color: '#3b82f6', 
        weight: 1, 
        fillColor: '#3b82f6', 
        fillOpacity: 0.1 
      };
    }

    const zoneName = feature.properties.name;
    const assignedColor = analysisData.assignments[zoneName];

    // 2. SAFETY FALLBACK: Use Red if color is missing/invalid
    // This prevents "Black Polygons"
    const finalColor = assignedColor || '#ef4444'; 

    return { 
      color: '#ffffff', // White border
      weight: 1, 
      fillColor: finalColor, 
      fillOpacity: 0.5 
    };
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border relative">
      
      {isLoading && (
        <div className="absolute inset-0 z-[1000] bg-white/50 flex items-center justify-center backdrop-blur-sm">
           <div className="bg-white p-3 rounded shadow-lg text-sm font-semibold">Processing...</div>
        </div>
      )}

      <MapContainer 
        center={centerPosition} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
        key={selectedCity?.id} 
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 1. ZONES */}
        {selectedCity?.polygons && (
          <GeoJSON 
            key={`${selectedCity.id}-${analysisData ? 'done' : 'init'}`} 
            data={selectedCity.polygons} 
            style={getZoneStyle}
            onEachFeature={(feature, layer) => {
               layer.bindTooltip(feature.properties.name, { sticky: true });
            }}
          />
        )}

        {/* 2. STORES */}
        {stores.map((store: any) => (
            <CircleMarker
              key={store.id}
              center={[parseFloat(store.lat), parseFloat(store.lng)]}
              radius={6}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}
            >
              <Popup>
                <div className="p-1">
                  <strong className="text-sm">{store.name}</strong>
                  <div className="text-xs text-muted-foreground">{store.lat}, {store.lng}</div>
                </div>
              </Popup>
            </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
