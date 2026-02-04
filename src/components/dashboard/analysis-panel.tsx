'use client';

import { collection, writeBatch, doc } from "firebase/firestore";
import { db } from "../../firebase"; 
import { useRef, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AnalysisFormValues, City } from '@/lib/types';
import { analysisSchema } from '@/lib/types';
import { Plus, Trash2, UploadCloud } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

// --- HELPER: PARSE WKT ---
// Converts "POLYGON((44.0 36.0, ...))" to [{lat:36.0, lng:44.0}, ...]
const parseWKT = (wkt: string) => {
  try {
    // 1. Remove text, keep numbers: "44.0 36.0, 44.1 36.1"
    const content = wkt.replace(/POLYGON\(\(/i, '').replace(/\)\)/, '');
    
    // 2. Split into pairs
    return content.split(',').map(pair => {
      const [lng, lat] = pair.trim().split(/\s+/).map(Number);
      return { lat, lng }; // Note: WKT is usually "LON LAT", Mapbox needs "LAT LNG"
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
  } catch (e) {
    console.error("Invalid WKT:", wkt);
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

  const form = useForm<AnalysisFormValues>({
    resolver: zodResolver(analysisSchema),
    defaultValues: {
      cityId: '',
      stores: [{ id: `store-0`, name: 'Store 1', lat: '36.19', lng: '44.00' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'stores',
  });

  useEffect(() => {
    if (cities.length > 0 && !form.getValues('cityId')) {
      const defaultCityId = cities[0].id;
      form.reset({ ...form.getValues(), cityId: defaultCityId });
      onCityChange(defaultCityId);
    }
  }, [cities, form, onCityChange]);

  const onSubmit = (data: AnalysisFormValues) => {
    onAnalyze(data);
  };

  // --- NEW: CSV UPLOAD LOGIC ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'polygons' | 'thresholds' | 'users') => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const rows = text.split('\n').slice(1); // Remove header
      const batch = writeBatch(db);
      let count = 0;

      rows.forEach((row) => {
        if (!row.trim()) return;
        // Basic CSV split (Note: fails if cells contain commas)
        const cols = row.split(',').map(c => c.trim());

        // 1. UPLOAD POLYGONS (Zones)
        if (type === 'polygons') {
          // Format: City, Zone_ID, name, WKT
          const [city, zoneId, name, wkt] = cols;
          
          if (wkt && wkt.includes('POLYGON')) {
            const positions = parseWKT(wkt); // Convert WKT to Coordinates
            const ref = doc(collection(db, "zones")); 
            batch.set(ref, {
              city: city,
              zoneId: zoneId,
              name: name,
              positions: positions, // Saved as clean Array of Objects
              type: "Feature" // Standard GeoJSON type
            });
            count++;
          }
        }

        // 2. UPLOAD THRESHOLDS (Cities Config)
        else if (type === 'thresholds') {
          // Format: city, green_limit, yellow_limit
          const [city, green, yellow] = cols;
          if (city) {
            // We use the City Name as the ID so it's easy to find "Erbil" later
            const ref = doc(db, "cities", city); 
            batch.set(ref, {
              name: city,
              thresholds: {
                green: Number(green),
                yellow: Number(yellow)
              }
            }, { merge: true }); // Merge: Don't delete existing city data
            count++;
          }
        }

        // 3. UPLOAD USERS
        else if (type === 'users') {
          // Format: username, name, password, role, allowed cities
          const [username, fullName, password, role, allowedCities] = cols;
          if (username) {
            const ref = doc(db, "users", username);
            batch.set(ref, {
              username: username,
              name: fullName,
              role: role,
              // Convert "Erbil|Duhok" to ["Erbil", "Duhok"]
              allowedCities: allowedCities ? allowedCities.split('|') : [],
              // ⚠️ SECURITY NOTE: We do NOT upload the password to Firestore.
              // Passwords belong in Firebase Auth, not the database.
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
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="font-headline text-xl">Coverage Analysis</CardTitle>
        <CardDescription>Enter store location coordinates manually.</CardDescription>
      </CardHeader>
      <ScrollArea className="flex-grow">
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* City Selection */}
              <FormField
                control={form.control}
                name="cityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <Select onValueChange={(val) => { field.onChange(val); onCityChange(val); }} value={field.value} disabled={isLoadingCities || cities.length === 0}>
                      <FormControl><SelectTrigger><SelectValue placeholder={isLoadingCities ? "Loading..." : "Select City"} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Stores (Manual Entry) */}
              <div className="space-y-4">
                <FormLabel>Store Coordinates</FormLabel>
                {fields.map((field, index) => (
                  <Card key={field.id} className="p-4 bg-muted/50">
                    <div className="grid grid-cols-1 gap-4">
                      <FormField control={form.control} name={`stores.${index}.name`} render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">Store Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                      )} />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name={`stores.${index}.lat`} render={({ field }) => (
                           <FormItem><FormLabel className="text-xs">Lat</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                        )} />
                        <FormField control={form.control} name={`stores.${index}.lng`} render={({ field }) => (
                           <FormItem><FormLabel className="text-xs">Lng</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                        )} />
                      </div>
                    </div>
                    {fields.length > 1 && <Button variant="ghost" size="icon" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>}
                  </Card>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ id: `store-${storeIdCounter.current++}`, name: `Store ${fields.length + 1}`, lat: '', lng: '' })}>
                  <Plus className="mr-2 h-4 w-4" /> Add Store
                </Button>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>Analyze Coverage</Button>

              {/* 👇 ADMIN IMPORT TOOLS 👇 */}
              <div className="mt-8 pt-6 border-t border-border space-y-4 bg-slate-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <UploadCloud className="h-4 w-4 text-purple-600" />
                  <span className="text-xs font-bold text-purple-900 uppercase tracking-wider">Admin Data Import</span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* 1. Polygons */}
                  <div className="space-y-1">
                    <FormLabel className="text-[10px] text-muted-foreground uppercase">1. Polygons (CSV with WKT)</FormLabel>
                    <Input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'polygons')} className="h-8 text-xs cursor-pointer" />
                  </div>

                  {/* 2. Thresholds */}
                  <div className="space-y-1">
                    <FormLabel className="text-[10px] text-muted-foreground uppercase">2. City Thresholds (CSV)</FormLabel>
                    <Input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'thresholds')} className="h-8 text-xs cursor-pointer" />
                  </div>

                  {/* 3. Users */}
                  <div className="space-y-1">
                    <FormLabel className="text-[10px] text-muted-foreground uppercase">3. User List (CSV)</FormLabel>
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
// Identity Verification Fix