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
    <div className="w-full max-w-[440px] bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden">
      <div className="p-12">
        <div className="flex flex-col items-center mb-10 space-y-4 text-center">
          <div className="h-16 w-16 bg-primary/5 text-primary rounded-2xl flex items-center justify-center">
            <MapPin className="h-8 w-8 fill-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-primary tracking-tight">GeoCoverage</h1>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-[0.1em] mt-1">Access Management Portal</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Account Identity</label>
            <Input 
              name="username"
              type="text" 
              placeholder="Username"
              className="h-12 bg-slate-50 border-slate-100 focus:bg-white focus:ring-primary/20 rounded-xl transition-all px-4"
              disabled={loading} 
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Secure Passcode</label>
            <Input 
              name="password"
              type="password" 
              placeholder="••••••••" 
              className="h-12 bg-slate-50 border-slate-100 focus:bg-white focus:ring-primary/20 rounded-xl transition-all px-4"
              disabled={loading} 
              required
            />
          </div>
          <Button 
            type="submit" 
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98] mt-4 group"
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <>Enter Dashboard <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></>}
          </Button>
        </form>
      </div>
    </div>
  );
}

// 🟢 2. SUSPENSE WRAPPER (Fixes Build Error)
export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50/50 p-4">
      {/* Suspense handles the useSearchParams hook during build */}
      <Suspense fallback={
        <div className="flex flex-col items-center gap-6">
           <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] animate-pulse">Verifying Security Protocols</p>
        </div>
      }>
        <LoginContent />
      </Suspense>
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
    </div>
  );
}
