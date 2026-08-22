/**
 * Contenido del alumno de ejemplo — rama `endurance` («Javiera, 28, 10K en 52'», SPEC §4).
 *
 * Esqueleto provisional (D4: lo revisa el socio JP). Datos PUROS.
 *
 * La semana 1 de «Base 4 semanas · 10K»: rodaje Z2 de 40', series de 8×400 en Z4 con 200 m de
 * recuperación, y fondo Z2 de 70'. Los tres son bloques CARDIO tipados de `workout_blocks`
 * (`hr_zone`, `duration_sec`, `distance_value/unit`, `target_pace_sec_per_km` e
 * `interval_config` para las series) — el mismo modelo polimórfico que ejercita
 * `scripts/seed-catalina-full-qa.mjs`.
 *
 * NUNCA se persisten bpm en la prescripción: solo la ZONA (decisión #4 de specs/movida-entrenamiento).
 * Los bpm de las zonas salen al renderizar del perfil del alumno (`resting_hr`, `birth_date`), que el
 * seed escribe en `clients` con los valores de `DEMO_PROFILES.endurance.cardio`.
 */

import type { LoggedSessionBlueprint, ProgramBlueprint } from './types'

/** Las tres áreas propias de la persona `endurance` (F3.5). Slugs estables. */
export const ENDURANCE_AREAS = [
    { name: 'Rodaje', slug: 'rodaje' },
    { name: 'Series', slug: 'series' },
    { name: 'Fondo', slug: 'fondo' },
] as const

/** Base 4 semanas · 10K — el programa del demo y la plantilla `base-10k-4` del catálogo. */
export const BASE_10K_4: ProgramBlueprint = {
    name: 'Base 4 semanas · 10K',
    notes: 'Semana tipo: dos rodajes suaves en Z2, una sesión de series y un fondo el fin de semana. El 80 % del volumen va en Z2: si el rodaje se siente exigente, está mal corrido.',
    weeksToRepeat: 4,
    programStructureType: 'weekly',
    durationType: 'weeks',
    phases: [
        { name: 'Base aeróbica', weeks: 3, color: '#1462DC' },
        { name: 'Descarga', weeks: 1, color: '#F7B500' },
    ],
    requiredAreas: ENDURANCE_AREAS,
    plans: [
        {
            title: 'Base 10K — Martes · Rodaje Z2',
            dayOfWeek: 2,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'e_rodaje',
                    exercise: {
                        names: ['Trote / carrera al aire libre', 'Carrera / trote en cinta de correr'],
                        fallbackType: 'cardio',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'rodaje',
                    sets: 1,
                    reps: "40' en Z2",
                    restTime: '0s',
                    exerciseTypeOverride: 'cardio',
                    hrZone: 2,
                    durationSec: 2400,
                    distanceValue: 6.2,
                    distanceUnit: 'km',
                    targetPaceSecPerKm: 387,
                    instructions: 'Ritmo conversado: tienes que poder hablar de corrido. Si la FC se va a Z3, camina 30 s y retoma.',
                },
                {
                    key: 'e_rodaje_mov',
                    exercise: {
                        names: ['Estiramiento de pierna recta asistido con banda'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 1,
                    section: 'cooldown',
                    areaSlug: 'rodaje',
                    sets: 2,
                    reps: '40s por lado',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 40,
                    sideMode: 'per_side',
                },
            ],
        },
        {
            title: 'Base 10K — Jueves · Series 8×400',
            dayOfWeek: 4,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'e_series',
                    exercise: {
                        names: ['Trote / carrera al aire libre', 'Carrera / trote en cinta de correr'],
                        fallbackType: 'cardio',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'series',
                    sets: 1,
                    reps: '8×400 m @ Z4',
                    restTime: '0s',
                    exerciseTypeOverride: 'cardio',
                    hrZone: 4,
                    targetPaceSecPerKm: 285,
                    instructions: 'Entra a la primera serie con ritmo controlado: la octava tiene que salir igual que la primera.',
                    intervalConfig: {
                        warmup_sec: 600,
                        cooldown_sec: 300,
                        repeats: 8,
                        work: { distance_m: 400, target: { kind: 'hr_zone', hr_zone: 4 } },
                        recovery: { distance_m: 200, mode: 'jog' },
                    },
                },
            ],
        },
        {
            title: 'Base 10K — Domingo · Fondo Z2',
            dayOfWeek: 7,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'e_fondo',
                    exercise: {
                        names: ['Trote / carrera al aire libre', 'Carrera / trote en cinta de correr'],
                        fallbackType: 'cardio',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'fondo',
                    sets: 1,
                    reps: "70' en Z2",
                    restTime: '0s',
                    exerciseTypeOverride: 'cardio',
                    hrZone: 2,
                    durationSec: 4200,
                    distanceValue: 10.5,
                    distanceUnit: 'km',
                    targetPaceSecPerKm: 400,
                    instructions: 'Sale suave y termina igual de suave. Lleva agua desde el minuto 40.',
                },
                {
                    key: 'e_fondo_caminata',
                    exercise: { names: ['Caminata'], fallbackType: 'cardio' },
                    orderIndex: 1,
                    section: 'cooldown',
                    areaSlug: 'fondo',
                    sets: 1,
                    reps: "8' suaves",
                    exerciseTypeOverride: 'cardio',
                    hrZone: 1,
                    durationSec: 480,
                },
            ],
        },
    ],
}

