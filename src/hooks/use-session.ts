'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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