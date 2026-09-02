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

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo del formulario de ejercicios: grupos musculares por región + equipo.
//
// Vive acá (y no en un archivo nuevo) porque este módulo ya es la fuente única de
// vocabulario muscular compartida web+RN y ya está exportado por el index del paquete.
// Antes había DOS listas divergentes — `MUSCLE_GROUPS` en `apps/web/src/lib/constants.ts`
// (18 valores, con «Movilidad») y otra en `apps/mobile/lib/exercises.ts` (17, sin ella):
// un coach que editaba en la app un ejercicio de Movilidad no podía volver a elegir su
// grupo. RN RE-EXPORTA de acá; la web mantiene el literal en `lib/constants.ts` (un módulo
// que consumen client components de la landing: re-exportar el barrel del motor le arrastra
// 50 `export *` al bundle) y un test lo compara contra esta lista. Los valores guardados no
// cambian.
//
// Ojo con la otra taxonomía de este archivo: `MUSCLE_REGIONS` son las 9 zonas DIBUJABLES
// de la silueta post-entreno. Las de acá (`MUSCLE_GROUP_REGIONS`) son las pestañas del
// selector del formulario — otro eje, otra granularidad, no se mezclan.
// ─────────────────────────────────────────────────────────────────────────────

/** Pestañas del selector «Grupo muscular» (mockup QA 02-09, opción B). */
export type MuscleGroupRegionId = 'torso' | 'brazos' | 'inferior' | 'core' | 'cardio' | 'movilidad'

export interface MuscleGroupRegion {
    id: MuscleGroupRegionId
    /** Rótulo corto: entra en una pestaña del segmentado (RN) y en un `SelectLabel` (web). */
    label: string
    groups: readonly string[]
}

/**
 * Regiones del selector. Regla de diseño: **ninguna pasa de 6 grupos** — es el tope que
 * mantiene las pills en dos filas sin scroll dentro de la hoja. Por eso «Tren superior»
 * (8 grupos) está partido en Torso + Brazos.
 */
export const MUSCLE_GROUP_REGIONS: readonly MuscleGroupRegion[] = [
    { id: 'torso', label: 'Torso', groups: ['Pectorales', 'Dorsales', 'Espalda Alta', 'Hombros', 'Trapecios'] },
    { id: 'brazos', label: 'Brazos', groups: ['Bíceps', 'Tríceps', 'Antebrazos'] },
    {
        id: 'inferior',
        label: 'Inferior',
        groups: ['Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductores', 'Abductores', 'Pantorrillas'],
    },
    { id: 'core', label: 'Core', groups: ['Abdominales', 'Lumbar'] },
    { id: 'cardio', label: 'Cardio', groups: ['Cardio'] },
    { id: 'movilidad', label: 'Movilidad', groups: ['Movilidad', 'Rehabilitación'] },
]

/**
 * Lista canónica plana. Conserva el ORDEN HISTÓRICO de `apps/web/src/lib/constants.ts`
 * (Hombros primero) con `Rehabilitación` agregada al final: esta lista es la que ordena los
 * encabezados del catálogo del coach y los filtros («Todos, Hombros, Bíceps…»), así que
 * reordenarla le cambia la primera pantalla de Ejercicios a todo el mundo sin que nadie lo
 * haya pedido. Las REGIONES (`MUSCLE_GROUP_REGIONS`) ordenan aparte, para el selector.
 *
 * Se declara literal —y no derivada con `flatMap`— para que `MuscleGroup` siga siendo la
 * unión de strings que `apps/web/src/lib/constants.ts` exporta desde siempre. Que sea la
 * MISMA partición que las regiones (mismos valores, sin sobras ni faltantes) lo garantiza
 * `muscle-map.test.ts`.
 *
 * `Rehabilitación` entra al catálogo: 24 filas en LIVE ya lo usaban sin estar en ninguna de
 * las dos listas, así que al editarlas el campo se veía vacío tanto en web como en RN.
 */
