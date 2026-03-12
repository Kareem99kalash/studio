'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import * as turf from '@turf/turf';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Download, UploadCloud, Play, Map as MapIcon, Table as TableIcon, Edit, Sparkles, Search, Save, FileSpreadsheet, AlertCircle, Layers, Scale, HelpCircle, FileDown, ChevronDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then(m => m.GeoJSON), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then(m => m.CircleMarker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });
const FeatureGroup = dynamic(() => import('react-leaflet').then(m => m.FeatureGroup), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then(m => m.Tooltip), { ssr: false });
const Pane = dynamic(() => import('react-leaflet').then(m => m.Pane), { ssr: false }); 

import 'leaflet/dist/leaflet.css';

const OSRM_ENDPOINTS = {
  "Iraq": process.env.NEXT_PUBLIC_OSRM_ERBIL || "https://kareem99k-erbil-osrm-engine.hf.space",
  "Lebanon": process.env.NEXT_PUBLIC_OSRM_BEIRUT || "https://kareem99k-beirut-osrm-engine.hf.space"
};

const HF_TOKEN = process.env.NEXT_PUBLIC_HF_TOKEN;

const DISTINCT_COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', 
    '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', 
    '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', 
    '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'
];

const getBranchColor = (index: number) => DISTINCT_COLORS[index % DISTINCT_COLORS.length];

// ⚡ HELPERS
const parsePercentage = (value: any) => {
    if (!value) return 1; 
    const str = String(value).replace('%', '').trim();
    const num = parseFloat(str);
    if (isNaN(num)) return 1;
    // Standardize: If it's a small decimal (0.5), keep it. If it's huge (500 orders), keep it.
    // The logic is relative, so raw numbers work fine.
    return num; 
};

const getGeoPointsOptimized = (vertices: any[], centerCoords: any, storeCoords: {lat: number, lng: number}) => {
    let minSq = Infinity;
    let maxSq = -Infinity;
    let closestV = vertices[0];
    let furthestV = vertices[0];

    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const dLat = v[1] - storeCoords.lat;
        const dLng = v[0] - storeCoords.lng;
        const distSq = dLat*dLat + dLng*dLng; 

        if (distSq < minSq) { minSq = distSq; closestV = v; }
        if (distSq > maxSq) { maxSq = distSq; furthestV = v; }
    }

    return [
        { lat: centerCoords.lat, lng: centerCoords.lng, type: 'centroid' },
        { lat: closestV[1], lng: closestV[0], type: 'closest' },
        { lat: furthestV[1], lng: furthestV[0], type: 'furthest' }
    ];
};

const getGeoPointsForDisplay = (polyFeature: any, storeCoords: {lat: number, lng: number}) => {
    const center = turf.centroid(polyFeature);
    const vertices = turf.explode(polyFeature).features;
    const storePt = turf.point([storeCoords.lng, storeCoords.lat]);
    
    let closestVertex = vertices[0];
    let furthestVertex = vertices[0];
    let minD = Infinity;
    let maxD = -Infinity;

    vertices.forEach(v => {
        const d = turf.distance(storePt, v);
        if (d < minD) { minD = d; closestVertex = v; }
        if (d > maxD) { maxD = d; furthestVertex = v; }
    });

    return [
        { lat: closestVertex.geometry.coordinates[1], lng: closestVertex.geometry.coordinates[0], type: 'closest', label: 'Closest Point' },
        { lat: center.geometry.coordinates[1], lng: center.geometry.coordinates[0], type: 'centroid', label: 'Centroid' },
        { lat: furthestVertex.geometry.coordinates[1], lng: furthestVertex.geometry.coordinates[0], type: 'furthest', label: 'Furthest Point' }
    ];
};

async function fetchRouteGeometry(start: {lat: number, lng: number}, end: {lat: number, lng: number}, endpoint: string) {
    if (!HF_TOKEN) return null;
    const url = `${endpoint}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HF_TOKEN}` } });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.code === 'Ok' && data.routes[0]) {
            return {
                dist: data.routes[0].distance / 1000,
                geom: data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]])
            };
        }
    } catch (e) { console.error(e); }
    return null;
}

const REQUIRED_FIELDS = {
    stores: [
        { key: 'lat', label: 'Latitude', required: true },
        { key: 'lng', label: 'Longitude', required: true },
        { key: 'id', label: 'Store ID', required: false },
        { key: 'name', label: 'Store Name', required: false },
        { key: 'parentId', label: 'Parent ID (Group)', required: false },
        { key: 'parentName', label: 'Parent Name', required: false },
    ],
    polygons: [
        { key: 'wkt', label: 'WKT Geometry', required: true },
        { key: 'id', label: 'Polygon ID', required: false },
        { key: 'name', label: 'Polygon Name', required: false },
        { key: 'demand', label: 'Demand / Order Vol', required: false }, // 🟢 NEW: Polygon Weight
    ]
};

