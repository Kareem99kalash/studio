'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Redirect if already logged in
  useEffect(() => {
    if (localStorage.getItem('geo_user')) {
      router.push('/dashboard');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({ variant: "destructive", title: "Missing Credentials", description: "Please enter both username and password." });
      return;
    }

    setLoading(true);

    try {
      // 1. Check User in Firestore
      const usersRef = collection(db, 'users');
      // Query by lowercase username for case-insensitive login
      const q = query(usersRef, where('username', '==', username.toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error("User not found.");
      }

      const userData = querySnapshot.docs[0].data();

      // 2. Simple Password Check (matches your existing logic)
      if (userData.password !== password) {
        throw new Error("Incorrect password.");
      }

      // 3. Success: Save Session & Redirect
      const sessionData = {
        uid: querySnapshot.docs[0].id,
        username: userData.username,
        role: userData.role,
        // Important: Save the groupId if it exists, so the dashboard knows which city to show
        roleGroup: userData.groupId || null
      };

      localStorage.setItem('geo_user', JSON.stringify(sessionData));
      
      toast({ 
        title: "Access Granted", 
        description: `Welcome back, ${userData.username}.`,
        className: "bg-green-600 text-white border-none"
      });

      // Force navigation
      window.location.href = '/dashboard';

    } catch (err: any) {
      toast({ 
        variant: "destructive", 
        title: "Authentication Failed", 
        description: "Invalid credentials or access denied." 
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FB] p-4">
      
      {/* LOGIN CARD */}
      <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        
        {/* Blue Top Accent Bar */}
        <div className="h-1.5 w-full bg-blue-600" />

        <div className="p-10">
          
          {/* HEADER SECTION */}
          <div className="flex flex-col items-center text-center mb-8 space-y-3">
            <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-2">
              <MapPin className="h-6 w-6 fill-current" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">GeoCoverage</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Secure Access Control
              </p>
            </div>
          </div>

          {/* FORM SECTION */}
          <form onSubmit={handleLogin} className="space-y-6">
            
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                Username
              </label>
              <div className="relative">
                <Input 
                  type="text" 
                  placeholder="Enter your assigned username" 
                  className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 transition-all pl-4 rounded-lg"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                Password
              </label>
              <div className="relative">
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  className="h-11 bg-slate-50 border-slate-200 focus:bg-white focus:border-blue-500 transition-all pl-4 rounded-lg"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] mt-2"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <>
                  Authenticate <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

          </form>

          {/* FOOTER SECTION */}
          <div className="mt-8 text-center">
            <p className="text-[11px] text-slate-400 italic">
              New accounts can only be created by System Administrators.
            </p>
          </div>

        </div>
      </div>

      {/* BACKGROUND DECORATION (Subtle Grid) */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" 
           style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
      </div>

    </div>
  );
}
