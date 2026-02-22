'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMap, useMapEvents, Rectangle, Marker, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrapedBusiness } from '@/app/actions/scrape-data';
import { MapPin } from 'lucide-react';

// Fix Leaflet Icon
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

// Tile Status
export type TileStatus = 'pending' | 'loading' | 'success' | 'empty' | 'error' | 'retrying';

interface ScraperMapProps {
  center: [number, number];
  radius: number; // meters
  onCenterChange: (lat: number, lng: number) => void;
  results: ScrapedBusiness[];
  gridTiles: number[][]; // [minLon, minLat, maxLon, maxLat]
  tileStatuses?: TileStatus[];
  highlightedBusinessId?: string | null;
}

function LocationMarker({ position, onDragEnd }: { position: [number, number], onDragEnd: (lat: number, lng: number) => void }) {
  const map = useMap();

  // Custom Icon for Center
  const centerIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  const [marker, setMarker] = useState<L.Marker | null>(null);

  useMapEvents({
    click(e) {
      onDragEnd(e.latlng.lat, e.latlng.lng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return (
      <Marker
        position={position}
        icon={centerIcon}
        draggable={true}
        eventHandlers={{
            dragend: (e: L.LeafletEvent) => {
                const marker = e.target as L.Marker;
                const position = marker.getLatLng();
                onDragEnd(position.lat, position.lng);
            }
        }}
        ref={setMarker}
      >
        <Popup>Search Center</Popup>
      </Marker>
  );
}

// Component to handle map view updates
function MapUpdater({ center, highlightedBusiness, results }: { center: [number, number], highlightedBusiness: string | null | undefined, results: ScrapedBusiness[] }) {
    const map = useMap();

    // Auto-pan to highlighted business
    useEffect(() => {
        if (highlightedBusiness) {
            const business = results.find(r => r.id === highlightedBusiness);
            if (business) {
                map.flyTo([business.lat, business.lng], 16);
            }
        }
    }, [highlightedBusiness, results, map]);

    return null;
}

export default function ScraperMap({ center, radius, onCenterChange, results, gridTiles, tileStatuses, highlightedBusinessId }: ScraperMapProps) {

  const [activeBusiness, setActiveBusiness] = useState<ScrapedBusiness | null>(null);

  // Convert bbox arrays to Leaflet Bounds for Rectangle
  // bbox: [minLon, minLat, maxLon, maxLat]
  // Leaflet Bounds: [[minLat, minLon], [maxLat, maxLon]]
  const tileRects = useMemo(() => {
    return gridTiles.map((bbox, idx) => {
        const status = tileStatuses ? tileStatuses[idx] : 'pending';
        let color = '#94a3b8'; // Pending (Gray)
        let fillOpacity = 0.05;

        if (status === 'loading') {
            color = '#3b82f6'; // Blue
            fillOpacity = 0.3;
        } else if (status === 'success') {
            color = '#22c55e'; // Green
            fillOpacity = 0.15;
        } else if (status === 'empty') {
            color = '#86efac'; // Light Green
            fillOpacity = 0.05;
        } else if (status === 'error') {
            color = '#ef4444'; // Red
            fillOpacity = 0.3;
        } else if (status === 'retrying') {
            color = '#eab308'; // Yellow
            fillOpacity = 0.3;
        }

        return {
            bounds: [[bbox[1], bbox[0]], [bbox[3], bbox[2]]] as L.LatLngBoundsExpression,
            color,
            fillOpacity,
            status
        };
    });
  }, [gridTiles, tileStatuses]);

  return (
    <div className="h-full w-full relative z-0">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MapUpdater center={center} highlightedBusiness={highlightedBusinessId} results={results} />

        {/* Search Radius */}
        <Circle
            center={center}
            radius={radius}
            pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.05, dashArray: '5, 5' }}
        />

        {/* Center Marker */}
        <LocationMarker position={center} onDragEnd={onCenterChange} />

        {/* Grid Tiles Visualization */}
        {tileRects.map((tile, i) => (
            <Rectangle
                key={`${tile.bounds.toString()}-${tile.status}-${i}`}
                bounds={tile.bounds}
                pathOptions={{ color: tile.color, weight: 1, fillOpacity: tile.fillOpacity }}
            >
            </Rectangle>
        ))}

        {/* Results Markers */}
        {results.map((biz) => {
            const isHighlighted = biz.id === highlightedBusinessId;
            return (
                <CircleMarker
                    key={biz.id}
                    center={[biz.lat, biz.lng]}
                    radius={isHighlighted ? 10 : 6}
                    pathOptions={{
                        color: isHighlighted ? '#4f46e5' : '#fff',
                        weight: isHighlighted ? 3 : 1,
                        fillColor: isHighlighted ? '#4f46e5' : (biz.type.includes('restaurant') ? '#ef4444' : '#3b82f6'),
                        fillOpacity: isHighlighted ? 1 : 0.8
                    }}
                    eventHandlers={{
                        click: () => setActiveBusiness(biz)
                    }}
                >
                    <Popup>
                        <div className="text-xs">
                            <strong className="block text-sm mb-1">{biz.name}</strong>
                            <Badge variant="outline" className="mb-2 text-[10px]">{biz.type}</Badge>
                            <p>{biz.address}</p>
                            {biz.phone && <p>📞 {biz.phone}</p>}
                            {biz.website && <a href={biz.website} target="_blank" className="text-blue-500 underline block mt-1">Website</a>}
                        </div>
                    </Popup>
                </CircleMarker>
            );
        })}

      </MapContainer>

      {/* Legend / Overlay Info */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 p-2 rounded-lg shadow-md border text-xs space-y-1 backdrop-blur-sm">
         <div className="font-bold flex items-center gap-2 mb-1"><MapPin className="h-3 w-3 text-red-500"/> Search Center</div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500/20 border border-green-500 rounded-sm"></div> Data Found</div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-200/20 border border-green-300 rounded-sm"></div> Scraped (Empty)</div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500/30 border border-blue-500 rounded-sm"></div> Scanning...</div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-500/30 border border-yellow-500 rounded-sm"></div> Retrying (Limit)</div>
         <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500/30 border border-red-500 rounded-sm"></div> Failed</div>
      </div>
    </div>
  );
}
