'use client';

import { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import * as turf from '@turf/turf';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, UploadCloud, Play, Map as MapIcon, ShoppingBasket, Clock, Info, FileSpreadsheet, AlertTriangle, Eye, Layers } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import L from 'leaflet';

// Dynamic Leaflet Components
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });
const Pane = dynamic(() => import('react-leaflet').then(m => m.Pane), { ssr: false });
const FeatureGroup = dynamic(() => import('react-leaflet').then(m => m.FeatureGroup), { ssr: false });

import 'leaflet/dist/leaflet.css';

// --- CONFIG ---
const OSRM_ENDPOINTS = {
  "Iraq": process.env.NEXT_PUBLIC_OSRM_ERBIL || "https://kareem99k-erbil-osrm-engine.hf.space",
  "Lebanon": process.env.NEXT_PUBLIC_OSRM_BEIRUT || "https://kareem99k-beirut-osrm-engine.hf.space"
};
const HF_TOKEN = process.env.NEXT_PUBLIC_HF_TOKEN;

// Distinct Colors for Stores (Post-Analysis)
const STORE_COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', 
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', 
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', 
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
];

// Zone Group Colors (Pre-Analysis)
const ZONE_GROUP_COLORS = [
    '#64748b', '#0ea5e9', '#8b5cf6', '#ec4899', '#f97316', '#84cc16'
];

const getBranchColor = (index: number) => STORE_COLORS[index % STORE_COLORS.length];
const getGroupColor = (index: number) => ZONE_GROUP_COLORS[index % ZONE_GROUP_COLORS.length];

