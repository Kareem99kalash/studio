'use client';

import { useState, useEffect } from 'react';
import { db } from '@/firebase'; 
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc,
  updateDoc, 
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  PlusCircle,
  Pencil,
  Save,
  X,
  Wrench,
  Eye,
  EyeOff
} from 'lucide-react';

// --- CONFIGURATION ---
const ROLE_PRESETS: Record<string, string[]> = {
  'viewer': ['view_dashboard', 'view_cities', 'view_tickets'],
  'analyst': ['view_dashboard', 'view_cities', 'view_tickets', 'tool_topology', 'tool_maps', 'tool_coords'],
  'manager': ['view_dashboard', 'view_audit', 'view_cities', 'view_tickets', 'create_tickets', 'manage_tickets', 'manage_cities', 'tool_batch'],
  'admin': [] 
};

const PERMISSION_GROUPS = [
  {
    category: "General Access",
    icon: LayoutGrid,
    actions: [
      { id: 'view_dashboard', label: 'View Dashboard' },
      { id: 'view_audit', label: 'View Audit Logs' },
      { id: 'view_cities', label: 'View City Data' },
    ]
  },
  {
    category: "Operational",
    icon: Ticket,
    actions: [
      { id: 'view_tickets', label: 'View Tickets' },
      { id: 'create_tickets', label: 'Create Tickets' },
      { id: 'manage_tickets', label: 'Resolve/Delete Tickets' },
      { id: 'manage_cities', label: 'Edit City Data' },
    ]
  },
  {
    category: "Admin Toolbox",
    icon: Wrench,
    actions: [
      { id: 'tool_batch', label: 'Batch Coverage Processor' },
      { id: 'tool_topology', label: 'Topology Architect' },
      { id: 'tool_maps', label: 'Map Architect' },
      { id: 'tool_users', label: 'Team Access Manager' },
      { id: 'tool_coords', label: 'Coordinate Flipper' },
      { id: 'tool_broadcast', label: 'Broadcast Center' },
    ]
  },
  {
    category: "System",
    icon: ShieldCheck,
    actions: [
      { id: 'access_admin_tools', label: 'Access Admin Page' }, 
      { id: 'manage_users', label: 'Manage Users (Global)' },
    ]
  }
];

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // CREATE FORM STATE
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); 
  const [createGroup, setCreateGroup] = useState('');
  const [createRole, setCreateRole] = useState('viewer'); 
  const [createPermissions, setCreatePermissions] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // GROUP FORM STATE
  const [newGroupName, setNewGroupName] = useState('');

  // EDIT MODAL STATE
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editGroup, setEditGroup] = useState('');
  const [editRole, setEditRole] = useState('custom');
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>({});
  const [editPassword, setEditPassword] = useState(''); 
  const [isSaving, setIsSaving] = useState(false);

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

  // --- 📝 LOGGING HELPER ---
  const logActivity = async (action: string, details: string) => {
    try {
        await addDoc(collection(db, 'audit_logs'), {
            timestamp: new Date().toISOString(),
            user: currentUser?.username || 'System',
            action: action,
            details: details,
            userAgent: navigator.userAgent
        });
    } catch (e) {
        console.error("Failed to log activity", e);
    }
  };

  // --- HANDLERS ---
  
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'agent_groups'), {
        name: newGroupName.trim(),
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.username
      });
      setGroups([...groups, { id: docRef.id, name: newGroupName.trim() }]);
      
      // LOG IT
      await logActivity('Create Group', `Created new group: ${newGroupName.trim()}`);
      
      setNewGroupName('');
      toast({ title: "Group Created" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to create group." });
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if(!confirm("Delete this group?")) return;
    try {
      await deleteDoc(doc(db, 'agent_groups', groupId));
      setGroups(groups.filter(g => g.id !== groupId));
      
      // LOG IT
      await logActivity('Delete Group', `Deleted group ID: ${groupId}`);
      
      toast({ title: "Group Deleted" });
    } catch (e) { toast({ variant: "destructive", title: "Error" }); }
  };

  const togglePermission = (
    permissionId: string, 
    currentPermissions: Record<string, boolean>, 
    setFunction: Function
  ) => {
    setFunction({ ...currentPermissions, [permissionId]: !currentPermissions[permissionId] });
  };

  const handleRoleChange = (role: string) => {
    setCreateRole(role);
    if (role === 'custom') {
      setShowAdvanced(true);
      setCreatePermissions({});
    } else {
      setShowAdvanced(false);
      const preset = ROLE_PRESETS[role] || [];
      const newPerms: Record<string, boolean> = {};
      preset.forEach(p => newPerms[p] = true);
      setCreatePermissions(newPerms);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;

    setIsSubmitting(true);

    try {
      const cleanUsername = newUsername.toLowerCase().trim();
      const userRef = doc(db, 'users', cleanUsername);
      const isMasterAdmin = createRole === 'admin';

      const newUser = {
        username: cleanUsername,
        password: newPassword, 
        role: createRole, 
        permissions: isMasterAdmin ? {} : createPermissions, 
        groupId: createGroup || null,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.username
      };

      await setDoc(userRef, newUser);
      
      // LOG IT
      await logActivity('Create User', `Created user ${cleanUsername} with role ${createRole}`);

      setUsers([...users, newUser]);
      setNewUsername('');
      setNewPassword('');
      setCreateGroup('');
      handleRoleChange('viewer');
      
      toast({ title: "User Created", description: `${cleanUsername} ready.` });

    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Failed", description: "Could not save user." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (targetUser: any) => {
    if (!confirm(`Delete ${targetUser.username}?`)) return;
    try {
      await deleteDoc(doc(db, 'users', targetUser.username));
      setUsers(users.filter(u => u.username !== targetUser.username));
      
      // LOG IT
      await logActivity('Delete User', `Deleted user account: ${targetUser.username}`);

      toast({ title: "Deleted" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  const openEditModal = (user: any) => {
    setEditingUser(user);
    setEditGroup(user.groupId || '');
    setEditRole(user.role || 'custom');
    setEditPermissions(user.permissions || {});
    setEditPassword(''); 
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setIsSaving(true);

    try {
      const userRef = doc(db, 'users', editingUser.username);
      const isMasterAdmin = editRole === 'admin';

      const updates: any = {
        role: editRole,
        groupId: editGroup || null,
        permissions: isMasterAdmin ? {} : editPermissions
      };

      if (editPassword.trim()) {
        updates.password = editPassword.trim();
      }

      await updateDoc(userRef, updates);
      
      // LOG IT
      await logActivity('Update User', `Updated profile for ${editingUser.username}. Role: ${editRole}`);

      setUsers(users.map(u => 
        u.username === editingUser.username ? { ...u, ...updates } : u
      ));

      toast({ title: "Profile Updated", description: `Changes saved for ${editingUser.username}` });
      setEditModalOpen(false);

    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Save Failed", description: "Could not update user." });
    } finally {
      setIsSaving(false);
    }
  };

  const getGroupName = (id: string) => groups.find(g => g.id === id)?.name || "Unassigned";

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin text-purple-600" /></div>;

  return (
    <div className="p-6 space-y-6 relative">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Shield className="text-purple-600" /> User & Access Control
        </h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: QUICK ADD USER */}
        <div className="xl:col-span-1 space-y-6">
          <Card className="border-t-4 border-t-purple-600 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Quick Add User</CardTitle>
              <CardDescription>Create credentials & assign simplified roles.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                
                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Username</label>
                      <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. jdoe" required className="h-9 bg-white" />
                    </div>
                    <div className="space-y-1 relative">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Password</label>
                      <div className="relative">
                        <Input 
                            type={showPassword ? "text" : "password"} 
                            value={newPassword} 
                            onChange={(e) => setNewPassword(e.target.value)} 
                            placeholder="••••••" 
                            required 
                            className="h-9 bg-white pr-8" 
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Geographic Group</label>
                  <select className="w-full p-2 h-9 border rounded-md bg-white text-sm" value={createGroup} onChange={(e) => setCreateGroup(e.target.value)}>
                    <option value="">-- Global / None --</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Role Template</label>
                    <select 
                      className="w-full p-2 h-9 border rounded-md bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-purple-500 outline-none" 
                      value={createRole} 
                      onChange={(e) => handleRoleChange(e.target.value)}
                    >
                      <option value="viewer">Viewer (Read-Only)</option>
                      <option value="analyst">Analyst (Maps & Tools)</option>
                      <option value="manager">Manager (Operations)</option>
                      <option value="admin">System Administrator</option>
                      <option value="custom">Custom (Advanced)</option>
                    </select>
                </div>

                {createRole === 'custom' && (
                    <div className="border rounded-lg p-2 bg-slate-50 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Granular Permissions</span>
                             <Badge variant="outline" className="text-[9px] bg-white">Custom</Badge>
                        </div>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {PERMISSION_GROUPS.map((group) => (
                                <div key={group.category}>
                                    <h5 className="text-[9px] font-bold text-slate-400 uppercase mb-1">{group.category}</h5>
                                    <div className="grid grid-cols-1 gap-1">
                                        {group.actions.map((action) => (
                                            <div key={action.id} className="flex items-center space-x-2">
                                                <Checkbox 
                                                    id={`create-${action.id}`} 
                                                    checked={createPermissions[action.id] || false} 
                                                    onCheckedChange={() => togglePermission(action.id, createPermissions, setCreatePermissions)} 
                                                    className="h-3.5 w-3.5"
                                                />
                                                <label htmlFor={`create-${action.id}`} className="text-[10px] font-medium text-slate-700 cursor-pointer">{action.label}</label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Button className="w-full bg-purple-600 hover:bg-purple-700 font-bold" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <><UserPlus className="mr-2 h-4" /> Add User</>}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* GROUPS LIST */}
          <Card className="border-t-4 border-t-indigo-500 shadow-md">
            <CardHeader className="pb-2"><CardTitle className="text-lg">Groups</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2"><Input placeholder="New Group" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="h-8 text-xs" /><Button size="sm" onClick={handleCreateGroup}><PlusCircle className="h-4 w-4" /></Button></div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {groups.map(g => (
                    <div key={g.id} className="flex justify-between items-center p-1.5 px-3 bg-slate-50 rounded border text-xs"><span className="font-semibold text-slate-700">{g.name}</span><Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-red-500" onClick={() => handleDeleteGroup(g.id)}><Trash2 className="h-3 w-3" /></Button></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: USER LIST */}
        <Card className="xl:col-span-2 shadow-md h-fit">
          <CardHeader><CardTitle className="text-lg">System Users</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                  <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role / Group</th><th className="px-4 py-3">Access</th><th className="px-4 py-3 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => (
                    <tr key={user.username} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 font-semibold text-slate-700">{user.username}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit bg-indigo-50 text-indigo-700 border-indigo-200">{getGroupName(user.groupId)}</Badge>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">{user.role === 'custom' ? 'Custom Role' : user.role}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {user.role === 'admin' ? <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100"><ShieldCheck className="h-3 w-3 mr-1" /> Full Access</Badge> : (
                          <div className="flex flex-wrap gap-1 max-w-md">{user.permissions && Object.entries(user.permissions).filter(([, v]) => v).length > 0 ? Object.entries(user.permissions).filter(([, v]) => v).slice(0, 4).map(([k]) => (<span key={k} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold border border-slate-200">{k.replace(/_/g, ' ')}</span>)) : <span className="text-xs text-slate-400 italic">No access</span>}{user.permissions && Object.values(user.permissions).filter(v => v).length > 4 && <span className="text-[9px] text-slate-400 self-center">...</span>}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.role === 'admin' ? <Lock className="h-4 w-4 text-slate-300" /> : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEditModal(user)} className="text-blue-500 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(user)} className="text-red-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- EDIT MODAL (Access Control for Admins) --- */}
      {editModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
           <Card className="w-full max-w-2xl shadow-2xl border-0 max-h-[90vh] flex flex-col">
              <CardHeader className="bg-slate-50 border-b border-slate-100 shrink-0">
                 <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg">Access Control</CardTitle>
                        <CardDescription>Advanced settings for <span className="font-bold text-slate-900">{editingUser.username}</span></CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => setEditModalOpen(false)}><X className="h-5 w-5" /></Button>
                 </div>
              </CardHeader>
              
              <CardContent className="p-0 overflow-hidden flex-1 flex flex-col">
                 <Tabs defaultValue="general" className="flex-1 flex flex-col">
                    <div className="px-6 pt-4 shrink-0">
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="general">Profile & Role</TabsTrigger>
                        <TabsTrigger value="permissions" disabled={editRole === 'admin'}>Detailed Permissions</TabsTrigger>
                      </TabsList>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1">
                      <TabsContent value="general" className="space-y-4 mt-0">
                          <div className="space-y-1">
                             <label className="text-xs font-bold text-slate-500 uppercase">Change Password</label>
                             <Input 
                               type="password" 
                               value={editPassword} 
                               onChange={(e) => setEditPassword(e.target.value)} 
                               autoComplete="new-password" 
                               name="new-password-field" 
                               placeholder="Set new password"
                             />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Assigned Group</label>
                                <select className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm" value={editGroup} onChange={(e) => setEditGroup(e.target.value)}>
                                   <option value="">-- Global / None --</option>
                                   {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                             </div>
                             <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Role Level</label>
                                <select className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                                   <option value="custom">Custom Permissions</option>
                                   <option value="viewer">Viewer</option>
                                   <option value="analyst">Analyst</option>
                                   <option value="manager">Manager</option>
                                   <option value="admin">System Administrator</option>
                                </select>
                             </div>
                          </div>
                       </TabsContent>

                       <TabsContent value="permissions" className="mt-0">
                          <div className="space-y-5">
                             {PERMISSION_GROUPS.map((group) => (
                               <div key={group.category} className="space-y-2 border-b border-slate-100 pb-3 last:border-0">
                                 <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2"><group.icon className="h-4 w-4 text-slate-400" /> {group.category}</h4>
                                 <div className="grid grid-cols-2 gap-3 pl-2">
                                   {group.actions.map((action) => (
                                     <div key={action.id} className="flex items-center space-x-2">
                                       <Checkbox 
                                         id={`edit-${action.id}`} 
                                         checked={editPermissions[action.id] || false} 
                                         onCheckedChange={() => togglePermission(action.id, editPermissions, setEditPermissions)} 
                                       />
                                       <label htmlFor={`edit-${action.id}`} className="text-sm font-medium leading-none text-slate-600 cursor-pointer">{action.label}</label>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             ))}
                          </div>
                       </TabsContent>
                    </div>
                 </Tabs>
              </CardContent>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 rounded-b-lg">
                 <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
                 <Button className="bg-blue-600 hover:bg-blue-700 min-w-[120px]" onClick={handleSaveEdit} disabled={isSaving}>
                    {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <><Save className="mr-2 h-4 w-4" /> Save Access</>}
                 </Button>
              </div>
           </Card>
        </div>
      )}

    </div>
  );
}
