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
import { Loader2, UploadCloud, Play, ShoppingBasket, Clock, Info, FileSpreadsheet, AlertTriangle, Eye, EyeOff, Layers, Scale, Trash2, HelpCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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

const STORE_COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', 
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', 
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000'
];
const ZONE_GROUP_COLORS = ['#64748b', '#0ea5e9', '#8b5cf6', '#ec4899', '#f97316', '#84cc16'];

const getBranchColor = (index: number) => STORE_COLORS[index % STORE_COLORS.length];
const getGroupColor = (index: number) => ZONE_GROUP_COLORS[index % ZONE_GROUP_COLORS.length];

// --- ICONS ---
const createStoreIcon = (color: string, weight: number, isActive: boolean) => {
    // 🟢 VISUAL UPDATE: Gray out inactive stores
    const displayColor = isActive ? color : '#94a3b8'; 
    const opacity = isActive ? 1 : 0.6;
    const size = weight > 1.5 ? 40 : weight < 0.8 ? 24 : 32; 
    
    return L.divIcon({
        className: 'custom-store-icon',
        html: `<div style="background-color: ${displayColor}; opacity: ${opacity}; color: white; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                 <svg xmlns="http://www.w3.org/2000/svg" width="${size/2}" height="${size/2}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 11 4-7"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8c.9 0 1.8-.7 2-1.6l1.7-7.4"/><path d="m9 11 1 9"/></svg>
               </div>`,
        iconSize: [size, size],
        iconAnchor: [size/2, size],
        popupAnchor: [0, -size]
    });
};

// --- HELPERS ---
const parsePercentage = (value: any) => {
    if (!value) return 1; 
    const str = String(value).replace('%', '').trim();
    const num = parseFloat(str);
    if (isNaN(num)) return 1;
    if (String(value).includes('%')) return num / 100;
    return num; 
};

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
        { key: 'weight', label: 'Capacity / Weight %', required: false },
    ],
    polygons: [
        { key: 'wkt', label: 'WKT Geometry', required: true },
        { key: 'id', label: 'Polygon ID', required: false },
        { key: 'name', label: 'Polygon Name', required: false },
        { key: 'demand', label: 'Order Volume / Demand %', required: false },
    ]
};

