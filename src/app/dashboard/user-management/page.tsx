'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '@/firebase';
import { logAction } from '@/lib/logging'; 
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, UserCog, Search, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function UserManagementPage() {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('geo_user');
    if (stored) {
      setCurrentUser(JSON.parse(stored));
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const userSnap = await getDocs(collection(db, 'users'));
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast({ variant: "destructive", title: "Load Error", description: "Could not fetch user list." });
    } finally {
      setLoading(false);
    }
  };

  const currentUserRole = (currentUser?.role || '').toLowerCase();
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'super_admin';
  const isSuperAdmin = currentUserRole === 'super_admin';

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      await logAction(currentUser.username, "UPDATE_ROLE", `Set role for ${userId} to ${newRole}`);
      toast({ title: "Role Updated", description: "User permissions have been changed." });
      fetchData();
    } catch (e) {
      toast({ variant: "destructive", title: "Update Failed" });
    }
  };

  const handleDelete = async (userToDelete: any) => {
    if (!isAdmin) return;
    // Super Admins cannot be deleted by anyone, including other Super Admins
    if ((userToDelete.role || '').toLowerCase() === 'super_admin') {
      toast({ variant: "destructive", title: "Action Not Allowed", description: "Super Admin accounts cannot be deleted." });
      return;
    }
    if (!confirm(`Are you sure you want to delete the user "${userToDelete.username}"? This only removes their profile, not their login.`)) return;
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      await logAction(currentUser.username, "DELETE_USER", `Deleted user account: ${userToDelete.username}`);
      toast({ title: "User Deleted" });
      fetchData();
    } catch (e) {
      toast({ variant: "destructive", title: "Error deleting user" });
    }
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" /> User Access Control</CardTitle>
              <CardDescription>Manage roles and permissions for all registered users.</CardDescription>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by name or username..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={4} className="text-center py-10">Loading...</TableCell></TableRow>}
              {!loading && filteredUsers.map((user) => {
                const userRoleLower = (user.role || '').toLowerCase();
                const canBeModified = userRoleLower !== 'super_admin';

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-bold">{user.name}</div>
                      <div className="text-xs text-muted-foreground">@{user.username}</div>
                    </TableCell>
                    <TableCell>
                      {isAdmin && canBeModified ? (
                        <Select value={user.role} onValueChange={(val) => handleRoleChange(user.id, val)}>
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Agent">Agent</SelectItem>
                            <SelectItem value="Manager">Manager</SelectItem>
                            {isSuperAdmin && <SelectItem value="Admin">Admin</SelectItem>}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={userRoleLower === 'super_admin' || userRoleLower === 'admin' ? 'default' : 'secondary'}>
                           {userRoleLower === 'super_admin' && <ShieldCheck className="h-3 w-3 mr-1.5"/>}
                           {user.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin && canBeModified && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(user)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
