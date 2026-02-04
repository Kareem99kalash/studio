'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase'; // Ensure this points to your firebase config
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type CityConfig = {
  id: string;
  name: string;
  thresholds: {
    green: number;
    yellow: number;
  };
};

export default function CityThresholdsPage() {
  const [cities, setCities] = useState<CityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  // 1. Fetch Cities & Current Thresholds
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const snap = await getDocs(collection(db, 'cities'));
        const cityList = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                name: data.name,
                // Load saved thresholds or default to 2.0 / 5.0
                thresholds: data.thresholds || { green: 2.0, yellow: 5.0 }
            };
        });
        setCities(cityList);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchCities();
  }, []);

  // 2. Handle Input Change
  const handleChange = (id: string, field: 'green' | 'yellow', value: string) => {
    setCities(prev => prev.map(c => {
        if (c.id !== id) return c;
        return {
            ...c,
            thresholds: { ...c.thresholds, [field]: parseFloat(value) }
        };
    }));
  };

  // 3. Save Changes to Firestore
  const handleSave = async (city: CityConfig) => {
    setSavingId(city.id);
    try {
        const docRef = doc(db, 'cities', city.id);
        await updateDoc(docRef, {
            thresholds: city.thresholds
        });
        toast({ title: "Saved", description: `Updated limits for ${city.name}` });
    } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "Failed to save settings" });
    } finally {
        setSavingId(null);
    }
  };

  if (loading) return <div className="p-8">Loading settings...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">City Thresholds</h1>
        <p className="text-muted-foreground">Set the coverage distance limits (in km) for each city.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>City Name</TableHead>
                <TableHead>Green Radius (Safe)</TableHead>
                <TableHead>Yellow Radius (Warning)</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map((city) => (
                <TableRow key={city.id}>
                  <TableCell className="font-medium">{city.name}</TableCell>
                  <TableCell>
                      <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-green-500"></span>
                          <Input 
                            type="number" 
                            step="0.1" 
                            className="w-24 h-8"
                            value={city.thresholds.green}
                            onChange={(e) => handleChange(city.id, 'green', e.target.value)}
                          />
                          <span className="text-sm text-muted-foreground">km</span>
                      </div>
                  </TableCell>
                  <TableCell>
                      <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                          <Input 
                            type="number" 
                            step="0.1" 
                            className="w-24 h-8"
                            value={city.thresholds.yellow}
                            onChange={(e) => handleChange(city.id, 'yellow', e.target.value)}
                          />
                          <span className="text-sm text-muted-foreground">km</span>
                      </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                        size="sm" 
                        onClick={() => handleSave(city)}
                        disabled={savingId === city.id}
                    >
                        {savingId === city.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}