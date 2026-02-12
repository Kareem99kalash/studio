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
  Lock,
  PlusCircle,
  Pencil,
  Save,
  X,
  Wrench,
  Eye,
  EyeOff,
  HelpCircle
} from 'lucide-react';
import { useSession } from '@/hooks/use-session'; // 🟢 Import Hook
import Link from 'next/link';

// --- CONFIGURATION ---
const ROLE_PRESETS: Record<string, string[]> = {
  'viewer': ['view_dashboard', 'view_cities', 'view_tickets'],
  'analyst': ['view_dashboard', 'view_cities', 'view_tickets', 'tool_topology', 'tool_maps', 'tool_coords'],
  'manager': ['view_dashboard', 'view_audit', 'view_cities', 'view_tickets', 'create_tickets', 'manage_tickets', 'manage_cities', 'tool_batch', 'view_documentation'],
  'admin': [] // Admin gets everything automatically
};

const PERMISSION_GROUPS = [
  {
    category: "Admin Toolbox",
    icon: Wrench,
    actions: [
      { id: 'tool_batch', label: 'Batch Coverage Processor' },
      { id: 'tool_darkstore', label: 'Dark Store Analyzer' }, 
      { id: 'tool_topology', label: 'Topology Architect' },
      { id: 'tool_maps', label: 'Map Architect' },
      { id: 'tool_users', label: 'Team Access Manager' },
      { id: 'tool_coords', label: 'Coordinate Flipper' },
      { id: 'tool_broadcast', label: 'Broadcast Center' },
    ]
  },
  {
    category: "General Access",
    icon: LayoutGrid,
    actions: [
      { id: 'view_dashboard', label: 'View Dashboard' },
      { id: 'view_documentation', label: 'View Documentation' },
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
  
  // 1. Auth & Session Management
  const { user: currentUser, loading: sessionLoading } = useSession(true);

  // 2. Local State
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // CREATE FORM STATE
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); 
  const [createGroup, setCreateGroup] = useState('');
  const [createRole, setCreateRole] = useState('viewer'); 
  const [createPermissions, setCreatePermissions] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

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

  // 3. Fetch Data
  const fetchData = async () => {
    try {
      // Fetch Users
      const userSnap = await getDocs(collection(db, 'users'));
      setUsers(userSnap.docs.map(doc => ({ ...doc.data(), username: doc.id })));

      // Fetch Groups
      const groupSnap = await getDocs(query(collection(db, 'agent_groups'), orderBy('name')));
      setGroups(groupSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Could not load user data." });
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
        fetchData();
        // Initialize default permissions for viewer role
        const preset = ROLE_PRESETS['viewer'] || [];
        const newPerms: Record<string, boolean> = {};
        preset.forEach(p => newPerms[p] = true);
        setCreatePermissions(newPerms);
    }
  }, [currentUser, toast]);

  // Loading State
  if (sessionLoading || dataLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/30" />
      </div>
    );
  }

  // --- 🔒 HIERARCHY LOGIC (STRICT) ---

  const isAllowedToManage = (targetUser: any) => {
    if (!currentUser) return false;
    
    const targetRole = targetUser.role || 'viewer';

    // ⛔ IMMUTABLE ADMINS
    if (targetRole === 'admin' || targetRole === 'super_admin') {
        return false;
    }

    // 👑 Current User is Admin
    if (currentUser.role === 'admin' || currentUser.role === 'super_admin') {
        return true;
    }

    // 👷 Current User is Manager
    if (currentUser.role === 'manager') {
        if (targetUser.username === currentUser.username) return false;
        if (targetRole === 'manager' || targetRole === 'custom') return false;
        return true;
    }

    return false;
  };

  const getAssignableRoles = () => {
    if (currentUser?.role === 'admin' || currentUser?.role === 'super_admin') {
        return [
            { val: 'viewer', label: 'Viewer' },
            { val: 'analyst', label: 'Analyst' },
            { val: 'manager', label: 'Manager' },
            { val: 'admin', label: 'System Administrator' }, 
            { val: 'custom', label: 'Custom Permissions' }
        ];
    }
    if (currentUser?.role === 'manager') {
        return [
            { val: 'viewer', label: 'Viewer (Read-Only)' },
            { val: 'analyst', label: 'Analyst (Agent)' },
        ];
    }
    return [];
  };

  const canAssignPermission = (permissionId: string) => {
      if (currentUser?.role === 'admin' || currentUser?.role === 'super_admin') return true;
      if (currentUser?.role === 'manager') {
          return currentUser.permissions?.[permissionId] === true;
      }
      return false;
  };

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

  const nextStep = () => {
    if (wizardStep === 1) {
        if (!newUsername || !newPassword) {
            toast({ variant: "destructive", title: "Missing Information", description: "Please enter a username and password." });
            return;
        }
    }
    if (wizardStep === 2) {
        if (createRole === 'custom') {
            setWizardStep(3);
            return;
        }
        setWizardStep(4);
        return;
    }
    setWizardStep(prev => prev + 1);
  };

  const prevStep = () => {
    if (wizardStep === 4 && createRole !== 'custom') {
        setWizardStep(2);
        return;
    }
    setWizardStep(prev => Math.max(1, prev - 1));
  };

  const handleCreateUser = async () => {
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
      await logActivity('Create User', `Created user ${cleanUsername} with role ${createRole}`);

      setUsers([...users, newUser]);
      setNewUsername('');
      setNewPassword('');
      setCreateGroup('');
      setWizardStep(1);
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
    if (!isAllowedToManage(targetUser)) {
        toast({ variant: "destructive", title: "Permission Denied", description: "This user cannot be deleted via UI." });
        return;
    }

    if (!confirm(`Delete ${targetUser.username}?`)) return;
    try {
      await deleteDoc(doc(db, 'users', targetUser.username));
      setUsers(users.filter(u => u.username !== targetUser.username));
      await logActivity('Delete User', `Deleted user account: ${targetUser.username}`);
      toast({ title: "Deleted" });
    } catch (error) {
      toast({ variant: "destructive", title: "Error" });
    }
  };

  const openEditModal = (user: any) => {
    if (!isAllowedToManage(user)) return;

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

      if (editPassword && editPassword.trim() !== '') {
        updates.password = editPassword.trim();
      }

      await updateDoc(userRef, updates);
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

  return (
    <div className="p-8 space-y-8 relative max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-slate-900 tracking-tight">
            <Shield className="text-primary" /> User & Access Control
          </h1>
          <Link href="/dashboard/documentation#access-control" className="text-slate-300 hover:text-primary transition-colors" title="View Documentation">
            <HelpCircle className="h-6 w-6" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: QUICK ADD USER (WIZARD) */}
        <div className="xl:col-span-1 space-y-8">
          <Card className="border-t-4 border-t-primary shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden min-h-[420px] flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">User Wizard</CardTitle>
                <Badge variant="secondary" className="bg-primary/5 text-primary text-[10px] font-bold">Step {wizardStep}/4</Badge>
              </div>
              <CardDescription>
                {wizardStep === 1 && "Secure the identity of the new member."}
                {wizardStep === 2 && "Assign location & baseline access level."}
                {wizardStep === 3 && "Configure granular access overrides."}
                {wizardStep === 4 && "Final review before account creation."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  wizardStep < 4 ? nextStep() : handleCreateUser();
                }}
                className="flex-1 flex flex-col justify-between"
              >
              <div className="space-y-4 flex-1">
                {/* STEP 1: IDENTITY */}
                {wizardStep === 1 && (
                  <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="space-y-1">
                          <label htmlFor="new-username" className="text-[10px] font-bold text-slate-500 uppercase">Username</label>
                          <Input id="new-username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. jdoe" required className="h-10 bg-white rounded-lg" />
                        </div>
                        <div className="space-y-1 relative">
                          <label htmlFor="new-password" className="text-[10px] font-bold text-slate-500 uppercase">Initial Password</label>
                          <div className="relative">
                            <Input
                                id="new-password"
                                type={showPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="••••••"
                                required
                                className="h-10 bg-white pr-10 rounded-lg"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>
                        </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: ROLE & GROUP */}
                {wizardStep === 2 && (
                  <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Region Assignment</label>
                        <select className="w-full p-2 h-10 border rounded-lg bg-white text-sm focus:ring-2 focus:ring-primary outline-none" value={createGroup} onChange={(e) => setCreateGroup(e.target.value)}>
                          <option value="">-- Global / None --</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>

                      <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Primary Role Template</label>
                          <select
                            className="w-full p-2 h-10 border rounded-lg bg-white text-sm font-bold text-slate-700 focus:ring-2 focus:ring-primary outline-none"
                            value={createRole}
                            onChange={(e) => handleRoleChange(e.target.value)}
                          >
                            {getAssignableRoles().map(r => (
                                <option key={r.val} value={r.val}>{r.label}</option>
                            ))}
                          </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: GRANULAR PERMISSIONS */}
                {wizardStep === 3 && (
                   <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-4">
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocol Overrides</span>
                             <Badge className="text-[9px] bg-primary text-white rounded-md">Advanced</Badge>
                        </div>
                        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                            {PERMISSION_GROUPS.map((group) => (
                                <div key={group.category} className="mb-4 last:mb-0">
                                    <h5 className="text-[10px] font-bold text-slate-900 uppercase mb-2 flex items-center gap-2">
                                      <group.icon className="h-3 w-3 text-slate-400" /> {group.category}
                                    </h5>
                                    <div className="grid grid-cols-1 gap-1.5 pl-5">
                                        {group.actions.map((action) => (
                                            <div key={action.id} className="flex items-center space-x-2">
                                                <Checkbox 
                                                    id={`create-${action.id}`} 
                                                    checked={createPermissions[action.id] || false} 
                                                    onCheckedChange={() => togglePermission(action.id, createPermissions, setCreatePermissions)} 
                                                    disabled={!canAssignPermission(action.id)} 
                                                    className="h-4 w-4 border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                />
                                                <label 
                                                    htmlFor={`create-${action.id}`} 
                                                    className={`text-[11px] font-medium cursor-pointer ${canAssignPermission(action.id) ? 'text-slate-600' : 'text-slate-300 line-through'}`}
                                                >
                                                    {action.label}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: CONFIRMATION */}
                {wizardStep === 4 && (
                  <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="bg-slate-900 rounded-2xl p-5 text-white space-y-4 border border-slate-800 shadow-xl">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                             <Shield className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                             <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Final Clearance</p>
                             <p className="font-bold text-lg">{newUsername}</p>
                          </div>
                       </div>

                       <div className="space-y-2 pt-2 border-t border-white/5">
                          <div className="flex justify-between text-xs">
                             <span className="text-slate-500">Group:</span>
                             <span className="font-bold">{createGroup ? getGroupName(createGroup) : "Global Access"}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                             <span className="text-slate-500">Role:</span>
                             <span className="font-bold uppercase text-primary">{createRole}</span>
                          </div>
                          <div className="flex justify-between text-xs pt-1">
                             <span className="text-slate-500">Permissions:</span>
                             <span className="font-bold">{createRole === 'admin' ? "Full Administrator" : `${Object.values(createPermissions).filter(Boolean).length} Active Protocol(s)`}</span>
                          </div>
                       </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-6">
                {wizardStep > 1 && (
                  <Button type="button" variant="outline" onClick={prevStep} className="flex-1 h-11 rounded-xl font-bold border-slate-200">
                    Back
                  </Button>
                )}

                {wizardStep < 4 ? (
                  <Button type="submit" className="flex-[2] bg-primary hover:bg-primary/90 font-bold rounded-xl h-11 shadow-lg shadow-primary/20 transition-all">
                    Next Section
                  </Button>
                ) : (
                  <Button type="submit" className="flex-[2] bg-green-600 hover:bg-green-700 font-bold rounded-xl h-11 shadow-lg shadow-green-200 transition-all text-white" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Provisioning...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" /> Create Account
                      </>
                    )}
                  </Button>
                )}
              </div>
              </form>
            </CardContent>
          </Card>

          {/* GROUPS LIST */}
          <Card className="border-t-4 border-t-slate-400 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
            <CardHeader className="pb-2"><CardTitle className="text-lg">Geographic Groups</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="New Group" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="h-9 text-xs rounded-xl" aria-label="New group name" />
                <Button size="sm" onClick={handleCreateGroup} className="h-9 w-9 p-0 rounded-xl" aria-label="Create group"><PlusCircle className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {groups.map(g => (
                    <div key={g.id} className="flex justify-between items-center p-2 px-4 bg-slate-50/50 rounded-xl border border-slate-100 text-xs">
                        <span className="font-bold text-slate-600">{g.name}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg" onClick={() => handleDeleteGroup(g.id)} aria-label={`Delete group ${g.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: USER LIST */}
        <Card className="xl:col-span-2 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden border-slate-100 h-fit">
          <CardHeader className="bg-white border-b border-slate-50"><CardTitle className="text-lg">System Users</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase tracking-[0.1em]">
                  <tr><th className="px-6 py-4">Identity</th><th className="px-6 py-4">Role / Group</th><th className="px-6 py-4">Clearance</th><th className="px-6 py-4 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map((user) => {
                    const canEdit = isAllowedToManage(user);
                    const isTargetAdmin = user.role === 'admin' || user.role === 'super_admin';
                    
                    return (
                        <tr key={user.username} className={`transition-colors ${canEdit ? 'hover:bg-slate-50/50' : 'bg-slate-50/20 opacity-80'}`}>
                        <td className="px-6 py-5 font-bold text-slate-700">
                            <div className="flex items-center gap-2">
                                {user.username} 
                                {user.username === currentUser?.username && <Badge variant="secondary" className="text-[8px] bg-primary/5 text-primary border-none">YOU</Badge>}
                            </div>
                        </td>
                        <td className="px-6 py-5">
                            <div className="flex flex-col gap-1.5">
                                <Badge variant="outline" className="w-fit bg-slate-50 text-slate-600 border-slate-200 rounded-md font-bold text-[9px] uppercase tracking-wide">{getGroupName(user.groupId)}</Badge>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{user.role === 'custom' ? 'Custom Protocol' : user.role}</span>
                            </div>
                        </td>
                        <td className="px-6 py-5">
                            {user.role === 'admin' ? <Badge className="bg-primary/5 text-primary border-none hover:bg-primary/10 rounded-full px-3 py-0.5 font-bold text-[9px] uppercase tracking-wider"><ShieldCheck className="h-3 w-3 mr-1.5" /> Full Access</Badge> : (
                            <div className="flex flex-wrap gap-1.5 max-w-md">{user.permissions && Object.entries(user.permissions).filter(([, v]) => v).length > 0 ? Object.entries(user.permissions).filter(([, v]) => v).slice(0, 4).map(([k]) => (<span key={k} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-bold uppercase border border-slate-200/50">{k.replace(/_/g, ' ')}</span>)) : <span className="text-xs text-slate-300 italic">No access clearance</span>}{user.permissions && Object.values(user.permissions).filter(v => v).length > 4 && <span className="text-[9px] text-slate-300 self-center">...</span>}</div>
                            )}
                        </td>
                        <td className="px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-1">
                            {!canEdit ? (
                                <div title={isTargetAdmin ? "Managed via System Configuration" : "Clearance Restricted"}>
                                    <Lock className="h-4 w-4 text-slate-200 cursor-not-allowed" />
                                </div>
                            ) : (
                                <>
                                <Button variant="ghost" size="icon" onClick={() => openEditModal(user)} className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg" aria-label={`Edit user ${user.username}`}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(user)} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label={`Delete user ${user.username}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </>
                            )}
                            </div>
                        </td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- EDIT MODAL (Access Control) --- */}
      {editModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
           <Card className="w-full max-w-2xl shadow-2xl border-0 max-h-[90vh] flex flex-col">
              <CardHeader className="bg-slate-50 border-b border-slate-100 shrink-0">
                 <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg">Access Control</CardTitle>
                        <CardDescription>Advanced settings for <span className="font-bold text-slate-900">{editingUser.username}</span></CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => setEditModalOpen(false)} aria-label="Close modal"><X className="h-5 w-5" /></Button>
                 </div>
              </CardHeader>
              
              <CardContent className="p-0 overflow-hidden flex-1 flex flex-col">
                 <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="flex-1 flex flex-col">
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
                             <label htmlFor="edit-password" className="text-xs font-bold text-slate-500 uppercase">Change Password</label>
                             <Input 
                               id="edit-password"
                               type="password" 
                               value={editPassword} 
                               onChange={(e) => setEditPassword(e.target.value)} 
                               autoComplete="new-password" 
                               name="new-password-field" 
                               placeholder="Set new password (optional)"
                             />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <label htmlFor="edit-group" className="text-xs font-bold text-slate-500 uppercase">Assigned Group</label>
                                <select id="edit-group" className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm" value={editGroup} onChange={(e) => setEditGroup(e.target.value)}>
                                   <option value="">-- Global / None --</option>
                                   {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                             </div>
                             <div className="space-y-1">
                                <label htmlFor="edit-role" className="text-xs font-bold text-slate-500 uppercase">Role Level</label>
                                <select id="edit-role" className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                                   {getAssignableRoles().map(r => (
                                       <option key={r.val} value={r.val}>{r.label}</option>
                                   ))}
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
                                         disabled={!canAssignPermission(action.id)} 
                                       />
                                       <label 
                                            htmlFor={`edit-${action.id}`} 
                                            className={`text-sm font-medium leading-none cursor-pointer ${canAssignPermission(action.id) ? 'text-slate-600' : 'text-slate-300 line-through'}`}
                                       >
                                            {action.label}
                                       </label>
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

              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 shrink-0 rounded-b-2xl">
                 <Button type="button" variant="outline" className="rounded-xl px-6" onClick={() => setEditModalOpen(false)}>Cancel</Button>
                 <Button type="submit" className="bg-primary hover:bg-primary/90 min-w-[140px] rounded-xl shadow-lg shadow-primary/20" disabled={isSaving}>
                    {isSaving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Updating...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" /> Update Clearance
                        </>
                    )}
                 </Button>
              </div>
              </form>
           </Card>
        </div>
      )}

    </div>
  );
}
