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
        ]
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
          coach_id: string
          created_at: string
          email: string
          force_password_change: boolean
          full_name: string
          goal_weight_kg: number | null
          id: string
          is_active: boolean | null
          onboarding_completed: boolean
          phone: string | null
          subscription_start_date: string | null
          updated_at: string
          use_coach_brand_colors: boolean | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          email: string
          force_password_change?: boolean
          full_name: string
          goal_weight_kg?: number | null
          id: string
          is_active?: boolean | null
          onboarding_completed?: boolean
          phone?: string | null
          subscription_start_date?: string | null
          updated_at?: string
          use_coach_brand_colors?: boolean | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          email?: string
          force_password_change?: boolean
          full_name?: string
          goal_weight_kg?: number | null
          id?: string
          is_active?: boolean | null
          onboarding_completed?: boolean
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
          admin_notes: string | null
          billing_cycle: string
          brand_name: string
          created_at: string
          current_period_end: string | null
          full_name: string
          id: string
          loader_icon_mode: string
          loader_show_icon: boolean
          loader_text: string | null
          loader_text_color: string | null
          logo_url: string | null
          max_clients: number
          onboarding_guide: Json
          payment_provider: string
          previous_slugs: string[] | null
          primary_color: string
          slug: string
          slug_changed_at: string | null
          subscription_mp_id: string | null
          subscription_status: string
          subscription_tier: string
          superseded_mp_preapproval_id: string | null
          trial_ends_at: string | null
          trial_used_email: string | null
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
          admin_notes?: string | null
          billing_cycle?: string
          brand_name: string
          created_at?: string
          current_period_end?: string | null
          full_name: string
          id: string
          loader_icon_mode?: string
          loader_show_icon?: boolean
          loader_text?: string | null
          loader_text_color?: string | null
          logo_url?: string | null
          max_clients?: number
          onboarding_guide?: Json
          payment_provider?: string
          previous_slugs?: string[] | null
          primary_color?: string
          slug: string
          slug_changed_at?: string | null
          subscription_mp_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          superseded_mp_preapproval_id?: string | null
          trial_ends_at?: string | null
          trial_used_email?: string | null
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
          admin_notes?: string | null
          billing_cycle?: string
          brand_name?: string
          created_at?: string
          current_period_end?: string | null
          full_name?: string
          id?: string
          loader_icon_mode?: string
          loader_show_icon?: boolean
          loader_text?: string | null
          loader_text_color?: string | null
          logo_url?: string | null
          max_clients?: number
          onboarding_guide?: Json
          payment_provider?: string
          previous_slugs?: string[] | null
          primary_color?: string
          slug?: string
          slug_changed_at?: string | null
          subscription_mp_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          superseded_mp_preapproval_id?: string | null
          trial_ends_at?: string | null
          trial_used_email?: string | null
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
        Relationships: []
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
          difficulty: string | null
          equipment: string | null
          gender_focus: string | null
          gif_url: string | null
          id: string
          instructions: string[] | null
          muscle_group: string
          name: string
          secondary_muscles: string[] | null
          video_url: string | null
        }
        Insert: {
          body_part?: string | null
          coach_id?: string | null
          created_at?: string
          difficulty?: string | null
          equipment?: string | null
          gender_focus?: string | null
          gif_url?: string | null
          id?: string
          instructions?: string[] | null
          muscle_group: string
          name: string
          secondary_muscles?: string[] | null
          video_url?: string | null
        }
        Update: {
          body_part?: string | null
          coach_id?: string | null
          created_at?: string
          difficulty?: string | null
          equipment?: string | null
          gender_focus?: string | null
          gif_url?: string | null
          id?: string
          instructions?: string[] | null
          muscle_group?: string
          name?: string
          secondary_muscles?: string[] | null
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
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          food_ids?: string[]
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          food_ids?: string[]
          id?: string
          name?: string
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
          coach_id: string
          created_at: string
          daily_calories: number | null
          description: string | null
          fats_g: number | null
          goal_type: string | null
          id: string
          instructions: string | null
          is_favorite: boolean | null
          name: string
          protein_g: number | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          carbs_g?: number | null
          coach_id: string
          created_at?: string
          daily_calories?: number | null
          description?: string | null
          fats_g?: number | null
          goal_type?: string | null
          id?: string
          instructions?: string | null
          is_favorite?: boolean | null
          name: string
          protein_g?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          carbs_g?: number | null
          coach_id?: string
          created_at?: string
          daily_calories?: number | null
          description?: string | null
          fats_g?: number | null
          goal_type?: string | null
          id?: string
          instructions?: string | null
          is_favorite?: boolean | null
          name?: string
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
            foreignKeyName: "nutrition_plans_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_templates"
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
        }
        Insert: {
          coach_id: string
          id?: string
          name: string
        }
        Update: {
          coach_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_meals_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          coach_id: string
          created_at: string
          id: string
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
          coach_id: string
          created_at: string
          cycle_length: number | null
          duration_days: number | null
          duration_type: string | null
          end_date: string | null
          id: string
          is_active: boolean
          name: string
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
          coach_id: string
          created_at?: string
          cycle_length?: number | null
          duration_days?: number | null
          duration_type?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
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
          coach_id?: string
          created_at?: string
          cycle_length?: number | null
          duration_days?: number | null
          duration_type?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
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
      check_platform_email_availability: {
        Args: { p_email: string }
        Returns: Json
      }
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
          billing_cycle: string
          brand_name: string
          client_count: number
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
