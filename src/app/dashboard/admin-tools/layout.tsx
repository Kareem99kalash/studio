'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { Loader2, ShieldAlert } from 'lucide-react';
import { app } from '@/firebase'; 

export default function AdminToolsLayout({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const auth = getAuth(app);
  const db = getFirestore(app);

  useEffect(() => {
    // 1. Fast Check: LocalStorage
    const stored = localStorage.getItem('geo_user');
    let localUser = null;
    if (stored) {
      try { 
        localUser = JSON.parse(stored); 
        // 🛠️ FIX: Check role immediately from local storage (Case Insensitive)
        if (localUser.role && ['admin', 'manager'].includes(localUser.role.toLowerCase())) {
             setAuthorized(true);
             setLoading(false); // Allow immediate access while verifying
        }
      } catch (e) {}
    }

    // 2. Secure Check: Firestore
    const verifyAccess = async (uid: string) => {
      try {
        const docId = localUser?.username || uid; 
        if (!docId) return;

        const userDoc = await getDoc(doc(db, 'users', docId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // 🛠️ FIX: Normalize to lowercase
          const role = userData?.role?.toLowerCase(); 

          if (role === 'admin' || role === 'manager') {
            setAuthorized(true);
          } else {
            setAuthorized(false); // Revoke if DB says no
          }
        }
      } catch (e) {
        console.error("Auth Check Failed", e);
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) verifyAccess(user.uid);
      else if (localUser) verifyAccess(localUser.username);
      else {
          if (!authorized) router.push('/dashboard');
      }
    });

    return () => unsubscribe();
  }, [auth, db, router]);

  if (loading && !authorized) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin h-10 w-10 text-purple-600 mb-2" />
        <p className="text-slate-500 font-medium">Verifying Permissions...</p>
      </div>
    );
  }

  if (!authorized && !loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-red-50 p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md border border-red-100">
            <ShieldAlert className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
            <p className="text-slate-600 mt-2 mb-6">
                Restricted to <strong>Managers</strong> and <strong>Admins</strong>.
            </p>
            <button onClick={() => router.push('/dashboard')} className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold">
                Return to Dashboard
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-slate-900 text-white px-6 py-4 shadow-md flex justify-between items-center shrink-0 z-20">
        <div className="flex items-center gap-3">
            <span className="bg-purple-600 text-white px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase">Admin Mode</span> 
            <span className="font-bold text-lg tracking-tight">Logistics Command Center</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="max-w-7xl mx-auto">{children}</div>
      </div>
    </div>
  );
}
