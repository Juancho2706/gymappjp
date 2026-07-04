/**
 * Sustitución de "máquina ocupada" (Fase L · workstream C, specs/exec-fase-l DC-2).
 *
 * Lógica PURA de ranking (sin Next/Supabase): dado el ejercicio prescrito y un conjunto de
 * candidatos del MISMO grupo muscular (resuelto en la query con la RLS del alumno), rankea
 * de forma 100% determinista las mejores alternativas des-priorizando el implemento de la
 * máquina ocupada. Modelo de dos criterios de Fitbod (mismo músculo + equipment) adaptado al
 * caso "está ocupada": cuando el prescrito ES una máquina, la MISMA máquina se penaliza (está
 * en uso) y suben peso libre > cable > peso corporal > otras máquinas. Ver informe
 * `docs/audits/fase-l-wl2/informe-sustitucion-maquina.md`.
 *
 * `equipment` del catálogo es texto libre sucio (ES/EN, `Corporal`, `Peso libre`, `Otro`): la
 * normalización + clasificación por tiers vive acá como fuente ÚNICA de verdad; el ranking nunca
 * hace match exacto sin normalizar.
 */

/** Motivo único de sustitución en v1 (NG-4). Constante fuente-única: viaja al log y a la UI. */
export const SUBSTITUTION_REASON = 'machine_busy' as const
export type SubstitutionReason = typeof SUBSTITUTION_REASON

/** Familia normalizada del implemento (tier). Orden de preferencia lo fija `tierScore`. */
export type EquipmentClass = 'free_weight' | 'cable' | 'body_weight' | 'machine' | 'band' | 'other'

/** Forma mínima que necesita el ranking. Los candidatos reales traen más columnas (se preservan). */
export interface RankableExercise {
    id: string
    name: string
    muscle_group: string | null
    equipment: string | null
    secondary_muscles?: string[] | null
    /** Scope del catálogo — sistema (todo null) rankea antes en el tiebreak. */
    coach_id?: string | null
    org_id?: string | null
    team_id?: string | null
}

/**
 * Alias de contaminantes legacy y ES → forma canónica (lowercase). Sólo cubre los valores sucios
 * medidos en prod (`Corporal`, `Peso libre`, `Otro`, …); el resto del texto se compara tal cual
 * (lowercased). "Peso libre" = peso libre real ⇒ familia mancuerna/barra (no peso corporal).
 */
const EQUIPMENT_ALIASES: Record<string, string> = {
    corporal: 'body weight',
    'peso corporal': 'body weight',
    'peso libre': 'dumbbell',
    mancuerna: 'dumbbell',
    mancuernas: 'dumbbell',
    barra: 'barbell',
    polea: 'cable',
    maquina: 'machine',
    'máquina': 'machine',
    banda: 'band',
    otro: 'other',
    '': 'other',
}

/** Normaliza el texto libre de `equipment` (trim + lowercase + alias legacy/ES). Fuente única. */
export function normalizeEquipment(raw: string | null | undefined): string {
    const s = (raw ?? '').trim().toLowerCase()
    return EQUIPMENT_ALIASES[s] ?? s
}

/** Clasifica un `equipment` (texto libre) en su tier canónico. */
export function classifyEquipment(raw: string | null | undefined): EquipmentClass {
    const s = normalizeEquipment(raw)
    if (/leverage|smith|sled|hack|machine/.test(s)) return 'machine'
    if (/cable|pulley|polea/.test(s)) return 'cable'
    if (/dumbbell|barbell|kettlebell|weighted|trap bar|olympic|ez ?barbell|mancuern|\bbarra\b|pesa rusa/.test(s)) return 'free_weight'
    if (/body ?weight|corporal|suspension/.test(s)) return 'body_weight'
    if (/\bband\b|banda/.test(s)) return 'band'
    return 'other'
}

/** Etiqueta ES corta del tier (badge del bottom-sheet). */
const EQUIPMENT_CLASS_LABEL_ES: Record<EquipmentClass, string> = {
    free_weight: 'Peso libre',
    cable: 'Cable',
    body_weight: 'Peso corporal',
    machine: 'Máquina',
    band: 'Banda',
    other: 'Otro',
}

