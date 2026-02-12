'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { createSystemUser } from '@/app/actions/user-management'; // 🟢 Import Server Action

export function CreateUserForm() {
  const [formData, setFormData] = useState({ username: '', password: '', role: 'user' });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.password) return;

    setLoading(true);

    try {
      // 1. Get Current Admin ID (The Requester)
      const stored = localStorage.getItem('geo_user');
      if (!stored) throw new Error("Session expired. Please login again.");
      const currentUser = JSON.parse(stored);

      // 2. Call Server Action
      // We pass 'currentUser.uid' so the server can verify US before creating the NEW user.
      const result = await createSystemUser(currentUser.uid, {
        username: formData.username,
        password: formData.password,
        role: formData.role as 'admin' | 'user' | 'driver'
      });

      if (result.success) {
        toast({ title: "Success", description: result.message, className: "bg-green-600 text-white" });
        setFormData({ username: '', password: '', role: 'user' }); // Reset
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message });
      }

    } catch (err: any) {
      toast({ variant: "destructive", title: "Action Failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-t-4 border-t-indigo-600 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-indigo-600"/> Create System User
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-slate-500">Username</label>
              <Input 
                value={formData.username} 
                onChange={e => setFormData({...formData, username: e.target.value})} 
                placeholder="new_admin_name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-slate-500">Role</label>
              <Select 
                value={formData.role} 
                onValueChange={v => setFormData({...formData, role: v})}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Standard User</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="admin" className="font-bold text-indigo-600">
                    <span className="flex items-center gap-2"><ShieldCheck className="h-3 w-3"/> Administrator</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-slate-500">Password</label>
            <Input 
              type="password"
              value={formData.password} 
              onChange={e => setFormData({...formData, password: e.target.value})} 
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-indigo-900 hover:bg-indigo-800">
            {loading ? <Loader2 className="animate-spin h-4 w-4" /> : "Create Account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}