/**
 * Plantillas clonables del onboarding v2 (W3 F3.3) — despacho `templateId` → contenido.
 *
 * `TEMPLATE_CATALOG` (@eva/onboarding) es el CATÁLOGO: ids, etiqueta y bajada, lo que se pinta en
 * el empty state template-first. Este archivo es su otra mitad: qué se crea de verdad cuando el
 * coach toca «usar esta plantilla». Los dos lados se mantienen sincronizados por el test cruzado
 * de `templates.test.ts` — si alguien agrega una plantilla al catálogo y no le da contenido, el
 * test falla antes de que un botón del panel muera en `template_desconocida`.
 *
 * Módulo PURO: mapea ids a blueprints. Quien escribe en la base es `demo-writers.ts`.
 */

import { TEMPLATE_CATALOG } from '@eva/onboarding'
import type { Persona } from '@eva/schemas'
import { FULL_BODY_3, PUSH_PULL_LEGS, UPPER_LOWER_4 } from './demo-content/strength'
import { HYBRID_2200, PORTIONS_1800 } from './demo-content/nutrition'
import { HOMBRO_CONTROL_MOTOR, LUMBALGIA_F1, POSTOP_RODILLA_1_4 } from './demo-content/rehab'
import { BASE_10K_4, MEDIA_MARATON_12, RETORNO_LESION } from './demo-content/endurance'
import type { NutritionPlanBlueprint, ProgramBlueprint } from './demo-content/types'

/** Lo que produce una plantilla: un programa de entrenamiento o una pauta de nutrición V2. */
export type TemplateBlueprint =
    | { kind: 'program'; program: ProgramBlueprint }
    | { kind: 'nutrition'; plan: NutritionPlanBlueprint }

const TEMPLATE_BLUEPRINTS: Record<string, TemplateBlueprint> = {
    // strength
    'full-body-3': { kind: 'program', program: FULL_BODY_3 },
    'upper-lower-4': { kind: 'program', program: UPPER_LOWER_4 },
    ppl: { kind: 'program', program: PUSH_PULL_LEGS },
    // nutrition
    'portions-1800': { kind: 'nutrition', plan: PORTIONS_1800 },
    'hybrid-2200': { kind: 'nutrition', plan: HYBRID_2200 },
    // rehab
    'lumbalgia-f1': { kind: 'program', program: LUMBALGIA_F1 },
    'postop-rodilla-1-4': { kind: 'program', program: POSTOP_RODILLA_1_4 },
    'hombro-control-motor': { kind: 'program', program: HOMBRO_CONTROL_MOTOR },
    // endurance
    'base-10k-4': { kind: 'program', program: BASE_10K_4 },
    'media-maraton-12': { kind: 'program', program: MEDIA_MARATON_12 },
    'retorno-lesion': { kind: 'program', program: RETORNO_LESION },
}

/** Contenido de una plantilla del catálogo. `null` = id desconocido (el caller responde 404). */
export function resolveTemplateBlueprint(templateId: string): TemplateBlueprint | null {
    return TEMPLATE_BLUEPRINTS[templateId] ?? null
}

/** Ids con contenido, para el test cruzado contra `TEMPLATE_CATALOG`. */
export function templateIdsWithContent(): string[] {
    return Object.keys(TEMPLATE_BLUEPRINTS)
}

/**
 * Plantilla que el alumno de ejemplo trae YA APLICADA por persona (SPEC §4). El paso 3 de la guía
 * («Arma tu primer …») abre justamente esta: el coach nunca ve un builder en blanco.
 * `other` no siembra demo y por eso no tiene plantilla de arranque.
 */
export const DEMO_TEMPLATE_BY_PERSONA: Record<Persona, string | null> = {
    strength: 'full-body-3',
    nutrition: 'portions-1800',
    rehab: 'lumbalgia-f1',
    endurance: 'base-10k-4',
    other: null,
}

/** Ids del catálogo para una persona (azúcar sobre `TEMPLATE_CATALOG`). */
export function templateIdsForPersona(persona: Persona): string[] {
    return TEMPLATE_CATALOG[persona].map((template) => template.id)
}
