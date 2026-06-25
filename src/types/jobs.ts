// Job types for the SparxIT Assessment System

export type JobStatus = 'draft' | 'open' | 'paused' | 'closed';
export type JobType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
export type PositionType = 'tech' | 'non_tech';
export interface JobAssessmentConfig {
  deadline_days?: number;
  pass_threshold_override?: number | null;
  notify_recruiter_on_complete?: boolean;
  require_pass_before_interview?: boolean;
}

export type ExperienceYearsRange = 
  | 'fresh'
  | '0_6_months'
  | '6_months_plus'
  | '1_year_plus'
  | '2_years_plus'
  | '3_years_plus'
  | '5_years_plus'
  | '8_years_plus'
  | '10_years_plus'
  | '12_years_plus'
  | '15_years_plus';

export interface Job {
  id: string;
  title: string;
  description?: string;
  domain?: string;
  department?: string; // Now used as "Team"
  location?: string;
  job_type: JobType;
  experience_level?: ExperienceLevel;
  experience_years_range?: ExperienceYearsRange;
  position_type?: PositionType;
  total_openings?: number;
  salary_min?: number;
  salary_max?: number;
  salary_currency: string; // Always INR
  required_skills: string[];
  benefits: string[];
  application_deadline?: string;
  status: JobStatus;
  require_digital_application_form?: boolean;
  assessment_enabled?: boolean;
  default_assessment_id?: string | null;
  assessment_config?: JobAssessmentConfig;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface JobApplication {
  id: string;
  job_id: string;
  candidate_id?: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone?: string;
  resume_url?: string;
  linkedin_url?: string;
  cover_letter?: string;
  status: string;
  created_at: string;
  updated_at: string;
  // Joined data
  job?: Job;
}

export const jobTypeLabels: Record<JobType, string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  contract: 'Contract',
  internship: 'Internship',
  freelance: 'Freelance',
};

export const experienceLevelLabels: Record<ExperienceLevel, string> = {
  entry: 'Entry Level',
  mid: 'Mid Level',
  senior: 'Senior',
  lead: 'Lead',
  executive: 'Executive',
};

export const experienceYearsLabels: Record<ExperienceYearsRange, string> = {
  fresh: '0 (Fresh)',
  '0_6_months': '0-6 Months',
  '6_months_plus': '6 Months+',
  '1_year_plus': '1 Year+',
  '2_years_plus': '2 Years+',
  '3_years_plus': '3 Years+',
  '5_years_plus': '5 Years+',
  '8_years_plus': '8 Years+',
  '10_years_plus': '10 Years+',
  '12_years_plus': '12 Years+',
  '15_years_plus': '15 Years+',
};

export const positionTypeLabels: Record<PositionType, string> = {
  tech: 'Tech',
  non_tech: 'Non-Tech',
};

export const jobStatusLabels: Record<JobStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  paused: 'Paused',
  closed: 'Closed',
};
