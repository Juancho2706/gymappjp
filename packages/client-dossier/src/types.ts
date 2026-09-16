/**
 * @eva/client-dossier — tipos del DOSSIER del alumno (modo «hoy» y modo «mes»).
 *
 * Fuente ÚNICA del contrato que consumen los DOS generadores de PDF (web jsPDF
 * `apps/web/src/lib/pdf/client-dossier-pdf.ts` y RN HTML `apps/mobile/lib/client-dossier-pdf.ts`).
 * Los tipos vivían en `apps/web/src/services/client/client-dossier.ts`, que ahora los
 * RE-EXPORTA para no tocar a sus consumidores (R13).
 *
 * Paquete puro: CERO Next.js / Supabase / React / RN / Date.now().
 *
 * @privacidad El dossier se comparte con el alumno ⇒ NO incluye pagos/billing.
 */

// ─── Dossier (salida serializable) ───────────────────────────────────────────

/** Nivel de atención derivado del attentionScore (mismos umbrales que el War Room). */
export type DossierStatusLevel = 'urgente' | 'atencion' | 'aldia'

export type DossierCheckIn = {
    /** ISO del check-in (created_at). */
    dateIso: string
    weightKg: number | null
    /** Δ peso vs el check-in cronológicamente anterior (null si no hay con qué comparar). */
    weightDeltaKg: number | null
    energyLevel: number | null
    /** Notas truncadas (~200 chars) — null si no hay. */
    notes: string | null
    /** URL firmada de la foto frontal (ya resuelta server-side, TTL corto) — puede ser null. */
    photoUrl: string | null
}

export type DossierPersonalRecord = {
    exerciseName: string
    muscleGroup: string
    maxWeightKg: number
    repsAtMax: number
    /**
     * Modo mes: el récord SUPERA el máximo histórico previo del ejercicio (★ en la tabla y
     * cuenta en el tile «Récords nuevos»). Ausente en el dossier de hoy (PRs all-time).
     */
    isNew?: boolean
}

export type DossierMuscleVolume = {
    muscleGroup: string
    volume: number
}

export type DossierProgramDay = {
    title: string
    dayOfWeek: number | null
    blockCount: number
}

/** Período cubierto por el informe. Ausente = dossier «de hoy» (foto del presente). */
export type DossierPeriod = {
    /** Primer día del período, `YYYY-MM-DD` (local Santiago). */
    fromIso: string
    /** Último día del período, `YYYY-MM-DD`. Mes en curso ⇒ corta en hoy. */
    toIso: string
    /** Clave del mes, `YYYY-MM`. */
    monthKey: string
    /** Rótulo corto del mes, p.ej. `jul 2026`. */
    label: string
    /** Posición de este informe dentro de la exportación (1-based). */
    index: number
    /** Cantidad total de informes de la exportación. */
    total: number
}

/** Tono semántico de un tile. Cada generador lo mapea a SU paleta (jsPDF RGB / CSS hex). */
export type DossierTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'mid'

/**
 * Cuadro KPI ya resuelto por el modelo (R14): los generadores SOLO pintan. Evita que cada
 * rótulo/umbral se toque dos veces (jsPDF + HTML) y que se desincronicen.
 */
export type DossierTile = {
    label: string
    value: string
    sub: string
    tone: DossierTone
}

