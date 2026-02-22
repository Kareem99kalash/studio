'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/firebase';
import { signInWithCustomToken } from 'firebase/auth';

export function useSession(requireAuth = true) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();

          // 🟢 CRITICAL: Sync Firebase Client SDK Auth
          // If we have a custom token and the client SDK is not signed in
          // (or signed in as someone else), sign in now.
          if (data.customToken) {
             const currentUser = auth.currentUser;
             if (!currentUser || currentUser.uid !== data.user.uid) {
                try {
                  await signInWithCustomToken(auth, data.customToken);
                } catch (err) {
                  console.error("useSession: Client Auth Sync Failed", err);
                }
             }
          }

          setUser(data.user);
        } else if (requireAuth) {
          // If auth is required but session is dead, redirect
          window.location.href = '/'; 
        }
      } catch (e) {
        if (requireAuth) window.location.href = '/';
      } finally {
        setLoading(false);
      }
    };
    
    checkSession();
  }, [requireAuth, router]);

  return { user, loading, isAuthenticated: !!user };
}