'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
import type { AnalysisFormValues, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { db } from '@/firebase'; 
import { collection, getDocs, query, where, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'; 
import type { FeatureCollection } from 'geojson';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

// Dynamic Import for Map
const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then((mod) => mod.MapView),
  { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center bg-muted">Loading map...</div> }
);

// --- 🧮 DISTANCE HELPERS ---
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return Infinity;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function getRoadDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) return data.routes[0].distance / 1000;
        return Infinity;
    } catch (error) {
        return getDistanceKm(lat1, lon1, lat2, lon2);
    }
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const STORE_COLORS = ['#7c3aed', '#2563eb', '#db2777', '#ea580c', '#059669', '#0891b2', '#4f46e5', '#be123c'];

export default function DashboardPage() {
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState(""); 
  const { toast } = useToast();
  
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | undefined>(undefined);
  const [liveAnalysis, setLiveAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 1. Initial Load of Cities
  useEffect(() => {
    const fetchCitiesAndZones = async () => {
      try {
        const citySnap = await getDocs(collection(db, 'cities'));
        const fullCities = await Promise.all(citySnap.docs.map(async (cDoc) => {
          const cData = cDoc.data();
          const zonesSnap = await getDocs(query(collection(db, 'zones'), where('city', '==', cData.name)));
          
          const features = zonesSnap.docs.map(zDoc => {
            const zData = zDoc.data();
            const coords = (zData.positions || []).map((p:any) => [parseFloat(p.lng), parseFloat(p.lat)]);
            if (coords.length) coords.push(coords[0]); 
            
            return {
              type: 'Feature',
              properties: { name: zData.name, centroid: calculateCentroid(zData.positions) },
              geometry: { type: "Polygon", coordinates: [coords] }
            };
          });

          return { id: cDoc.id, name: cData.name, polygons: { type: 'FeatureCollection', features }, center: { lat: 36.19, lng: 44.01 } };
        }));
        setCities(fullCities as any);
        if (fullCities.length) setSelectedCity(fullCities[0] as any);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchCitiesAndZones();
  }, []);

  // 2. Real-time Analysis Listener
  useEffect(() => {
    if (!selectedCity) return;
    const unsub = onSnapshot(doc(db, `cities/${selectedCity.id}/analysis/current`), (doc) => {
      setLiveAnalysis(doc.exists() ? doc.data() : null);
    });
    return () => unsub();
  }, [selectedCity]);

  const calculateCentroid = (pts: any[]) => {
    if (!pts?.length) return { lat: 0, lng: 0 };
    let lat = 0, lng = 0;
    pts.forEach(p => { lat += parseFloat(p.lat); lng += parseFloat(p.lng); });
    return { lat: lat / pts.length, lng: lng / pts.length };
  };

  // 3. ANALYSIS LOGIC (Road Batching)
  const handleAnalyze = async (data: AnalysisFormValues) => {
    const cityToAnalyze = cities.find(c => c.id === data.cityId);
    if (!cityToAnalyze || !data.stores.length) return;

    startTransition(async () => {
        try {
            // A. Thresholds
            let limits = { green: 2.0, yellow: 5.0 }; 
            const cityDoc = await getDoc(doc(db, 'cities', cityToAnalyze.id));
            if (cityDoc.exists() && cityDoc.data().thresholds) limits = cityDoc.data().thresholds;

            const stores = data.stores.map((s, idx) => ({
                id: s.id, name: s.name, lat: parseFloat(s.lat), lng: parseFloat(s.lng),
                borderColor: STORE_COLORS[idx % STORE_COLORS.length]
            }));

            const zones = cityToAnalyze.polygons.features as any[];
            const results: Record<string, any> = {}; 
            let processed = 0;
            const BATCH_SIZE = 5;
            
            for (let i = 0; i < zones.length; i += BATCH_SIZE) {
                const chunk = zones.slice(i, i + BATCH_SIZE);
                await Promise.all(chunk.map(async (zone) => {
                    const center = zone.properties.centroid;
                    
                    // Pick nearest branch via math first
                    let closestStore = stores[0];
                    let minStraightDist = Infinity;
                    for (const store of stores) {
                        const dist = getDistanceKm(center.lat, center.lng, store.lat, store.lng);
                        if (dist < minStraightDist) { minStraightDist = dist; closestStore = store; }
                    }

                    // Get Road distance for the nearest branch
                    let finalDist = minStraightDist;
                    if (minStraightDist < 20) finalDist = await getRoadDistance(center.lat, center.lng, closestStore.lat, closestStore.lng);

                    let status = 'Red', fillColor = '#ef4444';
                    if (finalDist <= limits.green) { status = 'Green'; fillColor = '#22c55e'; }
                    else if (finalDist <= limits.yellow) { status = 'Yellow'; fillColor = '#eab308'; }

                    results[zone.properties.name] = {
                        storeId: closestStore.id, storeName: closestStore.name, storeColor: closestStore.borderColor,
                        distance: finalDist.toFixed(2), status: status, fillColor: fillColor
                    };
                }));

                processed += chunk.length;
                setProgress(`Calculating... ${Math.round((processed / zones.length) * 100)}%`);
                await delay(30); 
            }

            await setDoc(doc(db, `cities/${cityToAnalyze.id}/analysis/current`), {
                timestamp: new Date().toISOString(), stores, assignments: results, totalZones: zones.length
            });
            setProgress(""); 
            toast({ title: "Check Complete", description: "Shared results have been updated." });
        } catch (err) {
            setProgress("");
            toast({ variant: "destructive", title: "Error", description: "Calculation failed." });
        }
    });
  };

  const downloadCSV = () => {
    if (!liveAnalysis?.assignments) return;
    const headers = ['Zone', 'Branch', 'Distance (km)', 'Status'];
    const rows = Object.entries(liveAnalysis.assignments).map(([name, d]: [string, any]) => 
      [`"${name}"`, `"${d.storeName}"`, d.distance, d.status]
    );
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Results_${selectedCity?.name}.csv`;
    link.click();
  };

  if (loading) return <div className="p-8 flex items-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div> Loading...</div>;

  return (
    <main className="grid grid-cols-1 md:grid-cols-[380px_1fr] h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="border-r overflow-y-auto bg-white">
        <AnalysisPanel 
          cities={cities} 
          onCityChange={(id) => setSelectedCity(cities.find(c => c.id === id))}
          onAnalyze={handleAnalyze} // 👈 FIXED: Linked to logic
          isLoading={isPending}
          isLoadingCities={false}
        />
      </div>
      <div className="flex flex-col h-full relative">
        {progress && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-black/80 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-xl animate-pulse">
                {progress}
            </div>
        )}
        <Tabs defaultValue="map" className="flex-1 flex flex-col">
            <div className="px-4 py-2 border-b bg-white flex justify-between items-center">
                <TabsList>
                    <TabsTrigger value="map">🗺️ Map View</TabsTrigger>
                    <TabsTrigger value="table">📊 Results Table</TabsTrigger>
                </TabsList>
                {liveAnalysis && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    Updated: {new Date(liveAnalysis.timestamp).toLocaleTimeString()}
                  </Badge>
                )}
            </div>
            <TabsContent value="map" className="flex-1 p-0 m-0 h-full">
                <MapView selectedCity={selectedCity} stores={liveAnalysis?.stores || []} analysisData={liveAnalysis} isLoading={false} />
            </TabsContent>
            <TabsContent value="table" className="flex-1 overflow-auto p-4">
               <Card>
                   <CardHeader className="flex flex-row items-center justify-between">
                       <CardTitle>Analysis Data</CardTitle>
                       <Button size="sm" variant="outline" onClick={downloadCSV} disabled={!liveAnalysis}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
                   </CardHeader>
                   <CardContent>
                       <Table>
                           <TableHeader><TableRow><TableHead>Zone</TableHead><TableHead>Branch</TableHead><TableHead>KM (Road)</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                           <TableBody>
                               {liveAnalysis?.assignments ? Object.entries(liveAnalysis.assignments).map(([name, data]: [string, any]) => (
                                   <TableRow key={name}>
                                       <TableCell className="font-medium">{name}</TableCell>
                                       <TableCell><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{backgroundColor: data.storeColor}}></span>{data.storeName}</span></TableCell>
                                       <TableCell>{data.distance} km</TableCell>
                                       <TableCell><Badge className={data.status === 'Green' ? 'bg-green-500' : data.status === 'Yellow' ? 'bg-yellow-500' : 'bg-red-500'}>{data.status}</Badge></TableCell>
                                   </TableRow>
                               )) : <TableRow><TableCell colSpan={4} className="text-center py-8">Press "Check Coverage" to begin.</TableCell></TableRow>}
                           </TableBody>
                       </Table>
                   </CardContent>
               </Card>
            </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
