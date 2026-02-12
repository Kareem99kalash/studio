'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { loginAction } from '@/app/actions/auth'; // 🟢 Import Server Action
import { getSafeRedirect } from '@/lib/security';

// 🟢 1. INTERNAL CONTENT COMPONENT
function LoginContent() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // 🟢 Handles the form submission using the Server Action
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);

    try {
      // Call the Server Action
      const result = await loginAction(formData);

      if (result.success) {
        toast({ 
          title: "Access Granted", 
          description: "Secure session established.",
          className: "bg-green-600 text-white border-none"
        });

        // Calculate safe redirect URL
        const nextParam = searchParams.get('next');
        const safeTarget = getSafeRedirect(nextParam, '/dashboard');

        // Force hard refresh to ensure cookies are picked up by the browser
        window.location.href = safeTarget;
      } else {
        toast({ 
          variant: "destructive", 
          title: "Login Failed", 
          description: result.message || "Invalid credentials." 
        });
        setLoading(false);
      }
    } catch (err) {
      console.error("Login Error:", err);
      toast({ variant: "destructive", title: "System Error", description: "Connection failed." });
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">Username</label>
            <Input 
              name="username" // 🟢 Crucial for Server Action
              type="text" 
              placeholder="username" 
              className="h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all pl-4 rounded-lg" 
              disabled={loading} 
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1">Password</label>
            <Input 
              name="password" // 🟢 Crucial for Server Action
              type="password" 
              placeholder="••••••••" 
              className="h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all pl-4 rounded-lg" 
              disabled={loading} 
              required
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

// 🟢 2. SUSPENSE WRAPPER (Fixes Build Error)
export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F8F9FB] p-4">
      {/* Suspense handles the useSearchParams hook during build */}
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
