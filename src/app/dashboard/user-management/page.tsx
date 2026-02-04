'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, UserPlus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  // Form Data
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    role: 'Agent',
    allowedCities: ''
  });

  // --- 1. FETCH USERS ---
  const fetchUsers = async () => {
    setIsLoading(true);
    try {
        const snap = await getDocs(collection(db, 'users'));
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
        console.error("Error fetching users:", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  // --- 2. ADD USER ---
  const handleAddUser = async () => {
    if (!formData.username || !formData.name) {
        toast({ variant: "destructive", title: "Missing Fields", description: "Username and Name are required." });
        return;
    }

    setIsSubmitting(true);
    try {
      // Create user document using Username as ID
      await setDoc(doc(db, 'users', formData.username), {
        username: formData.username,
        name: formData.name,
        role: formData.role,
        // Convert "Erbil, Duhok" string into Array ["Erbil", "Duhok"]
        allowedCities: formData.allowedCities ? formData.allowedCities.split(',').map(c => c.trim()) : [], 
        createdAt: new Date().toISOString()
      });
      
      setIsOpen(false);
      fetchUsers(); // Refresh table
      setFormData({ username: '', name: '', role: 'Agent', allowedCities: '' });
      toast({ title: "Success", description: "User created successfully." });

    } catch (e) {
      console.error("Error adding user:", e);
      toast({ variant: "destructive", title: "Error", description: "Failed to create user." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- 3. DELETE USER ---
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        await deleteDoc(doc(db, 'users', id));
        fetchUsers();
        toast({ title: "Deleted", description: "User removed." });
    } catch (e) {
        console.error("Delete error:", e);
        toast({ variant: "destructive", title: "Error", description: "Could not delete user." });
    }
  };

  return (
    <div className="p-6 space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground text-sm">Manage access and permissions.</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild><Button><UserPlus className="mr-2 h-4 w-4"/> Add User</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Username (ID)</label>
                  <Input placeholder="e.g. agent_ali" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
              </div>
              
              <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Full Name</label>
                  <Input placeholder="e.g. Ali Ahmed" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-muted-foreground">Role</label>
                      <Select value={formData.role} onValueChange={v => setFormData({...formData, role: v})}>
                        <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Admin">Admin</SelectItem>
                          <SelectItem value="Agent">Agent</SelectItem>
                        </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase text-muted-foreground">Cities</label>
                      <Input placeholder="Erbil, Duhok" value={formData.allowedCities} onChange={e => setFormData({...formData, allowedCities: e.target.value})} />
                  </div>
              </div>

              <Button onClick={handleAddUser} className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSubmitting ? "Saving..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardHeader className="pb-2"><CardTitle className="text-lg">System Users</CardTitle></CardHeader>
        <CardContent className="flex-1 overflow-auto p-0">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Allowed Cities</TableHead>
                <TableHead className="text-right px-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24">Loading users...</TableCell></TableRow>
              ) : users.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No users found.</TableCell></TableRow>
              ) : (
               users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                      }`}>
                          {user.role}
                      </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                      {Array.isArray(user.allowedCities) ? user.allowedCities.join(', ') : user.allowedCities}
                  </TableCell>
                  <TableCell className="text-right px-4">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(user.id)}>
                        <Trash2 className="h-4 w-4"/>
                    </Button>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
