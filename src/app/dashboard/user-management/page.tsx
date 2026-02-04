'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, UserPlus, Key, ShieldCheck, MapPinned, ChevronRight, Loader2, Check, X, UserCog, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from "@/components/ui/checkbox";

export default function UserManagementPage() {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(''); // Search State
  
  // Wizard State
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    password: '',
    role: 'Agent',
    allowedCities: [] as string[]
  });
  
  // Edit Password State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('geo_user');
    if (stored) setCurrentUser(JSON.parse(stored));
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const userSnap = await getDocs(collection(db, 'users'));
      const citySnap = await getDocs(collection(db, 'cities'));
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCities(citySnap.docs.map(d => ({ id: d.id, name: d.data().name })));
    } catch (e) {
      toast({ variant: "destructive", title: "Load Error" });
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = currentUser?.role === 'Admin';

  const handleCityToggle = (cityName: string) => {
    setFormData(prev => ({
      ...prev,
      allowedCities: prev.allowedCities.includes(cityName)
        ? prev.allowedCities.filter(c => c !== cityName)
        : [...prev.allowedCities, cityName]
    }));
  };

  const handleCreateUser = async () => {
    if (!formData.username || !formData.password) return;
    setIsSaving(true);
    try {
      // 🛡️ NORMALIZE & CHECK FOR DUPLICATES
      const normalizedUsername = formData.username.trim().toLowerCase();
      const userRef = doc(db, 'users', normalizedUsername);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        toast({ 
          variant: "destructive", 
          title: "Account Exists", 
          description: `The username "${normalizedUsername}" is already taken.` 
        });
        setIsSaving(false);
        return;
      }

      await setDoc(userRef, {
        username: normalizedUsername,
        name: formData.name,
        password: formData.password,
        role: formData.role,
        allowedCities: formData.allowedCities,
        createdAt: new Date().toISOString()
      });

      toast({ title: "User Created", description: `${normalizedUsername} is now active.` });
      setStep(1);
      setFormData({ username: '', name: '', password: '', role: 'Agent', allowedCities: [] });
      fetchData();
    } catch (e) {
      toast({ variant: "destructive", title: "Creation Failed" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = async (id: string) => {
    if (!isAdmin) return; 
    try {
      await updateDoc(doc(db, 'users', id), { password: newPassword });
      toast({ title: "Updated", description: "Password changed successfully." });
      setEditingId(null);
      setNewPassword('');
      fetchData();
    } catch (e) { toast({ variant: "destructive", title: "Update Failed" }); }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin || !confirm("Delete user?")) return; 
    await deleteDoc(doc(db, 'users', id));
    fetchData();
  };

  // 🔍 Filtered User List
  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="h-6 w-6 text-purple-600" />
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        </div>
        <Badge variant="outline" className="bg-white">{currentUser?.role} View</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* WIZARD CARD */}
        <Card className="md:col-span-1 border-t-4 border-t-purple-600 shadow-md h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Create New User</CardTitle>
            <CardDescription>Setup account access and permissions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div className={`space-y-2 p-3 rounded-lg border transition-all ${step === 1 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">1</Badge>
                <UserPlus className="h-4 w-4" /> Account Info
              </div>
              {step === 1 && (
                <div className="pt-2 space-y-3">
                  <Input placeholder="Username (login ID)" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                  <Input placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  <Input type="password" placeholder="Initial Password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                  <Button size="sm" className="w-full" disabled={!formData.username || !formData.password} onClick={() => setStep(2)}>
                    Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className={`space-y-2 p-3 rounded-lg border transition-all ${step === 2 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">2</Badge>
                <ShieldCheck className="h-4 w-4" /> Permission Role
              </div>
              {step === 2 && (
                <div className="pt-2 space-y-3">
                  <Select value={formData.role} onValueChange={(val) => setFormData({...formData, role: val})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Agent">Agent (View Only)</SelectItem>
                      {isAdmin && (
                        <>
                          <SelectItem value="Manager">Manager (Create/Tickets)</SelectItem>
                          <SelectItem value="Admin">Admin (Full Access)</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  {!isAdmin && <p className="text-[10px] text-amber-600 font-medium">Managers can only create Agents.</p>}
                  <Button size="sm" className="w-full" onClick={() => setStep(3)}>
                    Next <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className={`space-y-2 p-3 rounded-lg border transition-all ${step === 3 ? 'border-purple-200 bg-purple-50' : 'bg-white opacity-50'}`}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full">3</Badge>
                <MapPinned className="h-4 w-4" /> Assigned Cities
              </div>
              {step === 3 && (
                <div className="pt-2 space-y-3">
                  <div className="max-h-40 overflow-y-auto space-y-2 border rounded p-2 bg-white">
                    {cities.map(city => (
                      <div key={city.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={city.id} 
                          checked={formData.allowedCities.includes(city.name)}
                          onCheckedChange={() => handleCityToggle(city.name)}
                        />
                        <label htmlFor={city.id} className="text-xs font-medium cursor-pointer">{city.name}</label>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700" disabled={isSaving} onClick={handleCreateUser}>
                    {isSaving ? <Loader2 className="animate-spin" /> : "Finalize User"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* USER LIST TABLE */}
        <Card className="md:col-span-2 shadow-sm flex flex-col overflow-hidden">
          <CardHeader className="border-b bg-white">
            <div className="flex items-center justify-between gap-4">
              <CardTitle>Existing Users</CardTitle>
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Filter users..." 
                  className="pl-8 h-9 text-sm" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto max-h-[600px]">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="animate-spin h-6 w-6 mx-auto text-muted-foreground" /></TableCell></TableRow> : 
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <div className="font-bold text-sm">{user.name}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">@{user.username}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'Admin' ? 'default' : user.role === 'Manager' ? 'outline' : 'secondary'} className="text-[10px]">
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {editingId === user.id && isAdmin ? (
                          <div className="flex gap-1">
                            <Input className="h-7 text-xs w-24" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                            <Button size="icon" className="h-7 w-7 bg-green-600" onClick={() => handleUpdatePassword(user.id)}><Check className="size-3" /></Button>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="size-3" /></Button>
                          </div>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px]" 
                            disabled={!isAdmin}
                            onClick={() => setEditingId(user.id)}
                          >
                            <Key className="mr-1 size-3" /> {isAdmin ? "Reset" : "Locked"}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin ? (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)} className="text-red-500 hover:bg-red-50">
                             <Trash2 className="size-4" />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium italic">Admin Only</span>
                        )}
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
