import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isSupabaseConfigured, missingSupabaseEnvVars } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';
import { EnvErrorScreen } from '../EnvErrorScreen';
import { CornerBrackets } from '../ui/CornerBrackets';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function BrandedSessionLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6"
    >
      <div className="relative w-full max-w-sm rounded-[4px] border border-white/10 bg-[#0E1524] px-8 py-9 text-center">
        <CornerBrackets tone="gold" size="md" />
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#22D3EE]">
          AUCTION CORE
        </p>
        <p className="mt-2 font-display text-4xl tracking-[0.08em] text-[#E8ECF4]">
          IPL <span className="text-[#F5B921]">AUCTION</span>
        </p>
        <div className="mt-6 h-1 w-full overflow-hidden rounded-[2px] bg-[#070B14]">
          <div className="h-full w-1/2 animate-pulse bg-gradient-to-r from-[#22D3EE] to-[#F5B921]" />
        </div>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-[#8B95AA]">
          VERIFYING SESSION TELEMETRY...
        </p>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);

  if (!isSupabaseConfigured) {
    return (
      <EnvErrorScreen
        missingVars={missingSupabaseEnvVars}
        routeLabel={location.pathname}
      />
    );
  }

  if (loading) {
    return <BrandedSessionLoader />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
