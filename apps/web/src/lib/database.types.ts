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
      _bak_foods_ml_fix_20260819: {
        Row: {
          backed_at: string | null
          calories: number | null
          category: string | null
          id: string | null
          is_liquid: boolean | null
          name: string | null
          serving_unit: string | null
        }
        Insert: {
          backed_at?: string | null
          calories?: number | null
          category?: string | null
          id?: string | null
          is_liquid?: boolean | null
          name?: string | null
          serving_unit?: string | null
        }
        Update: {
          backed_at?: string | null
          calories?: number | null
          category?: string | null
          id?: string | null
          is_liquid?: boolean | null
          name?: string | null
          serving_unit?: string | null
        }
        Relationships: []
      }
      _bak_pricing_v3_free_limits_20260821: {
        Row: {
          backed_up_at: string | null
          coach_id: string | null
          max_clients_prev: number | null
          slug: string | null
        }
        Insert: {
          backed_up_at?: string | null
          coach_id?: string | null
          max_clients_prev?: number | null
          slug?: string | null
        }
        Update: {
          backed_up_at?: string | null
          coach_id?: string | null
          max_clients_prev?: number | null
          slug?: string | null
        }
        Relationships: []
      }
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
      billing_snapshots: {
        Row: {
          addons: Json
          base_before_discount_clp: number | null
          base_clp: number
          billing_cycle: string | null
          charged_at: string
          coach_id: string
          coupon_code: string | null
          coupon_redemption_id: string | null
          created_at: string
          discount_clp: number | null
          id: string
          kind: string
          provider: string
          provider_payment_id: string
          tier: string | null
          total_clp: number
        }
        Insert: {
          addons?: Json
          base_before_discount_clp?: number | null
          base_clp: number
          billing_cycle?: string | null
          charged_at: string
          coach_id: string
          coupon_code?: string | null
          coupon_redemption_id?: string | null
          created_at?: string
          discount_clp?: number | null
          id?: string
          kind: string
          provider?: string
          provider_payment_id: string
          tier?: string | null
          total_clp: number
        }
        Update: {
          addons?: Json
          base_before_discount_clp?: number | null
          base_clp?: number
          billing_cycle?: string | null
          charged_at?: string
          coach_id?: string
          coupon_code?: string | null
          coupon_redemption_id?: string | null
          created_at?: string
          discount_clp?: number | null
          id?: string
          kind?: string
          provider?: string
          provider_payment_id?: string
          tier?: string | null
          total_clp?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_snapshots_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_snapshots_coupon_redemption_id_fkey"
            columns: ["coupon_redemption_id"]
            isOneToOne: false
            referencedRelation: "coupon_redemptions"
            referencedColumns: ["id"]
          },
        ]
      }
      body_composition_measurements: {
        Row: {
          client_id: string
          coach_id: string | null
          consent_confirmed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          device_brand: string | null
          device_model: string | null
          equation_used: string | null
          height_cm: number | null
          id: string
          is_validated: boolean
          measured_at: string
          measurement_conditions: Json
          method: string
          metrics: Json
          notes: string | null
          org_id: string | null
          raw_input: Json
          source: string
          team_id: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          client_id: string
          coach_id?: string | null
          consent_confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          device_brand?: string | null
          device_model?: string | null
          equation_used?: string | null
          height_cm?: number | null
          id?: string
          is_validated?: boolean
          measured_at?: string
          measurement_conditions?: Json
          method: string
          metrics?: Json
          notes?: string | null
          org_id?: string | null
          raw_input?: Json
          source?: string
          team_id?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          client_id?: string
          coach_id?: string | null
          consent_confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          device_brand?: string | null
          device_model?: string | null
          equation_used?: string | null
          height_cm?: number | null
          id?: string
          is_validated?: boolean
          measured_at?: string
          measurement_conditions?: Json
          method?: string
          metrics?: Json
          notes?: string | null
          org_id?: string | null
          raw_input?: Json
          source?: string
          team_id?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_composition_measurements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_composition_measurements_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_composition_measurements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_composition_measurements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      client_consents: {
        Row: {
          account_id: string | null
          client_id: string
          consent_text_version: string | null
          created_at: string
          granted_at: string | null
          granted_via: string | null
          id: string
          ip_address: string | null
          purpose: string
          revoked_at: string | null
          team_id: string | null
          user_agent: string | null
        }
        Insert: {
          account_id?: string | null
          client_id: string
          consent_text_version?: string | null
          created_at?: string
          granted_at?: string | null
          granted_via?: string | null
          id?: string
          ip_address?: string | null
          purpose: string
          revoked_at?: string | null
          team_id?: string | null
          user_agent?: string | null
        }
        Update: {
          account_id?: string | null
          client_id?: string
          consent_text_version?: string | null
          created_at?: string
          granted_at?: string | null
          granted_via?: string | null
          id?: string
          ip_address?: string | null
          purpose?: string
          revoked_at?: string | null
          team_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_consents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      client_feature_prefs: {
        Row: {
          client_id: string
          domain: string
          sections: Json
          updated_at: string
        }
        Insert: {
          client_id: string
          domain: string
          sections?: Json
          updated_at?: string
        }
        Update: {
          client_id?: string
          domain?: string
          sections?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_feature_prefs_client_id_fkey"
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
          sex: string | null
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
          sex?: string | null
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
          sex?: string | null
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
          team_id: string | null
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
          team_id?: string | null
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
          team_id?: string | null
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
          {
            foreignKeyName: "client_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          birth_date: string | null
          coach_id: string | null
          created_at: string
          email: string
          first_login_at: string | null
          force_password_change: boolean
          full_name: string
          goal_weight_kg: number | null
          id: string
          is_active: boolean | null
          is_archived: boolean
          is_demo: boolean
          max_hr_override: number | null
          onboarding_completed: boolean
          org_id: string | null
          phone: string | null
          ref_5k_time_sec: number | null
          referral_card_kind: string | null
          referral_source: string | null
          referred_by_client_id: string | null
          resting_hr: number | null
          subscription_start_date: string | null
          team_id: string | null
          updated_at: string
          use_coach_brand_colors: boolean | null
        }
        Insert: {
          age_confirmed_at?: string | null
          birth_date?: string | null
          coach_id?: string | null
          created_at?: string
          email: string
          first_login_at?: string | null
          force_password_change?: boolean
          full_name: string
          goal_weight_kg?: number | null
          id: string
          is_active?: boolean | null
          is_archived?: boolean
          is_demo?: boolean
          max_hr_override?: number | null
          onboarding_completed?: boolean
          org_id?: string | null
          phone?: string | null
          ref_5k_time_sec?: number | null
          referral_card_kind?: string | null
          referral_source?: string | null
          referred_by_client_id?: string | null
          resting_hr?: number | null
          subscription_start_date?: string | null
          team_id?: string | null
          updated_at?: string
          use_coach_brand_colors?: boolean | null
        }
        Update: {
          age_confirmed_at?: string | null
          birth_date?: string | null
          coach_id?: string | null
          created_at?: string
          email?: string
          first_login_at?: string | null
          force_password_change?: boolean
          full_name?: string
          goal_weight_kg?: number | null
          id?: string
          is_active?: boolean | null
          is_archived?: boolean
          is_demo?: boolean
          max_hr_override?: number | null
          onboarding_completed?: boolean
          org_id?: string | null
          phone?: string | null
          ref_5k_time_sec?: number | null
          referral_card_kind?: string | null
          referral_source?: string | null
          referred_by_client_id?: string | null
          resting_hr?: number | null
          subscription_start_date?: string | null
          team_id?: string | null
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
          {
            foreignKeyName: "clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_addons: {
        Row: {
          activated_at: string
          cancel_requested_at: string | null
          cancelled_at: string | null
          coach_id: string
          created_at: string
          expires_at: string | null
          first_charged_at: string | null
          id: string
          module_key: string
          price_clp: number
          source: string
          status: string
          terms_accepted_at: string
          terms_version: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          coach_id: string
          created_at?: string
          expires_at?: string | null
          first_charged_at?: string | null
          id?: string
          module_key: string
          price_clp: number
          source?: string
          status?: string
          terms_accepted_at?: string
          terms_version: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          cancel_requested_at?: string | null
          cancelled_at?: string | null
          coach_id?: string
          created_at?: string
          expires_at?: string | null
          first_charged_at?: string | null
          id?: string
          module_key?: string
          price_clp?: number
          source?: string
          status?: string
          terms_accepted_at?: string
          terms_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_addons_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
      coach_email_ledger: {
        Row: {
          coach_id: string
          created_at: string
          delivered_at: string | null
          id: string
          payload: Json
          provider_message_id: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          template_key: string
          trigger: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          payload?: Json
          provider_message_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status: string
          template_key: string
          trigger: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          payload?: Json
          provider_message_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          template_key?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_email_ledger_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_feature_prefs: {
        Row: {
          coach_id: string
          domain: string
          preset: string | null
          sections: Json
          updated_at: string
        }
        Insert: {
          coach_id: string
          domain: string
          preset?: string | null
          sections?: Json
          updated_at?: string
        }
        Update: {
          coach_id?: string
          domain?: string
          preset?: string | null
          sections?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_feature_prefs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_food_last_qty: {
        Row: {
          client_id: string | null
          coach_id: string
          created_at: string
          food_id: string
          id: string
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          coach_id: string
          created_at?: string
          food_id: string
          id?: string
          quantity: number
          unit: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          coach_id?: string
          created_at?: string
          food_id?: string
          id?: string
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_food_last_qty_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_food_last_qty_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_food_last_qty_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_food_overrides: {
        Row: {
          calories: number
          carbs_g: number
          coach_id: string
          created_at: string
          created_by: string | null
          fats_g: number
          fiber_g: number
          food_id: string
          household_grams: number | null
          household_label: string | null
          id: string
          macros_basis: string
          protein_g: number
          updated_at: string
        }
        Insert: {
          calories: number
          carbs_g: number
          coach_id: string
          created_at?: string
          created_by?: string | null
          fats_g: number
          fiber_g: number
          food_id: string
          household_grams?: number | null
          household_label?: string | null
          id?: string
          macros_basis: string
          protein_g: number
          updated_at?: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          coach_id?: string
          created_at?: string
          created_by?: string | null
          fats_g?: number
          fiber_g?: number
          food_id?: string
          household_grams?: number | null
          household_label?: string | null
          id?: string
          macros_basis?: string
          protein_g?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_food_overrides_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_food_overrides_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_leads: {
        Row: {
          coach_id: string
          consent_accepted_at: string
          converted_client_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          message: string | null
          org_id: string | null
          phone: string | null
          referral_card_kind: string | null
          referral_source: string | null
          referred_by_client_id: string | null
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          coach_id: string
          consent_accepted_at?: string
          converted_client_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          message?: string | null
          org_id?: string | null
          phone?: string | null
          referral_card_kind?: string | null
          referral_source?: string | null
          referred_by_client_id?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          coach_id?: string
          consent_accepted_at?: string
          converted_client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          message?: string | null
          org_id?: string | null
          phone?: string | null
          referral_card_kind?: string | null
          referral_source?: string | null
          referred_by_client_id?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_leads_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_leads_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_leads_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          accent_dark: string | null
          accent_light: string | null
          active_coupon_redemption_id: string | null
          active_org_id: string | null
          admin_notes: string | null
          billing_cycle: string
          brand_font_key: string | null
          brand_name: string
          brand_secondary_color: string | null
          card_brand: string | null
          card_last4: string | null
          card_payment_method_id: string | null
          created_at: string
          current_period_end: string | null
          enabled_modules: Json
          executor_theme: string
          full_name: string
          health_data_consent_at: string | null
          id: string
          instagram_handle: string | null
          invite_code: string
          last_active_at: string | null
          loader_config: Json | null
          loader_icon_mode: string
          loader_show_icon: boolean
          loader_text: string | null
          loader_text_color: string | null
          loader_variant: string
          login_layout_key: string | null
          logo_url: string | null
          logo_url_dark: string | null
          marketing_consent: boolean
          max_clients: number
          neutral_tint: boolean
          onboarding_guide: Json
          paid_access_ended_at: string | null
          payment_provider: string
          persona: string | null
          persona_also_other: boolean
          persona_set_at: string | null
          previous_slugs: string[] | null
          primary_color: string
          provider_customer_id: string | null
          provider_plan_id: string | null
          registration_ip: string | null
          slug: string
          slug_changed_at: string | null
          subscription_mp_id: string | null
          subscription_provider: string
          subscription_provider_external_id: string | null
          subscription_status: string
          subscription_tier: string
          superseded_mp_preapproval_id: string | null
          theme_preset_key: string | null
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
          accent_dark?: string | null
          accent_light?: string | null
          active_coupon_redemption_id?: string | null
          active_org_id?: string | null
          admin_notes?: string | null
          billing_cycle?: string
          brand_font_key?: string | null
          brand_name: string
          brand_secondary_color?: string | null
          card_brand?: string | null
          card_last4?: string | null
          card_payment_method_id?: string | null
          created_at?: string
          current_period_end?: string | null
          enabled_modules?: Json
          executor_theme?: string
          full_name: string
          health_data_consent_at?: string | null
          id: string
          instagram_handle?: string | null
          invite_code?: string
          last_active_at?: string | null
          loader_config?: Json | null
          loader_icon_mode?: string
          loader_show_icon?: boolean
          loader_text?: string | null
          loader_text_color?: string | null
          loader_variant?: string
          login_layout_key?: string | null
          logo_url?: string | null
          logo_url_dark?: string | null
          marketing_consent?: boolean
          max_clients?: number
          neutral_tint?: boolean
          onboarding_guide?: Json
          paid_access_ended_at?: string | null
          payment_provider?: string
          persona?: string | null
          persona_also_other?: boolean
          persona_set_at?: string | null
          previous_slugs?: string[] | null
          primary_color?: string
          provider_customer_id?: string | null
          provider_plan_id?: string | null
          registration_ip?: string | null
          slug: string
          slug_changed_at?: string | null
          subscription_mp_id?: string | null
          subscription_provider?: string
          subscription_provider_external_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          superseded_mp_preapproval_id?: string | null
          theme_preset_key?: string | null
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
          accent_dark?: string | null
          accent_light?: string | null
          active_coupon_redemption_id?: string | null
          active_org_id?: string | null
          admin_notes?: string | null
          billing_cycle?: string
          brand_font_key?: string | null
          brand_name?: string
          brand_secondary_color?: string | null
          card_brand?: string | null
          card_last4?: string | null
          card_payment_method_id?: string | null
          created_at?: string
          current_period_end?: string | null
          enabled_modules?: Json
          executor_theme?: string
          full_name?: string
          health_data_consent_at?: string | null
          id?: string
          instagram_handle?: string | null
          invite_code?: string
          last_active_at?: string | null
          loader_config?: Json | null
          loader_icon_mode?: string
          loader_show_icon?: boolean
          loader_text?: string | null
          loader_text_color?: string | null
          loader_variant?: string
          login_layout_key?: string | null
          logo_url?: string | null
          logo_url_dark?: string | null
          marketing_consent?: boolean
          max_clients?: number
          neutral_tint?: boolean
          onboarding_guide?: Json
          paid_access_ended_at?: string | null
          payment_provider?: string
          persona?: string | null
          persona_also_other?: boolean
          persona_set_at?: string | null
          previous_slugs?: string[] | null
          primary_color?: string
          provider_customer_id?: string | null
          provider_plan_id?: string | null
          registration_ip?: string | null
          slug?: string
          slug_changed_at?: string | null
          subscription_mp_id?: string | null
          subscription_provider?: string
          subscription_provider_external_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          superseded_mp_preapproval_id?: string | null
          theme_preset_key?: string | null
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
            foreignKeyName: "coaches_active_coupon_redemption_id_fkey"
            columns: ["active_coupon_redemption_id"]
            isOneToOne: false
            referencedRelation: "coupon_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_allowed_emails: {
        Row: {
          coupon_id: string
          created_at: string
          normalized_email: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          normalized_email: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          normalized_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_allowed_emails_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_codes: {
        Row: {
          active: boolean
          code_display: string | null
          code_normalized: string
          coupon_id: string
          created_at: string
          expires_at: string | null
          first_time_only: boolean
          id: string
          max_redemptions: number | null
          min_amount_clp: number | null
          per_account_limit: number
          redeemed_count: number
          restricted_to_coach_id: string | null
        }
        Insert: {
          active?: boolean
          code_display?: string | null
          code_normalized: string
          coupon_id: string
          created_at?: string
          expires_at?: string | null
          first_time_only?: boolean
          id?: string
          max_redemptions?: number | null
          min_amount_clp?: number | null
          per_account_limit?: number
          redeemed_count?: number
          restricted_to_coach_id?: string | null
        }
        Update: {
          active?: boolean
          code_display?: string | null
          code_normalized?: string
          coupon_id?: string
          created_at?: string
          expires_at?: string | null
          first_time_only?: boolean
          id?: string
          max_redemptions?: number | null
          min_amount_clp?: number | null
          per_account_limit?: number
          redeemed_count?: number
          restricted_to_coach_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_codes_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_codes_restricted_to_coach_id_fkey"
            columns: ["restricted_to_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_cycle_decrements: {
        Row: {
          created_at: string
          id: string
          provider_payment_id: string
          redemption_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider_payment_id: string
          redemption_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider_payment_id?: string
          redemption_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_cycle_decrements_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "coupon_redemptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          applied_cycles_remaining: number | null
          billing_snapshot_id: string | null
          coach_id: string
          coupon_code_id: string
          coupon_id: string
          coupon_terms_text: string | null
          coupon_terms_version: string | null
          created_at: string
          discount_value_snapshot: Json
          first_time_only: boolean
          id: string
          normalized_email: string | null
          redeemed_at: string
          revoke_effective_at: string | null
          source_ip: unknown
          status: string
        }
        Insert: {
          applied_cycles_remaining?: number | null
          billing_snapshot_id?: string | null
          coach_id: string
          coupon_code_id: string
          coupon_id: string
          coupon_terms_text?: string | null
          coupon_terms_version?: string | null
          created_at?: string
          discount_value_snapshot: Json
          first_time_only?: boolean
          id?: string
          normalized_email?: string | null
          redeemed_at?: string
          revoke_effective_at?: string | null
          source_ip?: unknown
          status?: string
        }
        Update: {
          applied_cycles_remaining?: number | null
          billing_snapshot_id?: string | null
          coach_id?: string
          coupon_code_id?: string
          coupon_id?: string
          coupon_terms_text?: string | null
          coupon_terms_version?: string | null
          created_at?: string
          discount_value_snapshot?: Json
          first_time_only?: boolean
          id?: string
          normalized_email?: string | null
          redeemed_at?: string
          revoke_effective_at?: string | null
          source_ip?: unknown
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_billing_snapshot_id_fkey"
            columns: ["billing_snapshot_id"]
            isOneToOne: false
            referencedRelation: "billing_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_code_id_fkey"
            columns: ["coupon_code_id"]
            isOneToOne: false
            referencedRelation: "coupon_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          amount_off_clp: number | null
          applies_to_scope: Json
          code_kind: string
          created_at: string
          created_by: string | null
          currency: string
          discount_type: string
          duration: string
          duration_in_cycles: number | null
          fixed_clp_target: string
          id: string
          max_redemptions: number | null
          percent_value: number | null
          redeem_by: string | null
          stackable: boolean
          updated_at: string
        }
        Insert: {
          amount_off_clp?: number | null
          applies_to_scope?: Json
          code_kind?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_type: string
          duration: string
          duration_in_cycles?: number | null
          fixed_clp_target?: string
          id?: string
          max_redemptions?: number | null
          percent_value?: number | null
          redeem_by?: string | null
          stackable?: boolean
          updated_at?: string
        }
        Update: {
          amount_off_clp?: number | null
          applies_to_scope?: Json
          code_kind?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_type?: string
          duration?: string
          duration_in_cycles?: number | null
          fixed_clp_target?: string
          id?: string
          max_redemptions?: number | null
          percent_value?: number | null
          redeem_by?: string | null
          stackable?: boolean
          updated_at?: string
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
          plan_id: string | null
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
          plan_id?: string | null
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
          plan_id?: string | null
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
      exchange_group_foods: {
        Row: {
          coach_id: string | null
          created_at: string
          created_by: string | null
          exchange_group_id: string
          food_id: string
          id: string
          is_excluded: boolean
          org_id: string | null
          portion_grams: number | null
          portion_label: string | null
          source: string
          updated_at: string
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          created_by?: string | null
          exchange_group_id: string
          food_id: string
          id?: string
          is_excluded?: boolean
          org_id?: string | null
          portion_grams?: number | null
          portion_label?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          created_by?: string | null
          exchange_group_id?: string
          food_id?: string
          id?: string
          is_excluded?: boolean
          org_id?: string | null
          portion_grams?: number | null
          portion_label?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_group_foods_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_group_foods_exchange_group_id_fkey"
            columns: ["exchange_group_id"]
            isOneToOne: false
            referencedRelation: "exchange_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_group_foods_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_group_foods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_groups: {
        Row: {
          coach_id: string | null
          code: string
          color: string | null
          composed_of: Json | null
          created_at: string
          deleted_at: string | null
          id: string
          is_system: boolean
          macros_confirmed: boolean
          name: string
          ref_calories: number
          ref_carbs_g: number
          ref_fats_g: number
          ref_protein_g: number
          slug: string
          sort_order: number
          team_id: string | null
          updated_at: string
        }
        Insert: {
          coach_id?: string | null
          code: string
          color?: string | null
          composed_of?: Json | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_system?: boolean
          macros_confirmed?: boolean
          name: string
          ref_calories?: number
          ref_carbs_g?: number
          ref_fats_g?: number
          ref_protein_g?: number
          slug: string
          sort_order?: number
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          coach_id?: string | null
          code?: string
          color?: string | null
          composed_of?: Json | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_system?: boolean
          macros_confirmed?: boolean
          name?: string
          ref_calories?: number
          ref_carbs_g?: number
          ref_fats_g?: number
          ref_protein_g?: number
          slug?: string
          sort_order?: number
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_groups_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          body_part: string | null
          cardio_modality: string | null
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          difficulty: string | null
          equipment: string | null
          exercise_type: string
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
          team_id: string | null
          thumbnail_checked_at: string | null
          thumbnail_url: string | null
          video_end_time: number | null
          video_start_time: number | null
          video_url: string | null
        }
        Insert: {
          body_part?: string | null
          cardio_modality?: string | null
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          difficulty?: string | null
          equipment?: string | null
          exercise_type?: string
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
          team_id?: string | null
          thumbnail_checked_at?: string | null
          thumbnail_url?: string | null
          video_end_time?: number | null
          video_start_time?: number | null
          video_url?: string | null
        }
        Update: {
          body_part?: string | null
          cardio_modality?: string | null
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          difficulty?: string | null
          equipment?: string | null
          exercise_type?: string
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
          team_id?: string | null
          thumbnail_checked_at?: string | null
          thumbnail_url?: string | null
          video_end_time?: number | null
          video_start_time?: number | null
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
          {
            foreignKeyName: "exercises_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      food_catalog_import_batches: {
        Row: {
          accepted_rows: number
          checksum: string | null
          completed_at: string | null
          country_code: string
          created_at: string
          created_by: string | null
          duplicate_rows: number
          file_name: string | null
          id: string
          metadata: Json
          rejected_rows: number
          source: string
          status: string
          total_rows: number
        }
        Insert: {
          accepted_rows?: number
          checksum?: string | null
          completed_at?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          duplicate_rows?: number
          file_name?: string | null
          id?: string
          metadata?: Json
          rejected_rows?: number
          source: string
          status?: string
          total_rows?: number
        }
        Update: {
          accepted_rows?: number
          checksum?: string | null
          completed_at?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          duplicate_rows?: number
          file_name?: string | null
          id?: string
          metadata?: Json
          rejected_rows?: number
          source?: string
          status?: string
          total_rows?: number
        }
        Relationships: []
      }
      food_catalog_import_rows: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          normalized_catalog_key: string | null
          normalized_gtin: string | null
          payload: Json
          rejection_reason: string | null
          resolved_food_id: string | null
          source_row: number
          status: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          normalized_catalog_key?: string | null
          normalized_gtin?: string | null
          payload: Json
          rejection_reason?: string | null
          resolved_food_id?: string | null
          source_row: number
          status?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          normalized_catalog_key?: string | null
          normalized_gtin?: string | null
          payload?: Json
          rejection_reason?: string | null
          resolved_food_id?: string | null
          source_row?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_catalog_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "food_catalog_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_catalog_import_rows_resolved_food_id_fkey"
            columns: ["resolved_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      food_catalog_missing_codes: {
        Row: {
          barcode: string
          captured_brand: string | null
          captured_name: string | null
          client_id: string
          country_code: string
          first_seen_at: string
          id: string
          last_idempotency_key: string | null
          last_seen_at: string
          package_photo_path: string | null
          report_source: string
          resolved_at: string | null
          resolved_food_id: string | null
          sightings: number
          status: string
          updated_at: string
        }
        Insert: {
          barcode: string
          captured_brand?: string | null
          captured_name?: string | null
          client_id: string
          country_code?: string
          first_seen_at?: string
          id?: string
          last_idempotency_key?: string | null
          last_seen_at?: string
          package_photo_path?: string | null
          report_source?: string
          resolved_at?: string | null
          resolved_food_id?: string | null
          sightings?: number
          status?: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          captured_brand?: string | null
          captured_name?: string | null
          client_id?: string
          country_code?: string
          first_seen_at?: string
          id?: string
          last_idempotency_key?: string | null
          last_seen_at?: string
          package_photo_path?: string | null
          report_source?: string
          resolved_at?: string | null
          resolved_food_id?: string | null
          sightings?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_catalog_missing_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_catalog_missing_codes_resolved_food_id_fkey"
            columns: ["resolved_food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
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
      food_media: {
        Row: {
          attribution: string | null
          blurhash: string | null
          bucket: string
          created_at: string
          created_by: string | null
          food_id: string
          height: number | null
          id: string
          is_primary: boolean
          kind: string
          license: string
          mime_type: string | null
          object_path: string
          source_url: string | null
          updated_at: string
          updated_by: string | null
          version: number
          width: number | null
        }
        Insert: {
          attribution?: string | null
          blurhash?: string | null
          bucket?: string
          created_at?: string
          created_by?: string | null
          food_id: string
          height?: number | null
          id?: string
          is_primary?: boolean
          kind: string
          license?: string
          mime_type?: string | null
          object_path: string
          source_url?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          width?: number | null
        }
        Update: {
          attribution?: string | null
          blurhash?: string | null
          bucket?: string
          created_at?: string
          created_by?: string | null
          food_id?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          kind?: string
          license?: string
          mime_type?: string | null
          object_path?: string
          source_url?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "food_media_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
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
          barcode: string | null
          brand: string | null
          calories: number
          carbs_g: number
          catalog_key: string | null
          catalog_source: string
          category: string | null
          coach_id: string | null
          country_code: string | null
          exchange_group_id: string | null
          exchange_portion_grams: number | null
          exchange_portion_label: string | null
          fats_g: number
          fiber_g: number | null
          household_grams: number | null
          household_label: string | null
          id: string
          is_liquid: boolean
          macros_basis: string
          name: string
          name_search: string | null
          org_id: string | null
          package_quantity: number | null
          package_unit: string | null
          product_image_path: string | null
          protein_g: number
          saturated_fat_g: number | null
          search_aliases: string[]
          serving_size: number
          serving_unit: string | null
          sodium_mg: number | null
          source_ref: string | null
          sugar_g: number | null
          unsaturated_fat_g: number | null
          updated_at: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calories: number
          carbs_g: number
          catalog_key?: string | null
          catalog_source?: string
          category?: string | null
          coach_id?: string | null
          country_code?: string | null
          exchange_group_id?: string | null
          exchange_portion_grams?: number | null
          exchange_portion_label?: string | null
          fats_g: number
          fiber_g?: number | null
          household_grams?: number | null
          household_label?: string | null
          id?: string
          is_liquid?: boolean
          macros_basis?: string
          name: string
          name_search?: string | null
          org_id?: string | null
          package_quantity?: number | null
          package_unit?: string | null
          product_image_path?: string | null
          protein_g: number
          saturated_fat_g?: number | null
          search_aliases?: string[]
          serving_size: number
          serving_unit?: string | null
          sodium_mg?: number | null
          source_ref?: string | null
          sugar_g?: number | null
          unsaturated_fat_g?: number | null
          updated_at?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calories?: number
          carbs_g?: number
          catalog_key?: string | null
          catalog_source?: string
          category?: string | null
          coach_id?: string | null
          country_code?: string | null
          exchange_group_id?: string | null
          exchange_portion_grams?: number | null
          exchange_portion_label?: string | null
          fats_g?: number
          fiber_g?: number | null
          household_grams?: number | null
          household_label?: string | null
          id?: string
          is_liquid?: boolean
          macros_basis?: string
          name?: string
          name_search?: string | null
          org_id?: string | null
          package_quantity?: number | null
          package_unit?: string | null
          product_image_path?: string | null
          protein_g?: number
          saturated_fat_g?: number | null
          search_aliases?: string[]
          serving_size?: number
          serving_unit?: string | null
          sodium_mg?: number | null
          source_ref?: string | null
          sugar_g?: number | null
          unsaturated_fat_g?: number | null
          updated_at?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
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
            foreignKeyName: "foods_exchange_group_id_fkey"
            columns: ["exchange_group_id"]
            isOneToOne: false
            referencedRelation: "exchange_groups"
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
      meal_exchange_targets: {
        Row: {
          created_at: string
          exchange_group_id: string
          id: string
          meal_id: string
          notes: string | null
          portions: number
        }
        Insert: {
          created_at?: string
          exchange_group_id: string
          id?: string
          meal_id: string
          notes?: string | null
          portions: number
        }
        Update: {
          created_at?: string
          exchange_group_id?: string
          id?: string
          meal_id?: string
          notes?: string | null
          portions?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_exchange_targets_exchange_group_id_fkey"
            columns: ["exchange_group_id"]
            isOneToOne: false
            referencedRelation: "exchange_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_exchange_targets_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_assessment_items: {
        Row: {
          assessment_id: string
          clearing_positive: boolean | null
          comment: string | null
          created_at: string
          final_score: number
          id: string
          is_per_side: boolean
          pain: boolean
          pattern: string
          score_left: number | null
          score_right: number | null
          score_single: number | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          clearing_positive?: boolean | null
          comment?: string | null
          created_at?: string
          final_score: number
          id?: string
          is_per_side: boolean
          pain?: boolean
          pattern: string
          score_left?: number | null
          score_right?: number | null
          score_single?: number | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          clearing_positive?: boolean | null
          comment?: string | null
          created_at?: string
          final_score?: number
          id?: string
          is_per_side?: boolean
          pain?: boolean
          pattern?: string
          score_left?: number | null
          score_right?: number | null
          score_single?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_assessment_items_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "movement_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_assessments: {
        Row: {
          assessed_at: string
          client_id: string
          coach_id: string | null
          composite_score: number | null
          consent_confirmed_at: string | null
          created_at: string
          has_asymmetry: boolean
          has_pain: boolean
          id: string
          last_edited_by: string | null
          notes: string | null
          protocol_version: string
          risk_band: string | null
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          assessed_at?: string
          client_id: string
          coach_id?: string | null
          composite_score?: number | null
          consent_confirmed_at?: string | null
          created_at?: string
          has_asymmetry?: boolean
          has_pain?: boolean
          id?: string
          last_edited_by?: string | null
          notes?: string | null
          protocol_version?: string
          risk_band?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          assessed_at?: string
          client_id?: string
          coach_id?: string | null
          composite_score?: number | null
          consent_confirmed_at?: string | null
          created_at?: string
          has_asymmetry?: boolean
          has_pain?: boolean
          id?: string
          last_edited_by?: string | null
          notes?: string | null
          protocol_version?: string
          risk_band?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_assessments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_assessments_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_assessments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      nutrient_targets: {
        Row: {
          ceiling_value: number | null
          client_id: string | null
          coach_id: string | null
          created_at: string
          floor_value: number | null
          id: string
          intent: string
          nutrient_key: string
          provenance: string | null
          target_value: number | null
          updated_at: string
        }
        Insert: {
          ceiling_value?: number | null
          client_id?: string | null
          coach_id?: string | null
          created_at?: string
          floor_value?: number | null
          id?: string
          intent?: string
          nutrient_key: string
          provenance?: string | null
          target_value?: number | null
          updated_at?: string
        }
        Update: {
          ceiling_value?: number | null
          client_id?: string | null
          coach_id?: string | null
          created_at?: string
          floor_value?: number | null
          id?: string
          intent?: string
          nutrient_key?: string
          provenance?: string | null
          target_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrient_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrient_targets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_day_snapshots_v2: {
        Row: {
          client_id: string
          created_at: string
          day_variant_id: string | null
          id: string
          local_date: string
          plan_id: string | null
          prescription_snapshot: Json
          strategy: string | null
          student_permissions: Json
          target_calories: number | null
          target_carbs_g: number | null
          target_fats_g: number | null
          target_fiber_g: number | null
          target_protein_g: number | null
          target_sodium_mg: number | null
          target_water_ml: number | null
          timezone: string
          version_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          day_variant_id?: string | null
          id?: string
          local_date: string
          plan_id?: string | null
          prescription_snapshot?: Json
          strategy?: string | null
          student_permissions?: Json
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fats_g?: number | null
          target_fiber_g?: number | null
          target_protein_g?: number | null
          target_sodium_mg?: number | null
          target_water_ml?: number | null
          timezone: string
          version_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          day_variant_id?: string | null
          id?: string
          local_date?: string
          plan_id?: string | null
          prescription_snapshot?: Json
          strategy?: string | null
          student_permissions?: Json
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fats_g?: number | null
          target_fiber_g?: number | null
          target_protein_g?: number | null
          target_sodium_mg?: number | null
          target_water_ml?: number | null
          timezone?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_day_snapshots_v2_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_day_snapshots_v2_day_variant_id_fkey"
            columns: ["day_variant_id"]
            isOneToOne: false
            referencedRelation: "nutrition_day_variants_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_day_snapshots_v2_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_day_snapshots_v2_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_versions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_day_variants_v2: {
        Row: {
          created_at: string
          day_of_week: number | null
          id: string
          is_default: boolean
          label: string
          order_index: number
          target_calories: number | null
          target_carbs_g: number | null
          target_fats_g: number | null
          target_fiber_g: number | null
          target_protein_g: number | null
          target_sodium_mg: number | null
          target_water_ml: number | null
          updated_at: string
          variant_key: string
          version_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          id?: string
          is_default?: boolean
          label: string
          order_index?: number
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fats_g?: number | null
          target_fiber_g?: number | null
          target_protein_g?: number | null
          target_sodium_mg?: number | null
          target_water_ml?: number | null
          updated_at?: string
          variant_key: string
          version_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          id?: string
          is_default?: boolean
          label?: string
          order_index?: number
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fats_g?: number | null
          target_fiber_g?: number | null
          target_protein_g?: number | null
          target_sodium_mg?: number | null
          target_water_ml?: number | null
          updated_at?: string
          variant_key?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_day_variants_v2_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_versions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_intake_entries: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          capture_method: string
          capture_method_v2: string | null
          client_id: string
          corrected_by_entry_id: string | null
          correction_reason: string | null
          corrects_entry_id: string | null
          created_at: string
          custom_name: string | null
          daily_log_id: string | null
          day_snapshot_id: string | null
          entry_status: string
          exchange_group_code: string | null
          exchange_portions: number | null
          food_id: string | null
          id: string
          idempotency_key: string | null
          intake_source_v2: string | null
          log_date: string
          meal_id: string | null
          meal_slot: string | null
          meal_slot_v2: string | null
          note: string | null
          occurred_at: string | null
          plan_version_id: string | null
          prescription_item_id: string | null
          quantity: number
          revision: number
          snapshot_brand: string | null
          snapshot_calories: number | null
          snapshot_carbs_g: number | null
          snapshot_fats_g: number | null
          snapshot_fiber_g: number | null
          snapshot_macros_basis: string | null
          snapshot_name: string | null
          snapshot_protein_g: number | null
          snapshot_serving_size: number | null
          snapshot_serving_unit: string | null
          source: string
          timezone: string | null
          unit: string
          updated_at: string | null
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          capture_method?: string
          capture_method_v2?: string | null
          client_id: string
          corrected_by_entry_id?: string | null
          correction_reason?: string | null
          corrects_entry_id?: string | null
          created_at?: string
          custom_name?: string | null
          daily_log_id?: string | null
          day_snapshot_id?: string | null
          entry_status?: string
          exchange_group_code?: string | null
          exchange_portions?: number | null
          food_id?: string | null
          id?: string
          idempotency_key?: string | null
          intake_source_v2?: string | null
          log_date: string
          meal_id?: string | null
          meal_slot?: string | null
          meal_slot_v2?: string | null
          note?: string | null
          occurred_at?: string | null
          plan_version_id?: string | null
          prescription_item_id?: string | null
          quantity: number
          revision?: number
          snapshot_brand?: string | null
          snapshot_calories?: number | null
          snapshot_carbs_g?: number | null
          snapshot_fats_g?: number | null
          snapshot_fiber_g?: number | null
          snapshot_macros_basis?: string | null
          snapshot_name?: string | null
          snapshot_protein_g?: number | null
          snapshot_serving_size?: number | null
          snapshot_serving_unit?: string | null
          source?: string
          timezone?: string | null
          unit: string
          updated_at?: string | null
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          capture_method?: string
          capture_method_v2?: string | null
          client_id?: string
          corrected_by_entry_id?: string | null
          correction_reason?: string | null
          corrects_entry_id?: string | null
          created_at?: string
          custom_name?: string | null
          daily_log_id?: string | null
          day_snapshot_id?: string | null
          entry_status?: string
          exchange_group_code?: string | null
          exchange_portions?: number | null
          food_id?: string | null
          id?: string
          idempotency_key?: string | null
          intake_source_v2?: string | null
          log_date?: string
          meal_id?: string | null
          meal_slot?: string | null
          meal_slot_v2?: string | null
          note?: string | null
          occurred_at?: string | null
          plan_version_id?: string | null
          prescription_item_id?: string | null
          quantity?: number
          revision?: number
          snapshot_brand?: string | null
          snapshot_calories?: number | null
          snapshot_carbs_g?: number | null
          snapshot_fats_g?: number | null
          snapshot_fiber_g?: number | null
          snapshot_macros_basis?: string | null
          snapshot_name?: string | null
          snapshot_protein_g?: number | null
          snapshot_serving_size?: number | null
          snapshot_serving_unit?: string | null
          source?: string
          timezone?: string | null
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_intake_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_intake_entries_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_nutrition_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_intake_entries_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_intake_entries_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_intake_entries_v2_corrected_by_fkey"
            columns: ["corrected_by_entry_id"]
            isOneToOne: false
            referencedRelation: "nutrition_intake_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_intake_entries_v2_corrects_fkey"
            columns: ["corrects_entry_id"]
            isOneToOne: false
            referencedRelation: "nutrition_intake_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_intake_entries_v2_day_snapshot_fkey"
            columns: ["day_snapshot_id"]
            isOneToOne: false
            referencedRelation: "nutrition_day_snapshots_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_intake_entries_v2_plan_version_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_versions_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_intake_entries_v2_prescription_item_fkey"
            columns: ["prescription_item_id"]
            isOneToOne: false
            referencedRelation: "nutrition_prescription_items_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_item_substitutions_v2: {
        Row: {
          created_at: string
          custom_name: string | null
          food_id: string | null
          id: string
          order_index: number
          prescription_item_id: string
          quantity: number | null
          recipe_id: string | null
          snapshot_brand: string | null
          snapshot_calories: number | null
          snapshot_carbs_g: number | null
          snapshot_fats_g: number | null
          snapshot_fiber_g: number | null
          snapshot_name: string | null
          snapshot_protein_g: number | null
          unit: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          food_id?: string | null
          id?: string
          order_index?: number
          prescription_item_id: string
          quantity?: number | null
          recipe_id?: string | null
          snapshot_brand?: string | null
          snapshot_calories?: number | null
          snapshot_carbs_g?: number | null
          snapshot_fats_g?: number | null
          snapshot_fiber_g?: number | null
          snapshot_name?: string | null
          snapshot_protein_g?: number | null
          unit?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          food_id?: string | null
          id?: string
          order_index?: number
          prescription_item_id?: string
          quantity?: number | null
          recipe_id?: string | null
          snapshot_brand?: string | null
          snapshot_calories?: number | null
          snapshot_carbs_g?: number | null
          snapshot_fats_g?: number | null
          snapshot_fiber_g?: number | null
          snapshot_name?: string | null
          snapshot_protein_g?: number | null
          unit?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nis_item_version_fkey"
            columns: ["prescription_item_id", "version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_prescription_items_v2"
            referencedColumns: ["id", "version_id"]
          },
          {
            foreignKeyName: "nutrition_item_substitutions_v2_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_item_substitutions_v2_prescription_item_id_fkey"
            columns: ["prescription_item_id"]
            isOneToOne: false
            referencedRelation: "nutrition_prescription_items_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_meal_comments: {
        Row: {
          author_id: string
          author_role: string
          body: string
          client_id: string
          created_at: string
          id: string
          log_date: string | null
          meal_log_id: string | null
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          client_id: string
          created_at?: string
          id?: string
          log_date?: string | null
          meal_log_id?: string | null
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          log_date?: string | null
          meal_log_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_meal_comments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_comments_meal_log_id_fkey"
            columns: ["meal_log_id"]
            isOneToOne: false
            referencedRelation: "meal_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_comments_meal_log_id_fkey"
            columns: ["meal_log_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_logs"
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
          meal_id: string | null
          satisfaction_score: number | null
        }
        Insert: {
          consumed_quantity?: number | null
          created_at?: string
          daily_log_id: string
          id?: string
          is_completed?: boolean
          meal_id?: string | null
          satisfaction_score?: number | null
        }
        Update: {
          consumed_quantity?: number | null
          created_at?: string
          daily_log_id?: string
          id?: string
          is_completed?: boolean
          meal_id?: string | null
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
      nutrition_meal_slots_v2: {
        Row: {
          created_at: string
          day_variant_id: string
          end_time: string | null
          id: string
          instructions: string | null
          is_required: boolean
          name: string
          order_index: number
          slot_code: string
          slot_mode: string
          start_time: string | null
          target_calories: number | null
          target_carbs_g: number | null
          target_fats_g: number | null
          target_protein_g: number | null
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          day_variant_id: string
          end_time?: string | null
          id?: string
          instructions?: string | null
          is_required?: boolean
          name: string
          order_index?: number
          slot_code: string
          slot_mode?: string
          start_time?: string | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fats_g?: number | null
          target_protein_g?: number | null
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          day_variant_id?: string
          end_time?: string | null
          id?: string
          instructions?: string | null
          is_required?: boolean
          name?: string
          order_index?: number
          slot_code?: string
          slot_mode?: string
          start_time?: string | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_fats_g?: number | null
          target_protein_g?: number | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_meal_slots_v2_variant_version_fkey"
            columns: ["day_variant_id", "version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_day_variants_v2"
            referencedColumns: ["id", "version_id"]
          },
        ]
      }
      nutrition_meals: {
        Row: {
          created_at: string
          day_of_week: number | null
          day_variant_id: string | null
          description: string
          id: string
          name: string
          order_index: number
          plan_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          day_variant_id?: string | null
          description?: string
          id?: string
          name: string
          order_index?: number
          plan_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          day_variant_id?: string | null
          description?: string
          id?: string
          name?: string
          order_index?: number
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_meals_day_variant_id_fkey"
            columns: ["day_variant_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_day_variants"
            referencedColumns: ["id"]
          },
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
      nutrition_plan_day_variants: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_day_variants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
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
      nutrition_plan_private_notes_v2: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          note: string
          updated_at: string
          updated_by: string
          version_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          note?: string
          updated_at?: string
          updated_by: string
          version_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          note?: string
          updated_at?: string
          updated_by?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_private_notes_v2_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_private_notes_v2_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "nutrition_plan_versions_v2"
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
          plan_mode: string
          protein_g: number | null
          tags: string[] | null
          team_id: string | null
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
          plan_mode?: string
          protein_g?: number | null
          tags?: string[] | null
          team_id?: string | null
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
          plan_mode?: string
          protein_g?: number | null
          tags?: string[] | null
          team_id?: string | null
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
          {
            foreignKeyName: "nutrition_plan_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plan_templates_v2: {
        Row: {
          coach_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          draft: Json
          id: string
          is_favorite: boolean
          legacy_template_id: string | null
          name: string
          org_id: string | null
          schema_version: number
          source: string
          source_plan_id: string | null
          strategy: string
          summary: Json | null
          team_id: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          draft: Json
          id?: string
          is_favorite?: boolean
          legacy_template_id?: string | null
          name: string
          org_id?: string | null
          schema_version?: number
          source?: string
          source_plan_id?: string | null
          strategy: string
          summary?: Json | null
          team_id?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          draft?: Json
          id?: string
          is_favorite?: boolean
          legacy_template_id?: string | null
          name?: string
          org_id?: string | null
          schema_version?: number
          source?: string
          source_plan_id?: string | null
          strategy?: string
          summary?: Json | null
          team_id?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_templates_v2_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_templates_v2_legacy_template_id_fkey"
            columns: ["legacy_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_templates_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_templates_v2_source_plan_id_fkey"
            columns: ["source_plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_templates_v2_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plan_versions_v2: {
        Row: {
          created_at: string
          created_by: string
          effective_from: string | null
          effective_to: string | null
          id: string
          lock_version: number
          parent_version_id: string | null
          plan_id: string
          private_notes: string | null
          protocol_notes: string | null
          publish_idempotency_key: string | null
          published_at: string | null
          published_by: string | null
          status: string
          strategy: string
          student_permissions: Json
          timezone: string
          updated_at: string
          updated_by: string
          version_number: number
          visible_notes: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          lock_version?: number
          parent_version_id?: string | null
          plan_id: string
          private_notes?: string | null
          protocol_notes?: string | null
          publish_idempotency_key?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          strategy: string
          student_permissions?: Json
          timezone?: string
          updated_at?: string
          updated_by: string
          version_number: number
          visible_notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          lock_version?: number
          parent_version_id?: string | null
          plan_id?: string
          private_notes?: string | null
          protocol_notes?: string | null
          publish_idempotency_key?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          strategy?: string
          student_permissions?: Json
          timezone?: string
          updated_at?: string
          updated_by?: string
          version_number?: number
          visible_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_versions_v2_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_versions_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plan_versions_v2_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans_v2"
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
          fasting_target_hours: number | null
          fats_g: number | null
          hydration_target_ml: number | null
          id: string
          instructions: string | null
          is_active: boolean
          is_custom: boolean | null
          last_edited_by_coach_id: string | null
          name: string
          org_id: string | null
          plan_mode: string
          protein_g: number | null
          protocol_notes: string | null
          sleep_target_hours: number | null
          steps_target: number | null
          supplement_guidance: string[]
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
          fasting_target_hours?: number | null
          fats_g?: number | null
          hydration_target_ml?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_custom?: boolean | null
          last_edited_by_coach_id?: string | null
          name: string
          org_id?: string | null
          plan_mode?: string
          protein_g?: number | null
          protocol_notes?: string | null
          sleep_target_hours?: number | null
          steps_target?: number | null
          supplement_guidance?: string[]
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
          fasting_target_hours?: number | null
          fats_g?: number | null
          hydration_target_ml?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_custom?: boolean | null
          last_edited_by_coach_id?: string | null
          name?: string
          org_id?: string | null
          plan_mode?: string
          protein_g?: number | null
          protocol_notes?: string | null
          sleep_target_hours?: number | null
          steps_target?: number | null
          supplement_guidance?: string[]
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
            foreignKeyName: "nutrition_plans_last_edited_by_coach_id_fkey"
            columns: ["last_edited_by_coach_id"]
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
      nutrition_plans_v2: {
        Row: {
          archived_at: string | null
          client_id: string
          coach_id: string
          created_at: string
          created_by: string
          current_published_version_id: string | null
          id: string
          lifecycle_status: string
          name: string
          org_id: string | null
          strategy: string
          team_id: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          coach_id: string
          created_at?: string
          created_by: string
          current_published_version_id?: string | null
          id?: string
          lifecycle_status?: string
          name: string
          org_id?: string | null
          strategy: string
          team_id?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          coach_id?: string
          created_at?: string
          created_by?: string
          current_published_version_id?: string | null
          id?: string
          lifecycle_status?: string
          name?: string
          org_id?: string | null
          strategy?: string
          team_id?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plans_v2_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_v2_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_v2_current_version_fkey"
            columns: ["current_published_version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_versions_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_plans_v2_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_prescription_items_v2: {
        Row: {
          created_at: string
          custom_name: string | null
          food_id: string | null
          id: string
          is_optional: boolean
          maximum_quantity: number | null
          meal_slot_id: string
          minimum_quantity: number | null
          notes: string | null
          order_index: number
          quantity: number
          recipe_id: string | null
          snapshot_brand: string | null
          snapshot_calories: number | null
          snapshot_carbs_g: number | null
          snapshot_fats_g: number | null
          snapshot_fiber_g: number | null
          snapshot_name: string | null
          snapshot_protein_g: number | null
          substitution_group_id: string | null
          unit: string
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          food_id?: string | null
          id?: string
          is_optional?: boolean
          maximum_quantity?: number | null
          meal_slot_id: string
          minimum_quantity?: number | null
          notes?: string | null
          order_index?: number
          quantity: number
          recipe_id?: string | null
          snapshot_brand?: string | null
          snapshot_calories?: number | null
          snapshot_carbs_g?: number | null
          snapshot_fats_g?: number | null
          snapshot_fiber_g?: number | null
          snapshot_name?: string | null
          snapshot_protein_g?: number | null
          substitution_group_id?: string | null
          unit: string
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          food_id?: string | null
          id?: string
          is_optional?: boolean
          maximum_quantity?: number | null
          meal_slot_id?: string
          minimum_quantity?: number | null
          notes?: string | null
          order_index?: number
          quantity?: number
          recipe_id?: string | null
          snapshot_brand?: string | null
          snapshot_calories?: number | null
          snapshot_carbs_g?: number | null
          snapshot_fats_g?: number | null
          snapshot_fiber_g?: number | null
          snapshot_name?: string | null
          snapshot_protein_g?: number | null
          substitution_group_id?: string | null
          unit?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_prescription_items_v2_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_prescription_items_v2_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_prescription_items_v2_slot_version_fkey"
            columns: ["meal_slot_id", "version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_slots_v2"
            referencedColumns: ["id", "version_id"]
          },
        ]
      }
      nutrition_private_notes: {
        Row: {
          body: string
          client_id: string
          coach_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          body: string
          client_id: string
          coach_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          body?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_private_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_private_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_recipe_assignments: {
        Row: {
          assigned_by: string | null
          client_id: string
          created_at: string
          id: string
          recipe_id: string
        }
        Insert: {
          assigned_by?: string | null
          client_id: string
          created_at?: string
          id?: string
          recipe_id: string
        }
        Update: {
          assigned_by?: string | null
          client_id?: string
          created_at?: string
          id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_recipe_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_recipe_assignments_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_recipe_ingredients: {
        Row: {
          brand_snapshot: string | null
          calories_snapshot: number
          carbs_g_snapshot: number
          created_at: string
          fats_g_snapshot: number
          fiber_g_snapshot: number | null
          food_id: string | null
          id: string
          name_snapshot: string
          note: string | null
          order_index: number
          protein_g_snapshot: number
          quantity: number
          recipe_id: string
          serving_size_snapshot: number
          serving_unit_snapshot: string | null
          unit: string
        }
        Insert: {
          brand_snapshot?: string | null
          calories_snapshot?: number
          carbs_g_snapshot?: number
          created_at?: string
          fats_g_snapshot?: number
          fiber_g_snapshot?: number | null
          food_id?: string | null
          id?: string
          name_snapshot: string
          note?: string | null
          order_index?: number
          protein_g_snapshot?: number
          quantity: number
          recipe_id: string
          serving_size_snapshot?: number
          serving_unit_snapshot?: string | null
          unit: string
        }
        Update: {
          brand_snapshot?: string | null
          calories_snapshot?: number
          carbs_g_snapshot?: number
          created_at?: string
          fats_g_snapshot?: number
          fiber_g_snapshot?: number | null
          food_id?: string | null
          id?: string
          name_snapshot?: string
          note?: string | null
          order_index?: number
          protein_g_snapshot?: number
          quantity?: number
          recipe_id?: string
          serving_size_snapshot?: number
          serving_unit_snapshot?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_recipes: {
        Row: {
          calories_per_serving: number | null
          carbs_g_per_serving: number | null
          category: string | null
          coach_id: string | null
          created_at: string
          description: string | null
          fats_g_per_serving: number | null
          fiber_g_per_serving: number | null
          id: string
          image_url: string | null
          ingredients_text: string | null
          instructions: string | null
          name: string
          prep_time_minutes: number | null
          protein_g_per_serving: number | null
          recipe_mode: string
          servings: number
          team_id: string | null
          updated_at: string
        }
        Insert: {
          calories_per_serving?: number | null
          carbs_g_per_serving?: number | null
          category?: string | null
          coach_id?: string | null
          created_at?: string
          description?: string | null
          fats_g_per_serving?: number | null
          fiber_g_per_serving?: number | null
          id?: string
          image_url?: string | null
          ingredients_text?: string | null
          instructions?: string | null
          name: string
          prep_time_minutes?: number | null
          protein_g_per_serving?: number | null
          recipe_mode?: string
          servings?: number
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          calories_per_serving?: number | null
          carbs_g_per_serving?: number | null
          category?: string | null
          coach_id?: string | null
          created_at?: string
          description?: string | null
          fats_g_per_serving?: number | null
          fiber_g_per_serving?: number | null
          id?: string
          image_url?: string | null
          ingredients_text?: string | null
          instructions?: string | null
          name?: string
          prep_time_minutes?: number | null
          protein_g_per_serving?: number | null
          recipe_mode?: string
          servings?: number
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_recipes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_recipes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_slot_exchange_targets_v2: {
        Row: {
          created_at: string
          exchange_group_id: string
          id: string
          meal_slot_id: string
          notes: string | null
          order_index: number
          portions: number
          snapshot_composed_of: Json | null
          snapshot_group_code: string | null
          snapshot_group_name: string | null
          snapshot_macros_confirmed: boolean | null
          snapshot_ref_calories: number | null
          snapshot_ref_carbs_g: number | null
          snapshot_ref_fats_g: number | null
          snapshot_ref_protein_g: number | null
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          exchange_group_id: string
          id?: string
          meal_slot_id: string
          notes?: string | null
          order_index?: number
          portions: number
          snapshot_composed_of?: Json | null
          snapshot_group_code?: string | null
          snapshot_group_name?: string | null
          snapshot_macros_confirmed?: boolean | null
          snapshot_ref_calories?: number | null
          snapshot_ref_carbs_g?: number | null
          snapshot_ref_fats_g?: number | null
          snapshot_ref_protein_g?: number | null
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          exchange_group_id?: string
          id?: string
          meal_slot_id?: string
          notes?: string | null
          order_index?: number
          portions?: number
          snapshot_composed_of?: Json | null
          snapshot_group_code?: string | null
          snapshot_group_name?: string | null
          snapshot_macros_confirmed?: boolean | null
          snapshot_ref_calories?: number | null
          snapshot_ref_carbs_g?: number | null
          snapshot_ref_fats_g?: number | null
          snapshot_ref_protein_g?: number | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nstet_slot_version_fkey"
            columns: ["meal_slot_id", "version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_slots_v2"
            referencedColumns: ["id", "version_id"]
          },
          {
            foreignKeyName: "nutrition_slot_exchange_targets_v2_exchange_group_id_fkey"
            columns: ["exchange_group_id"]
            isOneToOne: false
            referencedRelation: "exchange_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_v2_audit_log: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          client_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          idempotency_key: string | null
          intake_entry_id: string | null
          metadata: Json
          occurred_at: string
          plan_id: string | null
          version_id: string | null
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id?: string | null
          client_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          idempotency_key?: string | null
          intake_entry_id?: string | null
          metadata?: Json
          occurred_at?: string
          plan_id?: string | null
          version_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          client_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          idempotency_key?: string | null
          intake_entry_id?: string | null
          metadata?: Json
          occurred_at?: string
          plan_id?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_v2_audit_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_v2_audit_log_intake_entry_id_fkey"
            columns: ["intake_entry_id"]
            isOneToOne: false
            referencedRelation: "nutrition_intake_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_v2_audit_log_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_v2_audit_log_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_versions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_v2_conversion_links: {
        Row: {
          client_id: string
          coach_id: string
          converted_at: string
          fidelity: Json
          id: string
          last_synced_v1_updated_at: string
          status: string
          v1_plan_id: string
          v2_plan_id: string
          v2_version_id: string
        }
        Insert: {
          client_id: string
          coach_id: string
          converted_at?: string
          fidelity?: Json
          id?: string
          last_synced_v1_updated_at: string
          status: string
          v1_plan_id: string
          v2_plan_id: string
          v2_version_id: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          converted_at?: string
          fidelity?: Json
          id?: string
          last_synced_v1_updated_at?: string
          status?: string
          v1_plan_id?: string
          v2_plan_id?: string
          v2_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_v2_conversion_links_v1_plan_id_fkey"
            columns: ["v1_plan_id"]
            isOneToOne: true
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_v2_conversion_links_v2_plan_id_fkey"
            columns: ["v2_plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_v2_conversion_links_v2_version_id_fkey"
            columns: ["v2_version_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_versions_v2"
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
          alumno_area_migrated_at: string | null
          billing_cycle: string | null
          billing_start_date: string | null
          brand_draft: Json | null
          brand_history: Json
          brand_published_at: string | null
          brand_published_by: string | null
          brand_secondary_color: string | null
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
          loader_variant: string
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
          alumno_area_migrated_at?: string | null
          billing_cycle?: string | null
          billing_start_date?: string | null
          brand_draft?: Json | null
          brand_history?: Json
          brand_published_at?: string | null
          brand_published_by?: string | null
          brand_secondary_color?: string | null
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
          loader_variant?: string
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
          alumno_area_migrated_at?: string | null
          billing_cycle?: string | null
          billing_start_date?: string | null
          brand_draft?: Json | null
          brand_history?: Json
          brand_published_at?: string | null
          brand_published_by?: string | null
          brand_secondary_color?: string | null
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
          loader_variant?: string
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
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          note: string | null
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          note?: string | null
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          note?: string | null
          revoked_at?: string | null
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
      shopping_list_items: {
        Row: {
          category: string | null
          client_id: string
          created_at: string
          id: string
          is_checked: boolean
          is_manual: boolean
          label: string
          plan_id: string | null
        }
        Insert: {
          category?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_checked?: boolean
          is_manual?: boolean
          label: string
          plan_id?: string | null
        }
        Update: {
          category?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_checked?: boolean
          is_manual?: boolean
          label?: string
          plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
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
      team_access_logs: {
        Row: {
          action: string
          actor_coach_id: string
          at: string
          client_id: string | null
          id: string
          metadata: Json
          resource: string
          team_id: string
        }
        Insert: {
          action: string
          actor_coach_id: string
          at?: string
          client_id?: string | null
          id?: string
          metadata?: Json
          resource: string
          team_id: string
        }
        Update: {
          action?: string
          actor_coach_id?: string
          at?: string
          client_id?: string | null
          id?: string
          metadata?: Json
          resource?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_access_logs_actor_coach_id_fkey"
            columns: ["actor_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_access_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_access_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_audit_logs: {
        Row: {
          action: string
          actor_coach_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
          team_id: string
        }
        Insert: {
          action: string
          actor_coach_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          team_id: string
        }
        Update: {
          action?: string
          actor_coach_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_logs_actor_coach_id_fkey"
            columns: ["actor_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_audit_logs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_feature_prefs: {
        Row: {
          domain: string
          preset: string | null
          sections: Json
          team_id: string
          updated_at: string
        }
        Insert: {
          domain: string
          preset?: string | null
          sections?: Json
          team_id: string
          updated_at?: string
        }
        Update: {
          domain?: string
          preset?: string | null
          sections?: Json
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_feature_prefs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          can_manage: boolean
          coach_id: string
          deleted_at: string | null
          display_role: string | null
          id: string
          joined_at: string
          status: string
          team_id: string
        }
        Insert: {
          can_manage?: boolean
          coach_id: string
          deleted_at?: string | null
          display_role?: string | null
          id?: string
          joined_at?: string
          status?: string
          team_id: string
        }
        Update: {
          can_manage?: boolean
          coach_id?: string
          deleted_at?: string | null
          display_role?: string | null
          id?: string
          joined_at?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          accent_dark: string | null
          accent_light: string | null
          brand_secondary_color: string | null
          created_at: string
          deleted_at: string | null
          enabled_modules: Json
          id: string
          invite_code: string | null
          loader_icon_mode: string
          loader_text: string | null
          loader_text_color: string | null
          loader_variant: string
          logo_url: string | null
          logo_url_dark: string | null
          name: string
          neutral_tint: boolean
          owner_coach_id: string
          primary_color: string | null
          seat_limit: number
          slug: string
          splash_bg_color: string | null
          suspended_at: string | null
          use_custom_loader: boolean
        }
        Insert: {
          accent_dark?: string | null
          accent_light?: string | null
          brand_secondary_color?: string | null
          created_at?: string
          deleted_at?: string | null
          enabled_modules?: Json
          id?: string
          invite_code?: string | null
          loader_icon_mode?: string
          loader_text?: string | null
          loader_text_color?: string | null
          loader_variant?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          name: string
          neutral_tint?: boolean
          owner_coach_id: string
          primary_color?: string | null
          seat_limit?: number
          slug: string
          splash_bg_color?: string | null
          suspended_at?: string | null
          use_custom_loader?: boolean
        }
        Update: {
          accent_dark?: string | null
          accent_light?: string | null
          brand_secondary_color?: string | null
          created_at?: string
          deleted_at?: string | null
          enabled_modules?: Json
          id?: string
          invite_code?: string | null
          loader_icon_mode?: string
          loader_text?: string | null
          loader_text_color?: string | null
          loader_variant?: string
          logo_url?: string | null
          logo_url_dark?: string | null
          name?: string
          neutral_tint?: boolean
          owner_coach_id?: string
          primary_color?: string | null
          seat_limit?: number
          slug?: string
          splash_bg_color?: string | null
          suspended_at?: string | null
          use_custom_loader?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "teams_owner_coach_id_fkey"
            columns: ["owner_coach_id"]
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
          distance_unit: string | null
          distance_value: number | null
          duration_sec: number | null
          exercise_id: string
          exercise_type_override: string | null
          extra_targets: Json | null
          hr_zone: number | null
          id: string
          instructions: string | null
          interval_config: Json | null
          is_override: boolean
          is_unilateral: boolean | null
          load_type: string | null
          load_unit: string | null
          load_value: number | null
          notes: string | null
          order_index: number
          plan_id: string
          progression_mode: string
          progression_type: string | null
          progression_value: number | null
          reps: string
          reps_unit: string | null
          reps_value: number | null
          rest_time: string | null
          rir: string | null
          section: string
          section_template_id: string | null
          sets: number
          side_mode: string | null
          superset_group: string | null
          target_pace_sec_per_km: number | null
          target_weight_kg: number | null
          tempo: string | null
          warmup_rest_time: string | null
        }
        Insert: {
          created_at?: string
          distance_unit?: string | null
          distance_value?: number | null
          duration_sec?: number | null
          exercise_id: string
          exercise_type_override?: string | null
          extra_targets?: Json | null
          hr_zone?: number | null
          id?: string
          instructions?: string | null
          interval_config?: Json | null
          is_override?: boolean
          is_unilateral?: boolean | null
          load_type?: string | null
          load_unit?: string | null
          load_value?: number | null
          notes?: string | null
          order_index?: number
          plan_id: string
          progression_mode?: string
          progression_type?: string | null
          progression_value?: number | null
          reps?: string
          reps_unit?: string | null
          reps_value?: number | null
          rest_time?: string | null
          rir?: string | null
          section?: string
          section_template_id?: string | null
          sets?: number
          side_mode?: string | null
          superset_group?: string | null
          target_pace_sec_per_km?: number | null
          target_weight_kg?: number | null
          tempo?: string | null
          warmup_rest_time?: string | null
        }
        Update: {
          created_at?: string
          distance_unit?: string | null
          distance_value?: number | null
          duration_sec?: number | null
          exercise_id?: string
          exercise_type_override?: string | null
          extra_targets?: Json | null
          hr_zone?: number | null
          id?: string
          instructions?: string | null
          interval_config?: Json | null
          is_override?: boolean
          is_unilateral?: boolean | null
          load_type?: string | null
          load_unit?: string | null
          load_value?: number | null
          notes?: string | null
          order_index?: number
          plan_id?: string
          progression_mode?: string
          progression_type?: string | null
          progression_value?: number | null
          reps?: string
          reps_unit?: string | null
          reps_value?: number | null
          rest_time?: string | null
          rir?: string | null
          section?: string
          section_template_id?: string | null
          sets?: number
          side_mode?: string | null
          superset_group?: string | null
          target_pace_sec_per_km?: number | null
          target_weight_kg?: number | null
          tempo?: string | null
          warmup_rest_time?: string | null
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
          {
            foreignKeyName: "workout_blocks_section_template_id_fkey"
            columns: ["section_template_id"]
            isOneToOne: false
            referencedRelation: "workout_section_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          actual_avg_hr: number | null
          actual_distance_m: number | null
          actual_duration_sec: number | null
          actual_hold_sec: number | null
          actual_pace_sec_per_km: number | null
          block_id: string | null
          client_id: string
          exercise_id: string | null
          exercise_name_at_log: string | null
          id: string
          logged_at: string
          metadata: Json | null
          note: string | null
          plan_name_at_log: string | null
          reps_done: number | null
          rir: number | null
          rpe: number | null
          set_number: number
          substituted_exercise_id: string | null
          substituted_exercise_name: string | null
          substitution_reason: string | null
          target_reps_at_log: string | null
          target_weight_at_log: number | null
          weight_kg: number | null
        }
        Insert: {
          actual_avg_hr?: number | null
          actual_distance_m?: number | null
          actual_duration_sec?: number | null
          actual_hold_sec?: number | null
          actual_pace_sec_per_km?: number | null
          block_id?: string | null
          client_id: string
          exercise_id?: string | null
          exercise_name_at_log?: string | null
          id?: string
          logged_at?: string
          metadata?: Json | null
          note?: string | null
          plan_name_at_log?: string | null
          reps_done?: number | null
          rir?: number | null
          rpe?: number | null
          set_number: number
          substituted_exercise_id?: string | null
          substituted_exercise_name?: string | null
          substitution_reason?: string | null
          target_reps_at_log?: string | null
          target_weight_at_log?: number | null
          weight_kg?: number | null
        }
        Update: {
          actual_avg_hr?: number | null
          actual_distance_m?: number | null
          actual_duration_sec?: number | null
          actual_hold_sec?: number | null
          actual_pace_sec_per_km?: number | null
          block_id?: string | null
          client_id?: string
          exercise_id?: string | null
          exercise_name_at_log?: string | null
          id?: string
          logged_at?: string
          metadata?: Json | null
          note?: string | null
          plan_name_at_log?: string | null
          reps_done?: number | null
          rir?: number | null
          rpe?: number | null
          set_number?: number
          substituted_exercise_id?: string | null
          substituted_exercise_name?: string | null
          substitution_reason?: string | null
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
          {
            foreignKeyName: "workout_logs_substituted_exercise_id_fkey"
            columns: ["substituted_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
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
          last_edited_by_coach_id: string | null
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
          last_edited_by_coach_id?: string | null
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
          last_edited_by_coach_id?: string | null
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
            foreignKeyName: "workout_programs_last_edited_by_coach_id_fkey"
            columns: ["last_edited_by_coach_id"]
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
      workout_section_templates: {
        Row: {
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          sort_order: number
          team_id: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          sort_order?: number
          team_id?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          sort_order?: number
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_section_templates_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_section_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      admin_coach_net_monthly_clp: {
        Args: {
          p_billing_cycle: string
          p_redemption_id: string
          p_tier: string
        }
        Returns: number
      }
      admin_tier_monthly_price_clp: {
        Args: { p_tier: string }
        Returns: number
      }
      apply_nutrition_template_to_client: {
        Args: { p_coach?: string; p_op: Json }
        Returns: Json
      }
      assign_org_client_to_coach: {
        Args: { p_client_id: string; p_coach_id: string }
        Returns: undefined
      }
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
      claim_coupon_code: { Args: { p_code_id: string }; Returns: boolean }
      coach_food_last_qty_for_client: {
        Args: { p_client_id: string }
        Returns: {
          food_id: string
          quantity: number
          unit: string
        }[]
      }
      coach_food_last_qty_remember: {
        Args: {
          p_client_id: string
          p_food_id: string
          p_quantity: number
          p_unit: string
        }
        Returns: undefined
      }
      correct_nutrition_intake_v2: {
        Args: {
          p_capture_method: string
          p_client_id: string
          p_correction_reason: string
          p_corrects_entry_id: string
          p_custom_name: string
          p_food_id: string
          p_idempotency_key: string
          p_local_date: string
          p_meal_slot: string
          p_note: string
          p_occurred_at: string
          p_plan_version_id: string
          p_prescription_item_id: string
          p_quantity: number
          p_snapshot: Json
          p_source: string
          p_timezone: string
          p_unit: string
        }
        Returns: string
      }
      create_food_and_resolve_missing_code_scoped_v2: {
        Args: {
          p_brand?: string
          p_calories: number
          p_carbs_g: number
          p_fats_g: number
          p_missing_code_id: string
          p_name: string
          p_org_id?: string
          p_protein_g: number
          p_scope_type: string
          p_team_id?: string
          p_unit?: string
        }
        Returns: string
      }
      current_user_managed_team_ids: { Args: never; Returns: string[] }
      current_user_pool_client_ids: { Args: never; Returns: string[] }
      current_user_pool_coach_ids: { Args: never; Returns: string[] }
      current_user_pool_daily_log_ids: { Args: never; Returns: string[] }
      current_user_pool_meal_ids: { Args: never; Returns: string[] }
      current_user_pool_movement_assessment_ids: {
        Args: never
        Returns: string[]
      }
      current_user_pool_nutrition_plan_ids: { Args: never; Returns: string[] }
      current_user_pool_workout_plan_ids: { Args: never; Returns: string[] }
      current_user_team_ids: { Args: never; Returns: string[] }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      ensure_nutrition_day_snapshot_v2: {
        Args: { p_client_id: string; p_local_date: string; p_timezone?: string }
        Returns: string
      }
      eva_santiago_day: { Args: { ts: string }; Returns: string }
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
          demo_client_count: number
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
      get_client_activity_dates: {
        Args: { p_client_id: string; p_days_back: number }
        Returns: {
          day: string
        }[]
      }
      get_client_current_streak: {
        Args: { p_client_id: string }
        Returns: number
      }
      get_client_daily_tonnage: {
        Args: { p_client_id: string; p_max_days?: number }
        Returns: {
          day: string
          moving_avg: number
          sessions: number
          tonnage: number
        }[]
      }
      get_client_exercise_prs: {
        Args: { p_client_id: string }
        Returns: {
          exercise_id: string
          max_weight_kg: number
          muscle_group: string
          name: string
          reps_at_max: number
        }[]
      }
      get_client_muscle_volume: {
        Args: { p_client_id: string; p_days_back?: number }
        Returns: {
          muscle_group: string
          volume: number
        }[]
      }
      get_client_strength_series: {
        Args: { p_client_id: string }
        Returns: {
          day: string
          exercise_id: string
          muscle_group: string
          name: string
          one_rm: number
          reps_done: number
          total_volume: number
          weight_kg: number
        }[]
      }
      get_client_weekly_prs: {
        Args: { p_client_id: string }
        Returns: {
          before_1rm: number
          before_reps: number
          before_weight: number
          exercise_id: string
          muscle_group: string
          name: string
          pct_change: number
          week_1rm: number
          week_reps: number
          week_weight: number
        }[]
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
      get_clients_streaks_by_ids: {
        Args: { p_client_ids: string[] }
        Returns: {
          client_id: string
          streak: number
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
      get_coach_food_suggestions_v2: {
        Args: { p_client_id?: string; p_limit?: number; p_slot_name?: string }
        Returns: Json
      }
      get_coach_id_by_email: { Args: { p_email: string }; Returns: string }
      get_coach_workout_sessions_30d: {
        Args: { p_coach_id: string }
        Returns: {
          day: string
          sessions: number
        }[]
      }
      get_enterprise_alumno_context: {
        Args: { p_org_slug: string }
        Returns: Json
      }
      get_legacy_tier_counts: {
        Args: never
        Returns: {
          billing_cycle: string
          coach_count: number
          subscription_status: string
          tier: string
        }[]
      }
      get_nutrition_client_detail_scoped_v2: {
        Args: {
          p_client_id: string
          p_local_date?: string
          p_org_id?: string
          p_scope_type: string
          p_team_id?: string
          p_timezone?: string
        }
        Returns: Json
      }
      get_nutrition_client_detail_v2: {
        Args: { p_client_id: string; p_local_date: string; p_timezone?: string }
        Returns: Json
      }
      get_nutrition_coach_hub_scoped_v2: {
        Args: {
          p_cursor_client_id?: string
          p_cursor_score?: number
          p_cursor_updated_at?: string
          p_org_id?: string
          p_page_size?: number
          p_scope_type: string
          p_search?: string
          p_sort?: string
          p_team_id?: string
        }
        Returns: Json
      }
      get_nutrition_coach_hub_v2: {
        Args: {
          p_cursor_client_id?: string
          p_cursor_updated_at?: string
          p_page_size?: number
        }
        Returns: Json
      }
      get_nutrition_coach_roster_scoped_v2: {
        Args: {
          p_cursor_client_id?: string
          p_cursor_name?: string
          p_org_id?: string
          p_page_size?: number
          p_scope_type: string
          p_search?: string
          p_team_id?: string
        }
        Returns: Json
      }
      get_nutrition_history_adapter_v2: {
        Args: { p_client_id: string; p_from: string; p_to: string }
        Returns: {
          calories: number
          carbs_g: number
          disclosure: string
          fats_g: number
          item_name: string
          local_date: string
          meal_slot: string
          metadata: Json
          occurred_at: string
          protein_g: number
          quantity: number
          record_id: string
          source: string
          unit: string
        }[]
      }
      get_nutrition_history_page_v2: {
        Args: { p_before?: string; p_client_id: string; p_page_size?: number }
        Returns: Json
      }
      get_nutrition_legacy_history_detail_v2: {
        Args: { p_client_id: string; p_local_date: string }
        Returns: Json
      }
      get_nutrition_plan_read_v2: {
        Args: { p_as_of_date: string; p_client_id: string; p_timezone?: string }
        Returns: Json
      }
      get_nutrition_student_permissions_v2: {
        Args: {
          p_client_id: string
          p_local_date: string
          p_prescription_item_id?: string
        }
        Returns: Json
      }
      get_nutrition_substitution_options_v2: {
        Args: {
          p_client_id: string
          p_group_food_id?: string
          p_group_limit?: number
          p_group_query?: string
          p_local_date: string
          p_prescription_item_id?: string
        }
        Returns: Json
      }
      get_nutrition_today_v2: {
        Args: { p_client_id: string; p_local_date: string; p_timezone?: string }
        Returns: Json
      }
      get_org_branding: { Args: { p_org_id: string }; Returns: Json }
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
      get_team_alumno_context: { Args: { p_team_slug: string }; Returns: Json }
      get_workout_program_planned_set_totals: {
        Args: { p_program_ids: string[] }
        Returns: {
          program_id: string
          total_planned_sets: number
        }[]
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
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
      is_team_manager: { Args: { p_team_id: string }; Returns: boolean }
      is_team_member: { Args: { p_team_id: string }; Returns: boolean }
      list_missing_food_codes_scoped_v2: {
        Args: {
          p_offset?: number
          p_org_id?: string
          p_page_size?: number
          p_scope_type: string
          p_team_id?: string
        }
        Returns: {
          barcode: string
          country_code: string
          first_seen_at: string
          id: string
          last_seen_at: string
          sightings: number
        }[]
      }
      lookup_food_by_gtin_v2: {
        Args: { p_country_code?: string; p_gtin: string }
        Returns: Json
      }
      nutrition_v2_convert_publish: {
        Args: {
          p_actor: string
          p_effective_from: string
          p_idempotency_key: string
          p_plan_id: string
          p_version_id: string
        }
        Returns: Json
      }
      persist_and_publish_nutrition_plan_v2: {
        Args: {
          p_draft: Json
          p_effective_from: string
          p_expected_current_version_id?: string
          p_idempotency_key: string
          p_plan_id?: string
        }
        Returns: Json
      }
      publish_nutrition_plan_v2: {
        Args: {
          p_effective_from: string
          p_expected_current_version_id?: string
          p_idempotency_key: string
          p_version_id: string
        }
        Returns: string
      }
      record_nutrition_intake_v2: {
        Args: {
          p_capture_method: string
          p_client_id: string
          p_custom_name: string
          p_food_id: string
          p_idempotency_key: string
          p_local_date: string
          p_meal_slot: string
          p_note: string
          p_occurred_at: string
          p_plan_version_id: string
          p_prescription_item_id: string
          p_quantity: number
          p_snapshot: Json
          p_snapshot_macros_basis?: string
          p_source: string
          p_timezone: string
          p_unit: string
        }
        Returns: string
      }
      release_coupon_code: { Args: { p_code_id: string }; Returns: undefined }
      report_missing_food_gtin_v2: {
        Args: {
          p_captured_brand: string
          p_captured_name: string
          p_client_id: string
          p_country_code: string
          p_gtin: string
          p_idempotency_key: string
          p_package_photo_path: string
          p_source: string
        }
        Returns: string
      }
      resolve_active_discount: { Args: never; Returns: Json }
      resolve_missing_food_code_scoped_v2: {
        Args: {
          p_food_id: string
          p_missing_code_id: string
          p_org_id?: string
          p_scope_type: string
          p_team_id?: string
        }
        Returns: string
      }
      save_meal_group_v2: {
        Args: {
          p_group_id?: string
          p_items: Json
          p_name: string
          p_org_id?: string
        }
        Returns: Json
      }
      save_structured_nutrition_recipe: {
        Args: {
          p_category: string
          p_description: string
          p_image_url: string
          p_ingredients: Json
          p_instructions: string
          p_name: string
          p_prep_time_minutes: number
          p_recipe_id: string
          p_servings: number
          p_team_id: string
        }
        Returns: string
      }
      search_food_catalog_v2: {
        Args: {
          p_country_code?: string
          p_cursor_id?: string
          p_cursor_name?: string
          p_cursor_score?: number
          p_page_size?: number
          p_query: string
        }
        Returns: Json
      }
      search_foods: {
        Args: { search_term: string }
        Returns: {
          barcode: string | null
          brand: string | null
          calories: number
          carbs_g: number
          catalog_key: string | null
          catalog_source: string
          category: string | null
          coach_id: string | null
          country_code: string | null
          exchange_group_id: string | null
          exchange_portion_grams: number | null
          exchange_portion_label: string | null
          fats_g: number
          fiber_g: number | null
          household_grams: number | null
          household_label: string | null
          id: string
          is_liquid: boolean
          macros_basis: string
          name: string
          name_search: string | null
          org_id: string | null
          package_quantity: number | null
          package_unit: string | null
          product_image_path: string | null
          protein_g: number
          saturated_fat_g: number | null
          search_aliases: string[]
          serving_size: number
          serving_unit: string | null
          sodium_mg: number | null
          source_ref: string | null
          sugar_g: number | null
          unsaturated_fat_g: number | null
          updated_at: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
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
      soft_delete_nutrition_plan_template_v2: {
        Args: { p_id: string }
        Returns: boolean
      }
      touch_coach_activity: { Args: { p_coach_id: string }; Returns: undefined }
      transfer_team_ownership: {
        Args: { p_new_owner: string; p_team_id: string }
        Returns: undefined
      }
      try_uuid: { Args: { p_value: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      void_nutrition_intake_v2: {
        Args: {
          p_client_id: string
          p_entry_id: string
          p_idempotency_key?: string
          p_reason: string
        }
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
