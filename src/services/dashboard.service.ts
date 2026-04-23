import { SupabaseClient } from '@supabase/supabase-js';
import { differenceInDays, subDays } from 'date-fns';
import { Database } from '@/lib/database.types';
import { measureServer } from '@/lib/perf/measure-server';

// Check-ins mensuales: alertar solo si ya hubo al menos un check-in y pasaron >30 días desde el último.
const CHECKIN_OVERDUE_AFTER_DAYS = 30
const WORKOUT_INACTIVE_AFTER_DAYS = 7

// ─── TASK A0: Attention Score ─────────────────────────────────────────────

export type AttentionFlag =
    | 'SIN_CHECKIN_1M'
    | 'SIN_EJERCICIO_7D'
    | 'NUTRICION_RIESGO'
    | 'PROGRAMA_VENCIDO'
    | 'PROGRAMA_POR_VENCER'
    | 'FUERZA_CAYENDO';

/** Inputs for attention scoring (plan: ClientData) */
export interface ClientDataForAttention {
    lastCheckinDate: string | null;
    lastWorkoutDate: string | null;
    hasActiveWorkoutProgram: boolean;
    nutritionCompliance: number;
    planDaysRemaining: number | null;
    oneRMDelta: number | null;
}

export function calculateAttentionScore(client: ClientDataForAttention): {
    score: number;
    flags: AttentionFlag[];
} {
    let score = 0;
    const flags: AttentionFlag[] = [];

    if (client.lastCheckinDate) {
        const daysSinceCheckin = differenceInDays(new Date(), new Date(client.lastCheckinDate));
        if (daysSinceCheckin > CHECKIN_OVERDUE_AFTER_DAYS) {
            score += 25;
            flags.push('SIN_CHECKIN_1M');
        }
    }

    if (client.hasActiveWorkoutProgram) {
        if (!client.lastWorkoutDate) {
            score += 25;
            flags.push('SIN_EJERCICIO_7D');
        } else {
            const daysSinceWorkout = differenceInDays(new Date(), new Date(client.lastWorkoutDate));
            if (daysSinceWorkout >= WORKOUT_INACTIVE_AFTER_DAYS) {
                score += 25;
                flags.push('SIN_EJERCICIO_7D');
            }
        }
    }

    if (client.nutritionCompliance < 60) {
        score += 20;
        flags.push('NUTRICION_RIESGO');
    }

    const planDays = client.planDaysRemaining;
    if (planDays !== null && planDays <= 0) {
        score += 15;
        flags.push('PROGRAMA_VENCIDO');
    } else if (planDays !== null && planDays <= 3) {
        score += 8;
        flags.push('PROGRAMA_POR_VENCER');
    }

    if (client.oneRMDelta !== null && client.oneRMDelta < -5) {
        score += 15;
        flags.push('FUERZA_CAYENDO');
    }

    return { score, flags };
}

function epley1RM(weight: number, reps: number): number {
    return weight * (1 + reps / 30);
}

function parseDay(d: string): Date {
    return new Date(d.length <= 10 ? `${d}T12:00:00` : d);
}

