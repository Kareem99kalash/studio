'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore'; 
import { db } from '@/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Map as MapIcon, Table as TableIcon, AlertTriangle, Download, Store, Activity, Radar, Zap, Settings2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { logActivity, logger } from '@/lib/logger'; 
import * as turf from '@turf/turf';

// Maintenance & System Imports
import { MaintenanceScreen } from '@/components/system/maintenance-screen';
import { MaintenanceControl } from '@/components/system/maintenance-control';

const MapView = dynamic(() => import('@/components/dashboard/map-view').then(m => m.MapView), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-white flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] animate-pulse">Rendering Spatial Data</span>
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

const getStoreSubZone = (storeLat: number, storeLng: number, allPolygons: any[]) => {
    try {
        const pt = turf.point([storeLng, storeLat]);
        for (const poly of allPolygons) {
            if (turf.booleanPointInPolygon(pt, poly)) {
                return poly.properties.zoneGroup || poly.properties.zoneName; 
            }
        }
    } catch (e) { 
        logger.error("GeoEngine", "Zone check error", e);
    }
    return null; 
};

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
  const [availableRules, setAvailableRules] = useState<any[]>([]); 

  // MAINTENANCE STATE
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // 1. Check User Identity (Via Server Session) & Maintenance Status
  useEffect(() => {
     // Fetch session info from the server because we no longer use localStorage
     const fetchSession = async () => {
         try {
             const res = await fetch('/api/auth/me'); // You will need to create this simple API route
             if (res.ok) {
                 const data = await res.json();
                 setUser(data.user);
             }
         } catch (e) {
             logger.error("SystemAuth", "Failed to fetch session identity", e);
         }
     };

     fetchSession();

     const safetyTimer = setTimeout(() => {
         if (isCheckingStatus) {
             logger.warn("SystemAuth", "Maintenance check timed out - forcing load.");
             setIsCheckingStatus(false);
         }
     }, 3000);

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
            logger.error("SystemAuth", "Maintenance Check Ignored", error);
            clearTimeout(safetyTimer);
            setIsCheckingStatus(false);
        }
     );

     return () => { unsub(); clearTimeout(safetyTimer); };
  }, []);

  useEffect(() => { if (!isCheckingStatus) fetchCities(); }, [isCheckingStatus]);

  const fetchCities = async () => {
    try {
      const snap = await getDocs(collection(db, 'cities'));
      const cityList = snap.docs.map(d => {
          const data = d.data();
          let subZones = data.subZones || [];
          if (!subZones.length && data.polygons) {
              let polys = data.polygons;
              if (typeof polys === 'string') { try { polys = JSON.parse(polys); } catch (e) { polys = null; } }
              if (polys) { subZones = [{ name: 'Default', thresholds: data.thresholds || { green: 2, yellow: 5 }, polygons: polys }]; }
          }
          subZones = subZones.map((z: any) => ({ ...z, polygons: typeof z.polygons === 'string' ? JSON.parse(z.polygons) : z.polygons }));
          return { id: d.id, ...data, subZones };
      });
      setCities(cityList);
      if (cityList.length > 0) handleCityChange(cityList[0].id, cityList);
    } catch (e) { 
      logger.error("FetchCities", "Failed to load cities", e);
      toast({ variant: "destructive", title: "Connection Error", description: "Failed to load cities." });
    } finally { setLoading(false); }
  };

  const handleCityChange = (cityId: string, cityList = cities) => {
    const city = cityList.find(c => c.id === cityId);
    if (city) { setSelectedCity(city); setStores([]); setAnalysisData(null); setAvailableRules(city.subThresholds || []); }
  };

  const addStore = () => { 
      setStores([...stores, { 
          id: Date.now(), 
          name: `Hub ${stores.length + 1}`, 
          coordinates: '', lat: '', lng: '', 
          cityId: selectedCity?.id,
          category: 'default',
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
      if (!feature.geometry || !feature.geometry.coordinates || !feature.geometry.coordinates[0]) return { id: "error", name: "Invalid Poly", points: [] };
      const vertices = feature.geometry.coordinates[0].map((p: any) => ({ lat: p[1], lng: p[0] }));
      let close = vertices[0], minSq = Infinity;
      vertices.forEach((v: any) => {
          const d = getDistSq(store.lat, store.lng, v.lat, v.lng);
          if (d < minSq) { minSq = d; close = v; }
      });
      return { id: feature.properties.id || feature.properties.name, name: feature.properties.name, points: [close, center] };
  };

  const fetchMatrixBatch = async (store: any, allZonePoints: any[], engineUrl: string) => {
      const uncachedPoints = [];
      const cachedResults = new Array(allZonePoints.length).fill(null);
      const indexMap: number[] = []; 
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
      const targetEngine = engineUrl || "https://router.project-osrm.org";
      for (let i = 0; i < uncachedPoints.length; i += chunkSize) {
          const chunk = uncachedPoints.slice(i, i + chunkSize);
          const chunkIndices = indexMap.slice(i, i + chunkSize);
          const storeStr = `${store.lng},${store.lat}`;
          const destStr = chunk.map((p: any) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
          const coords = `${storeStr};${destStr}`;
          promises.push(
              fetch('/api/routing', { 
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ coordinates: coords, engineUrl: targetEngine })
              })
              .then(async (res) => {
                  if (res.status === 429) { toast({ variant: "destructive", title: "Traffic Limit", description: "Please wait a moment before retrying." }); return null; }
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
              .catch(e => logger.error("RoutingProxy", "Chunk failed", e))
          );
      }
      await Promise.all(promises); 
      return cachedResults;
  };

  const handleAnalyze = async () => {
    if (!selectedCity || stores.length === 0) return toast({ variant: "destructive", title: "Action Required", description: "Select a city and add at least one branch." });
    const validStores = stores.filter(s => !isNaN(parseFloat(s.lat)) && !isNaN(parseFloat(s.lng)));
    if (validStores.length === 0) return toast({ variant: "destructive", title: "Invalid Data", description: "Ensure branches have valid coordinates." });
    setAnalyzing(true);
    
    if (user?.username) {
        try {
            logActivity(user.username, 'Tool Execution', `Ran analysis for ${selectedCity.name}`);
        } catch (e) { 
            logger.error("Audit", "Log fail", e);
        }
    }

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
                            f.properties.centroid = { lat: centroid.geometry.coordinates[1], lng: centroid.geometry.coordinates[0] };
                        } catch (err) { /* geometry fallback */ }
                    }
                    if (f.properties.centroid) allPolygons.push(f);
                });
            }
        });
        if (allPolygons.length === 0) {
            toast({ variant: "destructive", title: "Data Error", description: "No valid polygons found." });
            setAnalyzing(false); return;
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
                    if (storeRule) { activeRule = storeRule; } 
                    else if (zoneConfig.internal && zoneConfig.external) {
                        if (storeHomeZone === polyZone) { activeRule = zoneConfig.internal; } 
                        else {
                            const distToBorder = getMinDistToZone(storeObj.lat, storeObj.lng, polyZone, allPolygons);
                            const proximityLimit = zoneConfig.borderProximity || 1.0;
                            activeRule = (distToBorder <= proximityLimit && zoneConfig.border) ? zoneConfig.border : zoneConfig.external;
                        }
                    } else { activeRule = zoneConfig; }
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
                    if (dCenter !== null && dClose !== null) { v1 = dClose; v2 = dCenter; voteV1 = v1; voteV2 = v2; }
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
        const displayPolygons = { type: "FeatureCollection", features: allPolygons };
        setAnalysisData({ timestamp: Date.now(), assignments: finalAssignments, displayPolygons });
        toast({ title: "Analysis Complete", description: "Optimization finished." });
    } catch (e) { 
        logger.error("Analyzer", "Execution failed", e);
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
          selectedCity.subZones.forEach((z: any) => { if (z.polygons?.features) allFeatures.push(...z.polygons.features); });
          return { type: 'FeatureCollection', features: allFeatures };
      }
      return { type: 'FeatureCollection', features: [] };
  };

  if (isCheckingStatus || loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-white gap-4">
          <Loader2 className="animate-spin h-10 w-10 text-primary/30" />
          <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] animate-pulse">Loading Workspace</p>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin' || user?.permissions?.can_bypass_maintenance;
  if (isMaintenance && !isAdmin) return <MaintenanceScreen message={maintenanceMsg} />;

  return (
    <div className="h-screen flex flex-col bg-slate-50/30 overflow-hidden font-body relative">
      {isMaintenance && isAdmin && <div className="bg-primary text-white text-[10px] font-bold text-center py-1.5 border-b border-primary/20 uppercase tracking-wider">Maintenance Mode Active</div>}

      <header className="h-16 bg-white border-b border-slate-100 px-6 flex items-center justify-between shrink-0 z-40 relative">
        <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20"><Radar className="text-white h-5 w-5" /></div>
            <div>
                <h1 className="font-bold text-lg tracking-tight text-primary leading-none">Operations Hub</h1>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Coverage Analysis System</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
           {isAdmin && <MaintenanceControl />}
           {analyzing && <div className="flex items-center gap-2 text-primary bg-primary/5 px-3 py-1.5 rounded-full border border-primary/10"><Loader2 className="h-3 w-3 animate-spin" /><span className="text-[9px] font-bold uppercase tracking-wider">Analyzing Grid</span></div>}
           {analysisData && !analyzing && <Badge variant="outline" className="border-emerald-100 bg-emerald-50 text-emerald-600 gap-1.5 py-1.5 px-3 shadow-none rounded-full"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span> <span className="text-[9px] font-bold uppercase tracking-wider">Ready</span></Badge>}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[360px] bg-white border-r border-slate-100 flex flex-col shrink-0 overflow-hidden z-20 shadow-sm">
            <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Settings2 className="h-3.5 w-3.5" /> Configuration</span></div>
            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                <div className="space-y-3">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><MapIcon className="h-3.5 w-3.5 text-primary/50" /> Regional Territory</Label>
                    <Select onValueChange={(val) => handleCityChange(val)} value={selectedCity?.id}>
                        <SelectTrigger className="h-11 border-slate-100 bg-slate-50/50 hover:border-primary/20 transition-all text-xs font-bold rounded-xl shadow-none"><SelectValue placeholder="Select Territory" /></SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-100 shadow-2xl">{cities.map(c => <SelectItem key={c.id} value={c.id} className="font-semibold text-xs py-2.5">{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Store className="h-3.5 w-3.5 text-primary/50" /> Distribution Hubs</Label>
                        <Button variant="ghost" size="sm" onClick={addStore} className="h-8 text-[10px] font-bold text-primary bg-primary/5 hover:bg-primary hover:text-white rounded-lg uppercase tracking-wide transition-all"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Node</Button>
                    </div>
                    <div className="space-y-3 min-h-[100px]">
                        {stores.map((store, idx) => (
                            <div key={store.id} className="relative group bg-slate-50/50 rounded-2xl border p-4 shadow-none border-slate-100 hover:border-primary/20 transition-all hover:bg-white hover:shadow-lg hover:shadow-slate-200/50">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-2 w-full">
                                                <div className="h-5 w-5 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">{idx + 1}</div>
                                                <Input className="h-6 p-0 border-none shadow-none text-xs font-bold text-slate-700 focus-visible:ring-0 placeholder:text-slate-300 w-full tracking-tight" value={store.name} onChange={e => updateStoreName(store.id, e.target.value)} />
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg -mr-1" onClick={() => removeStore(store.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                    </div>
                                    <div className="bg-white rounded-xl px-3 py-1.5 flex items-center gap-2 border border-slate-50 shadow-sm">
                                        <code className="text-[8px] text-slate-300 font-bold uppercase tracking-widest shrink-0">LOC:</code>
                                        <Input className="h-4 p-0 bg-transparent border-none shadow-none text-[10px] font-mono text-slate-600 focus-visible:ring-0 w-full" value={store.coordinates} onChange={e => updateStoreCoordinates(store.id, e.target.value)} placeholder="Lat, Lng" />
                                    </div>
                                    <div className="pt-3 border-t border-slate-100/50">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap">Protocol:</span>
                                            <Select value={store.category || 'default'} onValueChange={(val) => updateStoreCategory(store.id, val)}>
                                                <SelectTrigger className="h-7 w-full text-[9px] font-bold border-slate-100 bg-white rounded-lg shadow-none"><SelectValue /></SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    <SelectItem value="default" className="text-[10px] font-semibold">Standard Settings</SelectItem>
                                                    {availableRules.map((c, i) => (<SelectItem key={i} value={c.name} className="text-[10px] font-semibold">{c.name} ({c.green}km)</SelectItem>))}
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
            <div className="p-6 border-t border-slate-50 bg-white">
                <Button className="w-full h-12 rounded-2xl bg-primary text-white font-bold uppercase tracking-widest text-[10px] hover:bg-primary/90 shadow-xl shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group" onClick={handleAnalyze} disabled={analyzing || !selectedCity}>
                    <div className="flex items-center gap-3 relative z-10">
                        {analyzing ? <Loader2 className="animate-spin h-4 w-4 text-white" /> : <Zap className="h-4 w-4 text-white group-hover:scale-110 transition-transform" />}
                        <span>{analyzing ? "Processing Matrix..." : "Start Coverage Analysis"}</span>
                    </div>
                </Button>
            </div>
        </div>

        <div className="flex-1 bg-white overflow-hidden flex flex-col relative z-10">
            {!selectedCity ? (
                <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50/30 gap-6">
                    <div className="h-24 w-24 bg-white rounded-3xl flex items-center justify-center shadow-sm relative border border-slate-100">
                      <MapIcon className="h-8 w-8 text-slate-200" />
                    </div>
                    <p className="font-bold uppercase tracking-widest text-[10px] text-slate-300">Select a region to begin</p>
                </div>
            ) : (
                <Tabs defaultValue="map" className="h-full flex flex-col">
                    <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 bg-white shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="text-[9px] font-bold uppercase text-slate-300 tracking-widest">View Mode:</span>
                            <TabsList className="bg-slate-100 p-1 h-9 rounded-xl w-[280px]">
                                <TabsTrigger value="map" className="flex-1 rounded-lg text-[9px] font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm h-7 transition-all"><MapIcon className="h-3.5 w-3.5 mr-2" /> Geo-Map</TabsTrigger>
                                <TabsTrigger value="table" className="flex-1 rounded-lg text-[9px] font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm h-7 transition-all"><TableIcon className="h-3.5 w-3.5 mr-2" /> Data-Grid</TabsTrigger>
                            </TabsList>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{selectedCity.name}</span>
                        </div>
                    </div>
                    <div className="flex-1 relative bg-slate-50/50">
                        <TabsContent value="map" className="absolute inset-0 m-0 p-0 h-full w-full border-none">
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
                                <div className="h-full w-full flex flex-col items-center justify-center text-slate-300 p-10 bg-white">
                                    <AlertTriangle className="h-12 w-12 mb-4 text-slate-100" />
                                    <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Spatial Data Unavailable</p>
                                    <p className="text-[10px] text-slate-300 mt-2 text-center max-w-[240px]">Please upload region geometry in the administration tools.</p>
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent value="table" className="absolute inset-0 m-0 p-0 overflow-auto scrollbar-hide">
                            <div className="p-8 max-w-5xl mx-auto">
                                <Card className="border border-slate-100 shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white">
                                    <div className="p-6 border-b border-slate-50 bg-white flex justify-between items-center sticky top-0 z-10">
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-900 tracking-tight">Assignment Matrix</h3>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Optimization Results</p>
                                        </div>
                                        {analysisData?.assignments && (
                                            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl h-9 px-5 uppercase tracking-wider text-[10px] shadow-lg shadow-primary/20 transition-all" onClick={downloadCSV}>
                                                <Download className="h-4 w-4 mr-2" /> Export Dataset
                                            </Button>
                                        )}
                                    </div>
                                    <div className="bg-white min-h-[400px]">
                                        {analysisData?.assignments ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-50">
                                                        <TableHead className="text-[9px] font-bold uppercase text-slate-400 tracking-widest h-12 pl-6">Zone Area</TableHead>
                                                        <TableHead className="text-[9px] font-bold uppercase text-slate-400 tracking-widest h-12">Assigned Hub</TableHead>
                                                        <TableHead className="text-[9px] font-bold uppercase text-slate-400 tracking-widest h-12">Protocol</TableHead>
                                                        <TableHead className="text-[9px] font-bold uppercase text-slate-400 tracking-widest h-12 text-right pr-6">Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Object.values(analysisData.assignments).map((row: any, i) => (
                                                        <TableRow key={i} className="hover:bg-slate-50/30 transition-colors border-slate-50">
                                                            <TableCell className="font-bold text-xs text-slate-700 h-14 pl-6">{row.name}</TableCell>
                                                            <TableCell><Badge className="bg-slate-100 text-slate-500 text-[9px] font-bold border-none uppercase tracking-wide px-2.5 py-0.5 rounded-md shadow-none">{row.storeName}</Badge></TableCell>
                                                            <TableCell className="text-[10px] font-mono text-slate-400 uppercase">{row.category || 'Default'}</TableCell>
                                                            <TableCell className="text-right pr-6">
                                                              <Badge className={`${row.status === 'in' ? 'bg-emerald-50 text-emerald-600' : row.status === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'} text-[9px] font-bold border-none shadow-none uppercase tracking-wider px-2 rounded-md`}>
                                                                    {row.status === 'in' ? 'Secure' : row.status === 'warning' ? 'At Risk' : 'Outside'}
                                                              </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                                                <Activity className="h-10 w-10 text-slate-50 animate-pulse" />
                                                <p className="text-slate-300 font-bold uppercase tracking-widest text-[10px]">Interface awaiting data synchronization</p>
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
