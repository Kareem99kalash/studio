'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
import type { AnalysisFormValues, AnalysisResult, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'; // Added doc/getDoc
import type { FeatureCollection } from 'geojson';

const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center bg-muted"><p>Loading map...</p></div>,
  }
);

// --- 🧮 MATH HELPER (Haversine Distance) ---
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return Infinity;
  
  const R = 6371; // Earth radius in KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Helper to find Polygon Centroid
function getPolygonCentroid(points: {lat: number, lng: number}[]) {
    if (!points || points.length === 0) return { lat: 0, lng: 0 };
    let latSum = 0, lngSum = 0;
    points.forEach(p => { latSum += p.lat; lngSum += p.lng; });
    return { lat: latSum / points.length, lng: lngSum / points.length };
}

export default function DashboardPage() {
  const [isPending, startTransition] = useTransition();
  const [analysisResults, setAnalysisResults] = useState<any>(null); 
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

              const features = zonesSnapshot.docs.map(doc => {
                const data = doc.data();
                const rawPositions = data.positions || [];
                
                // Helper: Clean Points for Math
                const polyPoints = rawPositions.map((p: any) => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));
                
                // GeoJSON format for Map (Needs [lng, lat])
                let coordinates = rawPositions.map((p: any) => [parseFloat(p.lng), parseFloat(p.lat)]);
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
                      centroid: getPolygonCentroid(polyPoints) 
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

  // --- 2. DISTANCE ANALYSIS LOGIC ---
  const handleAnalyze = (data: AnalysisFormValues) => {
    const cityToAnalyze = cities.find(c => c.id === data.cityId);
    if (!cityToAnalyze || !data.stores.length) return;

    setSubmittedStores(data.stores);
    
    startTransition(async () => {
        try {
            // A. Fetch Live Thresholds (Green/Yellow limits)
            let limits = { green: 2.0, yellow: 5.0 }; // Defaults
            try {
                const cityDoc = await getDoc(doc(firestore, 'cities', cityToAnalyze.id));
                if (cityDoc.exists() && cityDoc.data().thresholds) {
                    limits = cityDoc.data().thresholds;
                }
            } catch (e) { console.log("Using default limits"); }

            // B. Prepare Stores
            const stores = data.stores.map(s => ({
                lat: parseFloat(s.lat),
                lng: parseFloat(s.lng),
            }));

            // C. Calculate Colors
            const assignments: Record<string, string> = {}; 
            const zones = cityToAnalyze.polygons.features as any[];
            let coveredCount = 0;

            zones.forEach(zone => {
                const center = zone.properties.centroid;
                
                // Find distance to NEAREST store
                let minKm = Infinity;
                stores.forEach(store => {
                    const km = getDistanceKm(center.lat, center.lng, store.lat, store.lng);
                    if (km < minKm) minKm = km;
                });

                // Assign Traffic Light Colors
                if (minKm <= limits.green) {
                    assignments[zone.properties.name] = '#22c55e'; // Green
                    coveredCount++;
                } else if (minKm <= limits.yellow) {
                    assignments[zone.properties.name] = '#eab308'; // Yellow
                    coveredCount++;
                } else {
                    assignments[zone.properties.name] = '#ef4444'; // Red
                }
            });

            // D. Send to Map
            setAnalysisResults({ assignments });
            toast({ title: "Analysis Complete", description: `${coveredCount} zones are in the safe (green) range.` });

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
            analysisData={analysisResults} 
            isLoading={overallLoading}
        />
      </div>
    </main>
  );
}