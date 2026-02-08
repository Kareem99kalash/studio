'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Map as MapIcon, Table as TableIcon, AlertTriangle, Download, Store, Activity, Radar, Zap, Settings2, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const MapView = dynamic(() => import('@/components/dashboard/map-view').then(m => m.MapView), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading Engine...</span>
    </div>
  )
});

// --- HELPERS ---
function getDistSq(lat1: number, lng1: number, lat2: number, lng2: number) { return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2; }
function getRoughDistKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [cities, setCities] = useState<any[]>([]);
  const [selectedCity, setSelectedCity] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [rules, setRules] = useState({ green: 2, yellow: 5 });

  useEffect(() => { fetchCities(); }, []);

  const fetchCities = async () => {
    try {
      localStorage.removeItem('geo_analysis_cache'); 
      const snap = await getDocs(collection(db, 'cities'));
      const cityList = snap.docs.map(d => {
          const data = d.data();
          let polygons = data.polygons;
          if (typeof polygons === 'string') {
              try { polygons = JSON.parse(polygons); } 
              catch (e) { console.error("Parse Error", e); polygons = null; }
          }
          return { id: d.id, ...data, polygons };
      });
      setCities(cityList);
      if (cityList.length > 0) handleCityChange(cityList[0].id, cityList);
    } catch (e) { 
      console.error("Fetch Error:", e);
      toast({ variant: "destructive", title: "Connection Error", description: "Failed to load cities from database." });
    } finally { 
      setLoading(false); 
    }
  };

  const handleCityChange = (cityId: string, cityList = cities) => {
    const city = cityList.find(c => c.id === cityId);
    if (city) {
        setSelectedCity(city);
        setStores([]); 
        setAnalysisData(null); 
        // Set default rules
        if (city.thresholds) {
            setRules({
                green: Number(city.thresholds.green) || 2,
                yellow: Number(city.thresholds.yellow) || 5
            });
        }
    }
  };

  const addStore = () => { 
      setStores([...stores, { 
          id: Date.now(), 
          name: `Hub ${stores.length + 1}`, 
          coordinates: '', 
          lat: '', 
          lng: '', 
          cityId: selectedCity?.id,
          category: 'default' // Default category
      }]); 
  };

  const updateStoreName = (id: number, name: string) => { setStores(stores.map(s => s.id === id ? { ...s, name } : s)); };
  
  const updateStoreCategory = (id: number, category: string) => {
      setStores(stores.map(s => s.id === id ? { ...s, category } : s));
  };

  const updateStoreCoordinates = (id: number, input: string) => {
    let lat = ''; let lng = ''; const parts = input.split(',');
    if (parts.length === 2) {
        const parsedLat = parseFloat(parts[0].trim()); const parsedLng = parseFloat(parts[1].trim());
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) { lat = parsedLat.toString(); lng = parsedLng.toString(); }
    }
    setStores(stores.map(s => s.id === id ? { ...s, coordinates: input, lat, lng } : s));
  };
  const removeStore = (id: number) => { setStores(stores.filter(s => s.id !== id)); };

  const getZoneKeyPoints = (store: any, feature: any) => {
      const center = feature.properties.centroid;
      const vertices = feature.geometry.coordinates[0].map((p: any) => ({ lat: p[1], lng: p[0] }));
      let close = vertices[0], far = vertices[0], minSq = Infinity, maxSq = -1;
      vertices.forEach((v: any) => {
          const d = getDistSq(store.lat, store.lng, v.lat, v.lng);
          if (d < minSq) { minSq = d; close = v; }
          if (d > maxSq) { maxSq = d; far = v; }
      });
      return { id: feature.properties.id || feature.properties.name, name: feature.properties.name, points: [close, center, far] };
  };

  const fetchMatrixBatch = async (store: any, allZonePoints: any[]) => {
      const chunkSize = 75; const results = new Array(allZonePoints.length).fill(null); const promises = [];
      for (let i = 0; i < allZonePoints.length; i += chunkSize) {
          const chunk = allZonePoints.slice(i, i + chunkSize);
          const coords = [`${store.lng},${store.lat}`, ...chunk.map((p: any) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`)].join(';');
          const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`;
          promises.push(
              fetch(url).then(res => res.json()).then(data => {
                  const distances = data.distances?.[0]?.slice(1);
                  if (distances) distances.forEach((d: number, idx: number) => { if (d !== null) results[i + idx] = d / 1000; });
              }).catch(e => console.error("OSRM Chunk Fail", e))
          );
      }
      await Promise.all(promises); return results;
  };

  const handleAnalyze = async () => {
    if (!selectedCity || stores.length === 0) return toast({ variant: "destructive", title: "Action Required", description: "Select a city and add at least one branch." });
    const validStores = stores.filter(s => !isNaN(parseFloat(s.lat)) && !isNaN(parseFloat(s.lng)));
    if (validStores.length === 0) return toast({ variant: "destructive", title: "Invalid Data", description: "Ensure all branches have valid Lat, Lng coordinates." });

    setAnalyzing(true);
    try {
        const finalAssignments: Record<string, any> = {};
        const features = selectedCity.polygons.features.filter((f: any) => f.properties?.centroid);
        
        const storePromises = validStores.map(async (store) => {
            const storeObj = { lat: parseFloat(store.lat), lng: parseFloat(store.lng) };
            
            // --- DETERMINE RULES FOR THIS STORE ---
            let activeRules = rules; // Default to city main rules
            if (store.category && store.category !== 'default' && selectedCity.subThresholds) {
                const customRule = selectedCity.subThresholds.find((r: any) => r.name === store.category);
                if (customRule) {
                    activeRules = { green: Number(customRule.green), yellow: Number(customRule.yellow) };
                }
            }

            const zoneMeta: any[] = [], flatPoints: any[] = [];
            features.forEach((f: any) => {
                const center = f.properties.centroid;
                const roughDist = getRoughDistKm(storeObj.lat, storeObj.lng, center.lat, center.lng);
                if (roughDist < 75) {
                    const kp = getZoneKeyPoints(storeObj, f); zoneMeta.push(kp); flatPoints.push(...kp.points); 
                } else { zoneMeta.push({ id: f.properties.id || f.properties.name, name: f.properties.name, tooFar: true }); }
            });
            
            let flatDistances: number[] = [];
            if (flatPoints.length > 0) flatDistances = await fetchMatrixBatch(storeObj, flatPoints);
            
            let pointIdx = 0;
            zoneMeta.forEach((z) => {
                let v1 = 999, v2 = 999, v3 = 999, voteV1 = 999, voteV2 = 999, voteV3 = 999; 
                if (!z.tooFar) {
                    const dClose = flatDistances[pointIdx], dCenter = flatDistances[pointIdx + 1], dFar = flatDistances[pointIdx + 2];
                    pointIdx += 3;
                    if (dCenter !== null) {
                        v1 = dClose ?? dCenter; v2 = dCenter; v3 = dFar ?? dCenter;
                        if (v2 > (v1 * 3) && v1 > 0.5) v2 = (v1 + v3) / 2;
                        voteV1 = v1; voteV2 = v2; voteV3 = v3;
                        if (v2 < (v1 - 2)) voteV1 = v2; 
                    }
                }
                const points = [voteV1, voteV2, voteV3];
                let greenCount = 0, yellowCount = 0;
                
                // USE ACTIVE RULES HERE
                points.forEach(dist => { if (dist <= activeRules.green) greenCount++; else if (dist <= activeRules.yellow) yellowCount++; });
                
                let status = 'out', color = '#ef4444';
                if (greenCount >= 2) { status = 'in'; color = '#22c55e'; } else if ((greenCount + yellowCount) >= 2) { status = 'warning'; color = '#eab308'; }
                
                const avgDist = parseFloat(((voteV1 + voteV2 + voteV3) / 3).toFixed(2));
                const currentWinner = finalAssignments[z.id];
                let isWinner = false;
                if (!currentWinner) isWinner = true;
                else {
                    const score = (s: string) => s === 'in' ? 3 : s === 'warning' ? 2 : 1;
                    if (score(status) > score(currentWinner.status)) isWinner = true;
                    else if (score(status) === score(currentWinner.status) && avgDist < parseFloat(currentWinner.distance)) isWinner = true;
                }
                if (isWinner) {
                    finalAssignments[z.id] = {
                        name: z.name, id: z.id, status, fillColor: color, storeColor: '#ffffff',
                        storeId: store.id, storeName: store.name, distance: avgDist.toFixed(2),
                        raw: { close: v1.toFixed(1), center: v2.toFixed(1), far: v3.toFixed(1) }
                    };
                }
            });
        });
        await Promise.all(storePromises);
        setAnalysisData({ timestamp: Date.now(), assignments: finalAssignments });
        toast({ title: "Analysis Success", description: "Coverage maps updated with category rules." });
    } catch (e) { toast({ variant: "destructive", title: "Error", description: "Analysis failed due to a network or OSRM timeout." }); } finally { setAnalyzing(false); }
  };

  const downloadCSV = () => {
      if (!analysisData?.assignments) return;
      const rows = [['Zone ID', 'Zone Name', 'Assigned Hub', 'Avg Dist (KM)', 'Status']];
      Object.values(analysisData.assignments).forEach((a: any) => rows.push([a.id, a.name, a.storeName, a.distance, a.status.toUpperCase()]));
      const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csvContent));
      link.setAttribute("download", `coverage_${selectedCity.name}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (loading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-white gap-4">
        <Loader2 className="animate-spin h-10 w-10 text-indigo-600" />
        <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-xs animate-pulse">Loading Environment...</p>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden font-sans">
      
      {/* HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-40 relative">
        <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-2 rounded-lg shadow-md shadow-indigo-100">
                <Radar className="text-white h-5 w-5" />
            </div>
            <div>
                <h1 className="font-black text-lg tracking-tight text-slate-800 leading-none">COMMAND CENTER</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Spatial Intelligence Unit</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
           {analyzing && (
               <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                   <Loader2 className="h-3 w-3 animate-spin" />
                   <span className="text-[10px] font-black uppercase tracking-wider">Processing Grid</span>
               </div>
           )}
           {analysisData && !analyzing && (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1.5 py-1.5 pl-1.5 pr-3 shadow-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider">System Online</span>
                </Badge>
           )}
        </div>
      </header>

      {/* MAIN CONTAINER - FLUSH (No padding/gaps) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* SIDEBAR - CONNECTED TO LEFT */}
        <div className="w-[380px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-hidden z-20">
            {/* Sidebar Header */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-white/50 backdrop-blur-sm">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 className="h-3 w-3" /> Configuration
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-8 scrollbar-hide">
                
                {/* 1. Region Selector */}
                <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                        <MapIcon className="h-3.5 w-3.5 text-indigo-500" /> Target Region
                    </Label>
                    <div className="relative">
                        <Select onValueChange={(val) => handleCityChange(val)} value={selectedCity?.id}>
                            <SelectTrigger className="h-11 border-slate-200 bg-white hover:border-indigo-300 transition-all text-sm font-bold shadow-sm focus:ring-indigo-500">
                                <SelectValue placeholder="Select Territory" />
                            </SelectTrigger>
                            <SelectContent>
                                {cities.map(c => <SelectItem key={c.id} value={c.id} className="font-medium text-xs">{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {selectedCity && (
                            <div className="absolute top-1/2 -translate-y-1/2 right-9 pointer-events-none">
                                <Badge variant="secondary" className="text-[9px] bg-slate-100 text-slate-500 font-mono">ID: {selectedCity.id.slice(0,4)}</Badge>
                            </div>
                        )}
                    </div>
                </div>

                <Separator className="bg-slate-200" />

                {/* 2. SLA Config */}
                <div className="space-y-4">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-indigo-500" /> SLA Thresholds (Default)
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm flex flex-col items-center gap-1">
                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">Optimal</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-emerald-600 tracking-tighter">{rules.green}</span>
                                <span className="text-xs font-bold text-emerald-400">km</span>
                            </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-amber-100 shadow-sm flex flex-col items-center gap-1">
                            <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider">Warning</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-amber-500 tracking-tighter">{rules.yellow}</span>
                                <span className="text-xs font-bold text-amber-400">km</span>
                            </div>
                        </div>
                    </div>
                </div>

                <Separator className="bg-slate-200" />

                {/* 3. Hubs */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                            <Store className="h-3.5 w-3.5 text-indigo-500" /> Logistics Nodes
                        </Label>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={addStore} 
                            className="h-7 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 rounded-md uppercase tracking-wide"
                        >
                            <Plus className="h-3 w-3 mr-1.5" /> Add Node
                        </Button>
                    </div>
                    
                    <div className="space-y-3 min-h-[100px]">
                        {stores.length === 0 && (
                            <div className="h-24 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-50/50">
                                <Search className="h-5 w-5 opacity-20" />
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">No Active Nodes</span>
                            </div>
                        )}
                        {stores.map((store, idx) => (
                            <div key={store.id} className="relative group bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:border-indigo-300 transition-all duration-200">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2 w-full">
                                            <div className="h-5 w-5 rounded bg-slate-100 flex items-center justify-center text-slate-500 text-[10px] font-black shrink-0">
                                                {idx + 1}
                                            </div>
                                            <Input 
                                                className="h-6 p-0 border-none shadow-none text-xs font-bold text-slate-700 focus-visible:ring-0 placeholder:text-slate-300 w-full" 
                                                value={store.name} 
                                                onChange={e => updateStoreName(store.id, e.target.value)}
                                                placeholder="Node Name"
                                            />
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-5 w-5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded -mr-1" 
                                            onClick={() => removeStore(store.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    
                                    {/* COORDINATES */}
                                    <div className="bg-slate-50 rounded px-2 py-1 flex items-center gap-2 border border-slate-100">
                                        <code className="text-[9px] text-slate-400 font-bold uppercase tracking-wider shrink-0">LOC:</code>
                                        <Input 
                                            className="h-4 p-0 bg-transparent border-none shadow-none text-[10px] font-mono text-slate-600 focus-visible:ring-0 w-full" 
                                            value={store.coordinates} 
                                            onChange={e => updateStoreCoordinates(store.id, e.target.value)}
                                            placeholder="LAT, LNG" 
                                        />
                                    </div>

                                    {/* CATEGORY SELECTOR - ONLY IF SUB-RULES EXIST */}
                                    {selectedCity?.subThresholds && selectedCity.subThresholds.length > 0 && (
                                        <div className="pt-2 border-t border-slate-50 mt-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase">Rule:</span>
                                                <Select value={store.category || 'default'} onValueChange={(val) => updateStoreCategory(store.id, val)}>
                                                    <SelectTrigger className="h-6 w-full text-[10px] border-slate-200 bg-slate-50">
                                                        <SelectValue placeholder="Default" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="default">City Default</SelectItem>
                                                        {selectedCity.subThresholds.map((r: any, i: number) => (
                                                            <SelectItem key={i} value={r.name}>{r.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="p-5 border-t border-slate-200 bg-white">
                <Button 
                    className="w-full h-12 rounded-lg bg-slate-900 text-white font-black uppercase tracking-widest text-xs hover:bg-slate-800 shadow-md active:scale-[0.99] transition-all disabled:opacity-70 disabled:cursor-not-allowed group"
                    onClick={handleAnalyze} 
                    disabled={analyzing || !selectedCity}
                >
                    <div className="flex items-center gap-3">
                        {analyzing ? <Loader2 className="animate-spin h-4 w-4 text-indigo-400" /> : <Zap className="h-4 w-4 text-yellow-400 group-hover:scale-110 transition-transform" />}
                        <span>{analyzing ? "Processing Grid..." : "Initiate Analysis"}</span>
                    </div>
                </Button>
            </div>
        </div>

        {/* MAIN CONTENT AREA - FLUSH RIGHT */}
        <div className="flex-1 bg-slate-100 overflow-hidden flex flex-col relative z-10">
            {!selectedCity ? (
                <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50/50 gap-4">
                    <div className="h-24 w-24 bg-slate-200 rounded-full flex items-center justify-center">
                        <MapIcon className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="font-black uppercase tracking-[0.2em] text-xs text-slate-400">Awaiting Regional Selection</p>
                </div>
            ) : (
                <Tabs defaultValue="map" className="h-full flex flex-col">
                    <div className="h-12 border-b border-slate-200 flex items-center justify-between px-6 bg-white shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Active View:</span>
                            <TabsList className="bg-slate-100 p-1 h-8 rounded-lg">
                                <TabsTrigger value="map" className="rounded-md text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-4 h-6 transition-all">
                                    <MapIcon className="h-3 w-3 mr-2" /> Geo-Map
                                </TabsTrigger>
                                <TabsTrigger value="table" className="rounded-md text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-4 h-6 transition-all">
                                    <TableIcon className="h-3 w-3 mr-2" /> Data Grid
                                </TabsTrigger>
                            </TabsList>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{selectedCity.name} Dataset</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 relative bg-slate-50">
                        <TabsContent value="map" className="absolute inset-0 m-0 p-0 h-full w-full">
                             {selectedCity.polygons ? (
                                <MapView 
                                    key={selectedCity.id} 
                                    selectedCity={selectedCity} 
                                    stores={stores} 
                                    analysisData={analysisData} 
                                    isLoading={analyzing} 
                                />
                            ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 p-10">
                                    <AlertTriangle className="h-12 w-12 mb-4 text-amber-500/50" />
                                    <p className="font-black text-slate-600 uppercase tracking-widest">Geodata Unavailable</p>
                                    <p className="text-xs text-slate-400 mt-2">Please upload Polygon data in admin settings.</p>
                                </div>
                            )}
                        </TabsContent>
                        
                        <TabsContent value="table" className="absolute inset-0 m-0 p-0 overflow-auto">
                            <div className="p-8 max-w-5xl mx-auto">
                                <Card className="border-none shadow-sm rounded-xl overflow-hidden">
                                    <div className="p-6 border-b border-slate-100 bg-white flex justify-between items-center sticky top-0 z-10">
                                        <div>
                                            <h3 className="font-black text-lg text-slate-800 uppercase tracking-tight">Assignment Matrix</h3>
                                            <p className="text-[11px] text-slate-400 font-bold uppercase mt-1">Optimization Results • {new Date().toLocaleDateString()}</p>
                                        </div>
                                        {analysisData?.assignments && (
                                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 rounded-lg shadow-md shadow-indigo-100" onClick={downloadCSV}>
                                                <Download className="h-4 w-4 mr-2" /> Export CSV
                                            </Button>
                                        )}
                                    </div>
                                    <div className="bg-white min-h-[400px]">
                                        {analysisData?.assignments ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10">Zone Identifier</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10">Assigned Node</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10">Distance (Avg)</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10 text-right">Coverage Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Object.values(analysisData.assignments).map((row: any, i) => (
                                                        <TableRow key={i} className="hover:bg-indigo-50/10 transition-colors border-slate-50">
                                                            <TableCell className="font-bold text-xs text-slate-700">{row.name}</TableCell>
                                                            <TableCell>
                                                                <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] font-bold border-none uppercase tracking-wide">
                                                                    {row.storeName}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-xs font-mono font-bold text-slate-500">{row.distance} km</TableCell>
                                                            <TableCell className="text-right">
                                                              <Badge className={`${
                                                                row.status === 'in' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 
                                                                row.status === 'warning' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' : 
                                                                'bg-rose-100 text-rose-700 hover:bg-rose-100'
                                                              } text-[9px] font-black border-none shadow-none uppercase tracking-wider px-2`}>
                                                                        {row.status}
                                                              </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                                                <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
                                                    <Activity className="h-8 w-8 text-slate-300" />
                                                </div>
                                                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No Analysis Data Available</p>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            )}
        </div>
      </div>
    </div>
  );
}
