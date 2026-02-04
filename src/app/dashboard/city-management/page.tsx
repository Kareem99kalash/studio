'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, MapPin, Settings2, FileCode, ChevronRight, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

// --- HELPERS ---
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
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (isNaN(lat) || isNaN(lng)) return null;
      return { lat, lng };
    }).filter((p): p is {lat: number, lng: number} => p !== null);
  } catch (e) {
    return [];
  }
};

export default function CityManagementPage() {
  const { toast } = useToast();
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Wizard State
  const [step, setStep] = useState(1);
  const [cityName, setCityName] = useState('');
  const [thresholds, setThresholds] = useState({ green: 2, yellow: 5 });
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const fetchCities = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'cities'));
      setCities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast({ variant: "destructive", title: "Load Error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCities(); }, []);

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split(/\r?\n/).slice(1);
      const parsed = rows.map(row => {
        if (!row.trim()) return null;
        const cols = parseCSVLine(row);
        const wktIndex = cols.findIndex(col => col.toUpperCase().includes("POLYGON"));
        return wktIndex !== -1 ? cols : null;
      }).filter(item => item !== null);

      if (parsed.length === 0) {
        toast({ variant: "destructive", title: "Format Error", description: "No POLYGON column found." });
      } else {
        setCsvData(parsed);
        toast({ title: "File Loaded", description: `${parsed.length} zones identified.` });
      }
    };
    reader.readAsText(file);
  };

  const handleFinalSave = async () => {
    if (!cityName.trim() || csvData.length === 0) return;
    setIsSaving(true);
    try {
      const cityRef = await addDoc(collection(db, 'cities'), {
        name: cityName.trim(),
        thresholds: thresholds,
        createdAt: new Date().toISOString()
      });

      const CHUNK_SIZE = 400; 
      for (let i = 0; i < csvData.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = csvData.slice(i, i + CHUNK_SIZE);

        chunk.forEach(cols => {
          const wktIndex = cols.findIndex(col => col.toUpperCase().includes("POLYGON"));
          const positions = parseWKT(cols[wktIndex]);
          if (positions.length > 2) {
            const zoneRef = doc(collection(db, "zones"));
            batch.set(zoneRef, {
              city: cityName.trim(),
              name: cols[2] || "Unnamed Zone",
              positions: positions,
              type: "Feature"
            });
          }
        });
        await batch.commit();
      }

      toast({ title: "Success", description: `${cityName} created successfully.` });
      setStep(1); setCityName(''); setCsvData([]); fetchCities();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save Failed", description: e.message });
    } finally { setIsSaving(false); }
  };

  const handleDeleteCity = async (id: string) => {
    if (!confirm("Delete city?")) return;
    await deleteDoc(doc(db, 'cities', id));
    fetchCities();
  };

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">City Management</h1>
        <Badge variant="outline" className="bg-white">Admin Only</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 border-t-4 border-t-purple-600 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Add New City</CardTitle>
            <CardDescription>Setup city metadata and geographic zones.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Info */}
            <div className={`space-y-2 p-3 rounded-lg border ${step === 1 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">1</Badge>
                <MapPin className="h-4 w-4" /> Basic Info
              </div>
              {step === 1 && (
                <div className="pt-2 space-y-3">
                  <Input placeholder="City Name" value={cityName} onChange={e => setCityName(e.target.value)} />
                  <Button size="sm" className="w-full" disabled={!cityName} onClick={() => setStep(2)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              )}
            </div>

            {/* Step 2: Rules */}
            <div className={`space-y-2 p-3 rounded-lg border ${step === 2 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">2</Badge>
                <Settings2 className="h-4 w-4" /> Distance Rules
              </div>
              {step === 2 && (
                <div className="pt-2 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" placeholder="Green" value={thresholds.green} onChange={e => setThresholds({...thresholds, green: Number(e.target.value)})} />
                    <Input type="number" placeholder="Yellow" value={thresholds.yellow} onChange={e => setThresholds({...thresholds, yellow: Number(e.target.value)})} />
                  </div>
                  <Button size="sm" className="w-full" onClick={() => setStep(3)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              )}
            </div>

            {/* Step 3: Data */}
            <div className={`space-y-2 p-3 rounded-lg border ${step === 3 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">3</Badge>
                <FileCode className="h-4 w-4" /> Polygon CSV
              </div>
              {step === 3 && (
                <div className="pt-2 space-y-3">
                  <Input type="file" accept=".csv" onChange={handleFileLoad} className="text-xs h-9 cursor-pointer" />
                  <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={csvData.length === 0 || isSaving} onClick={handleFinalSave}>
                    {isSaving ? <Loader2 className="animate-spin" /> : "Complete Setup"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm">
          <CardHeader><CardTitle>Existing Cities</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Rules (G/Y)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={3} className="text-center py-4">Loading...</TableCell></TableRow> : 
                  cities.map((city) => (
                    <TableRow key={city.id}>
                      <TableCell className="font-bold">{city.name}</TableCell>
                      <TableCell>{city.thresholds?.green}km / {city.thresholds?.yellow}km</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteCity(city.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </TableCell>
                    </TableRow>
                  ))
                }
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
