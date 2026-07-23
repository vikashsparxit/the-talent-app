export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      applicant_profiles: {
        Row: {
          avatar_url: string | null
          blood_group: string | null
          created_at: string
          dob_actual: string | null
          dob_documented: string | null
          documents: Json | null
          education: Json | null
          email: string
          emergency_phone: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          id: string
          last_name: string | null
          linkedin_url: string | null
          marital_status: string | null
          middle_name: string | null
          notification_prefs: Json | null
          phone: string | null
          resume_url: string | null
          skills: Json | null
          updated_at: string
          user_id: string
          work_experience: Json | null
        }
        Insert: {
          avatar_url?: string | null
          blood_group?: string | null
          created_at?: string
          dob_actual?: string | null
          dob_documented?: string | null
          documents?: Json | null
          education?: Json | null
          email: string
          emergency_phone?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          marital_status?: string | null
          middle_name?: string | null
          notification_prefs?: Json | null
          phone?: string | null
          resume_url?: string | null
          skills?: Json | null
          updated_at?: string
          user_id: string
          work_experience?: Json | null
        }
        Update: {
          avatar_url?: string | null
          blood_group?: string | null
          created_at?: string
          dob_actual?: string | null
          dob_documented?: string | null
          documents?: Json | null
          education?: Json | null
          email?: string
          emergency_phone?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          marital_status?: string | null
          middle_name?: string | null
          notification_prefs?: Json | null
          phone?: string | null
          resume_url?: string | null
          skills?: Json | null
          updated_at?: string
          user_id?: string
          work_experience?: Json | null
        }
        Relationships: []
      }
      assessment_sections: {
        Row: {
          assessment_id: string
          created_at: string
          description: string | null
          id: string
          order_index: number
          skill_tags: Json | null
          title: string
          updated_at: string
          weightage: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          skill_tags?: Json | null
          title: string
          updated_at?: string
          weightage?: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          skill_tags?: Json | null
          title?: string
          updated_at?: string
          weightage?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_sections_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_sections_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          template_data: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          template_data: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          template_data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      assessments: {
        Row: {
          ai_generated: boolean
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          passing_score: number
          settings: Json | null
          source_job_id: string | null
          status: Database["public"]["Enums"]["assessment_status"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          passing_score?: number
          settings?: Json | null
          source_job_id?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          passing_score?: number
          settings?: Json | null
          source_job_id?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          title?: string
          updated_at?: string
          source_job_id?: string | null
          ai_generated?: boolean
        }
        Relationships: []
      }
      candidate_assessments: {
        Row: {
          access_token: string
          assessment_id: string
          assigned_by: string | null
          assigned_via: string | null
          candidate_id: string
          completed_at: string | null
          consent_given: boolean
          consent_given_at: string | null
          consent_source: string | null
          created_at: string
          deadline: string | null
          evaluator_notes: string | null
          id: string
          integrity_log: Json | null
          invited_at: string
          job_id: string | null
          passed: boolean | null
          percentage: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["candidate_assessment_status"]
          total_score: number | null
          updated_at: string
        }
        Insert: {
          access_token?: string
          assessment_id: string
          assigned_by?: string | null
          assigned_via?: string | null
          candidate_id: string
          completed_at?: string | null
          consent_given?: boolean
          consent_given_at?: string | null
          consent_source?: string | null
          created_at?: string
          deadline?: string | null
          evaluator_notes?: string | null
          id?: string
          integrity_log?: Json | null
          invited_at?: string
          job_id?: string | null
          passed?: boolean | null
          percentage?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["candidate_assessment_status"]
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          assessment_id?: string
          assigned_by?: string | null
          assigned_via?: string | null
          candidate_id?: string
          completed_at?: string | null
          consent_given?: boolean
          consent_given_at?: string | null
          consent_source?: string | null
          created_at?: string
          deadline?: string | null
          evaluator_notes?: string | null
          id?: string
          integrity_log?: Json | null
          invited_at?: string
          job_id?: string | null
          passed?: boolean | null
          percentage?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["candidate_assessment_status"]
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_assessments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_assessments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_assessments_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_interviewers: {
        Row: {
          assigned_by: string | null
          candidate_id: string
          created_at: string
          id: string
          interviewer_user_id: string
          notes: string | null
        }
        Insert: {
          assigned_by?: string | null
          candidate_id: string
          created_at?: string
          id?: string
          interviewer_user_id: string
          notes?: string | null
        }
        Update: {
          assigned_by?: string | null
          candidate_id?: string
          created_at?: string
          id?: string
          interviewer_user_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_interviewers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_interview_panelists: {
        Row: {
          id: string
          candidate_interview_id: string
          interviewer_user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          candidate_interview_id: string
          interviewer_user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          candidate_interview_id?: string
          interviewer_user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_interview_panelists_candidate_interview_id_fkey"
            columns: ["candidate_interview_id"]
            isOneToOne: false
            referencedRelation: "candidate_interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_interview_panelists_interviewer_user_id_fkey"
            columns: ["interviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      candidate_interviews: {
        Row: {
          advanced_at: string | null
          advanced_by: string | null
          candidate_id: string
          completed_at: string | null
          created_at: string
          feedback: string | null
          id: string
          interview_mode: Database["public"]["Enums"]["interview_mode"] | null
          interviewer_user_id: string | null
          job_interview_stage_id: string | null
          overall_score: number | null
          rating_categories: Json | null
          scheduled_at: string | null
          sort_order: number
          updated_at: string
          verdict: Database["public"]["Enums"]["interview_verdict"] | null
        }
        Insert: {
          advanced_at?: string | null
          advanced_by?: string | null
          candidate_id: string
          completed_at?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          interview_mode?: Database["public"]["Enums"]["interview_mode"] | null
          interviewer_user_id?: string | null
          job_interview_stage_id?: string | null
          overall_score?: number | null
          rating_categories?: Json | null
          scheduled_at?: string | null
          sort_order?: number
          updated_at?: string
          verdict?: Database["public"]["Enums"]["interview_verdict"] | null
        }
        Update: {
          advanced_at?: string | null
          advanced_by?: string | null
          candidate_id?: string
          completed_at?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          interview_mode?: Database["public"]["Enums"]["interview_mode"] | null
          interviewer_user_id?: string | null
          job_interview_stage_id?: string | null
          overall_score?: number | null
          rating_categories?: Json | null
          scheduled_at?: string | null
          sort_order?: number
          updated_at?: string
          verdict?: Database["public"]["Enums"]["interview_verdict"] | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_interviews_interviewer_user_id_fkey"
            columns: ["interviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "candidate_interviews_job_interview_stage_id_fkey"
            columns: ["job_interview_stage_id"]
            isOneToOne: false
            referencedRelation: "job_interview_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_prescreens: {
        Row: {
          academics: Json | null
          candidate_id: string
          comms_rating: number | null
          created_at: string
          current_ctc: string | null
          current_location: string | null
          expected_ctc: string | null
          id: string
          lwd: string | null
          notice_period: string | null
          nutshell: string | null
          preferred_location: string | null
          relevant_experience_domain: string | null
          relevant_experience_years: number | null
          screened_at: string | null
          screened_by: string | null
          total_experience_years: number | null
          updated_at: string
        }
        Insert: {
          academics?: Json | null
          candidate_id: string
          comms_rating?: number | null
          created_at?: string
          current_ctc?: string | null
          current_location?: string | null
          expected_ctc?: string | null
          id?: string
          lwd?: string | null
          notice_period?: string | null
          nutshell?: string | null
          preferred_location?: string | null
          relevant_experience_domain?: string | null
          relevant_experience_years?: number | null
          screened_at?: string | null
          screened_by?: string | null
          total_experience_years?: number | null
          updated_at?: string
        }
        Update: {
          academics?: Json | null
          candidate_id?: string
          comms_rating?: number | null
          created_at?: string
          current_ctc?: string | null
          current_location?: string | null
          expected_ctc?: string | null
          id?: string
          lwd?: string | null
          notice_period?: string | null
          nutshell?: string | null
          preferred_location?: string | null
          relevant_experience_domain?: string | null
          relevant_experience_years?: number | null
          screened_at?: string | null
          screened_by?: string | null
          total_experience_years?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_prescreens_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_tags: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          tag: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          tag: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_tags_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_responses: {
        Row: {
          auto_score: number | null
          candidate_assessment_id: string
          created_at: string
          evaluated_at: string | null
          evaluated_by: string | null
          feedback: string | null
          final_score: number | null
          id: string
          manual_score: number | null
          question_id: string
          response: Json | null
          time_spent_seconds: number | null
          updated_at: string
        }
        Insert: {
          auto_score?: number | null
          candidate_assessment_id: string
          created_at?: string
          evaluated_at?: string | null
          evaluated_by?: string | null
          feedback?: string | null
          final_score?: number | null
          id?: string
          manual_score?: number | null
          question_id: string
          response?: Json | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
        Update: {
          auto_score?: number | null
          candidate_assessment_id?: string
          created_at?: string
          evaluated_at?: string | null
          evaluated_by?: string | null
          feedback?: string | null
          final_score?: number | null
          id?: string
          manual_score?: number | null
          question_id?: string
          response?: Json | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_responses_candidate_assessment_id_fkey"
            columns: ["candidate_assessment_id"]
            isOneToOne: false
            referencedRelation: "candidate_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          awards: Json | null
          candidate_current_company: string | null
          candidate_current_role: string | null
          candidate_status: string
          certifications: Json | null
          created_at: string
          created_by: string | null
          credential_score: number | null
          education: Json | null
          email: string | null
          enrichment_score: number | null
          experience_years: number | null
          hired_at: string | null
          id: string
          job_id: string | null
          last_analyzed_at: string | null
          last_enriched_at: string | null
          linkedin_url: string | null
          name: string
          notes: string | null
          parse_score: number | null
          phone: string | null
          resume_url: string | null
          role_applied: string | null
          skills: Json | null
          skills_tags: Json | null
          source: string | null
          structured_skills: Json | null
          suitability_analysis: Json | null
          suitability_score: number | null
          updated_at: string
          work_experience: Json | null
        }
        Insert: {
          awards?: Json | null
          candidate_current_company?: string | null
          candidate_current_role?: string | null
          candidate_status?: string
          certifications?: Json | null
          created_at?: string
          created_by?: string | null
          credential_score?: number | null
          education?: Json | null
          email?: string | null
          enrichment_score?: number | null
          experience_years?: number | null
          hired_at?: string | null
          id?: string
          job_id?: string | null
          last_analyzed_at?: string | null
          last_enriched_at?: string | null
          linkedin_url?: string | null
          name: string
          notes?: string | null
          parse_score?: number | null
          phone?: string | null
          resume_url?: string | null
          role_applied?: string | null
          skills?: Json | null
          skills_tags?: Json | null
          source?: string | null
          structured_skills?: Json | null
          suitability_analysis?: Json | null
          suitability_score?: number | null
          updated_at?: string
          work_experience?: Json | null
        }
        Update: {
          awards?: Json | null
          candidate_current_company?: string | null
          candidate_current_role?: string | null
          candidate_status?: string
          certifications?: Json | null
          created_at?: string
          created_by?: string | null
          credential_score?: number | null
          education?: Json | null
          email?: string | null
          enrichment_score?: number | null
          experience_years?: number | null
          hired_at?: string | null
          id?: string
          job_id?: string | null
          last_analyzed_at?: string | null
          last_enriched_at?: string | null
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          parse_score?: number | null
          phone?: string | null
          resume_url?: string | null
          role_applied?: string | null
          skills?: Json | null
          skills_tags?: Json | null
          source?: string | null
          structured_skills?: Json | null
          suitability_analysis?: Json | null
          suitability_score?: number | null
          updated_at?: string
          work_experience?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_stage_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          stages: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          stages?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          stages?: Json
          updated_at?: string
        }
        Relationships: []
      }
      job_applications: {
        Row: {
          applicant_email: string
          applicant_name: string
          applicant_phone: string | null
          candidate_id: string | null
          cover_letter: string | null
          created_at: string
          form_sent_at: string | null
          id: string
          jd_sent_at: string | null
          job_id: string
          linkedin_url: string | null
          resume_url: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          applicant_email: string
          applicant_name: string
          applicant_phone?: string | null
          candidate_id?: string | null
          cover_letter?: string | null
          created_at?: string
          form_sent_at?: string | null
          id?: string
          jd_sent_at?: string | null
          job_id: string
          linkedin_url?: string | null
          resume_url?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_email?: string
          applicant_name?: string
          applicant_phone?: string | null
          candidate_id?: string | null
          cover_letter?: string | null
          created_at?: string
          form_sent_at?: string | null
          id?: string
          jd_sent_at?: string | null
          job_id?: string
          linkedin_url?: string | null
          resume_url?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_application_forms: {
        Row: {
          assigned_question_keys: string[]
          created_at: string
          employment_references: Json
          filled_by_recruiter: boolean
          filled_by_user_id: string | null
          id: string
          job_application_id: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_question_keys?: string[]
          created_at?: string
          employment_references?: Json
          filled_by_recruiter?: boolean
          filled_by_user_id?: string | null
          id?: string
          job_application_id: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_question_keys?: string[]
          created_at?: string
          employment_references?: Json
          filled_by_recruiter?: boolean
          filled_by_user_id?: string | null
          id?: string
          job_application_id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_application_forms_job_application_id_fkey"
            columns: ["job_application_id"]
            isOneToOne: true
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      job_application_responses: {
        Row: {
          answer_text: string
          created_at: string
          form_id: string
          id: string
          question_key: string
          updated_at: string
        }
        Insert: {
          answer_text?: string
          created_at?: string
          form_id: string
          id?: string
          question_key: string
          updated_at?: string
        }
        Update: {
          answer_text?: string
          created_at?: string
          form_id?: string
          id?: string
          question_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_application_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "job_application_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      job_interview_stages: {
        Row: {
          created_at: string
          id: string
          is_eliminatory: boolean
          job_id: string
          order_index: number
          stage_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_eliminatory?: boolean
          job_id: string
          order_index?: number
          stage_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_eliminatory?: boolean
          job_id?: string
          order_index?: number
          stage_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_interview_stages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_interview_stages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_recruiters: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          job_id: string
          recruiter_user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          job_id: string
          recruiter_user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          job_id?: string
          recruiter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_recruiters_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_recruiters_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          application_deadline: string | null
          benefits: Json | null
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          domain: string | null
          experience_level:
            | Database["public"]["Enums"]["experience_level"]
            | null
          experience_years_range: string | null
          id: string
          job_type: Database["public"]["Enums"]["job_type"]
          location: string | null
          position_type: string | null
          positions_filled: number
          require_digital_application_form: boolean
          assessment_enabled: boolean
          default_assessment_id: string | null
          assessment_config: Json | null
          required_skills: Json | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          total_openings: number | null
          updated_at: string
        }
        Insert: {
          application_deadline?: string | null
          benefits?: Json | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          domain?: string | null
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
          experience_years_range?: string | null
          id?: string
          job_type?: Database["public"]["Enums"]["job_type"]
          location?: string | null
          position_type?: string | null
          positions_filled?: number
          require_digital_application_form?: boolean
          assessment_enabled?: boolean
          default_assessment_id?: string | null
          assessment_config?: Json | null
          required_skills?: Json | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          total_openings?: number | null
          updated_at?: string
        }
        Update: {
          application_deadline?: string | null
          benefits?: Json | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          domain?: string | null
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
          experience_years_range?: string | null
          id?: string
          job_type?: Database["public"]["Enums"]["job_type"]
          location?: string | null
          position_type?: string | null
          positions_filled?: number
          require_digital_application_form?: boolean
          assessment_enabled?: boolean
          default_assessment_id?: string | null
          assessment_config?: Json | null
          required_skills?: Json | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          total_openings?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      prescreen_question_bank: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          question_key: string
          question_text: string
          sort_hint: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          question_key: string
          question_text: string
          sort_hint?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          question_key?: string
          question_text?: string
          sort_hint?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          coding_language: string | null
          coding_starter_code: string | null
          coding_test_cases: Json | null
          correct_answer: Json | null
          created_at: string
          id: string
          marks: number
          options: Json | null
          order_index: number
          question_text: string
          section_id: string
          subjective_max_words: number | null
          subjective_rubric: string | null
          file_config: Json | null
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          coding_language?: string | null
          coding_starter_code?: string | null
          coding_test_cases?: Json | null
          correct_answer?: Json | null
          created_at?: string
          id?: string
          marks?: number
          options?: Json | null
          order_index?: number
          question_text: string
          section_id: string
          subjective_max_words?: number | null
          subjective_rubric?: string | null
          file_config?: Json | null
          type: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          coding_language?: string | null
          coding_starter_code?: string | null
          coding_test_cases?: Json | null
          correct_answer?: Json | null
          created_at?: string
          id?: string
          marks?: number
          options?: Json | null
          order_index?: number
          question_text?: string
          section_id?: string
          subjective_max_words?: number | null
          subjective_rubric?: string | null
          file_config?: Json | null
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "assessment_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      scorecard_templates: {
        Row: {
          id: string
          stage_key: string
          display_name: string
          criteria: Json
          prompt_questions: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          stage_key: string
          display_name: string
          criteria?: Json
          prompt_questions?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          stage_key?: string
          display_name?: string
          criteria?: Json
          prompt_questions?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string
          description: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      assessment_details: {
        Row: {
          description: string | null
          duration_minutes: number | null
          id: string | null
          passing_score: number | null
          question_count: number | null
          section_count: number | null
          settings: Json | null
          title: string | null
          total_marks: number | null
        }
        Relationships: []
      }
      public_job_listings: {
        Row: {
          application_deadline: string | null
          created_at: string | null
          department: string | null
          description: string | null
          domain: string | null
          experience_level:
            | Database["public"]["Enums"]["experience_level"]
            | null
          experience_years_range: string | null
          id: string | null
          job_type: Database["public"]["Enums"]["job_type"] | null
          location: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          application_deadline?: string | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          domain?: string | null
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
          experience_years_range?: string | null
          id?: string | null
          job_type?: Database["public"]["Enums"]["job_type"] | null
          location?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          application_deadline?: string | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          domain?: string | null
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
          experience_years_range?: string | null
          id?: string | null
          job_type?: Database["public"]["Enums"]["job_type"] | null
          location?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_candidate_stage: {
        Args: {
          p_candidate_id: string
          p_from_stage_id: string
          p_to_stage_id: string
          p_advanced_by: string
        }
        Returns: undefined
      }
      set_can_conduct_interviews: {
        Args: { _target_user_id: string; _value: boolean }
        Returns: undefined
      }
      get_user_email_confirmation_status: {
        Args: { _user_ids: string[] }
        Returns: { user_id: string; email_confirmed: boolean }[]
      }
      calculate_assessment_total_score: {
        Args: { _candidate_assessment_id: string }
        Returns: undefined
      }
      get_time_velocity_metrics: {
        Args: { p_period_days?: number }
        Returns: Json
      }
      get_interviewer_prescreen: {
        Args: { _candidate_id: string }
        Returns: {
          academics: Json
          candidate_id: string
          comms_rating: number
          created_at: string
          current_location: string
          id: string
          nutshell: string
          preferred_location: string
          relevant_experience_domain: string
          relevant_experience_years: number
          screened_at: string
          screened_by: string
          total_experience_years: number
          updated_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_hr: { Args: { _user_id: string }; Returns: boolean }
      is_applicant: { Args: { _user_id: string }; Returns: boolean }
      list_my_job_applications: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      portal_submit_job_application: {
        Args: {
          p_job_id: string
          p_applicant_name: string
          p_applicant_email: string
          p_applicant_phone?: string | null
          p_linkedin_url?: string | null
          p_resume_url?: string | null
          p_cover_letter?: string | null
        }
        Returns: Json
      }
      approve_pending_candidate: {
        Args: { p_candidate_id: string }
        Returns: undefined
      }
      decline_pending_candidate: {
        Args: { p_candidate_id: string; p_reason?: string | null }
        Returns: undefined
      }
      can_decide_pending_approval: {
        Args: { _user_id: string; _job_id: string }
        Returns: boolean
      }
      can_access_job_hiring: {
        Args: { _user_id: string; _job_id: string }
        Returns: boolean
      }
      is_interview_pool_member: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_interviewer_for_candidate: {
        Args: { _candidate_id: string; _user_id: string }
        Returns: boolean
      }
      is_interviewer_for_job: {
        Args: { _user_id: string; _job_id: string }
        Returns: boolean
      }
      is_recruiter_for_job: {
        Args: { _job_id: string; _user_id: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      make_user_admin: { Args: { _user_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "hr" | "recruiter" | "interviewer"
      assessment_status: "draft" | "active" | "archived"
      candidate_assessment_status:
        | "invited"
        | "in_progress"
        | "completed"
        | "evaluated"
        | "expired"
      experience_level: "entry" | "mid" | "senior" | "lead" | "executive"
      interview_mode: "in_person" | "video" | "phone"
      interview_verdict: "proceeded" | "rejected" | "hold" | "no_show"
      job_status: "draft" | "open" | "paused" | "closed"
      job_type:
        | "full_time"
        | "part_time"
        | "contract"
        | "internship"
        | "freelance"
      question_type: "mcq" | "coding" | "subjective" | "file_upload"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "hr", "recruiter", "interviewer"],
      assessment_status: ["draft", "active", "archived"],
      candidate_assessment_status: [
        "invited",
        "in_progress",
        "completed",
        "evaluated",
        "expired",
      ],
      experience_level: ["entry", "mid", "senior", "lead", "executive"],
      interview_mode: ["in_person", "video", "phone"],
      interview_verdict: ["proceeded", "rejected", "hold", "no_show"],
      job_status: ["draft", "open", "paused", "closed"],
      job_type: [
        "full_time",
        "part_time",
        "contract",
        "internship",
        "freelance",
      ],
      question_type: ["mcq", "coding", "subjective", "file_upload"],
    },
  },
} as const
