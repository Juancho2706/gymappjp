import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { CoachRow } from './coach.repository'
import type { ClientRow } from './client.repository'
import type {
    WorkoutBlockRow,
    WorkoutPlanRow,
    WorkoutProgramRow,
    WorkoutLogRow,
} from './workout.repository'
import type {
    FoodRow,
    NutritionMealRow,
    NutritionPlanRow,
    NutritionTemplateRow,
    RecipeRow,
} from './nutrition.repository'
import type {
    AdminAuditLogRow,
    AdminClientListRow,
    AdminCoachListRow,
} from './admin.repository'

export type DbClient = SupabaseClient<Database>

export interface CoachRepository {
    findById(db: DbClient, coachId: string): Promise<CoachRow | null>
    findBySlug(db: DbClient, slug: string): Promise<CoachRow | null>
    findByInviteCode(db: DbClient, code: string): Promise<CoachRow | null>
}

export interface ClientRepository {
    findById(db: DbClient, clientId: string): Promise<ClientRow | null>
    findByCoach(db: DbClient, coachId: string): Promise<ClientRow[]>
}

export interface WorkoutRepository {
    findProgramById(db: DbClient, programId: string, coachId?: string): Promise<WorkoutProgramRow | null>
    findPlansByProgram(db: DbClient, programId: string): Promise<WorkoutPlanRow[]>
    findBlocksByPlan(db: DbClient, planId: string): Promise<WorkoutBlockRow[]>
    findLogsByClient(db: DbClient, clientId: string, limit?: number): Promise<WorkoutLogRow[]>
    upsertProgram(db: DbClient, program: Partial<WorkoutProgramRow>): Promise<WorkoutProgramRow | null>
}

export interface NutritionRepository {
    findPlansByCoach(db: DbClient, coachId: string): Promise<NutritionPlanRow[]>
    findTemplatesByCoach(db: DbClient, coachId: string): Promise<NutritionTemplateRow[]>
    findMealsByPlan(db: DbClient, planId: string): Promise<NutritionMealRow[]>
    findFoods(db: DbClient, coachId: string, limit?: number): Promise<FoodRow[]>
    findRecipeById(db: DbClient, recipeId: string): Promise<RecipeRow | null>
}

export interface AdminRepository {
    findCoachesPaginated(db: DbClient, limit?: number, offset?: number): Promise<AdminCoachListRow[]>
    findClientsPaginated(db: DbClient, limit?: number, offset?: number): Promise<AdminClientListRow[]>
    findAuditLogs(db: DbClient, limit?: number): Promise<AdminAuditLogRow[]>
    countCoaches(db: DbClient): Promise<number>
    countClients(db: DbClient): Promise<number>
}
