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

  const [formData, setFormData] = useState({
    username: '',
    password: '', // New Field
    name: '',
    role: 'Agent',
    allowedCities: ''
  });

  const fetchUsers = async () => {
    setIsLoading(true);
    const snap = await getDocs(collection(db, 'users'));
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setIsLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAddUser = async () => {
    // Simple Validation
    if (!formData.username || !formData.password || !formData.name) {
        toast({ variant: "destructive", title: "Error", description: "Username, Password and Name are required." });
        return;
    }

    setIsSubmitting(true);
    try {
      // Create User in Firestore (Using Username as ID)
      await setDoc(doc(db, 'users', formData.username), {
        username: formData.username,
        password: formData.password, // Storing password (In production, you'd hash this!)
        name: formData.name,
        role: formData.role,
        allowedCities: formData.allowedCities ? formData.allowedCities.split(',').map(c => c.trim()) : [],
        createdAt: new Date().toISOString()
      });
      
      setIsOpen(false);
      fetchUsers();
      setFormData({ username: '', password: '', name: '', role: 'Agent', allowedCities: '' });
      toast({ title: "Success", description: "User created." });

    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to create user." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete user?')) return;
    await deleteDoc(doc(db, 'users', id));
    fetchUsers();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">User Management</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild><Button><UserPlus className="mr-2 h-4 w-4"/> Add User</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <Input placeholder="Username (e.g. agent1)" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
              <Input type="password" placeholder="Password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              <Input placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                  <Select value={formData.role} onValueChange={v => setFormData({...formData, role: v})}>
                    <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                    <SelectContent><SelectItem value="Admin">Admin</SelectItem><SelectItem value="Agent">Agent</SelectItem></SelectContent>
                  </Select>
                  <Input placeholder="Cities (e.g. Erbil, Duhok)" value={formData.allowedCities} onChange={e => setFormData({...formData, allowedCities: e.target.value})} />
              </div>
              <Button onClick={handleAddUser} className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Username</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Password</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">••••••</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)}><Trash2 className="h-4 w-4 text-red-500"/></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
