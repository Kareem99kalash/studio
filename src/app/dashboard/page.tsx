'use client';

import { useState, useTransition, useEffect } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
import { analyzeCoverageAction } from '@/lib/actions';
import type { AnalysisFormValues, AnalysisResult, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import dynamic from 'next/dynamic';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
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
  const { data: citiesData, isLoading: isLoadingCities, error: citiesError } = useCollection<{id: string, name: string}>(citiesRef);
  
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
              const polygonsColRef = collection(firestore, `cities/${cityDoc.id}/polygons`);
              const polygonsSnapshot = await getDocs(polygonsColRef);
              const features = polygonsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                  type: 'Feature',
                  properties: { id: data.id, name: data.polygonName },
                  geometry: JSON.parse(data.wkt)
                };
              }) as GeoJSON.Feature<GeoJSON.Polygon>[];
              
              const featureCollection: FeatureCollection = {
                type: 'FeatureCollection',
                features: features,
              };

              let center = { lat: 36.1911, lng: 44.0094 }; 
              if (features.length > 0 && features[0].geometry.coordinates[0]?.[0]) {
                  center = { lat: features[0].geometry.coordinates[0][0][1], lng: features[0].geometry.coordinates[0][0][0] };
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
