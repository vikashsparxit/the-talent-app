import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award } from 'lucide-react';

interface TopPerformer {
  id: string;
  name: string;
  email: string;
  assessmentTitle: string;
  percentage: number;
  completedAt: string;
}

export function TopPerformers() {
  const { data: performers = [], isLoading } = useQuery({
    queryKey: ['top-performers'],
    queryFn: async (): Promise<TopPerformer[]> => {
      const { data } = await supabase
        .from('candidate_assessments')
        .select(`
          id,
          percentage,
          completed_at,
          candidate:candidates(id, name, email),
          assessment:assessments(title)
        `)
        .in('status', ['completed', 'evaluated'])
        .not('percentage', 'is', null)
        .order('percentage', { ascending: false })
        .limit(5);

      if (!data) return [];

      return data
        .filter(ca => ca.candidate && ca.assessment)
        .map(ca => {
          const candidate = ca.candidate as { id: string; name: string; email: string };
          const assessment = ca.assessment as { title: string };
          return {
            id: ca.id,
            name: candidate.name,
            email: candidate.email,
            assessmentTitle: assessment.title,
            percentage: ca.percentage || 0,
            completedAt: ca.completed_at || '',
          };
        });
    },
    staleTime: 60000,
  });

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="h-5 w-5 flex items-center justify-center text-sm font-bold text-muted-foreground">#{index + 1}</span>;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Top Performers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
                <div className="h-6 w-12 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Top Performers
        </CardTitle>
      </CardHeader>
      <CardContent>
        {performers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No completed assessments yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {performers.map((performer, index) => (
              <div key={performer.id} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-6">
                  {getRankIcon(index)}
                </div>
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-sm">
                    {getInitials(performer.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{performer.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {performer.assessmentTitle}
                  </p>
                </div>
                <Badge 
                  variant={performer.percentage >= 80 ? 'default' : 'secondary'}
                  className={performer.percentage >= 80 ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  {Math.round(performer.percentage)}%
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