/**
 * Curva de FC downsampleada del rodaje (pares `[offsetSec, bpm]`, forma `HrMetadataV1.samples`).
 * 20 puntos cada 2 minutos: alcanza para que la ficha del coach pinte la curva sin engordar la fila.
 */
const RODAJE_HR_SAMPLES: [number, number][] = [
    [0, 92],
    [120, 118],
    [240, 133],
    [360, 139],
    [480, 142],
    [600, 143],
    [720, 145],
    [840, 144],
    [960, 146],
    [1080, 147],
    [1200, 145],
    [1320, 146],
    [1440, 148],
    [1560, 147],
    [1680, 145],
    [1800, 146],
    [1920, 149],
    [2040, 148],
    [2160, 147],
    [2280, 143],
    [2400, 121],
]

/** Curva del día de series: dientes de sierra entre la serie (Z4) y el trote de recuperación. */
const SERIES_HR_SAMPLES: [number, number][] = [
    [0, 95],
    [180, 128],
    [360, 138],
    [540, 141],
    [660, 168],
    [780, 148],
    [900, 172],
    [1020, 150],
    [1140, 173],
    [1260, 151],
    [1380, 174],
    [1500, 152],
    [1620, 175],
    [1740, 153],
    [1860, 176],
    [1980, 154],
    [2100, 177],
    [2220, 140],
    [2340, 124],
    [2460, 108],
]

/**
 * Dos sesiones registradas con frecuencia cardíaca: el rodaje de hace 5 días y las series de hace
 * 3. `metadata.hr` va con la forma versionada `HrMetadataV1` (`v: 1`), la misma que escribe el
 * ejecutor de RN al importar del reloj.
 */
export const JAVIERA_SESSIONS: readonly LoggedSessionBlueprint[] = [
    {
        daysAgo: 5,
        entries: [
            {
                blockKey: 'e_rodaje',
                kind: 'cardio',
                sets: [
                    {
                        durationSec: 2400,
                        distanceM: 6180,
                        avgHr: 144,
                        paceSecPerKm: 388,
                        rpe: 4,
                        note: 'Suave de verdad. Pude hablar todo el rodaje.',
                    },
                ],
            },
        ],
    },
    {
        daysAgo: 3,
        entries: [
            {
                blockKey: 'e_series',
                kind: 'cardio',
                sets: [
                    {
                        durationSec: 2520,
                        distanceM: 7400,
                        avgHr: 156,
                        paceSecPerKm: 341,
                        rpe: 8,
                        note: 'Las últimas dos series costaron, pero salieron al mismo ritmo.',
                    },
                ],
            },
        ],
    },
]

/** Curvas por bloque, para que el escritor las cuelgue en `metadata.hr.samples`. */
export const JAVIERA_HR_CURVES: Record<string, { samples: [number, number][]; samplePeriodSec: number; max: number }> = {
    e_rodaje: { samples: RODAJE_HR_SAMPLES, samplePeriodSec: 120, max: 149 },
    e_series: { samples: SERIES_HR_SAMPLES, samplePeriodSec: 120, max: 177 },
}

