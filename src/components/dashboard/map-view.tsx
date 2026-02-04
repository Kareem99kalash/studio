'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { AnalysisResult, City } from '@/lib/types';

// Fix Leaflet's default icon issue in Next.js
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

const defaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

type MapViewProps = {
  selectedCity?: City;
  stores: any[];
  analysisResults: AnalysisResult[];
  isLoading: boolean;
};

export function MapView({ selectedCity, stores, analysisResults, isLoading }: MapViewProps) {
  // Default to Erbil if nothing selected
  const centerPosition: [number, number] = selectedCity?.center 
    ? [selectedCity.center.lat, selectedCity.center.lng] 
    : [36.19, 44.01];

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border relative">
      
      {isLoading && (
        <div className="absolute inset-0 z-[1000] bg-white/50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white p-3 rounded shadow-lg text-sm font-semibold">
            Updating Map...
          </div>
        </div>
      )}

      <MapContainer 
        center={centerPosition} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
        key={selectedCity?.id || 'default'} // Forces map to reset when city changes
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 1. DRAW ZONES (POLYGONS) */}
        {selectedCity?.polygons && (
          <GeoJSON 
            key={selectedCity.id} // Important: Re-renders when data changes
            data={selectedCity.polygons} 
            style={() => ({
              color: '#3b82f6', // Blue outline
              weight: 2,
              fillColor: '#3b82f6', 
              fillOpacity: 0.15
            })}
            onEachFeature={(feature, layer) => {
              // Show Zone Name on Hover
              if (feature.properties && feature.properties.name) {
                layer.bindTooltip(feature.properties.name, { sticky: true });
              }
            }}
          />
        )}

        {/* 2. DRAW STORES (as Colored Circles) */}
        {stores.map((store) => {
          // Find the result for this store to determine color
          const result = analysisResults.find(r => r.storeId === store.id);
          const isCovered = result?.status === 'Covered';
          
          // Color: Green if covered, Red if not, Grey if analysis hasn't run yet
          const color = result ? (isCovered ? '#22c55e' : '#ef4444') : '#64748b';

          return (
            <CircleMarker
              key={store.id}
              center={[parseFloat(store.lat), parseFloat(store.lng)]}
              radius={8}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: color,
                fillOpacity: 1
              }}
            >
              <Popup>
                <div className="p-1">
                  <p className="font-bold text-sm mb-1">{store.name}</p>
                  <p className="text-xs">
                    Status: <span style={{ color }}>{result?.status || "Pending"}</span>
                  </p>
                  {result?.zoneName && (
                    <p className="text-xs text-muted-foreground">Zone: {result.zoneName}</p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      </MapContainer>
    </div>
  );
}
