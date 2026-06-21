import { supabase } from './supabase'
import { hasModule } from './entitlements'

/**
 * Funciones (feature-prefs) — capa ENABLED del modelo `visible = ENTITLED (billing) AND ENABLED (pref)`.
 *
 * Espejo MOBILE de la web (apps/web/src/components/coach/FeaturePrefsPanel.tsx +
 * _actions/feature-prefs.actions.ts + funciones.queries.ts). Standalone coach v1: solo edita
 * `coach_feature_prefs` (sin team ni per-student override en mobile).
 *
 * ── Anti-drift ──────────────────────────────────────────────────────────────────
 * @eva/feature-prefs y @eva/module-catalog NO estan en las tsconfig paths / deps de mobile, asi
 * que sus constantes minimas (presets, secciones del dominio nutricion, master switch, labels de
 * modulo) se espejan INLINE aca. Si cambia la config en el package, actualizar este archivo.
 *
 * Invariantes load-bearing (CLAUDE.md §8.2 / plan §8.2):
 * - Un toggle escribe SOLO `coach_feature_prefs.sections`/`preset`. NUNCA toca
 *   `coaches.enabled_modules` (compra-only) ni borra filas `nutrition_*` (apagar = ocultar).
 * - La preferencia SOLO achica: nunca prende algo no entitled (el gate de dinero es server-side).
 */

// ── Tipos espejo de @eva/feature-prefs ───────────────────────────────────────

export type Preset = 'basico' | 'intermedio' | 'profesional'
export const PRESETS: readonly Preset[] = ['basico', 'intermedio', 'profesional']

export type ModuleKey = 'cardio' | 'movement_assessment' | 'body_composition' | 'nutrition_exchanges'

/** Key reservada del jsonb `sections`: master switch del dominio. Ausente => dominio prendido. */
export const DOMAIN_ENABLED_KEY = '_enabled' as const

/** Dominio que mobile v1 edita (nutricion). */
export const NUTRITION_DOMAIN = 'nutrition' as const

export interface PresetMap {
  basico: boolean
  intermedio: boolean
  profesional: boolean
}

export interface FeatureSection {
  key: string
  label: string
  tooltip: string
  /** `true` = SIEMPRE ON, no toggleable, no gateable. */
  core: boolean
  /** Modulo de pago requerido; `null` = gratis. */
  requiresModule: ModuleKey | null
  /** En que presets aparece prendida. */
  presets: PresetMap
}

/** Mapa de preferencias persistido (`sections jsonb`): seccion → on/off. */
export type SectionPrefs = Partial<Record<string, boolean>>

const CORE_PRESETS: PresetMap = { basico: true, intermedio: true, profesional: true }
const INTERMEDIO_PRESETS: PresetMap = { basico: false, intermedio: true, profesional: true }
const PRO_PRESETS: PresetMap = { basico: false, intermedio: false, profesional: true }

/** Config de secciones del dominio Nutricion — espejo de NUTRITION_SECTIONS (@eva/feature-prefs). */
export const NUTRITION_SECTIONS: readonly FeatureSection[] = [
  { key: 'plan', label: 'Plan', tooltip: 'El plan nutricional y sus comidas. Siempre visible.', core: true, requiresModule: null, presets: CORE_PRESETS },
  { key: 'macros', label: 'Macros', tooltip: 'Objetivos y totales de macronutrientes. Siempre visible.', core: true, requiresModule: null, presets: CORE_PRESETS },
  { key: 'adherence', label: 'Adherencia', tooltip: 'Cumplimiento del plan a lo largo del tiempo. Siempre visible.', core: true, requiresModule: null, presets: CORE_PRESETS },
  { key: 'micros_base', label: 'Micronutrientes (base)', tooltip: 'Vitaminas y minerales clave. Gratis, apagado por defecto.', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'plate', label: 'Metodo del plato', tooltip: 'Guia visual de proporciones del plato.', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'off_plan_log', label: 'Registro fuera de plan', tooltip: 'Permite al alumno registrar comidas fuera del plan.', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'notes', label: 'Notas', tooltip: 'Notas del coach sobre la nutricion del alumno.', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'habits', label: 'Habitos', tooltip: 'Seguimiento de habitos nutricionales.', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'recipes', label: 'Recetas', tooltip: 'Recetas asociadas al plan.', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'shopping', label: 'Lista de compras', tooltip: 'Lista de compras derivada del plan.', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'micros_advanced', label: 'Micronutrientes (avanzado)', tooltip: 'Micros por intercambios. Requiere Nutricion Pro.', core: false, requiresModule: 'nutrition_exchanges', presets: PRO_PRESETS },
  { key: 'goals_bodycomp', label: 'Objetivos por composicion corporal', tooltip: 'Objetivos atados a composicion corporal. Requiere Composicion corporal.', core: false, requiresModule: 'body_composition', presets: PRO_PRESETS },
]

