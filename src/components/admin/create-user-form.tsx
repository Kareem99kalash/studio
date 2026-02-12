'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { createSystemUser } from '@/app/actions/user-management'; // 🟢 Import Server Action
import { useSession } from '@/hooks/use-session'; // 🟢 Import Hook properly at the top

export function CreateUserForm() {
  const [formData, setFormData] = useState({ username: '', password: '', role: 'user' });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  // 🟢 Get current admin session
  const { user: currentUser } = useSession(); 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      toast({ variant: "destructive", title: "Missing Data", description: "Username and password are required." });
      return;
    }

    setLoading(true);

    try {
      // 🟢 1. Call the Server Action
      // We pass the current admin's ID (currentUser.uid) to log who created this new user
      const result = await createSystemUser(formData, currentUser?.uid || 'system');

      // 🟢 2. Handle Response
      if (result.success) {
        toast({ 
          title: "Success", 
          description: result.message, 
          className: "bg-green-600 text-white border-none" 
        });
        setFormData({ username: '', password: '', role: 'user' }); // Reset form
      } else {
        toast({ 
          variant: "destructive", 
          title: "Creation Failed", 
          description: result.message 
        });
      }

    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "System Error", description: "Connection failed." });
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
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-slate-500">Role</label>
              <Select 
                value={formData.role} 
                onValueChange={v => setFormData({...formData, role: v})}
                disabled={loading}
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
              disabled={loading}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-indigo-900 hover:bg-indigo-800">
            {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
            {loading ? "Creating..." : "Create Account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
