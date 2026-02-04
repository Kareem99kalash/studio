'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
import type { AnalysisFormValues, AnalysisResult, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore'; 
import type { FeatureCollection } from 'geojson';

const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => <div className="flex h-full w-full items-center justify-center bg-muted"><p>Loading map...</p></div>,
  }
);

// --- 🧮 DISTANCE HELPERS ---

// 1. Haversine (Straight Line) - Backup Method
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

// 2. OSRM API (Real Road Distance)
async function getRoadDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    try {
        // OSRM expects "lng,lat" format
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        
        if (data.routes && data.routes.length > 0) {
            // OSRM returns distance in Meters. Convert to KM.
            return data.routes[0].distance / 1000;
        }
        return Infinity;
    } catch (error) {
        console.warn("OSRM Failed, falling back to straight line:", error);
        // Fallback to Haversine if API fails/limits reached
        return getDistanceKm(lat1, lon1, lat2, lon2);
    }
}

// Helper: Polygon Centroid
function getPolygonCentroid(points: {lat: number, lng: number}[]) {
    if (!points || points.length === 0) return { lat: 0, lng: 0 };
    let latSum = 0, lngSum = 0;
    points.forEach(p => { latSum += p.lat; lngSum += p.lng; });
    return { lat: latSum / points.length, lng: lngSum / points.length };
}

// Helper: Safety Delay (to avoid API bans)
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

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
  const [progress, setProgress] = useState<string>(""); // Show progress to user

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
                const polyPoints = rawPositions.map((p: any) => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }));
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
    setAnalysisResults(null);
    setSubmittedStores([]);
  };

  // --- 2. ASYNC ROAD ANALYSIS LOGIC ---
  const handleAnalyze = (data: AnalysisFormValues) => {
    const cityToAnalyze = cities.find(c => c.id === data.cityId);
    if (!cityToAnalyze || !data.stores.length) return;

    setSubmittedStores(data.stores);
    
    // We wrap the async logic inside a promise passed to startTransition logic manually
    // or simply run it as an async function since we need to await API calls.
    const runAnalysis = async () => {
        try {
            // A. Fetch Thresholds
            let limits = { green: 2.0, yellow: 5.0 }; 
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

            const zones = cityToAnalyze.polygons.features as any[];
            const assignments: Record<string, string> = {}; 
            let coveredCount = 0;
            let processed = 0;

            // C. LOOP WITH ASYNC ROAD DISTANCE
            // Note: We use "for...of" to allow awaiting inside the loop
            for (const zone of zones) {
                const center = zone.properties.centroid;
                let minKm = Infinity;

                // Check distance to every store
                for (const store of stores) {
                    // Try rough straight line first. If > 100km, skip road check to save time
                    const roughDist = getDistanceKm(center.lat, center.lng, store.lat, store.lng);
                    
                    let roadDist = roughDist;
                    // Only fetch real road distance if it's potentially within range (e.g. < 20km)
                    // This optimizes speed significantly.
                    if (roughDist < 20) {
                         roadDist = await getRoadDistance(center.lat, center.lng, store.lat, store.lng);
                         // Small delay to be nice to the free API
                         await delay(50); 
                    }

                    if (roadDist < minKm) minKm = roadDist;
                }

                // Apply Colors
                if (minKm <= limits.green) {
                    assignments[zone.properties.name] = '#22c55e'; // Green
                    coveredCount++;
                } else if (minKm <= limits.yellow) {
                    assignments[zone.properties.name] = '#eab308'; // Yellow
                    coveredCount++;
                } else {
                    assignments[zone.properties.name] = '#ef4444'; // Red
                }

                processed++;
                if (processed % 5 === 0) {
                    setProgress(`Calculating... ${Math.round((processed / zones.length) * 100)}%`);
                }
            }

            setAnalysisResults({ assignments });
            setProgress(""); // Clear progress text
            toast({ title: "Road Analysis Complete", description: `${coveredCount} zones covered by road network.` });

        } catch (err) {
            console.error("Analysis Error:", err);
            toast({ variant: "destructive", title: "Error", description: "Optimization failed." });
            setProgress("");
        }
    };

    // Execute
    startTransition(() => {
        runAnalysis();
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
        {/* PROGRESS OVERLAY */}
        {progress && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-black/80 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-xl animate-pulse">
                {progress}
            </div>
        )}
        
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