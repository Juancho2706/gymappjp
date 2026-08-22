import { RN_FIRST_STEP_PARAM } from '@eva/onboarding'
import { ApiError, apiFetch } from './api'

/**
 * Plantillas del onboarding v2 en la app — el paso 3 template-first
 * (SPEC coach-onboarding-v2 §6 y §7, TASKS W8; hallazgo 5 del QA del owner 22-08).
 *
 * Habla con `/api/mobile/coach/templates`, que sirve el MISMO catálogo y el MISMO sembrador que la
 * web: la app no clona plantillas por PostgREST (el inventario del alumno de ejemplo lo escribe
 * `service_role`) ni decide qué plantillas van en cada superficie (eso lo resuelve
 * `templatesForSurface` del lado del servidor).
 *
 * Este módulo NO importa React ni react-native: es lógica pura + red, para poder testearlo con el
 * runner de la raíz (`tests/mobile/onboarding-templates.test.ts`).
 */

/** Superficie que pide plantillas. Cada pantalla del paso 3 pide la SUYA. */
export type OnboardingTemplateSurface = 'training' | 'nutrition' | 'movement' | 'cardio'

export interface MobileOnboardingTemplate {
    id: string
    label: string
    blurb: string
    /** Qué produce: un programa de entrenamiento o una pauta V2. `null` = todavía sin contenido. */
    kind: 'program' | 'nutrition' | null
    /** Días del programa · variantes de día de la pauta. `null` = no se pinta la línea. */
    days: number | null
}

export interface OnboardingTemplateList {
    /** Persona del coach según el servidor. `null` = coach viejo que nunca contestó. */
    persona: string | null
    templates: MobileOnboardingTemplate[]
}

/**
 * Cuántas plantillas entran en la sheet. Tres es el techo del SPEC §7: la primera decisión del
 * coach nuevo tiene que ser corta — una lista larga es otra vez un builder en blanco.
 */
export const MAX_SHEET_TEMPLATES = 3

