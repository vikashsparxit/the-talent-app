import { CandidateAssessmentStatus } from './database';

export type AssessmentStatus = CandidateAssessmentStatus;

export interface CandidateWithAssessment {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role_applied: string | null;
  skills: string[];
  notes: string | null;
  created_at: string;
  // Assessment data
  assessment_id?: string;
  assessment_title?: string;
  assessment_status?: CandidateAssessmentStatus;
  percentage?: number | null;
  passed?: boolean | null;
  invited_at?: string;
  completed_at?: string | null;
  deadline?: string | null;
}

export interface DashboardMetrics {
  totalCandidates: number;
  activeAssessments: number;
  pendingEvaluations: number;
  averageScore: number;
}

export type FilterOption = 'all' | CandidateAssessmentStatus;
