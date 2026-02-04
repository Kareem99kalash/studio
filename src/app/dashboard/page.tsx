'use client';

import { useState, useTransition, useContext } from 'react';
import { AnalysisPanel } from '@/components/dashboard/analysis-panel';
import { MapView } from '@/components/dashboard/map-view';
import { analyzeCoverageAction } from '@/lib/actions';
import type { AnalysisFormValues, AnalysisResult, City } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { CityContext } from '@/context/city-context';

export default function DashboardPage() {
  const [isPending, startTransition] = useTransition();
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [submittedStores, setSubmittedStores] = useState<AnalysisFormValues['stores']>([]);
  const { toast } = useToast();
  const { cities } = useContext(CityContext);
  const [selectedCity, setSelectedCity] = useState<City | undefined>(cities[0]);

  const handleCityChange = (cityId: string) => {
    setSelectedCity(cities.find(c => c.id === cityId));
    setAnalysisResults([]);
    setSubmittedStores([]);
  };

  const handleAnalyze = (data: AnalysisFormValues) => {
    if (!selectedCity) {
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
        const results = await analyzeCoverageAction(data, selectedCity.polygons, selectedCity.name);
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

  return (
    <main className="grid flex-1 grid-cols-1 md:grid-cols-[380px_1fr]">
      <div className="border-r">
        <AnalysisPanel 
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
            isLoading={isPending}
        />
      </div>
    </main>
  );
}
