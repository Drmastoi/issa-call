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
      ai_summaries: {
        Row: {
          action_items: Json | null
          call_id: string
          clinical_summary: string
          created_at: string
          id: string
          key_findings: Json | null
          patient_id: string
          qof_relevance: Json | null
        }
        Insert: {
          action_items?: Json | null
          call_id: string
          clinical_summary: string
          created_at?: string
          id?: string
          key_findings?: Json | null
          patient_id: string
          qof_relevance?: Json | null
        }
        Update: {
          action_items?: Json | null
          call_id?: string
          clinical_summary?: string
          created_at?: string
          id?: string
          key_findings?: Json | null
          patient_id?: string
          qof_relevance?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_summaries_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_summaries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      batch_patients: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          patient_id: string
          priority: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          patient_id: string
          priority?: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "batch_patients_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "call_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      call_audit_log: {
        Row: {
          action: string
          actor: string
          call_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          actor: string
          call_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          actor?: string
          call_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_audit_log_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_batches: {
        Row: {
          created_at: string
          created_by: string | null
          custom_questions: string[] | null
          id: string
          name: string
          purpose: string | null
          retry_attempts: number
          scheduled_date: string
          scheduled_time_end: string
          scheduled_time_start: string
          status: string
          target_qof_indicators: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_questions?: string[] | null
          id?: string
          name: string
          purpose?: string | null
          retry_attempts?: number
          scheduled_date: string
          scheduled_time_end?: string
          scheduled_time_start?: string
          status?: string
          target_qof_indicators?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_questions?: string[] | null
          id?: string
          name?: string
          purpose?: string | null
          retry_attempts?: number
          scheduled_date?: string
          scheduled_time_end?: string
          scheduled_time_start?: string
          status?: string
          target_qof_indicators?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      call_references: {
        Row: {
          call_id: string | null
          created_at: string | null
          id: string
          reference_code: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string | null
          id?: string
          reference_code: string
        }
        Update: {
          call_id?: string | null
          created_at?: string | null
          id?: string
          reference_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_references_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
        ]
      }
      call_responses: {
        Row: {
          alcohol_units_per_week: number | null
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          call_id: string
          collected_at: string
          created_at: string
          height_cm: number | null
          id: string
          is_carer: boolean | null
          patient_id: string
          pulse_rate: number | null
          smoking_status: string | null
          weight_kg: number | null
        }
        Insert: {
          alcohol_units_per_week?: number | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          call_id: string
          collected_at?: string
          created_at?: string
          height_cm?: number | null
          id?: string
          is_carer?: boolean | null
          patient_id: string
          pulse_rate?: number | null
          smoking_status?: string | null
          weight_kg?: number | null
        }
        Update: {
          alcohol_units_per_week?: number | null
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          call_id?: string
          collected_at?: string
          created_at?: string
          height_cm?: number | null
          id?: string
          is_carer?: boolean | null
          patient_id?: string
          pulse_rate?: number | null
          smoking_status?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_responses_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_responses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          attempt_number: number
          batch_id: string | null
          consent_given_at: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          patient_id: string
          recording_disclosure_played: boolean | null
          retention_days: number | null
          started_at: string | null
          status: string
          transcript: string | null
          transcript_deleted_at: string | null
          twilio_call_sid: string | null
        }
        Insert: {
          attempt_number?: number
          batch_id?: string | null
          consent_given_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          patient_id: string
          recording_disclosure_played?: boolean | null
          retention_days?: number | null
          started_at?: string | null
          status?: string
          transcript?: string | null
          transcript_deleted_at?: string | null
          twilio_call_sid?: string | null
        }
        Update: {
          attempt_number?: number
          batch_id?: string | null
          consent_given_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          patient_id?: string
          recording_disclosure_played?: boolean | null
          retention_days?: number | null
          started_at?: string | null
          status?: string
          transcript?: string | null
          transcript_deleted_at?: string | null
          twilio_call_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "call_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      emis_read_codes: {
        Row: {
          description: string
          id: string
          metric_type: string
          read_code: string
          snomed_code: string | null
        }
        Insert: {
          description: string
          id?: string
          metric_type: string
          read_code: string
          snomed_code?: string | null
        }
        Update: {
          description?: string
          id?: string
          metric_type?: string
          read_code?: string
          snomed_code?: string | null
        }
        Relationships: []
      }
      health_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          description: string
          id: string
          metrics: Json | null
          patient_id: string
          severity: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          description: string
          id?: string
          metrics?: Json | null
          patient_id: string
          severity: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          description?: string
          id?: string
          metrics?: Json | null
          patient_id?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      meditask_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          patient_id: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          patient_id?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          patient_id?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meditask_tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_pseudonyms: {
        Row: {
          anonymous_id: string
          created_at: string
          id: string
          patient_id: string
          rotated_at: string | null
        }
        Insert: {
          anonymous_id?: string
          created_at?: string
          id?: string
          patient_id: string
          rotated_at?: string | null
        }
        Update: {
          anonymous_id?: string
          created_at?: string
          id?: string
          patient_id?: string
          rotated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_pseudonyms_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          ai_extracted_at: string | null
          ai_extracted_summary: string | null
          allergies: string[] | null
          care_home_name: string | null
          cha2ds2_vasc_score: number | null
          cholesterol_date: string | null
          cholesterol_hdl: number | null
          cholesterol_ldl: number | null
          communication_needs: string | null
          conditions: string[] | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          dietary_requirements: string | null
          dnacpr_date: string | null
          dnacpr_status: string | null
          frailty_status: string | null
          gp_name: string | null
          gp_practice: string | null
          hba1c_date: string | null
          hba1c_mmol_mol: number | null
          id: string
          last_review_date: string | null
          medications: string[] | null
          mobility_status: string | null
          name: string
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          next_of_kin_relationship: string | null
          nhs_number: string | null
          notes: string | null
          phone_number: string
          preferred_call_time: string | null
          updated_at: string
        }
        Insert: {
          ai_extracted_at?: string | null
          ai_extracted_summary?: string | null
          allergies?: string[] | null
          care_home_name?: string | null
          cha2ds2_vasc_score?: number | null
          cholesterol_date?: string | null
          cholesterol_hdl?: number | null
          cholesterol_ldl?: number | null
          communication_needs?: string | null
          conditions?: string[] | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          dietary_requirements?: string | null
          dnacpr_date?: string | null
          dnacpr_status?: string | null
          frailty_status?: string | null
          gp_name?: string | null
          gp_practice?: string | null
          hba1c_date?: string | null
          hba1c_mmol_mol?: number | null
          id?: string
          last_review_date?: string | null
          medications?: string[] | null
          mobility_status?: string | null
          name: string
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          nhs_number?: string | null
          notes?: string | null
          phone_number: string
          preferred_call_time?: string | null
          updated_at?: string
        }
        Update: {
          ai_extracted_at?: string | null
          ai_extracted_summary?: string | null
          allergies?: string[] | null
          care_home_name?: string | null
          cha2ds2_vasc_score?: number | null
          cholesterol_date?: string | null
          cholesterol_hdl?: number | null
          cholesterol_ldl?: number | null
          communication_needs?: string | null
          conditions?: string[] | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          dietary_requirements?: string | null
          dnacpr_date?: string | null
          dnacpr_status?: string | null
          frailty_status?: string | null
          gp_name?: string | null
          gp_practice?: string | null
          hba1c_date?: string | null
          hba1c_mmol_mol?: number | null
          id?: string
          last_review_date?: string | null
          medications?: string[] | null
          mobility_status?: string | null
          name?: string
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          next_of_kin_relationship?: string | null
          nhs_number?: string | null
          notes?: string | null
          phone_number?: string
          preferred_call_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      alerts_analytics_aggregate: {
        Row: {
          acknowledged_count: number | null
          alert_count: number | null
          alert_date: string | null
          alert_type: string | null
          severity: string | null
        }
        Relationships: []
      }
      analytics_aggregate: {
        Row: {
          af_count: number | null
          asthma_count: number | null
          avg_hba1c: number | null
          chd_count: number | null
          copd_count: number | null
          diabetes_count: number | null
          frailty_mild_count: number | null
          frailty_moderate_count: number | null
          frailty_severe_count: number | null
          hba1c_above_target_count: number | null
          hypertension_count: number | null
          reviewed_last_year: number | null
          total_patients: number | null
        }
        Relationships: []
      }
      call_analytics_aggregate: {
        Row: {
          avg_duration_seconds: number | null
          call_date: string | null
          completed_calls: number | null
          failed_calls: number | null
          pending_calls: number | null
          total_calls: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_call_reference: { Args: { p_call_id: string }; Returns: string }
      get_anonymous_id: { Args: { p_patient_id: string }; Returns: string }
      log_call_audit: {
        Args: {
          p_action: string
          p_actor: string
          p_call_id: string
          p_details?: Json
          p_ip_address?: string
        }
        Returns: string
      }
      resolve_anonymous_id: {
        Args: { p_anonymous_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
