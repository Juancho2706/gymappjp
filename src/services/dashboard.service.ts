import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export class DashboardService {
    constructor(private supabase: SupabaseClient<Database>) {}

    async getAdherenceStats(coachId: string) {
        // 1. Obtener todos los alumnos del coach
        const { data: clients, error: clientsError } = await this.supabase
            .from('clients')
            .select('id, full_name')
            .eq('coach_id', coachId);

        if (clientsError || !clients) return [];

        // 2. Para cada alumno, calcular adherencia de la última semana
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);

        const stats = await Promise.all(
            clients.map(async (client) => {
                const { data: logs } = await this.supabase
                    .from('workout_logs')
                    .select('*')
                    .eq('client_id', client.id)
                    .gte('logged_at', lastWeek.toISOString());

                // Obtener bloques de entrenamiento programados activos para este cliente
                const { data: activePlans } = await this.supabase
                    .from('workout_plans')
                    .select('id')
                    .eq('client_id', client.id);

                let totalPlannedSets = 0;
                if (activePlans && activePlans.length > 0) {
                    const planIds = activePlans.map((p) => p.id);
                    const { data: blocks } = await this.supabase
                        .from('workout_blocks')
                        .select('sets')
                        .in('plan_id', planIds);

                    totalPlannedSets =
                        blocks?.reduce((acc, b) => acc + (b.sets || 0), 0) || 0;
                }

                const logsCount = logs?.length || 0;
                const percentage =
                    totalPlannedSets > 0
                        ? Math.min(
                              Math.round((logsCount / totalPlannedSets) * 100),
                              100
                          )
                        : 0;

                const lastPlanName =
                    logs && logs.length > 0
                        ? (logs[logs.length - 1] as any).plan_name_at_log || 'Plan Actual' // TODO: add plan_name_at_log to DB types if exists or join
                        : 'Sin actividad reciente';

                return {
                    clientId: client.id,
                    clientName: client.full_name,
                    percentage,
                    lastPlan: lastPlanName,
                    completedSets: logsCount,
                    totalSets: totalPlannedSets,
                };
            })
        );

        return stats;
    }

    async getNutritionStats(coachId: string) {
        const { data: clients, error: clientsError } = await this.supabase
            .from('clients')
            .select('id, full_name')
            .eq('coach_id', coachId);

        if (clientsError || !clients) return [];

        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);

        const stats = await Promise.all(
            clients.map(async (client) => {
                const { data: dailyLogs } = await this.supabase
                    .from('daily_nutrition_logs')
                    .select(`
                        *,
                        nutrition_meal_logs (
                            *,
                            nutrition_meals (
                                *,
                                food_items (
                                    *,
                                    foods (*)
                                )
                            )
                        )
                    `)
                    .eq('client_id', client.id)
                    .gte('log_date', lastWeek.toISOString().split('T')[0]);

                let totalConsumed = { cal: 0, prot: 0, carb: 0, fat: 0 };
                let totalTarget = { cal: 0, prot: 0, carb: 0, fat: 0 };
                let mealsCompleted = 0;
                let totalMeals = 0;
                let lastPlanName = 'Sin plan';

                dailyLogs?.forEach((log: any) => { // Type definition for joined table is complex, keeping any for now but localized to service
                    lastPlanName = log.plan_name_at_log || lastPlanName;
                    totalTarget.cal += log.target_calories_at_log || 0;
                    totalTarget.prot += log.target_protein_at_log || 0;
                    totalTarget.carb += log.target_carbs_at_log || 0;
                    totalTarget.fat += log.target_fats_at_log || 0;

                    log.nutrition_meal_logs?.forEach((mealLog: any) => {
                        totalMeals++;
                        if (mealLog.is_completed) {
                            mealsCompleted++;
                            mealLog.nutrition_meals?.food_items?.forEach(
                                (item: any) => {
                                    const f = item.foods;
                                    if (f) {
                                        const q =
                                            (item.quantity || 0) /
                                            (f.serving_size || 100);
                                        totalConsumed.cal +=
                                            (f.calories || 0) * q;
                                        totalConsumed.prot +=
                                            (f.protein_g || 0) * q;
                                        totalConsumed.carb +=
                                            (f.carbs_g || 0) * q;
                                        totalConsumed.fat +=
                                            (f.fats_g || 0) * q;
                                    }
                                }
                            );
                        }
                    });
                });

                const adherencePercentage =
                    totalMeals > 0
                        ? Math.round((mealsCompleted / totalMeals) * 100)
                        : 0;

                return {
                    clientId: client.id,
                    clientName: client.full_name,
                    percentage: adherencePercentage,
                    lastPlan: lastPlanName,
                    consumed: totalConsumed,
                    target: totalTarget,
                };
            })
        );

        return stats;
    }
}
