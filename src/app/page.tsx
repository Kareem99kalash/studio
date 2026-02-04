'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-redirect to dashboard if a session is already found
  useEffect(() => {
    if (localStorage.getItem('geo_user')) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const q = query(
        collection(db, 'users'), 
        where('username', '==', username), 
        where('password', '==', password)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        toast({ variant: "destructive", title: "Login Failed", description: "Invalid username or password." });
        setLoading(false);
        return;
      }

      // Save user data (including role) for RBAC
      localStorage.setItem('geo_user', JSON.stringify(snap.docs[0].data()));
      
      // Force a hard redirect to the dashboard to refresh the layout
      window.location.href = '/dashboard';

    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Connection failed." });
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-purple-600">
        <CardHeader className="text-center">
          <MapPin className="mx-auto h-12 w-12 text-purple-600 mb-2" />
          <CardTitle className="text-2xl font-bold tracking-tight">GeoCoverage Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input 
              placeholder="Username" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              required 
            />
            <Input 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 mt-2" disabled={loading}>
              {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}