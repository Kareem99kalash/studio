'use client';

import { useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cities } from '@/lib/data';
import type { AnalysisFormValues } from '@/lib/types';
import { analysisSchema } from '@/lib/types';
import { Plus, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

type AnalysisPanelProps = {
  onAnalyze: (data: AnalysisFormValues) => void;
  isLoading: boolean;
  onCityChange: (cityId: string) => void;
};

export function AnalysisPanel({ onAnalyze, isLoading, onCityChange }: AnalysisPanelProps) {
  const storeIdCounter = useRef(1);

  const form = useForm<AnalysisFormValues>({
    resolver: zodResolver(analysisSchema),
    defaultValues: {
      cityId: 'erbil',
      stores: [{ id: `store-0`, name: 'Store 1', lat: '36.19', lng: '44.00' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'stores',
  });

  const onSubmit = (data: AnalysisFormValues) => {
    onAnalyze(data);
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
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a city" />
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

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Analyzing...' : 'Analyze Coverage'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
