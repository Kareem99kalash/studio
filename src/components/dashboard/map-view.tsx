'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { City } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route, Navigation, Ruler, BrainCircuit, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// --- HELPERS ---
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
  const [aiInsights, setAiInsights] = useState<any>(null);

  // --- 🤖 AI ANALYSIS ENGINE ---
  // This triggers whenever analysisData changes (i.e., when "Check Coverage" is clicked)
  useEffect(() => {
    setRoutePaths([]);
    setSelectedZone(null);

    if (analysisData?.assignments) {
      generateAiAnalysis(analysisData);
    } else {
      setAiInsights(null);
    }
  }, [analysisData?.timestamp]);

  const generateAiAnalysis = (data: any) => {
    const zones = Object.values(data.assignments);
    const slowZones = zones.filter((z: any) => z.status === 'out' || z.status === 'warning');
    const totalZones = zones.length;
    const efficiency = (((totalZones - slowZones.length) / totalZones) * 100).toFixed(1);

    // Logic for AI recommendations based on your data
    setAiInsights({
      efficiency,
      summary: slowZones.length > 0 
        ? `${slowZones.length} zones are currently under-performing based on your time thresholds.`
        : "Excellent coverage. All zones are within optimal delivery windows.",
      bottleneck: slowZones.length > 5 ? "High" : "Low",
      suggestion: slowZones.length > 0 
        ? "Consider adding a satellite hub or increasing fleet density in warning sectors."
        : "Maintain current store distribution. Focus on peak-hour optimization."
    });
  };

  const centerPosition: [number, number] = [36.19, 44.01];

  const fetchRoutePath = async (start: [number, number], end: [number, number], color: string, label: string) => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]) {
            const coords = data.routes[0].geometry.coordinates.map((p: number[]) => [p[1], p[0]]);
            const distanceKm = (data.routes[0].distance / 1000).toFixed(2);
            return { positions: coords, color, label, endPoint: end, distanceKm };
        }
    } catch (e) { console.error(e); }
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
    <div className="flex h-full w-full gap-4 p-2 bg-slate-50 overflow-hidden">
      {/* --- 🗺️ MAP SECTION (70%) --- */}
      <div className="flex-[7] rounded-xl overflow-hidden border border-border relative shadow-sm bg-white">
        <MapContainer center={centerPosition} zoom={12} style={{ height: '100%', width: '100%' }} key={`${selectedCity?.id}-${analysisData?.timestamp || 'initial'}`}>
          <MapRecenter city={selectedCity} />
          <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {selectedCity?.polygons && (
            <GeoJSON key={`${selectedCity.id}-${analysisData?.timestamp || 'init'}`} data={selectedCity.polygons} style={(f) => {
              const zoneName = f.properties.name;
              const isSelected = zoneName === selectedZone;
              const data = analysisData?.assignments?.[zoneName];
              return data ? { color: data.storeColor, weight: isSelected ? 4 : 2, fillColor: data.fillColor, fillOpacity: isSelected ? 0.3 : 0.5 } 
                          : { color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.1 };
            }} onEachFeature={(feature, layer) => {
                 layer.bindTooltip(feature.properties.name, { sticky: true });
                 layer.on({ click: () => handleZoneClick(feature) });
            }} />
          )}
          {routePaths.map((route, i) => (
              <div key={i}>
                  <Polyline positions={route.positions} pathOptions={{ color: route.color, weight: 4, opacity: 0.8 }} />
                  <CircleMarker center={route.endPoint} radius={5} pathOptions={{ color: route.color, fillColor: 'white', fillOpacity: 1, weight: 3 }}>
                      <Tooltip direction="top" permanent className="font-bold text-[10px]">{route.label}</Tooltip>
                  </CircleMarker>
              </div>
          ))}
        </MapContainer>
      </div>

      {/* --- 📊 DATA & AI PANEL (30%) --- */}
      <div className="flex-[3] flex flex-col gap-4 overflow-y-auto pr-1">
        
        {/* 🤖 AI INSIGHTS CARD */}
        <Card className="shadow-sm border-t-4 border-t-purple-600 bg-gradient-to-b from-purple-50/50 to-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-purple-700">
              <BrainCircuit className="h-4 w-4" />
              AI Coverage Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!aiInsights ? (
              <p className="text-[11px] text-muted-foreground italic">Run coverage check to generate AI insights.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Network Efficiency</span>
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700">{aiInsights.efficiency}%</Badge>
                </div>
                
                <div className="p-2 rounded bg-white border border-purple-100 flex gap-2">
                   <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                   <p className="text-[11px] leading-relaxed text-slate-700">{aiInsights.summary}</p>
                </div>

                <div className="space-y-1">
                   <div className="text-[10px] font-bold text-slate-400 uppercase">Recommendation</div>
                   <div className="text-[11px] text-slate-600 bg-slate-100 p-2 rounded">{aiInsights.suggestion}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 🛣️ ROUTE DETAILS CARD */}
        <Card className="shadow-sm border-t-4 border-t-blue-600 flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
              <Route className="h-4 w-4" />
              Zone Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedZone ? (
              <div className="py-6 text-center space-y-2 opacity-40">
                <Navigation className="h-6 w-6 mx-auto" />
                <p className="text-[10px]">Click a zone to see road distances</p>
              </div>
            ) : (
              <>
                <div className="p-2 rounded bg-blue-50 border border-blue-100">
                  <div className="text-[9px] font-bold text-blue-400 uppercase">Selected</div>
                  <div className="text-sm font-bold text-blue-900 truncate">{selectedZone}</div>
                </div>
                <div className="space-y-2">
                  {routePaths.map((route, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border bg-white text-[11px]">
                      <span className="font-medium text-slate-500 flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full" style={{backgroundColor: route.color}} />
                        {route.label}
                      </span>
                      <span className="font-bold text-slate-700">{route.distanceKm} km</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
