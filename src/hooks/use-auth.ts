import { useSession } from '@/hooks/use-session';

export function useAuth(requireAuth = false) {
  // 1. Use the core session hook
  const { user, loading } = useSession(requireAuth);

  // 2. Return a clean object with default values
  return { 
    user, 
    role: user?.role || 'GUEST', // 🟢 Safely default to 'GUEST' if null
    loading,
    isAuthenticated: !!user
  };
}
