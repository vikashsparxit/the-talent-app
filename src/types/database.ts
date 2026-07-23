// Database types for the SparxIT Assessment System

export type AppRole = 'admin' | 'hr' | 'recruiter' | 'interviewer';

export type QuestionType = 'mcq' | 'coding' | 'subjective' | 'file_upload';

export interface QuestionFileConfig {
  allow_file: boolean;
  allow_link: boolean;
  allowed_mime_types: string[];
  max_file_bytes: number;
  max_files: number;
}

export type SkillCategory =
  | 'frontend' | 'backend' | 'database' | 'devops' | 'cloud'
  | 'mobile' | 'design' | 'testing' | 'data_science' | 'ai_ml'
  | 'security' | 'project_management' | 'soft_skills' | 'other';

export type SkillProficiency = 'beginner' | 'intermediate' | 'expert';

export interface StructuredSkill {
  name: string;
  category: SkillCategory;
  proficiency: SkillProficiency;
  confidence: number; // 0-1
  sources: ('resume_parse' | 'enrichment' | 'assessment' | 'manual' | 'certification')[];
}

export type AssessmentStatus = 'draft' | 'active' | 'archived';

export type CandidateAssessmentStatus = 'invited' | 'in_progress' | 'completed' | 'evaluated' | 'expired';

// Profile
export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// User Role
export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

// Assessment
export interface Assessment {
  id: string;
  title: string;
  description?: string;
  created_by?: string;
  duration_minutes: number;
  passing_score: number;
  status: AssessmentStatus;
  settings: AssessmentSettings;
  created_at: string;
  updated_at: string;
}

export interface AssessmentSettings {
  randomize_questions: boolean;
  show_score_immediately: boolean;
  allow_review: boolean;
}

// Assessment Section
export interface AssessmentSection {
  id: string;
  assessment_id: string;
  title: string;
  description?: string;
  order_index: number;
  weightage: number;
  skill_tags?: string[];
  created_at: string;
  updated_at: string;
}

// Question
export interface Question {
  id: string;
  section_id: string;
  type: QuestionType;
  question_text: string;
  options?: MCQOption[];
  correct_answer?: any;
  marks: number;
  order_index: number;
  coding_language?: string;
  coding_starter_code?: string;
  coding_test_cases?: CodingTestCase[];
  subjective_max_words?: number;
  subjective_rubric?: string;
  /** Present for file_upload questions; see QuestionFileConfig */
  file_config?: QuestionFileConfig | null;
  created_at: string;
  updated_at: string;
}

export interface MCQOption {
  id: string;
  text: string;
  is_correct?: boolean;
}

export interface CodingTestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

// Candidate
export interface Candidate {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  linkedin_url?: string;
  role_applied?: string;
  resume_url?: string;
  skills: string[];
  structured_skills?: StructuredSkill[];
  notes?: string;
  job_id?: string;
  created_by?: string;
  uploaded_by?: string | null;
  owner_name?: string | null;
  created_at: string;
  updated_at: string;
}

// Candidate Assessment (Assignment)
export interface CandidateAssessment {
  id: string;
  candidate_id: string;
  assessment_id: string;
  access_token: string;
  status: CandidateAssessmentStatus;
  invited_at: string;
  deadline?: string;
  started_at?: string;
  completed_at?: string;
  total_score?: number;
  percentage?: number;
  passed?: boolean;
  integrity_log: IntegrityEvent[];
  created_at: string;
  updated_at: string;
  // Joined data
  candidate?: Candidate;
  assessment?: Assessment;
}

export interface IntegrityEvent {
  type: 'tab_switch' | 'focus_lost' | 'fullscreen_exit';
  timestamp: string;
  duration_seconds?: number;
  /** Active question when the event occurred (forward-looking; older events omit these). */
  question_id?: string;
  /** 1-based index for display (e.g. Q3). */
  question_index?: number;
  section_title?: string;
}

// Candidate Response
export interface CandidateResponse {
  id: string;
  candidate_assessment_id: string;
  question_id: string;
  response?: any;
  auto_score?: number;
  manual_score?: number;
  final_score?: number;
  evaluated_by?: string;
  feedback?: string;
  evaluated_at?: string;
  time_spent_seconds?: number;
  created_at: string;
  updated_at: string;
  // Joined data
  question?: Question;
}

// Dashboard metrics
export interface DashboardMetrics {
  totalCandidates: number;
  activeAssessments: number;
  pendingEvaluations: number;
  averageScore: number;
}

// Assessment with sections and questions for builder
export interface AssessmentWithDetails extends Assessment {
  sections: (AssessmentSection & {
    questions: Question[];
  })[];
}

// Candidate assessment with all details for evaluation
export interface CandidateAssessmentWithDetails extends CandidateAssessment {
  candidate: Candidate;
  assessment: AssessmentWithDetails;
  responses: CandidateResponse[];
}
