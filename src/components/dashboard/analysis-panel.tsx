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

// --- HELPER 1: SMART CSV SPLITTER ---
// Splits by comma, but ignores commas inside quotes (e.g. "POLYGON((...))")
const parseCSVLine = (row: string) => {
  const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
  return row.split(regex).map(cell => {
    let clean = cell.trim();
    // Remove surrounding quotes if they exist
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.substring(1, clean.length - 1);
    }
    // Fix double quotes "" becoming "
    return clean.replace(/""/g, '"');
  });
};

// --- HELPER 2: ROBUST WKT PARSER ---
const parseWKT = (wkt: string) => {
  try {
    if (!wkt) return [];

    // 1. Regex to find all coordinate pairs (e.g. "44.0 36.0")
    // This ignores all text like "POLYGON", "((", "))", commas, etc.
    const matches = wkt.match(/(-?\d+\.?\d+)\s+(-?\d+\.?\d+)/g);
    
    if (!matches) return [];

    // 2. Map them to objects
    return matches.map(pair => {
      const [lngStr, latStr] = pair.trim().split(/\s+/);
      const lng = parseFloat(lngStr);
      const lat = parseFloat(latStr);

      // Validate
      if (isNaN(lat) || isNaN(lng)) return null;

      // Note: WKT is "LONGITUDE LATITUDE", but Apps usually want { lat, lng }
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

  // --- CSV UPLOAD LOGIC ---
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
        
        // Use the smart splitter instead of row.split(',')
        const cols = parseCSVLine(row);

        // 1. UPLOAD POLYGONS (Zones)
        if (type === 'polygons') {
          // Expected: City, Zone_ID, name, WKT
          // Note: If WKT had commas, it is now safely in cols[3]
          const city = cols[0];
          const zoneId = cols[1];
          const name = cols[2];
          const wkt = cols[3];
          
          if (wkt && wkt.includes('OLYGON')) {
            const positions = parseWKT(wkt);
            
            if (positions.length > 2) { // Only save if we have a valid shape (3+ points)
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

        // 2. UPLOAD THRESHOLDS
        else if (type === 'thresholds') {
          const [city, green, yellow] = cols;
          if (city) {
            const ref = doc(db, "cities", city); 
            batch.set(ref, {
              name: city,
              thresholds: {
                green: Number(green),
                yellow: Number(yellow)
              }
            }, { merge: true });
            count++;
          }
        }

        // 3. UPLOAD USERS
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
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="font-headline text-xl">Coverage Analysis</CardTitle>
        <CardDescription>Enter store location coordinates manually.</CardDescription>
      </CardHeader>
      <ScrollArea className="flex-grow">
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
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

              <div className="mt-8 pt-6 border-t border-border space-y-4 bg-slate-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <UploadCloud className="h-4 w-4 text-purple-600" />
                  <span className="text-xs font-bold text-purple-900 uppercase tracking-wider">Admin Data Import</span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <FormLabel className="text-[10px] text-muted-foreground uppercase">1. Polygons (CSV with WKT)</FormLabel>
                    <Input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'polygons')} className="h-8 text-xs cursor-pointer" />
                  </div>

                  <div className="space-y-1">
                    <FormLabel className="text-[10px] text-muted-foreground uppercase">2. City Thresholds (CSV)</FormLabel>
                    <Input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'thresholds')} className="h-8 text-xs cursor-pointer" />
                  </div>

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
