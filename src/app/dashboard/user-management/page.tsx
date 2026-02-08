'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  addDoc,
  query, 
  orderBy, 
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  Shield, 
  UserPlus, 
  Trash2, 
  Loader2, 
  ShieldCheck,
  LayoutGrid,
  Ticket,
  Map as MapIcon,
  Crown,
  Lock,
  Users,
  PlusCircle
} from 'lucide-react';

// --- PERMISSION DEFINITIONS ---
const PERMISSION_GROUPS = [
  {
    category: "General Access",
    icon: LayoutGrid,
    actions: [
      { id: 'view_dashboard', label: 'View Dashboard' },
      { id: 'view_audit', label: 'View Audit Logs' },
    ]
  },
  {
    category: "Ticket System",
    icon: Ticket,
    actions: [
      { id: 'view_tickets', label: 'View Tickets' },
      { id: 'create_tickets', label: 'Create Tickets' },
      { id: 'manage_tickets', label: 'Delete/Resolve Tickets' },
    ]
  },
  {
    category: "City & Maps",
    icon: MapIcon,
    actions: [
      { id: 'view_cities', label: 'View City Data' },
      { id: 'manage_cities', label: 'Create/Edit Cities' },
      { id: 'manage_thresholds', label: 'Edit Threshold Rules' },
    ]
  },
  {
    category: "Administration",
    icon: ShieldCheck,
    actions: [
      { id: 'manage_users', label: 'Manage Users' },
      { id: 'access_admin_tools', label: 'Access Admin Tools' },
    ]
  }
];

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // User Form State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedRoleTemplate, setSelectedRoleTemplate] = useState('custom'); 
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group Form State (RESTORED)
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const session = JSON.parse(localStorage.getItem('geo_user') || '{}');
        setCurrentUser(session);

        const qUsers = query(collection(db, 'users'), orderBy('username', 'asc'));
        const userSnap = await getDocs(qUsers);
        setUsers(userSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const qGroups = query(collection(db, 'agent_groups'), orderBy('name', 'asc'));
        const groupSnap = await getDocs(qGroups);
        setGroups(groupSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not load data." });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [toast]);

  // --- GROUP MANAGEMENT HANDLERS (RESTORED) ---
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'agent_groups'), {
        name: newGroupName.trim(),
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.username
      });
      setGroups([...groups, { id: docRef.id, name: newGroupName.trim() }]);
      setNewGroupName('');
      toast({ title: "Group Created" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to create group." });
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if(!confirm("Delete this group? Users assigned to it will become Global.")) return;
    try {
      await deleteDoc(doc(db, 'agent_groups', groupId));
      setGroups(groups.filter(g => g.id !== groupId));
      toast({ title: "Group Deleted" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  // --- USER HANDLERS ---
  const togglePermission = (id: string) => {
    setPermissions(prev => ({ ...prev, [id]: !prev[id] }));
    if (selectedRoleTemplate === 'admin') setSelectedRoleTemplate('custom');
  };

  const handleTemplateChange = (val: string) => {
    setSelectedRoleTemplate(val);
    if (val === 'custom') setPermissions({}); 
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;

    setIsSubmitting(true);
    try {
      const userRef = doc(db, 'users', newUsername.toLowerCase());
      const isMasterAdmin = selectedRoleTemplate === 'admin';

      const newUser = {
        username: newUsername.toLowerCase(),
        password: newPassword, 
        role: selectedRoleTemplate, 
        permissions: isMasterAdmin ? {} : permissions, 
        groupId: selectedGroup || null,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.username
      };

      await setDoc(userRef, newUser);
      setUsers([...users, newUser]);
      
      setNewUsername('');
      setNewPassword('');
      setSelectedGroup('');
      setPermissions({});
      setSelectedRoleTemplate('custom');
      
      toast({ title: "User Created", description: `${newUsername} registered.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Failed", description: "Database error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (targetUser: any) => {
    if (!confirm(`Remove ${targetUser.username}?`)) return;
    try {
      await deleteDoc(doc(db, 'users', targetUser.username));
      setUsers(users.filter(u => u.username !== targetUser.username));
      toast({ title: "Deleted" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  const getGroupName = (id: string) => groups.find(g => g.id === id)?.name || "Unassigned";

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin text-purple-600" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Shield className="text-purple-600" /> User & Access Control
        </h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: CREATION FORMS */}
        <div className="xl:col-span-1 space-y-6">
          
          {/* 1. CREATE USER CARD */}
          <Card className="border-t-4 border-t-purple-600 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Create New User</CardTitle>
              <CardDescription>Define role and access level.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Username</label>
                    <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="User" required />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Password</label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="•••" required />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Geographic Group</label>
                  <select 
                    className="w-full p-2 border rounded-md bg-white text-sm"
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                  >
                    <option value="">-- Global / None --</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase">Role Type</label>
                   <select 
                      className="w-full p-2 border rounded-md bg-white text-sm"
                      value={selectedRoleTemplate}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                    >
                      <option value="custom">Custom Permissions</option>
                      <option value="admin">System Administrator</option>
                    </select>
                </div>

                <div className="border-t border-slate-100 my-2" />

                {selectedRoleTemplate === 'admin' ? (
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 text-center space-y-2 animate-in fade-in zoom-in duration-300">
                     <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
                        <Crown className="h-5 w-5 text-purple-600" />
                     </div>
                     <h4 className="text-sm font-bold text-purple-900">Master Access Granted</h4>
                     <p className="text-xs text-purple-700">Full system read/write access.</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 animate-in slide-in-from-top-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Capabilities:</p>
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group.category} className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2 bg-slate-50 p-1.5 rounded">
                          <group.icon className="h-3.5 w-3.5 text-slate-500" /> {group.category}
                        </h4>
                        <div className="grid grid-cols-1 gap-2 pl-2">
                          {group.actions.map((action) => (
                            <div key={action.id} className="flex items-center space-x-2">
                              <Checkbox 
                                id={action.id} 
                                checked={permissions[action.id] || false}
                                onCheckedChange={() => togglePermission(action.id)}
                              />
                              <label htmlFor={action.id} className="text-xs font-medium leading-none text-slate-600 cursor-pointer">
                                {action.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Button className="w-full bg-purple-600 hover:bg-purple-700 font-bold" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <><UserPlus className="mr-2 h-4" /> Create User</>}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 2. GROUP MANAGEMENT CARD (RESTORED) */}
          <Card className="border-t-4 border-t-indigo-500 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5" /> Geographic Groups</CardTitle>
              <CardDescription>Regions to isolate data visibility.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input 
                  placeholder="New Group Name" 
                  value={newGroupName} 
                  onChange={(e) => setNewGroupName(e.target.value)} 
                />
                <Button size="icon" onClick={handleCreateGroup}><PlusCircle className="h-5 w-5" /></Button>
              </div>
              
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {groups.map(g => (
                   <div key={g.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border text-sm">
                      <span className="font-semibold text-slate-700">{g.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500" onClick={() => handleDeleteGroup(g.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                   </div>
                ))}
                {groups.length === 0 && <p className="text-xs text-slate-400 text-center italic">No groups created.</p>}
              </div>
            </CardContent>
          </Card>

        </div>

        {/* RIGHT COLUMN: USER LIST */}
        <Card className="xl:col-span-2 shadow-md h-fit">
          <CardHeader>
            <CardTitle className="text-lg">System Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Assigned Group</th>
                    <th className="px-4 py-3">Capabilities</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => (
                    <tr key={user.username} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 font-semibold text-slate-700">{user.username}</td>
                      <td className="px-4 py-4">
                        {user.groupId ? (
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                            {getGroupName(user.groupId)}
                          </Badge>
                        ) : <span className="text-xs text-slate-400">Global</span>}
                      </td>
                      <td className="px-4 py-4">
                        {user.role === 'admin' ? (
                           <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">
                              <ShieldCheck className="h-3 w-3 mr-1" /> Full Access
                           </Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {user.permissions && Object.entries(user.permissions).filter(([, v]) => v).length > 0 ? (
                              Object.entries(user.permissions)
                                .filter(([, v]) => v)
                                .slice(0, 4)
                                .map(([k]) => (
                                  <span key={k} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold border border-slate-200">
                                    {k.replace(/_/g, ' ')}
                                  </span>
                                ))
                            ) : <span className="text-xs text-slate-400 italic">No access</span>}
                            {user.permissions && Object.values(user.permissions).filter(v => v).length > 4 && (
                              <span className="text-[9px] text-slate-400 self-center">...</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {user.role === 'admin' ? (
                           <Lock className="h-4 w-4 text-slate-300 ml-auto" />
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(user)} className="text-red-500 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
