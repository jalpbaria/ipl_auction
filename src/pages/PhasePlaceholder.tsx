import { ArrowLeft, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EnvErrorScreen } from '../components/EnvErrorScreen';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { isSupabaseConfigured, missingSupabaseEnvVars } from '../lib/supabase';

interface PhasePlaceholderProps {
  routePath: string;
  title: string;
  description: string;
}

export default function PhasePlaceholder({
  routePath,
  title,
  description,
}: PhasePlaceholderProps) {
  if (!isSupabaseConfigured) {
    return (
      <EnvErrorScreen
        missingVars={missingSupabaseEnvVars}
        routeLabel={`${title} (${routePath})`}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#070B14] text-[#E8ECF4] broadcast-grid flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <Card brackets bracketTone="cyan" className="p-8 sm:p-10">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
            <Badge tone="cyan">ROUTE {routePath}</Badge>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#F5B921]">
              <Clock className="h-3.5 w-3.5" />
              PHASE 2
            </span>
          </div>

          <h1 className="mt-6 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
            {title}
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-[#22D3EE]">
            COMING IN THE NEXT PHASE
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[#8B95AA]">{description}</p>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#8B95AA]">
              IPL AUCTION // PHASE 1 SCAFFOLD
            </span>
            <Link to="/">
              <Button variant="outline" size="sm">
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