/** Etiqueta legible del implemento para la UI (badge). Usa el tier normalizado, no el texto sucio. */
export function equipmentLabel(raw: string | null | undefined): string {
    return EQUIPMENT_CLASS_LABEL_ES[classifyEquipment(raw)]
}

/** ¿El ejercicio es de scope SISTEMA (catálogo curado, sin dueño)? Rankea antes en el tiebreak. */
function isSystemScope(ex: RankableExercise): boolean {
    return ex.coach_id == null && ex.org_id == null && ex.team_id == null
}

/**
 * Puntaje del tier (entero, mayor = mejor). Determinístico.
 * - Prescrito ES máquina (ocupada): la MISMA máquina = 0 (peor); luego peso libre > cable >
 *   peso corporal > banda > otro > otra máquina (informe: "otras máquinas" al final).
 * - Prescrito NO es máquina: mismo equipment/tier primero (criterio Fitbod), luego el resto.
 */
function tierScore(
    cand: EquipmentClass,
    currentIsMachine: boolean,
    sameEquipString: boolean,
    sameClass: boolean,
): number {
    if (currentIsMachine) {
        if (sameEquipString) return 0
        switch (cand) {
            case 'free_weight': return 100
            case 'cable': return 80
            case 'body_weight': return 60
            case 'band': return 40
            case 'other': return 35
            case 'machine': return 25
        }
    }
    if (sameEquipString || sameClass) return 100
    switch (cand) {
        case 'free_weight': return 70
        case 'cable': return 60
        case 'body_weight': return 45
        case 'machine': return 40
        case 'band': return 35
        case 'other': return 30
    }
}

/** Solapamiento de músculos secundarios (Jaccard) — casi no-op hoy (catálogo vacío), futuro-proof. */
function secondaryJaccard(a: string[] | null | undefined, b: string[] | null | undefined): number {
    const sa = new Set((a ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))
    const sb = new Set((b ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))
    if (sa.size === 0 || sb.size === 0) return 0
    let inter = 0
    for (const x of sa) if (sb.has(x)) inter += 1
    const union = sa.size + sb.size - inter
    return union === 0 ? 0 : inter / union
}

/**
 * Rankea candidatos y devuelve las top `limit` (default 5) alternativas al ejercicio prescrito.
 *
 * Filtro duro defensivo: mismo `muscle_group` que el prescrito + excluir el propio prescrito (la
 * query ya lo hace, pero la función es autosuficiente/testeable). Orden 100% determinista: score
 * desc → sistema antes que scope propio → `name` asc (localeCompare 'es'). La MISMA entrada
 * produce SIEMPRE el mismo orden.
 */
export function rankSubstitutes<T extends RankableExercise>(
    current: RankableExercise,
    candidates: readonly T[],
    opts?: { limit?: number },
): T[] {
    const limit = opts?.limit ?? 5
    const currentClass = classifyEquipment(current.equipment)
    const currentIsMachine = currentClass === 'machine'
    const currentEquipNorm = normalizeEquipment(current.equipment)

    const scored = candidates
        .filter((c) => c.id !== current.id && c.muscle_group === current.muscle_group)
        .map((c) => {
            const cClass = classifyEquipment(c.equipment)
            const cEquipNorm = normalizeEquipment(c.equipment)
            const sameEquipString = currentEquipNorm !== 'other' && cEquipNorm === currentEquipNorm
            const sameClass = cClass === currentClass
            const base = tierScore(cClass, currentIsMachine, sameEquipString, sameClass)
            const bonus = Math.round(secondaryJaccard(current.secondary_muscles, c.secondary_muscles) * 5)
            return { ex: c, score: base + bonus, isSystem: isSystemScope(c), name: c.name ?? '' }
        })

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1
        return a.name.localeCompare(b.name, 'es')
    })

    return scored.slice(0, Math.max(0, limit)).map((s) => s.ex)
}
