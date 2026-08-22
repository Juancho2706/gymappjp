/**
 * Contenido del alumno de ejemplo — rama `rehab` («Pedro, 45, lumbalgia», SPEC §4).
 *
 * Esqueleto provisional (D4: revisor kinesiólogo por definir). Datos PUROS.
 *
 * Tres piezas: (1) el screening de 7 patrones con dos con dolor, (2) las TRES áreas propias que
 * el coach necesita en el builder para trabajar así (F3.5) y (3) la pauta domiciliaria de 3 días
 * colgada de esas áreas.
 *
 * Los puntajes del screening son crudos a propósito: el compuesto, la asimetría y la banda de
 * prioridad las calcula `summarizeAssessment` de `@eva/calc` en el momento de sembrar. Escribir
 * un `composite_score` a mano acá sería exactamente el drift que ese paquete existe para evitar.
 * Los crudos están calibrados para dar compuesto 14/21 (el número que fijó el canvas de diseño),
 * dolor = sí, asimetría = sí (pierna recta) y banda ALTA por el dolor.
 *
 * Los ejercicios salen del catálogo de rehabilitación del sistema (`scripts/seed-rehab-exercises.mjs`);
 * cada referencia lleva alternativa del catálogo de movilidad/core que ya existe, para que la pauta
 * se siembre aunque ese catálogo todavía no esté cargado en el entorno.
 */

import type { MovementAssessmentBlueprint, ProgramBlueprint } from './types'

/**
 * Las tres áreas propias de la persona `rehab`. Slugs ESTABLES: son la clave por la que el seed
 * reconoce sus áreas al re-sembrar y al borrar (`slugifyAreaName` produce exactamente estos).
 * No colisionan con las del sistema (`mobility`, `core_activation`, `main`…).
 */
export const REHAB_AREAS = [
    { name: 'Movilidad', slug: 'movilidad' },
    { name: 'Control motor', slug: 'control-motor' },
    { name: 'Fortalecimiento', slug: 'fortalecimiento' },
] as const

/**
 * Screening de ingreso de Pedro: dos patrones con dolor (flexión de tronco y estabilidad
 * rotatoria) y asimetría en la elevación de pierna recta. Con estos crudos, `@eva/calc` da
 * compuesto 14/21 (el número que fijó el canvas de diseño), dolor = sí, asimetría = sí (pierna
 * recta) y banda ALTA por el dolor.
 *
 * Con dos patrones con dolor —que puntúan 0— llegar a 14 obliga a que los otros cinco sumen
 * 3+3+3+3+2, por eso el perfil es «buena movilidad general, dolor bajo carga en flexión y
 * rotación, leve asimetría posterior». Suma: 3+3+3+3+min(2,3)+0+0 = 14.
 */
export const PEDRO_ASSESSMENT: MovementAssessmentBlueprint = {
    notes: 'Screening de ingreso. Lumbalgia inespecífica de 6 meses, sin irradiación ni banderas rojas. Trabajo de oficina, 8 h sentado. Duele al flexionar el tronco bajo carga y en la estabilidad rotatoria.',
    items: [
        {
            pattern: 'deep_squat',
            isPerSide: false,
            scoreSingle: 3,
            pain: false,
            clearingPositive: null,
            comment: 'Sentadilla completa y simétrica, talones apoyados. Sin dolor.',
        },
        {
            pattern: 'hurdle_step',
            isPerSide: true,
            scoreLeft: 3,
            scoreRight: 3,
            pain: false,
            clearingPositive: null,
            comment: 'Pelvis estable a ambos lados, sin compensación.',
        },
        {
            pattern: 'inline_lunge',
            isPerSide: true,
            scoreLeft: 3,
            scoreRight: 3,
            pain: false,
            clearingPositive: null,
            comment: 'Equilibrio y alineación correctos a ambos lados.',
        },
        {
            pattern: 'shoulder_mobility',
            isPerSide: true,
            scoreLeft: 3,
            scoreRight: 3,
            pain: false,
            clearingPositive: false,
            comment: 'Prueba de descarte negativa. Rango completo y simétrico.',
        },
        {
            pattern: 'active_straight_leg_raise',
            isPerSide: true,
            scoreLeft: 2,
            scoreRight: 3,
            pain: false,
            clearingPositive: null,
            comment: 'Cadena posterior izquierda algo más corta (8 h sentado).',
        },
        {
            pattern: 'trunk_stability_pushup',
            isPerSide: false,
            scoreSingle: 2,
            pain: true,
            clearingPositive: false,
            comment: 'Refiere dolor lumbar al iniciar el empuje. Se detiene la prueba.',
        },
        {
            pattern: 'rotary_stability',
            isPerSide: true,
            scoreLeft: 1,
            scoreRight: 1,
            pain: true,
            clearingPositive: false,
            comment: 'Dolor lumbar en la diagonal. No se insiste.',
        },
    ],
}

