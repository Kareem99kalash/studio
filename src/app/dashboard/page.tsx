'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Map as MapIcon, Table as TableIcon, AlertTriangle, Download, Info, ShieldCheck, Store } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// Dynamic import with SSR disabled is crucial for Leaflet
const MapView = dynamic(() => import('@/components/dashboard/map-view').then(m => m.MapView), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-50 animate-pulse flex items-center justify-center text-slate-400 font-bold">Loading Map Engine...</div>
});

// --- HELPERS ---
function getDistSq(lat1: number, lng1: number, lat2: number, lng2: number) {
    return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2;
}

function getRoughDistKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
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
        setAnalysisData(null); // Clear old analysis to prevent map crashes
        if (city.thresholds) {
            setRules({
                green: Number(city.thresholds.green) || 2,
                yellow: Number(city.thresholds.yellow) || 5
            });
        }
    }
  };

  const addStore = () => {
    setStores([...stores, { id: Date.now(), name: `Branch ${stores.length + 1}`, coordinates: '', lat: '', lng: '', cityId: selectedCity?.id }]);
  };

  const updateStoreName = (id: number, name: string) => {
    setStores(stores.map(s => s.id === id ? { ...s, name } : s));
  };

  const updateStoreCoordinates = (id: number, input: string) => {
    let lat = '';
    let lng = '';
    const parts = input.split(',');
    if (parts.length === 2) {
        const parsedLat = parseFloat(parts[0].trim());
        const parsedLng = parseFloat(parts[1].trim());
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
            lat = parsedLat.toString();
            lng = parsedLng.toString();
        }
    }
    setStores(stores.map(s => s.id === id ? { ...s, coordinates: input, lat, lng } : s));
  };

  const removeStore = (id: number) => {
    setStores(stores.filter(s => s.id !== id));
  };

  // --- OSRM BATCHING & ANALYSIS LOGIC ---
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
      const chunkSize = 75; 
      const results = new Array(allZonePoints.length).fill(null);
      const promises = [];
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
      await Promise.all(promises);
      return results;
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
            const zoneMeta: any[] = [], flatPoints: any[] = [];

            features.forEach((f: any) => {
                const center = f.properties.centroid;
                const roughDist = getRoughDistKm(storeObj.lat, storeObj.lng, center.lat, center.lng);
                if (roughDist < 75) {
                    const kp = getZoneKeyPoints(storeObj, f);
                    zoneMeta.push(kp);
                    flatPoints.push(...kp.points); 
                } else {
                    zoneMeta.push({ id: f.properties.id || f.properties.name, name: f.properties.name, tooFar: true });
                }
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
                points.forEach(dist => {
                    if (dist <= rules.green) greenCount++;
                    else if (dist <= rules.yellow) yellowCount++;
                });

                let status = 'out', color = '#ef4444';
                if (greenCount >= 2) { status = 'in'; color = '#22c55e'; }
                else if ((greenCount + yellowCount) >= 2) { status = 'warning'; color = '#eab308'; }

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
        toast({ title: "Analysis Success", description: "Coverage maps updated." });
    } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "Analysis failed due to a network or OSRM timeout." });
    } finally {
        setAnalyzing(false);
    }
  };

  const downloadCSV = () => {
      if (!analysisData?.assignments) return;
      const rows = [['Zone ID', 'Zone Name', 'Assigned Branch', 'Avg Dist (KM)', 'Status']];
      Object.values(analysisData.assignments).forEach((a: any) => rows.push([a.id, a.name, a.storeName, a.distance, a.status.toUpperCase()]));
      const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csvContent));
      link.setAttribute("download", `coverage_${selectedCity.name}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin h-10 w-10 text-purple-600" /></div>;

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <header className="h-16 border-b bg-white flex items-center px-6 justify-between shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-2">
            <div className="bg-purple-600 p-2 rounded-lg shadow-inner"><MapIcon className="text-white h-5 w-5" /></div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">Coverage Command Center</h1>
        </div>
        <div className="flex items-center gap-4">
           {analysisData && <Badge variant="secondary" className="bg-green-50 text-green-700 animate-in fade-in duration-500">Live Analysis Active</Badge>}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR */}
        <div className="w-96 bg-white border-r flex flex-col shrink-0 overflow-y-auto z-20 shadow-xl scrollbar-hide">
            <div className="p-6 space-y-8">
                <div className="space-y-3">
                    <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Regional Focus</Label>
                    <Select onValueChange={(val) => handleCityChange(val)} value={selectedCity?.id}>
                        <SelectTrigger className="h-12 border-slate-200 text-lg font-bold"><SelectValue placeholder="Select Area" /></SelectTrigger>
                        <SelectContent>{cities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <ShieldCheck className="h-4 w-4 text-purple-600" /> SLA Thresholds
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-xl border border-green-100 flex flex-col items-center shadow-sm">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Green</span>
                            <span className="text-xl font-black text-green-600 tracking-tighter">&lt;{rules.green}km</span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-yellow-100 flex flex-col items-center shadow-sm">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Yellow</span>
                            <span className="text-xl font-black text-yellow-500 tracking-tighter">&lt;{rules.yellow}km</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Logistics Hubs</Label>
                        <Button variant="outline" size="sm" onClick={addStore} className="h-7 text-[10px] font-bold border-purple-200 text-purple-600 hover:bg-purple-50 uppercase"><Plus className="h-3 w-3 mr-1" /> Add Hub</Button>
                    </div>
                    <div className="space-y-3">
                        {stores.length === 0 && <div className="text-center py-10 border-2 border-dashed rounded-2xl text-slate-300 text-xs font-bold uppercase tracking-widest">No hubs defined.</div>}
                        {stores.map((store) => (
                            <Card key={store.id} className="relative group border-l-4 border-l-purple-500 shadow-sm overflow-hidden animate-in slide-in-from-left duration-300">
                                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeStore(store.id)}><Trash2 className="h-3 w-3" /></Button>
                                <CardContent className="p-3 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Store className="h-4 w-4 text-purple-400" />
                                        <Input placeholder="Hub Identifier" className="h-8 text-sm font-bold border-none shadow-none px-0 focus-visible:ring-0" value={store.name} onChange={e => updateStoreName(store.id, e.target.value)} />
                                    </div>
                                    <div className="bg-slate-50 p-2 rounded-lg">
                                        <Input placeholder="Lat, Lng (Coordinates)" className="h-6 text-[10px] bg-transparent border-none shadow-none font-mono focus-visible:ring-0 px-0" value={store.coordinates} onChange={e => updateStoreCoordinates(store.id, e.target.value)} />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                <Button className="w-full h-14 text-lg font-black bg-purple-600 hover:bg-purple-700 shadow-xl shadow-purple-100 active:scale-[0.98] transition-all" onClick={handleAnalyze} disabled={analyzing || !selectedCity}>
                    {analyzing ? <Loader2 className="animate-spin mr-2" /> : "Initiate Analysis"}
                </Button>
            </div>
        </div>

        {/* MAIN VIEW */}
        <div className="flex-1 bg-slate-100 relative">
            {!selectedCity ? (
                <div className="h-full w-full flex flex-col items-center justify-center text-slate-300"><MapIcon className="h-24 w-24 mb-6 opacity-10" /><p className="font-black uppercase tracking-widest text-sm">Awaiting Regional Data</p></div>
            ) : (
                <Tabs defaultValue="map" className="h-full flex flex-col">
                    <div className="border-b bg-white px-4 py-2 shrink-0 flex items-center justify-between shadow-sm z-10">
                        <TabsList className="h-9 bg-slate-100 p-1 rounded-xl">
                            <TabsTrigger value="map" className="text-[10px] font-bold uppercase h-7 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><MapIcon className="h-3 w-3 mr-2" /> Map View</TabsTrigger>
                            <TabsTrigger value="table" className="text-[10px] font-bold uppercase h-7 px-4 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"><TableIcon className="h-3 w-3 mr-2" /> Table View</TabsTrigger>
                        </TabsList>
                        <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                            Dataset: {selectedCity.name}
                        </div>
                    </div>
                    
                    <TabsContent value="map" className="flex-1 m-0 p-0 h-full relative outline-none">
                         {selectedCity.polygons ? (
                            // 🔑 CRITICAL FIX: The 'key' ensures Leaflet remounts on city change
                            // preventing the '_leaflet_pos' error.
                            <MapView 
                                key={selectedCity.id} 
                                selectedCity={selectedCity} 
                                stores={stores} 
                                analysisData={analysisData} 
                                isLoading={analyzing} 
                            />
                        ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 p-10 bg-slate-50">
                                <AlertTriangle className="h-12 w-12 mb-4 text-amber-500 animate-pulse" />
                                <p className="font-black text-slate-700 uppercase tracking-widest">Geodata Missing</p>
                                <p className="text-xs max-w-xs text-center mt-2 leading-relaxed">This city has no polygons. Please upload a GeoJSON file in City Management.</p>
                            </div>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="table" className="flex-1 m-0 p-8 overflow-auto outline-none">
                        <Card className="border-none shadow-2xl">
                            <CardContent className="p-0">
                                {analysisData?.assignments ? (
                                    <>
                                        <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
                                            <div>
                                              <h3 className="font-black text-slate-900 uppercase tracking-tight">Deployment Assignments</h3>
                                              <p className="text-[10px] text-slate-400 font-bold uppercase">Optimized via OSRM Engine</p>
                                            </div>
                                            <Button size="sm" variant="default" className="bg-slate-900 font-bold h-9" onClick={downloadCSV}><Download className="h-4 w-4 mr-2" /> Download Report</Button>
                                        </div>
                                        <Table>
                                            <TableHeader className="bg-slate-50">
                                                <TableRow>
                                                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Zone</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Logistics Hub</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Distance (AVG)</TableHead>
                                                    <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {Object.values(analysisData.assignments).map((row: any, i) => (
                                                    <TableRow key={i} className="hover:bg-slate-50/50">
                                                        <TableCell className="font-bold text-xs text-slate-700">{row.name}</TableCell>
                                                        <TableCell className="text-xs font-black text-purple-600 tracking-tighter uppercase">{row.storeName}</TableCell>
                                                        <TableCell className="text-xs font-mono font-bold text-slate-400">{row.distance} km</TableCell>
                                                        <TableCell className="text-right">
                                                          <Badge className={`${
                                                            row.status === 'in' ? 'bg-green-100 text-green-700' : 
                                                            row.status === 'warning' ? 'bg-yellow-100 text-yellow-700' : 
                                                            'bg-red-100 text-red-700'
                                                          } text-[9px] font-black border-none shadow-none`}>
                                                            {row.status.toUpperCase()}
                                                          </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </>
                                ) : (
                                    <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed flex flex-col items-center">
                                        <TableIcon className="h-10 w-10 text-slate-200 mb-4" />
                                        <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">No Data Computed</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            )}
        </div>
      </div>
    </div>
  );
}
