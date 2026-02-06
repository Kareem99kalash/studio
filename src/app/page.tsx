'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MapPin, Loader2, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Prevent logged-in users from seeing the login page
  useEffect(() => {
    if (localStorage.getItem('geo_user')) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Fetch user directly by Document ID (Username)
      // This matches the creation logic in User Management
      const userRef = doc(db, 'users', username.toLowerCase());
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        toast({ 
          variant: "destructive", 
          title: "Login Failed", 
          description: "User not found. Accounts must be created by an Admin." 
        });
        setLoading(false);
        return;
      }

      const userData = userSnap.data();

      // 2. Validate Password (Matches the internal database field)
      if (userData.password === password) {
        // SUCCESS: Save session locally
        localStorage.setItem('geo_user', JSON.stringify({
          ...userData,
          uid: userSnap.id
        }));

        toast({ 
          title: "Access Granted", 
          description: `Welcome back, ${userData.username}!` 
        });
        
        // Force a hard redirect to refresh layout permissions
        window.location.href = '/dashboard';
      } else {
        toast({ 
          variant: "destructive", 
          title: "Login Failed", 
          description: "Incorrect password." 
        });
      }
    } catch (error: any) {
      console.error("Login Error:", error);
      toast({ 
        variant: "destructive", 
        title: "Connection Error", 
        description: "Could not connect to the database. Check Firebase Rules." 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-purple-600">
        <CardHeader className="text-center">
          <MapPin className="mx-auto h-12 w-12 text-purple-600 mb-2" />
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-800">
            GeoCoverage
          </CardTitle>
          <CardDescription className="uppercase text-[10px] font-bold tracking-widest text-slate-500">
            Secure Access Control
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 ml-1">USERNAME</label>
              <Input 
                placeholder="Enter your assigned username" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                required 
                className="bg-slate-50 border-slate-200 focus:ring-purple-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 ml-1">PASSWORD</label>
              <Input 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
                className="bg-slate-50 border-slate-200 focus:ring-purple-500"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-purple-600 hover:bg-purple-700 h-11 text-white font-bold transition-all shadow-md active:scale-[0.98] mt-2" 
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
              ) : (
                <><LogIn className="mr-2 h-4 w-4" /> Authenticate</>
              )}
            </Button>
            <p className="text-center text-[11px] text-slate-400 mt-4 italic">
              New accounts can only be created by System Administrators.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
