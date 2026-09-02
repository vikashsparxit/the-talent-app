import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart2 } from 'lucide-react';
import { candidateSourceLabel, candidateSourceStyle, normalizeCandidateSourceKey } from '@/lib/candidateSources';

interface SourceCount {
  label: string;
  count: number;
  color: string;
  bg: string;
}

export function SourceBreakdown() {
  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['source-breakdown'],
    staleTime: 120_000,
    queryFn: async (): Promise<SourceCount[]> => {
      const { data } = await supabase.from('candidates').select('source');
      const map: Record<string, number> = {};
      (data || []).forEach(c => {
        const key = normalizeCandidateSourceKey(c.source);
        map[key] = (map[key] || 0) + 1;
      });
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => {
          const cfg = candidateSourceStyle(key);
          return {
            label: candidateSourceLabel(key),
            count,
            color: cfg.color,
            bg: cfg.bg,
          };
        });
    },
  });

  const total = sources.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <Card className="surface-card border-0 flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          <BarChart2 className="h-4 w-4" />
          Candidate Sources
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 pb-4">
        {isLoading ? (
          <div className="space-y-2 px-6">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 rounded-lg" />)}
          </div>
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-6">No source data yet</p>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-4 space-y-1.5">
              {sources.map((s, i) => {
                const pct = Math.round((s.count / total) * 100);
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                    {/* Color dot */}
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.color}`} />
                    {/* Label */}
                    <span className="text-sm text-foreground font-medium w-32 shrink-0 truncate">{s.label}</span>
                    {/* Bar */}
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.color} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* Count + pct */}
                    <div className="flex items-baseline gap-1.5 shrink-0 text-right">
                      <span className="text-sm font-bold">{s.count.toLocaleString()}</span>
                      <span className="text-[11px] text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
