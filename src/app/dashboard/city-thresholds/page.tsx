'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Save, Loader2, ChevronDown, ChevronUp, Plus, Trash2, Store, 
  Lock, Layers, Split 
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useSession } from '@/hooks/use-session'; // 🟢 Import Hook

interface Threshold {
  green: number;
  yellow: number;
}

interface DualThreshold {
  internal: Threshold;
  external: Threshold;
  border?: Threshold; 
  borderProximity?: number; 
}

export default function CityThresholdsPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // 1. Auth & Session Management
  const { user, loading: sessionLoading } = useSession(true);

  // 2. Data Loading State
  const [cities, setCities] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  
  // UI State
  const [expandedCityId, setExpandedCityId] = useState<string | null>(null);
  
  // Edit State
  const [editZoneRules, setEditZoneRules] = useState<Record<string, DualThreshold>>({});
  
  // Store Category Rules State
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleInternal, setNewRuleInternal] = useState<Threshold>({ green: 2, yellow: 5 });
  const [newRuleExternal, setNewRuleExternal] = useState<Threshold>({ green: 1, yellow: 3 });

  // 3. Permission Logic (Derived)
  const canManage = user?.role === 'admin' || user?.role === 'super_admin' || user?.permissions?.manage_thresholds;

  // 4. Fetch Data
  const fetchCities = async () => {
    try {
      const snap = await getDocs(collection(db, 'cities'));
      setCities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { 
      console.error(e);
      toast({ variant: "destructive", title: "Connection Error", description: "Failed to load cities." });
    } finally { 
      setDataLoading(false); 
    }
  };

  useEffect(() => {
    if (user) fetchCities();
  }, [user]);

  // Loading State
  if (sessionLoading || dataLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // --- HANDLERS ---

  const toggleCity = (city: any) => {
    if (expandedCityId === city.id) {
      setExpandedCityId(null);
      setEditZoneRules({});
    } else {
      setExpandedCityId(city.id);
      const initialRules: Record<string, DualThreshold> = {};
      if (city.subZones) {
          city.subZones.forEach((z: any) => {
              const existing = z.thresholds || {};
              // Ensure full structure exists even for old data
              initialRules[z.name] = {
                  internal: existing.internal || { green: 2, yellow: 5 },
                  external: existing.external || { green: 2, yellow: 5 },
                  border: existing.border || { green: 1, yellow: 2 }, 
                  borderProximity: existing.borderProximity || 1.0 
              };
          });
      }
      setEditZoneRules(initialRules);
    }
  };

  const saveZoneThresholds = async (cityId: string) => {
    if (!canManage) return;
    try {
        const city = cities.find(c => c.id === cityId);
        if (!city || !city.subZones) return;

        const updatedSubZones = city.subZones.map((z: any) => ({
            ...z,
            thresholds: editZoneRules[z.name] || z.thresholds
        }));

        await updateDoc(doc(db, 'cities', cityId), { subZones: updatedSubZones });
        toast({ title: "Updated", description: "Zone thresholds saved." });
        fetchCities();
    } catch (e) { toast({ variant: "destructive", title: "Error" }); }
  };

  const handleAddCategoryRule = async (city: any) => {
    if (!canManage) return;
    if (!newRuleName) return toast({ variant: "destructive", title: "Missing Name" });

    const newRule = {
      name: newRuleName.trim(),
      internal: newRuleInternal,
      external: newRuleExternal
    };

    const existingRules = city.subThresholds || []; 
    const updatedRules = [...existingRules, newRule];

    try {
      await updateDoc(doc(db, 'cities', city.id), { subThresholds: updatedRules });
      toast({ title: "Category Added" });
      setNewRuleName(''); 
      fetchCities();
    } catch (e) { toast({ variant: "destructive", title: "Error" }); }
  };

  const handleDeleteCategoryRule = async (city: any, ruleName: string) => {
    if (!canManage) return;
    if (!confirm("Delete this rule?")) return;
    const updated = (city.subThresholds || []).filter((r: any) => r.name !== ruleName);
    await updateDoc(doc(db, 'cities', city.id), { subThresholds: updated });
    fetchCities();
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Coverage Thresholds</h1>
            <p className="text-sm text-slate-500 mt-1">Manage Internal, External, and Border-Specific limits.</p>
        </div>
        {!canManage && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 pr-3">
             <Lock className="h-3 w-3" /> Read Only Mode
          </Badge>
        )}
      </div>

      <Card className="border-t-4 border-t-purple-600 shadow-sm">
        <CardHeader>
          <CardTitle>City Configuration</CardTitle>
          <CardDescription>Adjust limits for specific sub-zones.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="pl-6 w-[200px]">City Name</TableHead>
                <TableHead>Active Zones</TableHead>
                <TableHead className="text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map(city => (
                <React.Fragment key={city.id}>
                  <TableRow className={expandedCityId === city.id ? "bg-slate-50 border-b-0" : ""}>
                    <TableCell className="font-bold pl-6 text-slate-700">{city.name}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                          {city.subZones?.map((z: any) => (
                              <Badge key={z.name} variant="outline" className="bg-white border-slate-300 text-slate-600">{z.name}</Badge>
                          )) || <Badge variant="outline">Default</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button variant={expandedCityId === city.id ? "secondary" : "ghost"} size="sm" onClick={() => toggleCity(city)} className={expandedCityId === city.id ? "bg-purple-100 text-purple-700" : "text-slate-500"}>
                          {expandedCityId === city.id ? "Close" : "Manage Rules"}
                          {expandedCityId === city.id ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>

                  {expandedCityId === city.id && (
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableCell colSpan={3} className="p-4 pt-0">
                        <div className="ml-6 p-6 bg-white rounded-lg border border-slate-200 shadow-inner space-y-6">
                           
                           <div className="flex items-center justify-between mb-4">
                               <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                   <Layers className="h-4 w-4 text-purple-500" /> Geographic Zone Limits
                               </h3>
                               {canManage && (
                                   <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8" onClick={() => saveZoneThresholds(city.id)}>
                                        <Save className="h-3 w-3 mr-2" /> Save Changes
                                   </Button>
                               )}
                           </div>

                           <div className="grid grid-cols-1 gap-6">
                               {(city.subZones || []).map((z: any) => {
                                   const rules = editZoneRules[z.name] || { 
                                        internal: {green:2, yellow:5}, 
                                        external: {green:2, yellow:5},
                                        border: {green:1, yellow:2},
                                        borderProximity: 1.0 
                                   };
                                   
                                   return (
                                        <div key={z.name} className="border rounded-lg p-4 bg-slate-50 space-y-4">
                                             <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                                                  <div className="font-black text-sm text-slate-800 uppercase">{z.name}</div>
                                                  <Badge className="text-[10px] bg-slate-200 text-slate-600 hover:bg-slate-200">Zone Configuration</Badge>
                                             </div>
                                             
                                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                  {/* 1. INTERNAL */}
                                                  <div className="space-y-2">
                                                       <div className="flex justify-between text-[10px] text-emerald-700 font-bold uppercase">
                                                            <span>Inside {z.name}</span>
                                                            <Badge variant="outline" className="text-[9px] bg-emerald-50 border-emerald-200 text-emerald-600">Standard</Badge>
                                                       </div>
                                                       <div className="flex gap-2">
                                                            <div className="relative w-full">
                                                                 <span className="absolute left-2 top-1.5 text-[9px] text-slate-400 font-bold">G</span>
                                                                 <Input type="number" className="h-8 text-xs pl-5 bg-white border-emerald-200" value={rules.internal?.green} onChange={e => setEditZoneRules(p => ({...p, [z.name]: {...p[z.name], internal: {...p[z.name].internal, green: Number(e.target.value)}} }))} disabled={!canManage} />
                                                            </div>
                                                            <div className="relative w-full">
                                                                 <span className="absolute left-2 top-1.5 text-[9px] text-slate-400 font-bold">Y</span>
                                                                 <Input type="number" className="h-8 text-xs pl-5 bg-white border-emerald-200" value={rules.internal?.yellow} onChange={e => setEditZoneRules(p => ({...p, [z.name]: {...p[z.name], internal: {...p[z.name].internal, yellow: Number(e.target.value)}} }))} disabled={!canManage} />
                                                            </div>
                                                       </div>
                                                  </div>

                                                  {/* 2. EXTERNAL (STANDARD) */}
                                                  <div className="space-y-2">
                                                       <div className="flex justify-between text-[10px] text-amber-700 font-bold uppercase">
                                                            <span>Cross-Zone (Far)</span>
                                                            <Badge variant="outline" className="text-[9px] bg-amber-50 border-amber-200 text-amber-600">Restricted</Badge>
                                                       </div>
                                                       <div className="flex gap-2">
                                                            <div className="relative w-full">
                                                                 <span className="absolute left-2 top-1.5 text-[9px] text-slate-400 font-bold">G</span>
                                                                 <Input type="number" className="h-8 text-xs pl-5 bg-white border-amber-200" value={rules.external?.green} onChange={e => setEditZoneRules(p => ({...p, [z.name]: {...p[z.name], external: {...p[z.name].external, green: Number(e.target.value)}} }))} disabled={!canManage} />
                                                            </div>
                                                            <div className="relative w-full">
                                                                 <span className="absolute left-2 top-1.5 text-[9px] text-slate-400 font-bold">Y</span>
                                                                 <Input type="number" className="h-8 text-xs pl-5 bg-white border-amber-200" value={rules.external?.yellow} onChange={e => setEditZoneRules(p => ({...p, [z.name]: {...p[z.name], external: {...p[z.name].external, yellow: Number(e.target.value)}} }))} disabled={!canManage} />
                                                            </div>
                                                       </div>
                                                  </div>

                                                  {/* 3. EXTERNAL (BORDER PROXIMITY) */}
                                                  <div className="space-y-2 bg-rose-50 p-2 rounded border border-rose-100">
                                                       <div className="flex justify-between text-[10px] text-rose-700 font-bold uppercase items-center">
                                                            <span className="flex items-center gap-1"><Split className="h-3 w-3"/> Cross-Zone (Near Border)</span>
                                                       </div>
                                                       
                                                       <div className="space-y-1 mb-2">
                                                            <div className="flex justify-between text-[9px] text-rose-500">
                                                                <span>Trigger Distance:</span>
                                                                <span className="font-bold">{rules.borderProximity} km</span>
                                                            </div>
                                                            <Slider 
                                                                defaultValue={[rules.borderProximity || 1]} 
                                                                max={5} step={0.1} 
                                                                onValueChange={(val) => setEditZoneRules(p => ({...p, [z.name]: {...p[z.name], borderProximity: val[0]}}))}
                                                                disabled={!canManage}
                                                                className="py-1"
                                                            />
                                                       </div>

                                                       <div className="flex gap-2">
                                                            <div className="relative w-full">
                                                                 <span className="absolute left-2 top-1.5 text-[9px] text-slate-400 font-bold">G</span>
                                                                 <Input type="number" className="h-8 text-xs pl-5 bg-white border-rose-200 text-rose-700 font-bold" value={rules.border?.green} onChange={e => setEditZoneRules(p => ({...p, [z.name]: {...p[z.name], border: {...p[z.name].border, green: Number(e.target.value)}} }))} disabled={!canManage} />
                                                            </div>
                                                            <div className="relative w-full">
                                                                 <span className="absolute left-2 top-1.5 text-[9px] text-slate-400 font-bold">Y</span>
                                                                 <Input type="number" className="h-8 text-xs pl-5 bg-white border-rose-200 text-rose-700 font-bold" value={rules.border?.yellow} onChange={e => setEditZoneRules(p => ({...p, [z.name]: {...p[z.name], border: {...p[z.name].border, yellow: Number(e.target.value)}} }))} disabled={!canManage} />
                                                            </div>
                                                       </div>
                                                  </div>
                                             </div>
                                        </div>
                                   );
                               })}
                           </div>

                           <div className="h-px bg-slate-100 my-4"></div>

                           {/* STORE CATEGORY OVERRIDES */}
                           <div>
                               <div className="flex items-center gap-2 mb-3">
                                   <Store className="h-4 w-4 text-indigo-500" />
                                   <h3 className="text-sm font-bold text-slate-800">Store Category Overrides (Optional)</h3>
                               </div>
                               
                               <div className="space-y-2">
                                   {(city.subThresholds || []).map((cat: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-2 bg-slate-50 border rounded text-xs">
                                             <div className="flex items-center gap-3">
                                                  <Badge className="bg-indigo-600">{cat.name}</Badge>
                                                  <div className="flex gap-4 text-slate-500">
                                                       <span>Internal: <b className="text-slate-800">{cat.internal?.green}/{cat.internal?.yellow}</b></span>
                                                       <span>External: <b className="text-slate-800">{cat.external?.green}/{cat.external?.yellow}</b></span>
                                                  </div>
                                             </div>
                                             {canManage && <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400" onClick={() => handleDeleteCategoryRule(city, cat.name)}><Trash2 className="h-3 w-3"/></Button>}
                                        </div>
                                   ))}
                                   
                                   {canManage && (
                                        <div className="flex items-end gap-2 mt-2 bg-slate-50 p-2 rounded border border-dashed border-slate-300">
                                             <div className="flex-1">
                                                 <span className="text-[9px] font-bold uppercase text-slate-400">Category Name</span>
                                                 <Input className="h-7 text-xs bg-white" placeholder="e.g. Retail" value={newRuleName} onChange={e=>setNewRuleName(e.target.value)} />
                                             </div>
                                             <div className="w-20">
                                                 <span className="text-[9px] font-bold uppercase text-green-600">In (G)</span>
                                                 <Input type="number" className="h-7 text-xs bg-white" value={newRuleInternal.green} onChange={e=>setNewRuleInternal({...newRuleInternal, green: Number(e.target.value)})} />
                                             </div>
                                             <div className="w-20">
                                                 <span className="text-[9px] font-bold uppercase text-yellow-600">In (Y)</span>
                                                 <Input type="number" className="h-7 text-xs bg-white" value={newRuleInternal.yellow} onChange={e=>setNewRuleInternal({...newRuleInternal, yellow: Number(e.target.value)})} />
                                             </div>
                                             <Button size="sm" className="h-7 bg-indigo-600 hover:bg-indigo-700" onClick={() => handleAddCategoryRule(city)}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                                        </div>
                                   )}
                               </div>
                           </div>

                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
