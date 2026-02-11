'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polyline, useMap, Pane, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route, BrainCircuit, Clock, Info, CheckCircle2, RefreshCw, Loader2, MapPin, AlertCircle, Layers, Zap, Eye, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// --- SVG PATTERN DEFINITIONS (Background Styling) ---
const PATTERN_TEMPLATES = {
  dots: (color: string) => <circle cx="5" cy="5" r="2" fill={color} opacity="0.8"/>,
  stripes_diag_right: (color: string) => <path d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke={color} strokeWidth="2" opacity="0.8"/>,
  stripes_vert: (color: string) => <path d="M5,0 l0,10" stroke={color} strokeWidth="2" opacity="0.8"/>,
  crosshatch: (color: string) => <path d="M0,0 l10,10 M10,0 l-10,10" stroke={color} strokeWidth="2" opacity="0.8"/>,
  stripes_diag_left: (color: string) => <path d="M-1,9 l2,2 M0,0 l10,10 M9,-1 l2,2" stroke={color} strokeWidth="2" opacity="0.8"/>,
  stripes_horiz: (color: string) => <path d="M0,5 l10,0" stroke={color} strokeWidth="2" opacity="0.8"/>,
};
const PATTERN_KEYS = Object.keys(PATTERN_TEMPLATES);

// --- MATH UTILS ---
function getDistSq(lat1: number, lng1: number, lat2: number, lng2: number) {
    return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2;
}

// 🟢 NEW: Calculate Bearing for Bike Rotation
function getBearing(startLat: number, startLng: number, destLat: number, destLng: number) {
  const startLatRad = startLat * (Math.PI / 180);
  const startLngRad = startLng * (Math.PI / 180);
  const destLatRad = destLat * (Math.PI / 180);
  const destLngRad = destLng * (Math.PI / 180);

  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
            Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
            
  const brng = Math.atan2(y, x);
  return (brng * 180 / Math.PI + 360) % 360; // Degrees
}