/** Pauta domiciliaria «Lumbalgia · fase 1»: 3 días de 20 minutos, en las tres áreas del coach. */
export const LUMBALGIA_F1: ProgramBlueprint = {
    name: 'Lumbalgia · fase 1 — pauta domiciliaria',
    notes: 'Tres sesiones de 20 minutos en casa. Nada debe doler: si aparece dolor, se baja el rango o se corta el ejercicio. Fase de control del dolor y recuperación de movilidad.',
    weeksToRepeat: 4,
    programStructureType: 'weekly',
    durationType: 'weeks',
    phases: [
        { name: 'Control del dolor', weeks: 2, color: '#1462DC' },
        { name: 'Control motor', weeks: 2, color: '#F7B500' },
    ],
    requiredAreas: REHAB_AREAS,
    plans: [
        {
            title: 'Lumbalgia fase 1 — Sesión A',
            dayOfWeek: 1,
            groupName: 'Pauta domiciliaria',
            blocks: [
                {
                    key: 'r_a_basc',
                    exercise: {
                        names: ['Báscula pélvica en supino', 'Cat/Camel'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 2,
                    reps: '10',
                    restTime: '30s',
                    exerciseTypeOverride: 'mobility',
                    instructions: 'Movimiento chico y lento, sin buscar rango. Respira en cada repetición.',
                },
                {
                    key: 'r_a_gato',
                    exercise: { names: ['Cat/Camel'], fallbackType: 'mobility' },
                    orderIndex: 1,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 2,
                    reps: '8',
                    restTime: '30s',
                    exerciseTypeOverride: 'mobility',
                },
                {
                    key: 'r_a_resp',
                    exercise: {
                        names: ['Respiración diafragmática 360°', 'Cat/Camel'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '60s',
                    restTime: '30s',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 60,
                    instructions: 'Costillas hacia los lados, sin levantar los hombros.',
                },
                {
                    key: 'r_a_bird',
                    exercise: {
                        names: ['Perro-pájaro (bird dog)', 'Rotación con estabilidad de tronco (rodillas flexionadas)'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '8 por lado',
                    restTime: '45s',
                    sideMode: 'per_side',
                    exerciseTypeOverride: 'mobility',
                    instructions: 'La pelvis no se mueve. Si duele, acorta el recorrido del brazo.',
                },
                {
                    key: 'r_a_puente',
                    exercise: {
                        names: ['Puente de glúteos con control abdominal', 'Elevación de cadera / puente de glúteos con banda'],
                        fallbackMuscleGroup: 'Glúteos',
                    },
                    orderIndex: 4,
                    section: 'main',
                    areaSlug: 'fortalecimiento',
                    sets: 3,
                    reps: '12',
                    restTime: '45s',
                },
            ],
        },
        {
            title: 'Lumbalgia fase 1 — Sesión B',
            dayOfWeek: 3,
            groupName: 'Pauta domiciliaria',
            blocks: [
                {
                    key: 'r_b_psoas',
                    exercise: {
                        names: ['Estiramiento del psoas en media rodilla', 'Brettzel 2.0'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 2,
                    reps: '40s por lado',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 40,
                    sideMode: 'per_side',
                },
                {
                    key: 'r_b_isq',
                    exercise: {
                        names: ['Estiramiento de pierna recta asistido con banda'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 1,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 2,
                    reps: '40s por lado',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 40,
                    sideMode: 'per_side',
                    instructions: 'La pierna de apoyo queda estirada en el suelo. Sin rebotes.',
                },
                {
                    key: 'r_b_deadbug',
                    exercise: {
                        names: ['Dead bug (bicho muerto)', 'Descenso de pierna asistido con banda'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '8 por lado',
                    restTime: '45s',
                    sideMode: 'per_side',
                    exerciseTypeOverride: 'mobility',
                },
                {
                    key: 'r_b_lateral',
                    exercise: {
                        names: ['Plancha lateral con rodillas apoyadas', 'Puente lateral v. 2'],
                        fallbackMuscleGroup: 'Abdominales',
                    },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '25s por lado',
                    restTime: '45s',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 25,
                    sideMode: 'per_side',
                },
                {
                    key: 'r_b_silla',
                    exercise: {
                        names: ['Sentadilla a la silla', 'Sentadilla con toque de puntas (toe touch squat)'],
                        fallbackMuscleGroup: 'Cuádriceps',
                    },
                    orderIndex: 4,
                    section: 'main',
                    areaSlug: 'fortalecimiento',
                    sets: 3,
                    reps: '10',
                    restTime: '60s',
                    tempo: '3-1-1',
                },
            ],
        },
        {
            title: 'Lumbalgia fase 1 — Sesión C',
            dayOfWeek: 5,
            groupName: 'Pauta domiciliaria',
            blocks: [
                {
                    key: 'r_c_tobillo',
                    exercise: {
                        names: ['Movilidad de tobillo contra la pared', 'Dorsiflexión en media rodilla con bastón'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 2,
                    reps: '10 por lado',
                    exerciseTypeOverride: 'mobility',
                    sideMode: 'per_side',
                },
                {
                    key: 'r_c_9090',
                    exercise: {
                        names: ['Apertura de cadera en posición 90/90', 'Rotación en media rodilla con bastón'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 1,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 2,
                    reps: '8 por lado',
                    exerciseTypeOverride: 'mobility',
                    sideMode: 'per_side',
                },
                {
                    key: 'r_c_mono',
                    exercise: {
                        names: ['Apoyo monopodal en superficie estable', 'Puente a una pierna con pierna extendida'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '30s por pierna',
                    restTime: '30s',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 30,
                    sideMode: 'per_side',
                },
                {
                    key: 'r_c_bisagra',
                    exercise: {
                        names: ['Bisagra de cadera con bastón', 'Peso muerto con piernas rígidas con banda elástica'],
                        fallbackMuscleGroup: 'Isquiotibiales',
                    },
                    orderIndex: 3,
                    section: 'main',
                    areaSlug: 'fortalecimiento',
                    sets: 3,
                    reps: '10',
                    restTime: '60s',
                    instructions: 'El bastón toca cabeza, espalda alta y sacro durante todo el movimiento.',
                },
                {
                    key: 'r_c_talones',
                    exercise: {
                        names: ['Elevación de talones de pie', 'Prensa de pantorrillas en máquina de prensa de piernas'],
                        fallbackMuscleGroup: 'Pantorrillas',
                    },
                    orderIndex: 4,
                    section: 'main',
                    areaSlug: 'fortalecimiento',
                    sets: 3,
                    reps: '15',
                    restTime: '45s',
                },
            ],
        },
    ],
}

/** Plantilla `postop-rodilla-1-4` del catálogo (no la trae el demo). */
export const POSTOP_RODILLA_1_4: ProgramBlueprint = {
    name: 'Post-op rodilla · semanas 1-4',
    notes: 'Rango, activación y carga progresiva tras cirugía de rodilla. Sin dolor y sin derrame: si aparece cualquiera de los dos, se retrocede una semana.',
    weeksToRepeat: 4,
    programStructureType: 'weekly',
    durationType: 'weeks',
    requiredAreas: REHAB_AREAS,
    plans: [
        {
            title: 'Post-op rodilla — Sesión A · Rango y activación',
            dayOfWeek: 1,
            groupName: 'Pauta domiciliaria',
            blocks: [
                {
                    key: 'k_a_ext',
                    exercise: {
                        names: ['Extensión pasiva de rodilla en prono', 'Estiramiento de pierna recta asistido con banda'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 3,
                    reps: '2 min',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 120,
                },
                {
                    key: 'k_a_cuad',
                    exercise: {
                        names: ['Activación de cuádriceps en supino', 'Descenso de pierna asistido con banda'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '10',
                    restTime: '45s',
                    exerciseTypeOverride: 'mobility',
                },
                {
                    key: 'k_a_slr',
                    exercise: {
                        names: ['Elevación de pierna recta en supino', 'Descenso de pierna asistido con banda'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'fortalecimiento',
                    sets: 3,
                    reps: '12',
                    restTime: '60s',
                },
            ],
        },
        {
            title: 'Post-op rodilla — Sesión B · Carga guiada',
            dayOfWeek: 4,
            groupName: 'Pauta domiciliaria',
            blocks: [
                {
                    key: 'k_b_bike',
                    exercise: { names: ['Bicicleta estática'], fallbackType: 'cardio' },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 1,
                    reps: '10 min suaves',
                    exerciseTypeOverride: 'cardio',
                    durationSec: 600,
                    hrZone: 1,
                },
                {
                    key: 'k_b_silla',
                    exercise: {
                        names: ['Sentadilla a la silla', 'Sentadilla con toque de puntas (toe touch squat)'],
                        fallbackMuscleGroup: 'Cuádriceps',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'fortalecimiento',
                    sets: 3,
                    reps: '10',
                    restTime: '60s',
                    tempo: '3-1-1',
                },
                {
                    key: 'k_b_mono',
                    exercise: {
                        names: ['Apoyo monopodal en superficie estable'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '30s por pierna',
                    restTime: '30s',
                    exerciseTypeOverride: 'mobility',
                    durationSec: 30,
                    sideMode: 'per_side',
                },
            ],
        },
    ],
}

/** Plantilla `hombro-control-motor` del catálogo (no la trae el demo). */
export const HOMBRO_CONTROL_MOTOR: ProgramBlueprint = {
    name: 'Hombro · control motor',
    notes: 'Escápula y manguito rotador, sin dolor. Trabajo de baja carga y alta calidad: la técnica manda sobre el peso.',
    weeksToRepeat: 6,
    programStructureType: 'weekly',
    durationType: 'weeks',
    requiredAreas: REHAB_AREAS,
    plans: [
        {
            title: 'Hombro control motor — Sesión A',
            dayOfWeek: 2,
            groupName: 'Pauta domiciliaria',
            blocks: [
                {
                    key: 'h_a_tor',
                    exercise: {
                        names: ['Rotación torácica en cuadrupedia (lumbar bloqueada)'],
                        fallbackType: 'mobility',
                    },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 2,
                    reps: '8 por lado',
                    exerciseTypeOverride: 'mobility',
                    sideMode: 'per_side',
                },
                {
                    key: 'h_a_esc',
                    exercise: {
                        names: ['Dominadas escapulares', 'Remo con banda elástica sentado'],
                        fallbackMuscleGroup: 'Trapecios',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '10',
                    restTime: '45s',
                },
                {
                    key: 'h_a_rot',
                    exercise: {
                        names: ['Rotación externa de hombro con banda', 'Elevación lateral con mancuernas - Full Can'],
                        fallbackMuscleGroup: 'Hombros',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'fortalecimiento',
                    sets: 3,
                    reps: '15 por lado',
                    restTime: '45s',
                    sideMode: 'per_side',
                },
            ],
        },
        {
            title: 'Hombro control motor — Sesión B',
            dayOfWeek: 5,
            groupName: 'Pauta domiciliaria',
            blocks: [
                {
                    key: 'h_b_roller',
                    exercise: { names: ['Foam roller – Dorsal (espalda media)'], fallbackType: 'roller' },
                    orderIndex: 0,
                    section: 'warmup',
                    areaSlug: 'movilidad',
                    sets: 1,
                    reps: '90s',
                    exerciseTypeOverride: 'roller',
                    durationSec: 90,
                },
                {
                    key: 'h_b_remo',
                    exercise: {
                        names: ['Remo con banda elástica sentado', 'Remo invertido con rodillas flectadas'],
                        fallbackMuscleGroup: 'Espalda Alta',
                    },
                    orderIndex: 1,
                    section: 'main',
                    areaSlug: 'fortalecimiento',
                    sets: 3,
                    reps: '12',
                    restTime: '60s',
                },
                {
                    key: 'h_b_full',
                    exercise: {
                        names: ['Elevación lateral con mancuernas - Full Can'],
                        fallbackMuscleGroup: 'Hombros',
                    },
                    orderIndex: 2,
                    section: 'main',
                    areaSlug: 'control-motor',
                    sets: 3,
                    reps: '12',
                    restTime: '45s',
                },
            ],
        },
    ],
}