export default function DarkStoreAnalyzerPage() {
  const { toast } = useToast();
  
  // Data
  const [stores, setStores] = useState<any[]>([]);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, any>>({}); 
  
  // View Control
  const [filterStore, setFilterStore] = useState<string>("all"); 
  const [analysisDone, setAnalysisDone] = useState(false);

  // Visuals
  const [visualRoutes, setVisualRoutes] = useState<any[]>([]);
  const [radiusCircles, setRadiusCircles] = useState<any[]>([]);
  
  // Settings
  const [region, setRegion] = useState("Iraq");
  const [distThreshold, setDistThreshold] = useState(5); 
  const [timeThreshold, setTimeThreshold] = useState(15); 
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
                  // Defaults
                  if (!obj.id) obj.id = `${wizardType}_${i}_${Date.now()}`;
                  if (!obj.name) obj.name = obj.id;
                  
                  // PARSE WEIGHTS
                  if (wizardType === 'stores') {
                      obj.weight = parsePercentage(obj.weight); 
                      obj.active = true; // 🟢 Default to active
                  }
                  if (wizardType === 'polygons') obj.demand = parsePercentage(obj.demand); 

                  return obj;
              }).filter((d: any) => wizardType === 'stores' ? (!isNaN(d.lat)) : (!!d.wkt));

              if (wizardType === 'stores') {
                  const coloredStores = mapped.map((s, i) => ({ ...s, color: getBranchColor(stores.length + i) }));
                  setStores(prev => [...prev, ...coloredStores]);
              } else {
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
                              groupName: zoneGroupName, 
                              initialColor: groupColor
                          };
                      } catch { return null; }
                  }).filter(Boolean);
                  
                  setPolygons(prev => [...prev, ...parsedPolys]); 
                  setZoneGroupCount(prev => prev + 1);
              }
              setIsWizardOpen(false);
              toast({ title: "Loaded", description: `Added ${mapped.length} items.` });
          }
      });
  };

  // 🟢 TOGGLE STORE ACTIVE STATE
  const toggleStoreActive = (storeId: string) => {
      setStores(prev => prev.map(s => s.id === storeId ? { ...s, active: !s.active } : s));
      // Optionally reset analysis if you want to force re-run
      // setAnalysisDone(false); 
  };

  // 🟢 DELETE STORE
  const deleteStore = (storeId: string) => {
      setStores(prev => prev.filter(s => s.id !== storeId));
  };

  // --- 2. WEIGHTED ANALYSIS ENGINE ---
  const runAnalysis = async () => {
      // 🟢 Filter out inactive stores before analysis
      const activeStores = stores.filter(s => s.active !== false);

      if (!activeStores.length || !polygons.length) {
          toast({ variant: "destructive", title: "Action Required", description: "Enable at least one store to analyze." });
          return;
      }

      setProcessing(true); setProgress(0); setResults({}); setAnalysisDone(false);
      
      const osrmUrl = OSRM_ENDPOINTS[region as keyof typeof OSRM_ENDPOINTS];
      const tempResults: Record<string, any> = {};
      const chunkSize = 20;

      // Radius circles based on threshold (Only for active stores)
      const circles = activeStores.map(s => turf.circle([s.lng, s.lat], distThreshold, { units: 'kilometers', properties: { color: s.color } }));
      setRadiusCircles(circles);

      for (let i = 0; i < polygons.length; i += chunkSize) {
          const chunk = polygons.slice(i, i + chunkSize);
          await new Promise(r => setTimeout(r, 0)); 

          const storeCoords = activeStores.map(s => `${s.lng},${s.lat}`).join(';');
          const polyCoords = chunk.map((p: any) => {
              const c = turf.centroid(p.feature);
              return `${c.geometry.coordinates[0]},${c.geometry.coordinates[1]}`;
          }).join(';');

          const url = `${osrmUrl}/table/v1/driving/${storeCoords};${polyCoords}?sources=${activeStores.map((_,idx)=>idx).join(';')}&destinations=${chunk.map((_,idx)=>idx+activeStores.length).join(';')}&annotations=distance,duration`;
          
          try {
              const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HF_TOKEN}` } });
              const data = await res.json();

              if (data.code === 'Ok') {
                  chunk.forEach((poly: any, pIdx: number) => {
                      let bestStore: any = null;
                      let bestScore = -Infinity; 

                      activeStores.forEach((store, sIdx) => {
                          const distM = data.distances[sIdx][pIdx]; 
                          const durS = data.durations[sIdx][pIdx]; 
                          
                          if (distM === null) return;

                          const distKm = distM / 1000;
                          const durMin = durS / 60;

                          // 1. HARD THRESHOLD CHECK (Actual Distance)
                          if (distKm > distThreshold * 1.5) return;
                          if (useTime && durMin > timeThreshold * 1.5) return;

                          // 2. WEIGHTED SCORING (Gravity Model)
                          const effectiveDist = distKm / (store.weight || 1);

                          const distPass = distKm <= distThreshold;
                          const timePass = !useTime || (durMin <= timeThreshold);

                          if (distPass && timePass) {
                              let score = 100 - effectiveDist; 
                              
                              if (score > bestScore) {
                                  bestScore = score;
                                  bestStore = { 
                                      store, 
                                      dist: distKm, 
                                      time: durMin,
                                      weightedDist: effectiveDist, 
                                      status: 'covered'
                                  };
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

  // --- 3. SUMMARY STATS (With Weights) ---
  const storeStats = useMemo(() => {
      const stats: Record<string, { count: number, demand: number, name: string, color: string, cap: number }> = {};
      
      // Init active stores
      stores.forEach(s => {
          if (s.active !== false) {
            stats[s.id] = { count: 0, demand: 0, name: s.name, color: s.color, cap: s.weight || 1 };
          }
      });

      // Aggregate
      Object.keys(results).forEach(polyId => {
          const res = results[polyId];
          const poly = polygons.find(p => p.id === polyId);
          if (res.status === 'covered' && res.store && poly && stats[res.store.id]) {
              stats[res.store.id].count += 1;
              stats[res.store.id].demand += (poly.demand || 1); 
          }
      });

      return Object.values(stats);
  }, [results, polygons, stores]);

  const viewData = useMemo(() => {
      if (filterStore === 'all') return polygons;
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
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ShoppingBasket className="h-6 w-6 text-purple-600"/> Dark Store Analyzer
                    </h1>
                    <Link href="/dashboard/documentation#darkstore-analyzer" className="text-slate-300 hover:text-primary transition-colors" title="View Documentation">
                        <HelpCircle className="h-5 w-5" />
                    </Link>
                </div>
                <p className="text-xs text-slate-500">Weighted Capacity & Order Volume Analysis</p>
            </div>
            
            <div className="flex items-center gap-4">
                {analysisDone && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                        <Badge variant="outline" className="h-8 px-3 bg-purple-50 text-purple-700 border-purple-200">
                            <Eye className="h-3 w-3 mr-1"/> View
                        </Badge>
                        <Select value={filterStore} onValueChange={setFilterStore}>
                            <SelectTrigger className="w-40 h-9 font-bold"><SelectValue placeholder="All Stores" /></SelectTrigger>
                            <SelectContent className="z-[9999]">
                                <SelectItem value="all">🌍 All Stores</SelectItem>
                                {stores.filter(s => s.active !== false).map(s => (
                                    <SelectItem key={s.id} value={s.id}><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}></span>{s.name}</span></SelectItem>
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
                    {processing ? `${progress}%` : "Analyze"}
                </Button>
            </div>
        </div>

        {/* CONTENT */}
        <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
            {/* LEFT SIDEBAR */}
            <div className="col-span-3 space-y-4 overflow-y-auto pr-1">
                {/* STORE MANAGEMENT CARD */}
                <Card className="border-dashed border-2 bg-slate-50/50">
                    <CardHeader className="py-3 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm">1. Manage Stores</CardTitle>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => document.getElementById('store-upload')?.click()}>
                            <UploadCloud className="h-4 w-4 text-purple-600"/>
                        </Button>
                        <input id="store-upload" type="file" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'stores')} />
                    </CardHeader>
                    <CardContent>
                        {stores.length === 0 ? (
                            <div className="text-center py-4 text-xs text-slate-400 italic">No stores uploaded yet.</div>
                        ) : (
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                {stores.map(store => (
                                    <div key={store.id} className={`flex items-center justify-between p-2 rounded-md bg-white border ${store.active === false ? 'opacity-50 border-slate-100' : 'border-slate-200 shadow-sm'}`}>
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: store.color }}></div>
                                            <div className="flex flex-col truncate">
                                                <span className={`text-xs font-bold truncate ${store.active === false ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{store.name}</span>
                                                <span className="text-[9px] text-slate-400">Cap: {store.weight || 1}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className={`h-6 w-6 p-0 hover:bg-slate-100 ${store.active === false ? 'text-slate-400' : 'text-purple-600'}`}
                                                onClick={() => toggleStoreActive(store.id)}
                                                title={store.active === false ? "Enable Store" : "Disable (Simulate Offline)"}
                                            >
                                                {store.active === false ? <EyeOff className="h-3 w-3"/> : <Eye className="h-3 w-3"/>}
                                            </Button>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-red-50 text-slate-300 hover:text-red-500" onClick={() => deleteStore(store.id)}>
                                                <Trash2 className="h-3 w-3"/>
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-dashed border-2 bg-slate-50/50">
                    <CardHeader className="py-3"><CardTitle className="text-sm">2. Upload Zones</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">{polygons.length} Total</span>
                            <Button variant="outline" size="sm" className="h-7 text-xs relative overflow-hidden">
                                <UploadCloud className="h-3 w-3 mr-1"/> Add Group
                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'polygons')} />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* STORE LOAD SUMMARY */}
                {analysisDone && (
                    <Card className="bg-white shadow-md border-t-4 border-t-blue-500">
                        <CardHeader className="py-3 bg-blue-50/50 border-b border-blue-100">
                            <CardTitle className="text-sm flex items-center gap-2"><Scale className="h-4 w-4 text-blue-600"/> Weighted Load Balance</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-hidden">
                            <div className="max-h-[300px] overflow-y-auto">
                                <table className="w-full text-[10px]">
                                    <thead className="bg-slate-50 border-b text-slate-500">
                                        <tr>
                                            <th className="p-2 text-left">Store</th>
                                            <th className="p-2 text-center">Zones</th>
                                            <th className="p-2 text-right">Traffic Load</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {storeStats.map((s: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="p-2 font-bold" style={{color: s.color}}>{s.name} <span className="text-slate-300 font-normal">({s.cap})</span></td>
                                                <td className="p-2 text-center">{s.count}</td>
                                                <td className="p-2 text-right font-mono font-bold text-slate-700">{s.demand.toFixed(1)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* RIGHT: MAP */}
            <div className="col-span-9 h-full rounded-xl overflow-hidden border-2 border-slate-200 shadow-inner relative">
                <MapContainer center={[36.19, 44.01]} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Pane name="polygons" style={{ zIndex: 400 }}>
                        <FeatureGroup>
                            {viewData.map((p, i) => {
                                const res = results[p.id];
                                let fillColor = p.initialColor;
                                let opacity = 0.5;

                                if (analysisDone && res) {
                                    if (res.status === 'dead') {
                                        fillColor = '#334155'; opacity = 0.8;
                                    } else {
                                        fillColor = res.store.color; opacity = 0.6;
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
                                                <div className="flex justify-between items-center mb-2">
                                                    <Badge variant="outline" className="text-[9px]">{p.groupName}</Badge>
                                                    {p.demand && <span className="text-[10px] text-green-600 font-bold">{p.demand}% Vol</span>}
                                                </div>
                                                {res ? (
                                                    res.status === 'dead' ? (
                                                        <div className="flex items-center gap-2 text-red-600 font-bold text-xs"><AlertTriangle className="h-3 w-3"/> Dead Zone</div>
                                                    ) : (
                                                        <div className="bg-slate-50 p-2 rounded border" style={{borderLeft: `4px solid ${res.store.color}`}}>
                                                            <div className="text-[10px] uppercase font-bold text-slate-400">Assigned To</div>
                                                            <div className="font-bold text-slate-800">{res.store.name}</div>
                                                            <div className="flex gap-2 mt-1 text-xs">
                                                                <span className="bg-blue-100 text-blue-700 px-1 rounded">{res.dist.toFixed(2)} km</span>
                                                                {res.store.weight && <span className="bg-orange-100 text-orange-700 px-1 rounded">Wt: {res.store.weight}</span>}
                                                            </div>
                                                        </div>
                                                    )
                                                ) : <span className="text-xs italic text-slate-400">Not analyzed</span>}
                                            </div>
                                        </Popup>
                                    </GeoJSON>
                                );
                            })}
                        </FeatureGroup>
                    </Pane>

                    {showRadius && (
                        <Pane name="radius" style={{ zIndex: 420 }}>
                            {radiusCircles.map((c, i) => (
                                <GeoJSON key={`rad-${i}`} data={c} style={{ color: c.properties.color, weight: 1, fill: false, dashArray: '5, 5' }} />
                            ))}
                        </Pane>
                    )}

                    <Pane name="routes" style={{ zIndex: 450 }}>
                        {visualRoutes.map((r, i) => (
                            <Polyline key={`route-${i}`} positions={r.geom} color={r.type === 'closest' ? '#22c55e' : r.type === 'centroid' ? '#3b82f6' : '#ef4444'} weight={4}>
                                <Tooltip sticky>{r.label}: {r.dist.toFixed(2)} km</Tooltip>
                            </Polyline>
                        ))}
                    </Pane>

                    <Pane name="stores" style={{ zIndex: 500 }}>
                        {stores.map((s, i) => {
                            if (filterStore !== 'all' && s.id !== filterStore) return null;
                            return (
                                <Marker 
                                    key={`store-${i}`} 
                                    position={[s.lat, s.lng]} 
                                    // 🟢 PASS ACTIVE STATUS TO ICON CREATOR
                                    icon={createStoreIcon(s.color, s.weight || 1, s.active !== false)}
                                >
                                    <Popup pane="popupPane">
                                        <strong>{s.name}</strong>
                                        {s.active === false && <span className="ml-2 text-red-500 font-bold text-xs">(OFFLINE)</span>}
                                        <br/>
                                        <span className="text-xs text-slate-500">Weight: {s.weight || 1}</span>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </Pane>
                </MapContainer>
            </div>
        </div>

        {/* WIZARD */}
        <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
            <DialogContent className="z-[9999] bg-white/95 backdrop-blur">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-green-600"/> Map Columns</DialogTitle>
                    <DialogDescription>Match CSV headers. Optional fields can be skipped.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {wizardType === 'polygons' && (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-2">
                            <Label className="text-xs font-bold uppercase text-slate-500 mb-1 block">Zone Group Name</Label>
                            <Input placeholder="e.g. North City" value={zoneGroupName} onChange={e => setZoneGroupName(e.target.value)} className="bg-white" />
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
