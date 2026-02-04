'use client';
import { useContext, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CityContext } from '@/context/city-context';
import type { City } from '@/lib/types';
import type { FeatureCollection, Polygon } from 'geojson';

export default function CityManagementPage() {
  const { addCity } = useContext(CityContext);
  const { toast } = useToast();
  const [cityName, setCityName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cityName || !file) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Please provide a city name and a GeoJSON file.',
      });
      return;
    }
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
            throw new Error("Could not read file.")
        }
        const geojson = JSON.parse(content) as FeatureCollection<Polygon>;
        
        // Basic validation
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
            throw new Error("Invalid GeoJSON format. Must be a FeatureCollection.");
        }

        for (const feature of geojson.features) {
            if (feature.type !== 'Feature' || !feature.properties || typeof feature.properties.id === 'undefined' || typeof feature.properties.name === 'undefined') {
                throw new Error("Each feature in the GeoJSON must have 'id' and 'name' in its properties.");
            }
        }

        const newCity: City = {
          id: cityName.toLowerCase().replace(/\s+/g, '-'),
          name: cityName,
          // A default center, can be improved to calculate from polygons
          center: { lat: 36.1911, lng: 44.0094 }, 
          polygons: geojson,
        };
        addCity(newCity);
        toast({
          title: 'City Added',
          description: `${cityName} with its polygons has been successfully uploaded.`,
        });
        setCityName('');
        setFile(null);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: error.message || 'Could not parse the GeoJSON file.',
        });
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <main className="p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-xl">City Management</CardTitle>
          <CardDescription>Upload new city polygon data using a GeoJSON file.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="city-name">City Name</Label>
              <Input
                id="city-name"
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="e.g., Baghdad"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="geojson-file">Polygon File (GeoJSON)</Label>
              <Input
                id="geojson-file"
                type="file"
                accept=".json, .geojson"
                onChange={handleFileChange}
                disabled={isLoading}
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Uploading...' : 'Upload City Data'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
