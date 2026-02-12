'use client';

import { useState, useEffect, Suspense } from 'react'; // 🟢 Added Suspense
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/logger'; 
import { getSafeRedirect } from '@/lib/security';

// 🟢 1. RENAME your main logic component to "LoginContent" (Internal)
function LoginContent() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams(); 
  const { toast } = useToast();

  useEffect(() => {
    // Check if already logged in
    const stored = localStorage.getItem('geo_user');
    if (stored) {
      const nextParam = searchParams.get('next');
      const safeTarget = getSafeRedirect(nextParam, '/dashboard');
      router.push(safeTarget);
    }
  }, [router, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);

    try {
      const cleanUser = username.toLowerCase().trim();
      const userRef = doc(db, 'users', cleanUser);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error("User not found.");
      }

      const userData = userSnap.data();

      if (userData.password !== password) {
        throw new Error("Incorrect password.");
      }

      const sessionData = {
        uid: cleanUser,
        username: userData.username,
        role: userData.role,
        permissions: userData.permissions || {},
        roleGroup: userData.groupId || null
      };

      await logActivity(
        userData.username, 
        'User Login', 
        'Successful login session started.'
      );

      localStorage.setItem('geo_user', JSON.stringify(sessionData));
      
      toast({ 
        title: "Access Granted", 
        description: `Welcome, ${userData.username}`,
        className: "bg-green-600 text-white border-none"
      });

      const nextParam = searchParams.get('next');
      const safeTarget = getSafeRedirect(nextParam, '/dashboard');

      window.location.href = safeTarget;

    } catch (err: any) {
      console.error(err);
      toast({ 
        variant: "destructive", 
        title: "Login Failed", 
        description: "Invalid credentials or account issue." 
      });
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
      <div className="h-1.5 w-full bg-blue-600" />
      <div className="p-10">
        <div className="flex flex-col items-center text-center mb-8 space-y-3">
          <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-2">
            <MapPin className="h-6 w-6 fill-current" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">GeoCoverage</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Simple Access Control</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">Username</label>
            <Input 
              type="text" 
              placeholder="username" 
              className="h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all pl-4 rounded-lg" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              disabled={loading} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">Password</label>
            <Input 
              type="password" 
              placeholder="••••••••" 
              className="h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all pl-4 rounded-lg" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              disabled={loading} 
            />
          </div>
          <Button 
            type="submit" 
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] mt-2" 
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <>Authenticate <ArrowRight className="ml-2 h-4 w-4" /></>}
          </Button>
        </form>
      </div>
    </div>
  );
}

// 🟢 2. EXPORT THE WRAPPER (This fixes the build error)
export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FB] p-4">
      {/* Suspense boundary handles the useSearchParams hook during build */}
      <Suspense fallback={
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
           <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Loading Secure Gateway...</p>
        </div>
      }>
        <LoginContent />
      </Suspense>
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
    </div>
  );
}
