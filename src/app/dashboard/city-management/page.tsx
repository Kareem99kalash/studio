'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/firebase'; // Ensure this points to your firebase config
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, UploadCloud } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function CityManagementPage() {
  const [cities, setCities] = useState<any[]>([]);
  const [newCityName, setNewCityName] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // 1. Fetch Cities
  const fetchCities = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'cities'));
      setCities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Failed to load cities." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCities();
  }, []);

  // 2. Add City
  const handleAddCity = async () => {
    if (!newCityName.trim()) return;
    try {
      await addDoc(collection(db, 'cities'), {
        name: newCityName,
        createdAt: new Date().toISOString(),
        thresholds: { green: 2.0, yellow: 5.0 } // Default rules
      });
      setNewCityName('');
      fetchCities();
      toast({ title: "Success", description: "City added." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add city." });
    }
  };

  // 3. Delete City
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this city? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, 'cities', id));
      fetchCities();
      toast({ title: "Deleted", description: "City removed." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete city." });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">City Management</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ADD CITY CARD */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add New City</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input 
                placeholder="City Name (e.g. Erbil)" 
                value={newCityName} 
                onChange={(e) => setNewCityName(e.target.value)} 
              />
              <Button onClick={handleAddCity}>
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Note: Polygons for this city must be uploaded separately via CSV on the Dashboard.
            </p>
          </CardContent>
        </Card>

        {/* CITY LIST */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Active Cities</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City Name</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={3} className="text-center">Loading...</TableCell></TableRow>
                ) : cities.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center">No cities found.</TableCell></TableRow>
                ) : (
                    cities.map((city) => (
                      <TableRow key={city.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                            <UploadCloud className="h-4 w-4 text-blue-500" />
                            {city.name}
                        </TableCell>
                        <TableCell>{city.createdAt ? new Date(city.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(city.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}