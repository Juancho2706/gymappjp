/**
 * Mapa muscular del resumen post-entreno (Fase M5).
 *
 * Lógica pura (sin React ni framer-motion) para mapear los `muscle_group` (ES, del
 * catálogo de ejercicios — ver `MUSCLE_GROUPS` en `lib/constants.ts`) a las regiones
 * de la silueta estilizada, y calcular la intensidad relativa por región según el
 * volumen (Σ peso×reps) trabajado hoy. Reutiliza SOLO datos ya en memoria (los logs de
 * la sesión) — cero queries nuevas.
 *
 * La silueta NO es anatómica: agrupa músculos afines en 9 regiones dibujables
 * (frente + espalda). `cardio`/`movilidad` no pintan región (no son grupos de fuerza)
 * pero siguen apareciendo en el desglose numérico por grupo del overlay.
 */

export type MuscleRegion =
    | 'pecho'
    | 'espalda'
    | 'hombros'
    | 'brazos'
    | 'core'
    | 'gluteos'
    | 'cuadriceps'
    | 'isquios'
    | 'gemelos'

export const MUSCLE_REGIONS: MuscleRegion[] = [
    'pecho',
    'espalda',
    'hombros',
    'brazos',
    'core',
    'gluteos',
    'cuadriceps',
    'isquios',
    'gemelos',
]

/** Normaliza un nombre de grupo: minúsculas, sin tildes, sin espacios de borde. */
export function normalizeMuscle(raw: string): string {
    // NFD descompone las tildes en (letra base + marca combinante U+0300–U+036F);
    // filtramos esas marcas por code point (evita incrustar caracteres combinantes en el fuente).
    return raw
        .toLowerCase()
        .normalize('NFD')
        .split('')
        .filter((ch) => {
            const c = ch.charCodeAt(0)
            return c < 0x0300 || c > 0x036f
        })
        .join('')
        .trim()
}

/**
 * Sinónimos (ES/EN, ya normalizados) → región de la silueta. Cubre el vocabulario del
 * catálogo (`MUSCLE_GROUPS`) más variantes en inglés de snapshots/imports legacy.
 */
const SYNONYM_TO_REGION: Record<string, MuscleRegion> = {
    // Pecho
    pectorales: 'pecho',
    pecho: 'pecho',
    pectoral: 'pecho',
    chest: 'pecho',
    // Espalda (dorsales, trapecios, espalda alta, lumbar)
    dorsales: 'espalda',
    'espalda alta': 'espalda',
    espalda: 'espalda',
    lats: 'espalda',
    'upper back': 'espalda',
    trapecios: 'espalda',
    trapecio: 'espalda',
    traps: 'espalda',
    lumbar: 'espalda',
    'lower back': 'espalda',
    back: 'espalda',
    // Hombros
    hombros: 'hombros',
    shoulders: 'hombros',
    delts: 'hombros',
    deltoides: 'hombros',
    // Brazos (bíceps, tríceps, antebrazos)
    biceps: 'brazos',
    triceps: 'brazos',
    antebrazos: 'brazos',
    forearms: 'brazos',
    brazos: 'brazos',
    arms: 'brazos',
    // Core / abdomen
    abdominales: 'core',
    abs: 'core',
    core: 'core',
    abdomen: 'core',
    oblicuos: 'core',
    // Glúteos + cadera (abductores/aductores)
    gluteos: 'gluteos',
    glutes: 'gluteos',
    abductores: 'gluteos',
    aductores: 'gluteos',
    abductors: 'gluteos',
    adductors: 'gluteos',
    cadera: 'gluteos',
    // Cuádriceps
    cuadriceps: 'cuadriceps',
    quads: 'cuadriceps',
    quadriceps: 'cuadriceps',
    // Isquiotibiales
    isquiotibiales: 'isquios',
    isquios: 'isquios',
    hamstrings: 'isquios',
    // Gemelos / pantorrillas
    pantorrillas: 'gemelos',
    gemelos: 'gemelos',
    calves: 'gemelos',
}

/** Región de la silueta para un `muscle_group`, o null si no mapea (cardio/movilidad/otros). */
export function muscleGroupToRegion(group: string | null | undefined): MuscleRegion | null {
    if (!group) return null
    return SYNONYM_TO_REGION[normalizeMuscle(group)] ?? null
}

/**
 * Intensidad relativa (0..1) por región a partir del volumen por grupo muscular.
 * Suma el volumen de los grupos que caen en cada región y normaliza contra la región
 * de mayor volumen (la más trabajada llega a 1). Regiones sin trabajo quedan en 0.
 *
 * `groups` = el desglose que el overlay ya calcula (`{ group, vol }`), no requiere query.
 */
export function muscleGroupsToRegionIntensity(
    groups: { group: string; vol: number }[],
): Record<MuscleRegion, number> {
    const totals: Record<MuscleRegion, number> = {
        pecho: 0,
        espalda: 0,
        hombros: 0,
        brazos: 0,
        core: 0,
        gluteos: 0,
        cuadriceps: 0,
        isquios: 0,
        gemelos: 0,
    }
    for (const { group, vol } of groups) {
        const region = muscleGroupToRegion(group)
        if (!region || vol <= 0) continue
        totals[region] += vol
    }
    const max = Math.max(0, ...MUSCLE_REGIONS.map((r) => totals[r]))
    if (max <= 0) return totals // todo 0 (sesión sin volumen de fuerza)
    const out = { ...totals }
    for (const r of MUSCLE_REGIONS) out[r] = totals[r] / max
    return out
}