/** Average of daily max Epley 1RM in range [start, end) */
function avgDailyMaxEpley(
    logs: { logged_at: string; weight_kg: number | null; reps_done: number | null }[],
    start: Date,
    end: Date
): number | null {
    const inRange = logs.filter((l) => {
        const t = new Date(l.logged_at);
        return t >= start && t < end && l.weight_kg != null && l.reps_done != null && l.weight_kg > 0;
    });
    if (inRange.length === 0) return null;
    const byDay = new Map<string, number>();
    for (const l of inRange) {
        const day = l.logged_at.slice(0, 10);
        const e = epley1RM(l.weight_kg!, l.reps_done!);
        byDay.set(day, Math.max(byDay.get(day) ?? 0, e));
    }
    const vals = [...byDay.values()];
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeOneRMDelta(
    logs: { logged_at: string; weight_kg: number | null; reps_done: number | null }[]
): number | null {
    const now = new Date();
    const thisStart = subDays(now, 7);
    const prevStart = subDays(now, 14);
    const thisAvg = avgDailyMaxEpley(logs, thisStart, now);
    const prevAvg = avgDailyMaxEpley(logs, prevStart, thisStart);
    if (thisAvg == null || prevAvg == null || prevAvg <= 0) return null;
    return Math.round(((thisAvg - prevAvg) / prevAvg) * 100);
}

function plannedSetsFromProgram(program: any): number {
    if (!program?.workout_plans) return 0;
    return (program.workout_plans as any[]).reduce(
        (acc: number, plan: any) =>
            acc +
            (plan.workout_blocks || []).reduce((s: number, b: any) => s + (b.sets || 0), 0),
        0
    );
}

/** PostgREST `.in()` con muchos UUID puede acercarse a límites de URL; trocear consultas. */
const CLIENT_ID_IN_CHUNK = 120
const PROGRAM_ID_RPC_CHUNK = 80

function chunkIds<T>(arr: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

function adherenceForWindow(
    logs: { logged_at: string }[],
    windowStart: Date,
    windowEnd: Date,
    totalPlannedSets: number
): number {
    const count = logs.filter((l) => {
        const t = new Date(l.logged_at);
        return t >= windowStart && t < windowEnd;
    }).length;
    if (totalPlannedSets <= 0) return 0;
    return Math.min(Math.round((count / totalPlannedSets) * 100), 100);
}

function planMeta(program: any, now: Date) {
    let planDaysRemaining: number | null = null;
    let planCurrentWeek: number | null = null;
    const planTotalWeeks: number | null =
        typeof program?.weeks_to_repeat === 'number' ? program.weeks_to_repeat : null;

    const startRaw = program?.start_date as string | null | undefined;
    const endRaw = program?.end_date as string | null | undefined;
    const durationDays = program?.duration_days as number | null | undefined;

    let endDate: Date | null = null;
    if (endRaw) {
        endDate = parseDay(endRaw);
    } else if (startRaw && planTotalWeeks && planTotalWeeks > 0) {
        endDate = subDays(parseDay(startRaw), -planTotalWeeks * 7);
    } else if (startRaw && durationDays && durationDays > 0) {
        endDate = subDays(parseDay(startRaw), -durationDays);
    }

    if (endDate) {
        planDaysRemaining = differenceInDays(endDate, now);
    }

    if (startRaw) {
        const start = parseDay(startRaw);
        const daysIn = Math.max(0, differenceInDays(now, start));
        const week = Math.floor(daysIn / 7) + 1;
        planCurrentWeek =
            planTotalWeeks && planTotalWeeks > 0 ? Math.min(week, planTotalWeeks) : week;
    }

    return { planDaysRemaining, planCurrentWeek, planTotalWeeks };
}

// ─── TASK A1 + unified pulse (directory + dashboard) ─────────────────────

export interface DirectoryPulseRow {
    clientId: string;
    clientName: string;
    percentage: number;
    lastPlan: string;
    completedSets: number;
    totalSets: number;
    consumed: { cal: number; prot: number; carb: number; fat: number };
    target: { cal: number; prot: number; carb: number; fat: number };
    nutritionPercentage: number;
    lastWorkoutDate: string | null;
    lastCheckinDate: string | null;
    currentWeight: number | null;
    weightDelta7d: number | null;
    weightHistory30d: { date: string; value: number }[];
    adherenceHistory4w: number[];
    oneRMDelta: number | null;
    planDaysRemaining: number | null;
    planCurrentWeek: number | null;
    planTotalWeeks: number | null;
    attentionScore: number;
    attentionFlags: AttentionFlag[];
    streak: number;
    latestEnergyLevel: number | null;
}

export function mapDirectoryPulseToAdherenceStats(pulse: DirectoryPulseRow[]) {
    return pulse.map((p) => ({
        clientId: p.clientId,
        clientName: p.clientName,
        percentage: p.percentage,
        lastPlan: p.lastPlan,
        completedSets: p.completedSets,
        totalSets: p.totalSets,
        lastWorkoutDate: p.lastWorkoutDate,
        lastCheckinDate: p.lastCheckinDate,
        currentWeight: p.currentWeight,
        weightDelta7d: p.weightDelta7d,
        weightHistory30d: p.weightHistory30d,
        adherenceHistory4w: p.adherenceHistory4w,
        oneRMDelta: p.oneRMDelta,
        planDaysRemaining: p.planDaysRemaining,
        planCurrentWeek: p.planCurrentWeek,
        planTotalWeeks: p.planTotalWeeks,
        attentionScore: p.attentionScore,
        attentionFlags: p.attentionFlags,
        streak: p.streak,
        latestEnergyLevel: p.latestEnergyLevel,
        nutritionCompliance: p.nutritionPercentage,
    }));
}

export function mapDirectoryPulseToNutritionStats(pulse: DirectoryPulseRow[]) {
    return pulse.map((p) => ({
        clientId: p.clientId,
        clientName: p.clientName,
        percentage: p.nutritionPercentage,
        lastPlan: p.lastPlan,
        consumed: p.consumed,
        target: p.target,
        lastWorkoutDate: p.lastWorkoutDate,
        lastCheckinDate: p.lastCheckinDate,
        currentWeight: p.currentWeight,
        weightDelta7d: p.weightDelta7d,
        weightHistory30d: p.weightHistory30d,
        adherenceHistory4w: p.adherenceHistory4w,
        oneRMDelta: p.oneRMDelta,
        planDaysRemaining: p.planDaysRemaining,
        planCurrentWeek: p.planCurrentWeek,
        planTotalWeeks: p.planTotalWeeks,
        attentionScore: p.attentionScore,
        attentionFlags: p.attentionFlags,
        streak: p.streak,
        latestEnergyLevel: p.latestEnergyLevel,
        adherence: p.percentage,
    }));
}

export class DashboardService {
    constructor(private supabase: SupabaseClient<Database>) {}

    /**
     * Full per-client metrics for coach directory + attention score.
     * Use React.cache in actions when pairing with getAdherenceStats/getNutritionStats.
     */
    async getDirectoryPulse(coachId: string): Promise<DirectoryPulseRow[]> {
        return measureServer(`getDirectoryPulse coach=${coachId.slice(0, 8)}`, async () =>
            this.getDirectoryPulseInner(coachId)
        );
    }

    private async getDirectoryPulseInner(coachId: string): Promise<DirectoryPulseRow[]> {
        const { data: clients, error: clientsError } = await this.supabase
            .from('clients')
            .select('id, full_name')
            .eq('coach_id', coachId);

        if (clientsError || !clients?.length) return [];

        const clientIds = clients.map((c) => c.id);
        const now = new Date();
        const lastWeekStr = subDays(now, 7).toISOString();
        const logsFrom = subDays(now, 35).toISOString();

        const logChunks = await Promise.all(
            chunkIds(clientIds, CLIENT_ID_IN_CHUNK).map((chunk) =>
                this.supabase
                    .from('workout_logs')
                    .select('client_id, logged_at, weight_kg, reps_done, plan_name_at_log')
                    .in('client_id', chunk)
                    .gte('logged_at', logsFrom)
            )
        );
        const checkChunks = await Promise.all(
            chunkIds(clientIds, CLIENT_ID_IN_CHUNK).map((chunk) =>
                this.supabase
                    .from('check_ins')
                    .select('client_id, created_at, date, weight, energy_level')
                    .in('client_id', chunk)
                    .gte('created_at', logsFrom)
            )
        );
        const programChunks = await Promise.all(
            chunkIds(clientIds, CLIENT_ID_IN_CHUNK).map((chunk) =>
                this.supabase
                    .from('workout_programs')
                    .select(
                        'id, client_id, created_at, start_date, end_date, weeks_to_repeat, duration_days, is_active'
                    )
                    .in('client_id', chunk)
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
            )
        );

        const logsMerged = logChunks.flatMap((r) => r.data ?? []);
        const checksMerged = checkChunks.flatMap((r) => r.data ?? []);
        const programsMerged = programChunks.flatMap((r) => r.data ?? []);

        const logsByClient = new Map<string, typeof logsMerged>();
        for (const row of logsMerged) {
            const id = row.client_id;
            if (!logsByClient.has(id)) logsByClient.set(id, []);
            logsByClient.get(id)!.push(row);
        }

        const checksByClient = new Map<string, typeof checksMerged>();
        for (const row of checksMerged) {
            const id = row.client_id;
            if (!checksByClient.has(id)) checksByClient.set(id, []);
            checksByClient.get(id)!.push(row);
        }

        const programByClient = new Map<string, (typeof programsMerged)[number]>();
        const sortedPrograms = [...programsMerged].sort(
            (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        for (const p of sortedPrograms) {
            const cid = p.client_id;
            if (!cid || programByClient.has(cid)) continue;
            programByClient.set(cid, p);
        }

        const plannedSetTotals = new Map<string, number>();
        const programIdsForRpc = [...new Set(programByClient.values().map((p) => p.id))].filter(Boolean);
        for (const chunk of chunkIds(programIdsForRpc, PROGRAM_ID_RPC_CHUNK)) {
            if (chunk.length === 0) continue;
            const { data, error } = await this.supabase.rpc('get_workout_program_planned_set_totals', {
                p_program_ids: chunk,
            });
            if (error || !data) continue;
            for (const row of data) {
                plannedSetTotals.set(row.program_id, Number(row.total_planned_sets));
            }
        }

        const logDateCutoff = lastWeekStr.split('T')[0]!;
        const nutritionMap = new Map<string, any[]>();
        for (const id of clientIds) nutritionMap.set(id, []);

        const nutritionChunks = await Promise.all(
            chunkIds(clientIds, CLIENT_ID_IN_CHUNK).map((chunk) =>
                this.supabase
                    .from('daily_nutrition_logs')
                    .select(
                        `
                client_id,
                plan_name_at_log,
                target_calories_at_log,
                target_protein_at_log,
                target_carbs_at_log,
                target_fats_at_log,
                nutrition_meal_logs (
                    is_completed,
                    nutrition_meals (
                        food_items (
                            quantity,
                            foods ( calories, protein_g, carbs_g, fats_g, serving_size )
                        )
                    )
                )
            `
                    )
                    .in('client_id', chunk)
                    .gte('log_date', logDateCutoff)
            )
        );

        for (const res of nutritionChunks) {
            if (res.error) continue;
            for (const row of res.data || []) {
                const cid = row.client_id as string;
                if (!nutritionMap.has(cid)) nutritionMap.set(cid, []);
                nutritionMap.get(cid)!.push(row);
            }
        }

        const streakMap = new Map<string, number>();
        const { data: streakBatch, error: streakBatchErr } = await this.supabase.rpc(
            'get_coach_clients_streaks',
            { p_coach_id: coachId }
        );

        const batchRows = streakBatch ?? [];
        if (!streakBatchErr && batchRows.length > 0) {
            for (const row of batchRows) {
                streakMap.set(row.client_id, typeof row.streak === 'number' ? row.streak : 0);
            }
        }

        if (streakMap.size < clientIds.length) {
            const missing = clientIds.filter((id) => !streakMap.has(id));
            const STREAK_FALLBACK_CONCURRENCY = 8
            for (let i = 0; i < missing.length; i += STREAK_FALLBACK_CONCURRENCY) {
                const slice = missing.slice(i, i + STREAK_FALLBACK_CONCURRENCY);
                const fallback = await Promise.all(
                    slice.map(async (clientId) => {
                        const { data, error } = await this.supabase.rpc('get_client_current_streak', {
                            p_client_id: clientId,
                        });
                        if (error) return { clientId, streak: 0 };
                        return { clientId, streak: typeof data === 'number' ? data : 0 };
                    })
                );
                for (const s of fallback) streakMap.set(s.clientId, s.streak);
            }
        }

        const rows: DirectoryPulseRow[] = [];

        for (const client of clients) {
            const id = client.id;
            const logs = logsByClient.get(id) || [];
            const checkIns = checksByClient.get(id) || [];
            const activeProgram = programByClient.get(id);
            const totalPlannedSets =
                activeProgram?.id != null
                    ? (plannedSetTotals.get(activeProgram.id) ?? plannedSetsFromProgram(activeProgram))
                    : 0;

            const logsLastWeek = logs.filter((l) => new Date(l.logged_at) >= new Date(lastWeekStr));
            const logsCount = logsLastWeek.length;
            const percentage =
                totalPlannedSets > 0
                    ? Math.min(Math.round((logsCount / totalPlannedSets) * 100), 100)
                    : 0;

            const lastPlanName =
                logsLastWeek.length > 0
                    ? (logsLastWeek[logsLastWeek.length - 1]!.plan_name_at_log as string | null) ||
                      'Plan Actual'
                    : 'Sin actividad reciente';

            const lastWorkoutDate =
                logs.length > 0
                    ? logs.reduce((max, l) =>
                          new Date(l.logged_at) > new Date(max) ? l.logged_at : max,
                          logs[0]!.logged_at
                      )
                    : null;

            const sortedChecks = [...checkIns].sort(
                (a, b) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            const lastCheckinDate = sortedChecks[0]?.created_at ?? null;

            const withWeight = sortedChecks.filter((c) => c.weight != null);
            const currentWeight =
                withWeight.length > 0 ? (withWeight[0]!.weight as number) : null;

            const thirtyDaysAgo = subDays(now, 30);
            const historyAsc = [...withWeight]
                .filter((c) => new Date(c.created_at) >= thirtyDaysAgo)
                .sort(
                    (a, b) =>
                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
            const weightHistory30d = historyAsc.map((c) => ({
                date: (c.date || c.created_at.slice(0, 10)) as string,
                value: c.weight as number,
            }));

            let weightDelta7d: number | null = null;
            if (currentWeight != null && withWeight.length > 0) {
                const ref = withWeight.find(
                    (c) => differenceInDays(now, new Date(c.created_at)) >= 7
                );
                if (ref?.weight != null) {
                    weightDelta7d = Math.round((currentWeight - ref.weight) * 10) / 10;
                }
            }

            const adherenceHistory4w: number[] = [];
            for (let w = 3; w >= 0; w--) {
                const windowEnd = subDays(now, w * 7);
                const windowStart = subDays(now, (w + 1) * 7);
                adherenceHistory4w.push(
                    adherenceForWindow(logs, windowStart, windowEnd, totalPlannedSets)
                );
            }

            const oneRMDelta = computeOneRMDelta(logs);
            const { planDaysRemaining, planCurrentWeek, planTotalWeeks } = planMeta(
                activeProgram,
                now
            );

            const dailyLogs = nutritionMap.get(id) || [];
            const totalConsumed = { cal: 0, prot: 0, carb: 0, fat: 0 };
            const totalTarget = { cal: 0, prot: 0, carb: 0, fat: 0 };
            let mealsCompleted = 0;
            let totalMeals = 0;
            let lastPlanNutrition = 'Sin plan';

            dailyLogs.forEach((log: any) => {
                lastPlanNutrition = log.plan_name_at_log || lastPlanNutrition;
                totalTarget.cal += log.target_calories_at_log || 0;
                totalTarget.prot += log.target_protein_at_log || 0;
                totalTarget.carb += log.target_carbs_at_log || 0;
                totalTarget.fat += log.target_fats_at_log || 0;

                log.nutrition_meal_logs?.forEach((mealLog: any) => {
                    totalMeals++;
                    if (mealLog.is_completed) {
                        mealsCompleted++;
                        mealLog.nutrition_meals?.food_items?.forEach((item: any) => {
                            const f = item.foods;
                            if (f) {
                                const q = (item.quantity || 0) / (f.serving_size || 100);
                                totalConsumed.cal += (f.calories || 0) * q;
                                totalConsumed.prot += (f.protein_g || 0) * q;
                                totalConsumed.carb += (f.carbs_g || 0) * q;
                                totalConsumed.fat += (f.fats_g || 0) * q;
                            }
                        });
                    }
                });
            });

            const nutritionPercentage =
                totalMeals > 0 ? Math.round((mealsCompleted / totalMeals) * 100) : 0;

            const latestEnergyLevel = sortedChecks[0]?.energy_level ?? null;

            const { score, flags } = calculateAttentionScore({
                lastCheckinDate,
                lastWorkoutDate,
                hasActiveWorkoutProgram: activeProgram != null,
                nutritionCompliance: nutritionPercentage,
                planDaysRemaining,
                oneRMDelta,
            });

            rows.push({
                clientId: id,
                clientName: client.full_name,
                percentage,
                lastPlan: lastPlanName,
                completedSets: logsCount,
                totalSets: totalPlannedSets,
                consumed: totalConsumed,
                target: totalTarget,
                nutritionPercentage,
                lastWorkoutDate,
                lastCheckinDate,
                currentWeight,
                weightDelta7d,
                weightHistory30d,
                adherenceHistory4w,
                oneRMDelta,
                planDaysRemaining,
                planCurrentWeek,
                planTotalWeeks,
                attentionScore: score,
                attentionFlags: flags,
                streak: streakMap.get(id) ?? 0,
                latestEnergyLevel,
            });
        }

        return rows;
    }

    async getAdherenceStats(coachId: string) {
        return mapDirectoryPulseToAdherenceStats(await this.getDirectoryPulse(coachId));
    }

    async getNutritionStats(coachId: string) {
        return mapDirectoryPulseToNutritionStats(await this.getDirectoryPulse(coachId));
    }
}
