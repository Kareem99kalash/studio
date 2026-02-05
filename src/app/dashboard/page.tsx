'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Map as MapIcon, Table as TableIcon, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';

// 🛡️ DYNAMIC IMPORT (Prevents Server-Side Render Crash)
const MapView = dynamic(() => import('@/components/dashboard/map-view').then(m => m.MapView), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-50 animate-pulse flex items-center justify-center text-slate-400 font-bold">Loading Map Engine...</div>
});

export default function DashboardPage() {
  const { toast } = useToast();
  const [cities, setCities] = useState<any[]>([]);
  const [selectedCity, setSelectedCity] = useState<any>(null);
  
  // 🧹 STATE: Initialize as EMPTY
  const [stores, setStores] = useState<any[]>([]);
  const [analysisData, setAnalysisData] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [greenRadius, setGreenRadius] = useState(2);
  const [yellowRadius, setYellowRadius] = useState(5);

  // 1. Fetch Cities on Load
  useEffect(() => {
    const fetchCities = async () => {
      try {
        // Clear old cache to prevent ghosts
        localStorage.removeItem('geo_analysis_cache'); 
        
        const snap = await getDocs(collection(db, 'cities'));
        const cityList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCities(cityList);
        
        // Default to first city if available
        if (cityList.length > 0) {
            setSelectedCity(cityList[0]);
        }
      } catch (e) { 
          console.error("City Fetch Error:", e);
          toast({ variant: "destructive", title: "Connection Error", description: "Could not load cities." });
      } finally { 
          setLoading(false); 
      }
    };
    fetchCities();
  }, []);

  // 2. Handle City Change -> WIPE EVERYTHING
  const handleCityChange = (cityId: string) => {
    const city = cities.find(c => c.id === cityId);
    if (city) {
        setSelectedCity(city);
        setStores([]); // Delete old stores
        setAnalysisData(null); // Clear old colors
    }
  };

  const addStore = () => {
    setStores([...stores, { id: Date.now(), name: `Store ${stores.length + 1}`, lat: '', lng: '', cityId: selectedCity?.id }]);
  };

  const updateStore = (id: number, field: string, value: string) => {
    setStores(stores.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeStore = (id: number) => {
    setStores(stores.filter(s => s.id !== id));
  };

  // 3. The "Check Coverage" Logic
  const handleAnalyze = () => {
    if (!selectedCity || stores.length === 0) {
        toast({ variant: "destructive", title: "Missing Data", description: "Please select a city and add a store." });
        return;
    }

    // 🛑 CRASH FIX: Check if polygons actually exist before running loop
    if (!selectedCity.polygons || !selectedCity.polygons.features) {
        toast({ 
            variant: "destructive", 
            title: "Map Data Missing", 
            description: `The city "${selectedCity.name}" has no polygon data uploaded.` 
        });
        return;
    }

    setAnalyzing(true);
    
    setTimeout(() => {
        const assignments: any = {};
        
        // Filter out empty/invalid stores
        const validStores = stores.filter(s => {
            const lat = parseFloat(s.lat);
            const lng = parseFloat(s.lng);
            return !isNaN(lat) && !isNaN(lng);
        });

        if (validStores.length === 0) {
             setAnalyzing(false);
             toast({ variant: "destructive", title: "Invalid Coordinates", description: "Please enter valid numbers for Lat/Lng." });
             return;
        }

        try {
            // Safe Loop over features
            selectedCity.polygons.features.forEach((feature: any) => {
                if (!feature.properties || !feature.properties.centroid) return; // Skip bad polygons

                const center = feature.properties.centroid;
                let minDist = Infinity;
                let closestStore = null;

                validStores.forEach((store: any) => {
                    // Simple Euclidean for color calculation (approx)
                    const d = Math.sqrt(Math.pow(parseFloat(store.lat) - center.lat, 2) + Math.pow(parseFloat(store.lng) - center.lng, 2));
                    const dKm = d * 111; // Approx conversion to KM
                    if (dKm < minDist) { minDist = dKm; closestStore = store; }
                });

                if (closestStore) {
                    let status = 'out';
                    let color = '#ef4444'; // Red
                    let opacity = 0.3;

                    if (minDist <= greenRadius) {
                        status = 'in';
                        color = '#22c55e'; // Green
                        opacity = 0.6;
                    } else if (minDist <= yellowRadius) {
                        status = 'warning';
                        color = '#eab308'; // Yellow
                        opacity = 0.5;
                    }

                    assignments[feature.properties.name] = {
                        status,
                        fillColor: color,
                        storeColor: '#ffffff',
                        storeId: (closestStore as any).id,
                        distance: minDist.toFixed(2)
                    };
                }
            });

            setAnalysisData({ timestamp: Date.now(), assignments });
            toast({ title: "Coverage Calculated", description: `Analyzed ${validStores.length} stores against map zones.` });
        } catch (e) {
            console.error("Analysis Crash:", e);
            toast({ variant: "destructive", title: "Analysis Failed", description: "Something went wrong calculating coverage." });
        } finally {
            setAnalyzing(false);
        }

    }, 800);
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-purple-600" /></div>;

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* HEADER */}
      <header className="h-16 border-b bg-white flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-2">
            <div className="bg-purple-600 p-2 rounded-lg"><MapIcon className="text-white h-5 w-5" /></div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">Coverage Analysis</h1>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* SIDEBAR */}
        <div className="w-96 bg-white border-r flex flex-col shrink-0 overflow-y-auto z-20 shadow-xl">
            <div className="p-6 space-y-8">
                
                {/* 1. CITY SELECTOR */}
                <div className="space-y-3">
                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Region</Label>
                    <Select onValueChange={handleCityChange} value={selectedCity?.id}>
                        <SelectTrigger className="h-12 border-slate-200 text-lg font-medium">
                            <SelectValue placeholder="Choose a city..." />
                        </SelectTrigger>
                        <SelectContent>
                            {cities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    
                    {/* Warning if city is broken */}
                    {selectedCity && (!selectedCity.polygons || !selectedCity.polygons.features) && (
                        <div className="bg-red-50 p-3 rounded-md flex items-start gap-2 border border-red-100">
                            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700 leading-snug">
                                <strong>No Map Data:</strong> This city has no polygons uploaded. Please go to City Management and re-upload the GeoJSON file.
                            </p>
                        </div>
                    )}
                </div>

                {/* 2. THRESHOLDS */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <span className="h-2 w-2 rounded-full bg-green-500" /> Coverage Rules
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-[10px] text-slate-400 uppercase">Green Radius (km)</Label>
                            <Input type="number" value={greenRadius} onChange={e => setGreenRadius(Number(e.target.value))} className="bg-white h-9" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-slate-400 uppercase">Yellow Radius (km)</Label>
                            <Input type="number" value={yellowRadius} onChange={e => setYellowRadius(Number(e.target.value))} className="bg-white h-9" />
                        </div>
                    </div>
                </div>

                {/* 3. STORE INPUTS */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Store Locations</Label>
                        <Button variant="ghost" size="sm" onClick={addStore} className="h-7 text-xs text-purple-600 hover:bg-purple-50">
                            <Plus className="h-3 w-3 mr-1" /> Add Branch
                        </Button>
                    </div>
                    
                    <div className="space-y-3 min-h-[100px]">
                        {stores.length === 0 && (
                            <div className="text-center py-8 border-2 border-dashed rounded-lg text-slate-300 text-sm">
                                No stores added.
                            </div>
                        )}
                        {stores.map((store, idx) => (
                            <Card key={store.id} className="relative group border-l-4 border-l-purple-500 shadow-sm">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="absolute top-1 right-1 h-6 w-6 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => removeStore(store.id)}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                                <CardContent className="p-3 space-y-2">
                                    <Input 
                                        placeholder="Branch Name" 
                                        className="h-8 text-sm font-semibold border-none shadow-none px-0 focus-visible:ring-0" 
                                        value={store.name} 
                                        onChange={e => updateStore(store.id, 'name', e.target.value)} 
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input placeholder="Lat" className="h-8 text-xs bg-slate-50 font-mono" value={store.lat} onChange={e => updateStore(store.id, 'lat', e.target.value)} />
                                        <Input placeholder="Lng" className="h-8 text-xs bg-slate-50 font-mono" value={store.lng} onChange={e => updateStore(store.id, 'lng', e.target.value)} />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

                {/* 4. ANALYZE BUTTON */}
                <Button 
                    className="w-full h-12 text-base font-bold bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200" 
                    onClick={handleAnalyze} 
                    disabled={analyzing || !selectedCity || !selectedCity.polygons}
                >
                    {analyzing ? <Loader2 className="animate-spin mr-2" /> : "Check Coverage"}
                </Button>

            </div>
        </div>

        {/* MAP AREA */}
        <div className="flex-1 bg-slate-100 relative">
            {!selectedCity ? (
                <div className="h-full w-full flex flex-col items-center justify-center text-slate-400">
                    <MapIcon className="h-16 w-16 mb-4 opacity-20" />
                    <p>Select a region to begin analysis</p>
                </div>
            ) : (
                <Tabs defaultValue="map" className="h-full flex flex-col">
                    <div className="absolute top-4 left-4 z-10 bg-white/90 p-1 rounded-lg border shadow-sm">
                        <TabsList className="h-8">
                            <TabsTrigger value="map" className="text-xs h-7"><MapIcon className="h-3 w-3 mr-1" /> Map</TabsTrigger>
                            <TabsTrigger value="table" className="text-xs h-7"><TableIcon className="h-3 w-3 mr-1" /> Data</TabsTrigger>
                        </TabsList>
                    </div>
                    
                    <TabsContent value="map" className="flex-1 m-0 p-0 h-full">
                        {/* Only render MapView if city data is valid */}
                        {selectedCity.polygons ? (
                            <MapView 
                                selectedCity={selectedCity} 
                                stores={stores} 
                                analysisData={analysisData} 
                                isLoading={analyzing} 
                            />
                        ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center text-slate-400">
                                <AlertTriangle className="h-12 w-12 mb-2 text-amber-400" />
                                <p className="font-bold text-slate-600">No Map Data Available</p>
                                <p className="text-xs">Please re-upload polygons for {selectedCity.name}.</p>
                            </div>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="table" className="flex-1 m-0 p-6 overflow-auto">
                        <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-slate-400">
                            Table view not implemented in this demo.
                        </div>
                    </TabsContent>
                </Tabs>
            )}
        </div>
      </div>
    </div>
  );
}
