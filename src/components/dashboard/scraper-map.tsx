'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMap, useMapEvents, Rectangle, Marker } from 'react-leaflet';
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

interface ScraperMapProps {
  center: [number, number];
  radius: number; // meters
  onCenterChange: (lat: number, lng: number) => void;
  results: ScrapedBusiness[];
  gridTiles: number[][]; // [minLon, minLat, maxLon, maxLat]
  processedCount: number;
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
function MapUpdater({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        // map.flyTo(center, 13); // Don't fly aggressively if user is dragging
        // Maybe only on init?
    }, [center, map]);
    return null;
}

export default function ScraperMap({ center, radius, onCenterChange, results, gridTiles, processedCount }: ScraperMapProps) {

  const [activeBusiness, setActiveBusiness] = useState<ScrapedBusiness | null>(null);

  // Convert bbox arrays to Leaflet Bounds for Rectangle
  // bbox: [minLon, minLat, maxLon, maxLat]
  // Leaflet Bounds: [[minLat, minLon], [maxLat, maxLon]]
  const tileRects = useMemo(() => {
    return gridTiles.map((bbox, idx) => {
        const isProcessed = idx < processedCount;
        return {
            bounds: [[bbox[1], bbox[0]], [bbox[3], bbox[2]]] as L.LatLngBoundsExpression,
            color: isProcessed ? '#22c55e' : '#94a3b8',
            fillOpacity: isProcessed ? 0.2 : 0.05
        };
    });
  }, [gridTiles, processedCount]);

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

        <MapUpdater center={center} />

        {/* Search Radius */}
        <Circle
            center={center}
            radius={radius}
            pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1, dashArray: '5, 5' }}
        />

        {/* Center Marker */}
        <LocationMarker position={center} onDragEnd={onCenterChange} />

        {/* Grid Tiles Visualization */}
        {tileRects.map((tile, i) => (
            <Rectangle
                key={i}
                bounds={tile.bounds}
                pathOptions={{ color: tile.color, weight: 1, fillOpacity: tile.fillOpacity }}
            />
        ))}

        {/* Results Markers */}
        {results.map((biz) => (
            <CircleMarker
                key={biz.id}
                center={[biz.lat, biz.lng]}
                radius={6}
                pathOptions={{
                    color: '#fff',
                    weight: 1,
                    fillColor: biz.type.includes('restaurant') ? '#ef4444' : '#3b82f6',
                    fillOpacity: 0.8
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
        ))}

      </MapContainer>

      {/* Legend / Overlay Info */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 p-2 rounded-lg shadow-md border text-xs space-y-1 backdrop-blur-sm">
         <div className="font-bold flex items-center gap-2"><MapPin className="h-3 w-3 text-red-500"/> Search Center</div>
         <div>Drag pin or click map to move.</div>
         <div className="flex items-center gap-2 mt-2">
             <div className="w-3 h-3 bg-green-500/20 border border-green-500 rounded-sm"></div> Processed Tile
         </div>
         <div className="flex items-center gap-2">
             <div className="w-3 h-3 bg-slate-400/10 border border-slate-400 rounded-sm"></div> Pending Tile
         </div>
      </div>
    </div>
  );
}
