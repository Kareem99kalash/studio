'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore'; 
import { db } from '@/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Map as MapIcon, Table as TableIcon, AlertTriangle, Download, Store, Activity, Radar, Zap, Settings2, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { logActivity } from '@/lib/logger'; 
import * as turf from '@turf/turf';

// Maintenance Imports
import { MaintenanceScreen } from '@/components/system/maintenance-screen';
import { MaintenanceControl } from '@/components/system/maintenance-control';

const MapView = dynamic(() => import('@/components/dashboard/map-view').then(m => m.MapView), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading Engine...</span>
    </div>
  )
});

// --- CACHE ---
const DISTANCE_CACHE: Record<string, number> = {};

// --- HELPERS ---
function getDistSq(lat1: number, lng1: number, lat2: number, lng2: number) { return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2; }
function getRoughDistKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Helper: Identify which Sub-Zone the store is physically inside
const getStoreSubZone = (storeLat: number, storeLng: number, allPolygons: any[]) => {
    try {
        const pt = turf.point([storeLng, storeLat]);
        for (const poly of allPolygons) {
            if (turf.booleanPointInPolygon(pt, poly)) {
                return poly.properties.zoneGroup || poly.properties.zoneName; 
            }
        }
    } catch (e) { console.error("Zone check error", e); }
    return null; 
};

// Helper: Get distance to the NEAREST polygon of a specific zone
const getMinDistToZone = (storeLat: number, storeLng: number, targetZoneName: string, allPolygons: any[]) => {
    try {
        const storePt = turf.point([storeLng, storeLat]);
        let minDist = Infinity;
        
        const targetPolys = allPolygons.filter(p => (p.properties.zoneGroup || p.properties.zoneName) === targetZoneName);
        
        targetPolys.forEach(poly => {
            const vertices = poly.geometry.coordinates[0];
            vertices.forEach((v: any) => {
                 const d = turf.distance(storePt, turf.point(v), { units: 'kilometers' });
                 if (d < minDist) minDist = d;
            });
        });
        return minDist;
    } catch (e) { return Infinity; }
};

