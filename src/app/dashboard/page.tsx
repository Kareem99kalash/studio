'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
// import { analyzeCoverageAction } from '@/lib/actions'; // ❌ REMOVE THIS
import type { AnalysisFormValues, AnalysisResult, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { FeatureCollection } from 'geojson';

const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center bg-muted"><p>Loading map...</p></div>,
  }
);

// --- 🧮 CLIENT-SIDE MATH HELPER ---
// Ray-casting algorithm to check if a point is inside a polygon
function isPointInPolygon(point: {lat: number, lng: number}, polygon: {lat: number, lng: number}[]) {
    const x = point.lng, y = point.lat;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng, yi = polygon[i].lat;
        const xj = polygon[j].lng, yj = polygon[j].lat;
        
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export default function DashboardPage() {
  const [isPending, startTransition] = useTransition();
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [submittedStores, setSubmittedStores] = useState<AnalysisFormValues['stores']>([]);
  const { toast } = useToast();
  const firestore = useFirestore();

  const citiesRef = useMemoFirebase(() => collection(firestore, 'cities'), [firestore]);
  const { data: citiesData, isLoading: isLoadingCities } = useCollection<{id: string, name: string}>(citiesRef);
  
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | undefined>(undefined);
  const [isFetchingPolygons, setIsFetchingPolygons] = useState(false);

  // --- 1. FETCH & PREPARE DATA ---
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

              // Prepare GeoJSON for MapView
              const features = zonesSnapshot.docs.map(doc => {
                const data = doc.data();
                const rawPositions = data.positions || [];
                
                // For Math (Keep as Objects)
                const polyPoints = rawPositions.map((p: any) => ({ lat: p.lat, lng: p.lng }));

                // For Map (Convert to Arrays [lng, lat])
                let coordinates = rawPositions.map((p: any) => [p.lng, p.lat]);
                if (coordinates.length > 0) {
                    // Close the polygon ring
                    const first = coordinates[0];
                    const last = coordinates[coordinates.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
                }

                return {
                  type: 'Feature',
                  properties: { 
                      id: doc.id, 
                      name: data.name,
                      thresholds: data.thresholds || { green: 30, yellow: 60 },
                      _rawPoints: polyPoints // HIDDEN FIELD: We use this for math below!
                  },
                  geometry: {
                      type: "Polygon",
                      coordinates: [coordinates]
                  }
                };
              }) as any[]; // Using 'any' to allow our custom _rawPoints property

              let center = { lat: 36.1911, lng: 44.0094 }; 
              if (features.length > 0 && features[0]._rawPoints?.[0]) {
                  center = features[0]._rawPoints[0];
              }

              return {
                id: cityDoc.id,
                name: cityDoc.name,
                polygons: { type: 'FeatureCollection', features } as FeatureCollection,
                center: center
              };
            })
          );
          setCities(fullCities);
          if(fullCities.length > 0 && !selectedCity) setSelectedCity(fullCities[0]);
        } catch (error) {
            console.error("Failed to fetch polygons:", error);
        } finally {
            setIsFetchingPolygons(false);
        }
      };
      fetchPolygons();
    }
  }, [citiesData, firestore, selectedCity]);

  const handleCityChange = (cityId: string) => {
    setSelectedCity(cities.find(c => c.id === cityId));
    setAnalysisResults([]);
    setSubmittedStores([]);
  };

  // --- 2. NEW LOCAL ANALYSIS LOGIC (Replaces Server Action) ---
  const handleAnalyze = (data: AnalysisFormValues) => {
    const cityToAnalyze = cities.find(c => c.id === data.cityId);
    if (!cityToAnalyze) {
      toast({ variant: "destructive", title: "No City Selected" });
      return;
    }

    setSubmittedStores(data.stores);
    
    // START CALCULATION
    startTransition(() => {
        try {
            const results: AnalysisResult[] = data.stores.map(store => {
                const storePt = { lat: parseFloat(store.lat), lng: parseFloat(store.lng) };
                let matchedZone: string | null = null;
                let matchedColor = '#ef4444'; // Default Red

                // Check every zone in the city
                for (const feature of cityToAnalyze.polygons.features as any[]) {
                    if (isPointInPolygon(storePt, feature.properties._rawPoints)) {
                        matchedZone = feature.properties.name;
                        // Logic: If inside ANY zone, mark Green (or use zone color if you have it)
                        matchedColor = '#22c55e'; 
                        break; // Stop after finding first match
                    }
                }

                return {
                    storeId: store.id,
                    storeName: store.name,
                    status: matchedZone ? 'Covered' : 'Uncovered',
                    zoneName: matchedZone || 'No Coverage',
                    matchColor: matchedColor
                };
            });

            setAnalysisResults(results);
            toast({ 
                title: "Analysis Complete", 
                description: `Processed ${results.length} stores.` 
            });

        } catch (err) {
            console.error("Local Analysis Error:", err);
            toast({ variant: "destructive", title: "Error", description: "Calculation failed." });
        }
    });
  };

  const overallLoading = isPending || isLoadingCities || isFetchingPolygons;

  return (
    <main className="grid flex-1 grid-cols-1 md:grid-cols-[380px_1fr]">
      <div className="border-r">
        <AnalysisPanel 
          cities={cities}
          isLoadingCities={isLoadingCities}
          onAnalyze={handleAnalyze} 
          isLoading={isPending} 
          onCityChange={handleCityChange} 
        />
      </div>
      <div className="relative h-[calc(100vh-3.5rem)]">
        <MapView 
            selectedCity={selectedCity} 
            stores={submittedStores}
            analysisResults={analysisResults}
            isLoading={overallLoading}
        />
      </div>
    </main>
  );
}
