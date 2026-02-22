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
  where
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
  Trash2, 
  Loader2, 
  ShieldCheck,
  Lock,
  PlusCircle,
  Pencil,
  Save,
  X,
  Eye,
  EyeOff,
  HelpCircle,
  CheckCircle2,
  Copy,
  Users,
  Settings,
  List
} from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import Link from 'next/link';
import { PERMISSIONS, PERMISSION_GROUPS_UI, hasPermission } from '@/lib/permissions';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function UserManagementPage() {
  const { toast } = useToast();
  
  // 1. Auth & Session Management
  const { user: currentUser, loading: sessionLoading } = useSession(true);

  // 2. Local State
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // CREATE FORM STATE
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); 
  const [createGroup, setCreateGroup] = useState('');
  const [createRole, setCreateRole] = useState<'admin' | 'user'>('user');
  const [createPermissions, setCreatePermissions] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  // GROUP FORM STATE
  const [newGroupName, setNewGroupName] = useState('');

  // PRESET FORM STATE
  const [newPresetName, setNewPresetName] = useState('');
  const [presetPermissions, setPresetPermissions] = useState<Record<string, boolean>>({});
  const [isEditingPreset, setIsEditingPreset] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  // EDIT MODAL STATE
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editGroup, setEditGroup] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
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

      // Fetch Presets
      const presetSnap = await getDocs(collection(db, 'permission_presets'));
      setPresets(presetSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "Could not load data." });
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
        fetchData();
    }
  }, [currentUser]);

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
    
    // Self-management (limited) is handled by UI checks, but generally admins can manage themselves
    if (currentUser.username === targetUser.username) return true;

    // ⛔ Target is Admin
    if (targetUser.role === 'admin') {
        // Only an Admin can manage another Admin, BUT
        // Requirement: "Admins can't change each others passwords" & "Can't delete admins"
        // This function controls "Can I open the edit modal?".
        // We will restrict specific actions inside the modal.
        return currentUser.role === 'admin';
    }

    // 👑 Current User is Admin
    if (currentUser.role === 'admin') return true;

    // 👷 Current User is User with permissions
    if (hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.EDIT_USERS)) {
         // Cannot manage admins (handled above)
         return true;
    }

    return false;
  };

  const canCreateAdmin = () => {
      return currentUser?.role === 'admin';
  };

  // Check if the current user has the specific permission themselves
  const canAssignPermission = (permissionId: string) => {
      if (currentUser?.role === 'admin') return true;
      return currentUser?.permissions?.[permissionId] === true;
  };

  // Can current user change target user's password?
  const canChangePassword = (targetUser: any) => {
      if (currentUser.username === targetUser.username) return true; // Can change own? (Usually yes, but UI might be different)

      // Target is Admin: No one can change another admin's password
      if (targetUser.role === 'admin') return false;

      // I am Admin: I can change User's password
      if (currentUser.role === 'admin') return true;

      // I have permission: I can change User's password
      if (hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.CHANGE_PASSWORDS)) return true;

      return false;
  };

  const canDeleteUser = (targetUser: any) => {
      if (targetUser.role === 'admin') return false; // "Admins... only can be deleted form the database itself"
      if (currentUser.role === 'admin') return true;
      if (hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.DELETE_USERS)) return true;
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
    if (!hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_GROUPS)) {
        toast({ variant: "destructive", title: "Access Denied", description: "You cannot manage groups." });
        return;
    }
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
    if (!hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_GROUPS)) return;
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

  const applyPreset = (presetId: string) => {
      const preset = presets.find(p => p.id === presetId);
      if (preset && preset.permissions) {
          // Only apply permissions that the current user is allowed to grant
          const filteredPermissions: Record<string, boolean> = {};
          Object.entries(preset.permissions).forEach(([key, val]) => {
              if (val === true && canAssignPermission(key)) {
                  filteredPermissions[key] = true;
              }
          });
          setCreatePermissions(filteredPermissions);
          setSelectedPreset(presetId);
          toast({ title: "Preset Applied", description: `Applied permissions from ${preset.name}` });
      }
  };

  // PRESET MANAGEMENT
  const handleSavePreset = async () => {
      if (!newPresetName.trim()) return;
      if (!hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_PRESETS)) {
          toast({ variant: "destructive", title: "Access Denied", description: "You cannot manage presets." });
          return;
      }
      try {
          const docRef = await addDoc(collection(db, 'permission_presets'), {
              name: newPresetName.trim(),
              permissions: presetPermissions,
              createdBy: currentUser?.username,
              createdAt: new Date().toISOString()
          });
          setPresets([...presets, { id: docRef.id, name: newPresetName.trim(), permissions: presetPermissions }]);
          setNewPresetName('');
          setPresetPermissions({});
          toast({ title: "Preset Created", description: "New permission template created." });
      } catch(e) {
          toast({ variant: "destructive", title: "Error", description: "Failed to save preset." });
      }
  };

  const handleDeletePreset = async (id: string) => {
      if (!hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_PRESETS)) return;
      if(!confirm("Delete this preset?")) return;
      try {
          await deleteDoc(doc(db, 'permission_presets', id));
          setPresets(presets.filter(p => p.id !== id));
          toast({ title: "Deleted", description: "Preset removed." });
      } catch(e) { toast({ variant: "destructive", title: "Error" }); }
  };

  const nextStep = () => {
    if (wizardStep === 1) {
        if (!newUsername || !newPassword) {
            toast({ variant: "destructive", title: "Missing Information", description: "Please enter a username and password." });
            return;
        }
    }
    if (wizardStep === 2) {
        // If role is admin, skip permissions (implicitly all)
        if (createRole === 'admin') {
            setWizardStep(4);
            return;
        }
    }
    setWizardStep(prev => prev + 1);
  };

  const prevStep = () => {
    if (wizardStep === 4 && createRole === 'admin') {
        setWizardStep(2);
        return;
    }
    setWizardStep(prev => Math.max(1, prev - 1));
  };

  const handleCreateUser = async () => {
    if (!newUsername || !newPassword) return;

    // Security Check: Non-admins cannot create admins
    if (createRole === 'admin' && !canCreateAdmin()) {
        toast({ variant: "destructive", title: "Access Denied", description: "You cannot create Administrator accounts." });
        return;
    }

    setIsSubmitting(true);

    try {
      const cleanUsername = newUsername.toLowerCase().trim();
      const userRef = doc(db, 'users', cleanUsername);

      const newUser = {
        username: cleanUsername,
        password: newPassword, 
        role: createRole, 
        permissions: createRole === 'admin' ? {} : createPermissions,
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
      setCreatePermissions({});
      setWizardStep(1);
      
      toast({ title: "User Created", description: `${cleanUsername} ready.` });

    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Failed", description: "Could not save user." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (targetUser: any) => {
    if (!canDeleteUser(targetUser)) {
        toast({ variant: "destructive", title: "Permission Denied", description: "Cannot delete this user." });
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
    setEditRole(user.role === 'admin' ? 'admin' : 'user');
    setEditPermissions(user.permissions || {});
    setEditPassword(''); 
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    // Security Check: Prevent elevating to admin if not allowed
    if (editRole === 'admin' && editingUser.role !== 'admin' && !canCreateAdmin()) {
         toast({ variant: "destructive", title: "Access Denied", description: "You cannot promote users to Administrator." });
         return;
    }

    setIsSaving(true);

    try {
      const userRef = doc(db, 'users', editingUser.username);

      const updates: any = {
        role: editRole,
        groupId: editGroup || null,
        permissions: editRole === 'admin' ? {} : editPermissions
      };

      if (editPassword && editPassword.trim() !== '') {
          // Check if password change is allowed for this specific interaction
          if (canChangePassword(editingUser)) {
            updates.password = editPassword.trim();
          }
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

  // If user doesn't have view access (should be caught by Layout, but double check)
  if (!hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.VIEW)) {
      return <div className="p-10 text-center">Access Denied</div>;
  }

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
        {hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.CREATE_USERS) && (
        <div className="xl:col-span-1 space-y-8">
          <Card className="border-t-4 border-t-primary shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden min-h-[450px] flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">User Wizard</CardTitle>
                <Badge variant="secondary" className="bg-primary/5 text-primary text-[10px] font-bold">Step {wizardStep}/4</Badge>
              </div>
              <CardDescription>
                {wizardStep === 1 && "Secure the identity of the new member."}
                {wizardStep === 2 && "Assign location & system role."}
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
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">System Role</label>
                          <div className="grid grid-cols-2 gap-2">
                             <div
                                onClick={() => setCreateRole('user')}
                                className={`cursor-pointer border rounded-xl p-3 flex flex-col items-center justify-center gap-2 transition-all ${createRole === 'user' ? 'bg-primary/5 border-primary text-primary' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                             >
                                <div className="font-bold text-xs">Standard User</div>
                                <div className="text-[9px] text-center text-slate-400">Customizable access</div>
                             </div>

                             <div
                                onClick={() => canCreateAdmin() && setCreateRole('admin')}
                                className={`cursor-pointer border rounded-xl p-3 flex flex-col items-center justify-center gap-2 transition-all ${createRole === 'admin' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200'} ${!canCreateAdmin() ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-300'}`}
                             >
                                <div className="font-bold text-xs flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Administrator</div>
                                <div className="text-[9px] text-center text-slate-400">Full Access</div>
                             </div>
                          </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: GRANULAR PERMISSIONS */}
                {wizardStep === 3 && createRole === 'user' && (
                   <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-2 mb-2">
                         <Select value={selectedPreset} onValueChange={applyPreset}>
                            <SelectTrigger className="h-8 text-xs bg-white border-slate-200"><SelectValue placeholder="Load a Preset..." /></SelectTrigger>
                            <SelectContent>
                                {presets.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                         </Select>
                    </div>

                    <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-4">
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Access Controls</span>
                        </div>
                        <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                            {PERMISSION_GROUPS_UI.map((group) => (
                                <div key={group.category} className="mb-4 last:mb-0">
                                    <h5 className="text-[10px] font-bold text-slate-900 uppercase mb-2 border-b border-slate-200 pb-1">
                                      {group.category}
                                    </h5>
                                    <div className="grid grid-cols-1 gap-1.5 pl-2">
                                        {group.permissions.map((perm) => {
                                            const allowed = canAssignPermission(perm.id);
                                            return (
                                                <div key={perm.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`create-${perm.id}`}
                                                        checked={createPermissions[perm.id] || false}
                                                        onCheckedChange={() => togglePermission(perm.id, createPermissions, setCreatePermissions)}
                                                        disabled={!allowed}
                                                        className="h-3.5 w-3.5 border-slate-300"
                                                    />
                                                    <label
                                                        htmlFor={`create-${perm.id}`}
                                                        className={`text-[10px] font-medium cursor-pointer ${allowed ? 'text-slate-600' : 'text-slate-300 line-through'}`}
                                                    >
                                                        {perm.label}
                                                    </label>
                                                </div>
                                            )
                                        })}
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
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Confirm & Create
                      </>
                    )}
                  </Button>
                )}
              </div>
              </form>
            </CardContent>
          </Card>

          {/* GROUPS & PRESETS TABS */}
          <Card className="border-t-4 border-t-slate-400 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden min-h-[300px]">
            <CardContent className="p-0">
                <Tabs defaultValue="groups" className="w-full">
                    <TabsList className="w-full grid grid-cols-2 rounded-none p-0 h-12 bg-slate-50 border-b border-slate-100">
                        <TabsTrigger value="groups" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">Groups</TabsTrigger>
                        <TabsTrigger value="presets" className="rounded-none h-full data-[state=active]:bg-white data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">Permission Presets</TabsTrigger>
                    </TabsList>

                    <TabsContent value="groups" className="p-4 space-y-4">
                        <div className="flex gap-2">
                            <Input placeholder="New Group" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="h-9 text-xs rounded-xl" aria-label="New group name" disabled={!hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_GROUPS)} />
                            <Button size="sm" onClick={handleCreateGroup} className="h-9 w-9 p-0 rounded-xl" aria-label="Create group" disabled={!hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_GROUPS)}><PlusCircle className="h-4 w-4" /></Button>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                            {groups.map(g => (
                                <div key={g.id} className="flex justify-between items-center p-2 px-4 bg-slate-50/50 rounded-xl border border-slate-100 text-xs">
                                    <span className="font-bold text-slate-600">{g.name}</span>
                                    {hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_GROUPS) && (
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg" onClick={() => handleDeleteGroup(g.id)} aria-label={`Delete group ${g.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="presets" className="p-4 space-y-4">
                        <div className="flex flex-col gap-2">
                            <Input placeholder="New Preset Name" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} className="h-9 text-xs rounded-xl" />
                            <div className="max-h-[150px] overflow-y-auto border rounded-xl p-2 bg-slate-50 custom-scrollbar">
                                {PERMISSION_GROUPS_UI.map(group => (
                                    <div key={group.category} className="mb-2">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">{group.category}</p>
                                        <div className="grid grid-cols-1 gap-1">
                                            {group.permissions.map(perm => (
                                                <div key={perm.id} className="flex items-center gap-2">
                                                    <Checkbox
                                                        id={`preset-${perm.id}`}
                                                        checked={presetPermissions[perm.id] || false}
                                                        onCheckedChange={() => togglePermission(perm.id, presetPermissions, setPresetPermissions)}
                                                        className="h-3 w-3"
                                                    />
                                                    <label htmlFor={`preset-${perm.id}`} className="text-[10px] text-slate-600 cursor-pointer">{perm.label}</label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button size="sm" onClick={handleSavePreset} disabled={!newPresetName || !hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_PRESETS)} className="w-full h-9 rounded-xl text-xs"><Save className="h-3.5 w-3.5 mr-2" /> Save Preset</Button>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto pr-1 border-t pt-2">
                            {presets.map(p => (
                                <div key={p.id} className="flex justify-between items-center p-2 px-4 bg-slate-50/50 rounded-xl border border-slate-100 text-xs">
                                    <span className="font-bold text-slate-600">{p.name}</span>
                                    {hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.MANAGE_PRESETS) && (
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg" onClick={() => handleDeletePreset(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
          </Card>
        </div>
        )}

        {/* RIGHT COLUMN: USER LIST */}
        <Card className={`${hasPermission(currentUser, PERMISSIONS.USER_MANAGEMENT.CREATE_USERS) ? 'xl:col-span-2' : 'xl:col-span-3'} shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden border-slate-100 h-fit`}>
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
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{user.role}</span>
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
                                {canDeleteUser(user) && (
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(user)} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label={`Delete user ${user.username}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                                )}
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
              
              <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }} className="flex-1 flex flex-col overflow-hidden">
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
                          {canChangePassword(editingUser) && (
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
                          )}

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
                                <select
                                    id="edit-role"
                                    className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm"
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}
                                    disabled={!canCreateAdmin() && editingUser.role === 'admin'}
                                >
                                   <option value="user">Standard User</option>
                                   {canCreateAdmin() && <option value="admin">Administrator</option>}
                                </select>
                             </div>
                          </div>
                       </TabsContent>

                       <TabsContent value="permissions" className="mt-0">
                          <div className="space-y-5">
                             {PERMISSION_GROUPS_UI.map((group) => (
                               <div key={group.category} className="space-y-2 border-b border-slate-100 pb-3 last:border-0">
                                 <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">{group.category}</h4>
                                 <div className="grid grid-cols-2 gap-3 pl-2">
                                   {group.permissions.map((perm) => {
                                     const allowed = canAssignPermission(perm.id);
                                     return (
                                         <div key={perm.id} className="flex items-center space-x-2">
                                           <Checkbox
                                             id={`edit-${perm.id}`}
                                             checked={editPermissions[perm.id] || false}
                                             onCheckedChange={() => togglePermission(perm.id, editPermissions, setEditPermissions)}
                                             disabled={!allowed}
                                           />
                                           <label
                                                htmlFor={`edit-${perm.id}`}
                                                className={`text-sm font-medium leading-none cursor-pointer ${allowed ? 'text-slate-600' : 'text-slate-300 line-through'}`}
                                           >
                                                {perm.label}
                                           </label>
                                         </div>
                                     );
                                   })}
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
