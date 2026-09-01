import {
  DOMAIN_ENABLED_KEY,
  FEATURE_DOMAIN_KEYS,
  normalizePreset,
  type FeatureDomain,
  type Preset,
  type SectionPrefs,
} from '@eva/feature-prefs'
import { PERSONA_COPY, type Persona } from '@eva/schemas'
import { apiFetch } from './api'
import { supabase } from './supabase'

/**
 * «Opciones › Mi panel» en la app (SPEC coach-onboarding-v2 §2 y §4; TASKS W8.2.2).
 *
 * Cierra el hallazgo `spec-rn-08`: la guía de RN dice «Cambiar en Opciones» y la pantalla de
 * persona promete «Opciones › Mi panel», pero en la app no existía ninguna entrada para cambiar
 * la especialidad. Este módulo es la capa de datos de esa pantalla; el espejo de la web es
 * `apps/web/src/app/coach/settings/funciones/_actions/mi-panel.actions.ts` + `MiPanelClient.tsx`.
 *
 * NO importa React ni react-native: lógica pura + red, para poder testearlo con el runner de la
 * raíz (`tests/mobile/mi-panel.test.ts`).
 *
 * Reglas de producto que se ven en el código (las mismas que la web):
 *  - Cambiar de especialidad NO reordena el panel por sorpresa. La matriz de la persona solo se
 *    re-ejecuta si el coach marca «Ordenar mi panel según mi especialidad» (arranca APAGADO).
 *  - Apagar un dominio es una PREFERENCIA y solo achica: no compra, no borra, no toca
 *    `enabled_modules`. El entitlement sigue siendo el único gate de dinero.
 *  - El alumno de ejemplo se siembra/borra en el servidor (necesita `service_role`): acá solo se
 *    piden las dos acciones y se refleja el resultado.
 */

/**
 * Ruta de la pantalla en Expo Router. La usan el hub de Opciones y la guía.
 *
 * Ola de orden W3.3/W3.4: «Mi panel» se fusionó con «Funciones de nutrición», el catálogo de
 * Módulos y el launcher Herramientas en `app/coach/settings/funciones.tsx`. La ruta vieja
 * (`/coach/settings/mi-panel`) sigue viva como redirect, pero los enlaces internos apuntan
 * DIRECTO acá para no hacer el salto doble.
 */
export const FUNCIONES_ROUTE = '/coach/settings/funciones'

/** Destino de «Ver mi guía de inicio». Mismo literal que `COACH_GUIA_ROUTE` de `coach-persona`. */
export const MI_PANEL_GUIA_ROUTE = '/coach/guia'

/**
 * Estado abierto/cerrado de la píldora flotante, por coach.
 *
 * ⚠️ Duplicado deliberado de `pillStorageKey` en `components/coach/GuidePill.tsx`, que no lo
 * exporta y que NO es un archivo de esta tarea. Si el prefijo cambia allá, cambia acá.
 * `tests/mobile/mi-panel.test.ts` pinnea el literal para que la divergencia se vea en CI.
 */
export function guidePillStorageKey(coachId: string): string {
  return `eva.guide-pill.v1:${coachId}`
}

/** Valor con el que la píldora vuelve a mostrarse abierta al reactivar la guía. */
export const GUIDE_PILL_EXPANDED = 'expanded'

// ── Dominios del panel ───────────────────────────────────────────────────────────────────────

export interface MiPanelDomainMeta {
  domain: FeatureDomain
  label: string
  description: string
}

/**
 * Los 5 dominios con su copy. Espejo LITERAL de `DOMAIN_META` de
 * `apps/web/.../funciones/_data/funciones.queries.ts` — ese archivo importa service-role y no
 * puede cruzar al bundle de la app, así que el copy se repite acá (igual que la web lo repite en
 * `MiPanelClient` para los iconos).
 *
 * No se reusa `DOMAIN_LABELS` de `lib/feature-prefs.queries.ts` porque ese mapa es PARCIAL a
 * propósito (solo Nutrición): es el que decide qué áreas muestra el editor fino de secciones, y
 * sumarle los otros 4 haría aparecer cuatro editores de secciones vacíos en «Funciones».
 */
export const MI_PANEL_DOMAINS: readonly MiPanelDomainMeta[] = [
  {
    domain: 'nutrition',
    label: 'Nutrición',
    description: 'Pautas, porciones e intercambios, y lo que ve tu alumno de su alimentación.',
  },
  {
    domain: 'training',
    label: 'Entrenamiento',
    description: 'Rutinas, programas y ejercicios del planificador.',
  },
  {
    domain: 'cardio',
    label: 'Cardio',
    description: 'Zonas de frecuencia cardíaca, ritmos e intervalos.',
  },
  {
    domain: 'movement',
    label: 'Movimiento',
    description: 'Screening de 7 patrones y la pauta de ejercicios para la casa.',
  },
  {
    domain: 'bodycomp',
    label: 'Composición corporal',
    description: 'Mediciones por BIA o antropometría ISAK y su evolución.',
  },
]

