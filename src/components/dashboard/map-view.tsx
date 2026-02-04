'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route, Navigation, Ruler, BrainCircuit, Users, Building2, Clock, MapPin, Flame, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// --- HELPERS ---
function getDistSq(lat1: number, lng1: number, lat2: number, lng2: number) {
    return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2;
}

// Function to generate heatmap colors (Red for high density, Blue for low)
const getHeatmapColor = (density: number) => {
  return density > 0.8 ? '#ef4444' : // Red
         density > 0.6 ? '#f97316' : // Orange
         density > 0.4 ? '#eab308' : // Yellow
         density > 0.2 ? '#22c55e' : // Green
                         '#3b82f6';   // Blue
};

function MapRecenter({ city }: { city?: any }) {
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

export function MapView({ selectedCity, stores, analysisData, isLoading }: any) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [routePaths, setRoutePaths] = useState<any[]>([]); 
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [zoneStats, setZoneStats] = useState<any>(null);
  const [showHeatmap, setShowHeatmap] = useState(false); // Heatmap Toggle State

  useEffect(() => {
    if (analysisData?.assignments) {
      const zones = Object.entries(analysisData.assignments);
      const covered = zones.filter(([_, v]: any) => v.status === 'in').length;
      const warning = zones.filter(([_, v]: any) => v.status === 'warning').length;
      
      let furthest = { name: 'N/A', dist: 0 };
      zones.forEach(([name, data]: any) => {
          if (data.distance > furthest.dist) furthest = { name, dist: data.distance };
      });

      setAiInsights({
        total: zones.length,
        covered,
        warning,
        out: zones.length - (covered + warning),
        furthestPolygon: furthest.name,
        efficiency: (((covered + warning) / zones.length) * 100).toFixed(1)
      });
    }
  }, [analysisData]);

  const fetchRoutePath = async (start: [number, number], end: [number, number], color: string, label: string) => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]) {
            const coords = data.routes[0].geometry.coordinates.map((p: number[]) => [p[1], p[0]]);
            return { 
                positions: coords, 
                color, label, 
                endPoint: end, 
                distanceKm: (data.routes[0].distance / 1000).toFixed(2),
                durationMin: Math.round(data.routes[0].duration / 60)
            };
        }
    } catch (e) { console.error(e); }
    return null; 
  };

  const handleZoneClick = async (feature: any) => {
      const name = feature.properties.name;
      if (selectedZone === name) { setSelectedZone(null); setRoutePaths([]); setZoneStats(null); return; }
      setSelectedZone(name);
      setIsFetchingRoute(true);

      const areaFactor = feature.properties.area || 1; 
      setZoneStats({
          population: Math.floor(2500 * areaFactor + (Math.random() * 500)),
          businesses: Math.floor(40 * areaFactor + (Math.random() * 15)),
          density: Math.min(areaFactor / 2, 1) // Normalized density for heatmap
      });

      const center = feature.properties.centroid;
      const targetStore = analysisData?.assignments?.[name] 
        ? stores.find((s:any) => s.id === analysisData.assignments[name].storeId)
        : stores[0];

      if (targetStore) {
        const storePt: [number, number] = [parseFloat(targetStore.lat), parseFloat(targetStore.lng)];
        const vertices = feature.geometry.coordinates[0].map((p: any) => [p[1], p[0]] as [number, number]);
        let closestPt = vertices[0];
        let minVDist = Infinity;
        vertices.forEach(v => {
          const d = getDistSq(v[0], v[1], storePt[0], storePt[1]);
          if (d < minVDist) { minVDist = d; closestPt = v; }
        });

        const newRoutes = await Promise.all([
            fetchRoutePath(storePt, [center.lat, center.lng], '#3b82f6', 'Center'),
            fetchRoutePath(storePt, closestPt, '#22c55e', 'Entrance')
        ]);
        setRoutePaths(newRoutes.filter(r => r !== null));
      }
      setIsFetchingRoute(false);
  };

  return (
    <div className="flex h-full w-full gap-4 p-2 bg-slate-50 overflow-hidden">
      {/* --- MAP SECTION --- */}
      <div className="flex-[7] rounded-xl overflow-hidden border relative shadow-md bg-white">
        
        {/* 🔥 HEATMAP OVERLAY CONTROLS */}
        <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-lg shadow-lg border border-slate-200 flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Flame className={`h-4 w-4 ${showHeatmap ? 'text-orange-500' : 'text-slate-400'}`} />
            <Switch id="heatmap-mode" checked={showHeatmap} onCheckedChange={setShowHeatmap} />
            <Label htmlFor="heatmap-mode" className="text-xs font-bold text-slate-700">Population Heatmap</Label>
          </div>
          {showHeatmap && (
             <div className="flex gap-1 items-center border-l pl-4">
                <div className="w-20 h-2 rounded-full bg-gradient-to-r from-blue-500 via-yellow-400 to-red-500" />
                <span className="text-[9px] font-bold text-slate-500 uppercase">Density</span>
             </div>
          )}
        </div>

        <MapContainer center={[36.19, 44.01]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <MapRecenter city={selectedCity} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          {selectedCity?.polygons && (
            <GeoJSON data={selectedCity.polygons} style={(f) => {
              const data = analysisData?.assignments?.[f.properties.name];
              const area = f.properties.area || 0.5;
              
              // 🧪 Heatmap Logic: Color based on simulated density
              if (showHeatmap) {
                return { color: 'white', weight: 0.5, fillColor: getHeatmapColor(area / 2), fillOpacity: 0.7 };
              }

              // Normal Assignment Logic
              return { 
                color: data?.storeColor || '#cbd5e1', 
                weight: f.properties.name === selectedZone ? 4 : 1, 
                fillColor: data?.fillColor || '#f1f5f9', 
                fillOpacity: 0.6 
              };
            }} onEachFeature={(f, l) => l.on({ click: () => handleZoneClick(f) })} />
          )}

          {!showHeatmap && routePaths.map((r, i) => (
            <Polyline key={i} positions={r.positions} pathOptions={{ color: r.color, weight: 4 }} />
          ))}

          {stores.map((s: any) => (
            <CircleMarker key={s.id} center={[parseFloat(s.lat), parseFloat(s.lng)]} radius={8} pathOptions={{ color: 'white', weight: 2, fillColor: s.borderColor || '#2563eb', fillOpacity: 1 }}>
              <Popup><div className="font-bold text-xs">{s.name}</div></Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* --- SIDE PANEL --- */}
      <div className="flex-[3] flex flex-col gap-4 overflow-y-auto pr-2">
        
        {/* AI SUMMARY CARD */}
        <Card className="border-t-4 border-t-purple-600 shadow-sm bg-purple-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-purple-600" /> Market Intelligence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!aiInsights ? <p className="text-[10px] text-muted-foreground">Waiting for analysis...</p> : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2 rounded border border-purple-100">
                    <div className="text-[9px] uppercase font-bold text-slate-400">Net Covered</div>
                    <div className="text-sm font-bold text-green-600">{aiInsights.covered} Polygons</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-purple-100">
                    <div className="text-[9px] uppercase font-bold text-slate-400">Furthest Reach</div>
                    <div className="text-[11px] font-bold text-slate-700 truncate">{aiInsights.furthestPolygon}</div>
                  </div>
                </div>
                <div className="bg-purple-600 p-3 rounded-lg text-white flex justify-between items-center shadow-inner">
                   <div className="flex flex-col">
                     <span className="text-[9px] font-bold uppercase opacity-80">Network Efficiency</span>
                     <span className="text-lg font-black">{aiInsights.efficiency}%</span>
                   </div>
                   <CheckCircle2 className="h-6 w-6 opacity-50" />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* SELECTED ZONE DETAILS */}
        <Card className="border-t-4 border-t-blue-600 flex-1 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {showHeatmap ? <Flame className="h-4 w-4 text-orange-500" /> : <MapPin className="h-4 w-4 text-blue-600" />} 
              {showHeatmap ? "Density Insights" : "Zone Analysis"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedZone ? (
              <div className="text-center py-10 space-y-2 opacity-30 italic">
                <Info className="h-8 w-8 mx-auto" />
                <p className="text-xs">Click a polygon for AI deep-dive</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="text-xl font-black text-slate-800 tracking-tight leading-none">{selectedZone}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col p-2 bg-slate-50 rounded border">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Population</span>
                      <div className="flex items-center gap-1 text-sm font-bold"><Users className="h-3 w-3 text-blue-500" /> {zoneStats?.population?.toLocaleString()}</div>
                    </div>
                    <div className="flex flex-col p-2 bg-slate-50 rounded border">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Businesses</span>
                      <div className="flex items-center gap-1 text-sm font-bold"><Building2 className="h-3 w-3 text-blue-500" /> {zoneStats?.businesses}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-dashed">
                  <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Navigation className="h-3 w-3" /> Driving Logistics
                  </div>
                  {routePaths.map((r, i) => (
                    <div key={i} className="flex justify-between items-center bg-white p-2 border rounded shadow-sm hover:border-blue-200 transition-colors">
                      <span className="text-[11px] font-medium text-slate-500">{r.label}</span>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-700">{r.distanceKm} km</div>
                        <div className="text-[10px] text-blue-600 font-bold flex items-center justify-end gap-1"><Clock className="h-2.5 w-2.5" /> {r.durationMin} min</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-amber-50 border border-amber-100 rounded text-[10px] text-amber-800 leading-relaxed italic">
                  <strong>AI Note:</strong> This area shows {zoneStats?.population > 3000 ? 'high' : 'moderate'} commercial potential. Consider {zoneStats?.population > 3000 ? 'prioritizing' : 'monitoring'} delivery fleet density here.
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
