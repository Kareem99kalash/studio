'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Scissors, Trash2, Download, MousePointerClick, UploadCloud, Magnet, Car, Loader2, CheckCircle2 } from 'lucide-react';
import Papa from 'papaparse';
import * as turf from '@turf/turf';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// --- IMPORTS ---
import L from 'leaflet';
if (typeof window !== 'undefined') {
    require('leaflet-draw');
}

// Dynamic Components
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
// ✅ FIXED: Renamed to avoid TS conflict with global GeoJSON types
const LeafletGeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false });

// OSRM Endpoint
const OSRM_ROUTER_URL = process.env.NEXT_PUBLIC_OSRM_ERBIL || "https://router.project-osrm.org/route/v1/driving";

// --- DRAW CONTROL (The Brain) ---
function DrawControl({ 
    setPolygons, 
    snapMode,
    roadMode,
    setProcessing
}: { 
    setPolygons: React.Dispatch<React.SetStateAction<any[]>>, 
    snapMode: boolean,
    roadMode: boolean,
    setProcessing: (b: boolean) => void
}) {
    const { useMap } = require('react-leaflet');
    const map = useMap();
    const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

    useEffect(() => {
        if (!map) return;
        if (drawnItemsRef.current) return;

        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);
        drawnItemsRef.current = drawnItems;

        // ✅ FIXED: Cast L.Control to any to fix "Property Draw does not exist"
        const drawControl = new (L.Control as any).Draw({
            edit: {
                featureGroup: drawnItems, 
                remove: false, 
                edit: true 
            },
            draw: {
                rectangle: false, circle: false, circlemarker: false, marker: false, polyline: false,
                polygon: {
                    allowIntersection: false,
                    showArea: true,
                    guidelineDistance: 20,
                    snapDistance: 20, 
                }
            }
        });
        map.addControl(drawControl);

        // --- EVENTS ---
        
        // ✅ FIXED: Cast L to any for the Event constants
        map.on((L as any).Draw.Event.CREATED, async (e: any) => {
            const layer = e.layer;
            let geoJson = layer.toGeoJSON();
            
            if (roadMode) {
                setProcessing(true);
                const rawCoords = geoJson.geometry.coordinates[0];
                const waypoints = rawCoords.map((c: any) => `${c[0]},${c[1]}`).join(';');
                try {
                    const res = await fetch(`${OSRM_ROUTER_URL}/${waypoints}?geometries=geojson&overview=full`);
                    const data = await res.json();
                    if (data.routes?.[0]) {
                        const routeCoords = data.routes[0].geometry.coordinates;
                        if (routeCoords[0][0] !== routeCoords[routeCoords.length-1][0]) routeCoords.push(routeCoords[0]);
                        geoJson.geometry.coordinates = [routeCoords];
                        
                        // Visual update
                        const newLatLngs = routeCoords.map((c: any) => [c[1], c[0]]);
                        layer.setLatLngs(newLatLngs);
                    }
                } catch(err) { console.warn("Road snap failed", err); }
                setProcessing(false);
            }

            const id = `Zone-${Date.now()}`;
            geoJson.properties = { id, name: "New Zone", area: Math.round(turf.area(geoJson)) };
            
            // Clear from draw layer immediately so React can render it instead
            drawnItems.removeLayer(layer);
            setPolygons(prev => [...prev, geoJson]);
        });

        // Cleanup
        return () => {
             map.removeControl(drawControl);
             map.removeLayer(drawnItems);
        };

    }, [map, roadMode, snapMode, setProcessing, setPolygons]); 

    return null;
}

