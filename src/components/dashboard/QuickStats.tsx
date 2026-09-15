import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Target
} from 'lucide-react';

interface QuickStatsData {
  thisWeekCompleted: number;
  lastWeekCompleted: number;
  thisWeekPassed: number;
  thisWeekFailed: number;
  pendingReview: number;
  expiringSoon: number;
  avgCompletionTime: number;
}

export function QuickStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['quick-stats'],
    queryFn: async (): Promise<QuickStatsData> => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      // Get completed assessments this week
      const { data: thisWeekData } = await supabase
        .from('candidate_assessments')
        .select('passed, started_at, completed_at')
        .gte('completed_at', weekAgo.toISOString())
        .in('status', ['completed', 'evaluated']);

      // Get completed assessments last week
      const { data: lastWeekData } = await supabase
        .from('candidate_assessments')
        .select('id')
        .gte('completed_at', twoWeeksAgo.toISOString())
        .lt('completed_at', weekAgo.toISOString())
        .in('status', ['completed', 'evaluated']);

      // Get pending review count
      const { count: pendingReview } = await supabase
        .from('candidate_assessments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      // Get expiring soon (deadline within 3 days)
      const { count: expiringSoon } = await supabase
        .from('candidate_assessments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'invited')
        .lte('deadline', threeDaysFromNow.toISOString())
        .gte('deadline', now.toISOString());

      // Calculate average completion time
      let avgCompletionTime = 0;
      if (thisWeekData && thisWeekData.length > 0) {
        const completionTimes = thisWeekData
          .filter(ca => ca.started_at && ca.completed_at)
          .map(ca => {
            const start = new Date(ca.started_at!).getTime();
            const end = new Date(ca.completed_at!).getTime();
            return (end - start) / (1000 * 60); // minutes
          });
        
        if (completionTimes.length > 0) {
          avgCompletionTime = Math.round(
            completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
          );
        }
      }

      const thisWeekCompleted = thisWeekData?.length || 0;
      const thisWeekPassed = thisWeekData?.filter(ca => ca.passed === true).length || 0;
      const thisWeekFailed = thisWeekData?.filter(ca => ca.passed === false).length || 0;

      return {
        thisWeekCompleted,
        lastWeekCompleted: lastWeekData?.length || 0,
        thisWeekPassed,
        thisWeekFailed,
        pendingReview: pendingReview || 0,
        expiringSoon: expiringSoon || 0,
        avgCompletionTime,
      };
    },
    staleTime: 60000,
  });

  if (isLoading || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            This Week's Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const weekOverWeekChange = stats.lastWeekCompleted > 0
    ? Math.round(((stats.thisWeekCompleted - stats.lastWeekCompleted) / stats.lastWeekCompleted) * 100)
    : stats.thisWeekCompleted > 0 ? 100 : 0;

  const passRate = stats.thisWeekCompleted > 0
    ? Math.round((stats.thisWeekPassed / stats.thisWeekCompleted) * 100)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          This Week's Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Completions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Assessments Completed</span>
            <div className="flex items-center gap-1">
              {weekOverWeekChange >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${weekOverWeekChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {weekOverWeekChange >= 0 ? '+' : ''}{weekOverWeekChange}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold">{stats.thisWeekCompleted}</span>
            <span className="text-sm text-muted-foreground">vs {stats.lastWeekCompleted} last week</span>
          </div>
        </div>

        {/* Pass Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Pass Rate</span>
            <span className="text-sm font-medium">{passRate}%</span>
          </div>
          <Progress value={passRate} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              {stats.thisWeekPassed} passed
            </span>
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-red-500" />
              {stats.thisWeekFailed} failed
            </span>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-amber-600">{stats.pendingReview}</div>
            <div className="text-xs text-muted-foreground">Pending Review</div>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{stats.expiringSoon}</div>
            <div className="text-xs text-muted-foreground">Expiring in 3 days</div>
          </div>
        </div>

        {/* Average Completion Time */}
        {stats.avgCompletionTime > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Avg. Completion Time</span>
              <span className="text-sm font-medium">{stats.avgCompletionTime} min</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