/** Labels comerciales de modulo — espejo de MODULE_CATALOG (@eva/module-catalog). */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  cardio: 'Cardio / Resistencia',
  movement_assessment: 'Evaluacion de movimiento',
  body_composition: 'Composicion corporal',
  nutrition_exchanges: 'Nutricion Pro',
}

/** Coacciona un preset desconocido/ausente a `'basico'` (deterministico). */
export function normalizePreset(preset: unknown): Preset {
  return preset === 'intermedio' || preset === 'profesional' ? preset : 'basico'
}

// ── Data layer (lectura/escritura coach_feature_prefs via supabase) ───────────

export interface NutritionPrefs {
  preset: Preset
  sections: SectionPrefs
  /** Entitlement por modulo (fail-closed) — `true` = la seccion Pro esta desbloqueada. */
  entitledByModule: Partial<Record<ModuleKey, boolean>>
}

function asSections(value: unknown): SectionPrefs {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as SectionPrefs) : {}
}

/** Modulos que gatean alguna seccion del dominio (derivado de la config). */
const GATING_MODULES: ModuleKey[] = [
  ...new Set(NUTRITION_SECTIONS.map((s) => s.requiresModule).filter((m): m is ModuleKey => m !== null)),
]

/**
 * Lee el estado CRUDO del editor para el coach actual: preset + mapa `sections` guardados +
 * entitlement por modulo. {} / 'basico' por defecto (sin fila / error). RLS coach_id=auth.uid().
 */
export async function getNutritionPrefs(): Promise<NutritionPrefs> {
  const fallback: NutritionPrefs = { preset: 'basico', sections: {}, entitledByModule: {} }
  try {
    const { data: auth } = await supabase.auth.getUser()
    const id = auth.user?.id
    if (!id) return fallback

    const [{ data: row }, entitledByModule] = await Promise.all([
      supabase
        .from('coach_feature_prefs')
        .select('preset, sections')
        .eq('coach_id', id)
        .eq('domain', NUTRITION_DOMAIN)
        .maybeSingle(),
      resolveEntitlement(),
    ])

    return {
      preset: normalizePreset((row as any)?.preset),
      sections: asSections((row as any)?.sections),
      entitledByModule,
    }
  } catch {
    return fallback
  }
}

async function resolveEntitlement(): Promise<Partial<Record<ModuleKey, boolean>>> {
  const out: Partial<Record<ModuleKey, boolean>> = {}
  await Promise.all(
    GATING_MODULES.map(async (key) => {
      out[key] = await hasModule(key)
    }),
  )
  return out
}

export type SavePrefsResult = { ok: true } | { ok: false; error: string }

/**
 * Upsert de las preferencias del coach standalone (`coach_feature_prefs`, PK `coach_id,domain`).
 * `coach_id` se deriva de la sesion — nunca de input. RLS authoritative (no service-role).
 */
export async function saveNutritionPrefs(input: {
  preset: Preset
  sections: SectionPrefs
}): Promise<SavePrefsResult> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const id = auth.user?.id
    if (!id) return { ok: false, error: 'No autenticado.' }

    const { error } = await supabase.from('coach_feature_prefs').upsert(
      {
        coach_id: id,
        domain: NUTRITION_DOMAIN,
        preset: input.preset,
        sections: input.sections,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'coach_id,domain' },
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo guardar.' }
  }
}
