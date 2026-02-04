'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Key, Check, X, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export default function UserManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load users." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleUpdatePassword = async (username: string) => {
    if (!newPassword.trim()) return;
    try {
      const userRef = doc(db, 'users', username);
      await updateDoc(userRef, { password: newPassword });
      toast({ title: "Success", description: `Password updated for ${username}` });
      setEditingId(null);
      setNewPassword('');
      fetchUsers();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update password." });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      fetchUsers();
      toast({ title: "Deleted", description: "User removed." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete user." });
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center gap-2">
        <UserCog className="h-6 w-6 text-purple-600" />
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>System Users</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Password Management</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center">Loading users...</TableCell></TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="text-muted-foreground">{user.username}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'Admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {editingId === user.id ? (
                        <div className="flex items-center gap-2">
                          <Input 
                            type="text" 
                            placeholder="New password" 
                            className="h-8 text-xs w-32"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleUpdatePassword(user.id)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => { setEditingId(null); setNewPassword(''); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditingId(user.id)}>
                          <Key className="mr-2 h-3 w-3" /> Change Password
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)} className="hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
