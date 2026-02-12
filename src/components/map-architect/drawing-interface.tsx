'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { 
  Loader2, 
  Magnet,
  Scissors,
  Merge,
  Map as MapIcon,
  Satellite,
  Minimize2,
  Maximize2,
  Zap
} from 'lucide-react';
import { booleanOverlap } from '@turf/turf';
import type { Feature, Polygon, FeatureCollection } from 'geojson';

// --- UTILITY: Debounce ---
function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface DrawingInterfaceProps {
  geojson: FeatureCollection;
  onChange: (geojson: FeatureCollection) => void;
}

interface VertexCacheItem {
  lat: number;
  lng: number;
  id: string;
}

let CURRENT_SNAP: L.LatLng | null = null;

export function DrawingInterface({ geojson, onChange }: DrawingInterfaceProps) {
  // 1. FIX: Use a Ref for the container to prevent "Map container not found" errors
  const mapContainerRef = useRef<HTMLDivElement>(null);
  
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.FeatureGroup | null>(null);
  const snapLayerRef = useRef<L.LayerGroup | null>(null);
  const vertexCacheRef = useRef<VertexCacheItem[]>([]);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [snapToVertices, setSnapToVertices] = useState<boolean>(true);
  const [snapToRoads, setSnapToRoads] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<string>('Ready');
  const [isSatellite, setIsSatellite] = useState(false);
  const [isHudCollapsed, setIsHudCollapsed] = useState(false);

  // 2. FIX: Create refs for state so the Map Event Listeners can read the *current* value
  // (Otherwise they only ever see the initial 'true' value from the first render)
  const snapToRoadsRef = useRef(snapToRoads);
  const snapToVerticesRef = useRef(snapToVertices);

  useEffect(() => { snapToRoadsRef.current = snapToRoads; }, [snapToRoads]);
  useEffect(() => { snapToVerticesRef.current = snapToVertices; }, [snapToVertices]);

  // --- 1. Vertex Caching ---
  const rebuildVertexCache = useCallback(() => {
    if (!layersRef.current) return;
    const cache: VertexCacheItem[] = [];
    layersRef.current.eachLayer((layer) => {
      if (layer instanceof L.Polygon) {
        // PERF: Use getLatLngs() instead of toGeoJSON() to avoid expensive object creation and conversion
        const latlngs = layer.getLatLngs();
        const flatLatLngs = (latlngs as any).flat(Infinity) as L.LatLng[];
        const id = String((layer as any).feature?.properties?.id || 'unknown');

        for (const ll of flatLatLngs) {
          cache.push({ lat: ll.lat, lng: ll.lng, id });
        }
      }
    });
    vertexCacheRef.current = cache;
  }, []);

  // --- 2. Topology ---
  const checkTopology = useCallback((geojsonData: FeatureCollection) => {
    const features = geojsonData.features.filter((f): f is Feature<Polygon> => f.geometry?.type === 'Polygon');
    if (features.length < 2) { setStatusMsg('Ready'); return; }
    let overlaps = 0;
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        try { if (booleanOverlap(features[i], features[j])) overlaps++; } catch (e) { /* ignore */ }
      }
    }
    setStatusMsg(overlaps > 0 ? `${overlaps} overlaps detected` : 'Topology Valid');
  }, []);

  // --- 3. THE "PERFECT SNAP" ROUTER ---
  const refineGeometry = async (layer: L.Polygon, name: string) => {
    setIsProcessing(true);
    setStatusMsg('Aligning to Road Grid...');

    try {
        const latlngs = layer.getLatLngs();
        const rawCoords = (Array.isArray(latlngs[0]) ? latlngs[0] : latlngs) as L.LatLng[];
        const points = rawCoords.map(p => ({ lat: p.lat, lng: p.lng }));
        
        if (snapToRoadsRef.current && points.length > 2) {
            // PERF: Batch OSRM requests to reduce network overhead and latency.
            // Instead of firing N parallel requests (which can be rate-limited), we batch contiguous snappable segments.
            const finalPath: L.LatLng[] = [];
            
            // Check if we can batch the entire polygon (common case)
            const allSnappable = points.every((p, i) => {
                const next = points[(i + 1) % points.length];
                const dist = L.latLng(p).distanceTo(L.latLng(next));
                return dist >= 10 && dist <= 2000;
            });

            if (allSnappable && points.length < 100) {
                const coordsString = [...points, points[0]].map(p => `${p.lng},${p.lat}`).join(';');
                const res = await fetch(`https://router.project-osrm.org/route/v1/walking/${coordsString}?overview=full&geometries=geojson`);
                const data = await res.json();

                if (data.code === 'Ok' && data.routes?.[0]) {
                    const route = data.routes[0];
                    const routeDist = route.distance;

                    // Sanity check: Compare route distance to straight-line perimeter
                    let straightDist = 0;
                    points.forEach((p, idx) => {
                        straightDist += L.latLng(p).distanceTo(L.latLng(points[(idx + 1) % points.length]));
                    });

                    // If the total route is within 1.5x of the straight line, accept it
                    if (routeDist <= straightDist * 1.5) {
                        const routeCoords = route.geometry.coordinates;
                        finalPath.push(...routeCoords.map((c: any) => L.latLng(c[1], c[0])));
                    }
                }
            }
            
            // If shortcut was not used or failed sanity check, fall back to segment-by-segment
            if (finalPath.length === 0) {
                for (let i = 0; i < points.length; i++) {
                    const start = points[i];
                    const end = points[(i + 1) % points.length];
                    const dist = L.latLng(start).distanceTo(L.latLng(end));

                    if (dist >= 10 && dist <= 2000) {
                        try {
                            const res = await fetch(`https://router.project-osrm.org/route/v1/walking/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`);
                            const data = await res.json();
                            if (data.code === 'Ok' && data.routes?.[0]) {
                                const route = data.routes[0];
                                // Sanity check: Ensure route isn't excessively long (e.g. snapping across non-routable areas)
                                if (route.distance <= dist * 1.5) {
                                    const routeCoords = route.geometry.coordinates;
                                    const segmentLatLngs = routeCoords.map((c: any) => L.latLng(c[1], c[0]));
                                    if (finalPath.length > 0) {
                                        finalPath.push(...segmentLatLngs.slice(1)); // Avoid duplicating boundary point
                                    } else {
                                        finalPath.push(...segmentLatLngs);
                                    }
                                    continue;
                                }
                            }
                        } catch (e) { /* fallback to straight line */ }
                    }

                    if (finalPath.length === 0) finalPath.push(L.latLng(start.lat, start.lng));
                    finalPath.push(L.latLng(end.lat, end.lng));
                }
            }

            if (finalPath.length > 0) {
                // Remove duplicate adjacent points if any
                const uniquePath = finalPath.filter((p, i) =>
                    i === 0 || p.lat !== finalPath[i-1].lat || p.lng !== finalPath[i-1].lng
                );
                layer.setLatLngs(uniquePath);
            }
        }
    } catch (e) {
        console.warn("Auto-refine failed", e);
    }

    // Finalize Metadata
    const finalFeature = layer.toGeoJSON();
    finalFeature.properties = {
        name,
        id: `z_${Date.now()}`,
        mode: snapToRoadsRef.current ? 'AI_ASSISTED' : 'MANUAL',
        timestamp: new Date().toISOString()
    };
    
    layersRef.current?.removeLayer(layer);
    L.geoJSON(finalFeature, {
        onEachFeature: (f, l) => { if (l instanceof L.Polygon) layersRef.current?.addLayer(l); }
    }).addTo(mapRef.current!);

    rebuildVertexCache();
    // PERF: Only call toGeoJSON() once and reuse the result
    const currentGeoJSON = layersRef.current!.toGeoJSON() as FeatureCollection;
    onChange(currentGeoJSON);
    checkTopology(currentGeoJSON);
    setIsProcessing(false);
  };

  // --- 4. Initialization ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // FIX: Guard clause - ensure container exists before loading map
    if (mapRef.current || !mapContainerRef.current) return;

    import('leaflet-draw').then(() => {
      // FIX: Use the ref instead of string ID
      if (!mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, { zoomControl: false } as any).setView([36.1911, 44.0092], 13);
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
      
      const drawnItems = new L.FeatureGroup().addTo(map);
      const snapGuides = new L.LayerGroup().addTo(map);

      layersRef.current = drawnItems;
      snapLayerRef.current = snapGuides;
      (map as any)._layers = { street: streetLayer, sat: satLayer };

      const drawControl = new (L as any).Control.Draw({
        edit: { featureGroup: drawnItems, poly: { allowIntersection: false } },
        draw: {
          polygon: { 
            allowIntersection: false, showArea: true, guidelineDistance: 15,
            shapeOptions: { color: '#3b82f6', weight: 3, fillOpacity: 0.2, dashArray: '5, 5' }
          },
          rectangle: false, circle: false, marker: false, polyline: false, circlemarker: false
        }
      });
      map.addControl(drawControl);

      if (geojson && geojson.features.length > 0) {
        L.geoJSON(geojson, {
          onEachFeature: (f, l) => { if (l instanceof L.Polygon) drawnItems.addLayer(l); }
        });
        rebuildVertexCache();
      }

      // --- Snapping Engine (Ghost Marker) ---
      const fetchRoadSnap = debounce(async (lat: number, lng: number) => {
        try {
          const res = await fetch(`https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`);
          const data = await res.json();
          if (data.code === 'Ok' && data.waypoints?.[0]) {
            const road = data.waypoints[0].location;
            const roadLatLng = L.latLng(road[1], road[0]);
            if (map.distance(roadLatLng, L.latLng(lat, lng)) < 60) {
              CURRENT_SNAP = roadLatLng;
              snapGuides.clearLayers();
              L.circleMarker(roadLatLng, { radius: 8, color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.8, weight: 2 }).addTo(snapGuides);
              L.polyline([[lat, lng], roadLatLng], { color: '#2563eb', weight: 1, dashArray: '4,4' }).addTo(snapGuides);
            } else { if (!CURRENT_SNAP) snapGuides.clearLayers(); }
          }
        } catch (e) { /* silent */ }
      }, 100);

      map.on('mousemove', (e: L.LeafletMouseEvent) => {
        CURRENT_SNAP = null;
        
        // FIX: Check Vertex Snap Ref
        if (snapToVerticesRef.current && vertexCacheRef.current.length > 0) {
          let nearestDist = Infinity;
          let nearestV: VertexCacheItem | null = null;
          for (const v of vertexCacheRef.current) {
            const dist = map.distance(e.latlng, L.latLng(v.lat, v.lng));
            if (dist < 30 && dist < nearestDist) { nearestDist = dist; nearestV = v; }
          }
          if (nearestV) {
            const vLatLng = L.latLng(nearestV.lat, nearestV.lng);
            CURRENT_SNAP = vLatLng;
            snapGuides.clearLayers();
            L.circleMarker(vLatLng, { radius: 10, color: '#9333ea', fillColor: '#c084fc', fillOpacity: 0.8, weight: 2 }).addTo(snapGuides);
            return;
          }
        }
        
        // FIX: Check Road Snap Ref
        if (snapToRoadsRef.current) fetchRoadSnap(e.latlng.lat, e.latlng.lng);
      });

      map.on('draw:drawvertex', (e: any) => {
        if (CURRENT_SNAP) {
          const markers = e.layers.getLayers(); 
          const lastMarker = markers[markers.length - 1];
          lastMarker.setLatLng(CURRENT_SNAP);
        }
        snapGuides.clearLayers();
        CURRENT_SNAP = null;
      });

      // --- Polygon Created ---
      map.on(L.Draw.Event.CREATED, async (e: any) => {
        const layer = e.layer;
        // Use standard window.prompt
        const name = window.prompt("Zone Name:") || `Zone_${Date.now().toString().slice(-4)}`;
        layersRef.current?.addLayer(layer);
        
        // AUTO-SNAP TRIGGER
        await refineGeometry(layer, name);
        snapGuides.clearLayers();
      });

      map.on('draw:edited', () => {
        rebuildVertexCache();
        const currentGeoJSON = drawnItems.toGeoJSON() as FeatureCollection;
        onChange(currentGeoJSON);
        checkTopology(currentGeoJSON);
      });
      map.on('draw:deleted', () => { rebuildVertexCache(); onChange(drawnItems.toGeoJSON() as FeatureCollection); });

      mapRef.current = map;
    });
  }, []); 

  const toggleSat = () => {
    if (!mapRef.current) return;
    const m = mapRef.current as any;
    if (isSatellite) { m.removeLayer(m._layers.sat); m.addLayer(m._layers.street); } 
    else { m.removeLayer(m._layers.street); m.addLayer(m._layers.sat); }
    setIsSatellite(!isSatellite);
  };

  return (
    <div className="h-full w-full relative group">
      {/* 3. FIX: Attach the ref to the div and remove the ID */}
      <div ref={mapContainerRef} className="h-full w-full cursor-crosshair z-0" />
      
      {/* HUD Panel */}
      <div className={`absolute top-4 right-4 z-[1000] bg-white rounded-2xl shadow-xl p-2 transition-all duration-300 border border-slate-200 ${isHudCollapsed ? 'w-12 h-12 overflow-hidden' : 'w-64'}`}>
        <div className="flex justify-between items-center px-2 py-1 mb-2">
          {!isHudCollapsed && (
             <div className="text-[10px] font-bold text-slate-400 uppercase">
               AI Architect <span className={isProcessing ? "animate-pulse text-purple-600 ml-2" : "hidden"}>ACTIVE</span>
             </div>
          )}
          <button onClick={() => setIsHudCollapsed(!isHudCollapsed)} className="hover:bg-slate-100 p-1 rounded-full">
            {isHudCollapsed ? <Maximize2 className="h-4 w-4 text-slate-600" /> : <Minimize2 className="h-3 w-3 text-slate-400" />}
          </button>
        </div>
        
        {!isHudCollapsed && (
          <div className="space-y-2">
            <button onClick={() => setSnapToVertices(!snapToVertices)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${snapToVertices ? 'bg-purple-100 text-purple-700' : 'bg-slate-50 text-slate-500'}`}>
              <Merge className="h-3 w-3" /> Vertex Magnet <div className={`ml-auto w-2 h-2 rounded-full ${snapToVertices ? 'bg-purple-500' : 'bg-slate-300'}`} />
            </button>
            <button onClick={() => setSnapToRoads(!snapToRoads)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${snapToRoads ? 'bg-blue-100 text-blue-700' : 'bg-slate-50 text-slate-500'}`}>
              <Zap className="h-3 w-3" /> Auto-Align Grid <div className={`ml-auto w-2 h-2 rounded-full ${snapToRoads ? 'bg-blue-500' : 'bg-slate-300'}`} />
            </button>
          </div>
        )}
      </div>

      <button onClick={toggleSat} className="absolute bottom-6 right-6 z-[1000] bg-white px-4 py-2 rounded-xl shadow-2xl border flex items-center gap-2 hover:bg-slate-50">
        {isSatellite ? <MapIcon className="h-4 w-4 text-blue-500" /> : <Satellite className="h-4 w-4 text-slate-400" />}
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">{isSatellite ? 'Street Map' : 'Satellite'}</span>
      </button>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 backdrop-blur text-white px-6 py-2 rounded-full shadow-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-3 border border-slate-700">
          <div className={`w-2 h-2 rounded-full ${statusMsg.includes('overlap') ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
          {statusMsg}
      </div>
      
      {isProcessing && (
        <div className="absolute inset-0 z-[2000] bg-white/50 backdrop-blur-[2px] flex items-center justify-center">
            <div className="bg-white p-4 rounded-full shadow-2xl flex items-center gap-3 border border-purple-100 animate-in zoom-in duration-200">
                <Loader2 className="h-6 w-6 text-purple-600 animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest text-slate-800">Aligning to Roads...</span>
            </div>
        </div>
      )}
    </div>
  );
}