export type ClientDossierData = {
    /** ISO de generación (pasado por el caller, no calculado acá). */
    generatedAtIso: string
    /**
     * Período del informe mensual. Ausente/undefined = dossier «de hoy» (comportamiento actual,
     * los rótulos de los tiles no cambian).
     */
    period?: DossierPeriod
    /**
     * Los 6 cuadros KPI ya resueltos. En modo mes los calcula `buildClientMonthDossier`; en modo
     * hoy el generador puede pedirlos con `buildTodayTiles(dossier)`.
     */
    tiles?: DossierTile[]
    identity: {
        fullName: string
        email: string
        phone: string | null
        isActive: boolean
        /** ISO de "cliente desde" (subscription_start_date ?? created_at). */
        clientSinceIso: string | null
        streakDays: number
        lastActivityIso: string | null
    }
    status: {
        attentionScore: number
        level: DossierStatusLevel
    }
    metrics: {
        currentWeightKg: number | null
        /** Δ peso último check-in vs anterior. */
        weightDeltaKg: number | null
        workoutsDone: number
        workoutsTarget: number
        adherenceWeeklyPct: number
        /**
         * Nutrición V2 — `null` = sin plan V2 vigente ⇒ el PDF muestra "—", nunca 0 %.
         * Antes eran `todayMealsDone/Total` + `nutritionCompliancePercent` +
         * `nutritionMonthlyAvgPct`, TODOS de las tablas V1 (auditoría §2.2).
         */
        nutritionTodayKcal: { consumed: number; target: number | null } | null
        nutritionTodayPct: number | null
        /** Días de la semana en rango / días transcurridos que cubre el plan. */
        nutritionWeeklyInRangePct: number | null
        checkInCompliancePct: number
        planCurrentWeek: number
        planTotalWeeks: number
        /**
         * SOLO modo mes: adherencia del período (días entrenados ÷ planificados × 100, tope 100).
         * `null` = el mes no tuvo programa ⇒ sin denominador (el tile imprime «—»). En modo hoy
         * queda ausente y manda `adherenceWeeklyPct`.
         */
        periodAdherencePct?: number | null
    }
    program: {
        name: string
        currentWeek: number
        totalWeeks: number
        daysRemaining: number
        days: DossierProgramDay[]
        /**
         * SOLO modo mes: subtítulo ya resuelto («Semanas 2–7 de 12 · finalizó el 18 jul»). Ausente
         * en modo hoy ⇒ el generador sigue componiendo «Semana N/M · X días restantes».
         */
        subtitle?: string | null
    } | null
    training: {
        personalRecords: DossierPersonalRecord[]
        muscleVolume: DossierMuscleVolume[]
    }
    /**
     * Plan de nutrición V2 VIGENTE. `null` = el alumno no tiene plan V2 publicado vigente ⇒ el PDF
     * imprime la nota "sin plan de nutrición vigente". NUNCA se exporta el plan V1 (que podía estar
     * convertido u obsoleto y viajaba al alumno en el PDF: auditoría §2.2).
     */
    nutrition: {
        planName: string
        /** Metas del día vigente (variante que aplica hoy). */
        goals: {
            calories: number | null
            protein: number | null
            carbs: number | null
            fats: number | null
        }
        /** Franjas prescritas para el día vigente. */
        mealsTotal: number
        /** true si el plan tiene más de una variante de día (metas que varían por día). */
        hasDaySpecificMeals: boolean
        /** Metas de energía por variante — se imprimen cuando el plan es multi-día. */
        dayTargets: { label: string; calories: number | null }[]
        /** Adherencia de la semana en curso (días en rango / días computados). `null` = sin dato. */
        weeklyInRangePct: number | null
        weeklyInRangeDays: number
        weeklyTrackedDays: number
        /**
         * SOLO modo mes: días del PERÍODO en rango. Reemplaza a la adherencia semanal (que queda
         * en `null` para que el generador no imprima «Adherencia semanal» en un informe mensual).
         */
        periodInRangeDays?: number
        /** SOLO modo mes: días del período con snapshot registrado (los snapshots son lazy). */
        periodTrackedDays?: number
        /**
         * SOLO modo mes: línea ya resuelta bajo el nombre del plan («12 de 20 días registrados»).
         * Ausente en modo hoy ⇒ el generador sigue componiendo «N franjas · Adherencia semanal…».
         */
        subtitle?: string | null
    } | null
    /** Últimos MAX_CHECKINS check-ins (DESC). El total real vive en checkInsTotal. */
    checkIns: DossierCheckIn[]
    /** Total de check-ins del alumno (modo mes: del mes). */
    checkInsTotal: number
}

// ─── Contrato jsonb del RPC mensual (R10) ────────────────────────────────────

/**
 * Los números pueden viajar como string desde jsonb (numeric ⇒ string en algunos drivers):
 * el modelo los normaliza con `Number`, NUNCA se confía en el tipo runtime.
 */
export type JsonNumber = number | string

