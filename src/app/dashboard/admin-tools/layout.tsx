'use client';

import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert, Lock } from 'lucide-react';
import { useSession } from '@/hooks/use-session'; // 🟢 Import the new hook

export default function AdminToolsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  
  // 1. Use the Session Hook
  // "true" means it will automatically redirect to / if no session exists at all.
  const { user, loading } = useSession(true);

  // 2. Loading State
  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin h-10 w-10 text-purple-600 mb-2" />
        <p className="text-slate-500 font-bold text-sm tracking-widest uppercase">Validating Credentials</p>
      </div>
    );
  }

  // 3. Role Verification
  // The user object comes from the cookie (via /api/auth/me)
  const role = user?.role?.toLowerCase();
  const isAuthorized = role === 'admin' || role === 'manager' || role === 'super_admin';

  // 4. Access Denied State (Logged in, but insufficient permissions)
  if (!isAuthorized) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-100 p-6 text-center">
        <div className="bg-white p-10 rounded-2xl shadow-2xl max-w-md border-t-4 border-t-red-500">
            <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Restricted Area</h1>
            <p className="text-slate-500 mt-3 mb-8 text-sm leading-relaxed">
                This sector is reserved for <strong>Admins & Managers</strong> only. Your current clearance level does not grant access.
            </p>
            <button 
              onClick={() => router.push('/dashboard')} 
              className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg"
            >
                Return to Command Center
            </button>
        </div>
      </div>
    );
  }

  // 5. Authorized View
  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
            <div className="bg-purple-600 p-1.5 rounded-md">
               <Lock className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 tracking-tight leading-none">Admin Utilities</h2>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Elevated Permissions Active</span>
            </div>
        </div>
        <div className="flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Secure Session</span>
        </div>
      </div>
      <div className="flex-1 p-6 md:p-10">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}