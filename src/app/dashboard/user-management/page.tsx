'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Shield, 
  UserPlus, 
  Trash2, 
  Loader2, 
  AlertCircle,
  ShieldCheck,
  UserX
} from 'lucide-react';

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('agent');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const session = JSON.parse(localStorage.getItem('geo_user') || '{}');
        setCurrentUser(session);

        const q = query(collection(db, 'users'), orderBy('username', 'asc'));
        const querySnapshot = await getDocs(q);
        const userList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUsers(userList);
      } catch (error) {
        console.error("Fetch error:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load users." });
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [toast]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;

    // 🛡️ SECURITY BLOCK: Managers can ONLY create Agents
    if (currentUser?.role === 'manager' && newRole !== 'agent') {
      toast({ 
        variant: "destructive", 
        title: "Permission Denied", 
        description: "Managers are only authorized to create Agent accounts." 
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const userRef = doc(db, 'users', newUsername.toLowerCase());
      const newUser = {
        username: newUsername.toLowerCase(),
        password: newPassword,
        role: newRole,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.username
      };

      await setDoc(userRef, newUser);
      setUsers([...users, newUser]);
      setNewUsername('');
      setNewPassword('');
      toast({ title: "User Created", description: `${newUsername} successfully registered.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Failed", description: "Database permission error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (targetUser: any) => {
    // 🛡️ SECURITY BLOCK: Managers cannot delete ANY user
    if (currentUser?.role === 'manager') {
      toast({ 
        variant: "destructive", 
        title: "Access Denied", 
        description: "Managers do not have deletion privileges." 
      });
      return;
    }

    // 🛡️ SECURITY BLOCK: Admins cannot delete other Admins
    if (targetUser.role === 'admin') {
      toast({ 
        variant: "destructive", 
        title: "Protected Account", 
        description: "Admin accounts must be removed via the system console." 
      });
      return;
    }

    if (confirm(`Remove ${targetUser.username}?`)) {
      try {
        await deleteDoc(doc(db, 'users', targetUser.username));
        setUsers(users.filter(u => u.username !== targetUser.username));
        toast({ title: "Deleted", description: "User has been removed from the system." });
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Delete operation failed." });
      }
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin text-purple-600" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Shield className="text-purple-600" /> Team Management
        </h1>
        <Badge variant="outline" className="border-purple-200 text-purple-700 font-bold uppercase">
          Role: {currentUser?.role}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* REGISTRATION FORM */}
        <Card className="lg:col-span-1 border-t-4 border-t-purple-600 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Add Team Member</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Username</label>
                <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Username" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Password</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Assign Role</label>
                <select 
                  className="w-full p-2 border rounded-md bg-white text-sm"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                >
                  <option value="agent">Agent (Field Access)</option>
                  {currentUser?.role === 'admin' && (
                    <>
                      <option value="manager">Manager (Fleet Access)</option>
                      <option value="admin">Admin (System Access)</option>
                    </>
                  )}
                </select>
                {currentUser?.role === 'manager' && (
                  <p className="text-[9px] text-orange-500 font-medium mt-1">Managers can only register Agents.</p>
                )}
              </div>
              <Button className="w-full bg-purple-600 hover:bg-purple-700 font-bold" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : <><UserPlus className="mr-2 h-4" /> Create Account</>}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ACCESS LIST */}
        <Card className="lg:col-span-2 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Active Personnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-right">Security Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => (
                    <tr key={user.username} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 font-semibold text-slate-700">{user.username}</td>
                      <td className="px-4 py-4">
                        <Badge className={`${
                          user.role === 'admin' ? 'bg-red-50 text-red-700 border-red-200' : 
                          user.role === 'manager' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                          'bg-slate-100 text-slate-600 border-slate-200'
                        } border shadow-none`}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {/* 🛡️ Logic for Delete Button Visibility */}
                        {currentUser?.role === 'manager' ? (
                          <div className="flex justify-end text-slate-300" title="Managers cannot delete users">
                            <UserX className="h-4 w-4" />
                          </div>
                        ) : user.role === 'admin' ? (
                          <div className="flex justify-end text-slate-400" title="Admin Account Protected">
                            <ShieldCheck className="h-5 w-5" />
                          </div>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDelete(user)}
                            className="text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400 bg-slate-50 p-2 rounded">
              <AlertCircle className="h-3 w-3" />
              Deletion is restricted to Administrators only. Managers have view and registration privileges only.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
