'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route, Navigation, BrainCircuit, Clock, MapPin, Info, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// --- HELPERS ---
function getDistSq(lat1: number, lng1: number, lat2: number, lng2: number) {
    return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2;
}

function MapController({ city, resetTrigger }: { city?: any, resetTrigger: number }) {
  const map = useMap();
  useEffect(() => {
    if (city?.polygons?.features?.length) {
      try {
        const bounds = L.geoJSON(city.polygons).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13, animate: true });
        }
      } catch (e) { console.error("Map control error:", e); }
    }
  }, [city, map, resetTrigger]);
  return null;
}

export function MapView({ selectedCity, stores = [], analysisData, isLoading }: any) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [routePaths, setRoutePaths] = useState<any[]>([]); 
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Guard against SSR crashes
  useEffect(() => { setIsClient(true); }, []);

  // --- 🤖 AI GLOBAL SUMMARY: Fix for the "0.0%" Intelligence data ---
  useEffect(() => {
    if (analysisData?.assignments && Object.keys(analysisData.assignments).length > 0) {
      const zones = Object.entries(analysisData.assignments);
      
      // Flexible status check (handles "in", "IN", "Warning", etc.)
      const covered = zones.filter(([_, v]: any) => v?.status?.toLowerCase() === 'in').length;
      const warning = zones.filter(([_, v]: any) => v?.status?.toLowerCase() === 'warning').length;
      
      let furthest = { name: 'N/A', dist: 0 };
      zones.forEach(([name, data]: any) => {
          if (data?.distance > furthest.dist) furthest = { name, dist: data.distance };
      });

      setAiInsights({
        total: zones.length,
        covered,
        warning,
        out: zones.length - (covered + warning),
        furthestPolygon: furthest.name,
        efficiency: (((covered + warning) / zones.length) * 100).toFixed(1)
      });
    } else {
        setAiInsights(null);
    }
  }, [analysisData]);

  const handleReset = () => {
    setSelectedZone(null);
    setRoutePaths([]);
    setResetTrigger(prev => prev + 1);
  };

  if (!isClient) return <div className="h-full w-full bg-slate-50 flex items-center justify-center font-bold">Initializing Map...</div>;

  const fetchRoutePath = async (start: [number, number], end: [number, number], color: string, label: string) => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]) {
            const coords = data.routes[0].geometry.coordinates.map((p: number[]) => [p[1], p[0]]);
            return {
                positions: coords,
                color,
                label,
                endPoint: end,
                distanceKm: (data.routes[0].distance / 1000).toFixed(2),
                durationMin: Math.round(data.routes[0].duration / 60)
            };
        }
    } catch (e) { console.error("OSRM Error:", e); }
    return null; 
  };

  const handleZoneClick = async (feature: any) => {
      const name = feature?.properties?.name;
      if (!name) return;

      if (selectedZone === name) { 
          setSelectedZone(null); 
          setRoutePaths([]); 
          return; 
      }
      
      setSelectedZone(name);
      setIsFetchingRoute(true);
      setRoutePaths([]); 

      const assignment = analysisData?.assignments?.[name];
      const storeId = assignment?.storeId;
      const targetStore = stores.find((s: any) => s.id === storeId);

      if (targetStore?.lat && targetStore?.lng && feature.properties?.centroid) {
          const storePt: [number, number] = [parseFloat(targetStore.lat), parseFloat(targetStore.lng)];
          const center = feature.properties.centroid;
          
          // --- Logic for Closest & Furthest Points ---
          const vertices = feature.geometry.coordinates[0].map((p: any) => [p[1], p[0]] as [number, number]);
          let closestPt = vertices[0], furthestPt = vertices[0];
          let minVDist = Infinity, maxVDist = -1;

          vertices.forEach((v: [number, number]) => {
            const d = getDistSq(v[0], v[1], storePt[0], storePt[1]);
            if (d < minVDist) { minVDist = d; closestPt = v; }
            if (d > maxVDist) { maxVDist = d; furthestPt = v; }
          });

          // Fetch 3 Specific Routes: Entrance, Center, Furthest Point
          const results = await Promise.all([
              fetchRoutePath(storePt, closestPt, '#22c55e', 'Closest (Entrance)'),
              fetchRoutePath(storePt, [center.lat, center.lng], '#3b82f6', 'Middle (Center)'),
              fetchRoutePath(storePt, furthestPt, '#ef4444', 'Furthest Reach')
          ]);

          setRoutePaths(results.filter(r => r !== null));
      }
      setIsFetchingRoute(false);
  };

  return (
    <div className="flex h-full w-full gap-4 p-2 bg-slate-50 overflow-hidden">
      {/* --- 🗺️ MAP (70%) --- */}
      <div className="flex-[7] rounded-xl overflow-hidden border relative shadow-md bg-white">
        
        <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur p-2 px-3 rounded-lg shadow-lg border border-slate-200 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold text-slate-500 hover:text-blue-600 gap-1" onClick={handleReset}>
            <RefreshCw className="h-3 w-3" /> Reset View
          </Button>
          {(isFetchingRoute || isLoading) && <Loader2 className="h-4 w-4 animate-spin text-purple-600" />}
        </div>

        <MapContainer center={[36.19, 44.01]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <MapController city={selectedCity} resetTrigger={resetTrigger} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          {selectedCity?.polygons && (
            <GeoJSON 
                key={`${selectedCity.id}-map`} 
                data={selectedCity.polygons} 
                style={(f: any) => {
                    const zoneName = f?.properties?.name;
                    const data = analysisData?.assignments?.[zoneName];
                    return { 
                        color: data?.storeColor || '#cbd5e1', 
                        weight: zoneName === selectedZone ? 4 : 1, 
                        fillColor: data?.fillColor || '#f1f5f9', 
                        fillOpacity: 0.6 
                    };
                }} 
                onEachFeature={(f, l) => {
                    l.bindTooltip(f.properties.name, { sticky: true });
                    l.on({ click: () => handleZoneClick(f) });
                }}
            />
          )}

          {routePaths.map((r, i) => (
            <Polyline key={i} positions={r.positions} pathOptions={{ color: r.color, weight: 4, opacity: 0.8 }} />
          ))}

          {stores?.map((s: any) => (
            s.lat && s.lng && (
              <CircleMarker key={s.id} center={[parseFloat(s.lat), parseFloat(s.lng)]} radius={8} pathOptions={{ color: 'white', weight: 2, fillColor: s.borderColor || '#2563eb', fillOpacity: 1 }}>
                <Popup><div className="font-bold text-xs p-1">{s.name}</div></Popup>
              </CircleMarker>
            )
          ))}
        </MapContainer>
      </div>

      {/* --- 📊 SIDE PANEL (30%) --- */}
      <div className="flex-[3] flex flex-col gap-4 overflow-y-auto pr-2">
        
        {/* MARKET INTELLIGENCE */}
        <Card className="border-t-4 border-t-purple-600 shadow-sm bg-purple-50/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-purple-700 font-bold">
              <BrainCircuit className="h-4 w-4" /> Market Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!aiInsights ? <p className="text-[10px] text-muted-foreground italic">Press "Check Coverage" to see summary.</p> : (
              <>
                <div className="bg-purple-600 p-3 rounded-lg text-white flex justify-between items-center shadow-lg">
                   <div className="flex flex-col">
                     <span className="text-[9px] font-bold uppercase opacity-80 tracking-wider">Network Efficiency</span>
                     <span className="text-xl font-black">{aiInsights.efficiency}%</span>
                   </div>
                   <CheckCircle2 className="h-6 w-6 opacity-40" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2 rounded border border-purple-100 text-center shadow-sm">
                        <div className="text-[8px] font-bold text-slate-400 uppercase">Covered</div>
                        <div className="text-sm font-bold text-green-600">{aiInsights.covered} Zones</div>
                    </div>
                    <div className="bg-white p-2 rounded border border-purple-100 text-center shadow-sm">
                        <div className="text-[8px] font-bold text-slate-400 uppercase">Warning</div>
                        <div className="text-sm font-bold text-amber-500">{aiInsights.warning} Zones</div>
                    </div>
                </div>
                <div className="text-[10px] text-slate-500 bg-white p-2 rounded-md border border-purple-100 flex items-center gap-2">
                    <Navigation className="h-3 w-3 text-purple-500" /> Furthest: <strong className="text-slate-800 truncate">{aiInsights.furthestPolygon}</strong>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* LOGISTICS INSIGHTS */}
        <Card className="border-t-4 border-t-blue-600 flex-1 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700 font-bold">
              <Route className="h-4 w-4" /> Logistics Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedZone ? (
                <div className="text-center py-10 space-y-2 opacity-30 italic">
                    <Info className="h-8 w-8 mx-auto" />
                    <p className="text-xs">Click a polygon to view routes</p>
                </div>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="text-xl font-black text-slate-800 tracking-tight leading-none truncate">{selectedZone}</div>
                  <div className="text-[10px] font-bold text-blue-500 uppercase">Driving Logistics</div>
                </div>
                
                <div className="space-y-2">
                  {routePaths.length === 0 && isFetchingRoute && (
                    <div className="text-center py-4 text-[10px] text-slate-400">Calculating Road Network...</div>
                  )}
                  {routePaths.map((r, i) => (
                    <div key={i} className="bg-white p-2.5 border rounded-lg shadow-sm flex justify-between items-center border-blue-100">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                          <div className="h-1.5 w-1.5 rounded-full" style={{backgroundColor: r.color}} />
                          {r.label}
                        </span>
                        <span className="font-bold text-slate-700 flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3 text-blue-600" /> {r.durationMin} mins
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Distance</span>
                        <div className="text-sm font-black text-slate-800">{r.distanceKm} km</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-800 leading-relaxed italic">
                  <strong>Analysis:</strong> Green line shows the road path to the closest entrance. Red shows the maximum travel distance within the zone.
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
