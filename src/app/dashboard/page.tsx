'use client';

import { useState, useEffect } from 'react';
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

const MapView = dynamic(() => import('@/components/dashboard/map-view').then(m => m.MapView), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-50 animate-pulse flex items-center justify-center text-slate-400 font-bold">Loading Map Engine...</div>
});

// --- HELPER: Straight Line Distance ---
function getDistSq(lat1: number, lng1: number, lat2: number, lng2: number) {
    return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2;
}

// --- HELPER: Haversine (Rough Filter) ---
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
    } catch (e) { console.error("Fetch Error:", e); } 
    finally { setLoading(false); }
  };

  const handleCityChange = (cityId: string, cityList = cities) => {
    const city = cityList.find(c => c.id === cityId);
    if (city) {
        setSelectedCity(city);
        setStores([]); 
        setAnalysisData(null); 
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

  // --- 🧠 INTELLIGENT POINT SELECTOR ---
  const getZoneKeyPoints = (store: any, feature: any) => {
      const center = feature.properties.centroid;
      const vertices = feature.geometry.coordinates[0].map((p: any) => ({ lat: p[1], lng: p[0] }));
      
      let close = vertices[0];
      let far = vertices[0];
      let minSq = Infinity;
      let maxSq = -1;

      vertices.forEach((v: any) => {
          const d = getDistSq(store.lat, store.lng, v.lat, v.lng);
          if (d < minSq) { minSq = d; close = v; }
          if (d > maxSq) { maxSq = d; far = v; }
      });

      return {
          id: feature.properties.id || feature.properties.name,
          name: feature.properties.name,
          points: [close, center, far]
      };
  };

  // --- 🛡️ MATRIX BATCH FETCH ---
  const fetchMatrixBatch = async (store: any, allZonePoints: any[]) => {
      const chunkSize = 75; 
      const results = new Array(allZonePoints.length).fill(null);
      const promises = [];

      for (let i = 0; i < allZonePoints.length; i += chunkSize) {
          const chunk = allZonePoints.slice(i, i + chunkSize);
          const coords = [`${store.lng},${store.lat}`, ...chunk.map((p: any) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`)].join(';');
          const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance`;

          promises.push(
              fetch(url)
                  .then(res => res.json())
                  .then(data => {
                      const distances = data.distances?.[0]?.slice(1);
                      if (distances) {
                          distances.forEach((d: number, idx: number) => {
                              if (d !== null) results[i + idx] = d / 1000;
                          });
                      }
                  })
                  .catch(e => console.error("Batch fail", e))
          );
      }
      
      await Promise.all(promises);
      return results;
  };

  const handleAnalyze = async () => {
    if (!selectedCity || stores.length === 0) {
        toast({ variant: "destructive", title: "Missing Data", description: "Please add a branch first." });
        return;
    }
    const validStores = stores.filter(s => !isNaN(parseFloat(s.lat)) && !isNaN(parseFloat(s.lng)));
    if (validStores.length === 0) {
         toast({ variant: "destructive", title: "Invalid Coordinates", description: "Check branch lat/lng." });
         return;
    }

    setAnalyzing(true);
    
    try {
        const finalAssignments: Record<string, any> = {};
        const features = selectedCity.polygons.features.filter((f: any) => f.properties?.centroid);

        const storePromises = validStores.map(async (store) => {
            const storeObj = { lat: parseFloat(store.lat), lng: parseFloat(store.lng) };
            const zoneMeta: any[] = [];
            const flatPoints: any[] = [];

            // 1. Filter impossible zones (>75km)
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

            // 2. Fetch Real Road Distances
            let flatDistances: number[] = [];
            if (flatPoints.length > 0) {
                flatDistances = await fetchMatrixBatch(storeObj, flatPoints);
            }

            // 3. Logic & Scoring
            let pointIdx = 0;
            zoneMeta.forEach((z) => {
                let v1 = 999, v2 = 999, v3 = 999;
                
                // Track "Final" voting values separate from "Raw" values
                // so we can display raw reality but vote with corrected logic
                let voteV1 = 999, voteV2 = 999, voteV3 = 999; 

                if (!z.tooFar) {
                    const dClose = flatDistances[pointIdx];
                    const dCenter = flatDistances[pointIdx + 1];
                    const dFar = flatDistances[pointIdx + 2];
                    pointIdx += 3;

                    if (dCenter !== null) {
                        v1 = dClose ?? dCenter; // Entrance
                        v2 = dCenter;           // Center
                        v3 = dFar ?? dCenter;   // Far Point

                        // Sanity Check 1: If OSRM returns crazy values (Center > 3x Entrance), smooth it
                        if (v2 > (v1 * 3) && v1 > 0.5) v2 = (v1 + v3) / 2;

                        // initialize voting values
                        voteV1 = v1; voteV2 = v2; voteV3 = v3;

                        // 🧠 SMART FIX: "Center Favoring"
                        // If Center (v2) is significantly better (>2km) than Entrance (v1),
                        // it implies the Entrance point is a "Bad Snap" (e.g. highway exit far away).
                        // In this case, we TRUST THE CENTER.
                        // We set voteV1 (Entrance Vote) to equal v2 (Center), effectively giving Center 2 votes.
                        if (v2 < (v1 - 2)) {
                            voteV1 = v2; 
                        }
                    }
                }

                // 2-out-of-3 Voting System (Using Corrected Votes)
                const points = [voteV1, voteV2, voteV3];
                let greenCount = 0;
                let yellowCount = 0;

                points.forEach(dist => {
                    if (dist <= rules.green) greenCount++;
                    else if (dist <= rules.yellow) yellowCount++;
                });

                let status = 'out';
                let color = '#ef4444'; // Red

                if (greenCount >= 2) { status = 'in'; color = '#22c55e'; } // Green
                else if ((greenCount + yellowCount) >= 2) { status = 'warning'; color = '#eab308'; } // Yellow

                // Metric for competition: Average Distance 
                // We use the corrected voting values for the score to ensure 
                // the "Avg Dist" matches the status color logic
                const avgDist = parseFloat(((voteV1 + voteV2 + voteV3) / 3).toFixed(2));

                const currentWinner = finalAssignments[z.id];
                let isWinner = false;

                if (!currentWinner) {
                    isWinner = true;
                } else {
                    const score = (s: string) => s === 'in' ? 3 : s === 'warning' ? 2 : 1;
                    if (score(status) > score(currentWinner.status)) isWinner = true;
                    else if (score(status) === score(currentWinner.status) && avgDist < parseFloat(currentWinner.distance)) isWinner = true;
                }

                if (isWinner) {
                    finalAssignments[z.id] = {
                        name: z.name,
                        id: z.id,
                        status,
                        fillColor: color,
                        storeColor: '#ffffff',
                        storeId: store.id,
                        storeName: store.name,
                        distance: avgDist.toFixed(2),
                        // Keep RAW values for the UI so user can see "Entrance: 18km, Center: 13km"
                        raw: { close: v1.toFixed(1), center: v2.toFixed(1), far: v3.toFixed(1) }
                    };
                }
            });
        });

        await Promise.all(storePromises);

        setAnalysisData({ timestamp: Date.now(), assignments: finalAssignments });
        toast({ title: "Analysis Complete", description: "Bad route snaps auto-corrected." });

    } catch (e) {
        console.error("Analysis Error", e);
        toast({ variant: "destructive", title: "Analysis Failed", description: "Calculation failed." });
    } finally {
        setAnalyzing(false);
    }
  };

  const downloadCSV = () => {
      if (!analysisData?.assignments) return;
      const rows = [['Zone ID', 'Zone Name', 'Assigned Branch', 'Avg Dist (KM)', 'Status']];
      Object.values(analysisData.assignments).forEach((a: any) => {
          rows.push([a.id, a.name, a.storeName, a.distance, a.status.toUpperCase()]);
      });

      const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `assignments_${selectedCity.name}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-purple-600" /></div>;

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      <header className="h-16 border-b bg-white flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-2">
            <div className="bg-purple-600 p-2 rounded-lg"><MapIcon className="text-white h-5 w-5" /></div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">Coverage Analysis</h1>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-96 bg-white border-r flex flex-col shrink-0 overflow-y-auto z-20 shadow-xl">
            <div className="p-6 space-y-8">
                <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Region</Label>
                    <Select onValueChange={(val) => handleCityChange(val)} value={selectedCity?.id}>
                        <SelectTrigger className="h-12 border-slate-200 text-lg font-medium"><SelectValue placeholder="Choose a city..." /></SelectTrigger>
                        <SelectContent>{cities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>

                {/* 🔒 READ-ONLY POLICY CARD */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <ShieldCheck className="h-4 w-4 text-purple-600" /> City Policy
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-white text-slate-400">Read Only</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white p-2 rounded border border-green-100 flex flex-col items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Green Limit</span>
                            <span className="text-lg font-black text-green-600">&lt; {rules.green} km</span>
                        </div>
                        <div className="bg-white p-2 rounded border border-yellow-100 flex flex-col items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Yellow Limit</span>
                            <span className="text-lg font-black text-yellow-500">&lt; {rules.yellow} km</span>
                        </div>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center italic">Thresholds set by Admin in City Management.</p>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Branches</Label>
                        <Button variant="ghost" size="sm" onClick={addStore} className="h-7 text-xs text-purple-600 hover:bg-purple-50"><Plus className="h-3 w-3 mr-1" /> Add Branch</Button>
                    </div>
                    
                    <div className="space-y-3 min-h-[100px]">
                        {stores.length === 0 && <div className="text-center py-8 border-2 border-dashed rounded-lg text-slate-300 text-sm">No branches added.</div>}
                        {stores.map((store) => (
                            <Card key={store.id} className="relative group border-l-4 border-l-purple-500 shadow-sm">
                                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeStore(store.id)}><Trash2 className="h-3 w-3" /></Button>
                                <CardContent className="p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Store className="h-4 w-4 text-slate-400" />
                                        <Input placeholder="Branch Name" className="h-8 text-sm font-semibold border-none shadow-none px-0 focus-visible:ring-0" value={store.name} onChange={e => updateStoreName(store.id, e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <Input placeholder="Lat, Lng (e.g. 36.1, 44.0)" className="h-8 text-xs bg-slate-50 font-mono" value={store.coordinates} onChange={e => updateStoreCoordinates(store.id, e.target.value)} />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                <Button className="w-full h-12 text-base font-bold bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200" onClick={handleAnalyze} disabled={analyzing || !selectedCity}>
                    {analyzing ? <Loader2 className="animate-spin mr-2" /> : "Run Assignment Analysis"}
                </Button>
            </div>
        </div>

        <div className="flex-1 bg-slate-100 relative">
            {!selectedCity ? (
                <div className="h-full w-full flex flex-col items-center justify-center text-slate-400"><MapIcon className="h-16 w-16 mb-4 opacity-20" /><p>Select a region to begin analysis</p></div>
            ) : (
                <Tabs defaultValue="map" className="h-full flex flex-col">
                    
                    <div className="border-b bg-white px-4 py-2 shrink-0 flex items-center justify-between shadow-sm z-10">
                        <TabsList className="h-8">
                            <TabsTrigger value="map" className="text-xs h-7 px-3"><MapIcon className="h-3 w-3 mr-1" /> Map Visualization</TabsTrigger>
                            <TabsTrigger value="table" className="text-xs h-7 px-3"><TableIcon className="h-3 w-3 mr-1" /> Assignment Table</TabsTrigger>
                        </TabsList>
                        <div className="text-xs text-slate-500 font-medium">
                            {selectedCity.name} Region
                        </div>
                    </div>
                    
                    <TabsContent value="map" className="flex-1 m-0 p-0 h-full relative">
                         {selectedCity.polygons ? (
                            <MapView selectedCity={selectedCity} stores={stores} analysisData={analysisData} isLoading={analyzing} />
                        ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center text-slate-400"><AlertTriangle className="h-12 w-12 mb-2 text-amber-400" /><p className="font-bold text-slate-600">No Map Data</p><p className="text-xs">Go to City Management to upload data.</p></div>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="table" className="flex-1 m-0 p-6 overflow-auto">
                        <Card>
                            <CardContent className="p-0">
                                {analysisData?.assignments ? (
                                    <>
                                        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                                            <h3 className="font-bold text-sm">Zone Assignments</h3>
                                            <Button size="sm" variant="outline" onClick={downloadCSV}><Download className="h-3 w-3 mr-2" /> Export CSV</Button>
                                        </div>
                                        <Table>
                                            <TableHeader><TableRow><TableHead>Zone Name</TableHead><TableHead>Assigned Branch</TableHead><TableHead>Avg Dist (km)</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {Object.values(analysisData.assignments).map((row: any, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell className="font-bold text-xs">{row.name}</TableCell>
                                                        <TableCell className="text-xs font-semibold text-purple-600">{row.storeName}</TableCell>
                                                        <TableCell className="text-xs font-mono">{row.distance}</TableCell>
                                                        <TableCell><Badge variant={row.status === 'in' ? 'default' : row.status === 'warning' ? 'secondary' : 'destructive'} className="text-[10px]">{row.status.toUpperCase()}</Badge></TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </>
                                ) : (
                                    <div className="text-center py-10 text-slate-400 italic">No analysis data available. Run "Assignment Analysis" first.</div>
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
