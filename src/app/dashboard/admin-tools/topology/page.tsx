'use client';

import { useState, useMemo, useEffect, useRef } from 'react'; // <--- 1. Added useRef
import Papa from 'papaparse';
import * as turf from '@turf/turf';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UploadCloud, Layers, AlertTriangle, CheckCircle, Loader2, Map as MapIcon, Table as TableIcon, GitCompare, ZoomIn, Trash2 } from 'lucide-react'; // <--- Added Trash2
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useMap } from 'react-leaflet'; 

// Dynamic Leaflet
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false });
const FeatureGroup = dynamic(() => import('react-leaflet').then(m => m.FeatureGroup), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

import 'leaflet/dist/leaflet.css';

// Types
interface PolygonFeature {
  id: string;
  name: string;
  geometry: any; 
  isValid: boolean;
  kinks: any[];
}

interface OverlapResult {
  id: string;
  p1: string;
  p2: string;
  area: string;
  geometry: any;
  center: [number, number]; 
}

// 🧠 INTERNAL COMPONENT: Zoom Handler
function MapController({ target }: { target: [number, number] | null }) {
    const map = useMap(); 
    useEffect(() => {
        if (target) {
            map.flyTo(target, 16, { animate: true, duration: 1.5 });
        }
    }, [target, map]);
    return null;
}

export default function TopologyCheckPage() {
  const [dataA, setDataA] = useState<PolygonFeature[]>([]);
  const [dataB, setDataB] = useState<PolygonFeature[]>([]);
  
  const [overlaps, setOverlaps] = useState<OverlapResult[]>([]);
  const [invalidPolys, setInvalidPolys] = useState<any[]>([]);
  
  const [checking, setChecking] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [activeTab, setActiveTab] = useState("map");
  
  const [zoomTarget, setZoomTarget] = useState<[number, number] | null>(null);

  // 2. REFS FOR INPUTS (To clear them programmatically)
  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Initial Bounds
  const mapBounds = useMemo(() => {
    const allData = [...dataA, ...(compareMode ? dataB : [])];
    if (allData.length === 0) return null;
    try {
        const fc = turf.featureCollection(allData.map(d => turf.feature(d.geometry)));
        const bbox = turf.bbox(fc);
        return [[bbox[1], bbox[0]], [bbox[3], bbox[2]]] as any;
    } catch { return null; }
  }, [dataA, dataB, compareMode]);

  // 3. THE CLEAR FUNCTION
  const handleClearMap = () => {
    // A. Reset Data States
    setDataA([]);
    setDataB([]);
    setOverlaps([]);
    setInvalidPolys([]);
    
    // B. Reset File Inputs (Crucial to allow re-uploading same file)
    if (fileInputARef.current) fileInputARef.current.value = "";
    if (fileInputBRef.current) fileInputBRef.current.value = "";
  };

  const parseFile = (file: File, target: 'A' | 'B') => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const parsed: PolygonFeature[] = res.data.map((row: any, i: number) => {
          try {
            const wkt = row.WKT || row.geometry || row.wkt || row.geom;
            if (!wkt || typeof wkt !== 'string') return null;

            const rawCoords = wkt.replace(/^[A-Z]+\s*\(+/, '').replace(/\)+$/, '');
            const pairs = rawCoords.split(',').map((pair: string) => {
                const parts = pair.trim().split(/\s+/);
                return [parseFloat(parts[0]), parseFloat(parts[1])]; 
            });

            if (pairs[0][0] !== pairs[pairs.length-1][0] || pairs[0][1] !== pairs[pairs.length-1][1]) {
                pairs.push(pairs[0]);
            }

            const poly = turf.polygon([pairs]);
            const kinks = turf.kinks(poly);
            
            return {
              id: row.PolygonID || row.id || `${target}-${i}`,
              name: row.PolygonName || row.name || `Zone ${i}`,
              geometry: poly.geometry,
              isValid: kinks.features.length === 0,
              kinks: kinks.features
            };
          } catch { return null; }
        }).filter((f): f is PolygonFeature => f !== null);

        if (target === 'A') setDataA(parsed);
        else setDataB(parsed);
      }
    });
  };

  const runDiagnostics = () => {
    setChecking(true);
    setTimeout(() => {
        const foundOverlaps: OverlapResult[] = [];
        const foundInvalid: any[] = [];
        const targetData = dataA; 

        // Check Invalid
        targetData.forEach(f => {
            if (!f.isValid) {
                foundInvalid.push({
                    id: f.id,
                    name: f.name,
                    issue: "Self-Intersection",
                    points: f.kinks,
                    center: [f.geometry.coordinates[0][0][1], f.geometry.coordinates[0][0][0]] // Approx center
                });
            }
        });

        // Check Overlaps
        for (let i = 0; i < targetData.length; i++) {
            for (let j = i + 1; j < targetData.length; j++) {
                const f1 = targetData[i];
                const f2 = targetData[j];
                try {
                    const intersection = turf.intersect(turf.featureCollection([turf.feature(f1.geometry), turf.feature(f2.geometry)]));
                    if (intersection) {
                        const area = turf.area(intersection);
                        if (area > 10) { 
                            const center = turf.centroid(intersection);
                            foundOverlaps.push({
                                id: `ov-${i}-${j}`,
                                p1: f1.name, p2: f2.name,
                                area: area.toFixed(2),
                                geometry: intersection.geometry,
                                center: [center.geometry.coordinates[1], center.geometry.coordinates[0]] as [number, number]
                            });
                        }
                    }
                } catch (e) { console.warn(e); }
            }
        }
        
        setOverlaps(foundOverlaps);
        setInvalidPolys(foundInvalid);
        setChecking(false);
        setActiveTab("issues"); // Show table first
    }, 100);
  };

  const focusOnIssue = (center: [number, number]) => {
      setZoomTarget(center);
      setActiveTab("map");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Layers className="h-6 w-6 text-purple-600"/> Topology Architect
            </h1>
            <p className="text-slate-500 text-xs">Integrity Checker & Map Comparator</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border">
            <Switch checked={compareMode} onCheckedChange={setCompareMode} id="mode-switch" />
            <Label htmlFor="mode-switch" className="flex items-center gap-2 cursor-pointer font-bold text-sm text-slate-700">
                <GitCompare className="h-4 w-4" /> Compare Mode
            </Label>
        </div>
      </div>
      
      <div className="grid md:grid-cols-4 gap-6">
        {/* SIDEBAR */}
        <Card className="md:col-span-1 h-fit border-t-4 border-t-blue-500">
            <CardContent className="p-4 space-y-6">
                
                <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-400 uppercase">
                        {compareMode ? "Base Map (Layer A)" : "Upload Map Data"}
                    </Label>
                    <div className="border-dashed border-2 p-4 rounded-lg bg-blue-50/50 hover:bg-blue-50 transition relative text-center">
                        <UploadCloud className="h-6 w-6 mx-auto text-blue-400 mb-1" />
                        <span className="text-xs font-bold text-blue-700">Select CSV</span>
                        
                        {/* 4. ATTACH REF TO INPUT A */}
                        <input 
                            ref={fileInputARef}
                            type="file" 
                            accept=".csv" 
                            onChange={e => e.target.files?.[0] && parseFile(e.target.files[0], 'A')} 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                        />
                    </div>
                    {dataA.length > 0 && <div className="text-xs text-center font-mono text-green-600">Loaded {dataA.length} zones</div>}
                </div>

                {compareMode && (
                    <div className="space-y-2 pt-4 border-t">
                        <Label className="text-xs font-bold text-slate-400 uppercase">Comparison Map (Layer B)</Label>
                        <div className="border-dashed border-2 p-4 rounded-lg bg-orange-50/50 hover:bg-orange-50 transition relative text-center">
                            <UploadCloud className="h-6 w-6 mx-auto text-orange-400 mb-1" />
                            <span className="text-xs font-bold text-orange-700">Select CSV</span>
                            
                            {/* 4. ATTACH REF TO INPUT B */}
                            <input 
                                ref={fileInputBRef}
                                type="file" 
                                accept=".csv" 
                                onChange={e => e.target.files?.[0] && parseFile(e.target.files[0], 'B')} 
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                            />
                        </div>
                        {dataB.length > 0 && <div className="text-xs text-center font-mono text-green-600">Loaded {dataB.length} zones</div>}
                    </div>
                )}

                <div className="space-y-3 pt-2">
                    <Button onClick={runDiagnostics} disabled={checking || dataA.length === 0} className="w-full bg-slate-900 hover:bg-slate-800">
                        {checking ? <Loader2 className="animate-spin h-4 w-4" /> : "Run Diagnostics"}
                    </Button>

                    {/* 5. NEW CLEAR BUTTON */}
                    {(dataA.length > 0 || dataB.length > 0) && (
                        <Button 
                            variant="ghost" 
                            onClick={handleClearMap} 
                            className="w-full text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                            <Trash2 className="h-4 w-4 mr-2" /> Clear Map Data
                        </Button>
                    )}
                </div>

                {(overlaps.length > 0 || invalidPolys.length > 0) && (
                    <div className="bg-red-50 p-3 rounded text-xs space-y-1 border border-red-100">
                        <div className="font-bold text-red-800 flex items-center gap-2"><AlertTriangle className="h-3 w-3"/> Issues Found</div>
                        <div>Overlaps: <b>{overlaps.length}</b></div>
                        <div>Invalid Shapes: <b>{invalidPolys.length}</b></div>
                    </div>
                )}
            </CardContent>
        </Card>

        {/* MAIN TABS */}
        <div className="md:col-span-3">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="mb-3">
                    <TabsTrigger value="issues"><TableIcon className="h-4 w-4 mr-2" /> Issue Log <Badge variant="secondary" className="ml-2 bg-red-100 text-red-700">{overlaps.length + invalidPolys.length}</Badge></TabsTrigger>
                    <TabsTrigger value="map"><MapIcon className="h-4 w-4 mr-2" /> Visual Inspector</TabsTrigger>
                </TabsList>

                {/* 🗺️ MAP TAB */}
                <TabsContent value="map">
                    <Card className="border-0 shadow-none">
                        <div className="h-[650px] rounded-xl overflow-hidden border-2 border-slate-300 relative shadow-inner bg-slate-100">
                            {dataA.length > 0 ? (
                                <MapContainer bounds={mapBounds || [[36.1, 43.9], [36.3, 44.1]]} style={{ height: '100%', width: '100%' }}>
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                                    
                                    {/* 🧠 ZOOM CONTROLLER */}
                                    <MapController target={zoomTarget} />
                                    
                                    {/* Layer A (Base) */}
                                    <FeatureGroup>
                                        {dataA.map((f, i) => (
                                            <GeoJSON 
                                                key={`A-${i}`} 
                                                data={f.geometry} 
                                                style={{ color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.1 }}
                                            >
                                                <Popup><b className="text-blue-600">Layer A: {f.name}</b></Popup>
                                            </GeoJSON>
                                        ))}
                                    </FeatureGroup>

                                    {/* Layer B (Compare) */}
                                    {compareMode && (
                                        <FeatureGroup>
                                            {dataB.map((f, i) => (
                                                <GeoJSON 
                                                    key={`B-${i}`} 
                                                    data={f.geometry} 
                                                    style={{ color: '#f97316', weight: 2, fillColor: '#f97316', fillOpacity: 0.2, dashArray: '5, 5' }}
                                                >
                                                    <Popup><b className="text-orange-600">Layer B: {f.name}</b></Popup>
                                                </GeoJSON>
                                            ))}
                                        </FeatureGroup>
                                    )}

                                    {/* 🔴 OVERLAPS (Visible on Top) */}
                                    <FeatureGroup>
                                        {overlaps.map((o, i) => (
                                            <GeoJSON 
                                                key={`ov-${i}`} 
                                                data={o.geometry} 
                                                style={{ 
                                                    color: '#ffff00', // Yellow Border
                                                    weight: 3, 
                                                    fillColor: '#ff0000', // Red Fill
                                                    fillOpacity: 0.8 
                                                }}
                                            >
                                                <Popup>
                                                    <div className="text-red-600 font-bold">⚠️ OVERLAP DETECTED</div>
                                                    <div className="text-xs">Between: <b>{o.p1}</b> and <b>{o.p2}</b></div>
                                                    <div className="text-xs">Area: {o.area} m²</div>
                                                </Popup>
                                            </GeoJSON>
                                        ))}
                                    </FeatureGroup>

                                </MapContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <MapIcon className="h-16 w-16 mb-4 opacity-20" />
                                    <p>Upload a map to visualize</p>
                                </div>
                            )}
                            
                            {/* Legend */}
                            <div className="absolute bottom-6 right-6 bg-white p-4 rounded-lg shadow-xl z-[1000] text-xs space-y-2 border border-slate-200">
                                <div className="font-bold text-slate-800 mb-1 border-b pb-1">Legend</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-100 border-2 border-blue-500 rounded-sm"></div> Reference (A)</div>
                                {compareMode && <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-100 border-2 border-orange-500 border-dashed rounded-sm"></div> Comparison (B)</div>}
                                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-600 border-2 border-yellow-400 rounded-sm"></div> Overlap (Conflict)</div>
                            </div>
                        </div>
                    </Card>
                </TabsContent>

                {/* 📋 ISSUES TAB */}
                <TabsContent value="issues">
                    <Card>
                        <CardContent className="p-0">
                            {overlaps.length === 0 && invalidPolys.length === 0 ? (
                                <div className="p-10 text-center text-green-600">
                                    <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50"/>
                                    <h3 className="font-bold text-lg">Topology is Clean</h3>
                                    <p className="text-sm">No critical issues detected.</p>
                                </div>
                            ) : (
                                <div className="max-h-[600px] overflow-auto">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Zones</TableHead><TableHead>Details</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {invalidPolys.map((inv, i) => (
                                                <TableRow key={`inv-${i}`} className="bg-orange-50 hover:bg-orange-100">
                                                    <TableCell><Badge variant="destructive">Invalid</Badge></TableCell>
                                                    <TableCell className="font-medium">{inv.name}</TableCell>
                                                    <TableCell>Self-intersecting points</TableCell>
                                                    <TableCell>
                                                        <Button size="sm" variant="ghost" onClick={() => focusOnIssue(inv.center)}><ZoomIn className="h-4 w-4 text-slate-600" /></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {overlaps.map((o, i) => (
                                                <TableRow key={o.id} className="bg-red-50 hover:bg-red-100 border-b border-red-100">
                                                    <TableCell><Badge className="bg-red-600 hover:bg-red-700">Overlap</Badge></TableCell>
                                                    <TableCell className="font-medium text-slate-800">{o.p1} <br/><span className="text-[10px] text-slate-500">vs</span><br/> {o.p2}</TableCell>
                                                    <TableCell className="font-mono text-xs">{o.area} m²</TableCell>
                                                    <TableCell>
                                                        <Button size="sm" variant="outline" className="bg-white border-red-200 text-red-700 hover:bg-red-50" onClick={() => focusOnIssue(o.center)}>
                                                            <ZoomIn className="h-4 w-4 mr-2" /> Inspect
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
      </div>
    </div>
  );
}