export type MonthReportPr = {
    exercise_id?: string | null
    name?: string | null
    muscle_group?: string | null
    max_weight_kg?: JsonNumber | null
    reps_at_max?: JsonNumber | null
    achieved_at?: string | null
    /** Máximo histórico del ejercicio ANTES del mes. `null` = primer récord ⇒ es nuevo. */
    prev_max_kg?: JsonNumber | null
}

export type MonthReportProgramDay = {
    title?: string | null
    day_of_week?: JsonNumber | null
    block_count?: JsonNumber | null
}

export type MonthReportProgram = {
    id?: string | null
    name?: string | null
    start_date?: string | null
    end_date?: string | null
    weeks_total?: JsonNumber | null
    /** Semana del programa en la que cae el inicio del período. */
    week_from?: JsonNumber | null
    /** Semana del programa en la que cae el fin del período. */
    week_to?: JsonNumber | null
    days?: MonthReportProgramDay[] | null
}

export type MonthReportCheckIn = {
    id?: string | null
    created_at?: string | null
    weight?: JsonNumber | null
    energy_level?: JsonNumber | null
    notes?: string | null
    /** Path SIN firmar en el bucket privado `checkins`. */
    front_photo_url?: string | null
}

export type MonthReportNutrition = {
    plan_name?: string | null
    in_range_days?: JsonNumber | null
    tracked_days?: JsonNumber | null
    /** Metas del día tipo, solo si el jsonb las trae a mano (R9). */
    calories?: JsonNumber | null
    protein_g?: JsonNumber | null
    carbs_g?: JsonNumber | null
    fats_g?: JsonNumber | null
}

/** Un elemento de `months` en el retorno de `public.get_client_month_reports` (R10). */
export type MonthReportJson = {
    /** Primer día del mes, `YYYY-MM-DD`. */
    month: string
    period: { from: string; to: string }
    /** Días locales (Santiago) con al menos un log, `YYYY-MM-DD`. */
    training_days?: string[] | null
    sessions?: JsonNumber | null
    /** `null` = el mes no tuvo programa ⇒ adherencia sin denominador. */
    planned_days?: JsonNumber | null
    planned_per_week?: JsonNumber | null
    volume_total?: JsonNumber | null
    volume_by_group?: { muscle_group?: string | null; volume?: JsonNumber | null }[] | null
    prs?: MonthReportPr[] | null
    program?: MonthReportProgram | null
    /** Fallback cuando no hay `workout_programs` vigente: nombres de plan vistos en los logs. */
    plan_names_from_logs?: string[] | null
    /** Orden `created_at` DESC, ya con `reviewed_*` fuera. */
    check_ins?: MonthReportCheckIn[] | null
    weight?: {
        last_kg?: JsonNumber | null
        last_at?: string | null
        /** Check-in con peso inmediatamente anterior a `last_at` (puede ser de otro mes). */
        prev_kg?: JsonNumber | null
    } | null
    nutrition?: MonthReportNutrition | null
}

/** Retorno completo de `public.get_client_month_reports`. */
export type MonthReportsJson = {
    months: MonthReportJson[]
}

/** Retorno de `public.get_client_report_bounds` (R11). */
export type ClientReportBoundsJson = {
    /** `YYYY-MM-DD`, primer día del primer mes con señal. */
    first_month: string
    /** `YYYY-MM-DD`, primer día del mes en curso (Santiago). */
    current_month: string
}

// ─── Opciones del builder mensual ────────────────────────────────────────────

export type MonthDossierIdentity = {
    fullName: string
    email: string
    phone: string | null
    isActive: boolean
    /** ISO de "cliente desde" (subscription_start_date ?? created_at). */
    clientSinceIso: string | null
}

export type BuildClientMonthDossierOpts = {
    /** ISO de generación — ÚNICO para toda la exportación (R15). El builder no toca el reloj. */
    generatedAtIso: string
    identity: MonthDossierIdentity
    /** Posición de este informe (1-based) y total, para el eyebrow «i de n». */
    index: number
    total: number
    /** URL firmada por id de check-in. Ausente / sin entrada ⇒ `photoUrl = null`. */
    photoUrls?: Record<string, string | null>
}
