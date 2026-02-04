'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../../firebase'; // Adjust path if needed
import { collection, onSnapshot } from 'firebase/firestore';
import L from 'leaflet';

// --- FIX LEAFLET ICONS IN NEXT.JS ---
// (Leaflet icons often disappear in Next.js without this fix)
const iconUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png';

const defaultIcon = L.icon({
  iconUrl: iconUrl,
  iconRetinaUrl: iconRetinaUrl,
  shadowUrl: shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

// --- TYPES ---
interface Zone {
  id: string;
  name: string;
  color?: string;
  positions: { lat: number; lng: number }[]; // Matches your DB structure
}

interface Store {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export function CoverageMap() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [stores, setStores] = useState<Store[]>([]);

  // 1. LISTEN TO ZONES (POLYGONS)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'zones'), (snapshot) => {
      const loadedZones = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Zone[];
      
      console.log("Loaded Zones:", loadedZones); // Check your console to verify!
      setZones(loadedZones);
    });

    return () => unsubscribe();
  }, []);

  // 2. LISTEN TO BRANCHES (STORES)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const loadedStores = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Store[];
      setStores(loadedStores);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-border">
      <MapContainer 
        center={[36.19, 44.01]} // Default: Erbil
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* DRAW ZONES */}
        {zones.map((zone) => (
          <Polygon 
            key={zone.id}
            pathOptions={{ 
              color: zone.color || '#3b82f6', // Default blue if no color
              fillOpacity: 0.2,
              weight: 2
            }}
            positions={zone.positions}
          >
            <Tooltip sticky>{zone.name}</Tooltip>
          </Polygon>
        ))}

        {/* DRAW STORES */}
        {stores.map((store) => (
          <Marker 
            key={store.id} 
            position={[store.lat, store.lng]} 
            icon={defaultIcon}
          >
            <Popup>{store.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