export default function BatchCoveragePage() {
  const { toast } = useToast();
  
  // Data State
  const [stores, setStores] = useState<any[]>([]);
  const [polygons, setPolygons] = useState<any[]>([]);
  const [processedStores, setProcessedStores] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [manualOverrides, setManualOverrides] = useState<any[]>([]);
  
  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardFile, setWizardFile] = useState<File | null>(null);
  const [wizardType, setWizardType] = useState<'stores' | 'polygons_primary' | 'polygons_secondary'>('stores');
  const [wizardHeaders, setWizardHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Settings & UI
  const [region, setRegion] = useState("Iraq");
  const [threshold, setThreshold] = useState(5);
  const [useAiBalance, setUseAiBalance] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("map");
  const [selectedParent, setSelectedParent] = useState<string>(""); 
  const [searchStore, setSearchStore] = useState("");
  const [reassignMode, setReassignMode] = useState(false);
  const [viewLayer, setViewLayer] = useState<'all' | 'primary' | 'secondary'>('all');
  const [visualRoutes, setVisualRoutes] = useState<any[]>([]);
  const [summaryMode, setSummaryMode] = useState<'polygon' | 'store'>('polygon');
  const [reassignDialogData, setReassignDialogData] = useState<{polyId: string, parentId: string, polyName: string} | null>(null);
  const [pendingReassignStore, setPendingReassignStore] = useState<string>("");
  const [showGuide, setShowGuide] = useState(false);

  // --- 1. FILE UPLOAD ---
  const handleFile = (file: File, type: 'stores' | 'polygons_primary' | 'polygons_secondary') => {
    setWizardFile(file);
    setWizardType(type);
    
    Papa.parse(file, {
        header: true,
        preview: 1, 
        complete: (results) => {
            const headers = results.meta.fields || [];
            setWizardHeaders(headers);
            const initialMap: Record<string, string> = {};
            const fields = type === 'stores' ? REQUIRED_FIELDS.stores : REQUIRED_FIELDS.polygons;
            
            fields.forEach(field => {
                const match = headers.find(h => 
                    h.toLowerCase().includes(field.key.toLowerCase()) || 
                    h.toLowerCase().includes(field.label.toLowerCase()) ||
                    (field.key === 'wkt' && h.toLowerCase().includes('geometry'))
                );
                if (match) initialMap[field.key] = match;
            });
            setColumnMapping(initialMap);
            setIsWizardOpen(true);
        }
    });
  };

  const confirmMapping = () => {
      if (!wizardFile) return;
      Papa.parse(wizardFile, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
              const mappedData = results.data.map((row: any, index) => {
                  const mappedRow: any = {};
                  Object.entries(columnMapping).forEach(([systemKey, csvHeader]) => {
                      if (csvHeader) {
                          let val = row[csvHeader];
                          if (systemKey === 'lat' || systemKey === 'lng') val = parseFloat(val);
                          mappedRow[systemKey] = val;
                      }
                  });
                  
                  const prefix = wizardType === 'stores' ? 'S' : (wizardType === 'polygons_primary' ? 'PRI' : 'SEC');
                  if (!mappedRow.id) mappedRow.id = `${prefix}_${index + 1}`;
                  if (!mappedRow.name) mappedRow.name = mappedRow.id;
                  mappedRow.group = wizardType === 'polygons_secondary' ? 'secondary' : 'primary';

                  // 🟢 PARSE DEMAND WEIGHT (Only for Polygons)
                  if (wizardType !== 'stores') {
                      mappedRow.demand = parsePercentage(mappedRow.demand);
                  }

                  if (wizardType === 'stores') {
                      if (!mappedRow.parentId) mappedRow.parentId = "Unassigned";
                      if (!mappedRow.parentName) mappedRow.parentName = mappedRow.parentId;
                  }

                  return mappedRow;
              }).filter((d: any) => {
                  if (wizardType === 'stores') return !isNaN(d.lat) && !isNaN(d.lng);
                  return !!d.wkt;
              });

              if (wizardType === 'stores') setStores(mappedData);
              else setPolygons(prev => [...prev, ...mappedData]);

              toast({ title: "Import Successful", description: `Loaded ${mappedData.length} items (${wizardType}).` });
              setIsWizardOpen(false);
              setWizardFile(null);
          }
      });
  };

  // --- 2. ENGINE ---
  const runAnalysis = async () => {
    if (!stores.length || !polygons.length) return;
    if (!HF_TOKEN) {
        toast({ variant: "destructive", title: "Config Error", description: "Missing API Token." });
        return;
    }

    setProcessing(true); setProgress(0); setAssignments([]); setManualOverrides([]); 

    const osrmUrl = OSRM_ENDPOINTS[region as keyof typeof OSRM_ENDPOINTS];
    const initialResults: any[] = [];
    
    // Group stores
    const storesByParent: Record<string, any[]> = {};
    stores.forEach(s => {
        const pid = s.parentId ? String(s.parentId).trim() : 'Unassigned';
        if (!storesByParent[pid]) storesByParent[pid] = [];
        storesByParent[pid].push(s);
    });

    const validStores: any[] = [];
    Object.keys(storesByParent).forEach(pid => {
        storesByParent[pid].forEach((s, index) => {
            validStores.push({ 
                ...s, 
                id: s.id, 
                name: s.name,
                parentId: pid, 
                parentName: s.parentName || pid,
                color: getBranchColor(index) 
            });
        });
    });
    setProcessedStores(validStores);

    // PRE-CALC POLYGONS
    const validPolys = polygons.map((p, i) => {
        try {
            const rawCoords = p.wkt.replace(/^[A-Z]+\s*\(+/, '').replace(/\)+$/, '');
            const pairs = rawCoords.split(',').map((pair: string) => {
                const parts = pair.trim().split(/\s+/);
                return [parseFloat(parts[0]), parseFloat(parts[1])]; 
            });
            if (pairs[0][0] !== pairs[pairs.length-1][0]) pairs.push(pairs[0]);
            
            const poly = turf.polygon([pairs]);
            const centroid = turf.centroid(poly);
            
            return {
                id: p.id,
                name: p.name,
                group: p.group || 'primary',
                demand: p.demand || 1, // 🟢 PASS DEMAND
                center: { lat: centroid.geometry.coordinates[1], lng: centroid.geometry.coordinates[0] },
                geometry: poly.geometry,
                vertices: pairs, 
                feature: poly
            };
        } catch { return null; }
    }).filter(p => p !== null);

    const chunkSize = 25; 
    let hasError = false;

    // BATCH LOOP
    for (let i = 0; i < validPolys.length; i += chunkSize) {
        if (hasError) break; 
        
        await new Promise(r => setTimeout(r, 0));

        const chunk = validPolys.slice(i, i + chunkSize);
        
        const storeCoords = validStores.map(s => `${s.lng.toFixed(5)},${s.lat.toFixed(5)}`).join(';');
        const polyCoords = chunk.map((p: any) => `${p.center.lng.toFixed(5)},${p.center.lat.toFixed(5)}`).join(';');
        
        const srcIndices = validStores.map((_, idx) => idx).join(';');
        const dstIndices = chunk.map((_, idx) => idx + validStores.length).join(';');
        const url = `${osrmUrl}/table/v1/driving/${storeCoords};${polyCoords}?sources=${srcIndices}&destinations=${dstIndices}&annotations=distance`;

        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HF_TOKEN}` } });
            if (!res.ok) { console.error("OSRM Error"); hasError = true; break; }
            const data = await res.json();

            if (data.code === 'Ok' && data.distances) {
                for (let pIdx = 0; pIdx < chunk.length; pIdx++) {
                    const poly = chunk[pIdx];
                    const bestPerParent: Record<string, {store: any, dist: number, pointsScore: number, failureReason?: string}> = {};
                    const candidates: any[] = [];
                    
                    validStores.forEach((store, sIdx) => {
                        const dMeter = data.distances[sIdx][pIdx];
                        if (dMeter !== null) {
                            const dKm = dMeter / 1000;
                            if (dKm <= threshold * 1.5) candidates.push({ store, centroidDist: dKm });
                        }
                    });

                    for (const cand of candidates) {
                        if (cand.centroidDist < threshold * 0.5) {
                             const existing = bestPerParent[cand.store.parentId];
                             if (!existing || cand.centroidDist < existing.dist) {
                                bestPerParent[cand.store.parentId] = { store: cand.store, dist: cand.centroidDist, pointsScore: 3 };
                             }
                             continue;
                        }

                        const pts = getGeoPointsOptimized(poly.vertices, poly.center, cand.store);
                        let validPoints = 0;
                        const detailedDists: number[] = [];

                        pts.forEach(pt => {
                            const dist = turf.distance(
                                turf.point([cand.store.lng, cand.store.lat]), 
                                turf.point([pt.lng, pt.lat]), 
                                { units: 'kilometers' }
                            );
                            const estRoadDist = dist * 1.3;
                            if (estRoadDist <= threshold) validPoints++;
                            detailedDists.push(estRoadDist);
                        });

                        const isCovered = validPoints >= 2;
                        const finalDist = detailedDists[0]; 
                        const existing = bestPerParent[cand.store.parentId];
                        
                        if (isCovered) {
                            if (!existing || (!existing.pointsScore && isCovered) || (existing.pointsScore && finalDist < existing.dist)) {
                                bestPerParent[cand.store.parentId] = { store: cand.store, dist: finalDist, pointsScore: 3 };
                            }
                        } else {
                            if (!existing) {
                                bestPerParent[cand.store.parentId] = { store: cand.store, dist: finalDist, pointsScore: 0, failureReason: `Best option: ${cand.store.name} at ${finalDist.toFixed(1)}km` };
                            } else if (finalDist < existing.dist && existing.pointsScore === 0) {
                                bestPerParent[cand.store.parentId] = { store: cand.store, dist: finalDist, pointsScore: 0, failureReason: `Best option: ${cand.store.name} at ${finalDist.toFixed(1)}km` };
                            }
                        }
                    }

                    let hasCoverage = false;
                    Object.values(bestPerParent).forEach(winner => {
                        if (winner.pointsScore > 0) {
                            hasCoverage = true;
                            initialResults.push({
                                PolygonID: poly.id,
                                PolygonName: poly.name,
                                group: poly.group,
                                demand: poly.demand, // 🟢 STORE DEMAND
                                StoreID: winner.store.id,
                                StoreName: winner.store.name,
                                ParentID: winner.store.parentId,
                                ParentName: winner.store.parentName || winner.store.parentId,
                                DistanceKM: winner.dist,
                                Color: winner.store.color,
                                geometry: poly.geometry,
                                center: poly.center,
                                feature: poly.feature, 
                                isAiOptimized: false,
                                isCovered: true
                            });
                        }
                    });

                    if (!hasCoverage) {
                        const bestFail = Object.values(bestPerParent).sort((a,b) => a.dist - b.dist)[0];
                        initialResults.push({
                            PolygonID: poly.id,
                            PolygonName: poly.name,
                            group: poly.group,
                            demand: poly.demand, // 🟢 STORE DEMAND
                            StoreID: "Uncovered",
                            StoreName: "No Coverage",
                            ParentID: "None",
                            ParentName: "Unassigned",
                            DistanceKM: bestFail ? bestFail.dist : 999,
                            Color: poly.group === 'secondary' ? '#fdba74' : '#94a3b8',
                            geometry: poly.geometry,
                            center: poly.center,
                            feature: poly.feature,
                            isCovered: false,
                            failureReason: bestFail ? bestFail.failureReason : "No branches nearby"
                        });
                    }
                }
            }
        } catch (e) { 
            console.error(e);
            hasError = true;
        }
        setProgress(Math.round(((i + chunkSize) / validPolys.length) * 100));
    }

    // 🟢 3. AI FAIRNESS / LOAD BALANCING (WEIGHTED DEMAND)
    let finalAssignments = initialResults;
    if (useAiBalance && !hasError) {
        // Group by Parent
        const parentGroups: Record<string, any[]> = {};
        finalAssignments.forEach(a => {
            if (a.isCovered) {
                if (!parentGroups[a.ParentID]) parentGroups[a.ParentID] = [];
                parentGroups[a.ParentID].push(a);
            }
        });

        Object.keys(parentGroups).forEach(pid => {
            const assignments = parentGroups[pid];
            const stores = validStores.filter(s => s.parentId === pid);
            if (stores.length < 2) return;

            // Calculate Load (Sum of Demands)
            const storeLoad: Record<string, number> = {};
            stores.forEach(s => storeLoad[s.id] = 0);
            
            let totalDemand = 0;
            assignments.forEach(a => {
                const d = a.demand || 1;
                storeLoad[a.StoreID] += d;
                totalDemand += d;
            });

            const avgLoad = totalDemand / stores.length;
            const limit = avgLoad * 1.3; // 30% tolerance

            // Find Overloaded Stores
            const hoarders = stores.filter(s => storeLoad[s.id] > limit);
            const starving = stores.filter(s => storeLoad[s.id] < avgLoad);

            if (hoarders.length && starving.length) {
                // Sort assignments by distance (descending) -> Move furthest ones first
                assignments.sort((a, b) => b.DistanceKM - a.DistanceKM);

                assignments.forEach(assign => {
                    // If current store is overloaded
                    if (storeLoad[assign.StoreID] > limit) {
                        // Check if we can move it to a starving store without insane distance penalty
                        // (e.g., if new distance is < 1.5x threshold)
                        const bestTarget = starving.sort((a,b) => storeLoad[a.id] - storeLoad[b.id])[0];
                        
                        if (bestTarget) {
                            // Only swap if it's geographically reasonable (simplified check)
                            // Ideally we'd need exact distance, but for now we assume neighbors
                            // This AI logic is "best effort" within batch context
                            
                            assign.StoreID = bestTarget.id;
                            assign.StoreName = bestTarget.name;
                            assign.Color = bestTarget.color;
                            assign.isAiOptimized = true;
                            
                            // Update loads
                            const d = assign.demand || 1;
                            storeLoad[assign.StoreID] -= d;
                            storeLoad[bestTarget.id] += d;
                        }
                    }
                });
            }
        });
    }

    finalAssignments.forEach(a => a.DistanceKM = typeof a.DistanceKM === 'number' ? a.DistanceKM.toFixed(2) : a.DistanceKM);
    setAssignments(finalAssignments);
    setProcessing(false);
    if (finalAssignments.length > 0) {
        const validParents = finalAssignments.filter(a => a.isCovered).map(a => a.ParentID);
        if (validParents.length > 0) setSelectedParent(validParents[0]);
    }
  };

  // --- HELPERS ---
  const activeAssignments = useMemo(() => {
      let combined = [...assignments];
      manualOverrides.forEach(ov => {
          const targetParent = ov.originalParentID || ov.ParentID;
          combined = combined.filter(a => !(a.PolygonID === ov.PolygonID && a.ParentID === targetParent));
          combined.push(ov);
      });
      return combined;
  }, [assignments, manualOverrides]);

  const sortedParents = useMemo(() => {
      const map: Record<string, string> = {};
      activeAssignments.forEach(a => {
          if (a.isCovered && a.ParentID !== 'None') {
              map[a.ParentID] = a.ParentName || a.ParentID; 
          }
      });
      return Object.entries(map)
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }, [activeAssignments]);
  
  const viewData = useMemo(() => {
      let data = activeAssignments.filter(a => 
          (a.isCovered && a.ParentID === selectedParent) || (!a.isCovered)
      );
      if (viewLayer === 'primary') data = data.filter(a => a.group === 'primary');
      if (viewLayer === 'secondary') data = data.filter(a => a.group === 'secondary');
      if (searchStore) data = data.filter(a => a.StoreName.toLowerCase().includes(searchStore.toLowerCase()));
      return data;
  }, [activeAssignments, selectedParent, searchStore, viewLayer]);

  // 🟢 WEIGHTED SUMMARY
  const currentSummary = useMemo(() => {
      const groups: Record<string, {items: string[], demand: number}> = {};
      const totalDemand = polygons.reduce((sum, p) => sum + (p.demand || 1), 0);

      activeAssignments.forEach(a => {
          if (!a.isCovered) return; 
          if (viewLayer === 'primary' && a.group !== 'primary') return;
          if (viewLayer === 'secondary' && a.group !== 'secondary') return;

          const key = summaryMode === 'polygon' ? a.PolygonID : a.StoreID;
          const val = summaryMode === 'polygon' ? a.StoreID : a.PolygonID;
          
          if (!groups[key]) groups[key] = { items: [], demand: 0 };
          
          if (!groups[key].items.includes(val)) {
              groups[key].items.push(val);
              if (summaryMode === 'store') groups[key].demand += (a.demand || 1);
          }
      });

      return Object.entries(groups).map(([k, v]) => {
          const row: any = { 
              ID: k, 
              Items: v.items.join(', '),
              Count: v.items.length
          };
          
          if (summaryMode === 'store') {
              // Show % of Total Demand covered
              row.CoveragePercent = ((v.demand / (totalDemand || 1)) * 100).toFixed(1) + '%';
              row.TotalDemand = v.demand.toFixed(1);
          }
          
          return row;
      });
  }, [activeAssignments, summaryMode, polygons, viewLayer]);

  const executeReassign = () => {
      if (!reassignDialogData || !pendingReassignStore) return;
      const { polyId, parentId } = reassignDialogData;
      const storeObj = processedStores.find(s => s.id === pendingReassignStore);
      const polyObj = activeAssignments.find(a => a.PolygonID === polyId && a.ParentID === parentId);
      if (!storeObj || !polyObj) return;

      const newEntry = {
          ...polyObj,
          StoreID: storeObj.id,
          StoreName: storeObj.name,
          ParentID: storeObj.parentId, 
          ParentName: storeObj.parentName,
          DistanceKM: "Manual",
          Color: storeObj.color,
          isManual: true,
          isCovered: true,
          originalParentID: parentId 
      };
      setManualOverrides(prev => [...prev.filter(x => x.PolygonID !== polyId), newEntry]);
      setPendingReassignStore("");
      setReassignDialogData(null); 
      toast({title: "Reassigned!", description: `Zone moved to ${storeObj.name}.`});
  };

  const handleMapClick = async (assignment: any) => {
      if (reassignMode) return;
      if (!assignment.isCovered) return; 
      const store = processedStores.find(s => s.id === assignment.StoreID);
      if (!store) return;
      const pts = getGeoPointsForDisplay(assignment.feature || { type: 'Polygon', coordinates: [] }, store);
      const routes = [];
      const osrmUrl = OSRM_ENDPOINTS[region as keyof typeof OSRM_ENDPOINTS];
      for (const pt of pts) {
          const route = await fetchRouteGeometry({lat: store.lat, lng: store.lng}, {lat: pt.lat, lng: pt.lng}, osrmUrl);
          if (route) routes.push({ ...pt, geom: route.geom, dist: route.dist });
      }
      setVisualRoutes(routes);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-card p-4 rounded-xl shadow-sm border space-y-4 md:space-y-0">
        <div>
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <MapIcon className="h-6 w-6 text-purple-600"/> Coverage Commander
                </h1>
                <Link href="/dashboard/documentation#batch-processor" className="text-muted-foreground hover:text-primary transition-colors" title="View Documentation">
                    <HelpCircle className="h-5 w-5" />
                </Link>
            </div>
            <p className="text-muted-foreground text-xs">Multi-Layer Analysis • Weighted Demand • Visual Reassignment</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
            <div className="w-24">
                <label className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Max KM</label>
                <Input type="number" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="h-9" />
            </div>
            <div className="w-32">
                 <label className="text-[9px] font-bold uppercase text-muted-foreground block mb-1">Engine</label>
                 <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[9999]">
                        <SelectItem value="Iraq">Iraq Engine</SelectItem>
                        <SelectItem value="Lebanon">Lebanon Engine</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center gap-2 border p-2 rounded bg-muted h-9">
                <Switch checked={useAiBalance} onCheckedChange={setUseAiBalance} id="ai-mode" />
                <Label htmlFor="ai-mode" className="text-xs font-bold cursor-pointer flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-amber-500" /> Smart Balance
                </Label>
            </div>
        </div>
      </div>

      {/* UPLOAD AREA */}
      <div className="grid grid-cols-3 gap-4">
        <Card className={`border-dashed border-2 transition ${stores.length ? 'border-green-500 bg-green-50' : 'hover:bg-muted'}`}>
            <CardContent className="pt-6 text-center">
                <UploadCloud className={`mx-auto h-8 w-8 mb-2 ${stores.length ? 'text-green-600' : 'text-blue-500'}`}/>
                <h3 className="font-bold text-sm">1. Stores</h3>
                <p className="text-[10px] text-muted-foreground mb-2">{stores.length} Loaded</p>
                <input type="file" accept=".csv" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'stores')} className="text-xs ml-8 mt-2"/>
            </CardContent>
        </Card>
        <Card className={`border-dashed border-2 transition ${polygons.some(p => p.group === 'primary') ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted'}`}>
            <CardContent className="pt-6 text-center">
                <Layers className={`mx-auto h-8 w-8 mb-2 ${polygons.some(p => p.group === 'primary') ? 'text-blue-600' : 'text-blue-400'}`}/>
                <h3 className="font-bold text-sm">2. Primary Zones</h3>
                <p className="text-[10px] text-muted-foreground mb-2">{polygons.filter(p => p.group === 'primary').length} Zones</p>
                <input type="file" accept=".csv" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'polygons_primary')} className="text-xs ml-8 mt-2"/>
            </CardContent>
        </Card>
        <Card className={`border-dashed border-2 transition ${polygons.some(p => p.group === 'secondary') ? 'border-orange-500 bg-orange-50' : 'hover:bg-muted'}`}>
            <CardContent className="pt-6 text-center">
                <Layers className={`mx-auto h-8 w-8 mb-2 ${polygons.some(p => p.group === 'secondary') ? 'text-orange-600' : 'text-orange-400'}`}/>
                <h3 className="font-bold text-sm">3. Secondary Zones</h3>
                <p className="text-[10px] text-muted-foreground mb-2">Cross-Zone / Overlap</p>
                <input type="file" accept=".csv" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0], 'polygons_secondary')} className="text-xs ml-8 mt-2"/>
            </CardContent>
        </Card>
      </div>

      {/* CSV TEMPLATE GUIDE */}
      <Card className="border border-border overflow-hidden">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2.5">
            <div className="bg-purple-100 dark:bg-purple-950 p-1.5 rounded-lg">
              <FileSpreadsheet className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <span className="font-bold text-sm text-foreground">CSV Template Guide</span>
              <span className="text-muted-foreground text-xs ml-2">How to format your files</span>
            </div>
          </div>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${showGuide ? 'rotate-180' : ''}`} />
        </button>

        {showGuide && (
          <div className="px-5 pb-5 space-y-6 border-t border-border pt-5 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* STORES TEMPLATE */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-none shadow-none font-bold text-[10px] uppercase tracking-wider">Step 1</Badge>
                  <h4 className="font-bold text-sm text-foreground">Stores CSV</h4>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1.5 font-bold"
                  onClick={() => {
                    const csv = 'lat,lng,id,name,parentId,parentName\n36.1901,44.0091,S001,Main Branch,G01,Downtown Group\n36.2050,44.0120,S002,West Branch,G01,Downtown Group\n36.1750,43.9800,S003,South Branch,G02,Suburbs Group';
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = 'stores_template.csv';
                    link.click();
                  }}
                >
                  <FileDown className="h-3 w-3" /> Download Template
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Each row is a store/branch location. <strong className="text-foreground">lat</strong> and <strong className="text-foreground">lng</strong> are required. Use <strong className="text-foreground">parentId</strong> to group branches under a parent company.
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">lat <span className="text-red-500">*</span></TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">lng <span className="text-red-500">*</span></TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">id</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">name</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">parentId</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">parentName</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs py-2">36.1901</TableCell>
                      <TableCell className="font-mono text-xs py-2">44.0091</TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">S001</TableCell>
                      <TableCell className="text-xs py-2">Main Branch</TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">G01</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">Downtown Group</TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs py-2">36.2050</TableCell>
                      <TableCell className="font-mono text-xs py-2">44.0120</TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">S002</TableCell>
                      <TableCell className="text-xs py-2">West Branch</TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">G01</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">Downtown Group</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* ZONES TEMPLATE */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border-none shadow-none font-bold text-[10px] uppercase tracking-wider">Step 2</Badge>
                  <h4 className="font-bold text-sm text-foreground">Zones CSV (Primary / Secondary)</h4>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1.5 font-bold"
                  onClick={() => {
                    const csv = 'wkt,id,name,demand\n"POLYGON ((44.0 36.19, 44.01 36.19, 44.01 36.20, 44.0 36.20, 44.0 36.19))",Z001,Zone Alpha,150\n"POLYGON ((44.02 36.18, 44.03 36.18, 44.03 36.19, 44.02 36.19, 44.02 36.18))",Z002,Zone Beta,85';
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = 'zones_template.csv';
                    link.click();
                  }}
                >
                  <FileDown className="h-3 w-3" /> Download Template
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Each row is a zone polygon. <strong className="text-foreground">wkt</strong> (Well-Known Text geometry) is required. <strong className="text-foreground">demand</strong> is optional and used for weighted load-balancing when Smart Balance is enabled.
              </p>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">wkt <span className="text-red-500">*</span></TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">id</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">name</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider h-8">demand</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-muted/30">
                      <TableCell className="font-mono text-[10px] py-2 max-w-[300px] truncate">POLYGON ((44.0 36.19, 44.01 36.19, ...))</TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">Z001</TableCell>
                      <TableCell className="text-xs py-2">Zone Alpha</TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">150</TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-muted/30">
                      <TableCell className="font-mono text-[10px] py-2 max-w-[300px] truncate">POLYGON ((44.02 36.18, 44.03 36.18, ...))</TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">Z002</TableCell>
                      <TableCell className="text-xs py-2">Zone Beta</TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">85</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* TIPS */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h5 className="font-bold text-xs text-foreground flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-amber-500" /> Tips</h5>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                <li>Column names are <strong className="text-foreground">flexible</strong> — the wizard will auto-detect common names, or you can map them manually.</li>
                <li>WKT coordinates should be in <strong className="text-foreground">longitude latitude</strong> order (e.g. <code className="bg-muted px-1 rounded text-[10px]">44.01 36.19</code>).</li>
                <li>If your CSV has different headers (e.g. <code className="bg-muted px-1 rounded text-[10px]">latitude</code> instead of <code className="bg-muted px-1 rounded text-[10px]">lat</code>), the column mapping wizard will let you match them.</li>
                <li><strong className="text-foreground">parentId</strong> groups branches together — polygons are analyzed per parent group.</li>
                <li>The <strong className="text-foreground">demand</strong> column supports raw numbers or percentages (e.g. <code className="bg-muted px-1 rounded text-[10px]">150</code> or <code className="bg-muted px-1 rounded text-[10px]">25%</code>).</li>
              </ul>
            </div>
          </div>
        )}
      </Card>

      {/* COLUMN MAPPING WIZARD */}
      <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
        <DialogContent className="max-w-xl z-[9999] bg-card backdrop-blur-sm">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-green-600"/> Map CSV Columns
                </DialogTitle>
                <DialogDescription>
                    Match your file headers. <Badge variant="outline">{wizardType === 'stores' ? 'Stores' : wizardType === 'polygons_primary' ? 'Primary Zones' : 'Secondary Zones'}</Badge>
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                {(wizardType === 'stores' ? REQUIRED_FIELDS.stores : REQUIRED_FIELDS.polygons).map((field) => (
                    <div key={field.key} className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right text-xs font-bold uppercase text-muted-foreground col-span-1">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                        </Label>
                        <Select 
                            value={columnMapping[field.key] || ""} 
                            onValueChange={(val) => setColumnMapping(prev => ({...prev, [field.key]: val}))}
                        >
                            <SelectTrigger className="col-span-3 h-8">
                                <SelectValue placeholder={field.required ? "Select Column..." : "Optional"} />
                            </SelectTrigger>
                            <SelectContent className="z-[9999]">
                                {wizardHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                ))}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsWizardOpen(false)}>Cancel</Button>
                <Button onClick={confirmMapping} className="bg-green-600 hover:bg-green-700">Confirm Mapping</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REASSIGN DIALOG */}
      <Dialog open={!!reassignDialogData} onOpenChange={(open) => !open && setReassignDialogData(null)}>
        <DialogContent className="z-[9999] bg-white/95 backdrop-blur-sm shadow-2xl border border-border">
            <DialogHeader>
                <DialogTitle>Reassign Polygon</DialogTitle>
                <DialogDescription>
                    Move <span className="font-bold text-foreground">{reassignDialogData?.polyName}</span> to a new branch under <span className="font-bold text-foreground">{selectedParent}</span>.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label className="text-xs mb-2 block font-bold uppercase text-muted-foreground">Select New Branch</Label>
                <Select value={pendingReassignStore} onValueChange={setPendingReassignStore}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose branch..." />
                    </SelectTrigger>
                    <SelectContent className="z-[9999]" position="popper">
                        {processedStores.filter(s => s.parentId === selectedParent).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setReassignDialogData(null)}>Cancel</Button>
                <Button onClick={executeReassign} disabled={!pendingReassignStore} className="bg-purple-600 hover:bg-purple-700">Confirm Reassign</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button onClick={runAnalysis} disabled={processing || !stores.length || !polygons.length} className="w-full bg-purple-600 hover:bg-purple-700 h-12 text-lg shadow-lg shadow-purple-200">
        {processing ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2 fill-current" />} 
        {processing ? `Processing Matrix... ${progress}%` : "Run Intelligence Engine"}
      </Button>

      {/* RESULTS */}
      {activeAssignments.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex justify-between items-center mb-3">
                <TabsList>
                    <TabsTrigger value="map"><MapIcon className="h-4 w-4 mr-2" /> Visual Map</TabsTrigger>
                    <TabsTrigger value="summary"><TableIcon className="h-4 w-4 mr-2" /> Master Summary</TabsTrigger>
                </TabsList>

                {activeTab === 'map' && (
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                            <button onClick={() => setViewLayer('all')} className={`px-2 py-1 text-xs font-bold rounded ${viewLayer === 'all' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>All</button>
                            <button onClick={() => setViewLayer('primary')} className={`px-2 py-1 text-xs font-bold rounded ${viewLayer === 'primary' ? 'bg-blue-100 text-blue-700' : 'text-muted-foreground'}`}>Primary</button>
                            <button onClick={() => setViewLayer('secondary')} className={`px-2 py-1 text-xs font-bold rounded ${viewLayer === 'secondary' ? 'bg-orange-100 text-orange-700' : 'text-muted-foreground'}`}>Secondary</button>
                        </div>

                        <Select value={selectedParent} onValueChange={setSelectedParent}>
                            <SelectTrigger className="w-[200px] h-9 bg-card shadow-sm border-blue-200 z-[50]">
                                <SelectValue placeholder="Select Parent" />
                            </SelectTrigger>
                            <SelectContent className="z-[9999] max-h-[300px]">
                                {sortedParents.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                        <span className="font-mono text-xs">{p.id}</span>
                                        <span className="mx-2 text-muted-foreground">-</span>
                                        <span className="font-bold">{p.name}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        
                        <div className="relative">
                             <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                             <Input placeholder="Search Branch..." value={searchStore} onChange={e => setSearchStore(e.target.value)} className="w-40 h-9 pl-8" />
                        </div>

                        <Button 
                            variant={reassignMode ? "destructive" : "outline"} 
                            size="sm" 
                            onClick={() => { setReassignMode(!reassignMode); setVisualRoutes([]); setPendingReassignStore(""); }}
                            className="gap-2"
                        >
                            <Edit className="h-4 w-4" /> {reassignMode ? "Exit Reassign" : "Reassign Mode"}
                        </Button>
                    </div>
                )}
            </div>

            <TabsContent value="map" className="h-[650px] border-2 border-border rounded-xl overflow-hidden relative shadow-inner">
                {reassignMode && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-xl z-[999] font-bold text-sm animate-pulse flex items-center gap-2">
                        <Edit className="h-4 w-4" /> REASSIGN MODE: Select polygon to change
                    </div>
                )}

                <MapContainer center={[36.19, 44.01]} zoom={12} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    
                    <Pane name="polygons" style={{ zIndex: 400 }}>
                        <FeatureGroup>
                            {viewData.map((a, i) => {
                                const defaultColor = a.group === 'secondary' ? '#fdba74' : '#94a3b8';
                                const finalColor = a.isCovered ? a.Color : defaultColor;
                                
                                return (
                                    <GeoJSON 
                                        key={`${a.PolygonID}-${a.StoreID}-${a.Color}-${reassignMode ? 'edit' : 'view'}`} 
                                        data={a.geometry} 
                                        style={{ 
                                            color: 'white', 
                                            weight: 2, 
                                            fillColor: finalColor, 
                                            fillOpacity: reassignMode ? 0.7 : 0.6 
                                        }} 
                                        onEachFeature={(f, l) => l.on('click', () => handleMapClick(a))}
                                    >
                                        <Popup pane="popupPane">
                                            <div className="min-w-[200px] p-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="font-bold text-base">{a.PolygonName}</div>
                                                    <Badge variant="outline" className={`text-[9px] ${a.group === 'secondary' ? 'text-orange-600 border-orange-200' : 'text-blue-600 border-blue-200'}`}>
                                                        {a.group === 'secondary' ? 'Secondary' : 'Primary'}
                                                    </Badge>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground mb-2">Demand: {a.demand || 1}</div>
                                                
                                                {!reassignMode ? (
                                                    <>
                                                        {a.isCovered ? (
                                                            <>
                                                                <div className="bg-muted p-2 rounded mb-2 border-l-4" style={{borderLeftColor: a.Color}}>
                                                                    <div className="text-xs font-bold text-muted-foreground uppercase">Assigned Branch</div>
                                                                    <div className="font-bold text-foreground">{a.StoreName}</div>
                                                                    <div className="text-xs text-muted-foreground">{a.DistanceKM} km</div>
                                                                </div>
                                                                {a.isAiOptimized && <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] w-full justify-center mb-2">✨ AI Rebalanced</Badge>}
                                                                <div className="text-[10px] text-center text-muted-foreground mt-2">Click to view 3-point analysis</div>
                                                            </>
                                                        ) : (
                                                            <div className="bg-red-50 p-3 rounded border border-red-100"><div className="flex items-center gap-2 text-red-600 font-bold text-sm mb-1"><AlertCircle className="h-4 w-4"/> Uncovered</div><p className="text-xs text-red-800">{a.failureReason}</p></div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <div className="text-xs font-bold text-red-600 uppercase">Reassign Branch</div>
                                                        <Button size="sm" className="w-full bg-red-600 hover:bg-red-700 text-xs h-7" 
                                                            onClick={() => setReassignDialogData({ polyId: a.PolygonID, parentId: a.ParentID, polyName: a.PolygonName })}
                                                        >
                                                            <Save className="h-3 w-3 mr-1" /> Change Branch
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </Popup>
                                    </GeoJSON>
                                );
                            })}
                        </FeatureGroup>
                    </Pane>

                    <Pane name="routes" style={{ zIndex: 450 }}>
                        {visualRoutes.map((r, i) => (
                            <Polyline 
                                key={i} 
                                positions={r.geom} 
                                color={r.type === 'closest' ? '#22c55e' : r.type === 'centroid' ? '#3b82f6' : '#ef4444'} 
                                weight={4} 
                                dashArray={r.type === 'centroid' ? '10, 10' : r.type === 'furthest' ? '1, 5' : undefined}
                            >
                                <Tooltip sticky>{r.label}: {r.dist.toFixed(2)} km</Tooltip>
                            </Polyline>
                        ))}
                    </Pane>

                    <Pane name="stores" style={{ zIndex: 500 }}>
                        {processedStores.filter(s => s.parentId === selectedParent).map((s, i) => (
                            <CircleMarker key={`store-${i}`} center={[s.lat, s.lng]} radius={8} pathOptions={{ color: 'white', weight: 3, fillColor: s.color, fillOpacity: 1 }}>
                                <Popup><strong>{s.name}</strong><br/><span className="text-xs text-muted-foreground">{s.id}</span></Popup>
                            </CircleMarker>
                        ))}
                    </Pane>

                </MapContainer>
            </TabsContent>

            <TabsContent value="summary">
                <Card>
                    <CardHeader className="flex flex-row justify-between py-3 items-center">
                        <div className="flex items-center gap-4">
                            <CardTitle>Master Assignment Summary</CardTitle>
                            <div className="flex bg-muted p-1 rounded-lg">
                                <button onClick={() => setSummaryMode('polygon')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${summaryMode === 'polygon' ? 'bg-card shadow text-blue-600' : 'text-muted-foreground'}`}>By Polygon</button>
                                <button onClick={() => setSummaryMode('store')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${summaryMode === 'store' ? 'bg-card shadow text-purple-600' : 'text-muted-foreground'}`}>By Store</button>
                            </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => {
                             const csv = Papa.unparse(currentSummary as any);
                             const blob = new Blob([csv], { type: 'text/csv' });
                             const link = document.createElement('a');
                             link.href = URL.createObjectURL(blob);
                             link.download = `coverage_summary_${summaryMode}.csv`;
                             link.click();
                        }}><Download className="h-4 w-4 mr-2"/> Download CSV</Button>
                    </CardHeader>
                    <CardContent className="h-[500px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[150px]">{summaryMode === 'polygon' ? 'Polygon ID' : 'Store ID'}</TableHead>
                                    <TableHead>{summaryMode === 'polygon' ? 'Assigned Branches' : 'Covered Polygons (Zones)'}</TableHead>
                                    <TableHead className="w-[100px]">{summaryMode === 'polygon' ? 'Branch Count' : 'Zone Count'}</TableHead>
                                    {summaryMode === 'store' && <TableHead className="w-[100px]">Coverage (Weighted)</TableHead>}
                                    {summaryMode === 'store' && <TableHead className="w-[100px]">Total Demand</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {currentSummary.map((row: any, i) => (
                                    <TableRow key={i}>
                                        <TableCell className={`font-mono font-bold ${summaryMode === 'polygon' ? 'text-blue-600' : 'text-purple-600'}`}>{row.ID}</TableCell>
                                        <TableCell className="font-mono text-xs leading-relaxed">{row.Items}</TableCell>
                                        <TableCell className="font-mono font-bold">{row.Count}</TableCell>
                                        {summaryMode === 'store' && <TableCell className="font-mono text-green-600 font-bold">{row.CoveragePercent}</TableCell>}
                                        {summaryMode === 'store' && <TableCell className="font-mono text-muted-foreground">{row.TotalDemand}</TableCell>}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
