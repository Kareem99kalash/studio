'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Settings2, Loader2, Save, X, Users, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { HelpGuide } from '@/components/dashboard/help-guide'; // <--- 1. IMPORTED GUIDE

// --- ROBUST WKT PARSER ---
const parseWKT = (wkt: string) => {
  try {
    if (!wkt) return null;
    const cleanWkt = wkt.trim().toUpperCase();
    const match = cleanWkt.match(/\(\((.*?)\)\)/);
    if (!match) return null;
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
  const router = useRouter();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [cities, setCities] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  
  // Creation State
  const [step, setStep] = useState(1);
  const [cityName, setCityName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(''); 
  const [thresholds, setThresholds] = useState({ green: 2, yellow: 5 });
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit Mode State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [editThresholds, setEditThresholds] = useState({ green: 0, yellow: 0 });

  useEffect(() => { 
    const stored = localStorage.getItem('geo_user');
    if (stored) {
      const parsedUser = JSON.parse(stored);
      setUser(parsedUser);
      
      // 🛡️ 1. CHECK VIEW ACCESS
      const hasViewAccess = parsedUser.permissions?.view_cities || parsedUser.role === 'admin' || parsedUser.role === 'manager';
      if (!hasViewAccess) {
        setLoading(false);
        return; 
      }
    }
    fetchData(); 
  }, []);

  const fetchData = async () => {
    try {
      const snap = await getDocs(collection(db, 'cities'));
      setCities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      const groupSnap = await getDocs(collection(db, 'agent_groups'));
      setGroups(groupSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };

  // 🛡️ 2. CHECK ACTION ACCESS
  const canManage = user?.permissions?.manage_cities || user?.role === 'admin';

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
            const metaPart = line.substring(0, wktStart);
            const wktPart = line.substring(wktStart);
            const cols = metaPart.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            parsedRows.push({ id: cols[1] || `ID_${i}`, name: cols[2] || cols[1] || `Zone ${i}`, wkt: wktPart });
        }
        if (parsedRows.length > 0) setCsvData(parsedRows);
      } catch (err) { toast({ variant: "destructive", title: "Error", description: "Failed to read CSV." }); }
    };
    reader.readAsText(file);
  };

  const handleFinalSave = async () => {
    if (!canManage) return; 
    if (!cityName.trim() || csvData.length === 0) return;
    setIsSaving(true);
    try {
      const features = csvData.map(item => {
        const coordinates = parseWKT(item.wkt);
        if (!coordinates) return null;
        const firstRing = coordinates[0];
        let sumLat = 0, sumLng = 0;
        firstRing.forEach((p: any) => { sumLng += p[0]; sumLat += p[1]; });
        return {
          type: "Feature",
          properties: { id: item.id, name: item.name, centroid: { lat: sumLat / firstRing.length, lng: sumLng / firstRing.length } },
          geometry: { type: "Polygon", coordinates: coordinates }
        };
      }).filter(f => f !== null);

      await addDoc(collection(db, 'cities'), {
        name: cityName.trim(),
        groupId: selectedGroupId || null,
        thresholds: thresholds,
        polygons: JSON.stringify({ type: "FeatureCollection", features }),
        createdAt: new Date().toISOString()
      });

      toast({ title: "Success", description: `City created.` });
      setStep(1); setCityName(''); setCsvData([]); fetchData();
    } catch (e: any) { toast({ variant: "destructive", title: "Save Failed", description: e.message }); } 
    finally { setIsSaving(false); }
  };

  const handleDeleteCity = async (id: string) => {
    if (!canManage) return;
    if (!confirm("Delete city?")) return;
    await deleteDoc(doc(db, 'cities', id));
    fetchData();
  };

  const saveCityChanges = async (id: string) => {
      if (!canManage) return;
      try {
          await updateDoc(doc(db, 'cities', id), { 
              name: editName,
              groupId: editGroupId || null,
              thresholds: editThresholds 
          });
          setEditingId(null);
          fetchData();
      } catch (e) { toast({ variant: "destructive", title: "Error" }); }
  };

  const startEdit = (city: any) => {
      if (!canManage) return;
      setEditingId(city.id);
      setEditName(city.name);
      setEditGroupId(city.groupId || '');
      setEditThresholds({ green: city.thresholds?.green || 2, yellow: city.thresholds?.yellow || 5 });
  };

  const getGroupName = (id: string) => groups.find(g => g.id === id)?.name || "Unassigned";

  // --- RESTRICTED UI ---
  const hasViewAccess = user?.permissions?.view_cities || user?.role === 'admin' || user?.role === 'manager';
  
  if (!loading && !hasViewAccess) {
    return (
      <div className="h-[80vh] w-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <ShieldAlert className="h-12 w-12 text-slate-300 mx-auto" />
          <h2 className="text-lg font-bold text-slate-700">Access Restricted</h2>
          <p className="text-sm text-slate-500">You do not have permission to view city configurations.</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>Return Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">City Management</h1>
        <Badge variant="outline" className="bg-white">{canManage ? 'Full Access' : 'View Only'}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* ADD NEW CITY CARD - ONLY IF CAN MANAGE */}
        {canManage && (
          <Card className="md:col-span-1 border-t-4 border-t-purple-600 shadow-md">
            <CardHeader><CardTitle>Add New City</CardTitle><CardDescription>Configure region and upload CSV.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              
              {/* STEP 1 */}
              <div className={`p-3 rounded-lg border ${step === 1 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>1</Badge> Details</div>
                  {step === 1 && (
                    <>
                      <Input placeholder="City Name" value={cityName} onChange={e => setCityName(e.target.value)} className="mb-2 bg-white" />
                      <select className="w-full p-2 border rounded-md text-sm bg-white mb-2" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                          <option value="">-- No Group (Global) --</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <Button size="sm" className="w-full" disabled={!cityName} onClick={() => setStep(2)}>Next</Button>
                    </>
                  )}
              </div>

              {/* STEP 2 */}
              <div className={`p-3 rounded-lg border ${step === 2 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>2</Badge> Rules</div>
                  {step === 2 && (
                    <>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <Input type="number" placeholder="G" value={thresholds.green} onChange={e => setThresholds({...thresholds, green: Number(e.target.value)})} />
                            <Input type="number" placeholder="Y" value={thresholds.yellow} onChange={e => setThresholds({...thresholds, yellow: Number(e.target.value)})} />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setStep(1)}>Back</Button>
                            <Button size="sm" className="flex-1" onClick={() => setStep(3)}>Next</Button>
                        </div>
                    </>
                  )}
              </div>

              {/* STEP 3 (WITH HELP GUIDE) */}
              <div className={`p-3 rounded-lg border ${step === 3 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center justify-between font-bold text-sm mb-2">
                      <div className="flex items-center gap-2"><Badge>3</Badge> Upload</div>
                      {/* 2. INSERTED GUIDE BUTTON HERE */}
                      {step === 3 && <HelpGuide type="city-upload" />}
                  </div>
                  {step === 3 && (
                    <>
                        <Input type="file" accept=".csv" onChange={handleFileLoad} />
                        <Button className="w-full mt-2 bg-green-600" disabled={csvData.length === 0 || isSaving} onClick={handleFinalSave}>
                            {isSaving ? <Loader2 className="animate-spin" /> : "Save"}
                        </Button>
                    </>
                  )}
              </div>

            </CardContent>
          </Card>
        )}

        {/* ACTIVE CITIES TABLE */}
        <Card className={canManage ? "md:col-span-2" : "md:col-span-3"}>
          <CardHeader><CardTitle>Active Cities</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Group</TableHead><TableHead>Rules</TableHead>{canManage && <TableHead className="text-right">Action</TableHead>}</TableRow></TableHeader>
              <TableBody>
                {cities.map(c => (
                    <TableRow key={c.id}>
                        <TableCell className="font-bold">
                            {editingId === c.id ? <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" /> : c.name}
                        </TableCell>
                        <TableCell>
                            {editingId === c.id ? (
                                <select className="w-full p-1 border rounded h-8 text-sm" value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)}>
                                    <option value="">-- Global --</option>
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            ) : (
                                c.groupId ? <div className="flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit"><Users className="h-3 w-3" /> {getGroupName(c.groupId)}</div> : <span className="text-xs text-slate-400">Global</span>
                            )}
                        </TableCell>
                        <TableCell>
                            {editingId === c.id ? (
                                <div className="flex gap-2"><Input type="number" className="w-12 h-8" value={editThresholds.green} onChange={e => setEditThresholds({...editThresholds, green: Number(e.target.value)})} /><Input type="number" className="w-12 h-8" value={editThresholds.yellow} onChange={e => setEditThresholds({...editThresholds, yellow: Number(e.target.value)})} /></div>
                            ) : (
                                <div className="flex gap-2"><span className="text-green-600 font-bold">{c.thresholds?.green}</span>/<span className="text-yellow-600 font-bold">{c.thresholds?.yellow}</span></div>
                            )}
                        </TableCell>
                        {canManage && (
                            <TableCell className="text-right">
                                {editingId === c.id ? (
                                    <div className="flex justify-end gap-1"><Button size="icon" className="h-8 w-8 bg-green-600" onClick={() => saveCityChanges(c.id)}><Save className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button></div>
                                ) : (
                                    <div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => startEdit(c)}><Settings2 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-red-400" onClick={() => handleDeleteCity(c.id)}><Trash2 className="h-4 w-4" /></Button></div>
                                )}
                            </TableCell>
                        )}
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