// 🟢 NEW: 3D-Style Bike Icon Generator
const createBikeIcon = (rotation: number, color: string) => {
    return L.divIcon({
        className: 'bike-icon-container',
        html: `
          <div style="transform: rotate(${rotation}deg); transition: transform 0.1s linear;">
             <div style="
                background: white; 
                border-radius: 50%; 
                padding: 2px; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                border: 2px solid ${color};
                width: 24px; height: 24px; 
                display: flex; align-items: center; justify-content: center;
             ">
                <div style="font-size: 14px;">🏍️</div>
             </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12], // Center pivot
    });
};

// --- HELPER: BEZIER CURVE GENERATOR ---
function getCurvedPath(start: [number, number], end: [number, number]) {
  const lat1 = start[0], lng1 = start[1];
  const lat2 = end[0], lng2 = end[1];
  
  const offsetX = (lng2 - lng1) * 0.2;
  const offsetY = (lat2 - lat1) * 0.2;
  
  const midLat = (lat1 + lat2) / 2 - offsetX; 
  const midLng = (lng1 + lng2) / 2 + offsetY;

  const points = [];
  for (let t = 0; t <= 1; t += 0.02) { // 50 steps for smoother animation
    const lat = (1-t)*(1-t)*lat1 + 2*(1-t)*t*midLat + t*t*lat2;
    const lng = (1-t)*(1-t)*lng1 + 2*(1-t)*t*midLng + t*t*lng2;
    points.push([lat, lng] as [number, number]);
  }
  return points;
}

function MapController({ city, resetTrigger }: { city?: any, resetTrigger: number }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize(); 
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

// 🟢 UPDATED: GOD VIEW LAYER WITH BIKES & TARGETING
function GodViewLayer({ assignments, stores, targetZone }: { assignments: any, stores: any[], targetZone: any }) {
  const [agents, setAgents] = useState<any[]>([]);
  const requestRef = useRef<number>();

  useEffect(() => {
    // Spawn 20 Bikes
    const newAgents = Array.from({ length: 20 }).map((_, i) => {
        let store: any;
        let destLat: number, destLng: number;

        if (targetZone && assignments?.[targetZone.id]?.storeId) {
            // CASE A: User clicked a polygon -> Bikes go FROM Assigned Hub TO Polygon
            const assignment = assignments[targetZone.id];
            store = stores.find(s => s.id === assignment.storeId);
            if (!store) return null; // Should not happen if data is consistent

            // Random destination point vaguely near the polygon center to simulate spreading out
            // We use the polygon centroid from the clicked feature (passed via targetZone)
            // If centroid missing, fallback to near store (unlikely)
            const center = targetZone.centroid || { lat: parseFloat(store.lat) + 0.01, lng: parseFloat(store.lng) + 0.01 };
            
            // Add noise so they don't all land on one pixel
            destLat = center.lat + (Math.random() - 0.5) * 0.01;
            destLng = center.lng + (Math.random() - 0.5) * 0.01;

        } else {
            // CASE B: Global View (Random Traffic)
            store = stores[Math.floor(Math.random() * stores.length)];
            if (!store) return null;
            
            // Simulate random destination nearby
            destLat = parseFloat(store.lat) + (Math.random() - 0.5) * 0.08;
            destLng = parseFloat(store.lng) + (Math.random() - 0.5) * 0.08;
        }
        
        const path = getCurvedPath([parseFloat(store.lat), parseFloat(store.lng)], [destLat, destLng]);
        
        return {
            id: i,
            path,
            step: Math.floor(Math.random() * path.length), // Random start pos on path
            color: store.category === 'Express' ? '#facc15' : '#60a5fa'
        };
    }).filter(Boolean);

    setAgents(newAgents);
  }, [stores, assignments, targetZone]); // Re-run when targetZone changes!

  useEffect(() => {
    const animate = () => {
        setAgents(prev => prev.map(agent => {
            let nextStep = agent.step + 1;
            if (nextStep >= agent.path.length) nextStep = 0; // Loop the route
            return { ...agent, step: nextStep };
        }));
        requestRef.current = requestAnimationFrame(() => setTimeout(animate, 50)); 
    };
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, []);

  return (
    <>
      {agents.map((agent) => {
          const pos = agent.path[agent.step];
          if (!pos) return null;

          // Calculate rotation based on Next point vs Current Point
          const nextPos = agent.path[agent.step + 1] || agent.path[0];
          const bearing = getBearing(pos[0], pos[1], nextPos[0], nextPos[1]);

          return (
            <Marker 
                key={agent.id} 
                position={pos} 
                icon={createBikeIcon(bearing, agent.color)}
                zIndexOffset={1000} // Keep bikes on top
            />
          );
      })}
    </>
  );
}

export function MapView({ selectedCity, stores = [], analysisData, isLoading }: any) {
  const [selectedZoneData, setSelectedZoneData] = useState<{id: string, name: string, centroid?: any} | null>(null);
  const [routePaths, setRoutePaths] = useState<any[]>([]); 
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  
  const [mapMode, setMapMode] = useState<'standard' | 'dark'>('standard');
  const [godView, setGodView] = useState(false);

  const usePatterns = stores.length > 1;

  useEffect(() => { setIsClient(true); }, []);

  // --- PATTERN GENERATOR ---
  const { storePatternMap, patternDefs } = useMemo(() => {
    if (!analysisData?.assignments || !usePatterns) return { storePatternMap: {}, patternDefs: [] };

    const storeIds = Array.from(new Set(Object.values(analysisData.assignments).map((a: any) => a.storeId))).filter(id => id);
    const map: Record<string, string> = {};
    const defs: JSX.Element[] = [];

    storeIds.forEach((storeId, index) => {
      const patternKey = PATTERN_KEYS[index % PATTERN_KEYS.length];
      map[storeId as string] = patternKey;

      ['#22c55e', '#eab308', '#ef4444', '#94a3b8', '#3b82f6'].forEach(color => {
        const patternId = `pattern-${storeId}-${color.replace('#', '')}`;
        defs.push(
          <pattern key={patternId} id={patternId} patternUnits="userSpaceOnUse" width="10" height="10">
            {PATTERN_TEMPLATES[patternKey as keyof typeof PATTERN_TEMPLATES](color)}
          </pattern>
        );
      });
    });

    return { storePatternMap: map, patternDefs: defs };
  }, [analysisData, usePatterns]);

  // --- MARKET INTELLIGENCE ---
  const aiInsights = useMemo(() => {
    if (!analysisData?.assignments) return null;
    const zones = Object.entries(analysisData.assignments);
    const total = zones.length;
    if (total === 0) return null;

    const covered = zones.filter(([_, v]: any) => v?.status === 'in').length;
    const warning = zones.filter(([_, v]: any) => v?.status === 'warning').length;
    
    return {
      total,
      covered,
      warning,
      efficiency: (((covered + warning) / total) * 100).toFixed(1),
    };
  }, [analysisData]);

  const handleReset = () => {
    setSelectedZoneData(null);
    setRoutePaths([]);
    setResetTrigger(prev => prev + 1);
  };

  if (!isClient) return <div className="h-full w-full bg-slate-50 flex items-center justify-center font-bold">Initializing Map...</div>;

  const fetchRoutePath = async (start: [number, number], end: [number, number], color: string, label: string) => {
    if (!start || !end || isNaN(start[0]) || isNaN(end[0])) return { success: false, color, label, errorMsg: "Invalid Coords" };

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); 
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            if (data.routes?.[0]) {
                return {
                    success: true,
                    positions: data.routes[0].geometry.coordinates.map((p: number[]) => [p[1], p[0]]),
                    color, label,
                    distanceKm: (data.routes[0].distance / 1000).toFixed(2),
                    durationMin: Math.round(data.routes[0].duration / 60)
                };
            }
        }
    } catch (e) { console.error("Routing Error:", e); }
    return { success: false, color, label, errorMsg: "Network Error" };
  };

  const handleZoneClick = async (feature: any) => {
      const id = feature?.properties?.id;
      const name = feature?.properties?.name;
      const centroid = feature?.properties?.centroid; // Capture centroid for God View
      const uniqueKey = id || name;
      
      if (!uniqueKey) return;
      
      // Update Selection State
      setSelectedZoneData({ id: id || 'N/A', name: name || 'Unnamed', centroid });
      
      // Only fetch formal routes if God View is OFF (to avoid clutter)
      if (!godView) {
          setIsFetchingRoute(true);
          setRoutePaths([]); 

          const assignment = analysisData?.assignments?.[uniqueKey];
          let assignedStore = null;
          if (assignment?.storeId) {
              assignedStore = stores.find((s: any) => s.id === assignment.storeId);
          }

          if (!assignedStore || !centroid) {
              setIsFetchingRoute(false);
              return;
          }

          const storePt: [number, number] = [parseFloat(assignedStore.lat), parseFloat(assignedStore.lng)];
          const vertices = feature.geometry.coordinates[0].map((p: any) => [p[1], p[0]] as [number, number]);
          let closestVertex = vertices[0], furthestVertex = vertices[0];
          let minVD = Infinity, maxVD = -1;

          vertices.forEach((v: [number, number]) => {
              const d = getDistSq(v[0], v[1], storePt[0], storePt[1]);
              if (d < minVD) { minVD = d; closestVertex = v; }
              if (d > maxVD) { maxVD = d; furthestVertex = v; }
          });

          const promises = [
              fetchRoutePath(storePt, closestVertex, '#9333ea', 'Closest (Entrance)'),
              fetchRoutePath(storePt, [centroid.lat, centroid.lng], '#3b82f6', 'Middle (Center)'),
              fetchRoutePath(storePt, furthestVertex, '#ef4444', 'Furthest Reach')
          ];

          const results = await Promise.all(promises);
          setRoutePaths(results);
          setIsFetchingRoute(false);
      }
  };

  return (
    <div className="flex h-full w-full gap-4 p-2 bg-slate-50 overflow-hidden">
      
      {usePatterns && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>{patternDefs}</defs>
        </svg>
      )}

      {/* MAP */}
      <div className="flex-[7] rounded-xl overflow-hidden border relative shadow-md bg-white">
        
        {/* TOP CONTROLS */}
        <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2">
           <Button variant="secondary" size="sm" className="h-8 bg-white/90 shadow-sm font-bold text-[10px]" onClick={handleReset}>
              <RefreshCw className="h-3 w-3 mr-1" /> Reset View
           </Button>
           {isFetchingRoute && <div className="bg-white/90 p-1 px-2 rounded-md shadow flex items-center gap-2 text-[10px] font-bold text-blue-600"><Loader2 className="h-3 w-3 animate-spin" /> Calculating...</div>}
        </div>

        {/* FLOATING MAP MODES */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 items-end">
             <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-1 flex">
                <Button size="sm" variant="ghost" className={`h-8 px-3 text-xs ${mapMode === 'standard' ? 'bg-slate-100 font-bold' : 'text-slate-500'}`} onClick={() => setMapMode('standard')}>
                    <Layers className="h-3 w-3 mr-1" /> Standard
                </Button>
                <Button size="sm" variant="ghost" className={`h-8 px-3 text-xs ${mapMode === 'dark' ? 'bg-slate-900 text-white font-bold' : 'text-slate-500'}`} onClick={() => setMapMode('dark')}>
                    <Eye className="h-3 w-3 mr-1" /> Dark
                </Button>
             </div>
             
             {analysisData?.assignments && (
                 <Button 
                    className={`shadow-lg transition-all duration-300 h-8 text-xs font-bold uppercase tracking-wider ${godView ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                    onClick={() => {
                        setGodView(!godView);
                        if (!godView) setRoutePaths([]); // Clear static routes when entering God Mode
                    }}
                 >
                    {godView ? <Zap className="h-3 w-3 mr-2 fill-yellow-400 text-yellow-400 animate-pulse" /> : <Navigation className="h-3 w-3 mr-2" />}
                    {godView ? 'God Mode Active' : 'Enable God View'}
                 </Button>
             )}
        </div>

        {/* Legend */}
        {usePatterns && Object.keys(storePatternMap).length > 0 && (
            <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 p-2 rounded-lg shadow-md border space-y-1 max-h-[200px] overflow-y-auto">
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 mb-1">
                    <Layers className="h-3 w-3" /> Branch Patterns
                </div>
                {stores.map((store: any) => {
                    const patternKey = storePatternMap[store.id];
                    if (!patternKey) return null;
                    const patternUrl = `url(#pattern-${store.id}-94a3b8)`; 
                    return (
                        <div key={store.id} className="flex items-center gap-2 text-[10px]">
                            <div className="h-3 w-3 rounded-sm border border-slate-300" style={{ background: patternUrl }}></div>
                            <span className="truncate max-w-[100px]">{store.name}</span>
                        </div>
                    );
                })}
            </div>
        )}

        <MapContainer 
            key={`${selectedCity?.id}-${resetTrigger}-${analysisData?.timestamp || '0'}-${mapMode}`} 
            center={[36.19, 44.01]} 
            zoom={12} 
            style={{ height: '100%', width: '100%' }}
        >
          <MapController city={selectedCity} resetTrigger={resetTrigger} />
          <TileLayer 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url={mapMode === 'dark' 
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            }
          />
          
          {/* 🟢 GOD VIEW LAYER */}
          {godView && analysisData?.assignments && (
              <GodViewLayer 
                assignments={analysisData.assignments} 
                stores={stores} 
                targetZone={selectedZoneData} // Pass the selected zone so bikes can target it
              />
          )}

          {selectedCity?.polygons && (
            <GeoJSON 
                key={`${selectedCity.id}-geojson-${analysisData?.timestamp || 'init'}`} 
                data={selectedCity.polygons} 
                style={(f: any) => {
                    const key = f.properties.id || f.properties.name;
                    const data = analysisData?.assignments?.[key];
                    const isSelected = (f.properties.id === selectedZoneData?.id && f.properties.name === selectedZoneData?.name);
                    
                    const statusColor = data?.fillColor || (mapMode === 'dark' ? '#1e293b' : '#f1f5f9');
                    let fillColor = statusColor;
                    let fillOpacity = mapMode === 'dark' ? 0.4 : 0.6;

                    if (usePatterns && data?.storeId && storePatternMap[data.storeId]) {
                        const colorKey = statusColor.replace('#', '');
                        fillColor = `url(#pattern-${data.storeId}-${colorKey})`;
                        fillOpacity = 1; 
                    }

                    return { 
                        color: isSelected ? '#3b82f6' : (mapMode === 'dark' ? '#334155' : 'white'), 
                        weight: isSelected ? 4 : (mapMode === 'dark' ? 0.5 : 2), 
                        fillColor: fillColor, 
                        fillOpacity: fillOpacity 
                    };
                }} 
                onEachFeature={(f, l) => l.on({ click: () => handleZoneClick(f) })}
            />
          )}

          {/* Regular Route Lines (Only if God View is OFF) */}
          {!godView && routePaths.map((r, i) => r.success && (
            <Polyline key={i} positions={r.positions} pathOptions={{ color: r.color, weight: 4, opacity: 0.8 }} />
          ))}

          {stores?.map((s: any) => {
            const lat = parseFloat(s.lat);
            const lng = parseFloat(s.lng);
            if (isNaN(lat) || isNaN(lng)) return null;
            return (
              <CircleMarker key={s.id} center={[lat, lng]} radius={8} pathOptions={{ color: 'white', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
                <Popup><div className="font-bold text-xs p-1">{s.name}</div></Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* SIDEBAR */}
      <div className="flex-[3] flex flex-col gap-4 overflow-y-auto pr-2">
        <Card className="border-t-4 border-t-purple-600 shadow-sm bg-purple-50/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-purple-700 font-bold"><BrainCircuit className="h-4 w-4" /> Market Intelligence</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!aiInsights ? <p className="text-[10px] text-muted-foreground italic">Press "Run Assignment Analysis" to see data.</p> : (
              <>
                <div className="bg-purple-600 p-3 rounded-lg text-white flex justify-between items-center shadow-lg">
                   <div className="flex flex-col"><span className="text-[9px] font-bold uppercase opacity-80">Network Efficiency</span><span className="text-xl font-black">{aiInsights.efficiency}%</span></div>
                   <CheckCircle2 className="h-6 w-6 opacity-40" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2 rounded border border-purple-100 text-center shadow-sm"><div className="text-[8px] font-bold text-slate-400 uppercase">Covered</div><div className="text-sm font-bold text-green-600">{aiInsights.covered} Zones</div></div>
                    <div className="bg-white p-2 rounded border border-purple-100 text-center shadow-sm"><div className="text-[8px] font-bold text-slate-400 uppercase">Warning</div><div className="text-sm font-bold text-amber-500">{aiInsights.warning} Zones</div></div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-blue-600 flex-1 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-blue-700 font-bold"><Route className="h-4 w-4" /> Logistics Insights</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!selectedZoneData ? (
                <div className="text-center py-10 opacity-30 italic text-xs"><Info className="h-8 w-8 mx-auto mb-2" />Select a polygon to view routes.</div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-600" /><span className="text-sm font-bold text-slate-800 truncate">{selectedZoneData.name}</span></div>
                    <div className="flex items-center gap-2 pl-6"><Badge variant="outline" className="text-[10px] bg-white border-blue-200 text-slate-500 font-mono">ID: {selectedZoneData.id}</Badge></div>
                </div>

                <div className="space-y-2">
                  {/* Show standard routing data only if God Mode is OFF */}
                  {!godView && routePaths.map((r, i) => (
                    <div key={i} className={`p-2.5 border rounded-lg shadow-sm flex justify-between items-center ${r.success ? 'bg-white border-slate-100' : 'bg-red-50 border-red-100'}`}>
                      {r.success ? (
                        <>
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                <div className="h-2 w-2 rounded-full shadow-sm" style={{backgroundColor: r.color}} /> {r.label}
                                </span>
                                <span className="font-bold text-slate-700 text-xs flex items-center gap-1 mt-0.5">
                                <Clock className="h-3 w-3 text-blue-500" /> {r.durationMin} mins
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-[8px] font-bold text-slate-300 uppercase">Road Dist.</span>
                                <div className="text-sm font-black text-slate-800">{r.distanceKm} km</div>
                            </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 w-full text-red-600">
                             <AlertCircle className="h-4 w-4 shrink-0" />
                             <div className="flex flex-col w-full">
                                <span className="text-[10px] font-bold uppercase" style={{color: r.color}}>{r.label}</span>
                                <span className="text-[10px] font-semibold">Route Failed</span>
                             </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {godView && (
                      <div className="text-center py-4 bg-purple-50 rounded-lg border border-purple-100 animate-in fade-in">
                          <Zap className="h-6 w-6 text-purple-600 mx-auto mb-2 animate-pulse" />
                          <p className="text-xs font-bold text-purple-800">Simulating Live Fleet Traffic...</p>
                          <p className="text-[10px] text-purple-500 mt-1">Watch the map for real-time delivery agents.</p>
                      </div>
                  )}

                  {isFetchingRoute && <div className="text-center text-xs text-slate-400 italic py-4">Calculating...</div>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