function asRecord(raw: unknown): Record<string, unknown> | null {
    return raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function asPositiveInt(raw: unknown): number | null {
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : null
}

/**
 * Parser TOLERANTE de la respuesta. Igual que el del panel: lo que hay que sobrevivir no es «un
 * campo con otro tipo» sino «un binario nuevo contra un deploy viejo». Una plantilla sin `id` o sin
 * `label` se descarta (no se puede pintar ni aplicar); el resto degrada campo por campo.
 */
export function parseTemplateList(payload: unknown): OnboardingTemplateList {
    const source = asRecord(payload) ?? {}
    const rawList = Array.isArray(source.templates) ? source.templates : []
    const templates: MobileOnboardingTemplate[] = []
    for (const raw of rawList) {
        const item = asRecord(raw)
        const id = typeof item?.id === 'string' ? item.id.trim() : ''
        const label = typeof item?.label === 'string' ? item.label.trim() : ''
        if (id === '' || label === '') continue
        templates.push({
            id,
            label,
            blurb: typeof item?.blurb === 'string' ? item.blurb.trim() : '',
            kind: item?.kind === 'program' || item?.kind === 'nutrition' ? item.kind : null,
            days: asPositiveInt(item?.days),
        })
    }
    return { persona: typeof source.persona === 'string' ? source.persona : null, templates }
}

/** Línea de tamaño bajo el nombre («3 días» · «4 días de menú»). Vacía si el server no lo sabe. */
export function templateMetaLine(template: MobileOnboardingTemplate): string {
    if (template.days == null) return ''
    const unit = template.days === 1 ? 'día' : 'días'
    return template.kind === 'nutrition' ? `${template.days} ${unit} de menú` : `${template.days} ${unit}`
}

/** Lista de plantillas de una superficie. `null` = no se pudo preguntar (sin red, 5xx, deploy viejo). */
export async function listOnboardingTemplates(
    surface: OnboardingTemplateSurface,
): Promise<OnboardingTemplateList | null> {
    try {
        const payload = await apiFetch<unknown>(
            `/api/mobile/coach/templates?surface=${encodeURIComponent(surface)}`,
            { method: 'GET', authenticated: true },
        )
        return parseTemplateList(payload)
    } catch {
        return null
    }
}

export type ApplyOnboardingTemplateResult =
    | { ok: true; programId: string | null; planId: string | null }
    | { ok: false; error: string }

const APPLY_FALLBACK_ERROR = 'No pudimos preparar esa plantilla. Revisa tu conexión e inténtalo de nuevo.'

/** El mensaje del SERVIDOR cuando es accionable («Ese alumno no es tuyo»), uno genérico cuando no. */
export function humanizeApplyError(error: unknown): string {
    if (error instanceof ApiError && error.message.trim() !== '' && error.status < 500) return error.message
    return APPLY_FALLBACK_ERROR
}

/**
 * Aplica una plantilla del catálogo sobre un alumno del coach. El servidor valida sesión, allowlist
 * y acceso al alumno: acá no se manda ningún `coachId`.
 */
export async function applyOnboardingTemplate(input: {
    templateId: string
    clientId: string
}): Promise<ApplyOnboardingTemplateResult> {
    try {
        const payload = await apiFetch<{ ok?: boolean; programId?: string | null; planId?: string | null }>(
            '/api/mobile/coach/templates',
            { method: 'POST', authenticated: true, body: input },
        )
        if (payload?.ok !== true) return { ok: false, error: APPLY_FALLBACK_ERROR }
        return { ok: true, programId: payload.programId ?? null, planId: payload.planId ?? null }
    } catch (error) {
        return { ok: false, error: humanizeApplyError(error) }
    }
}

// ── Entrada guiada (`?primera=1`) ────────────────────────────────────────────────────────────

/** Nombre del parámetro que marca «vengo del paso 3 de la guía». Vive en `@eva/onboarding`. */
export const FIRST_STEP_PARAM = RN_FIRST_STEP_PARAM

/**
 * ¿La pantalla se abrió desde el paso 3? Expo Router entrega `string | string[] | undefined`
 * (un mismo parámetro repetido llega como arreglo), así que se normaliza acá y no en cada pantalla.
 */
export function isGuidedEntry(raw: string | string[] | undefined): boolean {
    const value = Array.isArray(raw) ? raw[0] : raw
    return value === '1' || value === 'true'
}

/** Qué hacer con la marca guiada en este render. `consume` = borrar el parámetro y no volver. */
export interface GuidedEntryDecision {
    consume: boolean
    openSheet: boolean
}

const GUIDED_ENTRY_WAIT: GuidedEntryDecision = { consume: false, openSheet: false }

/**
 * Decide qué hacer con `?primera=1` en el tab de programas, sin React.
 *
 * La regla que importa: **NO se consume la marca mientras la foto del panel no esté publicada**
 * (`snapshotReady === false`). `useCoachOnboarding` es un store de presentación, no una consulta:
 * en un arranque en frío, un deep link o justo después de un cambio de cuenta el primer render llega
 * con `null`. Si se consumiera ahí, el paso 3 se quemaría en silencio —parámetro borrado, sheet
 * nunca abierta— y el coach quedaría otra vez en la biblioteca sin saber qué hacer.
 *
 * Con la foto ya publicada la marca se consume SIEMPRE (haya demo o no): sin alumno de ejemplo la
 * sheet no tiene sujeto y el tab se comporta como siempre, pero la marca no puede quedar viva o
 * volver del lienzo la reabriría.
 */
export function resolveGuidedEntry(input: {
    raw: string | string[] | undefined
    /** ¿Ya llegó el snapshot de `useCoachOnboarding`? */
    snapshotReady: boolean
    /** ¿Hay alumno de ejemplo sembrado? */
    hasDemo: boolean
    /** ¿La marca ya se consumió en un render anterior? */
    alreadyConsumed?: boolean
}): GuidedEntryDecision {
    if (input.alreadyConsumed === true) return GUIDED_ENTRY_WAIT
    if (!isGuidedEntry(input.raw)) return GUIDED_ENTRY_WAIT
    if (!input.snapshotReady) return GUIDED_ENTRY_WAIT
    return { consume: true, openSheet: input.hasDemo }
}

/**
 * Parámetros con los que el lienzo se abre después de aplicar la plantilla. Espeja el destino de la
 * web (`/coach/builder/{clientId}?programId=…&primera=1`): el builder de RN recibe el alumno, el
 * programa recién sembrado y la marca de entrada guiada para pintar el banner de las 3 tareas.
 *
 * Sin `programId` (el sembrado falló y se abre el lienzo igual) el parámetro simplemente no viaja:
 * perder la plantilla es molesto, perder el paso 3 es peor.
 */
export function builderParamsAfterTemplate(input: {
    clientId: string
    clientName?: string | null
    programId?: string | null
}): Record<string, string> {
    const params: Record<string, string> = { clientId: input.clientId, [FIRST_STEP_PARAM]: '1' }
    const name = (input.clientName ?? '').trim()
    if (name !== '') params.clientName = name
    const programId = (input.programId ?? '').trim()
    if (programId !== '') params.programId = programId
    return params
}

/** Título de la sheet. Sin nombre del demo no se escribe «para null»: se cae a algo que se lee. */
export function firstTemplateSheetTitle(demoName: string | null | undefined): string {
    const name = (demoName ?? '').trim()
    return name === '' ? 'Tu primera rutina' : `Tu primera rutina para ${name}`
}