/** Estado de UN dominio en la pantalla: su copy + lo CRUDO que hay que preservar al escribir. */
export interface MiPanelDomainRow extends MiPanelDomainMeta {
  /** `_enabled` de `coach_feature_prefs.sections`. Ausente ⇒ prendido (fail-open, igual que web). */
  enabled: boolean
  /** El preset guardado. Se conserva tal cual: el master switch no lo decide. */
  preset: Preset
  /** El mapa de secciones guardado. Se conserva para no borrar los toggles finos de nutrición. */
  sections: SectionPrefs
}

function asSections(raw: unknown): SectionPrefs {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as SectionPrefs) : {}
}

/** Fila cruda de `coach_feature_prefs` que le importa a esta pantalla. */
export interface RawDomainPrefsRow {
  domain: string
  preset: unknown
  sections: unknown
}

/**
 * Cruza el catálogo de dominios con las filas guardadas. PURO (testeable sin red).
 *
 * Un dominio sin fila arranca prendido con preset `basico`: es exactamente lo que resuelve el
 * lector del server cuando la clave no está, y es lo que ve un coach que nunca contestó la
 * pregunta de persona.
 */
export function buildDomainRows(rows: readonly RawDomainPrefsRow[]): MiPanelDomainRow[] {
  return MI_PANEL_DOMAINS.map((meta) => {
    const row = rows.find((candidate) => candidate.domain === meta.domain)
    const sections = asSections(row?.sections)
    return {
      ...meta,
      enabled: sections[DOMAIN_ENABLED_KEY] ?? true,
      preset: normalizePreset(row?.preset),
      sections,
    }
  })
}

/**
 * Lee las 5 filas de `coach_feature_prefs` del coach. Por PostgREST directo (RLS
 * `coach_feature_prefs_owner_*` es el gate real), igual que `loadFeaturePrefs`.
 *
 * No se usa `loadFeaturePrefs` de `lib/feature-prefs.queries.ts` porque itera SOLO los dominios de
 * su `DOMAIN_LABELS` parcial (hoy: Nutrición) y esta pantalla necesita los 5. La ESCRITURA sí pasa
 * por `saveFeaturePrefs` de ese módulo (ver `saveDomainEnabled`).
 *
 * Degrada a «todo prendido» ante cualquier error: un panel completo es el estado seguro.
 */
export async function loadMiPanelDomains(coachId: string | null): Promise<MiPanelDomainRow[]> {
  if (!coachId) return buildDomainRows([])
  try {
    const { data } = await supabase
      .from('coach_feature_prefs')
      .select('domain, preset, sections')
      .eq('coach_id', coachId)
      .in('domain', FEATURE_DOMAIN_KEYS as unknown as string[])
    return buildDomainRows((data ?? []) as RawDomainPrefsRow[])
  } catch {
    return buildDomainRows([])
  }
}

/**
 * Payload del upsert del master switch de UN dominio. PURO: preserva preset y secciones y solo
 * pisa `_enabled` — espejo de `setCoachDomainEnabled` del servicio web.
 */
export function buildDomainSwitchPayload(
  row: MiPanelDomainRow,
  enabled: boolean,
): { domain: FeatureDomain; preset: Preset; sections: Record<string, boolean> } {
  return {
    domain: row.domain,
    preset: row.preset,
    sections: { ...row.sections, [DOMAIN_ENABLED_KEY]: enabled } as Record<string, boolean>,
  }
}

// ── Especialidad ─────────────────────────────────────────────────────────────────────────────

export interface MiPanelPersonaInput {
  persona: Persona
  alsoOther?: boolean
  /** `true` = re-sembrar los 5 dominios con la matriz de la persona (el coach lo pidió). */
  reorderPanel?: boolean
}

export interface MiPanelPersonaPayload {
  persona: Persona
  alsoOther: boolean
  reorderPanel: boolean
}

/**
 * Normaliza lo que se manda al servidor. PURO.
 *
 * `alsoOther` se fuerza a `false` en las personas que no tienen segunda pregunta (`other`): esa
 * columna segmenta correos y funnel, y no puede guardar la respuesta a una pregunta que no se
 * hizo. Es la MISMA normalización que hace `applyCoachPersona` server-side; acá evita además que
 * el botón «Guardar» se crea sucio por un valor fantasma.
 *
 * `reorderPanel` viaja SIEMPRE (aunque sea `false`): su presencia es lo que le dice al endpoint
 * que la llamada viene de «Mi panel» y no del primer ingreso.
 */
export function buildPersonaPayload(input: MiPanelPersonaInput): MiPanelPersonaPayload {
  const hasSecondQuestion = PERSONA_COPY[input.persona].secondQuestion != null
  return {
    persona: input.persona,
    alsoOther: hasSecondQuestion ? input.alsoOther === true : false,
    reorderPanel: input.reorderPanel === true,
  }
}

/** ¿Hay algo que guardar? Evita un request que no cambia nada (y un toast mentiroso). */
export function isPersonaDirty(
  draft: MiPanelPersonaInput,
  saved: { persona: Persona | null; alsoOther: boolean },
): boolean {
  const payload = buildPersonaPayload(draft)
  if (payload.reorderPanel) return true
  return payload.persona !== saved.persona || payload.alsoOther !== saved.alsoOther
}

