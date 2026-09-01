// Funciones (feature-prefs) — lado coach (E7-04). Capa de datos del editor de la Zona "Funciones".
//
// Modelo `visible = ENTITLED(billing) AND ENABLED(preferencia)` (@eva/feature-prefs). Este modulo
// SOLO lee/escribe la capa ENABLED (preferencia) — NUNCA toca coaches/teams.enabled_modules
// (compra-only; lo pisaria el trigger D1 y/o regalaria features pagas). El entitlement (capa
// ENTITLED) lo resuelve el screen via useEntitlements() (E0-C1, unico source de visibilidad de pago).
//
// Espejo de la web (funciones.queries.ts + feature-prefs.actions.ts): standalone ⇒ coach_feature_prefs;
// team ⇒ team_feature_prefs. El scope lo aporta useWorkspace() (E7-01, unica resolucion de contexto).
// La RLS es el gate real de escritura (coach_feature_prefs_owner_* = coach_id=auth.uid();
// team_feature_prefs_mgr_* = managers via current_user_managed_team_ids) — el cliente user-scoped no
// puede saltarselo. Apagar = ocultar (jamas borra filas nutrition_*; CASCADE = data-loss).
import { supabase } from './supabase'
import {
  FEATURE_DOMAINS,
  normalizePreset,
  type FeatureDomain,
  type FeatureSection,
  type Preset,
  type SectionPrefs,
} from '@eva/feature-prefs'

export type FuncionesScope = 'coach' | 'team'

/** Estado CRUDO del editor para UN dominio (preset + mapa de secciones guardado, incl. `_enabled`). */
export interface DomainPrefs {
  domain: FeatureDomain
  label: string
  sections: readonly FeatureSection[]
  preset: Preset
  sectionPrefs: SectionPrefs
}

/** Contexto del write: quien escribe (coach standalone) o sobre que team. */
export interface FeaturePrefsScope {
  scope: FuncionesScope
  coachId: string | null
  teamId: string | null
}

// PARCIAL a proposito, y `DOMAIN_KEYS` se deriva de ACA (no de `FEATURE_DOMAINS`): el onboarding v2
// sumo `training | cardio | movement | bodycomp` al registro puro (SPEC coach-onboarding-v2 §2) para
// que la persona del coach pueda apagarlos, pero su area en este editor entra recien con «Mi panel»
// (W5.3), junto con la de la web. Hasta entonces el editor movil muestra SOLO Nutricion, igual que
// hoy y que la web — sumar la etiqueta es lo unico que hace falta para que aparezca.
const DOMAIN_LABELS: Partial<Record<FeatureDomain, string>> = { nutrition: 'Nutrición' }
const DOMAIN_KEYS = Object.keys(DOMAIN_LABELS) as FeatureDomain[]

function asSections(v: unknown): SectionPrefs {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as SectionPrefs) : {}
}

function friendlyPrefsError(msg: string | null | undefined): string {
  if (!msg) return 'Ocurrió un error. Intenta de nuevo.'
  if (/row-level security/i.test(msg)) return 'No tienes permiso para editar estas funciones.'
  return msg
}

/**
 * Lee el estado crudo del editor (preset + sections por dominio) del scope activo. El panel necesita
 * lo CRUDO (no la visibilidad resuelta) para hidratar el valor exacto de cada toggle. Degrada a
 * defaults (preset `basico`, sections `{}`) ante cualquier error de RLS/red — el editor arranca en un
 * estado seguro y el coach puede reintentar guardando.
 */
export async function loadFeaturePrefs(ctx: FeaturePrefsScope): Promise<DomainPrefs[]> {
  return Promise.all(
    DOMAIN_KEYS.map(async (domain) => {
      const sections = FEATURE_DOMAINS[domain]
      let preset: Preset = 'basico'
      let sectionPrefs: SectionPrefs = {}
      try {
        if (ctx.scope === 'team' && ctx.teamId) {
          const { data } = await supabase
            .from('team_feature_prefs')
            .select('preset, sections')
            .eq('team_id', ctx.teamId)
            .eq('domain', domain)
            .maybeSingle()
          preset = normalizePreset(data?.preset)
          sectionPrefs = asSections(data?.sections)
        } else if (ctx.coachId) {
          const { data } = await supabase
            .from('coach_feature_prefs')
            .select('preset, sections')
            .eq('coach_id', ctx.coachId)
            .eq('domain', domain)
            .maybeSingle()
          preset = normalizePreset(data?.preset)
          sectionPrefs = asSections(data?.sections)
        }
      } catch {
        /* defaults */
      }
      return { domain, label: DOMAIN_LABELS[domain] ?? domain, sections, preset, sectionPrefs }
    }),
  )
}

export type SavePrefsResult = { ok: true } | { error: string }

/**
 * Upsert de la preferencia (capa ENABLED) de UN dominio. Espejo de setCoach/TeamFeaturePrefs (web).
 * UNA sola escritura (el panel commitea el borrador entero). RLS authoritative.
 *
 * Coherencia con `/api/mobile/config` + gate del alumno (E0-C3): el config endpoint solo expone
 * flags globales (kill-switch de operador; el flag transicional de prefs se retiró en la Ola de
 * orden W1.10, 2026-09-01 — son siempre-on), computados frescos por request —
 * NO cachea prefs, asi que no hay nada que invalidar ahi. Las PREFERENCIAS viven en estas tablas y
 * las leen directo por PostgREST el gate de nav del alumno y las secciones de nutricion; al re-montar
 * / volver a foreground esos consumidores releen la MISMA fila que este write persiste y ven el cambio.
 */
export async function saveFeaturePrefs(
  ctx: FeaturePrefsScope,
  input: { domain: FeatureDomain; preset: Preset; sections: Record<string, boolean> },
): Promise<SavePrefsResult> {
  const updated_at = new Date().toISOString()
  if (ctx.scope === 'team') {
    if (!ctx.teamId) return { error: 'Contexto de equipo inválido.' }
    const { error } = await supabase
      .from('team_feature_prefs')
      .upsert(
        { team_id: ctx.teamId, domain: input.domain, preset: input.preset, sections: input.sections, updated_at },
        { onConflict: 'team_id,domain' },
      )
    return error ? { error: friendlyPrefsError(error.message) } : { ok: true }
  }
  if (!ctx.coachId) return { error: 'No autenticado.' }
  const { error } = await supabase
    .from('coach_feature_prefs')
    .upsert(
      { coach_id: ctx.coachId, domain: input.domain, preset: input.preset, sections: input.sections, updated_at },
      { onConflict: 'coach_id,domain' },
    )
  return error ? { error: friendlyPrefsError(error.message) } : { ok: true }
}
