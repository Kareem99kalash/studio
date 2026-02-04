'use client';

import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route, Navigation, Ruler, BrainCircuit, Users, Building2, Clock, MapPin, Flame, Info, Loader2 } from 'lucide-react';
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

  // Guard against SSR
  useEffect(() => { setIsClient(true); }, []);

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
        efficiency: zones.length > 0 ? (((covered + warning) / zones.length) * 100).toFixed(1) : "0"
      });
    }
  }, [analysisData]);

  if (!isClient) return <div className="h-full w-full bg-slate-50 flex items-center justify-center">Initializing Map...</div>;

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

      // Find store safe check
      const storeId = analysisData?.assignments?.[name]?.storeId;
      const targetStore = stores.find((s: any) => s.id === storeId) || stores[0];

      if (targetStore && targetStore.lat && targetStore.lng && feature.properties?.centroid) {
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
      <div className="flex-[7] rounded-xl overflow-hidden border relative shadow-md bg-white">
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
          
          {selectedCity?.polygons?.features && (
            <GeoJSON data={selectedCity.polygons} style={(f: any) => {
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
            }} onEachFeature={(f, l) => l.on({ click: () => handleZoneClick(f) })} />
          )}

          {!showHeatmap && routePaths.map((r, i) => (
            <Polyline key={i} positions={r.positions} pathOptions={{ color: r.color, weight: 4 }} />
          ))}

          {stores?.map((s: any) => (
            s.lat && s.lng && (
              <CircleMarker key={s.id} center={[parseFloat(s.lat), parseFloat(s.lng)]} radius={8} pathOptions={{ color: 'white', weight: 2, fillColor: s.borderColor || '#2563eb', fillOpacity: 1 }}>
                <Popup><div className="font-bold text-xs">{s.name}</div></Popup>
              </CircleMarker>
            )
          ))}
        </MapContainer>
      </div>

      <div className="flex-[3] flex flex-col gap-4 overflow-y-auto pr-2">
        <Card className="border-t-4 border-t-purple-600 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-purple-600" /> Market Intelligence</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!aiInsights ? <p className="text-[10px] text-muted-foreground">Run analysis to see results...</p> : (
              <div className="space-y-2">
                <div className="bg-purple-600 p-3 rounded-lg text-white flex justify-between items-center">
                   <div className="flex flex-col"><span className="text-[9px] font-bold uppercase opacity-80">Network Efficiency</span><span className="text-lg font-black">{aiInsights.efficiency}%</span></div>
                </div>
                <div className="text-[10px] text-slate-500 italic">Furthest Coverage: <strong>{aiInsights.furthestPolygon}</strong></div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-blue-600 flex-1 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-600" /> Zone Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!selectedZone ? <p className="text-center py-10 text-[10px] opacity-40">Click a polygon for deep-dive</p> : (
              <>
                <div className="text-lg font-black text-slate-800 tracking-tight">{selectedZone}</div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-slate-50 rounded border text-[11px]">
                      <span className="text-slate-400 font-bold uppercase block text-[8px]">Population</span>
                      <Users className="inline h-3 w-3 mr-1 text-blue-500" /> {zoneStats?.population?.toLocaleString()}
                    </div>
                    <div className="p-2 bg-slate-50 rounded border text-[11px]">
                      <span className="text-slate-400 font-bold uppercase block text-[8px]">Businesses</span>
                      <Building2 className="inline h-3 w-3 mr-1 text-blue-500" /> {zoneStats?.businesses}
                    </div>
                </div>
                {routePaths.map((r, i) => (
                    <div key={i} className="bg-white p-2 border rounded shadow-sm text-[11px] flex justify-between items-center">
                      <span className="text-slate-500">Logistics</span>
                      <div className="text-right font-bold text-slate-700">{r.distanceKm} km <br/> <span className="text-blue-600 flex items-center gap-1 justify-end"><Clock className="h-2 w-2" /> {r.durationMin} min</span></div>
                    </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
