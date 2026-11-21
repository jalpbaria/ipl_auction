import { AlertTriangle, ArrowLeft, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface EnvErrorScreenProps {
  missingVars: string[];
  routeLabel?: string;
}

export function EnvErrorScreen({ missingVars, routeLabel }: EnvErrorScreenProps) {
  return (
    <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <Card brackets bracketTone="gold" className="p-8 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-[#F5B921]/40 bg-[#F5B921]/10 text-[#F5B921]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F5B921]">
                CONFIGURATION REQUIRED
              </p>
              <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-[#E8ECF4]">
                SUPABASE ENVIRONMENT VARIABLES MISSING
              </h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-[#8B95AA]">
            {routeLabel
              ? `The ${routeLabel} workspace requires a valid Supabase client connection. `
              : 'The Supabase client could not be initialized. '}
            Define the following environment variables in your local <code className="font-mono text-[#E8ECF4]">.env</code> file before launching multiplayer rooms or authentication:
          </p>

          <div className="mt-6 rounded-[4px] border border-white/10 bg-[#070B14] p-4">
            <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2.5">
              <Terminal className="h-3.5 w-3.5 text-[#22D3EE]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#8B95AA]">
                MISSING KEYS ({missingVars.length})
              </span>
            </div>
            <ul className="mt-3 space-y-2 font-mono text-xs">
              {missingVars.map((envKey) => (
                <li
                  key={envKey}
                  className="flex items-center justify-between rounded-[2px] border border-red-500/25 bg-red-500/5 px-3 py-2 text-red-300"
                >
                  <span>{envKey}</span>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-red-400">
                    NOT SET
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 rounded-[4px] border border-white/[0.08] bg-[#141C2F] p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#22D3EE]">
              EXPECTED .ENV FORMAT
            </p>
            <pre className="mt-2 overflow-x-auto font-mono text-xs leading-relaxed text-[#E8ECF4]">
{`VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"`}
            </pre>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
            <span className="font-mono text-xs uppercase tracking-[0.08em] text-[#8B95AA]">
              PHASE 1 LANDING REMAINS ACCESSIBLE
            </span>
            <Link to="/">
              <Button variant="cyan" size="md">
                <ArrowLeft className="h-4 w-4" />
                Back to Landing
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
