'use client';

import { collection, writeBatch, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase"; 
import { useRef, useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, UploadCloud, Settings2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from "@/components/ui/separator";
import type { AnalysisFormValues, City } from '@/lib/types';

// --- HELPER: ROBUST CSV & WKT PARSER ---
const parseCSVLine = (row: string) => {
  const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
  return row.split(regex).map(cell => {
    let clean = cell.trim();
    if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.substring(1, clean.length - 1);
    return clean.replace(/""/g, '"');
  });
};

const parseWKT = (wkt: string) => {
  try {
    if (!wkt) return [];
    const matches = wkt.match(/(-?\d+\.?\d+)\s+(-?\d+\.?\d+)/g);
    if (!matches) return [];
    return matches.map(pair => {
      const [lngStr, latStr] = pair.trim().split(/\s+/);
      const lng = parseFloat(lngStr);
      const lat = parseFloat(latStr);
      if (isNaN(lat) || isNaN(lng)) return null;
      return { lat, lat, lng: lng }; 
    }).filter((p): p is {lat: number, lng: number} => p !== null);
  } catch (e) {
    console.error("WKT Parse Error:", e);
    return [];
  }
};

type AnalysisPanelProps = {
  cities: City[];
  isLoadingCities: boolean;
  onAnalyze: (data: AnalysisFormValues) => void;
  isLoading: boolean;
  onCityChange: (cityId: string) => void;
};

export function AnalysisPanel({ cities, isLoadingCities, onAnalyze, isLoading, onCityChange }: AnalysisPanelProps) {
  const storeIdCounter = useRef(1);
  const [greenLimit, setGreenLimit] = useState<string>("2"); 
  const [yellowLimit, setYellowLimit] = useState<string>("5"); 
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const form = useForm<AnalysisFormValues>({
    defaultValues: {
      cityId: '',
      stores: [{ id: `store-0`, name: 'Store 1', lat: '', lng: '', coords: '' }], // Added coords field
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'stores',
  });

  const selectedCityId = form.watch('cityId');

  useEffect(() => {
    if (cities.length > 0 && !form.getValues('cityId')) {
      const defaultCityId = cities[0].id;
      form.reset({ ...form.getValues(), cityId: defaultCityId });
      onCityChange(defaultCityId);
    }
  }, [cities, form, onCityChange]);

  useEffect(() => {
    if (selectedCityId) {
        const city = cities.find(c => c.id === selectedCityId);
        if (city && (city as any).thresholds) {
            setGreenLimit((city as any).thresholds.green.toString());
            setYellowLimit((city as any).thresholds.yellow.toString());
        } else {
            setGreenLimit("2");
            setYellowLimit("5");
        }
    }
  }, [selectedCityId, cities]);

  const onSubmit = (data: any) => {
    // 1. ROBUST COORDINATE PARSING
    const validStores = data.stores.map((store: any) => {
      let lat = parseFloat(store.lat);
      let lng = parseFloat(store.lng);

      // If user pasted into the "coords" box:
      if (store.coords && store.coords.trim() !== "") {
        const clean = store.coords.replace(/[() ]/g, ''); // Remove spaces & ()
        const parts = clean.split(',');
        
        if (parts.length === 2) {
          lat = parseFloat(parts[0]);
          lng = parseFloat(parts[1]);
        }
      }

      return { ...store, lat, lng };
    }).filter((s: any) => !isNaN(s.lat) && !isNaN(s.lng)); 

    // 2. ERROR CHECK
    if (validStores.length === 0) {
        alert("❌ No valid coordinates found!\nPlease use format: 36.123, 44.123");
        return;
    }
    
    // 3. SEND TO DASHBOARD
    onAnalyze({ ...data, stores: validStores });
  };

  const handleUpdateSettings = async () => {
      if (!selectedCityId) return;
      const city = cities.find(c => c.id === selectedCityId);
      if (!city) return;

      setIsSavingSettings(true);
      try {
          const docRef = doc(db, "cities", city.id);
          await updateDoc(docRef, {
              thresholds: {
                  green: parseFloat(greenLimit), 
                  yellow: parseFloat(yellowLimit)
              }
          });
          alert(`✅ Updated Distance Rules!\nGreen < ${greenLimit}km, Yellow < ${yellowLimit}km`);
      } catch (error) {
          console.error("Error updating settings:", error);
          alert("❌ Failed to save settings.");
      } finally {
          setIsSavingSettings(false);
      }
  };

  // --- CSV LOGIC ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'polygons' | 'users') => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const rows = text.split('\n').slice(1);
      const batch = writeBatch(db);
      let count = 0;

      rows.forEach((row) => {
        if (!row.trim()) return;
        const cols = parseCSVLine(row);

        if (type === 'polygons') {
          const city = cols[0];
          const zoneId = cols[1];
          const name = cols[2];
          const wkt = cols[3];
          
          if (wkt && wkt.includes('OLYGON')) {
            const positions = parseWKT(wkt);
            if (positions.length > 2) {
                const ref = doc(collection(db, "zones")); 
                batch.set(ref, {
                  city: city,
                  zoneId: zoneId,
                  name: name,
                  positions: positions,
                  type: "Feature"
                });
                count++;
            }
          }
        }
        else if (type === 'users') {
          const [username, fullName, password, role, allowedCities] = cols;
          if (username) {
            const ref = doc(db, "users", username);
            batch.set(ref, {
              username: username,
              name: fullName,
              role: role,
              allowedCities: allowedCities ? allowedCities.split('|') : [],
            });
            count++;
          }
        }
      });

      try {
        await batch.commit();
        alert(`✅ Successfully imported ${count} items into '${type}'!`);
      } catch (error) {
        console.error("Import Error:", error);
        alert(`❌ Error importing ${type}. See console.`);
      }
    };
    reader.readAsText(file);
  };
  
  return (
    <Card className="h-full flex flex-col border-none shadow-none">
      <CardHeader className="px-4 py-4">
        <CardTitle className="font-headline text-xl">Coverage Analysis</CardTitle>
        <CardDescription>Distance-based zone coverage.</CardDescription>
      </CardHeader>
      
      <ScrollArea className="flex-grow px-4">
        <CardContent className="p-0 space-y-6 pb-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <FormField
                control={form.control}
                name="cityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select City</FormLabel>
                    <Select onValueChange={(val) => { field.onChange(val); onCityChange(val); }} value={field.value} disabled={isLoadingCities || cities.length === 0}>
                      <FormControl><SelectTrigger><SelectValue placeholder={isLoadingCities ? "Loading..." : "Select City"} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {/* ⚙️ CITY SETTINGS (DISTANCE) */}
              <div className="bg-slate-50 p-3 rounded-md border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 text-slate-800">
                      <Settings2 className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Distance Rules (KM)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                          <label className="text-[10px] uppercase font-semibold text-green-700">Green Radius (km)</label>
                          <Input type="number" step="0.1" value={greenLimit} onChange={(e) => setGreenLimit(e.target.value)} className="h-8 text-xs bg-white" />
                      </div>
                      <div className="space-y-1">
                          <label className="text-[10px] uppercase font-semibold text-amber-600">Yellow Radius (km)</label>
                          <Input type="number" step="0.1" value={yellowLimit} onChange={(e) => setYellowLimit(e.target.value)} className="h-8 text-xs bg-white" />
                      </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handleUpdateSettings} disabled={isSavingSettings || !selectedCityId} className="w-full h-7 text-xs">
                    {isSavingSettings ? "Saving..." : "Save Rules"}
                  </Button>
              </div>

              <Separator />

              {/* 📍 GOOGLE MAPS STYLE INPUT */}
              <div className="space-y-4">
                <FormLabel>Store Locations</FormLabel>
                {fields.map((field, index) => (
                  <Card key={field.id} className="p-3 bg-muted/30 border border-slate-200">
                    <div className="grid grid-cols-1 gap-3">
                      <FormField control={form.control} name={`stores.${index}.name`} render={({ field }) => (
                        <FormItem className="space-y-1"><FormLabel className="text-[10px] uppercase text-muted-foreground">Name</FormLabel><FormControl><Input {...field} className="h-8" /></FormControl></FormItem>
                      )} />
                      
                      {/* SINGLE COORDINATE INPUT */}
                      <FormField control={form.control} name={`stores.${index}.coords`} render={({ field }) => (
                         <FormItem className="space-y-1">
                            <FormLabel className="text-[10px] uppercase text-muted-foreground">Coordinates (Lat, Lng)</FormLabel>
                            <FormControl>
                                <Input {...field} placeholder="36.1234, 44.5678" className="h-8 font-mono text-xs" />
                            </FormControl>
                         </FormItem>
                      )} />
                    </div>
                    {fields.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6 mt-2 hover:text-red-500" onClick={() => remove(index)}><Trash2 className="h-3 w-3" /></Button>}
                  </Card>
                ))}
                <Button type="button" variant="ghost" size="sm" className="w-full border border-dashed border-slate-300 text-muted-foreground" onClick={() => append({ id: `store-${storeIdCounter.current++}`, name: `Store ${fields.length + 1}`, coords: '', lat: '', lng: '' })}>
                  <Plus className="mr-2 h-3 w-3" /> Add Branch
                </Button>
              </div>

              <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={isLoading}>
                  {isLoading ? "Analyzing..." : "Check Coverage"}
              </Button>
              
              {/* DATA IMPORT */}
              <div className="mt-8 pt-6 border-t border-border space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <UploadCloud className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bulk Import</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <FormLabel className="text-[10px] text-muted-foreground uppercase">Polygons (CSV)</FormLabel>
                    <Input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'polygons')} className="h-8 text-xs cursor-pointer" />
                  </div>
                  <div className="space-y-1">
                    <FormLabel className="text-[10px] text-muted-foreground uppercase">Users (CSV)</FormLabel>
                    <Input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'users')} className="h-8 text-xs cursor-pointer" />
                  </div>
                </div>
              </div>

            </form>
          </Form>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