// --- ICONS ---
const createStoreIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-store-icon',
        html: `<div style="background-color: ${color}; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 11 4-7"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8c.9 0 1.8-.7 2-1.6l1.7-7.4"/><path d="m9 11 1 9"/></svg>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
};

// --- HELPERS ---
const getGeoPoints = (polyFeature: any, storeCoords: {lat: number, lng: number}) => {
    const center = turf.centroid(polyFeature);
    const vertices = turf.explode(polyFeature).features;
    const storePt = turf.point([storeCoords.lng, storeCoords.lat]);
    let closestV = vertices[0], furthestV = vertices[0];
    let minD = Infinity, maxD = -Infinity;

    vertices.forEach(v => {
        const d = turf.distance(storePt, v);
        if (d < minD) { minD = d; closestV = v; }
        if (d > maxD) { maxD = d; furthestV = v; }
    });

    return [
        { lat: closestV.geometry.coordinates[1], lng: closestV.geometry.coordinates[0], type: 'closest', label: 'Closest Edge' },
        { lat: center.geometry.coordinates[1], lng: center.geometry.coordinates[0], type: 'centroid', label: 'Centroid' },
        { lat: furthestV.geometry.coordinates[1], lng: furthestV.geometry.coordinates[0], type: 'furthest', label: 'Furthest Edge' }
    ];
};

async function fetchRoute(start: {lat: number, lng: number}, end: {lat: number, lng: number}, endpoint: string) {
    if (!HF_TOKEN) return null;
    const url = `${endpoint}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HF_TOKEN}` } });
        if (!res.ok) return null;
        const data = await res.json();
        return data.routes?.[0] ? { dist: data.routes[0].distance / 1000, duration: data.routes[0].duration / 60, geom: data.routes[0].geometry.coordinates.map((c:any) => [c[1], c[0]]) } : null;
    } catch { return null; }
}

const REQUIRED_FIELDS = {
    stores: [
        { key: 'lat', label: 'Latitude', required: true },
        { key: 'lng', label: 'Longitude', required: true },
        { key: 'id', label: 'Store ID', required: false },
        { key: 'name', label: 'Store Name', required: false },
    ],
    polygons: [
        { key: 'wkt', label: 'WKT Geometry', required: true },
        { key: 'id', label: 'Polygon ID', required: false },
        { key: 'name', label: 'Polygon Name', required: false },
    ]
};

export default function DarkStoreAnalyzerPage() {
  const { toast } = useToast();
  
  // Data
  const [stores, setStores] = useState<any[]>([]);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, any>>({}); // Key: PolyID, Val: CoverageData
  
  // View Control
  const [filterStore, setFilterStore] = useState<string>("all"); // 'all' or StoreID
  const [analysisDone, setAnalysisDone] = useState(false);

  // Visuals
  const [visualRoutes, setVisualRoutes] = useState<any[]>([]);
  const [radiusCircles, setRadiusCircles] = useState<any[]>([]);
  
  // Settings
  const [region, setRegion] = useState("Iraq");
  const [distThreshold, setDistThreshold] = useState(5); // km
  const [timeThreshold, setTimeThreshold] = useState(15); // min
  const [useTime, setUseTime] = useState(false);
  const [showRadius, setShowRadius] = useState(false);
  
  // State
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // Wizard
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardFile, setWizardFile] = useState<File | null>(null);
  const [wizardType, setWizardType] = useState<'stores' | 'polygons'>('stores');
  const [wizardHeaders, setWizardHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  
  // 🟢 NEW: Zone Group Naming
  const [zoneGroupName, setZoneGroupName] = useState("");
  const [zoneGroupCount, setZoneGroupCount] = useState(0);

  // --- 1. UPLOAD LOGIC ---
  const handleFile = (file: File, type: 'stores' | 'polygons') => {
    setWizardFile(file);
    setWizardType(type);
    setZoneGroupName(type === 'polygons' ? `Zone Group ${zoneGroupCount + 1}` : "");
    
    Papa.parse(file, { header: true, preview: 1, complete: (res) => {
        setWizardHeaders(res.meta.fields || []);
        setColumnMapping({}); 
        setIsWizardOpen(true);
    }});
  };

  const confirmMapping = () => {
      if (!wizardFile) return;
      Papa.parse(wizardFile, {
          header: true, skipEmptyLines: true,
          complete: (results) => {
              const mapped = results.data.map((row: any, i) => {
                  const obj: any = {};
                  Object.entries(columnMapping).forEach(([key, col]) => {
                      if (col) obj[key] = key === 'lat' || key === 'lng' ? parseFloat(row[col]) : row[col];
                  });
                  if (!obj.id) obj.id = `${wizardType}_${i}_${Date.now()}`;
                  if (!obj.name) obj.name = obj.id;
                  return obj;
              }).filter((d: any) => wizardType === 'stores' ? (!isNaN(d.lat)) : (!!d.wkt));

              if (wizardType === 'stores') {
                  // Assign colors to stores immediately
                  const coloredStores = mapped.map((s, i) => ({ ...s, color: getBranchColor(stores.length + i) }));
                  setStores(prev => [...prev, ...coloredStores]);
              } else {
                  // 🟢 ZONE GROUP LOGIC
                  const groupColor = getGroupColor(zoneGroupCount);
                  const parsedPolys = mapped.map((p, i) => {
                      try {
                          const raw = p.wkt.replace(/^[A-Z]+\s*\(+/, '').replace(/\)+$/, '');
                          const pairs = raw.split(',').map((x: string) => {
                              const [lng, lat] = x.trim().split(/\s+/).map(Number);
                              return [lng, lat];
                          });
                          if (pairs[0][0] !== pairs[pairs.length-1][0]) pairs.push(pairs[0]);
                          const poly = turf.polygon([pairs]);
                          return { 
                              ...p, 
                              geometry: poly.geometry, 
                              feature: poly, 
                              groupName: zoneGroupName, // Save Group Name
                              initialColor: groupColor  // Save Group Color
                          };
                      } catch { return null; }
                  }).filter(Boolean);
                  
                  setPolygons(prev => [...prev, ...parsedPolys]); 
                  setZoneGroupCount(prev => prev + 1);
              }
              setIsWizardOpen(false);
              toast({ title: "Loaded", description: `Added ${mapped.length} items to ${zoneGroupName || 'Stores'}.` });
          }
      });
  };

  // --- 2. ANALYSIS ENGINE ---
  const runAnalysis = async () => {
      if (!stores.length || !polygons.length) return;
      setProcessing(true); setProgress(0); setResults({}); setAnalysisDone(false);
      
      const osrmUrl = OSRM_ENDPOINTS[region as keyof typeof OSRM_ENDPOINTS];
      const tempResults: Record<string, any> = {};
      const chunkSize = 20;

      const circles = stores.map(s => turf.circle([s.lng, s.lat], distThreshold, { units: 'kilometers', properties: { color: s.color } }));
      setRadiusCircles(circles);

      for (let i = 0; i < polygons.length; i += chunkSize) {
          const chunk = polygons.slice(i, i + chunkSize);
          await new Promise(r => setTimeout(r, 0)); 

          const storeCoords = stores.map(s => `${s.lng},${s.lat}`).join(';');
          const polyCoords = chunk.map((p: any) => {
              const c = turf.centroid(p.feature);
              return `${c.geometry.coordinates[0]},${c.geometry.coordinates[1]}`;
          }).join(';');

          const url = `${osrmUrl}/table/v1/driving/${storeCoords};${polyCoords}?sources=${stores.map((_,idx)=>idx).join(';')}&destinations=${chunk.map((_,idx)=>idx+stores.length).join(';')}&annotations=distance,duration`;
          
          try {
              const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HF_TOKEN}` } });
              const data = await res.json();

              if (data.code === 'Ok') {
                  chunk.forEach((poly: any, pIdx: number) => {
                      let bestStore: any = null;
                      let bestScore = -1; 

                      stores.forEach((store, sIdx) => {
                          const distM = data.distances[sIdx][pIdx]; 
                          const durS = data.durations[sIdx][pIdx]; 
                          
                          if (distM === null) return;

                          const distKm = distM / 1000;
                          const durMin = durS / 60;

                          if (distKm > distThreshold * 1.5) return;
                          if (useTime && durMin > timeThreshold * 1.5) return;

                          let score = 0;
                          const distPass = distKm <= distThreshold;
                          const timePass = !useTime || (durMin <= timeThreshold);

                          if (distPass && timePass) {
                              score = 3; 
                              if (distKm > distThreshold * 0.8) score = 2; 
                          }

                          if (score > bestScore) {
                              bestScore = score;
                              bestStore = { 
                                  store, 
                                  dist: distKm, 
                                  time: durMin,
                                  status: score >= 2 ? 'covered' : 'borderline'
                              };
                          } else if (score === bestScore && bestStore) {
                              if (distKm < bestStore.dist) {
                                  bestStore = { store, dist: distKm, time: durMin, status: bestStore.status };
                              }
                          }
                      });

                      if (bestStore) {
                          tempResults[poly.id] = bestStore;
                      } else {
                          tempResults[poly.id] = { status: 'dead', dist: 999 };
                      }
                  });
              }
          } catch (e) { console.error(e); }
          setProgress(Math.round(((i+chunkSize)/polygons.length)*100));
      }
      setResults(tempResults);
      setProcessing(false);
      setAnalysisDone(true);
  };

  const handlePolyClick = async (poly: any) => {
      const res = results[poly.id];
      if (!res || res.status === 'dead') return;

      const store = res.store;
      const pts = getGeoPoints(poly.feature, store);
      const routes = [];
      const osrmUrl = OSRM_ENDPOINTS[region as keyof typeof OSRM_ENDPOINTS];

      for (const pt of pts) {
          const r = await fetchRoute({lat: store.lat, lng: store.lng}, {lat: pt.lat, lng: pt.lng}, osrmUrl);
          if (r) routes.push({ ...pt, geom: r.geom, dist: r.dist, duration: r.duration });
      }
      setVisualRoutes(routes);
  };

  // --- 3. FILTER LOGIC ---
  const viewData = useMemo(() => {
      if (filterStore === 'all') return polygons;
      // Only return polygons assigned to the selected store
      return polygons.filter(p => {
          const res = results[p.id];
          return res && res.store && res.store.id === filterStore;
      });
  }, [polygons, results, filterStore]);

  return (
    <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
        {/* TOP BAR */}
        <div className="bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center shrink-0">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <ShoppingBasket className="h-6 w-6 text-purple-600"/> Dark Store Analyzer
                </h1>
                <p className="text-xs text-slate-500">Network planning & Dead zone detection</p>
            </div>
            
            <div className="flex items-center gap-4">
                {/* 🟢 STORE FILTER (Visible Only After Analysis) */}
                {analysisDone && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                        <Badge variant="outline" className="h-8 px-3 bg-purple-50 text-purple-700 border-purple-200">
                            <Eye className="h-3 w-3 mr-1"/> View Mode
                        </Badge>
                        <Select value={filterStore} onValueChange={setFilterStore}>
                            <SelectTrigger className="w-40 h-9 font-bold">
                                <SelectValue placeholder="All Stores" />
                            </SelectTrigger>
                            <SelectContent className="z-[9999]">
                                <SelectItem value="all">🌍 All Stores</SelectItem>
                                {stores.map(s => (
                                    <SelectItem key={s.id} value={s.id}>
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}></span>
                                            {s.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="h-8 w-px bg-slate-200 mx-2"></div>
                    </div>
                )}

                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="h-6 bg-slate-50">Region</Badge>
                        <Select value={region} onValueChange={setRegion}>
                            <SelectTrigger className="h-8 w-32"><SelectValue/></SelectTrigger>
                            <SelectContent className="z-[9999]">
                                <SelectItem value="Iraq">Iraq</SelectItem>
                                <SelectItem value="Lebanon">Lebanon</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border">
                            <span className="text-[10px] font-bold uppercase text-slate-400">Dist (km)</span>
                            <Input className="h-6 w-16 text-xs" type="number" value={distThreshold} onChange={e=>setDistThreshold(Number(e.target.value))}/>
                        </div>
                        {useTime && (
                            <div className="flex items-center gap-1 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                                <Clock className="h-3 w-3 text-purple-500"/>
                                <span className="text-[10px] font-bold uppercase text-purple-400">Time (min)</span>
                                <Input className="h-6 w-16 text-xs" type="number" value={timeThreshold} onChange={e=>setTimeThreshold(Number(e.target.value))}/>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-2">
                        <Switch id="time-mode" checked={useTime} onCheckedChange={setUseTime} />
                        <Label htmlFor="time-mode" className="text-xs">Time Limit</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch id="rad-mode" checked={showRadius} onCheckedChange={setShowRadius} />
                        <Label htmlFor="rad-mode" className="text-xs">Show Radius</Label>
                    </div>
                </div>

                <Button size="lg" onClick={runAnalysis} disabled={processing || !stores.length} className="bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200">
                    {processing ? <Loader2 className="animate-spin mr-2"/> : <Play className="mr-2 fill-current"/>}
                    {processing ? `${progress}%` : "Analyze Coverage"}
                </Button>
            </div>
        </div>

        {/* MAIN CONTENT GRID */}
        <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
            {/* LEFT: UPLOAD & STATS */}
            <div className="col-span-3 space-y-4 overflow-y-auto pr-1">
                <Card className="border-dashed border-2 bg-slate-50/50">
                    <CardHeader className="py-3"><CardTitle className="text-sm">1. Upload Stores</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">{stores.length} Loaded</span>
                            <Button variant="outline" size="sm" className="h-7 text-xs relative overflow-hidden">
                                <UploadCloud className="h-3 w-3 mr-1"/> Upload CSV
                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'stores')} />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-dashed border-2 bg-slate-50/50">
                    <CardHeader className="py-3"><CardTitle className="text-sm">2. Upload Zone Groups</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">{polygons.length} Total Polygons</span>
                            <Button variant="outline" size="sm" className="h-7 text-xs relative overflow-hidden">
                                <UploadCloud className="h-3 w-3 mr-1"/> Add Group
                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'polygons')} />
                            </Button>
                        </div>
                        {/* Zone Group Legend (Pre-Analysis) */}
                        {!analysisDone && zoneGroupCount > 0 && (
                            <div className="pt-2 border-t mt-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Active Groups</p>
                                <div className="flex flex-wrap gap-2">
                                    {Array.from({length: zoneGroupCount}).map((_, i) => (
                                        <Badge key={i} className="text-[10px]" style={{backgroundColor: getGroupColor(i)}}>
                                            Group {i+1}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* STATS SUMMARY */}
                {Object.keys(results).length > 0 && (
                    <Card className="bg-white shadow-md border-t-4 border-t-purple-500">
                        <CardHeader className="py-3 bg-purple-50/50 border-b border-purple-100">
                            <CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4 text-purple-600"/> Coverage Report</CardTitle>
                        </CardHeader>
                        <CardContent className="py-4 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-500 uppercase">Covered</span>
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-200">
                                    {Object.values(results).filter(r => r.status === 'covered' || r.status === 'borderline').length} Zones
                                </Badge>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-500 uppercase">Dead Zones</span>
                                <Badge variant="destructive">
                                    {Object.values(results).filter(r => r.status === 'dead').length} Zones
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* RIGHT: MAP */}
            <div className="col-span-9 h-full rounded-xl overflow-hidden border-2 border-slate-200 shadow-inner relative">
                <MapContainer center={[36.19, 44.01]} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    {/* Layer 1: Polygons */}
                    <Pane name="polygons" style={{ zIndex: 400 }}>
                        <FeatureGroup>
                            {viewData.map((p, i) => {
                                const res = results[p.id];
                                let fillColor = p.initialColor; // Default: Zone Group Color
                                let opacity = 0.5;

                                // 🟢 POST-ANALYSIS COLOR LOGIC
                                if (analysisDone && res) {
                                    if (res.status === 'dead') {
                                        fillColor = '#334155'; // Dead = Grey
                                        opacity = 0.8;
                                    } else {
                                        fillColor = res.store.color; // Covered = Store Color
                                        opacity = 0.6;
                                    }
                                }

                                return (
                                    <GeoJSON 
                                        key={`poly-${i}-${analysisDone}`} 
                                        data={p.geometry} 
                                        style={{ color: 'white', weight: 1, fillColor, fillOpacity: opacity }}
                                        onEachFeature={(f, l) => l.on('click', () => handlePolyClick(p))}
                                    >
                                        <Popup pane="popupPane">
                                            <div className="p-1 min-w-[200px]">
                                                <h4 className="font-bold">{p.name}</h4>
                                                <Badge variant="outline" className="text-[10px] mb-2">{p.groupName}</Badge>
                                                {res ? (
                                                    res.status === 'dead' ? (
                                                        <div className="flex items-center gap-2 text-red-600 font-bold text-xs"><AlertTriangle className="h-3 w-3"/> Dead Zone</div>
                                                    ) : (
                                                        <div className="bg-slate-50 p-2 rounded border" style={{borderLeft: `4px solid ${res.store.color}`}}>
                                                            <div className="text-[10px] uppercase font-bold text-slate-400">Assigned To</div>
                                                            <div className="font-bold text-slate-800">{res.store.name}</div>
                                                            <div className="flex gap-2 mt-1 text-xs">
                                                                <span className="bg-blue-100 text-blue-700 px-1 rounded">{res.dist.toFixed(2)} km</span>
                                                                {res.time && <span className="bg-purple-100 text-purple-700 px-1 rounded">{res.time.toFixed(1)} min</span>}
                                                            </div>
                                                        </div>
                                                    )
                                                ) : <span className="text-xs italic text-slate-400">Zone Group: {p.groupName}</span>}
                                            </div>
                                        </Popup>
                                    </GeoJSON>
                                );
                            })}
                        </FeatureGroup>
                    </Pane>

                    {/* Layer 2: Radius Circles */}
                    {showRadius && (
                        <Pane name="radius" style={{ zIndex: 420 }}>
                            {radiusCircles.map((c, i) => (
                                <GeoJSON key={`rad-${i}`} data={c} style={{ color: c.properties.color, weight: 1, fill: false, dashArray: '5, 5' }} />
                            ))}
                        </Pane>
                    )}

                    {/* Layer 3: Visual Routes */}
                    <Pane name="routes" style={{ zIndex: 450 }}>
                        {visualRoutes.map((r, i) => (
                            <Polyline 
                                key={`route-${i}`} 
                                positions={r.geom} 
                                color={r.type === 'closest' ? '#22c55e' : r.type === 'centroid' ? '#3b82f6' : '#ef4444'} 
                                weight={4} 
                                dashArray={r.type === 'centroid' ? '10, 10' : undefined}
                            >
                                <Tooltip sticky>{r.label}: {r.dist.toFixed(2)} km</Tooltip>
                            </Polyline>
                        ))}
                    </Pane>

                    {/* Layer 4: Stores */}
                    <Pane name="stores" style={{ zIndex: 500 }}>
                        {stores.map((s, i) => {
                            // Filter Stores if view mode is active
                            if (filterStore !== 'all' && s.id !== filterStore) return null;
                            
                            return (
                                <Marker key={`store-${i}`} position={[s.lat, s.lng]} icon={createStoreIcon(s.color)}>
                                    <Popup pane="popupPane">
                                        <strong>{s.name}</strong><br/>
                                        <span className="text-xs text-slate-500">{s.id}</span>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </Pane>
                </MapContainer>
            </div>
        </div>

        {/* WIZARD DIALOG (High Z-Index) */}
        <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
            <DialogContent className="z-[9999] bg-white/95 backdrop-blur">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-green-600"/> Map Columns</DialogTitle>
                    <DialogDescription>Match CSV headers for {wizardType}.</DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                    {/* 🟢 NEW: Zone Group Name Input */}
                    {wizardType === 'polygons' && (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-2">
                            <Label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Zone Group Name</Label>
                            <Input 
                                placeholder="e.g. North City, District 1..." 
                                value={zoneGroupName} 
                                onChange={e => setZoneGroupName(e.target.value)} 
                                className="bg-white"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">This name will help identify these zones on the map.</p>
                        </div>
                    )}

                    {REQUIRED_FIELDS[wizardType].map(f => (
                        <div key={f.key} className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-xs font-bold uppercase text-slate-500">{f.label}</Label>
                            <Select onValueChange={v => setColumnMapping(p => ({...p, [f.key]: v}))}>
                                <SelectTrigger className="col-span-3 h-8"><SelectValue placeholder="Select..."/></SelectTrigger>
                                <SelectContent className="z-[9999]">{wizardHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button onClick={confirmMapping} className="bg-green-600 hover:bg-green-700" disabled={wizardType === 'polygons' && !zoneGroupName}>Confirm Import</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}
