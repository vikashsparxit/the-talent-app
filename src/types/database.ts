// Database types for The Talent App

export type AppRole = 'admin' | 'hr' | 'recruiter' | 'interviewer';

export type QuestionType = 'mcq' | 'coding' | 'subjective' | 'file_upload' | 'spoken';

export interface QuestionSpokenConfig {
  max_seconds: number;
  prep_seconds: number;
  max_attempts: number;
}

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
  /** Present for spoken questions; see QuestionSpokenConfig */
  spoken_config?: QuestionSpokenConfig | null;
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
  /** Portal profile photo (`applicant_profiles.avatar_url`), matched by email. */
  avatar_url?: string | null;
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

/** Camera / microphone / recording problems. Signals for reviewers only; they never change a score or stage. */
export type MediaIntegrityEventType =
  | 'camera_denied'
  | 'mic_denied'
  | 'camera_stopped'
  | 'recording_interrupted'
  | 'recording_upload_failed'
  // Submitted (by the candidate after a warning, or by the timer) with recording segments or a spoken answer not yet saved.
  | 'media_incomplete_at_submit';

export interface IntegrityEvent {
  type:
    | 'tab_switch'
    | 'focus_lost'
    | 'fullscreen_exit'
    | 'paste_attempt'
    // Written server-side when an attempt is closed without the candidate submitting.
    | 'auto_submit_time_limit'
    | 'auto_complete_browser_close'
    | MediaIntegrityEventType;
  timestamp: string;
  duration_seconds?: number;
  /** paste_attempt only: length of the blocked text. The text itself is never stored. */
  chars?: number;
  /** paste_attempt only: answer input the paste targeted ('subjective' | 'coding'). */
  input_kind?: string;
  /** Active question when the event occurred (forward-looking; older events omit these). */
  question_id?: string;
  /** 1-based index for display (e.g. Q3). */
  question_index?: number;
  section_title?: string;
  /** media_incomplete_at_submit only: who submitted ('candidate' chose to submit anyway, 'timer' at time up). */
  submitted_by?: 'candidate' | 'timer';
  /** media_incomplete_at_submit only: webcam segments not uploaded (still waiting, or already dropped/failed). */
  pending_segments?: number;
  /** media_incomplete_at_submit only: 1-based numbers of spoken questions with a take not saved. */
  unsaved_spoken_questions?: number[];
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
