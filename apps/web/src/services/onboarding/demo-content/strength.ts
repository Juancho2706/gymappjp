/**
 * Contenido del alumno de ejemplo — rama `strength` («Matías, 30, hipertrofia», SPEC §4).
 *
 * Esqueleto provisional (D4: lo revisa el socio JP). Datos PUROS: ningún id de catálogo literal,
 * ninguna llamada a Supabase. Los nombres de ejercicio están verificados contra el catálogo del
 * sistema en LIVE el 2026-08-22; igual llevan alternativas y fallback por grupo muscular para que
 * un rename del catálogo no rompa el sembrado.
 *
 * Lo que ve el coach el día 1: un programa de 3 días con áreas del builder, dos semanas de series
 * registradas con progresión semanal, un récord de press de banca ANTEAYER (el «wow» que trae el
 * panel vivo) y dos check-ins con peso y energía.
 */

import type {
    CheckInBlueprint,
    LoggedSessionBlueprint,
    ProgramBlueprint,
} from './types'

/** Full body 3 días — el programa que trae el demo y la plantilla `full-body-3` del catálogo. */
export const FULL_BODY_3: ProgramBlueprint = {
    name: 'Full body 3 días',
    notes: 'Cuerpo completo, 3 días por semana. Progresión de carga semanal en los básicos; el resto se sostiene por sensación (RIR 2). Plantilla de ejemplo: cambia lo que quieras.',
    weeksToRepeat: 6,
    programStructureType: 'weekly',
    durationType: 'weeks',
    phases: [
        { name: 'Adaptación', weeks: 2, color: '#1462DC' },
        { name: 'Acumulación', weeks: 4, color: '#F7B500' },
    ],
    plans: [
        {
            title: 'Full body 3 días — Día A · Empuje dominante',
            dayOfWeek: 1,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'a_mov',
                    exercise: { names: ['Cat/Camel'], fallbackType: 'mobility' },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'mobility',
                    sets: 1,
                    reps: '60s',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 60,
                    instructions: 'Movilidad de columna antes de cargar. Sin buscar rango máximo.',
                },
                {
                    key: 'a_squat',
                    exercise: { names: ['Sentadilla de barra alta'], fallbackMuscleGroup: 'Cuádriceps' },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '6-8',
                    restTime: '150s',
                    warmupRestTime: '60s',
                    tempo: '3-1-1',
                    rir: '2',
                    progression: { mode: 'weekly_linear', type: 'weight', value: 2.5, targetWeightKg: 80 },
                },
                {
                    key: 'a_bench',
                    exercise: { names: ['Press de banca con barra'], fallbackMuscleGroup: 'Pectorales' },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                    rir: '2',
                    progression: { mode: 'weekly_linear', type: 'weight', value: 2.5, targetWeightKg: 70 },
                },
                {
                    key: 'a_row',
                    exercise: {
                        names: ['Remo inclinado con barra en banco', 'Remo en T en máquina'],
                        fallbackMuscleGroup: 'Espalda Alta',
                    },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '10-12',
                    restTime: '90s',
                    rir: '2',
                },
                {
                    key: 'a_plank',
                    exercise: { names: ['Plancha frontal con peso'], fallbackMuscleGroup: 'Abdominales' },
                    orderIndex: 4,
                    section: 'cooldown',
                    areaSlug: 'core_activation',
                    sets: 3,
                    reps: '40s',
                    restTime: '60s',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 40,
                },
            ],
        },
        {
            title: 'Full body 3 días — Día B · Tracción dominante',
            dayOfWeek: 3,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'b_mov',
                    exercise: {
                        names: ['Rotación torácica en cuadrupedia (lumbar bloqueada)'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'mobility',
                    sets: 2,
                    reps: '45s por lado',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 45,
                    sideMode: 'per_side',
                },
                {
                    key: 'b_rdl',
                    exercise: {
                        names: ['Peso muerto con piernas rígidas con mancuernas'],
                        fallbackMuscleGroup: 'Isquiotibiales',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                    rir: '2',
                    progression: { mode: 'weekly_linear', type: 'weight', value: 2.5, targetWeightKg: 60 },
                },
                {
                    key: 'b_pulldown',
                    exercise: {
                        names: ['Pulldown / jalón al pecho en polea', 'Dominadas asistidas con banda elástica'],
                        fallbackMuscleGroup: 'Dorsales',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '10-12',
                    restTime: '90s',
                    rir: '2',
                },
                {
                    key: 'b_press',
                    exercise: {
                        names: ['Press militar de pie con barra y agarre ancho'],
                        fallbackMuscleGroup: 'Hombros',
                    },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '8-10',
                    restTime: '90s',
                    rir: '2',
                },
                {
                    key: 'b_curl',
                    exercise: { names: ['Curl de bíceps de pie con mancuernas'], fallbackMuscleGroup: 'Bíceps' },
                    orderIndex: 4,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '12',
                    restTime: '60s',
                    supersetGroup: 'A',
                },
            ],
        },
        {
            title: 'Full body 3 días — Día C · Pierna y core',
            dayOfWeek: 5,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'c_mov',
                    exercise: {
                        names: ['Sentadilla con toque de puntas (toe touch squat)'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'warmup',
                    sets: 2,
                    reps: '8',
                    exerciseTypeOverride: 'mobility',
                },
                {
                    key: 'c_hip',
                    exercise: {
                        names: ['Levantamiento de cadera acostado con barra / Hip Thrust'],
                        fallbackMuscleGroup: 'Glúteos',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                    rir: '2',
                    progression: { mode: 'weekly_linear', type: 'weight', value: 5, targetWeightKg: 100 },
                },
                {
                    key: 'c_bulgarian',
                    exercise: {
                        names: ['Sentadilla búlgara con mancuernas'],
                        fallbackMuscleGroup: 'Cuádriceps',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '10 por pierna',
                    restTime: '90s',
                    isUnilateral: true,
                    sideMode: 'per_side',
                },
                {
                    key: 'c_triceps',
                    exercise: {
                        names: ['Extensión de tríceps sobre la cabeza en polea alta con cuerda'],
                        fallbackMuscleGroup: 'Tríceps',
                    },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '12-15',
                    restTime: '60s',
                },
                {
                    key: 'c_pallof',
                    exercise: { names: ['Press pallof horizontal con banda'], fallbackMuscleGroup: 'Abdominales' },
                    orderIndex: 4,
                    section: 'cooldown',
                    areaSlug: 'core_activation',
                    sets: 3,
                    reps: '10 por lado',
                    restTime: '45s',
                    sideMode: 'per_side',
                },
            ],
        },
    ],
}

/**
 * Dos semanas de series registradas, con progresión semanal y UN récord: el press de banca sube
 * de 62,5 a 67,5 kg en la última sesión (hace 2 días). El «último entreno» queda ANTEAYER a
 * propósito: el dashboard del coach muestra actividad reciente sin fingir que el alumno entrenó hoy.
 */
export const MATIAS_SESSIONS: readonly LoggedSessionBlueprint[] = [
    // ── Semana 1 ─────────────────────────────────────────────────────────────────────────────
    {
        daysAgo: 13,
        entries: [
            {
                blockKey: 'a_squat',
                kind: 'strength',
                sets: [
                    { weightKg: 60, repsDone: 8, rir: 3, rpe: 7 },
                    { weightKg: 65, repsDone: 7, rir: 2, rpe: 8 },
                    { weightKg: 65, repsDone: 7, rir: 2, rpe: 8 },
                    { weightKg: 65, repsDone: 6, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'a_bench',
                kind: 'strength',
                sets: [
                    { weightKg: 55, repsDone: 10, rir: 3, rpe: 7 },
                    { weightKg: 60, repsDone: 9, rir: 2, rpe: 8 },
                    { weightKg: 60, repsDone: 8, rir: 2, rpe: 8 },
                    { weightKg: 60, repsDone: 8, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'a_row',
                kind: 'strength',
                sets: [
                    { weightKg: 50, repsDone: 12, rir: 2, rpe: 8 },
                    { weightKg: 50, repsDone: 11, rir: 2, rpe: 8 },
                    { weightKg: 50, repsDone: 10, rir: 1, rpe: 9 },
                ],
            },
            { blockKey: 'a_plank', kind: 'hold', sets: [{ holdSec: 40 }, { holdSec: 40 }, { holdSec: 35 }] },
        ],
    },
    {
        daysAgo: 11,
        entries: [
            {
                blockKey: 'b_rdl',
                kind: 'strength',
                sets: [
                    { weightKg: 40, repsDone: 10, rir: 3, rpe: 7 },
                    { weightKg: 45, repsDone: 10, rir: 2, rpe: 8 },
                    { weightKg: 45, repsDone: 9, rir: 2, rpe: 8 },
                    { weightKg: 45, repsDone: 8, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'b_pulldown',
                kind: 'strength',
                sets: [
                    { weightKg: 45, repsDone: 12, rir: 2, rpe: 8 },
                    { weightKg: 45, repsDone: 11, rir: 2, rpe: 8 },
                    { weightKg: 45, repsDone: 10, rir: 1, rpe: 9 },
                    { weightKg: 40, repsDone: 12, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'b_press',
                kind: 'strength',
                sets: [
                    { weightKg: 30, repsDone: 10, rir: 2, rpe: 8 },
                    { weightKg: 32.5, repsDone: 8, rir: 2, rpe: 8 },
                    { weightKg: 32.5, repsDone: 8, rir: 1, rpe: 9 },
                ],
            },
        ],
    },
    {
        daysAgo: 9,
        entries: [
            {
                blockKey: 'c_hip',
                kind: 'strength',
                sets: [
                    { weightKg: 70, repsDone: 10, rir: 3, rpe: 7 },
                    { weightKg: 80, repsDone: 9, rir: 2, rpe: 8 },
                    { weightKg: 80, repsDone: 8, rir: 2, rpe: 8 },
                    { weightKg: 80, repsDone: 8, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'c_bulgarian',
                kind: 'strength',
                sets: [
                    { weightKg: 12, repsDone: 10, rir: 2, rpe: 8 },
                    { weightKg: 12, repsDone: 10, rir: 2, rpe: 8 },
                    { weightKg: 12, repsDone: 9, rir: 1, rpe: 9, note: 'Molestia leve en la rodilla derecha al bajar.' },
                ],
            },
            {
                blockKey: 'c_triceps',
                kind: 'strength',
                sets: [
                    { weightKg: 25, repsDone: 15, rir: 2, rpe: 8 },
                    { weightKg: 25, repsDone: 13, rir: 1, rpe: 9 },
                    { weightKg: 22.5, repsDone: 14, rir: 1, rpe: 9 },
                ],
            },
        ],
    },
    // ── Semana 2 (progresión + récord) ───────────────────────────────────────────────────────
    {
        daysAgo: 6,
        entries: [
            {
                blockKey: 'a_squat',
                kind: 'strength',
                sets: [
                    { weightKg: 65, repsDone: 8, rir: 3, rpe: 7 },
                    { weightKg: 67.5, repsDone: 8, rir: 2, rpe: 8 },
                    { weightKg: 67.5, repsDone: 7, rir: 2, rpe: 8 },
                    { weightKg: 67.5, repsDone: 7, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'a_bench',
                kind: 'strength',
                sets: [
                    { weightKg: 60, repsDone: 10, rir: 3, rpe: 7 },
                    { weightKg: 62.5, repsDone: 9, rir: 2, rpe: 8 },
                    { weightKg: 62.5, repsDone: 9, rir: 2, rpe: 8 },
                    { weightKg: 62.5, repsDone: 8, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'a_row',
                kind: 'strength',
                sets: [
                    { weightKg: 52.5, repsDone: 12, rir: 2, rpe: 8 },
                    { weightKg: 52.5, repsDone: 11, rir: 2, rpe: 8 },
                    { weightKg: 52.5, repsDone: 11, rir: 1, rpe: 9 },
                ],
            },
            { blockKey: 'a_plank', kind: 'hold', sets: [{ holdSec: 45 }, { holdSec: 45 }, { holdSec: 42 }] },
        ],
    },
    {
        daysAgo: 4,
        entries: [
            {
                blockKey: 'b_rdl',
                kind: 'strength',
                sets: [
                    { weightKg: 45, repsDone: 10, rir: 3, rpe: 7 },
                    { weightKg: 47.5, repsDone: 10, rir: 2, rpe: 8 },
                    { weightKg: 47.5, repsDone: 9, rir: 2, rpe: 8 },
                    { weightKg: 47.5, repsDone: 9, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'b_pulldown',
                kind: 'strength',
                sets: [
                    { weightKg: 47.5, repsDone: 12, rir: 2, rpe: 8 },
                    { weightKg: 47.5, repsDone: 12, rir: 2, rpe: 8 },
                    { weightKg: 47.5, repsDone: 11, rir: 1, rpe: 9 },
                    { weightKg: 45, repsDone: 12, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'b_press',
                kind: 'strength',
                sets: [
                    { weightKg: 32.5, repsDone: 10, rir: 2, rpe: 8 },
                    { weightKg: 35, repsDone: 8, rir: 2, rpe: 8 },
                    { weightKg: 35, repsDone: 8, rir: 1, rpe: 9 },
                ],
            },
        ],
    },
    {
        daysAgo: 2,
        entries: [
            {
                // RÉCORD: primera vez con 67,5 kg en press de banca (venía de 62,5).
                blockKey: 'a_bench',
                kind: 'strength',
                sets: [
                    { weightKg: 62.5, repsDone: 10, rir: 3, rpe: 7 },
                    { weightKg: 67.5, repsDone: 8, rir: 1, rpe: 9, note: '¡Récord! Primera vez con 67,5 kg.' },
                    { weightKg: 67.5, repsDone: 7, rir: 1, rpe: 9 },
                    { weightKg: 65, repsDone: 8, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'c_hip',
                kind: 'strength',
                sets: [
                    { weightKg: 80, repsDone: 10, rir: 3, rpe: 7 },
                    { weightKg: 85, repsDone: 9, rir: 2, rpe: 8 },
                    { weightKg: 85, repsDone: 9, rir: 2, rpe: 8 },
                    { weightKg: 85, repsDone: 8, rir: 1, rpe: 9 },
                ],
            },
            {
                blockKey: 'c_pallof',
                kind: 'strength',
                sets: [
                    { weightKg: 15, repsDone: 10, rir: 2, rpe: 7 },
                    { weightKg: 15, repsDone: 10, rir: 2, rpe: 8 },
                    { weightKg: 15, repsDone: 10, rir: 1, rpe: 8 },
                ],
            },
        ],
    },
]

/** Dos check-ins: el de hace dos semanas y el de anteayer (78,4 → 79,1 kg, subida controlada). */
export const MATIAS_CHECK_INS: readonly CheckInBlueprint[] = [
    {
        daysAgo: 14,
        weight: 78.4,
        energyLevel: 3,
        notes: 'Arrancando el bloque. Duermo poco entre semana pero llego bien a los entrenos.',
    },
    {
        daysAgo: 2,
        weight: 79.1,
        energyLevel: 4,
        notes: 'Subí 700 g en dos semanas y el press de banca se siente mucho más firme.',
    },
]

/** Plantilla `upper-lower-4` del catálogo (no la trae el demo). */
export const UPPER_LOWER_4: ProgramBlueprint = {
    name: 'Torso / Pierna 4 días',
    notes: 'Dos torsos y dos piernas por semana, con progresión de carga en los básicos. Para quien ya entrena hace rato.',
    weeksToRepeat: 8,
    programStructureType: 'weekly',
    durationType: 'weeks',
    plans: [
        {
            title: 'Torso / Pierna — Torso A',
            dayOfWeek: 1,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'ul_a_bench',
                    exercise: { names: ['Press de banca con barra'], fallbackMuscleGroup: 'Pectorales' },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '6-8',
                    restTime: '150s',
                    rir: '2',
                    progression: { mode: 'weekly_linear', type: 'weight', value: 2.5 },
                },
                {
                    key: 'ul_a_row',
                    exercise: { names: ['Remo inclinado con barra en banco'], fallbackMuscleGroup: 'Espalda Alta' },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                },
                {
                    key: 'ul_a_press',
                    exercise: { names: ['Press militar de pie con barra y agarre ancho'], fallbackMuscleGroup: 'Hombros' },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '8-10',
                    restTime: '90s',
                },
                {
                    key: 'ul_a_lat',
                    exercise: { names: ['Elevación lateral con mancuernas'], fallbackMuscleGroup: 'Hombros' },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '15',
                    restTime: '45s',
                },
            ],
        },
        {
            title: 'Torso / Pierna — Pierna A',
            dayOfWeek: 2,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'ul_b_squat',
                    exercise: { names: ['Sentadilla de barra alta'], fallbackMuscleGroup: 'Cuádriceps' },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '5-6',
                    restTime: '180s',
                    rir: '2',
                    progression: { mode: 'weekly_linear', type: 'weight', value: 2.5 },
                },
                {
                    key: 'ul_b_rdl',
                    exercise: {
                        names: ['Peso muerto con piernas rígidas con mancuernas'],
                        fallbackMuscleGroup: 'Isquiotibiales',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '8-10',
                    restTime: '120s',
                },
                {
                    key: 'ul_b_bulgarian',
                    exercise: { names: ['Sentadilla búlgara con mancuernas'], fallbackMuscleGroup: 'Cuádriceps' },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '10 por pierna',
                    restTime: '90s',
                    sideMode: 'per_side',
                },
            ],
        },
        {
            title: 'Torso / Pierna — Torso B',
            dayOfWeek: 4,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'ul_c_pulldown',
                    exercise: { names: ['Pulldown / jalón al pecho en polea'], fallbackMuscleGroup: 'Dorsales' },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '10-12',
                    restTime: '90s',
                },
                {
                    key: 'ul_c_incline',
                    exercise: { names: ['Press de banca inclinado con barra'], fallbackMuscleGroup: 'Pectorales' },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                },
                {
                    key: 'ul_c_curl',
                    exercise: { names: ['Curl de bíceps de pie con mancuernas'], fallbackMuscleGroup: 'Bíceps' },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '12',
                    restTime: '60s',
                    supersetGroup: 'A',
                },
                {
                    key: 'ul_c_triceps',
                    exercise: {
                        names: ['Extensión de tríceps sobre la cabeza en polea alta con cuerda'],
                        fallbackMuscleGroup: 'Tríceps',
                    },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '12-15',
                    restTime: '60s',
                    supersetGroup: 'A',
                },
            ],
        },
        {
            title: 'Torso / Pierna — Pierna B',
            dayOfWeek: 5,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'ul_d_hip',
                    exercise: {
                        names: ['Levantamiento de cadera acostado con barra / Hip Thrust'],
                        fallbackMuscleGroup: 'Glúteos',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                },
                {
                    key: 'ul_d_press',
                    exercise: { names: ['Prensa de piernas alterna en máquina'], fallbackMuscleGroup: 'Cuádriceps' },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '12',
                    restTime: '90s',
                },
                {
                    key: 'ul_d_plank',
                    exercise: { names: ['Plancha frontal con peso'], fallbackMuscleGroup: 'Abdominales' },
                    orderIndex: 2,
                    section: 'cooldown',
                    areaSlug: 'core_activation',
                    sets: 3,
                    reps: '45s',
                    restTime: '60s',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 45,
                },
            ],
        },
    ],
}

/** Plantilla `ppl` del catálogo (no la trae el demo). */
export const PUSH_PULL_LEGS: ProgramBlueprint = {
    name: 'Push / Pull / Legs',
    notes: 'Empuje, tracción y pierna. Se corre en 3 días (una vuelta) o en 6 (dos vueltas), según la semana que tenga la persona.',
    weeksToRepeat: 8,
    programStructureType: 'weekly',
    durationType: 'weeks',
    plans: [
        {
            title: 'PPL — Push (empuje)',
            dayOfWeek: 1,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'ppl_push_bench',
                    exercise: { names: ['Press de banca con barra'], fallbackMuscleGroup: 'Pectorales' },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '6-8',
                    restTime: '150s',
                },
                {
                    key: 'ppl_push_press',
                    exercise: { names: ['Press militar de pie con barra y agarre ancho'], fallbackMuscleGroup: 'Hombros' },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                },
                {
                    key: 'ppl_push_lat',
                    exercise: { names: ['Elevación lateral con mancuernas'], fallbackMuscleGroup: 'Hombros' },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '15',
                    restTime: '45s',
                },
                {
                    key: 'ppl_push_triceps',
                    exercise: {
                        names: ['Extensión de tríceps sobre la cabeza en polea alta con cuerda'],
                        fallbackMuscleGroup: 'Tríceps',
                    },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '12-15',
                    restTime: '60s',
                },
            ],
        },
        {
            title: 'PPL — Pull (tracción)',
            dayOfWeek: 3,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'ppl_pull_pulldown',
                    exercise: {
                        names: ['Dominadas asistidas con banda elástica', 'Pulldown / jalón al pecho en polea'],
                        fallbackMuscleGroup: 'Dorsales',
                    },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                },
                {
                    key: 'ppl_pull_row',
                    exercise: { names: ['Remo en T en máquina'], fallbackMuscleGroup: 'Espalda Alta' },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '10-12',
                    restTime: '90s',
                },
                {
                    key: 'ppl_pull_curl',
                    exercise: { names: ['Curl de bíceps de pie con mancuernas'], fallbackMuscleGroup: 'Bíceps' },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '12',
                    restTime: '60s',
                },
            ],
        },
        {
            title: 'PPL — Legs (pierna)',
            dayOfWeek: 5,
            groupName: 'Programa de Entrenamiento',
            blocks: [
                {
                    key: 'ppl_legs_squat',
                    exercise: { names: ['Sentadilla de barra alta'], fallbackMuscleGroup: 'Cuádriceps' },
                    orderIndex: 0,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 5,
                    reps: '5',
                    restTime: '180s',
                    progression: { mode: 'weekly_linear', type: 'weight', value: 2.5 },
                },
                {
                    key: 'ppl_legs_rdl',
                    exercise: {
                        names: ['Peso muerto con piernas rígidas con mancuernas'],
                        fallbackMuscleGroup: 'Isquiotibiales',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 4,
                    reps: '8-10',
                    restTime: '120s',
                },
                {
                    key: 'ppl_legs_hip',
                    exercise: {
                        names: ['Levantamiento de cadera acostado con barra / Hip Thrust'],
                        fallbackMuscleGroup: 'Glúteos',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'main',
                    sets: 3,
                    reps: '10-12',
                    restTime: '90s',
                },
                {
                    key: 'ppl_legs_pallof',
                    exercise: { names: ['Press pallof horizontal con banda'], fallbackMuscleGroup: 'Abdominales' },
                    orderIndex: 3,
                    section: 'cooldown',
                    areaSlug: 'core_activation',
                    sets: 3,
                    reps: '10 por lado',
                    restTime: '45s',
                    sideMode: 'per_side',
                },
            ],
        },
    ],
}