export default function MapArchitectPage() {
  const { toast } = useToast();
  
  const [polygons, setPolygons] = useState<any[]>([]);
  const [snapMode, setSnapMode] = useState(true);
  const [roadMode, setRoadMode] = useState(false);
  const [trimMode, setTrimMode] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  const [cutterId, setCutterId] = useState<string | null>(null);

  // --- ACTIONS ---
  const handleNameChange = (index: number, newName: string) => {
      setPolygons(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], properties: { ...updated[index].properties, name: newName }};
          return updated;
      });
  };

  const deletePolygon = (index: number) => {
      setPolygons(prev => prev.filter((_, i) => i !== index));
  };

  // --- TRIM LOGIC ---
  const handleMapClickAction = (clickedId: string) => {
      if (!trimMode) return;

      if (!cutterId) {
          // 1. Select MASTER (The one staying)
          setCutterId(clickedId);
          toast({ title: "Master Zone Selected", description: "Now click the zone you want to CUT." });
      } else {
          // 2. Select TARGET (The one shrinking)
          if (clickedId === cutterId) {
              setCutterId(null);
              return;
          }

          const masterPoly = polygons.find(p => p.properties.id === cutterId);
          const targetPoly = polygons.find(p => p.properties.id === clickedId);

          if (masterPoly && targetPoly) {
              try {
                  const diff = turf.difference(turf.featureCollection([targetPoly, masterPoly] as any));
                  
                  if (diff) {
                      // ✅ FIXED: Ensure properties object exists and copy old props safely
                      const newProperties = { ...targetPoly.properties };
                      diff.properties = newProperties;
                if (diff) { (diff as any).properties = { ...targetPoly.properties, area: Math.round(turf.area(diff)) }; }
                      
                      setPolygons(prev => prev.map(p => p.properties.id === clickedId ? diff : p));
                      toast({ title: "Trim Successful", description: `Updated ${targetPoly.properties.name}` });
                  } else {
                      toast({ variant: "destructive", title: "Complete Overlap", description: "Target is completely inside Master." });
                  }
              } catch (err) {
                  console.error(err);
                  toast({ variant: "destructive", title: "Trim Error", description: "Geometry complexity error." });
              }
          }
          setCutterId(null);
      }
  };

  const downloadCSV = () => {
     const rows = polygons.map((p) => ({
         PolygonName: p.properties.name,
         Area_M2: p.properties.area,
         WKT: `POLYGON ((${p.geometry.coordinates[0].map((c: any) => `${c[0]} ${c[1]}`).join(', ')}))`
     }));
     const csv = Papa.unparse(rows);
     const blob = new Blob([csv], { type: 'text/csv' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = 'map_architect_zones.csv';
     link.click();
  };

  return (
    <div className="space-y-6">
      {/* HEADER TOOLBAR */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Scissors className="h-6 w-6 text-purple-600"/> Map Architect
            </h1>
            <p className="text-slate-500 text-xs">Draw, Snap, and Trim Territories.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
             <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200">
                <Magnet className={`h-4 w-4 ${snapMode ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-600 hidden md:inline">Magnet</span>
                <Button size="sm" variant={snapMode ? "default" : "outline"} className="h-6 text-[10px]" onClick={() => setSnapMode(!snapMode)}>
                    {snapMode ? "ON" : "OFF"}
                </Button>
             </div>

             <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200">
                <Car className={`h-4 w-4 ${roadMode ? 'text-green-600' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-slate-600 hidden md:inline">Road Snap</span>
                <Button size="sm" variant={roadMode ? "default" : "outline"} className={`h-6 text-[10px] ${roadMode ? "bg-green-600 hover:bg-green-700" : ""}`} onClick={() => setRoadMode(!roadMode)}>
                    {roadMode ? "AUTO" : "MANUAL"}
                </Button>
             </div>

             <Button 
                onClick={() => { setTrimMode(!trimMode); setCutterId(null); }} 
                variant={trimMode ? "destructive" : "secondary"} 
                className={`h-9 border ${trimMode ? "animate-pulse ring-2 ring-red-200" : "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"}`}
             >
                 <Scissors className="mr-2 h-4 w-4" /> 
                 {trimMode ? "Exit Trim Tool" : "Trim Tool"}
             </Button>

             <Button onClick={downloadCSV} className="bg-slate-900 hover:bg-slate-800 h-9">
                <Download className="mr-2 h-4 w-4" /> Export
             </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6 h-[700px]">
         {/* SIDEBAR */}
         <Card className="md:col-span-1 border-t-4 border-t-purple-600 h-full flex flex-col">
            <CardContent className="p-4 flex-1 overflow-auto">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                    <span className="flex items-center"><UploadCloud className="mr-2 h-4 w-4"/> Zones</span>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">{polygons.length}</span>
                </h3>

                {trimMode && (
                    <div className="mb-4 bg-orange-50 border border-orange-200 p-3 rounded text-xs text-orange-800 animate-in fade-in slide-in-from-top-2">
                        <strong>Trim Tool Active:</strong>
                        <ol className="list-decimal ml-4 mt-1 space-y-1">
                            <li>Click the <span className="text-green-600 font-bold">Master Zone</span> (Keeps shape).</li>
                            <li>Click the <span className="text-purple-600 font-bold">Target Zone</span> (Gets cut).</li>
                        </ol>
                    </div>
                )}
                
                {polygons.length === 0 ? (
                    <div className="text-center text-slate-400 text-sm mt-10">
                        <MousePointerClick className="h-10 w-10 mx-auto mb-2 opacity-20"/>
                        Select the <b>Pentagon Tool</b> on the map.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {polygons.map((p, i) => (
                            <div key={p.properties.id} className={`p-3 border rounded-lg transition group relative ${cutterId === p.properties.id ? 'bg-green-50 border-green-500 ring-1 ring-green-500' : 'bg-slate-50 hover:border-purple-300'}`}>
                                <div className="mb-2">
                                    <Input 
                                        className="h-7 text-xs font-bold bg-white" 
                                        value={p.properties.name} 
                                        onChange={(e) => handleNameChange(i, e.target.value)}
                                        placeholder="Name this zone..."
                                    />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-slate-500 font-mono">
                                        {p.properties.area?.toLocaleString()} m²
                                    </span>
                                    <button onClick={() => deletePolygon(i)} className="text-slate-400 hover:text-red-500">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                                {cutterId === p.properties.id && (
                                    <div className="absolute top-2 right-2 text-green-600">
                                        <CheckCircle2 className="h-4 w-4" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
         </Card>

         {/* MAP AREA */}
         <Card className="md:col-span-3 h-full border-0 shadow-none">
            <div className="h-full rounded-xl overflow-hidden border-2 border-slate-300 relative shadow-inner">
                {processing && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-xl">
                        <Loader2 className="animate-spin h-3 w-3" /> Snapping to Roads...
                    </div>
                )}

                <MapContainer center={[36.19, 44.01]} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    
                    <DrawControl 
                        key={roadMode ? 'road' : 'normal'}
                        setPolygons={setPolygons} 
                        snapMode={snapMode} 
                        roadMode={roadMode} 
                        setProcessing={setProcessing}
                    />

                    {polygons.map((geo, i) => {
                        const isMaster = cutterId === geo.properties.id;
                        return (
                            <LeafletGeoJSON 
                                key={`poly-${geo.properties.id}-${geo.properties.area}`} 
                                data={geo} 
                                style={{ 
                                    color: isMaster ? '#22c55e' : '#7c3aed', 
                                    weight: 2, 
                                    fillOpacity: isMaster ? 0.4 : 0.2 
                                }} 
                                eventHandlers={{
                                    click: () => handleMapClickAction(geo.properties.id)
                                }}
                            />
                        );
                    })}
                </MapContainer>
            </div>
         </Card>
      </div>
    </div>
  );
}
