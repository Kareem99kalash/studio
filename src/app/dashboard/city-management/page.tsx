'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Settings2, Loader2, Save, X, Users, ShieldAlert, Layers, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { HelpGuide } from '@/components/dashboard/help-guide'; 

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
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 🟢 NEW: Sub-Zone Management State
  const [detectedZones, setDetectedZones] = useState<string[]>(['Default']);
  const [zoneThresholds, setZoneThresholds] = useState<Record<string, {green: number, yellow: number}>>({
    'Default': { green: 2, yellow: 5 } // Fallback defaults
  });
  
  // Edit Mode State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [editZoneThresholds, setEditZoneThresholds] = useState<Record<string, {green: number, yellow: number}>>({});

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

  // 🟢 UPDATED: CSV Parser with Zone Detection
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

        // Header check to find "Zone_Group" column index if it exists
        const header = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, '').toLowerCase());
        const zoneColIdx = header.findIndex(h => h.includes('zone_group') || h.includes('sub_zone') || h.includes('region'));

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Simple split (note: production CSVs might need stronger regex for quoted commas)
            const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));
            
            // Find WKT
            const wktIndex = cols.findIndex(c => c.toUpperCase().startsWith('POLYGON'));
            if (wktIndex === -1) continue;

            // Extract Zone Group Name (or default)
            let zoneGroup = 'Default';
            if (zoneColIdx !== -1 && cols[zoneColIdx]) {
                zoneGroup = cols[zoneColIdx];
            }
            foundZones.add(zoneGroup);

            parsedRows.push({ 
                id: cols[1] || `ID_${i}`, 
                name: cols[2] || `Poly_${i}`, 
                wkt: cols[wktIndex],
                zoneGroup: zoneGroup // 🟢 Tag row with group
            });
        }

        if (parsedRows.length > 0) {
            setCsvData(parsedRows);
            const zonesArray = Array.from(foundZones);
            setDetectedZones(zonesArray);
            
            // Initialize thresholds for found zones
            const initialThresholds: any = {};
            zonesArray.forEach(z => {
                initialThresholds[z] = { green: 2, yellow: 5 }; // Default init
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
      // 🟢 Group Features by Sub-Zone
      const subZonesData: any[] = [];

      detectedZones.forEach(zoneName => {
          // Filter polygons for this zone
          const zonePolys = csvData.filter(p => p.zoneGroup === zoneName);
          
          const features = zonePolys.map(item => {
            const coordinates = parseWKT(item.wkt);
            if (!coordinates) return null;
            return {
              type: "Feature",
              properties: { id: item.id, name: item.name, zoneGroup: zoneName },
              geometry: { type: "Polygon", coordinates: coordinates }
            };
          }).filter(f => f !== null);

          // Add to subZones array with SPECIFIC thresholds
          subZonesData.push({
              name: zoneName,
              thresholds: zoneThresholds[zoneName], // 🟢 Critical: Save specific thresholds
              polygons: JSON.stringify({ type: "FeatureCollection", features })
          });
      });

      await addDoc(collection(db, 'cities'), {
        name: cityName.trim(),
        groupId: selectedGroupId || null,
        isMultiZone: detectedZones.length > 1, // Flag for easier querying
        subZones: subZonesData, // 🟢 Save Array structure
        createdAt: new Date().toISOString()
      });

      toast({ title: "Success", description: `City created with ${subZonesData.length} sub-zones.` });
      setStep(1); setCityName(''); setCsvData([]); fetchData();
    } catch (e: any) { 
        console.error(e);
        toast({ variant: "destructive", title: "Save Failed", description: e.message }); 
    } 
    finally { setIsSaving(false); }
  };

  const handleDeleteCity = async (id: string) => {
    if (!canManage) return;
    if (!confirm("Delete city?")) return;
    await deleteDoc(doc(db, 'cities', id));
    fetchData();
  };

  // 🟢 UPDATED: Save Changes (Handles Sub-Zones)
  const saveCityChanges = async (id: string) => {
      if (!canManage) return;
      try {
          // We need to update the existing subZones array with new thresholds
          const cityRef = cities.find(c => c.id === id);
          if (!cityRef) return;

          const updatedSubZones = cityRef.subZones.map((z: any) => ({
              ...z,
              thresholds: editZoneThresholds[z.name] || z.thresholds
          }));

          await updateDoc(doc(db, 'cities', id), { 
              name: editName,
              groupId: editGroupId || null,
              subZones: updatedSubZones
          });
          
          setEditingId(null);
          fetchData();
          toast({ title: "Updated", description: "City thresholds saved." });
      } catch (e) { toast({ variant: "destructive", title: "Error" }); }
  };

  const startEdit = (city: any) => {
      if (!canManage) return;
      setEditingId(city.id);
      setEditName(city.name);
      setEditGroupId(city.groupId || '');
      
      // Load current thresholds into edit state
      const currentThresholds: any = {};
      if (city.subZones) {
          city.subZones.forEach((z: any) => {
              currentThresholds[z.name] = z.thresholds;
          });
      } else {
          // Backward compatibility for old single-zone cities
          currentThresholds['Default'] = city.thresholds || { green: 2, yellow: 5 };
      }
      setEditZoneThresholds(currentThresholds);
  };

  const getGroupName = (id: string) => groups.find(g => g.id === id)?.name || "Unassigned";

  // --- RESTRICTED UI ---
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
        {/* ADD NEW CITY CARD */}
        {canManage && (
          <Card className="md:col-span-1 border-t-4 border-t-purple-600 shadow-md">
            <CardHeader><CardTitle>Add New City</CardTitle><CardDescription>Configure zones and thresholds.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              
              {/* STEP 1: BASIC INFO */}
              <div className={`p-3 rounded-lg border ${step === 1 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>1</Badge> Identity</div>
                  {step === 1 && (
                    <>
                      <Input placeholder="City Name (e.g. Mosul)" value={cityName} onChange={e => setCityName(e.target.value)} className="mb-2 bg-white" />
                      <select className="w-full p-2 border rounded-md text-sm bg-white mb-2" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                          <option value="">-- No Agent Group --</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <Button size="sm" className="w-full" disabled={!cityName} onClick={() => setStep(2)}>Next</Button>
                    </>
                  )}
              </div>

              {/* STEP 2: UPLOAD & DETECT */}
              <div className={`p-3 rounded-lg border ${step === 2 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center justify-between font-bold text-sm mb-2">
                      <div className="flex items-center gap-2"><Badge>2</Badge> Upload Polygons</div>
                      {step === 2 && <HelpGuide type="city-upload" />}
                  </div>
                  {step === 2 && (
                    <>
                        <div className="text-xs text-slate-500 mb-2">
                            To create sub-zones (e.g. Left/Right Coast), include a column named <strong>Zone_Group</strong> in your CSV.
                        </div>
                        <Input type="file" accept=".csv" onChange={handleFileLoad} className="mb-2 bg-white" />
                        <Button size="sm" className="w-full" disabled={csvData.length === 0} onClick={() => setStep(3)}>Next</Button>
                    </>
                  )}
              </div>

              {/* STEP 3: CONFIGURE THRESHOLDS */}
              <div className={`p-3 rounded-lg border ${step === 3 ? 'bg-purple-50 border-purple-200' : 'bg-white opacity-50'}`}>
                  <div className="flex items-center gap-2 font-bold text-sm mb-2"><Badge>3</Badge> Thresholds</div>
                  {step === 3 && (
                    <>
                        <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
                            {detectedZones.map(zone => (
                                <div key={zone} className="bg-white p-2 rounded border shadow-sm">
                                    <div className="text-xs font-bold uppercase text-slate-500 mb-1">{zone} Thresholds (km)</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-green-600 font-bold">Green (Good)</label>
                                            <Input type="number" className="h-7 text-xs" 
                                                value={zoneThresholds[zone]?.green} 
                                                onChange={e => setZoneThresholds(prev => ({...prev, [zone]: {...prev[zone], green: Number(e.target.value)}}))} 
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-yellow-600 font-bold">Yellow (Limit)</label>
                                            <Input type="number" className="h-7 text-xs" 
                                                value={zoneThresholds[zone]?.yellow} 
                                                onChange={e => setZoneThresholds(prev => ({...prev, [zone]: {...prev[zone], yellow: Number(e.target.value)}}))} 
                                            />
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
                      <TableHead>Group</TableHead>
                      <TableHead>Sub-Zones</TableHead>
                      <TableHead>Thresholds</TableHead>
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
                            {editingId === c.id ? (
                                <select className="w-full p-1 border rounded h-8 text-sm" value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)}>
                                    <option value="">-- Global --</option>
                                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            ) : (
                                c.groupId ? <Badge variant="secondary" className="text-[10px]"><Users className="h-3 w-3 mr-1" /> {getGroupName(c.groupId)}</Badge> : <span className="text-xs text-slate-400">Global</span>
                            )}
                        </TableCell>
                        <TableCell>
                            {/* Sub-Zone Badges */}
                            {c.subZones ? (
                                <div className="flex flex-wrap gap-1">
                                    {c.subZones.map((z:any) => <Badge key={z.name} variant="outline" className="text-[10px] bg-slate-50">{z.name}</Badge>)}
                                </div>
                            ) : (
                                <Badge variant="outline" className="text-[10px]">Default</Badge>
                            )}
                        </TableCell>
                        <TableCell>
                            {editingId === c.id ? (
                                <div className="space-y-2">
                                    {(c.subZones || [{name:'Default'}]).map((z: any) => (
                                        <div key={z.name} className="flex items-center gap-2 text-xs">
                                            <span className="w-16 truncate font-bold text-slate-500">{z.name}:</span>
                                            <Input type="number" className="w-12 h-6 text-xs p-1" 
                                                value={editZoneThresholds[z.name]?.green} 
                                                onChange={e => setEditZoneThresholds(p => ({...p, [z.name]: {...p[z.name], green: Number(e.target.value)}}))} 
                                            />
                                            <Input type="number" className="w-12 h-6 text-xs p-1" 
                                                value={editZoneThresholds[z.name]?.yellow} 
                                                onChange={e => setEditZoneThresholds(p => ({...p, [z.name]: {...p[z.name], yellow: Number(e.target.value)}}))} 
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {(c.subZones || [{name:'Default', thresholds: c.thresholds}]).map((z:any) => (
                                        <div key={z.name} className="flex gap-2 text-[10px]">
                                            <span className="text-slate-400 w-16 truncate">{z.name}:</span>
                                            <span className="text-green-600 font-bold">{z.thresholds?.green}km</span>
                                            <span className="text-yellow-600 font-bold">{z.thresholds?.yellow}km</span>
                                        </div>
                                    ))}
                                </div>
                            )}
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
