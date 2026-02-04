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

const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then((mod) => mod.MapView),
  { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center bg-muted">Loading map...</div> }
);

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
      const citySnap = await getDocs(collection(db, 'cities'));
      const fullCities = await Promise.all(citySnap.docs.map(async (cDoc) => {
        const cData = cDoc.data();
        const zonesSnap = await getDocs(query(collection(db, 'zones'), where('city', '==', cData.name)));
        
        const features = zonesSnap.docs.map(zDoc => {
          const zData = zDoc.data();
          const coords = (zData.positions || []).map((p:any) => [parseFloat(p.lng), parseFloat(p.lat)]);
          if (coords.length) coords.push(coords[0]); // Close polygon
          
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
      setLoading(false);
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

  if (loading) return <div className="p-8">Loading Dashboard...</div>;

  return (
    <main className="grid grid-cols-1 md:grid-cols-[380px_1fr] h-full overflow-hidden">
      <div className="border-r overflow-y-auto bg-white">
        <AnalysisPanel 
          cities={cities} 
          onCityChange={(id) => setSelectedCity(cities.find(c => c.id === id))}
          onAnalyze={() => { /* Your analyze logic */ }}
          isLoading={isPending}
          isLoadingCities={false}
        />
      </div>
      <div className="flex flex-col h-full relative">
        <Tabs defaultValue="map" className="flex-1 flex flex-col">
            <div className="px-4 py-2 border-b bg-white flex justify-between items-center">
                <TabsList><TabsTrigger value="map">Map</TabsTrigger><TabsTrigger value="table">Table</TabsTrigger></TabsList>
            </div>
            <TabsContent value="map" className="flex-1 p-0 m-0 h-full">
                <MapView selectedCity={selectedCity} stores={liveAnalysis?.stores || []} analysisData={liveAnalysis} isLoading={false} />
            </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
