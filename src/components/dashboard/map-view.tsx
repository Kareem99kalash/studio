'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { City } from '@/lib/types';

// --- ICONS & STYLES ---
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

const defaultIcon = L.icon({
  iconUrl, iconRetinaUrl, shadowUrl,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28], shadowSize: [41, 41]
});

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
  const [routePaths, setRoutePaths] = useState<any[]>([]); 
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);

  // --- 🔄 SESSION RESET ---
  // When the analysis results change (new timestamp), clear old paths and selection
  useEffect(() => {
    setRoutePaths([]);
    setSelectedZone(null);
  }, [analysisData?.timestamp]);

  const centerPosition: [number, number] = selectedCity?.center 
    ? [selectedCity.center.lat, selectedCity.center.lng] 
    : [36.19, 44.01];

  // --- 🎨 STYLE LOGIC ---
  const getZoneStyle = (feature: any) => {
    const zoneName = feature.properties.name;
    const isSelected = zoneName === selectedZone;
    
    if (!analysisData || !analysisData.assignments) {
      return { color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.1 };
    }

    const data = analysisData.assignments[zoneName];
    if (data) {
        return {
            color: data.storeColor || '#000000', 
            weight: isSelected ? 4 : 2,
            fillColor: data.fillColor || '#ef4444', 
            fillOpacity: isSelected ? 0.3 : 0.5
        };
    }

    return { color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.5 };
  };

  // --- 🛣️ ROUTING ENGINE ---
  const fetchRoutePath = async (start: [number, number], end: [number, number], color: string, label: string) => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates.map((p: number[]) => [p[1], p[0]]);
            return { positions: coords, color, label, endPoint: end };
        }
    } catch (e) { console.error("Routing Error:", e); }
    return null; 
  };

  const handleZoneClick = async (feature: any) => {
      const name = feature.properties.name;
      if (selectedZone === name) {
          setSelectedZone(null);
          setRoutePaths([]);
          return;
      }

      setSelectedZone(name);
      setIsFetchingRoute(true);
      setRoutePaths([]); 

      const center = feature.properties.centroid;
      let targetStore = null;

      // 1. Prioritize store assigned in current analysis
      if (analysisData?.assignments?.[name]) {
          const storeId = analysisData.assignments[name].storeId;
          targetStore = stores.find(s => s.id === storeId);
      }

      // 2. Fallback to closest if no analysis data exists
      if (!targetStore) {
        let minDst = Infinity;
        stores.forEach(store => {
            const d = getDistSq(center.lat, center.lng, parseFloat(store.lat), parseFloat(store.lng));
            if (d < minDst) { minDst = d; targetStore = store; }
        });
      }

      if (!targetStore) { setIsFetchingRoute(false); return; }

      const storePt: [number, number] = [parseFloat(targetStore.lat), parseFloat(targetStore.lng)];
      const rawCoords = feature.geometry.coordinates[0]; 
      const vertices = rawCoords.map((p: any) => [p[1], p[0]] as [number, number]);
      
      let closestPt = vertices[0];
      let furthestPt = vertices[0];
      let minVDist = Infinity;
      let maxVDist = -1;

      vertices.forEach(v => {
        const d = getDistSq(v[0], v[1], storePt[0], storePt[1]);
        if (d < minVDist) { minVDist = d; closestPt = v; }
        if (d > maxVDist) { maxVDist = d; furthestPt = v; }
      });

      const centerPt: [number, number] = [center.lat, center.lng];
      
      // Parallel fetch for speed
      const newRoutes = await Promise.all([
          fetchRoutePath(storePt, centerPt, 'blue', 'Center'),
          fetchRoutePath(storePt, closestPt, 'green', 'Entrance'),
          fetchRoutePath(storePt, furthestPt, 'red', 'Furthest')
      ]);

      setRoutePaths(newRoutes.filter(r => r !== null));
      setIsFetchingRoute(false);
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border relative">
      
      {(isLoading || isFetchingRoute) && (
        <div className="absolute inset-0 z-[1000] bg-white/50 flex items-center justify-center backdrop-blur-sm pointer-events-none">
           <div className="bg-white p-3 rounded shadow-lg text-sm font-semibold flex items-center gap-2">
             <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
             {isFetchingRoute ? "Calculating Road Route..." : "Updating Map..."}
           </div>
        </div>
      )}

      <MapContainer 
        center={centerPosition} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
        key={`${selectedCity?.id}-${analysisData?.timestamp || 'initial'}`} 
      >
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {selectedCity?.polygons && (
          <GeoJSON 
            key={`${selectedCity.id}-${analysisData?.timestamp || 'init'}`} 
            data={selectedCity.polygons} 
            style={getZoneStyle}
            onEachFeature={(feature, layer) => {
               layer.bindTooltip(feature.properties.name, { sticky: true });
               layer.on({ click: () => handleZoneClick(feature) });
            }}
          />
        )}

        {routePaths.map((route, i) => (
            <div key={`${selectedZone}-route-${i}`}>
                <Polyline positions={route.positions} pathOptions={{ color: route.color, weight: 4, opacity: 0.8 }} />
                <CircleMarker center={route.endPoint} radius={4} pathOptions={{ color: route.color, fillColor: route.color, fillOpacity: 1 }}>
                    <Tooltip direction="top" permanent>{route.label}</Tooltip>
                </CircleMarker>
            </div>
        ))}

        {stores.map((store: any) => (
            <CircleMarker
              key={store.id}
              center={[parseFloat(store.lat), parseFloat(store.lng)]}
              radius={8}
              pathOptions={{ 
                  color: '#ffffff', 
                  weight: 2, 
                  fillColor: store.borderColor || '#2563eb', 
                  fillOpacity: 1 
              }}
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
