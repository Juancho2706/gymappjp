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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      check_ins: {
        Row: {
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
      clients: {
        Row: {
          coach_id: string
          created_at: string
          email: string
          force_password_change: boolean
          full_name: string
          id: string
          is_active: boolean | null
          onboarding_completed: boolean
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          email: string
          force_password_change?: boolean
          full_name: string
          id: string
          is_active?: boolean | null
          onboarding_completed?: boolean
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          email?: string
          force_password_change?: boolean
          full_name?: string
          id?: string
          is_active?: boolean | null
          onboarding_completed?: boolean
          updated_at?: string
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
      coaches: {
        Row: {
          brand_name: string
          created_at: string
          full_name: string
          id: string
          logo_url: string | null
          primary_color: string
          slug: string
          subscription_mp_id: string | null
          subscription_status: string
          subscription_tier: string
          trial_ends_at: string | null
          trial_used_email: string | null
          updated_at: string
        }
        Insert: {
          brand_name: string
          created_at?: string
          full_name: string
          id: string
          logo_url?: string | null
          primary_color?: string
          slug: string
          subscription_mp_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          trial_ends_at?: string | null
          trial_used_email?: string | null
          updated_at?: string
        }
        Update: {
          brand_name?: string
          created_at?: string
          full_name?: string
          id?: string
          logo_url?: string | null
          primary_color?: string
          slug?: string
          subscription_mp_id?: string | null
          subscription_status?: string
          subscription_tier?: string
          trial_ends_at?: string | null
          trial_used_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_nutrition_logs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          log_date: string
          plan_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          log_date: string
          plan_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          log_date?: string
          plan_id?: string
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
          equipment: string | null
          gif_url: string | null
          id: string
          instructions: string[] | null
          muscle_group: string
          name: string
          secondary_muscles: string[] | null
          video_end_time: number | null
          video_start_time: number | null
          video_url: string | null
        }
        Insert: {
          body_part?: string | null
          coach_id?: string | null
          created_at?: string
          equipment?: string | null
          gif_url?: string | null
          id?: string
          instructions?: string[] | null
          muscle_group: string
          name: string
          secondary_muscles?: string[] | null
          video_end_time?: number | null
          video_start_time?: number | null
          video_url?: string | null
        }
        Update: {
          body_part?: string | null
          coach_id?: string | null
          created_at?: string
          equipment?: string | null
          gif_url?: string | null
          id?: string
          instructions?: string[] | null
          muscle_group?: string
          name?: string
          secondary_muscles?: string[] | null
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
        ]
      }
      food_items: {
        Row: {
          food_id: string
          id: string
          meal_id: string
          quantity: number
          unit: string
        }
        Insert: {
          food_id: string
          id?: string
          meal_id: string
          quantity: number
          unit?: string
        }
        Update: {
          food_id?: string
          id?: string
          meal_id?: string
          quantity?: number
          unit?: string
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
      foods: {
        Row: {
          calories: number
          carbs_g: number
          coach_id: string | null
          fats_g: number
          id: string
          name: string
          protein_g: number
          serving_size_g: number
        }
        Insert: {
          calories: number
          carbs_g: number
          coach_id?: string | null
          fats_g: number
          id?: string
          name: string
          protein_g: number
          serving_size_g: number
        }
        Update: {
          calories?: number
          carbs_g?: number
          coach_id?: string | null
          fats_g?: number
          id?: string
          name?: string
          protein_g?: number
          serving_size_g?: number
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
      nutrition_meal_logs: {
        Row: {
          created_at: string
          daily_log_id: string
          id: string
          is_completed: boolean
          meal_id: string
        }
        Insert: {
          created_at?: string
          daily_log_id: string
          id?: string
          is_completed?: boolean
          meal_id: string
        }
        Update: {
          created_at?: string
          daily_log_id?: string
          id?: string
          is_completed?: boolean
          meal_id?: string
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
          description: string
          id: string
          name: string
          order_index: number
          plan_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          name: string
          order_index?: number
          plan_id: string
        }
        Update: {
          created_at?: string
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
          name: string
          protein_g: number | null
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
          name: string
          protein_g?: number | null
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
          name?: string
          protein_g?: number | null
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
          id: string
          instructions: string | null
          name: string
          protein_g: number | null
          updated_at: string
        }
        Insert: {
          carbs_g?: number | null
          coach_id: string
          created_at?: string
          daily_calories?: number | null
          description?: string | null
          fats_g?: number | null
          id?: string
          instructions?: string | null
          name: string
          protein_g?: number | null
          updated_at?: string
        }
        Update: {
          carbs_g?: number | null
          coach_id?: string
          created_at?: string
          daily_calories?: number | null
          description?: string | null
          fats_g?: number | null
          id?: string
          instructions?: string | null
          name?: string
          protein_g?: number | null
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
      template_meals: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          template_id: string
        }
        Update: {
          created_at?: string
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
          unit: string
        }
        Insert: {
          food_id: string
          id?: string
          quantity: number
          saved_meal_id: string
          unit?: string
        }
        Update: {
          food_id?: string
          id?: string
          quantity?: number
          saved_meal_id?: string
          unit?: string
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
      workout_blocks: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          notes: string | null
          order_index: number
          plan_id: string
          reps: string
          rest_time: string | null
          rir: string | null
          sets: number
          target_weight_kg: number | null
          tempo: string | null
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          notes?: string | null
          order_index?: number
          plan_id: string
          reps?: string
          rest_time?: string | null
          rir?: string | null
          sets?: number
          target_weight_kg?: number | null
          tempo?: string | null
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          order_index?: number
          plan_id?: string
          reps?: string
          rest_time?: string | null
          rir?: string | null
          sets?: number
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
          id: string
          logged_at: string
          reps_done: number | null
          rpe: number | null
          set_number: number
          weight_kg: number | null
        }
        Insert: {
          block_id: string
          client_id: string
          id?: string
          logged_at?: string
          reps_done?: number | null
          rpe?: number | null
          set_number: number
          weight_kg?: number | null
        }
        Update: {
          block_id?: string
          client_id?: string
          id?: string
          logged_at?: string
          reps_done?: number | null
          rpe?: number | null
          set_number?: number
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
          assigned_date: string
          client_id: string
          coach_id: string
          created_at: string
          day_of_week: number | null
          group_name: string | null
          id: string
          program_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_date?: string
          client_id: string
          coach_id: string
          created_at?: string
          day_of_week?: number | null
          group_name?: string | null
          id?: string
          program_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_date?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          day_of_week?: number | null
          group_name?: string | null
          id?: string
          program_id?: string | null
          title?: string
          updated_at?: string
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
          client_id: string
          coach_id: string
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          start_date: string | null
          updated_at: string
          weeks_to_repeat: number
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          start_date?: string | null
          updated_at?: string
          weeks_to_repeat?: number
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string | null
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_foods: {
        Args: { search_term: string }
        Returns: {
          calories: number
          carbs_g: number
          coach_id: string | null
          fats_g: number
          id: string
          name: string
          protein_g: number
          serving_size_g: number
        }[]
        SetofOptions: {
          from: "*"
          to: "foods"
          isOneToOne: false
          isSetofReturn: true
        }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
