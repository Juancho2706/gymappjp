export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            coaches: {
                Row: {
                    id: string
                    slug: string
                    full_name: string
                    brand_name: string
                    primary_color: string
                    logo_url: string | null
                    subscription_status: 'active' | 'past_due' | 'canceled'
                    whatsapp: string | null
                    bio: string | null
                    timezone: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    slug: string
                    full_name: string
                    brand_name: string
                    primary_color?: string
                    logo_url?: string | null
                    subscription_status?: 'active' | 'past_due' | 'canceled'
                    whatsapp?: string | null
                    bio?: string | null
                    timezone?: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    slug?: string
                    full_name?: string
                    brand_name?: string
                    primary_color?: string
                    logo_url?: string | null
                    subscription_status?: 'active' | 'past_due' | 'canceled'
                    whatsapp?: string | null
                    bio?: string | null
                    timezone?: string
                    updated_at?: string
                }
            }
            clients: {
                Row: {
                    id: string
                    coach_id: string
                    full_name: string
                    email: string
                    force_password_change: boolean
                    onboarding_completed: boolean
                    birth_date: string | null
                    height_cm: number | null
                    biological_sex: 'M' | 'F' | 'OTHER' | null
                    primary_goal: 'WEIGHT_LOSS' | 'MUSCLE_GAIN' | 'MAINTENANCE' | 'ENDURANCE' | 'STRENGTH' | null
                    experience_level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null
                    medical_conditions: string | null
                    whatsapp: string | null
                    training_days_per_week: number | null
                    training_location: 'GYM' | 'HOME' | 'OTHER' | null
                    timezone: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    coach_id: string
                    full_name: string
                    email: string
                    force_password_change?: boolean
                    onboarding_completed?: boolean
                    birth_date?: string | null
                    height_cm?: number | null
                    biological_sex?: 'M' | 'F' | 'OTHER' | null
                    primary_goal?: 'WEIGHT_LOSS' | 'MUSCLE_GAIN' | 'MAINTENANCE' | 'ENDURANCE' | 'STRENGTH' | null
                    experience_level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null
                    medical_conditions?: string | null
                    whatsapp?: string | null
                    training_days_per_week?: number | null
                    training_location?: 'GYM' | 'HOME' | 'OTHER' | null
                    timezone?: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    coach_id?: string
                    full_name?: string
                    email?: string
                    force_password_change?: boolean
                    onboarding_completed?: boolean
                    birth_date?: string | null
                    height_cm?: number | null
                    biological_sex?: 'M' | 'F' | 'OTHER' | null
                    primary_goal?: 'WEIGHT_LOSS' | 'MUSCLE_GAIN' | 'MAINTENANCE' | 'ENDURANCE' | 'STRENGTH' | null
                    experience_level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null
                    medical_conditions?: string | null
                    whatsapp?: string | null
                    training_days_per_week?: number | null
                    training_location?: 'GYM' | 'HOME' | 'OTHER' | null
                    timezone?: string
                    updated_at?: string
                }
            }
            exercises: {
                Row: {
                    id: string
                    name: string
                    muscle_group: string
                    video_url: string | null
                    gif_url: string | null
                    instructions: string[] | null
                    equipment: string | null
                    secondary_muscles: string[] | null
                    body_part: string | null
                    coach_id: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    muscle_group: string
                    video_url?: string | null
                    gif_url?: string | null
                    instructions?: string[] | null
                    equipment?: string | null
                    secondary_muscles?: string[] | null
                    body_part?: string | null
                    coach_id?: string | null
                    created_at?: string
                }
                Update: {
                    name?: string
                    muscle_group?: string
                    video_url?: string | null
                    gif_url?: string | null
                    instructions?: string[] | null
                    equipment?: string | null
                    secondary_muscles?: string[] | null
                    body_part?: string | null
                    coach_id?: string | null
                }
            }
            workout_plans: {
                Row: {
                    id: string
                    client_id: string
                    coach_id: string
                    title: string
                    assigned_date: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    client_id: string
                    coach_id: string
                    title: string
                    assigned_date?: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    client_id?: string
                    coach_id?: string
                    title?: string
                    assigned_date?: string
                    updated_at?: string
                }
            }
            workout_blocks: {
                Row: {
                    id: string
                    plan_id: string
                    exercise_id: string
                    order_index: number
                    sets: number
                    reps: string
                    rir: string | null
                    rest_time: string | null
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    plan_id: string
                    exercise_id: string
                    order_index?: number
                    sets?: number
                    reps?: string
                    rir?: string | null
                    rest_time?: string | null
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    plan_id?: string
                    exercise_id?: string
                    order_index?: number
                    sets?: number
                    reps?: string
                    rir?: string | null
                    rest_time?: string | null
                    notes?: string | null
                }
            }
            check_ins: {
                Row: {
                    id: string
                    client_id: string
                    date: string
                    weight: number | null
                    energy_level: number | null
                    front_photo_url: string | null
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    client_id: string
                    date?: string
                    weight?: number | null
                    energy_level?: number | null
                    front_photo_url?: string | null
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    date?: string
                    weight?: number | null
                    energy_level?: number | null
                    front_photo_url?: string | null
                    notes?: string | null
                }
            }
            workout_logs: {
                Row: {
                    id: string
                    block_id: string
                    client_id: string
                    set_number: number
                    weight_kg: number | null
                    reps_done: number | null
                    rpe: number | null
                    logged_at: string
                }
                Insert: {
                    id?: string
                    block_id: string
                    client_id: string
                    set_number: number
                    weight_kg?: number | null
                    reps_done?: number | null
                    rpe?: number | null
                    logged_at?: string
                }
                Update: {
                    set_number?: number
                    weight_kg?: number | null
                    reps_done?: number | null
                    rpe?: number | null
                }
            }
            client_intake: {
                Row: {
                    id: string
                    client_id: string
                    weight_kg: number | null
                    height_cm: number | null
                    goals: string | null
                    experience_level: string | null
                    injuries: string | null
                    medical_conditions: string | null
                    availability: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    client_id: string
                    weight_kg?: number | null
                    height_cm?: number | null
                    goals?: string | null
                    experience_level?: string | null
                    injuries?: string | null
                    medical_conditions?: string | null
                    availability?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    weight_kg?: number | null
                    height_cm?: number | null
                    goals?: string | null
                    experience_level?: string | null
                    injuries?: string | null
                    medical_conditions?: string | null
                    availability?: string | null
                    updated_at?: string
                }
            }
            nutrition_plans: {
                Row: {
                    id: string
                    client_id: string
                    coach_id: string
                    name: string
                    daily_calories: number | null
                    protein_g: number | null
                    carbs_g: number | null
                    fats_g: number | null
                    instructions: string | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    client_id: string
                    coach_id: string
                    name: string
                    daily_calories?: number | null
                    protein_g?: number | null
                    carbs_g?: number | null
                    fats_g?: number | null
                    instructions?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    name?: string
                    daily_calories?: number | null
                    protein_g?: number | null
                    carbs_g?: number | null
                    fats_g?: number | null
                    instructions?: string | null
                    is_active?: boolean
                    updated_at?: string
                }
            }
            nutrition_meals: {
                Row: {
                    id: string
                    plan_id: string
                    name: string
                    description: string
                    order_index: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    plan_id: string
                    name: string
                    description: string
                    order_index?: number
                    created_at?: string
                }
                Update: {
                    name?: string
                    description?: string
                    order_index?: number
                }
            }
            daily_nutrition_logs: {
                Row: {
                    id: string
                    client_id: string
                    plan_id: string | null
                    log_date: string
                    adherence_percentage: number | null
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    client_id: string
                    plan_id?: string | null
                    log_date?: string
                    adherence_percentage?: number | null
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    plan_id?: string | null
                    log_date?: string
                    adherence_percentage?: number | null
                    notes?: string | null
                }
            }
            nutrition_meal_logs: {
                Row: {
                    id: string
                    daily_log_id: string
                    meal_id: string
                    is_completed: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    daily_log_id: string
                    meal_id: string
                    is_completed?: boolean
                    created_at?: string
                }
                Update: {
                    is_completed?: boolean
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
    }
}

