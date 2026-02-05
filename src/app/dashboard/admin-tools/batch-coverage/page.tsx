'use client';

import { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import * as turf from '@turf/turf';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, UploadCloud, Play, Map as MapIcon, Table as TableIcon, Edit, Sparkles, Search, Save } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// Dynamic Leaflet Components
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const FeatureGroup = dynamic(() => import('react-leaflet').then(m => m.FeatureGroup), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });

import 'leaflet/dist/leaflet.css';

const OSRM_ENDPOINTS = {
  "Iraq": process.env.NEXT_PUBLIC_OSRM_ERBIL || "https://kareem99k-erbil-osrm-engine.hf.space",
  "Lebanon": process.env.NEXT_PUBLIC_OSRM_BEIRUT || "https://kareem99k-beirut-osrm-engine.hf.space"
};

const HF_TOKEN = process.env.NEXT_PUBLIC_HF_TOKEN;

// --- 🎨 DISTINCT COLOR PALETTE ---
// High contrast colors to ensure branches are distinguishable
const DISTINCT_COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', 
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', 
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', 
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
];

const getBranchColor = (index: number) => {
    return DISTINCT_COLORS[index % DISTINCT_COLORS.length];
};

// --- ROUTING HELPER ---
async function fetchRouteGeometry(start: {lat: number, lng: number}, end: {lat: number, lng: number}, endpoint: string) {
    const url = `${endpoint}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HF_TOKEN}` } });
        const data = await res.json();
        if (data.code === 'Ok' && data.routes[0]) {
            return {
                dist: data.routes[0].distance / 1000,
                geom: data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]])
            };
        }
    } catch (e) { console.error(e); }
    return null;
}

