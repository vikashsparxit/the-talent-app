import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, subMonths, format } from 'date-fns';

export interface AnalyticsData {
  totalCandidates: number;
  totalAssessments: number;
  completedAssessments: number;
  passRate: number;
  averageScore: number;
  monthlyTrends: MonthlyTrend[];
  assessmentPerformance: AssessmentPerformance[];
  statusDistribution: StatusDistribution[];
  scoreDistribution: ScoreDistribution[];
}

export interface MonthlyTrend {
  month: string;
  completed: number;
  passed: number;
  failed: number;
}

export interface AssessmentPerformance {
  name: string;
  totalAttempts: number;
  passRate: number;
  avgScore: number;
}

export interface StatusDistribution {
  status: string;
  count: number;
  fill: string;
}

export interface ScoreDistribution {
  range: string;
  count: number;
}

export function useAnalytics() {
  return useQuery({
    queryKey: ['analytics'],
    queryFn: async (): Promise<AnalyticsData> => {
      // Fetch all required data in parallel
      const [
        { data: candidates },
        { data: assessments },
        { data: candidateAssessments },
      ] = await Promise.all([
        supabase.from('candidates').select('id'),
        supabase.from('assessments').select('id, title'),
        supabase.from('candidate_assessments').select(`
          id,
          status,
          percentage,
          passed,
          completed_at,
          assessment:assessments(id, title)
        `),
      ]);

      const totalCandidates = candidates?.length || 0;
      const totalAssessments = assessments?.length || 0;
      
      const completedOrEvaluated = candidateAssessments?.filter(
        ca => ca.status === 'completed' || ca.status === 'evaluated'
      ) || [];
      
      const completedAssessments = completedOrEvaluated.length;
      
      const passedCount = completedOrEvaluated.filter(ca => ca.passed === true).length;
      const passRate = completedAssessments > 0 
        ? Math.round((passedCount / completedAssessments) * 100) 
        : 0;
      
      const scoresWithValues = completedOrEvaluated.filter(ca => ca.percentage !== null);
      const averageScore = scoresWithValues.length > 0
        ? Math.round(scoresWithValues.reduce((sum, ca) => sum + (ca.percentage || 0), 0) / scoresWithValues.length)
        : 0;

      // Monthly trends (last 6 months)
      const monthlyTrends: MonthlyTrend[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthEnd = startOfMonth(subMonths(new Date(), i - 1));
        const monthLabel = format(monthStart, 'MMM yyyy');
        
        const monthData = completedOrEvaluated.filter(ca => {
          if (!ca.completed_at) return false;
          const completedDate = new Date(ca.completed_at);
          return completedDate >= monthStart && completedDate < monthEnd;
        });
        
        monthlyTrends.push({
          month: monthLabel,
          completed: monthData.length,
          passed: monthData.filter(ca => ca.passed === true).length,
          failed: monthData.filter(ca => ca.passed === false).length,
        });
      }

      // Assessment performance
      const assessmentMap = new Map<string, { title: string; attempts: number; passed: number; totalScore: number }>();
      
      completedOrEvaluated.forEach(ca => {
        const assessment = ca.assessment as { id: string; title: string } | null;
        if (!assessment) return;
        
        const existing = assessmentMap.get(assessment.id) || {
          title: assessment.title,
          attempts: 0,
          passed: 0,
          totalScore: 0,
        };
        
        existing.attempts++;
        if (ca.passed === true) existing.passed++;
        existing.totalScore += ca.percentage || 0;
        
        assessmentMap.set(assessment.id, existing);
      });
      
      const assessmentPerformance: AssessmentPerformance[] = Array.from(assessmentMap.values())
        .map(a => ({
          name: a.title.length > 20 ? a.title.slice(0, 20) + '...' : a.title,
          totalAttempts: a.attempts,
          passRate: a.attempts > 0 ? Math.round((a.passed / a.attempts) * 100) : 0,
          avgScore: a.attempts > 0 ? Math.round(a.totalScore / a.attempts) : 0,
        }))
        .slice(0, 5);

      // Status distribution
      const statusCounts = {
        invited: 0,
        in_progress: 0,
        completed: 0,
        evaluated: 0,
        expired: 0,
      };
      
      candidateAssessments?.forEach(ca => {
        const status = ca.status as keyof typeof statusCounts;
        if (status in statusCounts) {
          statusCounts[status]++;
        }
      });
      
      const statusColors: Record<string, string> = {
        invited: 'hsl(var(--chart-1))',
        in_progress: 'hsl(var(--chart-2))',
        completed: 'hsl(var(--chart-3))',
        evaluated: 'hsl(var(--chart-4))',
        expired: 'hsl(var(--chart-5))',
      };
      
      const statusDistribution: StatusDistribution[] = Object.entries(statusCounts)
        .filter(([_, count]) => count > 0)
        .map(([status, count]) => ({
          status: status.replace('_', ' '),
          count,
          fill: statusColors[status] || 'hsl(var(--muted))',
        }));

      // Score distribution
      const scoreRanges = [
        { range: '0-20%', min: 0, max: 20 },
        { range: '21-40%', min: 21, max: 40 },
        { range: '41-60%', min: 41, max: 60 },
        { range: '61-80%', min: 61, max: 80 },
        { range: '81-100%', min: 81, max: 100 },
      ];
      
      const scoreDistribution: ScoreDistribution[] = scoreRanges.map(range => ({
        range: range.range,
        count: scoresWithValues.filter(
          ca => (ca.percentage || 0) >= range.min && (ca.percentage || 0) <= range.max
        ).length,
      }));

      return {
        totalCandidates,
        totalAssessments,
        completedAssessments,
        passRate,
        averageScore,
        monthlyTrends,
        assessmentPerformance,
        statusDistribution,
        scoreDistribution,
      };
    },
  });
}
