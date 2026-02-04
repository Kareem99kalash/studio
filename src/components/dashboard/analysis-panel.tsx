'use client';

import { collection, writeBatch, doc } from "firebase/firestore";
import { db } from "../../firebase"; // Adjust path if needed (e.g. '@/firebase')
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
import { Plus, Trash2, Database } from 'lucide-react'; // Added Database icon
import { ScrollArea } from '@/components/ui/scroll-area';

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
      form.reset({
        ...form.getValues(),
        cityId: defaultCityId,
      });
      onCityChange(defaultCityId);
    }
  }, [cities, form, onCityChange]);

  const onSubmit = (data: AnalysisFormValues) => {
    onAnalyze(data);
  };

  // --- TEMPORARY: DATA SEEDER (FIXED) ---
  const seedDatabase = async () => {
    // 1. Create a Batch
    const batch = writeBatch(db);

    // 2. Define Branches
    const initialBranches = [
      { name: "Main HQ", lat: 36.19, lng: 44.00, city: "Erbil" },
      { name: "North Depot", lat: 36.25, lng: 44.05, city: "Erbil" },
      { name: "South Hub", lat: 36.12, lng: 43.98, city: "Erbil" }
    ];

    // 3. Define Zones (FIXED: Using Objects instead of Arrays)
    const initialZones = [
      { 
        name: "Zone A (Close)", 
        status: "Pending", 
        color: "#484f58", 
        // 👇 CHANGED: Array of Objects, not Array of Arrays
        positions: [
          { lat: 36.20, lng: 44.00 }, 
          { lat: 36.22, lng: 44.02 }, 
          { lat: 36.20, lng: 44.04 }
        ] 
      },
      { 
        name: "Zone B (Far)", 
        status: "Pending", 
        color: "#484f58", 
        // 👇 CHANGED: Array of Objects
        positions: [
          { lat: 36.15, lng: 43.95 }, 
          { lat: 36.17, lng: 43.97 }, 
          { lat: 36.15, lng: 43.99 }
        ] 
      }
    ];

    // 4. Queue Branches
    initialBranches.forEach((b) => {
      const ref = doc(collection(db, "branches")); 
      batch.set(ref, b);
    });

    // 5. Queue Zones
    initialZones.forEach((z) => {
      const ref = doc(collection(db, "zones")); 
      batch.set(ref, z);
    });

    // 6. Commit
    try {
      await batch.commit();
      alert("✅ Python Data Successfully Uploaded to Firebase!");
    } catch (error) {
      console.error("Upload failed:", error);
      alert("❌ Error uploading data. Check console.");
    }
  };
  
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="font-headline text-xl">Coverage Analysis</CardTitle>
        <CardDescription>Input store locations to analyze delivery coverage.</CardDescription>
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
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        onCityChange(value);
                      }}
                      value={field.value}
                      disabled={isLoadingCities || cities.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={isLoadingCities ? "Loading cities..." : "Select a city"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {cities.map((city) => (
                          <SelectItem key={city.id} value={city.id}>
                            {city.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <FormLabel>Store Locations</FormLabel>
                {fields.map((field, index) => (
                  <Card key={field.id} className="p-4 bg-muted/50">
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name={`stores.${index}.name`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Store Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., Downtown Branch" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name={`stores.${index}.lat`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Latitude</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g., 36.19" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`stores.${index}.lng`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Longitude</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g., 44.00" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    {fields.length > 1 && (
                      <Button variant="ghost" size="icon" className="mt-2" onClick={() => remove(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </Card>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ id: `store-${storeIdCounter.current++}`, name: `Store ${fields.length + 1}`, lat: '', lng: '' })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add another store
                </Button>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || isLoadingCities}>
                {isLoading ? 'Analyzing...' : 'Analyze Coverage'}
              </Button>

              {/* 👇 ADMIN TOOLS SECTION 👇 */}
              <div className="mt-6 pt-6 border-t border-border">
                <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                  Admin Tools
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={seedDatabase}
                >
                  <Database className="mr-2 h-4 w-4" />
                  Upload Python Data to Firebase
                </Button>
              </div>
              
            </form>
          </Form>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
