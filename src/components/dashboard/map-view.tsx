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
const getHeatmapColor = (density: number) => {
  return density > 0.8 ? '#ef4444' : density > 0.6 ? '#f97316' : density > 0.4 ? '#eab308' : density > 0.2 ? '#22c55e' : '#3b82f6';
};

function MapRecenter({ city }: { city?: any }) {
  const map = useMap();
  useEffect(() => {
    if (city?.polygons?.features?.length) {
      try {
        const bounds = L.geoJSON(city.polygons).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13, animate: true });
        }
      } catch (e) { console.error("Recenter error:", e); }
    }
  }, [city, map]);
  return null;
}

export function MapView({ selectedCity, stores = [], analysisData, isLoading }: any) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [routePaths, setRoutePaths] = useState<any[]>([]); 
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [zoneStats, setZoneStats] = useState<any>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Guard against SSR crashes
  useEffect(() => { setIsClient(true); }, []);

  // --- 🤖 AI GLOBAL SUMMARY ---
  useEffect(() => {
    if (analysisData?.assignments) {
      const zones = Object.entries(analysisData.assignments);
      if (zones.length === 0) return;

      const covered = zones.filter(([_, v]: any) => v?.status === 'in').length;
      const warning = zones.filter(([_, v]: any) => v?.status === 'warning').length;
      
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
    }
  }, [analysisData]);

  if (!isClient) return <div className="h-full w-full bg-slate-50 flex items-center justify-center">Loading Map Engine...</div>;

  const handleZoneClick = async (feature: any) => {
      const name = feature?.properties?.name;
      if (!name) return;
      if (selectedZone === name) { setSelectedZone(null); setRoutePaths([]); setZoneStats(null); return; }
      
      setSelectedZone(name);
      setIsFetchingRoute(true);

      const areaFactor = feature.properties?.area || 0.5; 
      setZoneStats({
          population: Math.floor(2500 * areaFactor + (Math.random() * 500)),
          businesses: Math.floor(40 * areaFactor + (Math.random() * 15)),
          density: Math.min(areaFactor / 2, 1)
      });

      const storeId = analysisData?.assignments?.[name]?.storeId;
      const targetStore = stores.find((s: any) => s.id === storeId) || stores[0];

      if (targetStore?.lat && targetStore?.lng && feature.properties?.centroid) {
          const storePt: [number, number] = [parseFloat(targetStore.lat), parseFloat(targetStore.lng)];
          const center = feature.properties.centroid;
          
          try {
            const url = `https://router.project-osrm.org/route/v1/driving/${storePt[1]},${storePt[0]};${center.lng},${center.lat}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.routes?.[0]) {
                const coords = data.routes[0].geometry.coordinates.map((p: number[]) => [p[1], p[0]]);
                setRoutePaths([{
                    positions: coords,
                    color: '#3b82f6',
                    label: 'Drive Path',
                    distanceKm: (data.routes[0].distance / 1000).toFixed(2),
                    durationMin: Math.round(data.routes[0].duration / 60)
                }]);
            }
          } catch (e) { console.error("Routing error:", e); }
      }
      setIsFetchingRoute(false);
  };

  return (
    <div className="flex h-full w-full gap-4 p-2 bg-slate-50 overflow-hidden">
      {/* --- 🗺️ MAP (70%) --- */}
      <div className="flex-[7] rounded-xl overflow-hidden border relative shadow-md bg-white">
        
        {/* HEATMAP CONTROLS */}
        <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur p-3 rounded-lg shadow-lg border border-slate-200 flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Flame className={`h-4 w-4 ${showHeatmap ? 'text-orange-500' : 'text-slate-400'}`} />
            <Switch id="heatmap-mode" checked={showHeatmap} onCheckedChange={setShowHeatmap} />
            <Label htmlFor="heatmap-mode" className="text-xs font-bold text-slate-700">Population Heatmap</Label>
          </div>
        </div>

        <MapContainer center={[36.19, 44.01]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <MapRecenter city={selectedCity} />
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          {/* 🔑 FIXED: Added Key based on city ID and heatmap state to force re-render */}
          {selectedCity?.polygons && (
            <GeoJSON 
                key={`${selectedCity.id}-${showHeatmap ? 'heat' : 'normal'}`} 
                data={selectedCity.polygons} 
                style={(f: any) => {
                    const zoneName = f?.properties?.name;
                    const data = analysisData?.assignments?.[zoneName];
                    const area = f?.properties?.area || 0.5;
                    
                    if (showHeatmap) return { color: 'white', weight: 0.5, fillColor: getHeatmapColor(area / 2), fillOpacity: 0.7 };
                    return { 
                        color: data?.storeColor || '#cbd5e1', 
                        weight: zoneName === selectedZone ? 4 : 1, 
                        fillColor: data?.fillColor || '#f1f5f9', 
                        fillOpacity: 0.6 
                    };
                }} 
                onEachFeature={(f, l) => l.on({ click: () => handleZoneClick(f) })} 
            />
          )}

          {!showHeatmap && routePaths.map((r, i) => (
            <Polyline key={i} positions={r.positions} pathOptions={{ color: r.color, weight: 4 }} />
          ))}

          {/* 📍 STORE MARKERS */}
          {stores?.map((s: any) => (
            s.lat && s.lng && (
              <CircleMarker key={s.id} center={[parseFloat(s.lat), parseFloat(s.lng)]} radius={8} pathOptions={{ color: 'white', weight: 2, fillColor: s.borderColor || '#2563eb', fillOpacity: 1 }}>
                <Popup><div className="font-bold text-xs">{s.name}</div></Popup>
              </CircleMarker>
            )
          ))}
        </MapContainer>
      </div>

      {/* --- 📊 INFO PANEL (30%) --- */}
      <div className="flex-[3] flex flex-col gap-4 overflow-y-auto pr-2">
        <Card className="border-t-4 border-t-purple-600 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-purple-700 font-bold"><BrainCircuit className="h-4 w-4" /> AI Market Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!aiInsights ? <p className="text-[10px] text-muted-foreground italic">Run coverage check to see summary.</p> : (
              <div className="space-y-2">
                <div className="bg-purple-600 p-3 rounded-lg text-white flex justify-between items-center shadow-inner">
                   <div className="flex flex-col">
                     <span className="text-[9px] font-bold uppercase opacity-80">Network Efficiency</span>
                     <span className="text-lg font-black">{aiInsights.efficiency}%</span>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 p-2 rounded border text-center">
                        <div className="text-[8px] font-bold text-slate-400 uppercase">Covered</div>
                        <div className="text-sm font-bold text-green-600">{aiInsights.covered}</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border text-center">
                        <div className="text-[8px] font-bold text-slate-400 uppercase">Warning</div>
                        <div className="text-sm font-bold text-amber-500">{aiInsights.warning}</div>
                    </div>
                </div>
                <div className="text-[10px] text-slate-500 bg-slate-100 p-2 rounded flex items-center gap-2">
                    <Navigation className="h-3 w-3" /> Furthest Zone: <strong className="text-slate-800">{aiInsights.furthestPolygon}</strong>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-blue-600 flex-1 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-blue-700 font-bold"><MapPin className="h-4 w-4" /> Zone Intelligence</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!selectedZone ? <div className="text-center py-10 italic text-[10px] text-slate-400">Select a polygon for AI deep-dive</div> : (
              <>
                <div className="text-lg font-black text-slate-800 tracking-tight leading-none">{selectedZone}</div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-slate-50 rounded border">
                      <span className="text-slate-400 font-bold uppercase block text-[8px]">Est. Population</span>
                      <div className="flex items-center gap-1 text-sm font-bold text-slate-700"><Users className="h-3 w-3 text-blue-500" /> {zoneStats?.population?.toLocaleString()}</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border">
                      <span className="text-slate-400 font-bold uppercase block text-[8px]">Businesses</span>
                      <div className="flex items-center gap-1 text-sm font-bold text-slate-700"><Building2 className="h-3 w-3 text-blue-500" /> {zoneStats?.businesses}</div>
                    </div>
                </div>
                
                {routePaths.map((r, i) => (
                    <div key={i} className="bg-white p-2 border rounded shadow-sm text-[11px] flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Delivery Window</span>
                        <span className="font-bold text-slate-700 flex items-center gap-1"><Clock className="h-3 w-3 text-blue-600" /> {r.durationMin} mins</span>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-bold text-slate-400 uppercase">Distance</div>
                        <div className="text-xs font-black text-slate-800">{r.distanceKm} km</div>
                      </div>
                    </div>
                ))}

                <div className="p-3 bg-amber-50 border border-amber-100 rounded text-[10px] text-amber-800 leading-relaxed italic">
                  <strong>AI Analysis:</strong> This sector is primarily {zoneStats?.population > 3000 ? 'High-Density Residential' : 'Moderate Commercial'}. Demand peaks are expected during {zoneStats?.population > 3000 ? 'evening' : 'mid-day'} hours.
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