export const MUSCLE_GROUPS = [
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Antebrazos',
    'Cuádriceps',
    'Glúteos',
    'Abductores',
    'Aductores',
    'Pantorrillas',
    'Lumbar',
    'Abdominales',
    'Cardio',
    'Dorsales',
    'Espalda Alta',
    'Isquiotibiales',
    'Pectorales',
    'Trapecios',
    'Movilidad',
    'Rehabilitación',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

/** Región del selector para un grupo, o null si el valor guardado quedó fuera del catálogo. */
export function muscleGroupRegion(group: string | null | undefined): MuscleGroupRegionId | null {
    if (!group) return null
    // Reusa el normalizador del mapa de silueta (minúsculas + sin tildes): así «Espalda alta»
    // o un valor con espacios de más siguen cayendo en su pestaña.
    const key = normalizeMuscle(group)
    for (const region of MUSCLE_GROUP_REGIONS) {
        if (region.groups.some((g) => normalizeMuscle(g) === key)) return region.id
    }
    return null
}

/**
 * Valor CANÓNICO del catálogo para un grupo guardado, o null si quedó fuera.
 *
 * Compara normalizado (minúsculas, sin tildes), así que `'espalda alta'` devuelve
 * `'Espalda Alta'`. Es lo que necesitan las dos UIs para marcar la opción: comparar el valor
 * crudo por igualdad exacta dejaba el campo sin marcar (RN pintaba además una pill duplicada,
 * web dejaba el `Select` vacío) para un valor perfectamente válido.
 */
export function catalogMuscleGroup(group: string | null | undefined): MuscleGroup | null {
    if (!group) return null
    const key = normalizeMuscle(group)
    for (const region of MUSCLE_GROUP_REGIONS) {
        const hit = region.groups.find((g) => normalizeMuscle(g) === key)
        if (hit) return hit as MuscleGroup
    }
    return null
}

/** ¿El valor está en el catálogo ofrecido? `false` ⇒ es legado y hay que mostrarlo aparte. */
export function isCatalogMuscleGroup(group: string | null | undefined): boolean {
    return muscleGroupRegion(group) !== null
}

// ── Equipo ───────────────────────────────────────────────────────────────────

/**
 * Opciones ofrecidas (español). Son las que se GUARDAN cuando el coach elige una.
 *
 * Decisión del jefe (02-09, revisada sobre la SDD): las etiquetas se quedan en ESPAÑOL y los
 * valores en inglés que guarda el catálogo de sistema (`dumbbell`, `cable`, `body weight`…) se
 * mapean con `EQUIPMENT_SYNONYMS`. La UI del coach es en español de punta a punta; ofrecer
 * `dumbbell` en el desplegable habría metido el vocabulario del import de ExerciseDB en la
 * única pantalla donde el coach elige. El AC-H4 de la SDD quedó reescrito con esto.
 */
export const EQUIPMENT_OPTIONS = [
    'Peso libre',
    'Máquina',
    'Poleas',
    'Banda',
    'Corporal',
    'Kettlebell',
    'Otro',
] as const

export type EquipmentOption = (typeof EQUIPMENT_OPTIONS)[number]

/**
 * Sinónimos (normalizados) → opción ofrecida. El catálogo de sistema quedó con los valores
 * EN INGLÉS del import original (ExerciseDB: `dumbbell` 180, `body weight` 141, `cable` 133,
 * `barbell` 104…) mientras que los ejercicios propios usan los 7 en español, así que al editar
 * un ejercicio de sistema no se marcaba NINGUNA opción. Esto es solo para MOSTRAR/MARCAR:
 * mientras el coach no toque el campo, se guarda el valor original tal cual (normalizar la
 * columna `exercises.equipment` en LIVE es un saneo de datos aparte).
 */
const EQUIPMENT_SYNONYMS: Record<string, EquipmentOption> = {
    // Peso libre (mancuernas, barras, discos)
    'peso libre': 'Peso libre',
    dumbbell: 'Peso libre',
    dumbbells: 'Peso libre',
    barbell: 'Peso libre',
    'ez barbell': 'Peso libre',
    'olympic barbell': 'Peso libre',
    'trap bar': 'Peso libre',
    weighted: 'Peso libre',
    'weight plate': 'Peso libre',
    mancuernas: 'Peso libre',
    barra: 'Peso libre',
    // Máquina (incluye asistidas, trineos y los ergómetros de cardio)
    maquina: 'Máquina',
    machine: 'Máquina',
    'leverage machine': 'Máquina',
    'smith machine': 'Máquina',
    'sled machine': 'Máquina',
    'skierg machine': 'Máquina',
    'stepmill machine': 'Máquina',
    'elliptical machine': 'Máquina',
    'stationary bike': 'Máquina',
    'upper body ergometer': 'Máquina',
    assisted: 'Máquina',
    // Poleas
    poleas: 'Poleas',
    polea: 'Poleas',
    cable: 'Poleas',
    cables: 'Poleas',
    // Banda elástica
    banda: 'Banda',
    'banda elastica': 'Banda',
    band: 'Banda',
    'resistance band': 'Banda',
    // Peso corporal
    corporal: 'Corporal',
    'body weight': 'Corporal',
    bodyweight: 'Corporal',
    'peso corporal': 'Corporal',
    // Kettlebell
    kettlebell: 'Kettlebell',
    kettlebells: 'Kettlebell',
    'pesa rusa': 'Kettlebell',
    // Sin equipo / accesorios sueltos → «Otro» (no hay opción propia y no vale inventarla)
    otro: 'Otro',
    other: 'Otro',
    none: 'Otro',
    ninguno: 'Otro',
    roller: 'Otro',
    'foam roller': 'Otro',
    'wheel roller': 'Otro',
    colchoneta: 'Otro',
    baston: 'Otro',
    rope: 'Otro',
    'medicine ball': 'Otro',
    'stability ball': 'Otro',
    'bosu ball': 'Otro',
    tire: 'Otro',
    hammer: 'Otro',
}

/** Opción ofrecida que corresponde a un valor guardado, o null si no se reconoce. */
export function equipmentOption(raw: string | null | undefined): EquipmentOption | null {
    if (!raw) return null
    return EQUIPMENT_SYNONYMS[normalizeMuscle(raw)] ?? null
}

/**
 * Etiqueta en español de un valor guardado. Si no se reconoce, devuelve el valor tal cual
 * (mejor mostrar «Foam roller» que perderlo o rotularlo mal).
 */
export function equipmentLabel(raw: string): string {
    return equipmentOption(raw) ?? raw
}
