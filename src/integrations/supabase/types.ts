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
      announcements: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          link_label: string | null
          link_url: string | null
          message: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          link_label?: string | null
          link_url?: string | null
          message: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          link_label?: string | null
          link_url?: string | null
          message?: string
          type?: string
        }
        Relationships: []
      }
      applicant_profiles: {
        Row: {
          avatar_url: string | null
          blood_group: string | null
          created_at: string
          dob_actual: string | null
          dob_documented: string | null
          documents: Json
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
          notification_prefs: Json
          phone: string | null
          resume_url: string | null
          sensitive_data_consent_at: string | null
          sensitive_data_consent_source: string | null
          skills: Json
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
          documents?: Json
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
          notification_prefs?: Json
          phone?: string | null
          resume_url?: string | null
          sensitive_data_consent_at?: string | null
          sensitive_data_consent_source?: string | null
          skills?: Json
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
          documents?: Json
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
          notification_prefs?: Json
          phone?: string | null
          resume_url?: string | null
          sensitive_data_consent_at?: string | null
          sensitive_data_consent_source?: string | null
          skills?: Json
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
            referencedRelation: "assessment_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_sections_assessment_id_fkey"
            columns: ["assessment_id"]
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
        }
        Relationships: [
          {
            foreignKeyName: "assessments_source_job_id_fkey"
            columns: ["source_job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_source_job_id_fkey"
            columns: ["source_job_id"]
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip: unknown
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip?: unknown
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip?: unknown
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
          graded_at: string | null
          grading_requested_at: string | null
          grading_started_at: string | null
          grading_status: string | null
          id: string
          integrity_log: Json | null
          invited_at: string
          job_id: string | null
          passed: boolean | null
          percentage: number | null
          started_at: string | null
          staff_notified_at: string | null
          status: Database["public"]["Enums"]["candidate_assessment_status"]
          token_expires_at: string | null
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
          graded_at?: string | null
          grading_requested_at?: string | null
          grading_started_at?: string | null
          grading_status?: string | null
          id?: string
          integrity_log?: Json | null
          invited_at?: string
          job_id?: string | null
          passed?: boolean | null
          percentage?: number | null
          started_at?: string | null
          staff_notified_at?: string | null
          status?: Database["public"]["Enums"]["candidate_assessment_status"]
          token_expires_at?: string | null
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
          graded_at?: string | null
          grading_requested_at?: string | null
          grading_started_at?: string | null
          grading_status?: string | null
          id?: string
          integrity_log?: Json | null
          invited_at?: string
          job_id?: string | null
          passed?: boolean | null
          percentage?: number | null
          started_at?: string | null
          staff_notified_at?: string | null
          status?: Database["public"]["Enums"]["candidate_assessment_status"]
          token_expires_at?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_assessments_assessment_id_fkey"
            columns: ["assessment_id"]
            referencedRelation: "assessment_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_assessments_assessment_id_fkey"
            columns: ["assessment_id"]
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_assessments_candidate_id_fkey"
            columns: ["candidate_id"]
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_assessments_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_assessments_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_interview_panelists: {
        Row: {
          candidate_interview_id: string
          created_at: string
          id: string
          interviewer_user_id: string
        }
        Insert: {
          candidate_interview_id: string
          created_at?: string
          id?: string
          interviewer_user_id: string
        }
        Update: {
          candidate_interview_id?: string
          created_at?: string
          id?: string
          interviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_interview_panelists_candidate_interview_id_fkey"
            columns: ["candidate_interview_id"]
            referencedRelation: "candidate_interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_interview_panelists_interviewer_user_id_fkey"
            columns: ["interviewer_user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_interviews: {
        Row: {
          advanced_at: string | null
          advanced_by: string | null
          artifacts: Json | null
          cancellation_meta: Json | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          candidate_id: string
          completed_at: string | null
          created_at: string
          enrolled_at: string | null
          feedback: string | null
          id: string
          interview_mode: Database["public"]["Enums"]["interview_mode"] | null
          interview_notes: string | null
          interviewer_user_id: string | null
          job_interview_stage_id: string | null
          meeting_link: string | null
          overall_score: number | null
          rating_categories: Json | null
          rejection_reason: string | null
          removed_by: string | null
          removed_from_pipeline_at: string | null
          round: number
          scheduled_at: string | null
          sort_order: number
          stage_name_snapshot: string | null
          updated_at: string
          verdict: Database["public"]["Enums"]["interview_verdict"] | null
        }
        Insert: {
          advanced_at?: string | null
          advanced_by?: string | null
          artifacts?: Json | null
          cancellation_meta?: Json | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          candidate_id: string
          completed_at?: string | null
          created_at?: string
          enrolled_at?: string | null
          feedback?: string | null
          id?: string
          interview_mode?: Database["public"]["Enums"]["interview_mode"] | null
          interview_notes?: string | null
          interviewer_user_id?: string | null
          job_interview_stage_id?: string | null
          meeting_link?: string | null
          overall_score?: number | null
          rating_categories?: Json | null
          rejection_reason?: string | null
          removed_by?: string | null
          removed_from_pipeline_at?: string | null
          round?: number
          scheduled_at?: string | null
          sort_order?: number
          stage_name_snapshot?: string | null
          updated_at?: string
          verdict?: Database["public"]["Enums"]["interview_verdict"] | null
        }
        Update: {
          advanced_at?: string | null
          advanced_by?: string | null
          artifacts?: Json | null
          cancellation_meta?: Json | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          candidate_id?: string
          completed_at?: string | null
          created_at?: string
          enrolled_at?: string | null
          feedback?: string | null
          id?: string
          interview_mode?: Database["public"]["Enums"]["interview_mode"] | null
          interview_notes?: string | null
          interviewer_user_id?: string | null
          job_interview_stage_id?: string | null
          meeting_link?: string | null
          overall_score?: number | null
          rating_categories?: Json | null
          rejection_reason?: string | null
          removed_by?: string | null
          removed_from_pipeline_at?: string | null
          round?: number
          scheduled_at?: string | null
          sort_order?: number
          stage_name_snapshot?: string | null
          updated_at?: string
          verdict?: Database["public"]["Enums"]["interview_verdict"] | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_interviews_interviewer_user_id_fkey"
            columns: ["interviewer_user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "candidate_interviews_job_interview_stage_id_fkey"
            columns: ["job_interview_stage_id"]
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
          open_to_relocation: string | null
          preferred_location: string | null
          relevant_experience_domain: string | null
          relevant_experience_years: number | null
          screened_at: string | null
          screened_by: string | null
          total_experience_years: number | null
          updated_at: string
          work_mode_preference: string[] | null
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
          open_to_relocation?: string | null
          preferred_location?: string | null
          relevant_experience_domain?: string | null
          relevant_experience_years?: number | null
          screened_at?: string | null
          screened_by?: string | null
          total_experience_years?: number | null
          updated_at?: string
          work_mode_preference?: string[] | null
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
          open_to_relocation?: string | null
          preferred_location?: string | null
          relevant_experience_domain?: string | null
          relevant_experience_years?: number | null
          screened_at?: string | null
          screened_by?: string | null
          total_experience_years?: number | null
          updated_at?: string
          work_mode_preference?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_prescreens_candidate_id_fkey"
            columns: ["candidate_id"]
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
            referencedRelation: "candidate_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_responses_question_id_fkey"
            columns: ["question_id"]
            referencedRelation: "questions"
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
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          ai_summary: string | null
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
          pending_approval_decline_reason: string | null
          phone: string | null
          red_flags: Json
          referred_by: string | null
          resume_url: string | null
          role_applied: string | null
          skills: Json | null
          skills_tags: Json | null
          source: string | null
          structured_skills: Json | null
          suitability_analysis: Json | null
          suitability_score: number | null
          updated_at: string
          uploaded_by: string | null
          work_experience: Json | null
        }
        Insert: {
          ai_summary?: string | null
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
          pending_approval_decline_reason?: string | null
          phone?: string | null
          red_flags?: Json
          referred_by?: string | null
          resume_url?: string | null
          role_applied?: string | null
          skills?: Json | null
          skills_tags?: Json | null
          source?: string | null
          structured_skills?: Json | null
          suitability_analysis?: Json | null
          suitability_score?: number | null
          updated_at?: string
          uploaded_by?: string | null
          work_experience?: Json | null
        }
        Update: {
          ai_summary?: string | null
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
          pending_approval_decline_reason?: string | null
          phone?: string | null
          red_flags?: Json
          referred_by?: string | null
          resume_url?: string | null
          role_applied?: string | null
          skills?: Json | null
          skills_tags?: Json | null
          source?: string | null
          structured_skills?: Json | null
          suitability_analysis?: Json | null
          suitability_score?: number | null
          updated_at?: string
          uploaded_by?: string | null
          work_experience?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      chitra_escalations: {
        Row: {
          created_at: string
          escalation_level: number
          id: string
          last_escalated_at: string
          reference_id: string
          resolved_at: string | null
          subject_user_id: string | null
          violation_type: string
        }
        Insert: {
          created_at?: string
          escalation_level?: number
          id?: string
          last_escalated_at?: string
          reference_id: string
          resolved_at?: string | null
          subject_user_id?: string | null
          violation_type?: string
        }
        Update: {
          created_at?: string
          escalation_level?: number
          id?: string
          last_escalated_at?: string
          reference_id?: string
          resolved_at?: string | null
          subject_user_id?: string | null
          violation_type?: string
        }
        Relationships: []
      }
      email_delivery_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metadata: Json
          provider: string
          recipient: string
          status: string
          subject: string
          template_type: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          provider?: string
          recipient: string
          status: string
          subject: string
          template_type: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          provider?: string
          recipient?: string
          status?: string
          subject?: string
          template_type?: string
        }
        Relationships: []
      }
      external_refs: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          external_id: string
          external_url: string | null
          id: string
          provider: string
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          external_id: string
          external_url?: string | null
          id?: string
          provider: string
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          external_id?: string
          external_url?: string | null
          id?: string
          provider?: string
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      internal_webhook_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      interview_kits: {
        Row: {
          candidate_interview_id: string
          created_at: string
          generated_at: string
          id: string
          questions: Json
          scorecard_template_id: string | null
          source: string
        }
        Insert: {
          candidate_interview_id: string
          created_at?: string
          generated_at?: string
          id?: string
          questions?: Json
          scorecard_template_id?: string | null
          source: string
        }
        Update: {
          candidate_interview_id?: string
          created_at?: string
          generated_at?: string
          id?: string
          questions?: Json
          scorecard_template_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_kits_candidate_interview_id_fkey"
            columns: ["candidate_interview_id"]
            referencedRelation: "candidate_interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_kits_scorecard_template_id_fkey"
            columns: ["scorecard_template_id"]
            referencedRelation: "scorecard_templates"
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
            referencedRelation: "job_application_forms"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "public_job_listings"
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
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_interview_stages_job_id_fkey"
            columns: ["job_id"]
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
          is_primary: boolean
          job_id: string
          recruiter_user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          job_id: string
          recruiter_user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          job_id?: string
          recruiter_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_recruiters_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_recruiters_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          application_deadline: string | null
          assessment_config: Json
          assessment_enabled: boolean
          benefits: Json | null
          created_at: string
          created_by: string | null
          default_assessment_id: string | null
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
          required_skills: Json | null
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          sort_order: number
          status: Database["public"]["Enums"]["job_status"]
          status_note: string | null
          title: string
          total_openings: number | null
          updated_at: string
        }
        Insert: {
          application_deadline?: string | null
          assessment_config?: Json
          assessment_enabled?: boolean
          benefits?: Json | null
          created_at?: string
          created_by?: string | null
          default_assessment_id?: string | null
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
          required_skills?: Json | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          sort_order?: number
          status?: Database["public"]["Enums"]["job_status"]
          status_note?: string | null
          title: string
          total_openings?: number | null
          updated_at?: string
        }
        Update: {
          application_deadline?: string | null
          assessment_config?: Json
          assessment_enabled?: boolean
          benefits?: Json | null
          created_at?: string
          created_by?: string | null
          default_assessment_id?: string | null
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
          required_skills?: Json | null
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          sort_order?: number
          status?: Database["public"]["Enums"]["job_status"]
          status_note?: string | null
          title?: string
          total_openings?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_default_assessment_id_fkey"
            columns: ["default_assessment_id"]
            referencedRelation: "assessment_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_default_assessment_id_fkey"
            columns: ["default_assessment_id"]
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          push_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          types: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          push_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          types?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          push_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          types?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_buttons: Json | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          push_attempts: number
          pushed_at: string | null
          source: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_buttons?: Json | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          push_attempts?: number
          pushed_at?: string | null
          source?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_buttons?: Json | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          push_attempts?: number
          pushed_at?: string | null
          source?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_analysis_cache: {
        Row: {
          generated_at: string
          job_id: string
          result: Json
          updated_at: string
        }
        Insert: {
          generated_at?: string
          job_id: string
          result: Json
          updated_at?: string
        }
        Update: {
          generated_at?: string
          job_id?: string
          result?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_analysis_cache_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_analysis_cache_job_id_fkey"
            columns: ["job_id"]
            referencedRelation: "public_job_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_application_attempts: {
        Row: {
          client_hash: string | null
          created_at: string
          email_hash: string
          id: number
        }
        Insert: {
          client_hash?: string | null
          created_at?: string
          email_hash: string
          id?: never
        }
        Update: {
          client_hash?: string | null
          created_at?: string
          email_hash?: string
          id?: never
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
          can_conduct_interviews: boolean
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_super_admin: boolean
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          can_conduct_interviews?: boolean
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          is_super_admin?: boolean
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          can_conduct_interviews?: boolean
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_super_admin?: boolean
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_seen_at: string
          p256dh: string
          platform: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_seen_at?: string
          p256dh: string
          platform?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_seen_at?: string
          p256dh?: string
          platform?: string | null
          user_agent?: string | null
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
          file_config: Json | null
          id: string
          marks: number
          options: Json | null
          order_index: number
          question_text: string
          section_id: string
          subjective_max_words: number | null
          subjective_rubric: string | null
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          coding_language?: string | null
          coding_starter_code?: string | null
          coding_test_cases?: Json | null
          correct_answer?: Json | null
          created_at?: string
          file_config?: Json | null
          id?: string
          marks?: number
          options?: Json | null
          order_index?: number
          question_text: string
          section_id: string
          subjective_max_words?: number | null
          subjective_rubric?: string | null
          type: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          coding_language?: string | null
          coding_starter_code?: string | null
          coding_test_cases?: Json | null
          correct_answer?: Json | null
          created_at?: string
          file_config?: Json | null
          id?: string
          marks?: number
          options?: Json | null
          order_index?: number
          question_text?: string
          section_id?: string
          subjective_max_words?: number | null
          subjective_rubric?: string | null
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_section_id_fkey"
            columns: ["section_id"]
            referencedRelation: "assessment_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      scorecard_templates: {
        Row: {
          created_at: string
          criteria: Json
          display_name: string
          id: string
          is_active: boolean
          prompt_questions: Json
          stage_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          display_name: string
          id?: string
          is_active?: boolean
          prompt_questions?: Json
          stage_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          display_name?: string
          id?: string
          is_active?: boolean
          prompt_questions?: Json
          stage_key?: string
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
      vendors: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          fee_pct: number | null
          guarantee_days: number | null
          id: string
          is_active: boolean
          name: string
          source_key: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          fee_pct?: number | null
          guarantee_days?: number | null
          id?: string
          is_active?: boolean
          name: string
          source_key: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          fee_pct?: number | null
          guarantee_days?: number | null
          id?: string
          is_active?: boolean
          name?: string
          source_key?: string
          updated_at?: string
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
          experience_level:
            | Database["public"]["Enums"]["experience_level"]
            | null
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
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
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
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
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
      _period_candidate_flags: {
        Args: {
          p_end_ts: string
          p_recruiter_id?: string
          p_require_created_by?: boolean
          p_source_keys?: string[]
          p_start_ts: string
        }
        Returns: {
          any_pending: boolean
          any_proceeded: boolean
          candidate_id: string
          candidate_name: string
          created_by: string
          highest_stage: string
          in_pipeline: boolean
          is_hired: boolean
          job_id: string
          job_title: string
          overall_verdict: string
          pipeline_job_id: string
          source: string
        }[]
      }
      advance_candidate_stage: {
        Args: {
          p_advanced_by: string
          p_candidate_id: string
          p_from_stage_id: string
          p_to_stage_id: string
        }
        Returns: undefined
      }
      applicant_owns_job_application: {
        Args: { _application_id: string }
        Returns: boolean
      }
      approve_pending_candidate: {
        Args: { p_candidate_id: string }
        Returns: undefined
      }
      audit_log_record: {
        Args: {
          _action: string
          _after_data: Json
          _before_data: Json
          _entity_id: string
          _entity_type: string
        }
        Returns: string
      }
      calculate_assessment_total_score: {
        Args: { _candidate_assessment_id: string }
        Returns: undefined
      }
      caller_owns_resume_path: {
        Args: { _resume_url: string }
        Returns: boolean
      }
      can_access_job_hiring: {
        Args: { _job_id: string; _user_id: string }
        Returns: boolean
      }
      can_decide_pending_approval: {
        Args: { _job_id: string; _user_id: string }
        Returns: boolean
      }
      can_interviewer_view_candidate_assessment: {
        Args: { _candidate_id: string; _job_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_interview: {
        Args: { p_id: string; p_note?: string; p_reason: string }
        Returns: undefined
      }
      decline_pending_candidate: {
        Args: { p_candidate_id: string; p_reason?: string }
        Returns: undefined
      }
      enforce_portal_application_rate_limit: {
        Args: { _email: string }
        Returns: undefined
      }
      get_applicant_portal_auth_users: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_dashboard_metrics: { Args: { p_period?: string }; Returns: Json }
      get_email_send_counts: {
        Args: never
        Returns: {
          sent_this_month: number
          sent_today: number
        }[]
      }
      get_interview_stage_funnel: {
        Args: { p_interviewer_user_id?: string }
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
      get_job_enrolled_candidate_ids: {
        Args: { p_job_id: string }
        Returns: string[]
      }
      get_job_pipeline_interviews: { Args: { p_job_id: string }; Returns: Json }
      get_pending_approval_counts: {
        Args: { p_job_ids: string[] }
        Returns: {
          job_id: string
          pending_count: number
        }[]
      }
      get_pipeline_job_counts: {
        Args: { p_job_ids: string[] }
        Returns: {
          candidate_count: number
          job_id: string
        }[]
      }
      get_recruiter_detail: {
        Args: {
          p_end_date: string
          p_recruiter_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_recruiter_leaderboard: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          conversion_pct: number
          hired: number
          in_pipeline: number
          job_count: number
          pending: number
          proceeded: number
          rank: number
          recruiter_id: string
          recruiter_name: string
          sourced: number
        }[]
      }
      get_reports_job_pipeline_stats: {
        Args: never
        Returns: {
          in_pipeline: number
          job_id: string
          pending: number
          proceeded: number
        }[]
      }
      get_scheduled_interviews: {
        Args: { p_from?: string; p_limit?: number; p_to?: string }
        Returns: Json
      }
      get_sourcing_trend: { Args: { p_weeks?: number }; Returns: Json }
      get_time_velocity_metrics: {
        Args: { p_period_days?: number }
        Returns: Json
      }
      get_user_email_confirmation_status: {
        Args: { _user_ids: string[] }
        Returns: {
          email_confirmed: boolean
          user_id: string
        }[]
      }
      get_vendor_detail: {
        Args: { p_end_date: string; p_source_key: string; p_start_date: string }
        Returns: Json
      }
      get_vendor_leaderboard: {
        Args: {
          p_end_date: string
          p_source_keys: string[]
          p_start_date: string
        }
        Returns: {
          conversion_pct: number
          hired: number
          in_pipeline: number
          rank: number
          shortlisted: number
          source_key: string
          submitted: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_audit_log: {
        Args: {
          _action: string
          _after_data?: Json
          _before_data?: Json
          _entity_id: string
          _entity_type: string
          _ip?: unknown
        }
        Returns: string
      }
      invoke_edge_function: { Args: { p_name: string }; Returns: undefined }
      invoke_hire_email_webhook: {
        Args: { p_candidate_id: string }
        Returns: undefined
      }
      invoke_staff_email_webhook: {
        Args: { p_event: string; p_interview_id: string }
        Returns: undefined
      }
      is_admin_or_hr: { Args: { _user_id: string }; Returns: boolean }
      is_anon_resume_upload_path: { Args: { _path: string }; Returns: boolean }
      is_applicant: { Args: { _user_id: string }; Returns: boolean }
      is_assigned_interviewer_for_interview: {
        Args: { _candidate_interview_id: string; _user_id: string }
        Returns: boolean
      }
      is_interview_pool_member: { Args: { _user_id: string }; Returns: boolean }
      is_interviewer_for_candidate: {
        Args: { _candidate_id: string; _user_id: string }
        Returns: boolean
      }
      is_interviewer_for_job: {
        Args: { _job_id: string; _user_id: string }
        Returns: boolean
      }
      is_panelist_for_interview: {
        Args: { _candidate_interview_id: string; _user_id: string }
        Returns: boolean
      }
      is_primary_interviewer_for_interview: {
        Args: { _candidate_interview_id: string; _user_id: string }
        Returns: boolean
      }
      is_recruiter_for_interview: {
        Args: { _candidate_interview_id: string; _user_id: string }
        Returns: boolean
      }
      is_recruiter_for_job: {
        Args: { _job_id: string; _user_id: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_staff_user: { Args: { _user_id: string }; Returns: boolean }
      list_my_job_applications: { Args: never; Returns: Json }
      lookup_applicant_avatars: {
        Args: { p_emails: string[] }
        Returns: {
          avatar_url: string
          email: string
        }[]
      }
      mfa_satisfied: { Args: never; Returns: boolean }
      portal_submit_job_application: {
        Args: {
          p_applicant_email: string
          p_applicant_name: string
          p_applicant_phone?: string
          p_cover_letter?: string
          p_job_id: string
          p_linkedin_url?: string
          p_resume_url?: string
        }
        Returns: Json
      }
      register_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_platform?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      register_profile_as_applicant: {
        Args: { _target_user_id: string }
        Returns: undefined
      }
      request_client_ip: { Args: never; Returns: unknown }
      set_can_conduct_interviews: {
        Args: { _target_user_id: string; _value: boolean }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      staff_can_access_job_application: {
        Args: { _application_id: string }
        Returns: boolean
      }
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
      job_status: "draft" | "open" | "paused" | "closed" | "cancelled"
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
      job_status: ["draft", "open", "paused", "closed", "cancelled"],
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
