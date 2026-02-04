'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
import { analyzeCoverageAction } from '@/lib/actions';
import type { AnalysisFormValues, AnalysisResult, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore'; // 👈 Added query & where
import type { FeatureCollection } from 'geojson';

const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <p>Loading map...</p>
      </div>
    ),
  }
);

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

  useEffect(() => {
    if (citiesData) {
      setIsFetchingPolygons(true);
      const fetchPolygons = async () => {
        try {
          const fullCities: City[] = await Promise.all(
            citiesData.map(async (cityDoc) => {
              
              // 1. LOOK IN THE GLOBAL "ZONES" COLLECTION
              const zonesRef = collection(firestore, 'zones');
              // 2. QUERY BY CITY NAME (Since we saved city name in the zone doc)
              const q = query(zonesRef, where('city', '==', cityDoc.name)); 
              const zonesSnapshot = await getDocs(q);

              const features = zonesSnapshot.docs.map(doc => {
                const data = doc.data();
                
                // 3. CONVERT {lat, lng} TO GEOJSON ARRAY [lng, lat]
                // GeoJSON expects Longitude first, then Latitude!
                let coordinates = (data.positions || []).map((p: any) => [p.lng, p.lat]);

                // Ensure Polygon is "closed" (first point == last point)
                if (coordinates.length > 0) {
                    const first = coordinates[0];
                    const last = coordinates[coordinates.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) {
                        coordinates.push(first);
                    }
                }

                return {
                  type: 'Feature',
                  properties: { 
                      id: doc.id, 
                      name: data.name,
                      // Pass thresholds if they exist on the zone, or generic
                      thresholds: data.thresholds || { green: 30, yellow: 60 } 
                  },
                  geometry: {
                      type: "Polygon",
                      coordinates: [coordinates] // GeoJSON requires triple nesting for Polygons
                  }
                };
              }) as GeoJSON.Feature<GeoJSON.Polygon>[];
              
              const featureCollection: FeatureCollection = {
                type: 'FeatureCollection',
                features: features,
              };

              // Calculate center from first polygon or default to Erbil
              let center = { lat: 36.1911, lng: 44.0094 }; 
              if (features.length > 0 && features[0].geometry.coordinates[0]?.[0]) {
                  // Remember: GeoJSON is [lng, lat], so index 1 is lat
                  const firstPt = features[0].geometry.coordinates[0][0];
                  center = { lat: firstPt[1], lng: firstPt[0] };
              }

              return {
                id: cityDoc.id,
                name: cityDoc.name,
                polygons: featureCollection,
                center: center
              };
            })
          );
          setCities(fullCities);
          if(fullCities.length > 0 && !selectedCity) {
              setSelectedCity(fullCities[0]);
          }
        } catch (error) {
            console.error("Failed to fetch polygons:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load city polygon data."
            })
        } finally {
            setIsFetchingPolygons(false);
        }
      };
      fetchPolygons();
    }
  }, [citiesData, firestore, selectedCity, toast]);

  const handleCityChange = (cityId: string) => {
    setSelectedCity(cities.find(c => c.id === cityId));
    setAnalysisResults([]);
    setSubmittedStores([]);
  };

  const handleAnalyze = (data: AnalysisFormValues) => {
    const cityToAnalyze = cities.find(c => c.id === data.cityId);
    if (!cityToAnalyze) {
      toast({
        variant: "destructive",
        title: "No City Selected",
        description: "Please select a city before starting the analysis.",
      });
      return;
    }
    setSubmittedStores(data.stores);
    startTransition(async () => {
      try {
        // Now cityToAnalyze.polygons contains valid GeoJSON
        const results = await analyzeCoverageAction(data, cityToAnalyze.polygons, cityToAnalyze.name);
        setAnalysisResults(results);
        toast({
          title: "Analysis Complete",
          description: `Coverage analysis for ${data.stores.length} store(s) finished successfully.`,
        });
      } catch (error) {
        console.error(error);
        toast({
          variant: "destructive",
          title: "Analysis Failed",
          description: "An error occurred while analyzing coverage.",
        });
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
