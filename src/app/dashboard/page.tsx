'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
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

// --- 🧮 MATH HELPERS ---

// 1. Calculate Real-World Distance (Haversine Formula) in Kilometers
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// 2. Find Center of a Polygon (to measure distance from)
function getPolygonCentroid(points: {lat: number, lng: number}[]) {
    let latSum = 0, lngSum = 0;
    points.forEach(p => { latSum += p.lat; lngSum += p.lng; });
    return { lat: latSum / points.length, lng: lngSum / points.length };
}

export default function DashboardPage() {
  const [isPending, startTransition] = useTransition();
  const [analysisResults, setAnalysisResults] = useState<any>(null); // Stores the final assignments
  const [submittedStores, setSubmittedStores] = useState<AnalysisFormValues['stores']>([]);
  const { toast } = useToast();
  const firestore = useFirestore();

  const citiesRef = useMemoFirebase(() => collection(firestore, 'cities'), [firestore]);
  const { data: citiesData, isLoading: isLoadingCities } = useCollection<{id: string, name: string}>(citiesRef);
  
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | undefined>(undefined);
  const [isFetchingPolygons, setIsFetchingPolygons] = useState(false);

  // --- 1. FETCH DATA ---
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

              // Get City Thresholds (if they exist in the city doc, we'd fetch them here too)
              // For now, we'll assume they are on the city object or default
              
              const features = zonesSnapshot.docs.map(doc => {
                const data = doc.data();
                const rawPositions = data.positions || [];
                
                // Helper: Clean Points
                const polyPoints = rawPositions.map((p: any) => ({ lat: p.lat, lng: p.lng }));
                
                // GeoJSON format
                let coordinates = rawPositions.map((p: any) => [p.lng, p.lat]);
                if (coordinates.length > 0) {
                    const first = coordinates[0];
                    const last = coordinates[coordinates.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
                }

                return {
                  type: 'Feature',
                  properties: { 
                      id: doc.id, 
                      name: data.name,
                      centroid: getPolygonCentroid(polyPoints) // Pre-calculate center
                  },
                  geometry: {
                      type: "Polygon",
                      coordinates: [coordinates]
                  }
                };
              });

              return {
                id: cityDoc.id,
                name: cityDoc.name,
                polygons: { type: 'FeatureCollection', features } as FeatureCollection,
                center: { lat: 36.1911, lng: 44.0094 },
                thresholds: (cityDoc as any).thresholds || { green: 30, yellow: 60 } // Default limits
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
    setAnalysisResults(null);
    setSubmittedStores([]);
  };

  // --- 2. TERRITORY ALLOCATION LOGIC ---
  const handleAnalyze = (data: AnalysisFormValues) => {
    const cityToAnalyze = cities.find(c => c.id === data.cityId);
    if (!cityToAnalyze || !data.stores.length) return;

    setSubmittedStores(data.stores);
    
    startTransition(() => {
        try {
            // A. Prepare Stores
            const stores = data.stores.map(s => ({
                id: s.id,
                name: s.name,
                lat: parseFloat(s.lat),
                lng: parseFloat(s.lng),
                zoneCount: 0, // Track how many zones this store gets
                color: '#22c55e' // Default green
            }));

            // B. Map of ZoneID -> Assigned Store ID
            const assignments: Record<string, string> = {};

            // C. Assign each Zone to the NEAREST Store
            const zones = cityToAnalyze.polygons.features as any[];
            
            zones.forEach(zone => {
                const center = zone.properties.centroid;
                let minDistance = Infinity;
                let closestStoreIndex = -1;

                // Find closest store
                stores.forEach((store, index) => {
                    const dist = getDistanceKm(center.lat, center.lng, store.lat, store.lng);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestStoreIndex = index;
                    }
                });

                // Assign ownership
                if (closestStoreIndex !== -1) {
                    const winner = stores[closestStoreIndex];
                    assignments[zone.properties.name] = winner.id;
                    winner.zoneCount++; // Increment store's workload
                }
            });

            // D. Determine Store Colors based on Thresholds
            const thresholds = cityToAnalyze.thresholds || { green: 30, yellow: 60 };
            
            stores.forEach(store => {
                if (store.zoneCount <= thresholds.green) {
                    store.color = '#22c55e'; // Green (Safe)
                } else if (store.zoneCount <= thresholds.yellow) {
                    store.color = '#eab308'; // Yellow (Warning)
                } else {
                    store.color = '#ef4444'; // Red (Overloaded)
                }
            });

            // Save results to pass to Map
            setAnalysisResults({
                assignments, // { "Zone A": "store-1" }
                storeStats: stores // [{ id: "store-1", color: "red", zoneCount: 65 }]
            });

            toast({ title: "Coverage Optimized", description: "Zones assigned to nearest branches." });

        } catch (err) {
            console.error("Analysis Error:", err);
            toast({ variant: "destructive", title: "Error", description: "Optimization failed." });
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
            analysisData={analysisResults} // Passing the new complex result object
            isLoading={overallLoading}
        />
      </div>
    </main>
  );
}
