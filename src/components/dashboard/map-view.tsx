'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CoverageMap } from './coverage-map';
import { AIResults } from './ai-results';
import type { AnalysisFormValues, AnalysisResult, City } from '@/lib/types';

type MapViewProps = {
  selectedCity: City | undefined;
  stores: AnalysisFormValues['stores'];
  analysisResults: AnalysisResult[];
  isLoading: boolean;
};

export function MapView({ selectedCity, stores, analysisResults, isLoading }: MapViewProps) {
  return (
    <div className="relative h-full w-full">
      <Tabs defaultValue="map" className="h-full w-full flex flex-col">
        <div className="p-4 border-b">
          <TabsList>
            <TabsTrigger value="map">Map View</TabsTrigger>
            <TabsTrigger value="ai-analysis">AI Analysis</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="map" className="flex-grow mt-0">
          <CoverageMap selectedCity={selectedCity} stores={stores} analysisResults={analysisResults} />
        </TabsContent>
        <TabsContent value="ai-analysis" className="flex-grow mt-0 overflow-y-auto">
          <AIResults results={analysisResults} />
        </TabsContent>
      </Tabs>
      {isLoading && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-lg">Analyzing Coverage...</p>
          </div>
        </div>
      )}
    </div>
  );
}
