'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, ShieldAlert, UserCog, KeyRound, UserCircle } from 'lucide-react';

export default function TeamManagerPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const session = JSON.parse(localStorage.getItem('geo_user') || '{}');
      setCurrentUser(session);

      // 🛡️ SECURITY REDIRECT: If not an admin, boot them out
      if (session.role !== 'admin') {
        window.location.href = '/dashboard';
        return;
      }

      try {
        const q = query(collection(db, 'users'), orderBy('username', 'asc'));
        const snap = await getDocs(q);
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        toast({ variant: "destructive", title: "Access Denied", description: "Database rules blocked this request." });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [toast]);

  const handleUpdateUser = async (user: any) => {
    setUpdatingId(user.id);
    try {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        role: user.role,
        password: user.password,
        name: user.name || user.username // Ensure name field exists
      });
      toast({ title: "Update Success", description: `Credentials for ${user.username} updated.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Update Failed", description: "You don't have permission to modify this user." });
    } finally {
      setUpdatingId(null);
    }
  };

  const onFieldChange = (id: string, field: string, value: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-purple-600" /></div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <UserCog className="text-purple-600" /> Team Access Manager
          </h1>
          <p className="text-sm text-slate-500">Modify roles, passwords, and identities for all personnel.</p>
        </div>
        <Badge className="bg-red-50 text-red-700 border-red-200 uppercase font-black px-3 py-1">
          Admin Level Access
        </Badge>
      </div>

      <div className="grid gap-4">
        {users.map((user) => (
          <Card key={user.id} className="overflow-hidden border-l-4 border-l-slate-200 hover:border-l-purple-500 transition-all shadow-sm">
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-4 p-4">
                
                {/* 1. Identity Section */}
                <div className="flex items-center gap-3">
                  <div className="bg-slate-100 p-2 rounded-full">
                    <UserCircle className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Full Name</label>
                    <Input 
                      className="h-8 text-sm font-semibold" 
                      value={user.name || ''} 
                      onChange={(e) => onFieldChange(user.id, 'name', e.target.value)}
                    />
                  </div>
                </div>

                {/* 2. Credentials Section */}
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 text-slate-300" />
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Access Password</label>
                    <Input 
                      type="text" 
                      className="h-8 text-sm bg-slate-50" 
                      value={user.password} 
                      onChange={(e) => onFieldChange(user.id, 'password', e.target.value)}
                    />
                  </div>
                </div>

                {/* 3. Role Section */}
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-4 w-4 text-slate-300" />
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Permission Role</label>
                    <select 
                      className="w-full h-8 text-sm border rounded px-1 bg-white"
                      value={user.role}
                      onChange={(e) => onFieldChange(user.id, 'role', e.target.value)}
                    >
                      <option value="agent">Agent</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                {/* 4. Action Section */}
                <div className="flex justify-end pr-2">
                  <Button 
                    size="sm" 
                    className="bg-purple-600 hover:bg-purple-700 h-9 px-6 font-bold"
                    onClick={() => handleUpdateUser(user)}
                    disabled={updatingId === user.id}
                  >
                    {updatingId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
                  </Button>
                </div>

              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
