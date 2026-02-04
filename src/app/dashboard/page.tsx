'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
import type { AnalysisFormValues, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { db } from '@/firebase'; 
import { collection, getDocs, query, where, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'; 
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then((mod) => mod.MapView),
  { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center bg-muted">Loading map...</div> }
);

const STORE_COLORS = ['#7c3aed', '#2563eb', '#db2777', '#ea580c', '#059669', '#0891b2', '#4f46e5', '#be123c'];

export default function DashboardPage() {
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState(""); 
  const { toast } = useToast();
  
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | undefined>(undefined);
  const [liveAnalysis, setLiveAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
            let latSum=0, lngSum=0;
            zData.positions?.forEach((p:any) => { latSum+=parseFloat(p.lat); lngSum+=parseFloat(p.lng); });
            const centroid = zData.positions?.length ? { lat: latSum/zData.positions.length, lng: lngSum/zData.positions.length } : {lat:0, lng:0};
            return { type: 'Feature', properties: { name: zData.name, centroid }, geometry: { type: "Polygon", coordinates: [coords] } };
          });
          return { id: cDoc.id, name: cData.name, polygons: { type: 'FeatureCollection', features }, center: { lat: 36.19, lng: 44.01 } };
        }));
        setCities(fullCities as any);
        if (fullCities.length) setSelectedCity(fullCities[0] as any);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchCitiesAndZones();
  }, []);

  useEffect(() => {
    if (!selectedCity) return;
    const unsub = onSnapshot(doc(db, `cities/${selectedCity.id}/analysis/current`), (doc) => {
      setLiveAnalysis(doc.exists() ? doc.data() : null);
    });
    return () => unsub();
  }, [selectedCity]);

  const handleAnalyze = async (data: AnalysisFormValues) => {
    const cityToAnalyze = cities.find(c => c.id === data.cityId);
    if (!cityToAnalyze || !data.stores.length) return;

    startTransition(async () => {
      try {
        setProgress("Fetching Road Distances...");
        const storeCoordsStr = data.stores.map(s => `${s.lng},${s.lat}`).join(';');
        const zones = cityToAnalyze.polygons.features as any[];
        const zoneCoordsStr = zones.map(z => `${z.properties.centroid.lng},${z.properties.centroid.lat}`).join(';');

        const matrixUrl = `https://router.project-osrm.org/table/v1/driving/${storeCoordsStr};${zoneCoordsStr}?sources=${Array.from({length: data.stores.length}, (_, i) => i).join(';')}&annotations=distance`;
        const response = await fetch(matrixUrl);
        const matrixData = await response.json();
        const assignments: Record<string, any> = {};

        zones.forEach((zone, zIdx) => {
          let minKm = Infinity;
          let bestIdx = 0;
          matrixData.distances.forEach((storeDistances: number[], sIdx: number) => {
            const dKm = storeDistances[data.stores.length + zIdx] / 1000;
            if (dKm < minKm) { minKm = dKm; bestIdx = sIdx; }
          });
          assignments[zone.properties.name] = { storeId: data.stores[bestIdx].id, storeName: data.stores[bestIdx].name, distance: minKm.toFixed(2) };
        });

        await setDoc(doc(db, `cities/${cityToAnalyze.id}/analysis/current`), { timestamp: new Date().toISOString(), stores: data.stores, assignments });
        setProgress("");
        toast({ title: "Analysis Complete" });
      } catch (err) { setProgress(""); toast({ variant: "destructive", title: "Failed" }); }
    });
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-purple-600" /></div>;

  return (
    <main className="grid grid-cols-1 md:grid-cols-[380px_1fr] h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className="border-r overflow-y-auto bg-white">
        <AnalysisPanel cities={cities} onCityChange={(id) => setSelectedCity(cities.find(c => c.id === id))} onAnalyze={handleAnalyze} isLoading={isPending} isLoadingCities={false} />
      </div>
      <div className="flex flex-col h-full relative overflow-hidden">
        {progress && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-black text-white px-4 py-2 rounded-full text-sm animate-pulse">{progress}</div>}
        <Tabs defaultValue="map" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b bg-white flex justify-between items-center"><TabsList><TabsTrigger value="map">Map</TabsTrigger><TabsTrigger value="table">Table</TabsTrigger></TabsList></div>
          <TabsContent value="map" className="flex-1 p-0 m-0 h-full overflow-hidden">
            <MapView selectedCity={selectedCity} stores={liveAnalysis?.stores || []} analysisData={liveAnalysis} isLoading={false} />
          </TabsContent>
          <TabsContent value="table" className="flex-1 overflow-y-auto p-4">
            <Card><CardHeader className="flex flex-row items-center justify-between border-b sticky top-0 bg-white z-10"><CardTitle>Results</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-[73px] z-10 shadow-sm"><TableRow><TableHead>Zone</TableHead><TableHead>Branch</TableHead><TableHead>Distance</TableHead></TableRow></TableHeader>
                <TableBody>
                  {liveAnalysis?.assignments ? Object.entries(liveAnalysis.assignments).map(([name, data]: [string, any]) => (
                    <TableRow key={name}><TableCell className="font-medium">{name}</TableCell><TableCell>{data.storeName}</TableCell><TableCell>{data.distance} km</TableCell></TableRow>
                  )) : <TableRow><TableCell colSpan={3} className="text-center py-8">Press "Check Coverage" to see results.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
