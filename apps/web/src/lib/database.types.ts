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
      admin_audit_logs: {
        Row: {
          action: string
          admin_email: string
          created_at: string
          id: string
          ip_address: string | null
          payload: Json | null
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          admin_email: string
          created_at?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          admin_email?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          target_id?: string | null
          target_table?: string
        }
        Relationships: []
      }
      audit_log_checksums: {
        Row: {
          checksum: string
          generated_at: string | null
          id: string
          row_count: number
          week_start: string
        }
        Insert: {
          checksum: string
          generated_at?: string | null
          id?: string
          row_count: number
          week_start: string
        }
        Update: {
          checksum?: string
          generated_at?: string | null
          id?: string
          row_count?: number
          week_start?: string
        }
        Relationships: []
      }
      beta_invite_registrations: {
        Row: {
          coach_id: string
          created_at: string
          email: string
          id: string
          ip_address: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          email: string
          id?: string
          ip_address: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          email?: string
          id?: string
          ip_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_invite_registrations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          back_photo_url: string | null
          client_id: string
          created_at: string
          date: string
          energy_level: number | null
          front_photo_url: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          weight: number | null
        }
        Insert: {
          back_photo_url?: string | null
          client_id: string
          created_at?: string
          date?: string
          energy_level?: number | null
          front_photo_url?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          weight?: number | null
        }
        Update: {
          back_photo_url?: string | null
          client_id?: string
          created_at?: string
          date?: string
          energy_level?: number | null
          front_photo_url?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accounts: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      client_food_preferences: {
        Row: {
          client_id: string
          created_at: string
          food_id: string
          preference_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          food_id: string
          preference_type: string
        }
        Update: {
          client_id?: string
          created_at?: string
          food_id?: string
          preference_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_food_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_food_preferences_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      client_imports: {
        Row: {
          coach_id: string | null
          completed_at: string | null
          consent_confirmed_at: string | null
          created_at: string
          error_count: number
          errors: Json
          filename: string
          id: string
          org_id: string | null
          status: string
          success_count: number
          total_rows: number
        }
        Insert: {
          coach_id?: string | null
          completed_at?: string | null
          consent_confirmed_at?: string | null
          created_at?: string
          error_count?: number
          errors?: Json
          filename: string
          id?: string
          org_id?: string | null
          status?: string
          success_count?: number
          total_rows?: number
        }
        Update: {
          coach_id?: string | null
          completed_at?: string | null
          consent_confirmed_at?: string | null
          created_at?: string
          error_count?: number
          errors?: Json
          filename?: string
          id?: string
          org_id?: string | null
          status?: string
          success_count?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_imports_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_intake: {
        Row: {
          availability: string
          client_id: string
          created_at: string
          experience_level: string
          goals: string
          height_cm: number
          id: string
          injuries: string | null
          medical_conditions: string | null
          updated_at: string
          weight_kg: number
        }
        Insert: {
          availability: string
          client_id: string
          created_at?: string
          experience_level: string
          goals: string
          height_cm: number
          id?: string
          injuries?: string | null
          medical_conditions?: string | null
          updated_at?: string
          weight_kg: number
        }
        Update: {
          availability?: string
          client_id?: string
          created_at?: string
          experience_level?: string
          goals?: string
          height_cm?: number
          id?: string
          injuries?: string | null
          medical_conditions?: string | null
          updated_at?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_intake_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_memberships: {
        Row: {
          account_id: string
          client_id: string
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string | null
          scope: string
          status: string
        }
        Insert: {
          account_id: string
          client_id: string
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string | null
          scope: string
          status?: string
        }
        Update: {
          account_id?: string
          client_id?: string
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string | null
          scope?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payments: {
        Row: {
          amount: number
          client_id: string
          coach_id: string
          created_at: string
          id: string
          payment_date: string
          period_months: number | null
          service_description: string
          status: string
        }
        Insert: {
          amount: number
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          payment_date?: string
          period_months?: number | null
          service_description: string
          status?: string
        }
        Update: {
          amount?: number
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          payment_date?: string
          period_months?: number | null
          service_description?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_payments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          age_confirmed_at: string | null
          coach_id: string | null
          created_at: string
          email: string
          force_password_change: boolean
          full_name: string
          goal_weight_kg: number | null
          id: string
          is_active: boolean | null
          is_archived: boolean
          onboarding_completed: boolean
          org_id: string | null
          phone: string | null
          subscription_start_date: string | null
          updated_at: string
          use_coach_brand_colors: boolean | null
        }
        Insert: {
          age_confirmed_at?: string | null
          coach_id?: string | null
          created_at?: string
          email: string
          force_password_change?: boolean
          full_name: string
          goal_weight_kg?: number | null
          id: string
          is_active?: boolean | null
          is_archived?: boolean
          onboarding_completed?: boolean
          org_id?: string | null
          phone?: string | null
          subscription_start_date?: string | null
          updated_at?: string
          use_coach_brand_colors?: boolean | null
        }
        Update: {
          age_confirmed_at?: string | null
          coach_id?: string | null
          created_at?: string
          email?: string
          force_password_change?: boolean
          full_name?: string
          goal_weight_kg?: number | null
          id?: string
          is_active?: boolean | null
          is_archived?: boolean
          onboarding_completed?: boolean
          org_id?: string | null
          phone?: string | null
          subscription_start_date?: string | null
          updated_at?: string
          use_coach_brand_colors?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_client_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          client_id: string
          coach_id: string
          deleted_at: string | null
          id: string
          org_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          client_id: string
          coach_id: string
          deleted_at?: string | null
          id?: string
          org_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          client_id?: string
          coach_id?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_client_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_client_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_email_drip_events: {
        Row: {
          coach_id: string
          created_at: string
          error: string | null
          id: string
          provider_message_id: string | null
          scheduled_day: number
          sent_at: string | null
          status: string
          template_key: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          scheduled_day: number
          sent_at?: string | null
          status: string
          template_key: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          scheduled_day?: number
          sent_at?: string | null
          status?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_email_drip_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_onboarding_events: {
        Row: {
          coach_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          step_key: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          step_key: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          step_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_onboarding_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          active_org_id: string | null
          admin_notes: string | null
          billing_cycle: string
          brand_name: string
          created_at: string
          current_period_end: string | null
          full_name: string
          health_data_consent_at: string | null
          id: string
          invite_code: string
          last_active_at: string | null
          loader_icon_mode: string
          loader_show_icon: boolean
          loader_text: string | null
          loader_text_color: string | null
          logo_url: string | null
          marketing_consent: boolean
          max_clients: number
          onboarding_guide: Json
          payment_provider: string
          previous_slugs: string[] | null
          primary_color: string
          registration_ip: string | null
          slug: string
          slug_changed_at: string | null
          subscription_mp_id: string | null
          subscription_status: string
          subscription_tier: string
          superseded_mp_preapproval_id: string | null
          trial_ends_at: string | null
          trial_used_email: string | null
          trial_warning_days_sent: number[]
          updated_at: string
          use_brand_colors_coach: boolean | null
          use_custom_loader: boolean
          welcome_message: string | null
          welcome_modal_content: string | null
          welcome_modal_enabled: boolean
          welcome_modal_type: string
          welcome_modal_updated_at: string | null
          welcome_modal_version: number
        }
        Insert: {
          active_org_id?: string | null
          admin_notes?: string | null
          billing_cycle?: string
          brand_name: string
          created_at?: string
          current_period_end?: string | null
          full_name: string
          health_data_consent_at?: string | null
          id: string
          invite_code?: string
          last_active_at?: string | null
          loader_icon_mode?: string
          loader_show_icon?: boolean
          loader_text?: string | null
          loader_text_color?: string | null
          logo_url?: string | null
          marketing_consent?: boolean
          max_clients?: number
          onboarding_guide?: Json
          payment_provider?: string
          previous_slugs?: string[] | null
          primary_color?: string
          registration_ip?: string | null
          slug: string
          slug_changed_at?: string | null
          subscription_mp_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          superseded_mp_preapproval_id?: string | null
          trial_ends_at?: string | null
          trial_used_email?: string | null
          trial_warning_days_sent?: number[]
          updated_at?: string
          use_brand_colors_coach?: boolean | null
          use_custom_loader?: boolean
          welcome_message?: string | null
          welcome_modal_content?: string | null
          welcome_modal_enabled?: boolean
          welcome_modal_type?: string
          welcome_modal_updated_at?: string | null
          welcome_modal_version?: number
        }
        Update: {
          active_org_id?: string | null
          admin_notes?: string | null
          billing_cycle?: string
          brand_name?: string
          created_at?: string
          current_period_end?: string | null
          full_name?: string
          health_data_consent_at?: string | null
          id?: string
          invite_code?: string
          last_active_at?: string | null
          loader_icon_mode?: string
          loader_show_icon?: boolean
          loader_text?: string | null
          loader_text_color?: string | null
          logo_url?: string | null
          marketing_consent?: boolean
          max_clients?: number
          onboarding_guide?: Json
          payment_provider?: string
          previous_slugs?: string[] | null
          primary_color?: string
          registration_ip?: string | null
          slug?: string
          slug_changed_at?: string | null
          subscription_mp_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          superseded_mp_preapproval_id?: string | null
          trial_ends_at?: string | null
          trial_used_email?: string | null
          trial_warning_days_sent?: number[]
          updated_at?: string
          use_brand_colors_coach?: boolean | null
          use_custom_loader?: boolean
          welcome_message?: string | null
          welcome_modal_content?: string | null
          welcome_modal_enabled?: boolean
          welcome_modal_type?: string
          welcome_modal_updated_at?: string | null
          welcome_modal_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "coaches_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_habits: {
        Row: {
          client_id: string
          created_at: string
          fasting_hours: number | null
          id: string
          log_date: string
          notes: string | null
          sleep_hours: number | null
          steps: number | null
          supplements: string[] | null
          updated_at: string
          water_ml: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          fasting_hours?: number | null
          id?: string
          log_date: string
          notes?: string | null
          sleep_hours?: number | null
          steps?: number | null
          supplements?: string[] | null
          updated_at?: string
          water_ml?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          fasting_hours?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          sleep_hours?: number | null
          steps?: number | null
          supplements?: string[] | null
          updated_at?: string
          water_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_habits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_nutrition_logs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          log_date: string
          plan_id: string
          plan_name_at_log: string | null
          target_calories_at_log: number | null
          target_carbs_at_log: number | null
          target_fats_at_log: number | null
          target_protein_at_log: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          log_date: string
          plan_id: string
          plan_name_at_log?: string | null
          target_calories_at_log?: number | null
          target_carbs_at_log?: number | null
          target_fats_at_log?: number | null
          target_protein_at_log?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          log_date?: string
          plan_id?: string
          plan_name_at_log?: string | null
          target_calories_at_log?: number | null
          target_carbs_at_log?: number | null
          target_fats_at_log?: number | null
          target_protein_at_log?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_nutrition_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_nutrition_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          body_part: string | null
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          difficulty: string | null
          equipment: string | null
          gender_focus: string | null
          gif_url: string | null
          id: string
          image_url: string | null
          instructions: string[] | null
          muscle_group: string
          name: string
          org_id: string | null
          secondary_muscles: string[] | null
          source: string | null
          video_url: string | null
        }
        Insert: {
          body_part?: string | null
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          difficulty?: string | null
          equipment?: string | null
          gender_focus?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          instructions?: string[] | null
          muscle_group: string
          name: string
          org_id?: string | null
          secondary_muscles?: string[] | null
          source?: string | null
          video_url?: string | null
        }
        Update: {
          body_part?: string | null
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          difficulty?: string | null
          equipment?: string | null
          gender_focus?: string | null
          gif_url?: string | null
          id?: string
          image_url?: string | null
          instructions?: string[] | null
          muscle_group?: string
          name?: string
          org_id?: string | null
          secondary_muscles?: string[] | null
          source?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises_backup_20260405: {
        Row: {
          body_part: string | null
          coach_id: string | null
          created_at: string | null
          difficulty: string | null
          equipment: string | null
          gender_focus: string | null
          gif_url: string | null
          id: string | null
          instructions: string[] | null
          muscle_group: string | null
          name: string | null
          secondary_muscles: string[] | null
          video_url: string | null
        }
        Insert: {
          body_part?: string | null
          coach_id?: string | null
          created_at?: string | null
          difficulty?: string | null
          equipment?: string | null
          gender_focus?: string | null
          gif_url?: string | null
          id?: string | null
          instructions?: string[] | null
          muscle_group?: string | null
          name?: string | null
          secondary_muscles?: string[] | null
          video_url?: string | null
        }
        Update: {
          body_part?: string | null
          coach_id?: string | null
          created_at?: string | null
          difficulty?: string | null
          equipment?: string | null
          gender_focus?: string | null
          gif_url?: string | null
          id?: string | null
          instructions?: string[] | null
          muscle_group?: string | null
          name?: string | null
          secondary_muscles?: string[] | null
          video_url?: string | null
        }
        Relationships: []
      }
      food_items: {
        Row: {
          food_id: string
          id: string
          meal_id: string
          quantity: number
          swap_options: Json
          unit: string | null
        }
        Insert: {
          food_id: string
          id?: string
          meal_id: string
          quantity: number
          swap_options?: Json
          unit?: string | null
        }
        Update: {
          food_id?: string
          id?: string
          meal_id?: string
          quantity?: number
          swap_options?: Json
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      food_swap_groups: {
        Row: {
          coach_id: string
          created_at: string
          food_ids: string[]
          id: string
          name: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          food_ids?: string[]
          id?: string
          name: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          food_ids?: string[]
          id?: string
          name?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_swap_groups_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_swap_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          brand: string | null
          calories: number
          carbs_g: number
          category: string | null
          coach_id: string | null
          fats_g: number
          id: string
          is_liquid: boolean
          name: string
          name_search: string | null
          org_id: string | null
          protein_g: number
          serving_size: number
          serving_unit: string | null
        }
        Insert: {
          brand?: string | null
          calories: number
          carbs_g: number
          category?: string | null
          coach_id?: string | null
          fats_g: number
          id?: string
          is_liquid?: boolean
          name: string
          name_search?: string | null
          org_id?: string | null
          protein_g: number
          serving_size: number
          serving_unit?: string | null
        }
        Update: {
          brand?: string | null
          calories?: number
          carbs_g?: number
          category?: string | null
          coach_id?: string | null
          fats_g?: number
          id?: string
          is_liquid?: boolean
          name?: string
          name_search?: string | null
          org_id?: string | null
          protein_g?: number
          serving_size?: number
          serving_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "foods_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          id: string
          image_url: string | null
          is_pinned: boolean | null
          published_at: string | null
          status: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean | null
          published_at?: string | null
          status?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean | null
          published_at?: string | null
          status?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      news_reads: {
        Row: {
          coach_id: string
          id: string
          news_item_id: string
          read_at: string | null
        }
        Insert: {
          coach_id: string
          id?: string
          news_item_id: string
          read_at?: string | null
        }
        Update: {
          coach_id?: string
          id?: string
          news_item_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_reads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_reads_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_meal_food_swaps: {
        Row: {
          client_id: string
          created_at: string
          daily_log_id: string
          id: string
          meal_id: string
          original_food_id: string
          swapped_food_id: string
          swapped_quantity: number | null
          swapped_unit: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          daily_log_id: string
          id?: string
          meal_id: string
          original_food_id: string
          swapped_food_id: string
          swapped_quantity?: number | null
          swapped_unit?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          daily_log_id?: string
          id?: string
          meal_id?: string
          original_food_id?: string
          swapped_food_id?: string
          swapped_quantity?: number | null
          swapped_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_meal_food_swaps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_food_swaps_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_nutrition_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_food_swaps_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_food_swaps_original_food_id_fkey"
            columns: ["original_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_food_swaps_swapped_food_id_fkey"
            columns: ["swapped_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_meal_logs: {
        Row: {
          consumed_quantity: number | null
          created_at: string
          daily_log_id: string
          id: string
          is_completed: boolean
          meal_id: string
          satisfaction_score: number | null
        }
        Insert: {
          consumed_quantity?: number | null
          created_at?: string
          daily_log_id: string
          id?: string
          is_completed?: boolean
          meal_id: string
          satisfaction_score?: number | null
        }
        Update: {
          consumed_quantity?: number | null
          created_at?: string
          daily_log_id?: string
          id?: string
          is_completed?: boolean
          meal_id?: string
          satisfaction_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_meal_logs_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_nutrition_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_logs_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_meals: {
        Row: {
          created_at: string
          day_of_week: number | null
          description: string
          id: string
          name: string
          order_index: number
          plan_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          description?: string
          id?: string
          name: string
          order_index?: number
          plan_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          description?: string
          id?: string
          name?: string
          order_index?: number
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_meals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plan_cycles: {
        Row: {
          blocks: Json
          client_id: string
          coach_id: string
          created_at: string
          id: string
          is_active: boolean
          last_applied_template_id: string | null
          last_applied_week: number | null
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_applied_template_id?: string | null
          last_applied_week?: number | null
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_applied_template_id?: string | null
          last_applied_week?: number | null
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_cycles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_cycles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_cycles_last_applied_template_id_fkey"
            columns: ["last_applied_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plan_history: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          id: string
          label: string | null
          nutrition_plan_id: string
          snapshot: Json
          source: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          label?: string | null
          nutrition_plan_id: string
          snapshot: Json
          source?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          label?: string | null
          nutrition_plan_id?: string
          snapshot?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_history_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_history_nutrition_plan_id_fkey"
            columns: ["nutrition_plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plan_templates: {
        Row: {
          carbs_g: number | null
          coach_id: string | null
          created_at: string
          daily_calories: number | null
          description: string | null
          fats_g: number | null
          goal_type: string | null
          id: string
          instructions: string | null
          is_favorite: boolean | null
          name: string
          org_id: string | null
          protein_g: number | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          carbs_g?: number | null
          coach_id?: string | null
          created_at?: string
          daily_calories?: number | null
          description?: string | null
          fats_g?: number | null
          goal_type?: string | null
          id?: string
          instructions?: string | null
          is_favorite?: boolean | null
          name: string
          org_id?: string | null
          protein_g?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          carbs_g?: number | null
          coach_id?: string | null
          created_at?: string
          daily_calories?: number | null
          description?: string | null
          fats_g?: number | null
          goal_type?: string | null
          id?: string
          instructions?: string | null
          is_favorite?: boolean | null
          name?: string
          org_id?: string | null
          protein_g?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_templates_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plans: {
        Row: {
          carbs_g: number | null
          client_id: string
          coach_id: string
          created_at: string
          daily_calories: number | null
          fats_g: number | null
          id: string
          instructions: string | null
          is_active: boolean
          is_custom: boolean | null
          name: string
          org_id: string | null
          protein_g: number | null
          template_id: string | null
          template_version_id: string | null
          updated_at: string
        }
        Insert: {
          carbs_g?: number | null
          client_id: string
          coach_id: string
          created_at?: string
          daily_calories?: number | null
          fats_g?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_custom?: boolean | null
          name: string
          org_id?: string | null
          protein_g?: number | null
          template_id?: string | null
          template_version_id?: string | null
          updated_at?: string
        }
        Update: {
          carbs_g?: number | null
          client_id?: string
          coach_id?: string
          created_at?: string
          daily_calories?: number | null
          fats_g?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_custom?: boolean | null
          name?: string
          org_id?: string | null
          protein_g?: number | null
          template_id?: string | null
          template_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      org_announcements: {
        Row: {
          active_until: string | null
          audience: string
          body: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          org_id: string
          published_at: string | null
          title: string
        }
        Insert: {
          active_until?: string | null
          audience?: string
          body: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          published_at?: string | null
          title: string
        }
        Update: {
          active_until?: string | null
          audience?: string
          body?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          published_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_announcements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          org_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invoices: {
        Row: {
          amount_clp: number
          created_at: string | null
          expected_amount_clp: number | null
          id: string
          notes: string | null
          org_id: string
          paid_at: string | null
          payment_ref: string | null
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          amount_clp: number
          created_at?: string | null
          expected_amount_clp?: number | null
          id?: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          payment_ref?: string | null
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          amount_clp?: number
          created_at?: string | null
          expected_amount_clp?: number | null
          id?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          payment_ref?: string | null
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_nutrition_templates: {
        Row: {
          carbs_g: number | null
          created_at: string | null
          created_by: string | null
          daily_calories: number | null
          description: string | null
          fats_g: number | null
          goal_type: string | null
          id: string
          instructions: string | null
          meal_names: Json
          name: string
          org_id: string
          protein_g: number | null
        }
        Insert: {
          carbs_g?: number | null
          created_at?: string | null
          created_by?: string | null
          daily_calories?: number | null
          description?: string | null
          fats_g?: number | null
          goal_type?: string | null
          id?: string
          instructions?: string | null
          meal_names?: Json
          name: string
          org_id: string
          protein_g?: number | null
        }
        Update: {
          carbs_g?: number | null
          created_at?: string | null
          created_by?: string | null
          daily_calories?: number | null
          description?: string | null
          fats_g?: number | null
          goal_type?: string | null
          id?: string
          instructions?: string | null
          meal_names?: Json
          name?: string
          org_id?: string
          protein_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "org_nutrition_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_weekly_snapshots: {
        Row: {
          active_clients: number
          assigned_clients: number
          assignment_rate: number
          check_ins_7d: number
          created_at: string
          health_score: number | null
          id: string
          org_id: string
          total_coaches: number
          week_start: string
        }
        Insert: {
          active_clients?: number
          assigned_clients?: number
          assignment_rate?: number
          check_ins_7d?: number
          created_at?: string
          health_score?: number | null
          id?: string
          org_id: string
          total_coaches?: number
          week_start: string
        }
        Update: {
          active_clients?: number
          assigned_clients?: number
          assignment_rate?: number
          check_ins_7d?: number
          created_at?: string
          health_score?: number | null
          id?: string
          org_id?: string
          total_coaches?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_weekly_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          attempt_count: number
          created_by: string
          deleted_at: string | null
          email: string
          expires_at: string
          id: string
          last_attempt_at: string | null
          max_attempts: number
          org_id: string
          redeemed_at: string | null
          redeemed_by: string | null
          role: string
          status: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          attempt_count?: number
          created_by: string
          deleted_at?: string | null
          email: string
          expires_at?: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          org_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          role: string
          status?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          attempt_count?: number
          created_by?: string
          deleted_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          org_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          role?: string
          status?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          coach_id: string | null
          deleted_at: string | null
          id: string
          invite_code: string | null
          invited_at: string | null
          joined_at: string | null
          last_health_score: number | null
          last_health_score_at: string | null
          org_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          coach_id?: string | null
          deleted_at?: string | null
          id?: string
          invite_code?: string | null
          invited_at?: string | null
          joined_at?: string | null
          last_health_score?: number | null
          last_health_score_at?: string | null
          org_id: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          coach_id?: string | null
          deleted_at?: string | null
          id?: string
          invite_code?: string | null
          invited_at?: string | null
          joined_at?: string | null
          last_health_score?: number | null
          last_health_score_at?: string | null
          org_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_dark: string | null
          accent_light: string | null
          billing_cycle: string | null
          billing_start_date: string | null
          brand_draft: Json | null
          brand_history: Json
          brand_published_at: string | null
          brand_published_by: string | null
          client_limit: number
          created_at: string | null
          currency: string
          default_coach_capacity: number
          deleted_at: string | null
          id: string
          last_health_score: number | null
          last_health_score_at: string | null
          loader_icon_mode: string
          loader_text: string | null
          loader_text_color: string | null
          logo_url: string | null
          logo_url_dark: string | null
          name: string
          neutral_tint: boolean
          onboarding_step: number | null
          owner_user_id: string
          plan: string
          primary_color: string | null
          purge_scheduled_at: string | null
          seats_included: number
          slug: string
          splash_bg_color: string | null
          status: string
          trial_ends_at: string | null
          use_custom_loader: boolean
        }
        Insert: {
          accent_dark?: string | null
          accent_light?: string | null
          billing_cycle?: string | null
          billing_start_date?: string | null
          brand_draft?: Json | null
          brand_history?: Json
          brand_published_at?: string | null
          brand_published_by?: string | null
          client_limit?: number
          created_at?: string | null
          currency?: string
          default_coach_capacity?: number
          deleted_at?: string | null
          id?: string
          last_health_score?: number | null
          last_health_score_at?: string | null
          loader_icon_mode?: string
          loader_text?: string | null
          loader_text_color?: string | null
          logo_url?: string | null
          logo_url_dark?: string | null
          name: string
          neutral_tint?: boolean
          onboarding_step?: number | null
          owner_user_id: string
          plan?: string
          primary_color?: string | null
          purge_scheduled_at?: string | null
          seats_included?: number
          slug: string
          splash_bg_color?: string | null
          status?: string
          trial_ends_at?: string | null
          use_custom_loader?: boolean
        }
        Update: {
          accent_dark?: string | null
          accent_light?: string | null
          billing_cycle?: string | null
          billing_start_date?: string | null
          brand_draft?: Json | null
          brand_history?: Json
          brand_published_at?: string | null
          brand_published_by?: string | null
          client_limit?: number
          created_at?: string | null
          currency?: string
          default_coach_capacity?: number
          deleted_at?: string | null
          id?: string
          last_health_score?: number | null
          last_health_score_at?: string | null
          loader_icon_mode?: string
          loader_text?: string | null
          loader_text_color?: string | null
          logo_url?: string | null
          logo_url_dark?: string | null
          name?: string
          neutral_tint?: boolean
          onboarding_step?: number | null
          owner_user_id?: string
          plan?: string
          primary_color?: string | null
          purge_scheduled_at?: string | null
          seats_included?: number
          slug?: string
          splash_bg_color?: string | null
          status?: string
          trial_ends_at?: string | null
          use_custom_loader?: boolean
        }
        Relationships: []
      }
      payment_exceptions: {
        Row: {
          amount_clp: number
          approved_at: string | null
          approved_by: string | null
          id: string
          notes: string | null
          org_id: string
          reason: string
          resend_message_id: string | null
        }
        Insert: {
          amount_clp: number
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          reason: string
          resend_message_id?: string | null
        }
        Update: {
          amount_clp?: number
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          reason?: string
          resend_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_exceptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_gastos: {
        Row: {
          cantidad: number
          costo: number
          created_at: string
          id: string
          nombre: string
          pagador: string
        }
        Insert: {
          cantidad?: number
          costo: number
          created_at?: string
          id?: string
          nombre: string
          pagador: string
        }
        Update: {
          cantidad?: number
          costo?: number
          created_at?: string
          id?: string
          nombre?: string
          pagador?: string
        }
        Relationships: []
      }
      purge_audit: {
        Row: {
          id: string
          initiated_by: string | null
          org_id: string
          org_slug: string
          purged_at: string | null
          rows_deleted: Json | null
        }
        Insert: {
          id?: string
          initiated_by?: string | null
          org_id: string
          org_slug: string
          purged_at?: string | null
          rows_deleted?: Json | null
        }
        Update: {
          id?: string
          initiated_by?: string | null
          org_id?: string
          org_slug?: string
          purged_at?: string | null
          rows_deleted?: Json | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          client_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
        }
        Insert: {
          auth: string
          client_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
        }
        Update: {
          auth?: string
          client_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string | null
          device_id: string
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          id?: string
          platform: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          food_id: string | null
          id: string
          name: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          food_id?: string | null
          id?: string
          name: string
          quantity: number
          recipe_id: string
          unit: string
        }
        Update: {
          created_at?: string
          food_id?: string | null
          id?: string
          name?: string
          quantity?: number
          recipe_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          calories: number | null
          carbs_g: number | null
          coach_id: string | null
          created_at: string
          description: string | null
          fats_g: number | null
          id: string
          image_url: string | null
          instructions: string | null
          name: string
          prep_time_minutes: number | null
          protein_g: number | null
          source_api: string | null
          source_api_id: string | null
          updated_at: string
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          coach_id?: string | null
          created_at?: string
          description?: string | null
          fats_g?: number | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          name: string
          prep_time_minutes?: number | null
          protein_g?: number | null
          source_api?: string | null
          source_api_id?: string | null
          updated_at?: string
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          coach_id?: string | null
          created_at?: string
          description?: string | null
          fats_g?: number | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          name?: string
          prep_time_minutes?: number | null
          protein_g?: number | null
          source_api?: string | null
          source_api_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_meal_items: {
        Row: {
          food_id: string
          id: string
          quantity: number
          saved_meal_id: string
          swap_options: Json
          unit: string | null
        }
        Insert: {
          food_id: string
          id?: string
          quantity: number
          saved_meal_id: string
          swap_options?: Json
          unit?: string | null
        }
        Update: {
          food_id?: string
          id?: string
          quantity?: number
          saved_meal_id?: string
          swap_options?: Json
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_meal_items_saved_meal_id_fkey"
            columns: ["saved_meal_id"]
            isOneToOne: false
            referencedRelation: "saved_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_meals: {
        Row: {
          coach_id: string
          id: string
          name: string
          org_id: string | null
        }
        Insert: {
          coach_id: string
          id?: string
          name: string
          org_id?: string | null
        }
        Update: {
          coach_id?: string
          id?: string
          name?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_meals_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_meals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          org_id: string | null
          payload: Json | null
          provider: string
          provider_checkout_id: string | null
          provider_event_id: string | null
          provider_status: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          org_id?: string | null
          payload?: Json | null
          provider: string
          provider_checkout_id?: string | null
          provider_event_id?: string | null
          provider_status?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          org_id?: string | null
          payload?: Json | null
          provider?: string
          provider_checkout_id?: string | null
          provider_event_id?: string | null
          provider_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_meal_groups: {
        Row: {
          id: string
          order_index: number
          saved_meal_id: string
          template_meal_id: string
        }
        Insert: {
          id?: string
          order_index?: number
          saved_meal_id: string
          template_meal_id: string
        }
        Update: {
          id?: string
          order_index?: number
          saved_meal_id?: string
          template_meal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_meal_groups_saved_meal_id_fkey"
            columns: ["saved_meal_id"]
            isOneToOne: false
            referencedRelation: "saved_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_meal_groups_template_meal_id_fkey"
            columns: ["template_meal_id"]
            isOneToOne: false
            referencedRelation: "template_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      template_meals: {
        Row: {
          created_at: string
          day_of_week: number | null
          description: string
          id: string
          name: string
          order_index: number
          template_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          description?: string
          id?: string
          name: string
          order_index?: number
          template_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          description?: string
          id?: string
          name?: string
          order_index?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_meals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_blocks: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          is_override: boolean
          notes: string | null
          order_index: number
          plan_id: string
          progression_type: string | null
          progression_value: number | null
          reps: string
          rest_time: string | null
          rir: string | null
          section: string
          sets: number
          superset_group: string | null
          target_weight_kg: number | null
          tempo: string | null
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          is_override?: boolean
          notes?: string | null
          order_index?: number
          plan_id: string
          progression_type?: string | null
          progression_value?: number | null
          reps?: string
          rest_time?: string | null
          rir?: string | null
          section?: string
          sets?: number
          superset_group?: string | null
          target_weight_kg?: number | null
          tempo?: string | null
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          is_override?: boolean
          notes?: string | null
          order_index?: number
          plan_id?: string
          progression_type?: string | null
          progression_value?: number | null
          reps?: string
          rest_time?: string | null
          rir?: string | null
          section?: string
          sets?: number
          superset_group?: string | null
          target_weight_kg?: number | null
          tempo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_blocks_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_blocks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          block_id: string
          client_id: string
          exercise_name_at_log: string | null
          id: string
          logged_at: string
          plan_name_at_log: string | null
          reps_done: number | null
          rir: number | null
          rpe: number | null
          set_number: number
          target_reps_at_log: string | null
          target_weight_at_log: number | null
          weight_kg: number | null
        }
        Insert: {
          block_id: string
          client_id: string
          exercise_name_at_log?: string | null
          id?: string
          logged_at?: string
          plan_name_at_log?: string | null
          reps_done?: number | null
          rir?: number | null
          rpe?: number | null
          set_number: number
          target_reps_at_log?: string | null
          target_weight_at_log?: number | null
          weight_kg?: number | null
        }
        Update: {
          block_id?: string
          client_id?: string
          exercise_name_at_log?: string | null
          id?: string
          logged_at?: string
          plan_name_at_log?: string | null
          reps_done?: number | null
          rir?: number | null
          rpe?: number | null
          set_number?: number
          target_reps_at_log?: string | null
          target_weight_at_log?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "workout_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          assigned_date: string | null
          client_id: string | null
          coach_id: string
          created_at: string
          day_of_week: number | null
          group_name: string | null
          id: string
          program_id: string | null
          title: string
          updated_at: string
          week_variant: string | null
        }
        Insert: {
          assigned_date?: string | null
          client_id?: string | null
          coach_id: string
          created_at?: string
          day_of_week?: number | null
          group_name?: string | null
          id?: string
          program_id?: string | null
          title: string
          updated_at?: string
          week_variant?: string | null
        }
        Update: {
          assigned_date?: string | null
          client_id?: string | null
          coach_id?: string
          created_at?: string
          day_of_week?: number | null
          group_name?: string | null
          id?: string
          program_id?: string | null
          title?: string
          updated_at?: string
          week_variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_plans_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "workout_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_programs: {
        Row: {
          ab_mode: boolean | null
          client_id: string | null
          coach_id: string | null
          created_at: string
          created_by_coach_id: string | null
          cycle_length: number | null
          duration_days: number | null
          duration_type: string | null
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string | null
          program_notes: string | null
          program_phases: Json
          program_structure_type: string | null
          source_template_id: string | null
          start_date: string | null
          start_date_flexible: boolean | null
          updated_at: string
          weeks_to_repeat: number
        }
        Insert: {
          ab_mode?: boolean | null
          client_id?: string | null
          coach_id?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          cycle_length?: number | null
          duration_days?: number | null
          duration_type?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string | null
          program_notes?: string | null
          program_phases?: Json
          program_structure_type?: string | null
          source_template_id?: string | null
          start_date?: string | null
          start_date_flexible?: boolean | null
          updated_at?: string
          weeks_to_repeat?: number
        }
        Update: {
          ab_mode?: boolean | null
          client_id?: string | null
          coach_id?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          cycle_length?: number | null
          duration_days?: number | null
          duration_type?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string | null
          program_notes?: string | null
          program_phases?: Json
          program_structure_type?: string | null
          source_template_id?: string | null
          start_date?: string | null
          start_date_flexible?: boolean | null
          updated_at?: string
          weeks_to_repeat?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_programs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_programs_created_by_coach_id_fkey"
            columns: ["created_by_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_programs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_programs_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "workout_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          client_id: string
          created_at: string
          date_completed: string
          id: string
          notes: string | null
          plan_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          date_completed?: string
          id?: string
          notes?: string | null
          plan_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          date_completed?: string
          id?: string
          notes?: string | null
          plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_preferences: {
        Row: {
          last_client_id: string | null
          last_coach_id: string | null
          last_org_id: string | null
          last_workspace_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_client_id?: string | null
          last_coach_id?: string | null
          last_org_id?: string | null
          last_workspace_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_client_id?: string | null
          last_coach_id?: string | null
          last_org_id?: string | null
          last_workspace_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_preferences_last_client_id_fkey"
            columns: ["last_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_preferences_last_coach_id_fkey"
            columns: ["last_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_preferences_last_org_id_fkey"
            columns: ["last_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      meal_completions: {
        Row: {
          client_id: string | null
          created_at: string | null
          date_completed: string | null
          id: string | null
          meal_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_nutrition_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_logs_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bulk_assign_selected_clients: {
        Args: {
          p_actor_id: string
          p_client_ids: string[]
          p_coach_id: string
          p_org_id: string
        }
        Returns: number
      }
      bulk_reassign_clients: {
        Args: {
          p_from_coach_id: string
          p_org_id: string
          p_to_coach_id: string
        }
        Returns: number
      }
      bulk_reassign_clients_with_audit: {
        Args: {
          p_actor_id: string
          p_from_coach_id: string
          p_member_id: string
          p_org_id: string
          p_to_coach_id: string
        }
        Returns: number
      }
      check_platform_email_availability: {
        Args: { p_email: string }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      generate_unique_invite_code: { Args: never; Returns: string }
      get_admin_audit_logs_paginated: {
        Args: {
          p_action?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_target?: string
          p_to?: string
        }
        Returns: {
          action: string
          admin_email: string
          created_at: string
          id: string
          ip_address: string
          payload: Json
          target_id: string
          target_table: string
          total_count: number
        }[]
      }
      get_admin_coaches_paginated: {
        Args: {
          p_beta?: boolean
          p_dir?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
          p_status?: string
          p_tier?: string
        }
        Returns: {
          active_client_count: number
          auth_email: string
          billing_cycle: string
          brand_name: string
          client_count: number
          coach_last_active_at: string
          created_at: string
          current_period_end: string
          days_until_expiry: number
          full_name: string
          id: string
          last_activity_at: string
          max_clients: number
          payment_provider: string
          slug: string
          subscription_status: string
          subscription_tier: string
          total_count: number
          trial_ends_at: string
          utilization_pct: number
        }[]
      }
      get_client_current_streak: {
        Args: { p_client_id: string }
        Returns: number
      }
      get_client_workout_day_counts: {
        Args: { p_client_id: string; p_days_back: number }
        Returns: {
          day: string
          sets: number
        }[]
      }
      get_clients_last_workout_date: {
        Args: { p_client_ids: string[]; p_since: string }
        Returns: {
          client_id: string
          last_logged_at: string
        }[]
      }
      get_coach_client_signups_last_6_months: {
        Args: { p_coach_id: string }
        Returns: {
          client_count: number
          ym: string
        }[]
      }
      get_coach_clients_streaks: {
        Args: { p_coach_id: string }
        Returns: {
          client_id: string
          streak: number
        }[]
      }
      get_coach_workout_sessions_30d: {
        Args: { p_coach_id: string }
        Returns: {
          day: string
          sessions: number
        }[]
      }
      get_platform_checkins_7d: { Args: never; Returns: number }
      get_platform_churn_last_30d: {
        Args: never
        Returns: {
          churned_at: string
          coach_id: string
          coach_name: string
          tier: string
        }[]
      }
      get_platform_churn_monthly: {
        Args: never
        Returns: {
          churned_count: number
          ym: string
        }[]
      }
      get_platform_clients_count: { Args: never; Returns: number }
      get_platform_coach_signups_last_6_months: {
        Args: never
        Returns: {
          coach_count: number
          ym: string
        }[]
      }
      get_platform_coaches_by_tier: {
        Args: never
        Returns: {
          coach_count: number
          tier: string
        }[]
      }
      get_platform_coaches_by_tier_monthly: {
        Args: never
        Returns: {
          coach_count: number
          tier: string
          ym: string
        }[]
      }
      get_platform_coaches_count: { Args: never; Returns: number }
      get_platform_mrr_12_months: {
        Args: never
        Returns: {
          coach_count: number
          mrr_clp: number
          ym: string
        }[]
      }
      get_platform_revenue_by_cycle: {
        Args: never
        Returns: {
          billing_cycle: string
          coach_count: number
          mrr_clp: number
        }[]
      }
      get_platform_revenue_by_tier: {
        Args: never
        Returns: {
          coach_count: number
          mrr_clp: number
          tier: string
        }[]
      }
      get_platform_subscription_events_series: {
        Args: never
        Returns: {
          event_count: number
          ym: string
        }[]
      }
      get_platform_trial_conversion_rate: {
        Args: never
        Returns: {
          converted: number
          total_trials: number
        }[]
      }
      get_platform_workout_sessions_30d: {
        Args: never
        Returns: {
          day: string
          sessions: number
        }[]
      }
      get_workout_program_planned_set_totals: {
        Args: { p_program_ids: string[] }
        Returns: {
          program_id: string
          total_planned_sets: number
        }[]
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      get_enterprise_alumno_context: { Args: { p_org_slug: string }; Returns: Json }
      get_org_branding: { Args: { p_org_id: string }; Returns: Json }
      is_active_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_coach_active_org_member: {
        Args: { p_coach_id: string; p_org_id: string }
        Returns: boolean
      }
      is_org_admin_member: { Args: { p_org_id: string }; Returns: boolean }
      is_org_coach_assigned_to_client: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      is_org_coach_member: {
        Args: { p_coach_id: string; p_org_id: string }
        Returns: boolean
      }
      search_foods: {
        Args: { search_term: string }
        Returns: {
          brand: string | null
          calories: number
          carbs_g: number
          category: string | null
          coach_id: string | null
          fats_g: number
          id: string
          is_liquid: boolean
          name: string
          name_search: string | null
          org_id: string | null
          protein_g: number
          serving_size: number
          serving_unit: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "foods"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      touch_coach_activity: { Args: { p_coach_id: string }; Returns: undefined }
      try_uuid: { Args: { p_value: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
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