export default function DashboardPage() {
  const { toast } = useToast();
  
  // Data State
  const [cities, setCities] = useState<any[]>([]);
  const [selectedCity, setSelectedCity] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [user, setUser] = useState<any>(null); 
  
  // Rule State
  const [availableRules, setAvailableRules] = useState<any[]>([]); 

  // MAINTENANCE STATE
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // 🟢 1. Check User & Maintenance Status (With Error Handling)
  useEffect(() => {
     // Get User
     const stored = localStorage.getItem('geo_user');
     const parsedUser = stored ? JSON.parse(stored) : null;
     setUser(parsedUser);

     // Safety Timeout: If Firebase fails, let user in after 3 seconds
     const safetyTimer = setTimeout(() => {
         if (isCheckingStatus) {
             console.warn("Maintenance check timed out - forcing load.");
             setIsCheckingStatus(false);
         }
     }, 3000);

     // Listen to System Status
     const unsub = onSnapshot(
        doc(db, 'system_metadata', 'maintenance'), 
        (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setIsMaintenance(data.isActive);
                setMaintenanceMsg(data.message);
            }
            clearTimeout(safetyTimer);
            setIsCheckingStatus(false);
        },
        (error) => {
            console.error("Maintenance Check Ignored (Permissions/Network):", error);
            // 🟢 FAIL OPEN: If check fails, assume system is online
            clearTimeout(safetyTimer);
            setIsCheckingStatus(false);
        }
     );

     return () => {
         unsub();
         clearTimeout(safetyTimer);
     };
  }, []);

  // 🟢 2. Fetch Cities only after maintenance check is done
  useEffect(() => { 
      if (!isCheckingStatus) fetchCities(); 
  }, [isCheckingStatus]);

  const fetchCities = async () => {
    try {
      const snap = await getDocs(collection(db, 'cities'));
      const cityList = snap.docs.map(d => {
          const data = d.data();
          let subZones = data.subZones || [];
          
          if (!subZones.length && data.polygons) {
              let polys = data.polygons;
              if (typeof polys === 'string') {
                  try { polys = JSON.parse(polys); } catch (e) { polys = null; }
              }
              if (polys) {
                  subZones = [{
                      name: 'Default',
                      thresholds: data.thresholds || { green: 2, yellow: 5 },
                      polygons: polys 
                  }];
              }
          }

          subZones = subZones.map((z: any) => ({
              ...z,
              polygons: typeof z.polygons === 'string' ? JSON.parse(z.polygons) : z.polygons
          }));

          return { id: d.id, ...data, subZones };
      });
      setCities(cityList);
      if (cityList.length > 0) handleCityChange(cityList[0].id, cityList);
    } catch (e) { 
      console.error("Fetch Error:", e);
      toast({ variant: "destructive", title: "Connection Error", description: "Failed to load cities." });
    } finally { 
      setLoading(false); 
    }
  };

  const handleCityChange = (cityId: string, cityList = cities) => {
    const city = cityList.find(c => c.id === cityId);
    if (city) {
        setSelectedCity(city);
        setStores([]); 
        setAnalysisData(null); 
        setAvailableRules(city.subThresholds || []);
    }
  };

  const addStore = () => { 
      setStores([...stores, { 
          id: Date.now(), 
          name: `Hub ${stores.length + 1}`, 
          coordinates: '', lat: '', lng: '', 
          cityId: selectedCity?.id,
          category: 'default'
      }]); 
  };

  const updateStoreName = (id: number, name: string) => { setStores(stores.map(s => s.id === id ? { ...s, name } : s)); };
  const updateStoreCategory = (id: number, category: string) => { setStores(stores.map(s => s.id === id ? { ...s, category } : s)); };

  const updateStoreCoordinates = (id: number, input: string) => {
    let lat = ''; let lng = ''; const parts = input.split(',');
    if (parts.length === 2) {
        const parsedLat = parseFloat(parts[0].trim()); const parsedLng = parseFloat(parts[1].trim());
        if (!isNaN(parsedLat) && !isNaN(parsedLng)) { lat = parsedLat.toString(); lng = parsedLng.toString(); }
    }
    setStores(stores.map(s => s.id === id ? { ...s, coordinates: input, lat, lng } : s));
  };
  const removeStore = (id: number) => { setStores(stores.filter(s => s.id !== id)); };

  const getZoneKeyPoints = (store: any, feature: any) => {
      const center = feature.properties.centroid;
      if (!feature.geometry || !feature.geometry.coordinates || !feature.geometry.coordinates[0]) {
          return { id: "error", name: "Invalid Poly", points: [] };
      }
      
      const vertices = feature.geometry.coordinates[0].map((p: any) => ({ lat: p[1], lng: p[0] }));
      let close = vertices[0], minSq = Infinity;
      
      vertices.forEach((v: any) => {
          const d = getDistSq(store.lat, store.lng, v.lat, v.lng);
          if (d < minSq) { minSq = d; close = v; }
      });
      return { 
          id: feature.properties.id || feature.properties.name, 
          name: feature.properties.name, 
          points: [close, center] 
      };
  };

  // 🟢 SECURE: Calls internal /api/routing proxy
  const fetchMatrixBatch = async (store: any, allZonePoints: any[], engineUrl: string) => {
    const uncachedPoints = [];
    const cachedResults = new Array(allZonePoints.length).fill(null);
    const indexMap: number[] = []; 

    // 1. Check Cache
    for (let i = 0; i < allZonePoints.length; i++) {
        const p = allZonePoints[i];
        const key = `${store.lat.toFixed(4)},${store.lng.toFixed(4)}-${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
        if (DISTANCE_CACHE[key] !== undefined) {
            cachedResults[i] = DISTANCE_CACHE[key];
        } else {
            uncachedPoints.push(p);
            indexMap.push(i);
        }
    }

    if (uncachedPoints.length === 0) return cachedResults;

    const chunkSize = 50; 
    const promises = [];
    // If no engine is selected/saved, default to public
    const targetEngine = engineUrl || "https://router.project-osrm.org";
    
    for (let i = 0; i < uncachedPoints.length; i += chunkSize) {
        const chunk = uncachedPoints.slice(i, i + chunkSize);
        const chunkIndices = indexMap.slice(i, i + chunkSize);
        
        const storeStr = `${store.lng},${store.lat}`;
        const destStr = chunk.map((p: any) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
        const coords = `${storeStr};${destStr}`;
        
        // 🟢 SECURE CALL: Send to our own API Route
        promises.push(
            fetch('/api/routing', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coordinates: coords,
                    engineUrl: targetEngine
                })
            })
            .then(async (res) => {
                if (res.status === 429) {
                    toast({ variant: "destructive", title: "Traffic Limit", description: "Please wait a moment before retrying." });
                    return null;
                }
                if (!res.ok) throw new Error("Routing failed");
                return res.json();
            })
            .then(data => {
                if (!data) return; 

                const distances = data.distances?.[0]?.slice(1);
                if (distances) {
                    distances.forEach((d: number, idx: number) => { 
                        if (d !== null) {
                            const km = d / 1000;
                            const originalIdx = chunkIndices[idx];
                            cachedResults[originalIdx] = km;
                            const p = chunk[idx];
                            const key = `${store.lat.toFixed(4)},${store.lng.toFixed(4)}-${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
                            DISTANCE_CACHE[key] = km;
                        } 
                    });
                }
            })
            .catch(e => console.error("Proxy Chunk Fail", e))
        );
    }
    
    await Promise.all(promises); 
    return cachedResults;
};

  const handleAnalyze = async () => {
    if (!selectedCity || stores.length === 0) return toast({ variant: "destructive", title: "Action Required", description: "Select a city and add at least one branch." });
    const validStores = stores.filter(s => !isNaN(parseFloat(s.lat)) && !isNaN(parseFloat(s.lng)));
    if (validStores.length === 0) return toast({ variant: "destructive", title: "Invalid Data", description: "Ensure all branches have valid Lat, Lng coordinates." });

    setAnalyzing(true);
    
    try {
        const currentUser = JSON.parse(localStorage.getItem('geo_user') || '{}');
        logActivity(currentUser.username, 'Tool Execution', `Ran analysis for ${selectedCity.name}`);
    } catch (e) { console.error("Log fail", e); }

    try {
        const finalAssignments: Record<string, any> = {};
        const allPolygons: any[] = [];
        
        selectedCity.subZones.forEach((zone: any) => {
            if (zone.polygons && zone.polygons.features) {
                zone.polygons.features.forEach((f: any) => {
                    f.properties.zoneRules = zone.thresholds || { green: 2, yellow: 5 };
                    f.properties.zoneName = zone.name;
                    
                    if (!f.properties.centroid) {
                        try {
                            const centroid = turf.centroid(f);
                            f.properties.centroid = {
                                lat: centroid.geometry.coordinates[1],
                                lng: centroid.geometry.coordinates[0]
                            };
                        } catch (err) {
                            try {
                                const coords = f.geometry.coordinates[0];
                                let sumLat = 0, sumLng = 0;
                                coords.forEach((c: any) => { sumLng += c[0]; sumLat += c[1]; });
                                f.properties.centroid = {
                                    lat: sumLat / coords.length,
                                    lng: sumLng / coords.length
                                };
                            } catch (e2) {}
                        }
                    }
                    if (f.properties.centroid) allPolygons.push(f);
                });
            }
        });

        if (allPolygons.length === 0) {
            toast({ variant: "destructive", title: "Data Error", description: "No valid polygons found. Check upload." });
            setAnalyzing(false);
            return;
        }

        const storePromises = validStores.map(async (store) => {
            const storeObj = { lat: parseFloat(store.lat), lng: parseFloat(store.lng) };
            const MAX_SCAN_RADIUS_KM = 50; 

            const storeHomeZone = getStoreSubZone(storeObj.lat, storeObj.lng, allPolygons);

            let storeRule = null;
            if (store.category && store.category !== 'default') {
                storeRule = availableRules.find(r => r.name === store.category);
            }

            const zoneMeta: any[] = [], flatPoints: any[] = [];
            
            allPolygons.forEach((f: any) => {
                const center = f.properties.centroid;
                const roughDist = getRoughDistKm(storeObj.lat, storeObj.lng, center.lat, center.lng);
                
                if (roughDist < MAX_SCAN_RADIUS_KM) {
                    const kp = getZoneKeyPoints(storeObj, f); 
                    
                    const polyZone = f.properties.zoneGroup || f.properties.zoneName;
                    const zoneConfig = f.properties.zoneRules; 

                    let activeRule = { green: 2, yellow: 5 }; 

                    if (storeRule) {
                        activeRule = storeRule;
                    } else if (zoneConfig.internal && zoneConfig.external) {
                        if (storeHomeZone === polyZone) {
                            activeRule = zoneConfig.internal;
                        } else {
                            const distToBorder = getMinDistToZone(storeObj.lat, storeObj.lng, polyZone, allPolygons);
                            const proximityLimit = zoneConfig.borderProximity || 1.0;

                            if (distToBorder <= proximityLimit && zoneConfig.border) {
                                activeRule = zoneConfig.border;
                            } else {
                                activeRule = zoneConfig.external;
                            }
                        }
                    } else {
                        activeRule = zoneConfig; 
                    }
                    
                    zoneMeta.push({ ...kp, rules: activeRule }); 
                    flatPoints.push(...kp.points); 
                } else { 
                    zoneMeta.push({ id: f.properties.id || f.properties.name, name: f.properties.name, tooFar: true }); 
                }
            });
            
            let flatDistances: number[] = [];
            if (flatPoints.length > 0) {
                flatDistances = await fetchMatrixBatch(storeObj, flatPoints, selectedCity.routingEngine);
            }
            
            let pointIdx = 0;
            zoneMeta.forEach((z) => {
                let v1 = 999, v2 = 999, voteV1 = 999, voteV2 = 999;
                
                if (!z.tooFar && z.points && z.points.length > 0) {
                    const dClose = flatDistances[pointIdx];
                    const dCenter = flatDistances[pointIdx + 1];
                    pointIdx += 2; 

                    if (dCenter !== null && dClose !== null) {
                        v1 = dClose; v2 = dCenter;
                        voteV1 = v1; voteV2 = v2;
                    }
                }
                
                const activeRules = z.rules || { green: 2, yellow: 5 };

                const points = [voteV1, voteV2];
                let greenCount = 0, yellowCount = 0;
                
                points.forEach(dist => { if (dist <= activeRules.green) greenCount++; else if (dist <= activeRules.yellow) yellowCount++; });
                
                let status = 'out', color = '#ef4444';
                if (greenCount >= 1 && (greenCount + yellowCount) >= 2) { status = 'in'; color = '#22c55e'; } 
                else if ((greenCount + yellowCount) >= 1) { status = 'warning'; color = '#eab308'; }
                
                const avgDist = parseFloat(((voteV1 + voteV2) / 2).toFixed(2));
                const currentWinner = finalAssignments[z.id];
                
                let isWinner = false;
                if (!currentWinner) isWinner = true;
                else {
                    const score = (s: string) => s === 'in' ? 3 : s === 'warning' ? 2 : 1;
                    if (score(status) > score(currentWinner.status)) isWinner = true;
                    else if (score(status) === score(currentWinner.status) && avgDist < parseFloat(currentWinner.distance)) isWinner = true;
                }

                if (isWinner) {
                    finalAssignments[z.id] = {
                        name: z.name, id: z.id, status, fillColor: color, storeColor: '#ffffff',
                        storeId: store.id, storeName: store.name, distance: avgDist.toFixed(2),
                        category: store.category,
                        raw: { close: v1.toFixed(1), center: v2.toFixed(1) }
                    };
                }
            });
        });
        await Promise.all(storePromises);
        
        const displayPolygons = {
            type: "FeatureCollection",
            features: allPolygons
        };

        setAnalysisData({ timestamp: Date.now(), assignments: finalAssignments, displayPolygons });
        toast({ title: "Analysis Complete", description: "Optimization finished." });
    } catch (e) { 
        console.error(e);
        toast({ variant: "destructive", title: "Error", description: "Analysis failed." }); 
    } finally { setAnalyzing(false); }
  };

  const downloadCSV = () => {
      if (!analysisData?.assignments) return;
      const rows = [['Zone ID', 'Zone Name', 'Assigned Hub', 'Hub Rule', 'Avg Dist (KM)', 'Status']];
      Object.values(analysisData.assignments).forEach((a: any) => rows.push([a.id, a.name, a.storeName, a.category, a.distance, a.status.toUpperCase()]));
      const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csvContent));
      link.setAttribute("download", `coverage_${selectedCity.name}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const getDisplayPolygons = () => {
      if (analysisData?.displayPolygons) return analysisData.displayPolygons;
      if (selectedCity?.subZones) {
          const allFeatures: any[] = [];
          selectedCity.subZones.forEach((z: any) => {
              if (z.polygons?.features) {
                  allFeatures.push(...z.polygons.features);
              }
          });
          return { type: 'FeatureCollection', features: allFeatures };
      }
      return { type: 'FeatureCollection', features: [] };
  };

  // 🟢 2. Render Loading or Maintenance Screen
  if (isCheckingStatus || loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-white gap-4">
          <Loader2 className="animate-spin h-10 w-10 text-indigo-600" />
          <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-xs animate-pulse">Initializing...</p>
      </div>
    );
  }

  // 🟢 3. BLOCK ACCESS IF MAINTENANCE IS ON AND USER IS NOT ADMIN
  const isAdmin = user?.role === 'admin' || user?.permissions?.can_bypass_maintenance;
  
  if (isMaintenance && !isAdmin) {
      return <MaintenanceScreen message={maintenanceMsg} />;
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden font-sans relative">
      
      {/* 🟢 Maintenance Banner for Admins */}
      {isMaintenance && isAdmin && (
          <div className="bg-amber-100 text-amber-900 text-[10px] font-bold text-center py-1 border-b border-amber-300 shrink-0">
              ⚠️ MAINTENANCE MODE ACTIVE - USER ACCESS RESTRICTED
          </div>
      )}

      {/* HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-40 relative">
        <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-2 rounded-lg shadow-md shadow-indigo-100">
                <Radar className="text-white h-5 w-5" />
            </div>
            <div>
                <h1 className="font-black text-lg tracking-tight text-slate-800 leading-none">COMMAND CENTER</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Spatial Intelligence Unit</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
           {/* 🟢 Insert Admin Control Toggle Here */}
           {isAdmin && <MaintenanceControl />}

           {analyzing && (
               <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                   <Loader2 className="h-3 w-3 animate-spin" />
                   <span className="text-[10px] font-black uppercase tracking-wider">Processing Grid</span>
               </div>
           )}
           {analysisData && !analyzing && (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1.5 py-1.5 pl-1.5 pr-3 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider">System Online</span>
                </Badge>
           )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR CONFIGURATION */}
        <div className="w-[380px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-hidden z-20">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-white/50 backdrop-blur-sm">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 className="h-3 w-3" /> Configuration
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-8 scrollbar-hide">
                
                {/* 1. Region Selector */}
                <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                        <MapIcon className="h-3.5 w-3.5 text-indigo-500" /> Target Region
                    </Label>
                    <div className="relative">
                        <Select onValueChange={(val) => handleCityChange(val)} value={selectedCity?.id}>
                            <SelectTrigger className="h-11 border-slate-200 bg-white hover:border-indigo-300 transition-all text-sm font-bold shadow-sm focus:ring-indigo-500">
                                <SelectValue placeholder="Select Territory" />
                            </SelectTrigger>
                            <SelectContent>
                                {cities.map(c => <SelectItem key={c.id} value={c.id} className="font-medium text-xs">{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {selectedCity && (
                            <div className="absolute top-1/2 -translate-y-1/2 right-9 pointer-events-none">
                                <Badge variant="secondary" className="text-[9px] bg-slate-100 text-slate-500 font-mono">ID: {selectedCity.id.slice(0,4)}</Badge>
                            </div>
                        )}
                    </div>
                </div>

                <Separator className="bg-slate-200" />

                {/* 2. Read-Only Rules View */}
                <div className="space-y-4">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-indigo-500" /> Operational Rules
                    </Label>
                    
                    {availableRules.length > 0 ? (
                        <div className="space-y-2">
                            {availableRules.map((rule, idx) => (
                                <div key={idx} className="bg-white p-2 rounded border border-slate-200 shadow-sm flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-600">{rule.name}</span>
                                    <div className="flex gap-1 text-[10px] font-mono bg-slate-50 px-2 py-1 rounded">
                                        <span className="text-emerald-600 font-bold">{rule.green}km</span>
                                        <span className="text-slate-300">/</span>
                                        <span className="text-amber-600 font-bold">{rule.yellow}km</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-3 text-center text-[10px] text-slate-400 bg-slate-100 rounded-lg italic">
                            No custom category rules defined for this city.
                        </div>
                    )}
                </div>

                <Separator className="bg-slate-200" />

                {/* 3. Hubs Input */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                            <Store className="h-3.5 w-3.5 text-indigo-500" /> Logistics Nodes
                        </Label>
                        <Button variant="ghost" size="sm" onClick={addStore} className="h-7 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 rounded-md uppercase tracking-wide">
                            <Plus className="h-3 w-3 mr-1.5" /> Add Node
                        </Button>
                    </div>
                    
                    <div className="space-y-3 min-h-[100px]">
                        {stores.map((store, idx) => (
                            <div key={store.id} className="relative group bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:border-indigo-300 transition-all duration-200">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-2 w-full">
                                                <div className="h-5 w-5 rounded bg-slate-100 flex items-center justify-center text-slate-500 text-[10px] font-black shrink-0">{idx + 1}</div>
                                                <Input className="h-6 p-0 border-none shadow-none text-xs font-bold text-slate-700 focus-visible:ring-0 placeholder:text-slate-300 w-full" value={store.name} onChange={e => updateStoreName(store.id, e.target.value)} placeholder="Node Name" />
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded -mr-1" onClick={() => removeStore(store.id)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                    </div>
                                    <div className="bg-slate-50 rounded px-2 py-1 flex items-center gap-2 border border-slate-100">
                                        <code className="text-[9px] text-slate-400 font-bold uppercase tracking-wider shrink-0">LOC:</code>
                                        <Input className="h-4 p-0 bg-transparent border-none shadow-none text-[10px] font-mono text-slate-600 focus-visible:ring-0 w-full" value={store.coordinates} onChange={e => updateStoreCoordinates(store.id, e.target.value)} placeholder="LAT, LNG" />
                                    </div>
                                    <div className="pt-2 border-t border-slate-50 mt-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">Rule:</span>
                                            <Select value={store.category || 'default'} onValueChange={(val) => updateStoreCategory(store.id, val)}>
                                                <SelectTrigger className="h-6 w-full text-[10px] border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="default" className="text-xs">Zone Default</SelectItem>
                                                    {availableRules.map((c, i) => (
                                                        <SelectItem key={i} value={c.name} className="text-xs">{c.name} ({c.green}km)</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="p-5 border-t border-slate-200 bg-white">
                <Button className="w-full h-12 rounded-lg bg-slate-900 text-white font-black uppercase tracking-widest text-xs hover:bg-slate-800 shadow-md active:scale-[0.99] transition-all disabled:opacity-70 disabled:cursor-not-allowed group" onClick={handleAnalyze} disabled={analyzing || !selectedCity}>
                    <div className="flex items-center gap-3">
                        {analyzing ? <Loader2 className="animate-spin h-4 w-4 text-indigo-400" /> : <Zap className="h-4 w-4 text-yellow-400 group-hover:scale-110 transition-transform" />}
                        <span>{analyzing ? "Processing Grid..." : "Initiate Analysis"}</span>
                    </div>
                </Button>
            </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 bg-slate-100 overflow-hidden flex flex-col relative z-10">
            {!selectedCity ? (
                <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50/50 gap-4">
                    <div className="h-24 w-24 bg-slate-200 rounded-full flex items-center justify-center">
                        <MapIcon className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="font-black uppercase tracking-[0.2em] text-xs text-slate-400">Awaiting Regional Selection</p>
                </div>
            ) : (
                <Tabs defaultValue="map" className="h-full flex flex-col">
                    <div className="h-12 border-b border-slate-200 flex items-center justify-between px-6 bg-white shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Active View:</span>
                            <TabsList className="bg-slate-100 p-1 h-8 rounded-lg">
                                <TabsTrigger value="map" className="rounded-md text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-4 h-6 transition-all">
                                    <MapIcon className="h-3 w-3 mr-2" /> Geo-Map
                                </TabsTrigger>
                                <TabsTrigger value="table" className="rounded-md text-[10px] font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm px-4 h-6 transition-all">
                                    <TableIcon className="h-3 w-3 mr-2" /> Data Grid
                                </TabsTrigger>
                            </TabsList>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{selectedCity.name} Dataset</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 relative bg-slate-50">
                        <TabsContent value="map" className="absolute inset-0 m-0 p-0 h-full w-full">
                             {getDisplayPolygons().features.length > 0 ? (
                                <MapView 
                                    key={selectedCity.id} 
                                    selectedCity={{
                                        ...selectedCity,
                                        polygons: getDisplayPolygons() 
                                    }}
                                    stores={stores} 
                                    analysisData={analysisData} 
                                    isLoading={analyzing} 
                                />
                            ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 p-10">
                                    <AlertTriangle className="h-12 w-12 mb-4 text-amber-500/50" />
                                    <p className="font-black text-slate-600 uppercase tracking-widest">Geodata Unavailable</p>
                                    <p className="text-xs text-slate-400 mt-2">Please upload Polygon data in admin settings.</p>
                                </div>
                            )}
                        </TabsContent>
                        
                        <TabsContent value="table" className="absolute inset-0 m-0 p-0 overflow-auto">
                            <div className="p-8 max-w-5xl mx-auto">
                                <Card className="border-none shadow-sm rounded-xl overflow-hidden">
                                    <div className="p-6 border-b border-slate-100 bg-white flex justify-between items-center sticky top-0 z-10">
                                        <div>
                                            <h3 className="font-black text-lg text-slate-800 uppercase tracking-tight">Assignment Matrix</h3>
                                            <p className="text-[11px] text-slate-400 font-bold uppercase mt-1">Optimization Results</p>
                                        </div>
                                        {analysisData?.assignments && (
                                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-9 rounded-lg shadow-md shadow-indigo-100" onClick={downloadCSV}>
                                                <Download className="h-4 w-4 mr-2" /> Export CSV
                                            </Button>
                                        )}
                                    </div>
                                    <div className="bg-white min-h-[400px]">
                                        {analysisData?.assignments ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10">Zone Identifier</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10">Assigned Node</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10">Applied Rule</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10">Distance (Avg)</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 tracking-wider h-10 text-right">Coverage Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Object.values(analysisData.assignments).map((row: any, i) => (
                                                        <TableRow key={i} className="hover:bg-indigo-50/10 transition-colors border-slate-50">
                                                            <TableCell className="font-bold text-xs text-slate-700">{row.name}</TableCell>
                                                            <TableCell><Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] font-bold border-none uppercase tracking-wide">{row.storeName}</Badge></TableCell>
                                                            <TableCell className="text-[10px] font-mono text-slate-400">{row.category || 'Standard'}</TableCell>
                                                            <TableCell className="text-xs font-mono font-bold text-slate-500">{row.distance} km</TableCell>
                                                            <TableCell className="text-right">
                                                              <Badge className={`${row.status === 'in' ? 'bg-emerald-100 text-emerald-700' : row.status === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'} text-[9px] font-black border-none shadow-none uppercase tracking-wider px-2`}>
                                                                    {row.status}
                                                              </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                                                <Activity className="h-8 w-8 text-slate-300" />
                                                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No Analysis Data Available</p>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            )}
        </div>
      </div>
    </div>
  );
}
