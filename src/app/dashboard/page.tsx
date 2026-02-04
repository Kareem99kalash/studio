'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
import type { AnalysisFormValues, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore'; 
import type { FeatureCollection } from 'geojson';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center bg-muted"><p>Loading map...</p></div>,
  }
);

// --- HELPERS ---
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

// Distinct colors for Store Borders (to visually separate branches)
const STORE_COLORS = [
    '#7c3aed', // Violet
    '#2563eb', // Blue
    '#db2777', // Pink
    '#ea580c', // Orange
    '#059669', // Emerald
    '#0891b2', // Cyan
    '#4f46e5', // Indigo
    '#be123c', // Rose
];

export default function DashboardPage() {
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string>(""); 
  const { toast } = useToast();
  const firestore = useFirestore();

  const citiesRef = useMemoFirebase(() => collection(firestore, 'cities'), [firestore]);
  const { data: citiesData, isLoading: isLoadingCities } = useCollection<{id: string, name: string}>(citiesRef);
  
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | undefined>(undefined);
  const [isFetchingPolygons, setIsFetchingPolygons] = useState(false);

  // --- REAL-TIME ANALYSIS SYNC ---
  // We subscribe to the 'current_analysis' doc inside the selected city.
  // This means if ANYONE updates it, you see it instantly.
  const analysisRef = useMemoFirebase(() => 
    selectedCity ? doc(firestore, `cities/${selectedCity.id}/analysis/current`) : null, 
  [selectedCity, firestore]);
  
  const { data: liveAnalysis } = useDoc(analysisRef);

  // --- 1. FETCH CITY DATA ---
  useEffect(() => {
    if (citiesData) {
      setIsFetchingPolygons(true);
      const fetchPolygons = async () => {
        try {
          const fullCities: City[] = await Promise.all(
            citiesData.map(async (cityDoc) => {
              const zonesRef = collection(firestore, 'zones');
              const q = query(zonesRef, where('city', '==', cityDoc.name)); 
              const zonesSnapshot = await getDocs(q);

              const features = zonesSnapshot.docs.map(doc => {
                const data = doc.data();
                const rawPositions = data.positions || [];
                const polyPoints = rawPositions.map((p: any) => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));
                let coordinates = rawPositions.map((p: any) => [parseFloat(p.lng), parseFloat(p.lat)]);
                if (coordinates.length > 0) {
                    const first = coordinates[0];
                    const last = coordinates[coordinates.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
                }
                
                // Helper to calc centroid
                let latSum=0, lngSum=0;
                polyPoints.forEach((p:any) => { latSum+=p.lat; lngSum+=p.lng; });
                const centroid = polyPoints.length ? { lat: latSum/polyPoints.length, lng: lngSum/polyPoints.length } : {lat:0, lng:0};

                return {
                  type: 'Feature',
                  properties: { 
                      id: doc.id, 
                      name: data.name,
                      centroid: centroid
                  },
                  geometry: { type: "Polygon", coordinates: [coordinates] }
                };
              });

              return {
                id: cityDoc.id,
                name: cityDoc.name,
                polygons: { type: 'FeatureCollection', features } as FeatureCollection,
                center: { lat: 36.1911, lng: 44.0094 },
              };
            })
          );
          setCities(fullCities);
          if(fullCities.length > 0 && !selectedCity) setSelectedCity(fullCities[0]);
        } catch (error) {
            console.error(error);
        } finally {
            setIsFetchingPolygons(false);
        }
      };
      fetchPolygons();
    }
  }, [citiesData, firestore, selectedCity]);

  const handleCityChange = (cityId: string) => {
    setSelectedCity(cities.find(c => c.id === cityId));
  };

  // --- 2. RUN ANALYSIS & SAVE TO DB ---
  const handleAnalyze = (data: AnalysisFormValues) => {
    const cityToAnalyze = cities.find(c => c.id === data.cityId);
    if (!cityToAnalyze || !data.stores.length) return;

    const runAnalysis = async () => {
        try {
            let limits = { green: 2.0, yellow: 5.0 }; 
            try {
                const cityDoc = await getDoc(doc(firestore, 'cities', cityToAnalyze.id));
                if (cityDoc.exists() && cityDoc.data().thresholds) limits = cityDoc.data().thresholds;
            } catch (e) { console.log("Using default limits"); }

            // Assign a persistent color to each store
            const stores = data.stores.map((s, idx) => ({
                id: s.id,
                name: s.name,
                lat: parseFloat(s.lat),
                lng: parseFloat(s.lng),
                borderColor: STORE_COLORS[idx % STORE_COLORS.length]
            }));

            const zones = cityToAnalyze.polygons.features as any[];
            
            // Results Object
            const results: Record<string, any> = {}; 
            let processed = 0;
            const BATCH_SIZE = 5;
            
            for (let i = 0; i < zones.length; i += BATCH_SIZE) {
                const chunk = zones.slice(i, i + BATCH_SIZE);
                
                await Promise.all(chunk.map(async (zone) => {
                    const center = zone.properties.centroid;
                    
                    // 1. Find Closest Store (Straight Line First)
                    let closestStore = stores[0];
                    let minStraightDist = Infinity;

                    for (const store of stores) {
                        const dist = getDistanceKm(center.lat, center.lng, store.lat, store.lng);
                        if (dist < minStraightDist) {
                            minStraightDist = dist;
                            closestStore = store;
                        }
                    }

                    // 2. Get Road Distance
                    let finalDist = minStraightDist;
                    if (minStraightDist < 20) {
                        finalDist = await getRoadDistance(center.lat, center.lng, closestStore.lat, closestStore.lng);
                    }

                    // 3. Determine Fill Color
                    let status = 'Red';
                    let fillColor = '#ef4444';
                    
                    if (finalDist <= limits.green) {
                        status = 'Green';
                        fillColor = '#22c55e';
                    } else if (finalDist <= limits.yellow) {
                        status = 'Yellow';
                        fillColor = '#eab308';
                    }

                    // 4. Save Record
                    results[zone.properties.name] = {
                        storeId: closestStore.id,
                        storeName: closestStore.name,
                        storeColor: closestStore.borderColor,
                        distance: finalDist.toFixed(2),
                        status: status,
                        fillColor: fillColor
                    };
                }));

                processed += chunk.length;
                setProgress(`Calculating... ${Math.round((processed / zones.length) * 100)}%`);
                await delay(20); 
            }

            // 5. SAVE TO FIRESTORE (Shared with everyone)
            const analysisPayload = {
                timestamp: new Date().toISOString(),
                stores: stores,
                assignments: results,
                totalZones: zones.length
            };

            await setDoc(doc(firestore, `cities/${cityToAnalyze.id}/analysis/current`), analysisPayload);
            
            setProgress(""); 
            toast({ title: "Analysis Saved", description: "Results are now visible to all users." });

        } catch (err) {
            console.error("Analysis Error:", err);
            toast({ variant: "destructive", title: "Error", description: "Optimization failed." });
            setProgress("");
        }
    };

    startTransition(() => { runAnalysis(); });
  };

  const overallLoading = isPending || isLoadingCities || isFetchingPolygons;

  return (
    <main className="grid flex-1 grid-cols-1 md:grid-cols-[380px_1fr] h-[calc(100vh-3.5rem)] overflow-hidden">
      
      {/* LEFT SIDEBAR (Controls) */}
      <div className="border-r bg-muted/10 overflow-y-auto">
        <AnalysisPanel 
          cities={cities}
          isLoadingCities={isLoadingCities}
          onAnalyze={handleAnalyze} 
          isLoading={isPending} 
          onCityChange={handleCityChange} 
        />
      </div>

      {/* RIGHT SIDE (Map & Results) */}
      <div className="flex flex-col h-full relative">
        
        {progress && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-black/80 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-xl animate-pulse">
                {progress}
            </div>
        )}

        <Tabs defaultValue="map" className="flex-1 flex flex-col">
            <div className="px-4 py-2 border-b flex items-center justify-between bg-white">
                <TabsList>
                    <TabsTrigger value="map">🗺️ Map View</TabsTrigger>
                    <TabsTrigger value="table">📊 Results Table</TabsTrigger>
                </TabsList>
                {liveAnalysis && (
                    <Badge variant="outline" className="text-xs">
                        Last Updated: {new Date(liveAnalysis.timestamp).toLocaleTimeString()}
                    </Badge>
                )}
            </div>

            <TabsContent value="map" className="flex-1 p-0 m-0 h-full">
                <MapView 
                    selectedCity={selectedCity} 
                    stores={liveAnalysis?.stores || []}
                    analysisData={liveAnalysis || null} 
                    isLoading={overallLoading}
                />
            </TabsContent>

            <TabsContent value="table" className="flex-1 overflow-auto p-4">
               <Card>
                   <CardHeader>
                       <CardTitle>Detailed Coverage Report</CardTitle>
                   </CardHeader>
                   <CardContent>
                       <Table>
                           <TableHeader>
                               <TableRow>
                                   <TableHead>Zone Name</TableHead>
                                   <TableHead>Assigned Branch</TableHead>
                                   <TableHead>Distance (km)</TableHead>
                                   <TableHead>Status</TableHead>
                               </TableRow>
                           </TableHeader>
                           <TableBody>
                               {liveAnalysis && liveAnalysis.assignments ? (
                                   Object.entries(liveAnalysis.assignments).map(([zoneName, data]: [string, any]) => (
                                       <TableRow key={zoneName}>
                                           <TableCell className="font-medium">{zoneName}</TableCell>
                                           <TableCell>
                                               <span className="flex items-center gap-2">
                                                   <span className="w-3 h-3 rounded-full" style={{backgroundColor: data.storeColor}}></span>
                                                   {data.storeName}
                                               </span>
                                           </TableCell>
                                           <TableCell>{data.distance} km</TableCell>
                                           <TableCell>
                                               <Badge className={
                                                   data.status === 'Green' ? 'bg-green-500 hover:bg-green-600' :
                                                   data.status === 'Yellow' ? 'bg-yellow-500 hover:bg-yellow-600' : 
                                                   'bg-red-500 hover:bg-red-600'
                                               }>
                                                   {data.status}
                                               </Badge>
                                           </TableCell>
                                       </TableRow>
                                   ))
                               ) : (
                                   <TableRow><TableCell colSpan={4} className="text-center py-8">No analysis run yet.</TableCell></TableRow>
                               )}
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
