'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, MapPin, Settings2, FileCode, ChevronRight, Loader2, UploadCloud, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

// --- ROBUST WKT PARSER ---
const parseWKT = (wkt: string) => {
  try {
    if (!wkt) return null;
    const cleanWkt = wkt.trim().toUpperCase();
    const match = cleanWkt.match(/\(\((.*?)\)\)/);
    if (!match) return null;
    
    // Split by comma to get coordinate pairs
    const pairs = match[1].split(',').map(pair => {
      const parts = pair.trim().split(/\s+/);
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (isNaN(lng) || isNaN(lat)) return null;
      return [lng, lat]; 
    }).filter(p => p !== null);

    return pairs.length > 0 ? [pairs] : null; 
  } catch (e) { return null; }
};

export default function CityManagementPage() {
  const { toast } = useToast();
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [step, setStep] = useState(1);
  const [cityName, setCityName] = useState('');
  const [thresholds, setThresholds] = useState({ green: 2, yellow: 5 });
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit Mode State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editThresholds, setEditThresholds] = useState({ green: 0, yellow: 0 });

  useEffect(() => { fetchCities(); }, []);

  const fetchCities = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'cities'));
      setCities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/);
        const parsedRows = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const wktStart = line.toUpperCase().indexOf('POLYGON');
            if (wktStart === -1) continue;

            // Split Metadata and Geometry
            const metaPart = line.substring(0, wktStart);
            const wktPart = line.substring(wktStart);

            // 🛠️ FIX: Simple split by comma to preserve spaces in names
            // This handles "1, 21229, Sami Abdulrahman Park-Erbil26," correctly
            const cols = metaPart.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

            // Column Mapping: 0=Index, 1=ID, 2=Name (Adjust if your CSV is different)
            const zoneID = cols[1] || `ID_${i}`;
            const name = cols[2] || cols[1] || `Zone ${i}`;

            parsedRows.push({
                id: zoneID,
                name: name,
                wkt: wktPart
            });
        }

        if (parsedRows.length === 0) {
          toast({ variant: "destructive", title: "Format Error", description: "No POLYGON data found." });
        } else {
          setCsvData(parsedRows);
          toast({ title: "File Parsed", description: `Identified ${parsedRows.length} distinct zones.` });
        }
      } catch (err) {
        toast({ variant: "destructive", title: "Error", description: "Failed to read CSV." });
      }
    };
    reader.readAsText(file);
  };

  const handleFinalSave = async () => {
    if (!cityName.trim() || csvData.length === 0) return;
    setIsSaving(true);
    
    try {
      const features = csvData.map(item => {
        const coordinates = parseWKT(item.wkt);
        if (!coordinates) return null;
        
        const firstRing = coordinates[0];
        
        // 🛡️ TRUE CENTER FIX: Calculate Average of all Lat/Lngs
        let sumLat = 0;
        let sumLng = 0;
        firstRing.forEach((p) => {
            sumLng += p[0];
            sumLat += p[1];
        });
        
        const centroid = { 
            lat: sumLat / firstRing.length, 
            lng: sumLng / firstRing.length 
        };

        return {
          type: "Feature",
          properties: { 
              id: item.id, 
              name: item.name, 
              centroid: centroid 
          },
          geometry: { type: "Polygon", coordinates: coordinates }
        };
      }).filter(f => f !== null);

      if (features.length === 0) throw new Error("No valid zones generated.");

      const geoJSON = { type: "FeatureCollection", features: features };
      const jsonString = JSON.stringify(geoJSON);

      await addDoc(collection(db, 'cities'), {
        name: cityName.trim(),
        thresholds: thresholds,
        polygons: jsonString,
        createdAt: new Date().toISOString()
      });

      toast({ title: "Success", description: `City created with correct names & centroids.` });
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

  const startEdit = (city: any) => {
      setEditingId(city.id);
      setEditThresholds({ 
          green: city.thresholds?.green || 2, 
          yellow: city.thresholds?.yellow || 5 
      });
  };

  const saveThresholds = async (id: string) => {
      try {
          await updateDoc(doc(db, 'cities', id), { thresholds: editThresholds });
          toast({ title: "Updated", description: "Thresholds saved." });
          setEditingId(null);
          fetchCities();
      } catch (e) { toast({ variant: "destructive", title: "Error", description: "Could not update." }); }
  };

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">City Management</h1>
        <Badge variant="outline" className="bg-white">Admin</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 border-t-4 border-t-purple-600 shadow-md">
          <CardHeader><CardTitle>Add New City</CardTitle><CardDescription>Configure region and upload CSV.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            
            {/* Step 1 */}
            <div className={`p-3 rounded-lg border ${step === 1 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>1</Badge> Name</div>
                {step === 1 && <><Input placeholder="City Name" value={cityName} onChange={e => setCityName(e.target.value)} className="mb-2 bg-white" /><Button size="sm" className="w-full" disabled={!cityName} onClick={() => setStep(2)}>Next</Button></>}
            </div>

            {/* Step 2 */}
            <div className={`p-3 rounded-lg border ${step === 2 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>2</Badge> Rules (km)</div>
                {step === 2 && <><div className="grid grid-cols-2 gap-2 mb-2"><Input type="number" placeholder="Green" value={thresholds.green} onChange={e => setThresholds({...thresholds, green: Number(e.target.value)})} className="bg-white" /><Input type="number" placeholder="Yellow" value={thresholds.yellow} onChange={e => setThresholds({...thresholds, yellow: Number(e.target.value)})} className="bg-white" /></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setStep(1)}>Back</Button><Button size="sm" className="flex-1" onClick={() => setStep(3)}>Next</Button></div></>}
            </div>

            {/* Step 3 */}
            <div className={`p-3 rounded-lg border ${step === 3 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>3</Badge> Upload CSV</div>
                {step === 3 && <><div className="border-2 border-dashed border-slate-300 rounded p-4 bg-white text-center cursor-pointer relative hover:bg-slate-50"><Input type="file" accept=".csv" onChange={handleFileLoad} className="absolute inset-0 opacity-0 cursor-pointer" /><UploadCloud className="h-6 w-6 mx-auto text-slate-400" /><p className="text-xs text-slate-500 mt-1">{csvData.length > 0 ? `${csvData.length} Zones` : "Click to Upload"}</p></div><div className="flex gap-2 mt-2"><Button variant="outline" size="sm" onClick={() => setStep(2)}>Back</Button><Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={csvData.length === 0 || isSaving} onClick={handleFinalSave}>{isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : "Save City"}</Button></div></>}
            </div>

          </CardContent>
        </Card>

        {/* Existing Cities */}
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Active Cities</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Data Status</TableHead><TableHead>Thresholds (km)</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {cities.map(c => (
                    <TableRow key={c.id}>
                        <TableCell className="font-bold">{c.name}</TableCell>
                        <TableCell>{c.polygons ? <Badge variant="secondary" className="bg-green-100 text-green-700">Ready</Badge> : <Badge variant="outline">Empty</Badge>}</TableCell>
                        <TableCell>
                            {editingId === c.id ? (
                                <div className="flex items-center gap-2">
                                    <Input type="number" className="w-16 h-7 text-xs bg-green-50" value={editThresholds.green} onChange={e => setEditThresholds({...editThresholds, green: Number(e.target.value)})} />
                                    <span className="text-slate-300">/</span>
                                    <Input type="number" className="w-16 h-7 text-xs bg-yellow-50" value={editThresholds.yellow} onChange={e => setEditThresholds({...editThresholds, yellow: Number(e.target.value)})} />
                                    <Button size="icon" className="h-7 w-7 bg-blue-600 hover:bg-blue-700" onClick={() => saveThresholds(c.id)}><Save className="h-3 w-3" /></Button>
                                </div>
                            ) : (
                                <div className="group flex items-center gap-2 cursor-pointer" onClick={() => startEdit(c)}>
                                    <span className="font-mono text-xs text-green-600">{c.thresholds?.green || 2}</span>
                                    <span className="text-slate-300">/</span>
                                    <span className="font-mono text-xs text-yellow-600">{c.thresholds?.yellow || 5}</span>
                                    <Settings2 className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            )}
                        </TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => handleDeleteCity(c.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
