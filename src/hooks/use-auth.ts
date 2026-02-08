import { useState, useEffect } from 'react';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Try to get the user from Local Storage (matches your Login logic)
    const stored = localStorage.getItem('geo_user');
    
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (e) {
        console.error("Auth Error", e);
      }
    }
    setLoading(false);
  }, []);

  return { 
    user, 
    role: user?.role || 'GUEST', // Default to GUEST if no role found
    loading 
  };
}