export default function BatchCoveragePage() {
  const { toast } = useToast();
  
  // Data
  const [stores, setStores] = useState<any[]>([]);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [processedStores, setProcessedStores] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [manualOverrides, setManualOverrides] = useState<any[]>([]);
  
  // Settings
  const [region, setRegion] = useState("Iraq");
  const [threshold, setThreshold] = useState(5);
  const [useAiBalance, setUseAiBalance] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("map");

  // Visuals & Filters
  const [selectedParent, setSelectedParent] = useState<string>(""); 
  const [searchStore, setSearchStore] = useState("");
  const [reassignMode, setReassignMode] = useState(false);
  const [selectedPolyRoutes, setSelectedPolyRoutes] = useState<any>(null);

  // Temporary state for the popup dropdown
  const [pendingReassignStore, setPendingReassignStore] = useState<string>("");

  const handleFile = (file: File, type: 'stores' | 'polygons') => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        if (type === 'stores') setStores(res.data);
        else setPolygons(res.data);
        toast({ title: "File Loaded", description: `Loaded ${res.data.length} ${type}.` });
      }
    });
  };

  // --- ANALYSIS ENGINE ---
  const runAnalysis = async () => {
    if (!stores.length || !polygons.length) return;
    setProcessing(true); setProgress(0); setAssignments([]); setManualOverrides([]); 

    const osrmUrl = OSRM_ENDPOINTS[region as keyof typeof OSRM_ENDPOINTS];
    const initialResults: any[] = [];
    
    // 1. Prepare Data & Assign Colors
    // Group stores by Parent first to assign distinct indices
    const storesByParent: Record<string, any[]> = {};
    stores.forEach(s => {
        const pid = s.Parent_ID ? s.Parent_ID.trim() : (s.Store_ID ? s.Store_ID.trim() : `Unique-${Math.random()}`);
        if (!storesByParent[pid]) storesByParent[pid] = [];
        storesByParent[pid].push(s);
    });

    const validStores: any[] = [];
    Object.keys(storesByParent).forEach(pid => {
        storesByParent[pid].forEach((s, index) => {
            const pname = s.Parent_Name?.trim() || s.Store_Name?.trim() || "Unknown Parent";
            validStores.push({
                id: s.Store_ID?.trim() || "Unknown",
                name: s.Store_Name?.trim() || "Unknown Store",
                lat: parseFloat(s.Lat),
                lng: parseFloat(s.Lon),
                parentId: pid,
                parentName: pname,
                // Assign color based on its index within the parent group
                color: getBranchColor(index) 
            });
        });
    });
    const finalStores = validStores.filter(s => !isNaN(s.lat));
    setProcessedStores(finalStores);

    const validPolys = polygons.map((p, i) => {
        try {
            const wktStr = p.WKT || p.wkt || p.geometry;
            if (!wktStr) return null;
            const rawCoords = wktStr.replace(/^[A-Z]+\s*\(+/, '').replace(/\)+$/, '');
            const pairs = rawCoords.split(')')[0].split(',').map((pair: string) => {
                const parts = pair.trim().split(/\s+/);
                return [parseFloat(parts[0]), parseFloat(parts[1])];
            });
            if (pairs[0][0] !== pairs[pairs.length-1][0]) pairs.push(pairs[0]);
            const poly = turf.polygon([pairs]);
            const center = turf.centroid(poly);
            return {
                id: p.PolygonID || p.id || `P${i}`,
                name: p.PolygonName || p.name || `Zone ${i}`,
                center: { lat: center.geometry.coordinates[1], lng: center.geometry.coordinates[0] },
                geometry: poly.geometry
            };
        } catch { return null; }
    }).filter(p => p !== null);

    // 2. Batch Matrix Calc
    const chunkSize = 50;
    for (let i = 0; i < validPolys.length; i += chunkSize) {
        const chunk = validPolys.slice(i, i + chunkSize);
        
        const storeCoords = finalStores.map(s => `${s.lng.toFixed(5)},${s.lat.toFixed(5)}`).join(';');
        const polyCoords = chunk.map((p: any) => `${p.center.lng.toFixed(5)},${p.center.lat.toFixed(5)}`).join(';');
        
        const srcIndices = finalStores.map((_, idx) => idx).join(';');
        const dstIndices = chunk.map((_, idx) => idx + finalStores.length).join(';');
        const url = `${osrmUrl}/table/v1/driving/${storeCoords};${polyCoords}?sources=${srcIndices}&destinations=${dstIndices}&annotations=distance`;

        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HF_TOKEN}` } });
            const data = await res.json();

            if (data.code === 'Ok' && data.distances) {
                chunk.forEach((poly: any, pIdx: number) => {
                    const bestPerParent: Record<string, {store: any, dist: number}> = {};

                    finalStores.forEach((store, sIdx) => {
                        const dMeter = data.distances[sIdx][pIdx];
                        if (dMeter !== null) {
                            const dKm = dMeter / 1000;
                            if (dKm <= threshold) {
                                // Basic Logic: Closest branch wins for this Parent
                                if (!bestPerParent[store.parentId] || dKm < bestPerParent[store.parentId].dist) {
                                    bestPerParent[store.parentId] = { store, dist: dKm };
                                }
                            }
                        }
                    });

                    Object.values(bestPerParent).forEach(winner => {
                        initialResults.push({
                            PolygonID: poly.id,
                            PolygonName: poly.name,
                            StoreID: winner.store.id,
                            StoreName: winner.store.name,
                            ParentID: winner.store.parentId,
                            ParentName: winner.store.parentName,
                            DistanceKM: winner.dist, // Keep as number for sorting
                            Color: winner.store.color,
                            geometry: poly.geometry,
                            center: poly.center,
                            isAiOptimized: false
                        });
                    });
                });
            }
        } catch (e) { console.error(e); }
        setProgress(Math.round(((i + chunkSize) / validPolys.length) * 100));
    }

    // 3. AI FAIRNESS / LOAD BALANCING
    let finalAssignments = initialResults;
    if (useAiBalance) {
        // Group assignments by Parent
        const parentGroups: Record<string, any[]> = {};
        finalAssignments.forEach(a => {
            if (!parentGroups[a.ParentID]) parentGroups[a.ParentID] = [];
            parentGroups[a.ParentID].push(a);
        });

        // Optimize each parent company separately
        Object.keys(parentGroups).forEach(pid => {
            const companyAssignments = parentGroups[pid];
            const companyStores = finalStores.filter(s => s.parentId === pid);
            if (companyStores.length < 2) return; 

            const avgLoad = companyAssignments.length / companyStores.length;
            const overloadLimit = avgLoad * 1.3; 

            // Calculate loads
            const storeCounts: Record<string, number> = {};
            companyStores.forEach(s => storeCounts[s.id] = 0);
            companyAssignments.forEach(a => storeCounts[a.StoreID]++);

            const hoarders = companyStores.filter(s => storeCounts[s.id] > overloadLimit);
            const starving = companyStores.filter(s => storeCounts[s.id] < avgLoad);

            if (hoarders.length && starving.length) {
                companyAssignments.sort((a: any, b: any) => b.DistanceKM - a.DistanceKM);
                companyAssignments.forEach(assign => {
                    if (storeCounts[assign.StoreID] > overloadLimit) {
                        if (assign.DistanceKM > 3) {
                             const luckyWinner = starving[0]; 
                             if (luckyWinner) {
                                 assign.StoreID = luckyWinner.id;
                                 assign.StoreName = luckyWinner.name;
                                 assign.Color = luckyWinner.color; // Update color
                                 assign.isAiOptimized = true;
                                 storeCounts[luckyWinner.id]++;
                                 storeCounts[assign.StoreID]--;
                             }
                        }
                    }
                });
            }
        });
    }

    finalAssignments.forEach(a => a.DistanceKM = typeof a.DistanceKM === 'number' ? a.DistanceKM.toFixed(2) : a.DistanceKM);
    setAssignments(finalAssignments);
    setProcessing(false);
    
    if (finalAssignments.length > 0) setSelectedParent(finalAssignments[0].ParentID);
  };

  // --- MERGE LOGIC ---
  const activeAssignments = useMemo(() => {
      let combined = [...assignments];
      manualOverrides.forEach(ov => {
          combined = combined.filter(a => !(a.PolygonID === ov.PolygonID && a.ParentID === ov.ParentID));
          combined.push(ov);
      });
      return combined;
  }, [assignments, manualOverrides]);

  const uniqueParents = useMemo(() => Array.from(new Set(activeAssignments.map(a => a.ParentID))).sort(), [activeAssignments]);
  const parentNames = useMemo(() => {
      const map: Record<string, string> = {};
      activeAssignments.forEach(a => map[a.ParentID] = a.ParentName);
      return map;
  }, [activeAssignments]);

  const viewData = useMemo(() => {
      if (!selectedParent) return [];
      let data = activeAssignments.filter(a => a.ParentID === selectedParent);
      if (searchStore) data = data.filter(a => a.StoreName.toLowerCase().includes(searchStore.toLowerCase()));
      return data;
  }, [activeAssignments, selectedParent, searchStore]);

  const masterSummary = useMemo(() => {
      const groups: Record<string, string[]> = {};
      activeAssignments.forEach(a => {
          if (!groups[a.PolygonID]) groups[a.PolygonID] = [];
          if (!groups[a.PolygonID].includes(a.StoreID)) groups[a.PolygonID].push(a.StoreID);
      });
      return Object.entries(groups).map(([pid, sids]) => ({
          PolygonID: pid,
          StoreIDs: sids.join(',')
      }));
  }, [activeAssignments]);

  // --- VISUAL ACTIONS ---
  const handleMapClick = (assignment: any) => {
      if (reassignMode) return; 
      drawRoute(assignment);
  };

  const drawRoute = async (assignment: any) => {
      const store = processedStores.find(s => s.id === assignment.StoreID);
      if (!store) return;
      
      const osrmUrl = OSRM_ENDPOINTS[region as keyof typeof OSRM_ENDPOINTS];
      const routeData = await fetchRouteGeometry({lat: store.lat, lng: store.lng}, assignment.center, osrmUrl);
      if (routeData) setSelectedPolyRoutes({ assignment, route: routeData.geom });
  };

  // --- CONFIRMED REASSIGNMENT ---
  const executeReassign = (polyId: string, parentId: string, newStoreId: string) => {
      if (!newStoreId) return;

      const storeObj = processedStores.find(s => s.id === newStoreId);
      const polyObj = activeAssignments.find(a => a.PolygonID === polyId);
      
      if (!storeObj || !polyObj) return;

      const newEntry = {
          ...polyObj,
          StoreID: storeObj.id,
          StoreName: storeObj.name,
          DistanceKM: "Manual",
          Color: storeObj.color, // CRITICAL: Update Color
          isManual: true
      };
      
      setManualOverrides(prev => [
          ...prev.filter(x => !(x.PolygonID === polyId && x.ParentID === parentId)), 
          newEntry
      ]);
      
      setPendingReassignStore(""); // Reset dropdown
      toast({title: "Reassigned!", description: `Zone moved to ${storeObj.name}. Color updated.`});
  };

  return (
    <div className="space-y-6">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border space-y-4 md:space-y-0">
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <MapIcon className="h-6 w-6 text-purple-600"/> Coverage Commander
            </h1>
            <p className="text-slate-500 text-xs">Multi-parent logic • AI Load Balancing • Visual Reassignment</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
            <div className="w-24">
                <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Max KM</label>
                <Input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="h-9" />
            </div>
            <div className="w-32">
                 <label className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Engine</label>
                 <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                        <SelectItem value="Iraq">Iraq Engine</SelectItem>
                        <SelectItem value="Lebanon">Lebanon Engine</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center gap-2 border p-2 rounded bg-slate-50 h-9">
                <Switch checked={useAiBalance} onCheckedChange={setUseAiBalance} id="ai-mode" />
                <Label htmlFor="ai-mode" className="text-xs font-bold cursor-pointer flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-500" /> Smart Balance
                </Label>
            </div>
        </div>
      </div>

      {/* UPLOAD GRID */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-dashed border-2 hover:bg-slate-50 transition"><CardContent className="pt-6 text-center"><UploadCloud className="mx-auto h-8 w-8 text-blue-500 mb-2"/><h3 className="font-bold text-sm">Stores</h3><p className="text-[10px] text-slate-400 mb-2">Required: Store_ID, Lat, Lon, Parent_ID</p><input type="file" accept=".csv" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'stores')} className="text-xs ml-8"/></CardContent></Card>
        <Card className="border-dashed border-2 hover:bg-slate-50 transition"><CardContent className="pt-6 text-center"><UploadCloud className="mx-auto h-8 w-8 text-green-500 mb-2"/><h3 className="font-bold text-sm">Polygons</h3><p className="text-[10px] text-slate-400 mb-2">Required: PolygonID, WKT</p><input type="file" accept=".csv" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'polygons')} className="text-xs ml-8"/></CardContent></Card>
      </div>

      <Button onClick={runAnalysis} disabled={processing || !stores.length} className="w-full bg-purple-600 hover:bg-purple-700 h-12 text-lg shadow-lg shadow-purple-200">
        {processing ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2 fill-current" />} 
        {processing ? `Processing Matrix... ${progress}%` : "Run Intelligence Engine"}
      </Button>

      {/* RESULTS AREA */}
      {activeAssignments.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex justify-between items-center mb-3">
                <TabsList>
                    <TabsTrigger value="map"><MapIcon className="h-4 w-4 mr-2" /> Visual Map</TabsTrigger>
                    <TabsTrigger value="summary"><TableIcon className="h-4 w-4 mr-2" /> Master Summary</TabsTrigger>
                </TabsList>

                {activeTab === 'map' && (
                    <div className="flex gap-2">
                        <Select value={selectedParent} onValueChange={setSelectedParent}>
                            <SelectTrigger className="w-[200px] h-9 bg-white shadow-sm border-blue-200 z-[50]">
                                <SelectValue placeholder="Select Parent" />
                            </SelectTrigger>
                            <SelectContent className="z-[9999] max-h-[300px]">
                                {uniqueParents.map(p => (
                                    <SelectItem key={p} value={p}>{parentNames[p] || p}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                        <div className="relative">
                             <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                             <Input placeholder="Search Branch..." value={searchStore} onChange={e => setSearchStore(e.target.value)} className="w-40 h-9 pl-8" />
                        </div>

                        <Button 
                            variant={reassignMode ? "destructive" : "outline"} 
                            size="sm" 
                            onClick={() => { setReassignMode(!reassignMode); setSelectedPolyRoutes(null); setPendingReassignStore(""); }}
                            className="gap-2"
                        >
                            <Edit className="h-4 w-4" /> {reassignMode ? "Exit Reassign" : "Reassign Mode"}
                        </Button>
                    </div>
                )}
            </div>

            <TabsContent value="map" className="h-[650px] border-2 border-slate-200 rounded-xl overflow-hidden relative shadow-inner">
                {reassignMode && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-xl z-[999] font-bold text-sm animate-pulse flex items-center gap-2">
                        <Edit className="h-4 w-4" /> REASSIGN MODE: Select polygon to change
                    </div>
                )}

                <MapContainer center={[36.19, 44.01]} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    <FeatureGroup>
                        {viewData.map((a, i) => (
                            <GeoJSON 
                                key={`${a.PolygonID}-${a.StoreID}-${a.isManual ? 'manual' : 'auto'}`} 
                                data={a.geometry} 
                                style={{ 
                                    color: 'white', // Bright borders
                                    weight: 2, 
                                    fillColor: a.Color, 
                                    fillOpacity: reassignMode ? 0.7 : 0.6 
                                }} 
                                onEachFeature={(f, l) => {
                                    l.on('click', () => handleMapClick(a));
                                }}
                            >
                                <Popup>
                                    <div className="min-w-[200px] p-1">
                                        <div className="font-bold text-base mb-1">{a.PolygonName}</div>
                                        <div className="text-xs text-slate-500 mb-2">ID: {a.PolygonID}</div>
                                        
                                        {!reassignMode ? (
                                            <>
                                                <div className="bg-slate-100 p-2 rounded mb-2 border-l-4" style={{borderLeftColor: a.Color}}>
                                                    <div className="text-xs font-bold text-slate-400 uppercase">Assigned Branch</div>
                                                    <div className="font-bold text-slate-800">{a.StoreName}</div>
                                                    <div className="text-xs text-slate-500">{a.DistanceKM} km</div>
                                                </div>
                                                {a.isAiOptimized && <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] w-full justify-center">✨ AI Rebalanced</Badge>}
                                                {a.isManual && <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px] w-full justify-center">🔧 Manually Set</Badge>}
                                                <div className="text-[10px] text-center text-slate-400 mt-2">Click to view route</div>
                                            </>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="text-xs font-bold text-red-600 uppercase">Reassign Branch</div>
                                                <Select onValueChange={setPendingReassignStore}>
                                                    <SelectTrigger className="h-8 text-xs w-full"><SelectValue placeholder="Choose branch..." /></SelectTrigger>
                                                    <SelectContent className="z-[9999]">
                                                        {processedStores
                                                            .filter(s => s.parentId === selectedParent)
                                                            .sort((x, y) => x.name.localeCompare(y.name))
                                                            .map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)
                                                        }
                                                    </SelectContent>
                                                </Select>
                                                <Button 
                                                    size="sm" 
                                                    className="w-full bg-red-600 hover:bg-red-700 text-xs h-7"
                                                    disabled={!pendingReassignStore}
                                                    onClick={() => executeReassign(a.PolygonID, a.ParentID, pendingReassignStore)}
                                                >
                                                    <Save className="h-3 w-3 mr-1" /> Confirm Change
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </Popup>
                                <Tooltip sticky>{a.PolygonName}</Tooltip>
                            </GeoJSON>
                        ))}
                    </FeatureGroup>

                    {/* Route Line */}
                    {selectedPolyRoutes && !reassignMode && (
                        <Polyline positions={selectedPolyRoutes.route} color="black" weight={4} dashArray="10, 10" />
                    )}

                    {/* Store Markers - Rendered LAST to be on TOP */}
                    {processedStores.filter(s => s.parentId === selectedParent).map((s, i) => (
                        <CircleMarker 
                            key={`store-${i}`} 
                            center={[s.lat, s.lng]} 
                            radius={8}
                            pathOptions={{ color: 'white', weight: 3, fillColor: s.color, fillOpacity: 1 }}
                        >
                            <Popup>
                                <strong>{s.name}</strong><br/>
                                <span className="text-xs text-slate-500">{s.id}</span>
                            </Popup>
                        </CircleMarker>
                    ))}
                </MapContainer>
            </TabsContent>

            <TabsContent value="summary">
                <Card>
                    <CardHeader className="flex flex-row justify-between py-3">
                        <CardTitle>Master Assignment Summary</CardTitle>
                        <Button size="sm" variant="outline" onClick={() => {
                             const csv = Papa.unparse(masterSummary);
                             const blob = new Blob([csv], { type: 'text/csv' });
                             const link = document.createElement('a');
                             link.href = URL.createObjectURL(blob);
                             link.download = 'master_summary.csv';
                             link.click();
                        }}><Download className="h-4 w-4 mr-2"/> Download CSV</Button>
                    </CardHeader>
                    <CardContent className="h-[500px] overflow-auto">
                        <Table>
                            <TableHeader><TableRow><TableHead>Polygon ID</TableHead><TableHead>Assigned Branches</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {masterSummary.map((row, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-mono text-blue-600 font-bold">{row.PolygonID}</TableCell>
                                        <TableCell className="font-mono text-xs">{row.StoreIDs}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