export type MiPanelResult = { ok: true; message: string } | { ok: false; error: string }

const SAVE_FALLBACK = 'No pudimos guardar tu elección. Revisa tu conexión e inténtalo de nuevo.'

/**
 * Mensaje al coach: el del SERVIDOR cuando es accionable («Tu panel lo administra tu
 * organización…»), uno genérico cuando es un 5xx o un fallo de red (que trae
 * `TypeError: Network request failed`, y eso no se le pone delante a nadie).
 */
export function humanizeMiPanelError(error: unknown, fallback: string): string {
  if (error == null || typeof error !== 'object') return fallback
  const status = (error as { status?: unknown }).status
  const message = (error as { message?: unknown }).message
  if (typeof status !== 'number' || status >= 500) return fallback
  if (typeof message !== 'string' || message.trim() === '') return fallback
  return message
}

/**
 * Guarda la especialidad desde «Mi panel». Manda `reorderPanel` explícito, que es lo que separa
 * este camino del primer ingreso (ahí el endpoint siembra la matriz completa y el alumno de
 * ejemplo; acá no toca nada más que lo que el coach pidió).
 */
export async function saveMiPanelPersona(input: MiPanelPersonaInput): Promise<MiPanelResult> {
  const payload = buildPersonaPayload(input)
  try {
    const response = await apiFetch<{ ok?: boolean; reordered?: boolean }>(
      '/api/mobile/coach/persona',
      { method: 'POST', authenticated: true, body: payload },
    )
    if (response?.ok !== true) return { ok: false, error: SAVE_FALLBACK }
    return {
      ok: true,
      message: payload.reorderPanel ? 'Especialidad guardada y panel reordenado.' : 'Especialidad guardada.',
    }
  } catch (error) {
    return { ok: false, error: humanizeMiPanelError(error, SAVE_FALLBACK) }
  }
}

// ── Alumno de ejemplo ────────────────────────────────────────────────────────────────────────

export type ReseedDemoResult =
  | { ok: true; demoClientId: string | null; demoName: string | null; alreadyExisted: boolean }
  | { ok: false; error: string }

/**
 * Vuelve a sembrar el alumno de ejemplo de la persona actual. Idempotente en el servidor: si el
 * demo ya existía responde el mismo id con `alreadyExisted: true`.
 */
export async function reseedDemoStudent(): Promise<ReseedDemoResult> {
  try {
    const response = await apiFetch<{
      ok?: boolean
      demoClientId?: string | null
      demoName?: string | null
      alreadyExisted?: boolean
    }>('/api/mobile/coach/demo-student', { method: 'POST', authenticated: true })
    if (response?.ok !== true) {
      return { ok: false, error: 'No pudimos crear el alumno de ejemplo. Inténtalo de nuevo.' }
    }
    return {
      ok: true,
      demoClientId: response.demoClientId ?? null,
      demoName: response.demoName ?? null,
      alreadyExisted: response.alreadyExisted === true,
    }
  } catch (error) {
    return {
      ok: false,
      error: humanizeMiPanelError(error, 'No pudimos crear el alumno de ejemplo. Inténtalo de nuevo.'),
    }
  }
}

// ── Qué muestra la pantalla ──────────────────────────────────────────────────────────────────

export interface MiPanelVisibilityInput {
  persona: Persona | null
  /** `onboardingV2.demoClientId` de la foto del dashboard. */
  demoClientId: string | null
  /** `onboardingV2.guide` de la foto del dashboard. */
  guide: { dismissed: boolean; hidden: boolean }
}

export interface MiPanelVisibility {
  /** Hay demo sembrado ⇒ se puede borrar. */
  canDeleteDemo: boolean
  /** No hay demo y la persona SÍ trae uno ⇒ se puede volver a sembrar. */
  canReseedDemo: boolean
  /** La persona elegida no tiene alumno de ejemplo (`other`). Cambia el copy de la sección. */
  personaHasNoDemo: boolean
  /** Nombre del demo de la persona actual (para el copy). `null` = esa rama no siembra. */
  demoName: string | null
  /** La guía está descartada u oculta ⇒ ofrecer «Volver a mostrar la guía». */
  canRestoreGuide: boolean
}

/**
 * Qué botones tiene sentido pintar. PURO y en el módulo (no en el .tsx) para poder pinnearlo:
 * es la regla que evita ofrecer «Borrar» sin demo, «Sembrar» a una persona sin demo, o
 * «Volver a mostrar la guía» a quien la tiene visible.
 */
export function resolveMiPanelVisibility(input: MiPanelVisibilityInput): MiPanelVisibility {
  const demoName = input.persona ? PERSONA_COPY[input.persona].demoName : null
  const hasDemo = input.demoClientId != null && input.demoClientId.trim() !== ''
  return {
    canDeleteDemo: hasDemo,
    canReseedDemo: !hasDemo && demoName != null,
    personaHasNoDemo: input.persona != null && demoName == null,
    demoName,
    canRestoreGuide: input.guide.dismissed || input.guide.hidden,
  }
}