/** Plantilla `media-maraton-12` del catálogo (no la trae el demo). */
export const MEDIA_MARATON_12: ProgramBlueprint = {
    name: 'Media maratón · 12 semanas',
    notes: 'De la base al ritmo objetivo de 21K. Tres corridas por semana: rodaje, calidad y fondo progresivo.',
    weeksToRepeat: 12,
    programStructureType: 'weekly',
    durationType: 'weeks',
    requiredAreas: ENDURANCE_AREAS,
    plans: [
        {
            title: 'Media 21K — Martes · Rodaje Z2',
            dayOfWeek: 2,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'm_rodaje',
                    exercise: {
                        names: ['Trote / carrera al aire libre', 'Carrera / trote en cinta de correr'],
                        fallbackType: 'cardio',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'rodaje',
                    sets: 1,
                    reps: "50' en Z2",
                    exerciseTypeOverride: 'cardio',
                    hrZone: 2,
                    durationSec: 3000,
                    distanceValue: 8,
                    distanceUnit: 'km',
                    targetPaceSecPerKm: 375,
                },
            ],
        },
        {
            title: 'Media 21K — Jueves · Tempo Z3',
            dayOfWeek: 4,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'm_tempo',
                    exercise: {
                        names: ['Trote / carrera al aire libre', 'Carrera / trote en cinta de correr'],
                        fallbackType: 'cardio',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'series',
                    sets: 1,
                    reps: "3×10' en Z3",
                    exerciseTypeOverride: 'cardio',
                    hrZone: 3,
                    targetPaceSecPerKm: 320,
                    intervalConfig: {
                        warmup_sec: 900,
                        cooldown_sec: 600,
                        repeats: 3,
                        work: { duration_sec: 600, target: { kind: 'hr_zone', hr_zone: 3 } },
                        recovery: { duration_sec: 180, mode: 'jog' },
                    },
                },
            ],
        },
        {
            title: 'Media 21K — Domingo · Fondo progresivo',
            dayOfWeek: 7,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'm_fondo',
                    exercise: {
                        names: ['Trote / carrera al aire libre', 'Carrera / trote en cinta de correr'],
                        fallbackType: 'cardio',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'fondo',
                    sets: 1,
                    reps: '16 km, últimos 4 en Z3',
                    exerciseTypeOverride: 'cardio',
                    hrZone: 2,
                    durationSec: 6000,
                    distanceValue: 16,
                    distanceUnit: 'km',
                    targetPaceSecPerKm: 375,
                },
            ],
        },
    ],
}

/** Plantilla `retorno-lesion` del catálogo (no la trae el demo). */
export const RETORNO_LESION: ProgramBlueprint = {
    name: 'Retorno tras lesión',
    notes: 'Vuelta progresiva con caminata-trote. La regla es simple: si duele durante o al día siguiente, se repite la semana anterior.',
    weeksToRepeat: 6,
    programStructureType: 'weekly',
    durationType: 'weeks',
    requiredAreas: ENDURANCE_AREAS,
    plans: [
        {
            title: 'Retorno — Lunes · Caminata-trote',
            dayOfWeek: 1,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 't_ct1',
                    exercise: { names: ['Caminata'], fallbackType: 'cardio' },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'rodaje',
                    sets: 1,
                    reps: "10' de caminata",
                    exerciseTypeOverride: 'cardio',
                    hrZone: 1,
                    durationSec: 600,
                },
                {
                    key: 't_ct2',
                    exercise: {
                        names: ['Trote / carrera al aire libre', 'Carrera / trote en cinta de correr'],
                        fallbackType: 'cardio',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'rodaje',
                    sets: 1,
                    reps: "6× (2' trote / 2' caminata)",
                    exerciseTypeOverride: 'cardio',
                    hrZone: 2,
                    intervalConfig: {
                        warmup_sec: 0,
                        cooldown_sec: 300,
                        repeats: 6,
                        work: { duration_sec: 120, target: { kind: 'hr_zone', hr_zone: 2 } },
                        recovery: { duration_sec: 120, mode: 'walk' },
                    },
                },
            ],
        },
        {
            title: 'Retorno — Jueves · Fuerza de apoyo',
            dayOfWeek: 4,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 't_talones',
                    exercise: {
                        names: ['Elevación de talones de pie', 'Prensa de pantorrillas en máquina de prensa de piernas'],
                        fallbackMuscleGroup: 'Pantorrillas',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'fondo',
                    sets: 3,
                    reps: '15',
                    restTime: '60s',
                },
                {
                    key: 't_puente',
                    exercise: {
                        names: ['Puente a una pierna con pierna extendida', 'Elevación de cadera / puente de glúteos con banda'],
                        fallbackMuscleGroup: 'Glúteos',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'fondo',
                    sets: 3,
                    reps: '10 por pierna',
                    restTime: '60s',
                    sideMode: 'per_side',
                },
            ],
        },
    ],
}