// Convenience type aliases
export type Coach = Database['public']['Tables']['coaches']['Row']
export type CoachInsert = Database['public']['Tables']['coaches']['Insert']
export type CoachUpdate = Database['public']['Tables']['coaches']['Update']

export type Client = Database['public']['Tables']['clients']['Row']
export type ClientInsert = Database['public']['Tables']['clients']['Insert']
export type ClientUpdate = Database['public']['Tables']['clients']['Update']

export type Exercise = Database['public']['Tables']['exercises']['Row']
export type ExerciseInsert = Database['public']['Tables']['exercises']['Insert']

export type WorkoutPlan = Database['public']['Tables']['workout_plans']['Row']
export type WorkoutPlanInsert = Database['public']['Tables']['workout_plans']['Insert']

export type WorkoutBlock = Database['public']['Tables']['workout_blocks']['Row']
export type WorkoutBlockInsert = Database['public']['Tables']['workout_blocks']['Insert']
export type WorkoutBlockUpdate = Database['public']['Tables']['workout_blocks']['Update']

export type CheckIn = Database['public']['Tables']['check_ins']['Row']
export type CheckInInsert = Database['public']['Tables']['check_ins']['Insert']

export type WorkoutLog = Database['public']['Tables']['workout_logs']['Row']
export type WorkoutLogInsert = Database['public']['Tables']['workout_logs']['Insert']

// Extended types with relations
export type WorkoutBlockWithExercise = WorkoutBlock & {
    exercises: Exercise
}

export type WorkoutPlanWithBlocks = WorkoutPlan & {
    workout_blocks: WorkoutBlockWithExercise[]
}

export type ClientWithCoach = Client & {
    coaches: Coach
}

export type ClientIntake = Database['public']['Tables']['client_intake']['Row']
export type ClientIntakeInsert = Database['public']['Tables']['client_intake']['Insert']
export type ClientIntakeUpdate = Database['public']['Tables']['client_intake']['Update']

export type NutritionPlan = Database['public']['Tables']['nutrition_plans']['Row']
export type NutritionPlanInsert = Database['public']['Tables']['nutrition_plans']['Insert']

export type NutritionMeal = Database['public']['Tables']['nutrition_meals']['Row']
export type NutritionMealInsert = Database['public']['Tables']['nutrition_meals']['Insert']

export type DailyNutritionLog = Database['public']['Tables']['daily_nutrition_logs']['Row']
export type NutritionMealLog = Database['public']['Tables']['nutrition_meal_logs']['Row']

export type NutritionPlanWithMeals = NutritionPlan & {
    nutrition_meals: NutritionMeal[]
}
