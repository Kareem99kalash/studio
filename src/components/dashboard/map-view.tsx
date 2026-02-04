'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { City } from '@/lib/types';

type MapViewProps = {
  selectedCity?: City;
  stores: any[];
  analysisData: any; // Contains { assignments, storeStats }
  isLoading: boolean;
};

export function MapView({ selectedCity, stores, analysisData, isLoading }: MapViewProps) {
  const centerPosition: [number, number] = selectedCity?.center 
    ? [selectedCity.center.lat, selectedCity.center.lng] 
    : [36.19, 44.01];

  // Helper to find the assigned color for a zone
  const getZoneStyle = (feature: any) => {
    if (!analysisData) {
      // Default (Pre-analysis): Blue outline, transparent
      return { color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.1 };
    }

    const zoneName = feature.properties.name;
    const storeId = analysisData.assignments[zoneName];
    
    if (storeId) {
       // Find the store to get its color
       const storeStat = analysisData.storeStats.find((s: any) => s.id === storeId);
       const color = storeStat ? storeStat.color : '#94a3b8'; // Fallback grey
       return { color: '#ffffff', weight: 1, fillColor: color, fillOpacity: 0.6 };
    }

    // Unassigned (shouldn't happen with this logic, but just in case)
    return { color: '#94a3b8', weight: 1, fillColor: '#94a3b8', fillOpacity: 0.2 };
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border relative">
      
      {isLoading && (
        <div className="absolute inset-0 z-[1000] bg-white/50 flex items-center justify-center backdrop-blur-sm">
           <div className="bg-white p-3 rounded shadow-lg text-sm font-semibold">Calculating Coverage...</div>
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
            key={`${selectedCity.id}-${analysisData ? 'analyzed' : 'raw'}`} 
            data={selectedCity.polygons} 
            style={getZoneStyle}
            onEachFeature={(feature, layer) => {
               if (analysisData) {
                   const zoneName = feature.properties.name;
                   const storeId = analysisData.assignments[zoneName];
                   const store = analysisData.storeStats.find((s: any) => s.id === storeId);
                   layer.bindTooltip(`${zoneName} → ${store ? store.name : 'Unassigned'}`);
               } else {
                   layer.bindTooltip(feature.properties.name);
               }
            }}
          />
        )}

        {/* 2. STORES */}
        {stores.map((store) => {
          // If we have analysis data, use the calculated color (Green/Yellow/Red)
          const stat = analysisData?.storeStats.find((s: any) => s.id === store.id);
          const color = stat ? stat.color : '#3b82f6'; // Default Blue
          const count = stat ? stat.zoneCount : 0;

          return (
            <CircleMarker
              key={store.id}
              center={[parseFloat(store.lat), parseFloat(store.lng)]}
              radius={10}
              pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }}
            >
              <Popup>
                <div className="p-1 text-center">
                  <strong className="block text-sm">{store.name}</strong>
                  {stat && (
                    <div className="text-xs mt-1">
                      <p>Zones Assigned: <strong>{count}</strong></p>
                      <p style={{color}}>Status: {count > 60 ? 'Overload' : count > 30 ? 'Warning' : 'Good'}</p>
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
