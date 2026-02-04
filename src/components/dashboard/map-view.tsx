'use client';

import { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { City } from '@/lib/types';

// --- ICONS ---
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

const defaultIcon = L.icon({
  iconUrl, iconRetinaUrl, shadowUrl,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28], shadowSize: [41, 41]
});

// --- HELPER: DISTANCE SQUARED (Faster for sorting) ---
function getDistSq(lat1: number, lng1: number, lat2: number, lng2: number) {
    return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2;
}

type MapViewProps = {
  selectedCity?: City;
  stores: any[];
  analysisData: any; 
  isLoading: boolean;
};

export function MapView({ selectedCity, stores, analysisData, isLoading }: MapViewProps) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const centerPosition: [number, number] = selectedCity?.center 
    ? [selectedCity.center.lat, selectedCity.center.lng] 
    : [36.19, 44.01];

  // --- STYLE LOGIC ---
  const getZoneStyle = (feature: any) => {
    const zoneName = feature.properties.name;
    const isSelected = zoneName === selectedZone;
    
    // Default blue if no analysis
    if (!analysisData || !analysisData.assignments) {
      return { color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.1 };
    }

    const assignedColor = analysisData.assignments[zoneName];
    const finalColor = assignedColor || '#ef4444'; 

    return { 
      color: isSelected ? '#000000' : '#ffffff', // Black border if selected
      weight: isSelected ? 3 : 1, // Thicker border if selected
      fillColor: finalColor, 
      fillOpacity: isSelected ? 0.3 : 0.5 // More transparent if selected (to see routes)
    };
  };

  // --- ROUTE CALCULATION ---
  const renderRoutes = () => {
    if (!selectedZone || !analysisData || !selectedCity) return null;

    // 1. Find the Zone & Assigned Store
    const zoneFeature = selectedCity.polygons.features.find((f: any) => f.properties.name === selectedZone);
    if (!zoneFeature) return null;

    // Find nearest store to the zone center
    const center = zoneFeature.properties.centroid;
    let nearestStore: any = null;
    let minDst = Infinity;

    stores.forEach(store => {
        const d = getDistSq(center.lat, center.lng, parseFloat(store.lat), parseFloat(store.lng));
        if (d < minDst) { minDst = d; nearestStore = store; }
    });

    if (!nearestStore) return null;

    const storePt = [parseFloat(nearestStore.lat), parseFloat(nearestStore.lng)] as [number, number];

    // 2. Find Key Points (Vertices)
    const rawCoords = zoneFeature.geometry.coordinates[0]; 
    // GeoJSON is [lng, lat], Leaflet needs [lat, lng]
    const vertices = rawCoords.map((p: any) => [p[1], p[0]] as [number, number]);

    let closestPt = vertices[0];
    let furthestPt = vertices[0];
    let minVDist = Infinity; // 👈 FIXED: removed space here
    let maxVDist = -1;

    vertices.forEach(v => {
        const d = getDistSq(v[0], v[1], storePt[0], storePt[1]);
        if (d < minVDist) { minVDist = d; closestPt = v; }
        if (d > maxVDist) { maxVDist = d; furthestPt = v; }
    });

    // 3. Render Lines
    return (
      <>
        {/* Route to Center (Blue) */}
        <Polyline positions={[storePt, [center.lat, center.lng]]} pathOptions={{ color: 'blue', dashArray: '5, 10', weight: 2 }} />
        <CircleMarker center={[center.lat, center.lng]} radius={4} pathOptions={{ color: 'blue', fillColor: 'blue' }}>
            <Tooltip permanent direction="center" className="text-xs bg-transparent border-none shadow-none text-blue-800 font-bold">Center</Tooltip>
        </CircleMarker>

        {/* Route to Entrance/Closest (Green) */}
        <Polyline positions={[storePt, closestPt]} pathOptions={{ color: 'green', dashArray: '5, 5', weight: 2 }} />
        <CircleMarker center={closestPt} radius={4} pathOptions={{ color: 'green', fillColor: 'green' }}>
            <Tooltip direction="top">Entrance (Closest)</Tooltip>
        </CircleMarker>

        {/* Route to Furthest (Red) */}
        <Polyline positions={[storePt, furthestPt]} pathOptions={{ color: 'red', dashArray: '2, 5', weight: 2 }} />
        <CircleMarker center={furthestPt} radius={4} pathOptions={{ color: 'red', fillColor: 'red' }}>
            <Tooltip direction="top">Furthest Point</Tooltip>
        </CircleMarker>
      </>
    );
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

        {/* 1. ZONES (Bottom Layer) */}
        {selectedCity?.polygons && (
          <GeoJSON 
            key={`${selectedCity.id}-${analysisData ? 'done' : 'init'}`} 
            data={selectedCity.polygons} 
            style={getZoneStyle}
            onEachFeature={(feature, layer) => {
               layer.bindTooltip(feature.properties.name, { sticky: true });
               
               // CLICK HANDLER
               layer.on({
                 click: () => {
                     // Toggle selection
                     const name = feature.properties.name;
                     setSelectedZone(prev => prev === name ? null : name);
                 }
               });
            }}
          />
        )}

        {/* 2. ROUTES (Middle Layer) */}
        {renderRoutes()}

        {/* 3. STORES (Top Layer - Rendered Last) */}
        {stores.map((store: any) => (
            <CircleMarker
              key={store.id}
              center={[parseFloat(store.lat), parseFloat(store.lng)]}
              radius={8}
              pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}
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
