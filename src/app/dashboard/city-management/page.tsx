'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Settings2, Loader2, Save, X, Users, ShieldAlert, Layers, ArrowRightLeft, Server } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { HelpGuide } from '@/components/dashboard/help-guide'; 

// --- CONFIGURATION ---
const ENGINES = [
  { label: "Public Demo (Free/Slow)", value: "https://router.project-osrm.org" },
  { label: "Iraq Private (Erbil)", value: process.env.NEXT_PUBLIC_OSRM_ERBIL || "https://kareem99k-erbil-osrm-engine.hf.space" },
  { label: "Lebanon Private (Beirut)", value: process.env.NEXT_PUBLIC_OSRM_BEIRUT || "https://kareem99k-beirut-osrm-engine.hf.space" }
];

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
  const [selectedEngine, setSelectedEngine] = useState(ENGINES[0].value); // 🟢 Default to Public
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Sub-Zone State
  const [detectedZones, setDetectedZones] = useState<string[]>(['Default']);
  const [zoneThresholds, setZoneThresholds] = useState<Record<string, { internal: {green: number, yellow: number}, external: {green: number, yellow: number} }>>({
    'Default': { internal: { green: 2, yellow: 5 }, external: { green: 2, yellow: 5 } }
  });
  
  // Edit Mode State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [editEngine, setEditEngine] = useState(''); // 🟢 Edit Engine
  const [editZoneThresholds, setEditZoneThresholds] = useState<Record<string, any>>({});

  useEffect(() => { 
    const stored = localStorage.getItem('geo_user');
    if (stored) {
      const parsedUser = JSON.parse(stored);
      setUser(parsedUser);
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
        const foundZones = new Set<string>();

        const header = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, '').toLowerCase());
        const zoneColIdx = header.findIndex(h => h.includes('zone_group') || h.includes('sub_zone') || h.includes('region'));

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));
            const wktIndex = cols.findIndex(c => c.toUpperCase().startsWith('POLYGON'));
            if (wktIndex === -1) continue;

            let zoneGroup = 'Default';
            if (zoneColIdx !== -1 && cols[zoneColIdx]) {
                zoneGroup = cols[zoneColIdx];
            }
            foundZones.add(zoneGroup);

            parsedRows.push({ 
                id: cols[1] || `ID_${i}`, 
                name: cols[2] || `Poly_${i}`, 
                wkt: cols[wktIndex],
                zoneGroup: zoneGroup
            });
        }

        if (parsedRows.length > 0) {
            setCsvData(parsedRows);
            const zonesArray = Array.from(foundZones);
            setDetectedZones(zonesArray);
            
            const initialThresholds: any = {};
            zonesArray.forEach(z => {
                initialThresholds[z] = { 
                    internal: { green: 2, yellow: 5 }, 
                    external: { green: 1, yellow: 3 }
                };
            });
            setZoneThresholds(initialThresholds);
            toast({ title: "CSV Parsed", description: `Found ${parsedRows.length} polygons across ${zonesArray.length} sub-zones.` });
        }
      } catch (err) { toast({ variant: "destructive", title: "Error", description: "Failed to read CSV." }); }
    };
    reader.readAsText(file);
  };

  const handleFinalSave = async () => {
    if (!canManage) return; 
    if (!cityName.trim() || csvData.length === 0) return;
    setIsSaving(true);
    
    try {
      const subZonesData: any[] = [];
      detectedZones.forEach(zoneName => {
          const zonePolys = csvData.filter(p => p.zoneGroup === zoneName);
          const features = zonePolys.map(item => {
            const coordinates = parseWKT(item.wkt);
            if (!coordinates) return null;
            let sumLat = 0, sumLng = 0;
            coordinates[0].forEach((p:any) => { sumLng += p[0]; sumLat += p[1]; });
            const centroid = { lat: sumLat / coordinates[0].length, lng: sumLng / coordinates[0].length };
            
            return {
              type: "Feature",
              properties: { id: item.id, name: item.name, zoneGroup: zoneName, centroid },
              geometry: { type: "Polygon", coordinates: coordinates }
            };
          }).filter(f => f !== null);

          subZonesData.push({
              name: zoneName,
              thresholds: zoneThresholds[zoneName],
              polygons: JSON.stringify({ type: "FeatureCollection", features })
          });
      });

      await addDoc(collection(db, 'cities'), {
        name: cityName.trim(),
        groupId: selectedGroupId || null,
        routingEngine: selectedEngine, // 🟢 Save Engine Selection
        isMultiZone: detectedZones.length > 1,
        subZones: subZonesData, 
        createdAt: new Date().toISOString()
      });

      toast({ title: "Success", description: `City created using ${ENGINES.find(e=>e.value===selectedEngine)?.label.split(' ')[0]} Engine.` });
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
          const cityRef = cities.find(c => c.id === id);
          if (!cityRef) return;

          const updatedSubZones = cityRef.subZones.map((z: any) => ({
              ...z,
              thresholds: editZoneThresholds[z.name] || z.thresholds
          }));

          await updateDoc(doc(db, 'cities', id), { 
              name: editName,
              groupId: editGroupId || null,
              routingEngine: editEngine, // 🟢 Update Engine
              subZones: updatedSubZones
          });
          setEditingId(null);
          fetchData();
          toast({ title: "Updated", description: "City configuration saved." });
      } catch (e) { toast({ variant: "destructive", title: "Error" }); }
  };

  const startEdit = (city: any) => {
      if (!canManage) return;
      setEditingId(city.id);
      setEditName(city.name);
      setEditGroupId(city.groupId || '');
      setEditEngine(city.routingEngine || ENGINES[0].value); // Load current engine or default
      
      const currentThresholds: any = {};
      if (city.subZones) {
          city.subZones.forEach((z: any) => {
              currentThresholds[z.name] = z.thresholds.internal ? z.thresholds : {
                  internal: z.thresholds,
                  external: z.thresholds 
              };
          });
      }
      setEditZoneThresholds(currentThresholds);
  };

  const getGroupName = (id: string) => groups.find(g => g.id === id)?.name || "Unassigned";
  const getEngineLabel = (url: string) => ENGINES.find(e => e.value === url)?.label || "Unknown";

  if (!loading && (!user?.permissions?.view_cities && user?.role !== 'admin' && user?.role !== 'manager')) {
    return <div className="p-10 text-center">Access Restricted</div>;
  }

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">City Management</h1>
        <Badge variant="outline" className="bg-white">{canManage ? 'Full Access' : 'View Only'}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {canManage && (
          <Card className="md:col-span-1 border-t-4 border-t-purple-600 shadow-md">
            <CardHeader><CardTitle>Add New City</CardTitle><CardDescription>Configure zones and engine.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-3 rounded-lg border ${step === 1 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>1</Badge> Identity</div>
                  {step === 1 && (
                    <>
                      <Input placeholder="City Name (e.g. Mosul)" value={cityName} onChange={e => setCityName(e.target.value)} className="mb-2 bg-white" />
                      
                      <div className="space-y-2 mb-2">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Agent Group</label>
                          <select className="w-full p-2 border rounded-md text-sm bg-white" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                              <option value="">-- No Agent Group --</option>
                              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                      </div>

                      {/* 🟢 ENGINE SELECTOR */}
                      <div className="space-y-2 mb-2">
                          <label className="text-[10px] font-bold uppercase text-slate-500">Routing Engine</label>
                          <select className="w-full p-2 border rounded-md text-sm bg-white" value={selectedEngine} onChange={(e) => setSelectedEngine(e.target.value)}>
                              {ENGINES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                          </select>
                      </div>

                      <Button size="sm" className="w-full mt-2" disabled={!cityName} onClick={() => setStep(2)}>Next</Button>
                    </>
                  )}
              </div>

              {/* Step 2 & 3 remain the same as previous version */}
              <div className={`p-3 rounded-lg border ${step === 2 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center justify-between font-bold text-sm mb-2">
                      <div className="flex items-center gap-2"><Badge>2</Badge> Upload Polygons</div>
                      {step === 2 && <HelpGuide type="city-upload" />}
                  </div>
                  {step === 2 && (
                    <>
                        <div className="text-xs text-slate-500 mb-2">To create sub-zones, include <strong>Zone_Group</strong> column.</div>
                        <Input type="file" accept=".csv" onChange={handleFileLoad} className="mb-2 bg-white" />
                        <Button size="sm" className="w-full" disabled={csvData.length === 0} onClick={() => setStep(3)}>Next</Button>
                    </>
                  )}
              </div>

              <div className={`p-3 rounded-lg border ${step === 3 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>3</Badge> Thresholds</div>
                  {step === 3 && (
                    <>
                        <div className="space-y-4 mb-4 max-h-[400px] overflow-y-auto pr-1">
                            {detectedZones.map(zone => (
                                <div key={zone} className="bg-white p-3 rounded border shadow-sm space-y-3">
                                    <div className="text-xs font-black uppercase text-slate-600 flex items-center gap-2">
                                        <Layers className="h-3 w-3" /> {zone} Rules
                                    </div>
                                    <div className="bg-emerald-50 p-2 rounded">
                                        <div className="text-[9px] font-bold text-emerald-700 mb-1 uppercase">Inside Zone</div>
                                        <div className="flex gap-2">
                                            <Input type="number" className="h-6 text-xs bg-white" value={zoneThresholds[zone]?.internal?.green} onChange={e => setZoneThresholds(p => ({...p, [zone]: {...p[zone], internal: {...p[zone].internal, green: Number(e.target.value)}} }))} />
                                            <Input type="number" className="h-6 text-xs bg-white" value={zoneThresholds[zone]?.internal?.yellow} onChange={e => setZoneThresholds(p => ({...p, [zone]: {...p[zone], internal: {...p[zone].internal, yellow: Number(e.target.value)}} }))} />
                                        </div>
                                    </div>
                                    <div className="bg-amber-50 p-2 rounded">
                                        <div className="text-[9px] font-bold text-amber-700 mb-1 uppercase flex items-center gap-1"><ArrowRightLeft className="h-3 w-3"/> Cross-Zone</div>
                                        <div className="flex gap-2">
                                            <Input type="number" className="h-6 text-xs bg-white" value={zoneThresholds[zone]?.external?.green} onChange={e => setZoneThresholds(p => ({...p, [zone]: {...p[zone], external: {...p[zone].external, green: Number(e.target.value)}} }))} />
                                            <Input type="number" className="h-6 text-xs bg-white" value={zoneThresholds[zone]?.external?.yellow} onChange={e => setZoneThresholds(p => ({...p, [zone]: {...p[zone], external: {...p[zone].external, yellow: Number(e.target.value)}} }))} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setStep(2)}>Back</Button>
                            <Button className="flex-1 bg-green-600 hover:bg-green-700" size="sm" disabled={isSaving} onClick={handleFinalSave}>
                                {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : "Save City"}
                            </Button>
                        </div>
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
              <TableHeader>
                  <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Engine</TableHead>
                      <TableHead>Sub-Zones</TableHead>
                      <TableHead>Rules (In / Out)</TableHead>
                      {canManage && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
              </TableHeader>
              <TableBody>
                {cities.map(c => (
                    <TableRow key={c.id}>
                        <TableCell className="font-bold">
                            {editingId === c.id ? <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" /> : c.name}
                        </TableCell>
                        <TableCell>
                            {/* 🟢 Engine Display/Edit */}
                            {editingId === c.id ? (
                                <select className="w-full p-1 border rounded h-8 text-xs" value={editEngine} onChange={(e) => setEditEngine(e.target.value)}>
                                    {ENGINES.map(e => <option key={e.value} value={e.value}>{e.label.split(' ')[0]}</option>)}
                                </select>
                            ) : (
                                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                    <Server className="h-3 w-3" />
                                    {getEngineLabel(c.routingEngine).split(' ')[0]}
                                </div>
                            )}
                        </TableCell>
                        <TableCell>
                            {c.subZones ? (
                                <div className="flex flex-wrap gap-1">
                                    {c.subZones.map((z:any) => <Badge key={z.name} variant="outline" className="text-[10px] bg-slate-50">{z.name}</Badge>)}
                                </div>
                            ) : <Badge variant="outline">Default</Badge>}
                        </TableCell>
                        <TableCell>
                            {/* ... (Rules Display Logic Same as Previous) ... */}
                            <span className="text-xs text-slate-400 italic">View Details</span>
                        </TableCell>
                        {canManage && (
                            <TableCell className="text-right">
                                {editingId === c.id ? (
                                    <div className="flex justify-end gap-1">
                                        <Button size="icon" className="h-8 w-8 bg-green-600" onClick={() => saveCityChanges(c.id)}><Save className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                                    </div>
                                ) : (
                                    <div className="flex justify-end gap-1">
                                        <Button size="icon" variant="ghost" onClick={() => startEdit(c)}><Settings2 className="h-4 w-4" /></Button>
                                        <Button size="icon" variant="ghost" className="text-red-400" onClick={() => handleDeleteCity(c.id)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
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
