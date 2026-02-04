'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { City } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route, Navigation, Ruler } from 'lucide-react';

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

function MapRecenter({ city }: { city?: City }) {
  const map = useMap();
  useEffect(() => {
    if (city?.polygons?.features?.length) {
      const bounds = L.geoJSON(city.polygons).getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13, animate: true });
      }
    }
  }, [city, map]);
  return null;
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

  useEffect(() => {
    setRoutePaths([]);
    setSelectedZone(null);
  }, [analysisData?.timestamp]);

  const centerPosition: [number, number] = [36.19, 44.01];

  const getZoneStyle = (feature: any) => {
    const zoneName = feature.properties.name;
    const isSelected = zoneName === selectedZone;
    if (!analysisData?.assignments) return { color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.1 };
    const data = analysisData.assignments[zoneName];
    return data ? {
        color: data.storeColor || '#000000', 
        weight: isSelected ? 4 : 2,
        fillColor: data.fillColor || '#ef4444', 
        fillOpacity: isSelected ? 0.3 : 0.5
    } : { color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.5 };
  };

  const fetchRoutePath = async (start: [number, number], end: [number, number], color: string, label: string) => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
            const coords = data.routes[0].geometry.coordinates.map((p: number[]) => [p[1], p[0]]);
            const distanceKm = (data.routes[0].distance / 1000).toFixed(2); // Convert meters to km
            return { positions: coords, color, label, endPoint: end, distanceKm };
        }
    } catch (e) { console.error("Routing Error:", e); }
    return null; 
  };

  const handleZoneClick = async (feature: any) => {
      const name = feature.properties.name;
      if (selectedZone === name) { setSelectedZone(null); setRoutePaths([]); return; }
      setSelectedZone(name);
      setIsFetchingRoute(true);
      setRoutePaths([]); 

      const center = feature.properties.centroid;
      let targetStore = analysisData?.assignments?.[name] 
        ? stores.find(s => s.id === analysisData.assignments[name].storeId)
        : null;

      if (!targetStore) {
        let minDst = Infinity;
        stores.forEach(store => {
            const d = getDistSq(center.lat, center.lng, parseFloat(store.lat), parseFloat(store.lng));
            if (d < minDst) { minDst = d; targetStore = store; }
        });
      }

      if (!targetStore) { setIsFetchingRoute(false); return; }
      const storePt: [number, number] = [parseFloat(targetStore.lat), parseFloat(targetStore.lng)];
      const vertices = feature.geometry.coordinates[0].map((p: any) => [p[1], p[0]] as [number, number]);
      
      let closestPt = vertices[0], furthestPt = vertices[0];
      let minVDist = Infinity, maxVDist = -1;

      vertices.forEach(v => {
        const d = getDistSq(v[0], v[1], storePt[0], storePt[1]);
        if (d < minVDist) { minVDist = d; closestPt = v; }
        if (d > maxVDist) { maxVDist = d; furthestPt = v; }
      });

      const newRoutes = await Promise.all([
          fetchRoutePath(storePt, [center.lat, center.lng], '#3b82f6', 'Center'),
          fetchRoutePath(storePt, closestPt, '#22c55e', 'Entrance'),
          fetchRoutePath(storePt, furthestPt, '#ef4444', 'Furthest')
      ]);

      setRoutePaths(newRoutes.filter(r => r !== null));
      setIsFetchingRoute(false);
  };

  return (
    <div className="flex h-full w-full gap-4 p-2 bg-slate-50">
      {/* --- 🗺️ MAP SECTION (70%) --- */}
      <div className="flex-[7] rounded-xl overflow-hidden border border-border relative shadow-sm bg-white">
        {(isLoading || isFetchingRoute) && (
          <div className="absolute inset-0 z-[1000] bg-white/40 flex items-center justify-center backdrop-blur-sm pointer-events-none">
             <div className="bg-white p-3 rounded-full shadow-xl text-sm font-semibold flex items-center gap-2 animate-pulse">
               <Navigation className="animate-bounce h-4 w-4 text-blue-600" />
               {isFetchingRoute ? "Calculating Road Routes..." : "Updating..."}
             </div>
          </div>
        )}

        <MapContainer center={centerPosition} zoom={12} style={{ height: '100%', width: '100%' }} key={`${selectedCity?.id}-${analysisData?.timestamp || 'initial'}`}>
          <MapRecenter city={selectedCity} />
          <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {selectedCity?.polygons && (
            <GeoJSON key={`${selectedCity.id}-${analysisData?.timestamp || 'init'}`} data={selectedCity.polygons} style={getZoneStyle} onEachFeature={(feature, layer) => {
                 layer.bindTooltip(feature.properties.name, { sticky: true });
                 layer.on({ click: () => handleZoneClick(feature) });
            }} />
          )}

          {routePaths.map((route, i) => (
              <div key={`${selectedZone}-route-${i}`}>
                  <Polyline positions={route.positions} pathOptions={{ color: route.color, weight: 4, opacity: 0.8 }} />
                  <CircleMarker center={route.endPoint} radius={5} pathOptions={{ color: route.color, fillColor: 'white', fillOpacity: 1, weight: 3 }}>
                      <Tooltip direction="top" permanent className="font-bold text-[10px]">{route.label}</Tooltip>
                  </CircleMarker>
              </div>
          ))}

          {stores.map((store: any) => (
              <CircleMarker key={store.id} center={[parseFloat(store.lat), parseFloat(store.lng)]} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: store.borderColor || '#2563eb', fillOpacity: 1 }}>
                <Popup><div className="p-1 font-bold text-xs">{store.name}</div></Popup>
              </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* --- 📊 DISTANCE PANEL (30%) --- */}
      <div className="flex-[3] flex flex-col gap-4">
        <Card className="shadow-sm border-t-4 border-t-blue-600">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Route className="h-4 w-4 text-blue-600" />
              Route Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedZone ? (
              <div className="py-10 text-center space-y-2">
                <Navigation className="h-8 w-8 mx-auto text-slate-300" />
                <p className="text-xs text-muted-foreground">Select a zone on the map to view road distances.</p>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Selected Zone</span>
                  <div className="text-lg font-bold text-slate-800">{selectedZone}</div>
                </div>

                <div className="space-y-3">
                  {routePaths.map((route, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-white shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: route.color }} />
                        <span className="text-sm font-medium text-slate-600">{route.label}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="text-sm font-black text-slate-900">{route.distanceKm} <span className="text-[10px] text-slate-400">KM</span></div>
                        <div className="text-[9px] text-blue-500 font-bold uppercase">Driving Distance</div>
                      </div>
                    </div>
                  ))}
                </div>

                {routePaths.length > 0 && (
                   <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-4 italic">
                     <Ruler className="h-3 w-3" />
                     Distances calculated via OSRM Road Network
                   </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Dynamic Legend / Info */}
        <Card className="flex-1 shadow-sm overflow-hidden">
           <CardContent className="p-4 text-xs text-slate-500 leading-relaxed">
             <strong className="text-slate-700 block mb-1">How it works:</strong>
             Clicking a polygon calculates real driving routes from the assigned store to the <strong>Center</strong>, the <strong>Entrance</strong> (closest vertex), and the <strong>Furthest</strong> point of that zone.
           </CardContent>
        </Card>
      </div>
    </div>
  );
}
