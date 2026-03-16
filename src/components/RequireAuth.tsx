import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Spinner } from '@/components/ui/Spinner';
import type { ReactNode } from 'react';

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Route guard that redirects unauthenticated users to /signin.
 * If Supabase is not configured (offline-only mode), allows access.
 */
export default function RequireAuth({ children }: RequireAuthProps) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const location = useLocation();

  // Offline-only mode: no auth system, allow access
  if (!isSupabaseConfigured()) {
    return <>{children}</>;
  }

  // Auth still initializing — show minimal spinner (avoids flash of redirect)
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  // Not authenticated — redirect to sign in, preserving intended destination
  if (!user) {
    return <Navigate to="/signin" state={{ returnTo: location.pathname }} replace />;
  }

  return <>{children}</>;
}
