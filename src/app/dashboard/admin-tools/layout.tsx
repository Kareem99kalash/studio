'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { Loader2, ShieldAlert, Lock } from 'lucide-react';
import { app } from '@/firebase'; 

export default function AdminToolsLayout({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const auth = getAuth(app);
  const db = getFirestore(app);

  useEffect(() => {
    // 1. Initial Check: LocalStorage (Fast UI feedback)
    const stored = localStorage.getItem('geo_user');
    let localUser = null;

    if (stored) {
      try { 
        localUser = JSON.parse(stored); 
        // 🛡️ REVERTED: Only allow 'admin' role. Managers are now restricted.
        const role = localUser.role ? localUser.role.toLowerCase() : '';
        if (role === 'admin') {
          setAuthorized(true);
          // We don't set loading to false here; we wait for the DB to confirm
        }
      } catch (e) {
        console.error("Local session corrupt");
      }
    }

    // 2. Secure Verification: Firestore (Single Source of Truth)
    const verifyAccess = async (uid: string) => {
      try {
        // Use username if using document-id login, otherwise use uid
        const docId = localUser?.username || uid; 
        if (!docId) {
          setLoading(false);
          return;
        }

        const userDoc = await getDoc(doc(db, 'users', docId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // 🛡️ STANDARDIZED: Role must be lowercase 'admin'
          const role = userData?.role?.toLowerCase(); 

          if (role === 'admin') {
            setAuthorized(true);
          } else {
            setAuthorized(false); // Immediate revoke if DB role changed
          }
        } else {
          setAuthorized(false);
        }
      } catch (e) {
        console.error("Permission Verification Failed", e);
        setAuthorized(false);
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        verifyAccess(user.uid);
      } else if (localUser?.username) {
        verifyAccess(localUser.username);
      } else {
        setLoading(false);
        if (!authorized) router.push('/dashboard');
      }
    });

    return () => unsubscribe();
  }, [auth, db, router, authorized]);

  // Loading State
  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin h-10 w-10 text-purple-600 mb-2" />
        <p className="text-slate-500 font-bold text-sm tracking-widest uppercase">Validating Credentials</p>
      </div>
    );
  }

  // Access Denied State (For Managers or Agents)
  if (!authorized) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-100 p-6 text-center">
        <div className="bg-white p-10 rounded-2xl shadow-2xl max-w-md border-t-4 border-t-red-500">
            <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Restricted Area</h1>
            <p className="text-slate-500 mt-3 mb-8 text-sm leading-relaxed">
                This sector is reserved for <strong>System Administrators</strong> only. Your current clearance level does not grant access.
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

  // Authorized Admin View
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
