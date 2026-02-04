'use client';

import { Map, Marker, Polygon } from '@vis.gl/react-google-maps';
import type { City, AnalysisResult } from '@/lib/types';
import type { AnalysisFormValues } from '@/lib/types';

type CoverageMapProps = {
  selectedCity: City | undefined;
  stores: AnalysisFormValues['stores'];
  analysisResults: AnalysisResult[];
};

export function CoverageMap({ selectedCity, stores, analysisResults }: CoverageMapProps) {
  const getPolygonStyle = (polygonId: string) => {
    for (const result of analysisResults) {
      if (result.polygonStyles[polygonId]) {
        return result.polygonStyles[polygonId];
      }
    }
    // Default style
    return {
      fillColor: 'gray',
      strokeColor: 'black',
      fillOpacity: 0.3,
      strokeWeight: 1,
    };
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden">
      <Map
        mapId="geocoverage-map"
        defaultCenter={selectedCity?.center}
        defaultZoom={11}
        key={selectedCity?.id}
        gestureHandling={'greedy'}
        disableDefaultUI={true}
      >
        {selectedCity?.polygons.features.map(feature => {
          const polygonId = feature.properties.id;
          const styleOptions = getPolygonStyle(polygonId);
          const paths = feature.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
          return <Polygon key={polygonId} paths={paths} {...styleOptions} />;
        })}

        {stores.map((store, index) => {
            const position = { lat: parseFloat(store.lat), lng: parseFloat(store.lng) };
            if (isNaN(position.lat) || isNaN(position.lng)) return null;

            const storeResult = analysisResults.find(r => r.store.id === store.id);
            
            return (
                <Marker 
                    key={store.id} 
                    position={position} 
                    title={store.name}
                    icon={{
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: storeResult?.store.color || '#4285F4',
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: 'white'
                    }}
                />
            );
        })}
      </Map>
    </div>
  );
}
