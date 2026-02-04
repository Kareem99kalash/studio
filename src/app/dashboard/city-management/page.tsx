'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, UploadCloud, MapPin, Settings2, FileCode, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
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
    const matches = wkt.match(/(-?\d+\.?\d+)\s+(-?\d+\.?\d+)/g);
    if (!matches) return [];
    return matches.map(pair => {
      const [lngStr, latStr] = pair.trim().split(/\s+/);
      return { lat: parseFloat(latStr), lng: parseFloat(lngStr) };
    });
  } catch (e) { return []; }
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
    const snap = await getDocs(collection(db, 'cities'));
    setCities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { fetchCities(); }, []);

 // --- IMPROVED HELPERS ---
 const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    const lines = text.split(/\r?\n/); // Handles both Windows and Mac line endings
    const rows = lines.slice(1); // Skip header
    
    const parsed = rows.map(row => {
      if (!row.trim()) return null;
      const cols = parseCSVLine(row);
      
      // 🔍 Look for the column that contains "POLYGON"
      const wktIndex = cols.findIndex(col => col.toUpperCase().includes("POLYGON"));
      
      if (wktIndex === -1) return null;

      return {
        city: cols[0], // Assumes City is 1st column
        zoneId: cols[1], // Assumes ID is 2nd column
        name: cols[2], // Assumes Name is 3rd column
        wkt: cols[wktIndex]
      };
    }).filter(item => item !== null);

    if (parsed.length === 0) {
      alert("❌ Error: No polygons found. Ensure your CSV has a column containing 'POLYGON((...))'");
    } else {
      setCsvData(parsed);
      toast({ title: "File Loaded", description: `${parsed.length} zones successfully identified.` });
    }
  };
  reader.readAsText(file);
};

const parseWKT = (wkt: string) => {
  try {
    // 📐 Clean WKT: Removes "POLYGON ((" and "))" to extract just the numbers
    const cleanWkt = wkt.replace(/^[^(]*\(\s*\(/i, "").replace(/\s*\)\s*\)[^)]*$/, "");
    const pairs = cleanWkt.split(",");
    
    return pairs.map(pair => {
      const [lng, lat] = pair.trim().split(/\s+/);
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
  } catch (e) { 
    return []; 
  }
};

  const handleFinalSave = async () => {
    if (!cityName || csvData.length === 0) return;
    setIsSaving(true);
    try {
      // 1. Create the City Document
      const cityRef = await addDoc(collection(db, 'cities'), {
        name: cityName,
        thresholds: thresholds,
        createdAt: new Date().toISOString()
      });

      // 2. Batch Upload Zones
      const batch = writeBatch(db);
      csvData.forEach(cols => {
        const [rawCity, zoneId, name, wkt] = cols;
        const positions = parseWKT(wkt);
        if (positions.length > 2) {
          const zoneRef = doc(collection(db, "zones"));
          batch.set(zoneRef, { city: cityName, zoneId, name, positions, type: "Feature" });
        }
      });

      await batch.commit();
      toast({ title: "City Created", description: `${cityName} and ${csvData.length} zones saved.` });
      
      // Reset
      setStep(1); setCityName(''); setCsvData([]); fetchCities();
    } catch (e) {
      toast({ variant: "destructive", title: "Save Failed" });
    } finally { setIsSaving(false); }
  };

  const handleDeleteCity = async (id: string) => {
    if (!confirm("Delete city? (Zones remain in DB, must be cleared manually)")) return;
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
        {/* WIZARD CARD */}
        <Card className="md:col-span-1 border-t-4 border-t-purple-600 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Add New City</CardTitle>
            <CardDescription>Follow the steps to setup a city</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* STEP 1: NAME */}
            <div className={`space-y-2 p-3 rounded-lg border transition-all ${step === 1 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">1</Badge>
                <MapPin className="h-4 w-4" /> Basic Info
              </div>
              {step === 1 && (
                <div className="pt-2 space-y-3">
                  <Input placeholder="City Name (e.g. Erbil)" value={cityName} onChange={e => setCityName(e.target.value)} />
                  <Button size="sm" className="w-full" disabled={!cityName} onClick={() => setStep(2)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              )}
            </div>

            {/* STEP 2: THRESHOLDS */}
            <div className={`space-y-2 p-3 rounded-lg border transition-all ${step === 2 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">2</Badge>
                <Settings2 className="h-4 w-4" /> Distance Rules
              </div>
              {step === 2 && (
                <div className="pt-2 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-green-700">GREEN (KM)</label>
                      <Input type="number" value={thresholds.green} onChange={e => setThresholds({...thresholds, green: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-amber-600">YELLOW (KM)</label>
                      <Input type="number" value={thresholds.yellow} onChange={e => setThresholds({...thresholds, yellow: Number(e.target.value)})} />
                    </div>
                  </div>
                  <Button size="sm" className="w-full" onClick={() => setStep(3)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              )}
            </div>

            {/* STEP 3: DATA */}
            <div className={`space-y-2 p-3 rounded-lg border transition-all ${step === 3 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
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

        {/* LIST CARD */}
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader><CardTitle>Existing Cities</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Rules (G/Y)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={4} className="text-center py-4">Loading...</TableCell></TableRow> : 
                  cities.map((city) => (
                    <TableRow key={city.id}>
                      <TableCell className="font-bold">{city.name}</TableCell>
                      <TableCell>
                        <span className="text-green-600 font-mono">{city.thresholds?.green}km</span> / 
                        <span className="text-amber-600 font-mono ml-1">{city.thresholds?.yellow}km</span>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Active</Badge></TableCell>
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
