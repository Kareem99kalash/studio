'use client';

import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import type { City, AnalysisResult } from '@/lib/types';
import type { AnalysisFormValues } from '@/lib/types';
import { useEffect, useRef } from 'react';

// The Polygon component from @vis.gl/react-google-maps was removed in a recent version.
// This is a custom component that recreates the functionality using the useMap hook.
const CustomPolygon = (props: google.maps.PolygonOptions) => {
  const map = useMap();
  const polygonRef = useRef<google.maps.Polygon>();

  useEffect(() => {
    if (!polygonRef.current) {
      polygonRef.current = new google.maps.Polygon();
    }
    polygonRef.current.setOptions(props);
    polygonRef.current.setMap(map);

    return () => {
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }
    };
  }, [map, props]);

  return null;
};


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
          const polygonId = feature.properties.id as string;
          const styleOptions = getPolygonStyle(polygonId);
          const paths = feature.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
          return <CustomPolygon key={polygonId} paths={paths} {...styleOptions} />;
        })}

        {stores.map((store) => {
            const position = { lat: parseFloat(store.lat), lng: parseFloat(store.lng) };
            if (isNaN(position.lat) || isNaN(position.lng)) return null;

            const storeResult = analysisResults.find(r => r.store.id === store.id);
            
            return (
                <AdvancedMarker 
                    key={store.id} 
                    position={position} 
                    title={store.name}
                >
                  <div
                    className="rounded-full w-4 h-4 border-2 border-white"
                    style={{ 
                      backgroundColor: storeResult?.store.color || '#4285F4',
                      boxShadow: '0px 2px 4px rgba(0,0,0,0.4)'
                    }}
                  />
                </AdvancedMarker>
            );
        })}
      </Map>
    </div>
  );
}
