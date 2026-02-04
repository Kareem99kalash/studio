'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { City } from '@/lib/types';

// Fix Leaflet Icons
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

const defaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

type MapViewProps = {
  selectedCity?: City;
  stores: any[];
  analysisData: any; // Now contains { assignments: { "Zone A": "#hexcolor" }, stats: ... }
  isLoading: boolean;
};

export function MapView({ selectedCity, stores, analysisData, isLoading }: MapViewProps) {
  const centerPosition: [number, number] = selectedCity?.center 
    ? [selectedCity.center.lat, selectedCity.center.lng] 
    : [36.19, 44.01];

  // --- NEW STYLE LOGIC ---
  // Simply reads the hex color assigned to this zone name
  const getZoneStyle = (feature: any) => {
    // 1. If no analysis run yet, show faint blue
    if (!analysisData || !analysisData.assignments) {
      return { 
        color: '#3b82f6', 
        weight: 1, 
        fillColor: '#3b82f6', 
        fillOpacity: 0.1 
      };
    }

    const zoneName = feature.properties.name;
    // 2. Get the calculated color (Green/Yellow/Red) or default to Red if missing
    const color = analysisData.assignments[zoneName] || '#ef4444'; 

    return { 
      color: '#ffffff', // White border looks cleaner
      weight: 1, 
      fillColor: color, 
      fillOpacity: 0.5 // 50% opacity so you can see map labels underneath
    };
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border relative">
      
      {isLoading && (
        <div className="absolute inset-0 z-[1000] bg-white/50 flex items-center justify-center backdrop-blur-sm">
           <div className="bg-white p-3 rounded shadow-lg text-sm font-semibold">Checking Distance...</div>
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

        {/* 1. ZONES (Colored by Distance) */}
        {selectedCity?.polygons && (
          <GeoJSON 
            key={`${selectedCity.id}-${analysisData ? 'analyzed' : 'raw'}`} 
            data={selectedCity.polygons} 
            style={getZoneStyle}
            onEachFeature={(feature, layer) => {
               const zoneName = feature.properties.name;
               // Simple tooltip with just the name
               layer.bindTooltip(zoneName, { sticky: true });
            }}
          />
        )}

        {/* 2. STORES (Simple Markers) */}
        {stores.map((store) => (
            <CircleMarker
              key={store.id}
              center={[parseFloat(store.lat), parseFloat(store.lng)]}
              radius={8}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}
            >
              <Popup>
                <div className="p-1">
                  <strong className="text-sm">{store.name}</strong>
                  <div className="text-xs text-muted-foreground mt-1">
                    {store.lat}, {store.lng}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
