'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Save, 
  Loader2, 
  Settings2, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  Trash2, 
  Store,
  ShieldAlert,
  Lock
} from 'lucide-react';

interface SubThreshold {
  name: string;
  green: number;
  yellow: number;
}

export default function CityThresholdsPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  // Data State
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // User/Permission State
  const [user, setUser] = useState<any>(null);
  const [canManage, setCanManage] = useState(false);

  // UI State
  const [expandedCityId, setExpandedCityId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editThresholds, setEditThresholds] = useState({ green: 0, yellow: 0 });

  // New Rule Form State
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleGreen, setNewRuleGreen] = useState<string>('');
  const [newRuleYellow, setNewRuleYellow] = useState<string>('');

  useEffect(() => {
    const checkAuth = () => {
      const stored = localStorage.getItem('geo_user');
      if (stored) {
        const parsedUser = JSON.parse(stored);
        setUser(parsedUser);
        
        // 🛡️ PERMISSION CHECK: manage_thresholds OR admin
        const hasAccess = parsedUser.permissions?.manage_thresholds || parsedUser.role === 'admin';
        setCanManage(hasAccess);
        
        // If they can't even view cities, kick them out
        if (!parsedUser.permissions?.view_cities && !hasAccess && parsedUser.role !== 'manager') {
           router.push('/dashboard');
           return;
        }
      }
      fetchCities();
    };
    checkAuth();
  }, [router]);

  const fetchCities = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'cities'));
      setCities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { 
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Failed to load cities." });
    } finally { 
      setLoading(false); 
    }
  };

  // --- MAIN THRESHOLD HANDLERS ---
  const startEdit = (city: any) => {
    if (!canManage) return;
    setEditingId(city.id);
    setEditThresholds({
      green: city.thresholds?.green || 2,
      yellow: city.thresholds?.yellow || 5
    });
  };

  const saveMainThresholds = async (id: string) => {
    if (!canManage) return;
    try {
      await updateDoc(doc(db, 'cities', id), { thresholds: editThresholds });
      toast({ title: "Updated", description: "Default city thresholds saved." });
      setEditingId(null);
      fetchCities();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Could not update." });
    }
  };

  // --- SUB-THRESHOLD HANDLERS ---
  const toggleSubRules = (cityId: string) => {
    if (expandedCityId === cityId) {
      setExpandedCityId(null);
    } else {
      setExpandedCityId(cityId);
      setNewRuleName('');
      setNewRuleGreen('');
      setNewRuleYellow('');
    }
  };

  const handleAddSubRule = async (city: any) => {
    if (!canManage) return;
    if (!newRuleName || !newRuleGreen || !newRuleYellow) {
      toast({ variant: "destructive", title: "Missing Data", description: "Please fill all fields." });
      return;
    }

    const newRule: SubThreshold = {
      name: newRuleName.trim(),
      green: Number(newRuleGreen),
      yellow: Number(newRuleYellow)
    };

    const existingRules: SubThreshold[] = city.subThresholds || [];
    
    if (existingRules.some(r => r.name.toLowerCase() === newRule.name.toLowerCase())) {
      toast({ variant: "destructive", title: "Duplicate", description: "Rule name already exists." });
      return;
    }

    const updatedRules = [...existingRules, newRule];

    try {
      await updateDoc(doc(db, 'cities', city.id), { subThresholds: updatedRules });
      toast({ title: "Rule Added", description: `Added logic for ${newRule.name}` });
      setNewRuleName(''); setNewRuleGreen(''); setNewRuleYellow('');
      fetchCities();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to add rule." });
    }
  };

  const handleDeleteSubRule = async (city: any, ruleName: string) => {
    if (!canManage) return;
    if (!confirm(`Delete rule "${ruleName}"?`)) return;
    
    const existingRules: SubThreshold[] = city.subThresholds || [];
    const updatedRules = existingRules.filter(r => r.name !== ruleName);

    try {
      await updateDoc(doc(db, 'cities', city.id), { subThresholds: updatedRules });
      toast({ title: "Rule Deleted" });
      fetchCities();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete rule." });
    }
  };

  if (loading) return <div className="h-96 w-full flex items-center justify-center"><Loader2 className="animate-spin text-purple-600" /></div>;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold tracking-tight text-slate-900">Coverage Thresholds</h1>
           <p className="text-sm text-slate-500 mt-1">Define acceptance criteria (km) for coverage analysis.</p>
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
          <CardDescription>Set default rules per city, or create specific rules for store types.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="pl-6 w-[200px]">City Name</TableHead>
                <TableHead>Default Thresholds (Green / Yellow)</TableHead>
                <TableHead>Special Rules</TableHead>
                <TableHead className="text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map(city => (
                // FIX: Key applied to Fragment
                <React.Fragment key={city.id}>
                  
                  {/* MAIN CITY ROW */}
                  <TableRow className={expandedCityId === city.id ? "bg-slate-50 border-b-0" : ""}>
                    <TableCell className="font-bold pl-6 text-slate-700">{city.name}</TableCell>
                    
                    <TableCell>
                      {editingId === city.id && canManage ? (
                        <div className="flex items-center gap-2">
                          <Input type="number" className="w-16 h-8 text-xs bg-green-50 border-green-200 text-green-700 font-bold" value={editThresholds.green} onChange={e => setEditThresholds({...editThresholds, green: Number(e.target.value)})} />
                          <span className="text-slate-300">/</span>
                          <Input type="number" className="w-16 h-8 text-xs bg-yellow-50 border-yellow-200 text-yellow-700 font-bold" value={editThresholds.yellow} onChange={e => setEditThresholds({...editThresholds, yellow: Number(e.target.value)})} />
                          <Button size="icon" className="h-8 w-8 bg-purple-600 hover:bg-purple-700" onClick={() => saveMainThresholds(city.id)}><Save className="h-4 w-4" /></Button>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-3 group ${canManage ? 'cursor-pointer' : 'cursor-default'}`} onClick={() => startEdit(city)}>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded bg-green-100 text-green-700 font-mono text-xs font-bold border border-green-200">&lt; {city.thresholds?.green || 2} km</span>
                            <span className="text-slate-300">/</span>
                            <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 font-mono text-xs font-bold border border-yellow-200">&lt; {city.thresholds?.yellow || 5} km</span>
                          </div>
                          {canManage && <Settings2 className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="font-normal text-slate-500 bg-white">
                        {city.subThresholds?.length || 0} Custom Rules
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right pr-6">
                      <Button variant={expandedCityId === city.id ? "secondary" : "ghost"} size="sm" onClick={() => toggleSubRules(city.id)} className={expandedCityId === city.id ? "bg-purple-100 text-purple-700" : "text-slate-500"}>
                         {expandedCityId === city.id ? "Close Rules" : "Manage Sub-Rules"}
                         {expandedCityId === city.id ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>

                  {/* EXPANDED SUB-RULES PANEL */}
                  {expandedCityId === city.id && (
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableCell colSpan={4} className="p-4 pt-0">
                        <div className="ml-10 p-4 bg-white rounded-lg border border-slate-200 shadow-inner">
                           <div className="flex items-center gap-2 mb-4">
                              <Store className="h-4 w-4 text-purple-500" />
                              <h3 className="text-sm font-bold text-slate-800">Custom Rules for {city.name}</h3>
                           </div>

                           {/* Rules List */}
                           <div className="space-y-2 mb-4">
                              {city.subThresholds && city.subThresholds.length > 0 ? (
                                city.subThresholds.map((rule: SubThreshold, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100">
                                     <div className="flex items-center gap-3">
                                        <Badge className="bg-slate-800 text-white">{rule.name}</Badge>
                                        <span className="text-xs text-slate-500">Target:</span>
                                        <span className="text-xs font-mono font-bold text-green-600">{rule.green} km</span>
                                        <span className="text-xs text-slate-300">|</span>
                                        <span className="text-xs font-mono font-bold text-yellow-600">{rule.yellow} km</span>
                                     </div>
                                     {canManage && (
                                       <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500" onClick={() => handleDeleteSubRule(city, rule.name)}>
                                          <Trash2 className="h-3 w-3" />
                                       </Button>
                                     )}
                                  </div>
                                ))
                              ) : <p className="text-xs text-slate-400 italic pl-1">No custom rules defined yet.</p>}
                           </div>

                           {/* Add New Rule Form (Protected) */}
                           {canManage ? (
                             <div className="flex items-end gap-2 pt-2 border-t border-slate-100">
                                <div className="space-y-1 flex-1">
                                   <label className="text-[10px] font-bold text-slate-400 uppercase">Category Name</label>
                                   <Input placeholder="e.g. Retail..." className="h-8 text-xs" value={newRuleName} onChange={e => setNewRuleName(e.target.value)} />
                                </div>
                                <div className="space-y-1 w-24">
                                   <label className="text-[10px] font-bold text-green-600 uppercase">Green (km)</label>
                                   <Input type="number" className="h-8 text-xs bg-green-50/50" value={newRuleGreen} onChange={e => setNewRuleGreen(e.target.value)} />
                                </div>
                                <div className="space-y-1 w-24">
                                   <label className="text-[10px] font-bold text-yellow-600 uppercase">Yellow (km)</label>
                                   <Input type="number" className="h-8 text-xs bg-yellow-50/50" value={newRuleYellow} onChange={e => setNewRuleYellow(e.target.value)} />
                                </div>
                                <Button size="sm" className="h-8 bg-slate-900 hover:bg-black text-xs font-bold" onClick={() => handleAddSubRule(city)}>
                                   <Plus className="mr-1 h-3 w-3" /> Add Rule
                                </Button>
                             </div>
                           ) : (
                             <div className="pt-2 border-t border-slate-100 text-center text-xs text-slate-400 italic">
                               Editing restricted. Contact administrator to modify rules.
                             </div>
                           )}
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
