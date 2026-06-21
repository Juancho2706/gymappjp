import { supabase } from './supabase'

/**
 * Resolver de visibilidad por seccion del dominio Nutricion — lado ALUMNO (mobile).
 *
 * Espejo de apps/web/src/services/feature-prefs.service.ts (resolveFeaturePrefs +
 * resolveNutritionDomainEnabled) y del resolver PURO @eva/feature-prefs (resolveSections /
 * resolveDomainEnabled). Modelo: `visible = core OR (ENTITLED AND ENABLED)`.
 *
 * ── Anti-drift ──────────────────────────────────────────────────────────────────
 * @eva/feature-prefs NO esta en las tsconfig paths / deps de mobile (lib/feature-prefs.ts ya
 * espeja su config para el lado COACH). Aca espejamos el resolver PURO + la config de secciones
 * del dominio nutricion. Si cambia el package, actualizar este archivo y lib/feature-prefs.ts.
 *
 * ── Fail-OPEN (flag FEATURE_PREFS_ENABLED) ────────────────────────────────────────
 * El flag vive en Edge Config (web). Mobile NO lo lee → adoptamos el comportamiento de HOY =
 * flag OFF = fail-OPEN: se muestra TODO lo entitled (las preferencias coach/alumno se IGNORAN).
 * Esto es el grandfathering transicional (plan §5.2): nadie pierde una superficie por la sola
 * ausencia de fila de prefs. La capa de billing (entitledByModule, fail-closed) SI se respeta.
 *
 * Standalone v1: el alumno depende de `coach_feature_prefs` del coach del plan + su propio
 * override `client_feature_prefs`. El contexto team/org no se resuelve en mobile (igual que el
 * resto de libs). Las lecturas van RLS-scoped; si RLS bloquea, degrada a fail-OPEN.
 */

export type NutritionSectionKey =
  | 'plan'
  | 'macros'
  | 'adherence'
  | 'micros_base'
  | 'plate'
  | 'off_plan_log'
  | 'notes'
  | 'habits'
  | 'recipes'
  | 'shopping'
  | 'micros_advanced'
  | 'goals_bodycomp'

export type SectionFlags = Record<NutritionSectionKey, boolean>

type ModuleKey = 'cardio' | 'movement_assessment' | 'body_composition' | 'nutrition_exchanges'
type Preset = 'basico' | 'intermedio' | 'profesional'
type SectionPrefs = Partial<Record<string, boolean>>

const DOMAIN_ENABLED_KEY = '_enabled' as const
const NUTRITION_DOMAIN = 'nutrition' as const

interface PresetMap {
  basico: boolean
  intermedio: boolean
  profesional: boolean
}

interface FeatureSection {
  key: NutritionSectionKey
  core: boolean
  requiresModule: ModuleKey | null
  presets: PresetMap
}

const CORE_PRESETS: PresetMap = { basico: true, intermedio: true, profesional: true }
const INTERMEDIO_PRESETS: PresetMap = { basico: false, intermedio: true, profesional: true }
const PRO_PRESETS: PresetMap = { basico: false, intermedio: false, profesional: true }

/** Config de secciones del dominio Nutricion — espejo de NUTRITION_SECTIONS (@eva/feature-prefs). */
const NUTRITION_SECTIONS: readonly FeatureSection[] = [
  { key: 'plan', core: true, requiresModule: null, presets: CORE_PRESETS },
  { key: 'macros', core: true, requiresModule: null, presets: CORE_PRESETS },
  { key: 'adherence', core: true, requiresModule: null, presets: CORE_PRESETS },
  { key: 'micros_base', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'plate', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'off_plan_log', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'notes', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'habits', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'recipes', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'shopping', core: false, requiresModule: null, presets: INTERMEDIO_PRESETS },
  { key: 'micros_advanced', core: false, requiresModule: 'nutrition_exchanges', presets: PRO_PRESETS },
  { key: 'goals_bodycomp', core: false, requiresModule: 'body_composition', presets: PRO_PRESETS },
]

/** Todo visible (fail-OPEN) salvo lo gateado por entitlement — comportamiento de HOY. */
export const ALL_SECTIONS_VISIBLE: SectionFlags = {
  plan: true,
  macros: true,
  adherence: true,
  micros_base: true,
  plate: true,
  off_plan_log: true,
  notes: true,
  habits: true,
  recipes: true,
  shopping: true,
  micros_advanced: true,
  goals_bodycomp: true,
}

function normalizePreset(preset: unknown): Preset {
  return preset === 'intermedio' || preset === 'profesional' ? preset : 'basico'
}

function asSections(value: unknown): SectionPrefs | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as SectionPrefs) : null
}

/** enabled_modules del coach del plan ({key:true}); {} por defecto / error. RLS = techo. */
async function getCoachEnabledModules(coachId: string): Promise<Partial<Record<ModuleKey, boolean>>> {
  try {
    const { data } = await supabase.from('coaches').select('enabled_modules').eq('id', coachId).maybeSingle()
    const v = (data as any)?.enabled_modules
    return v && typeof v === 'object' ? (v as Partial<Record<ModuleKey, boolean>>) : {}
  } catch {
    return {}
  }
}

export interface StudentNutritionPrefs {
  /** Visibilidad efectiva por seccion (core siempre ON salvo dominio apagado). */
  sections: SectionFlags
  /** Master switch del dominio: false => ocultar TODA la nutricion. */
  domainEnabled: boolean
  /** "Nutricion Pro" (modulo nutrition_exchanges) entitled para el contexto del plan. */
  nutritionProEnabled: boolean
}

/**
 * Resuelve la vista del alumno: entitlement (billing del coach del plan, fail-closed) + master
 * switch del dominio + secciones. Fail-OPEN (flag ausente en mobile) => muestra TODO lo entitled,
 * pero respeta `_enabled === false` (master switch) leido del override del alumno o del coach
 * para no mostrar nutricion cuando el coach la apago explicitamente.
 *
 * @param coachId coach DUENO del plan (no necesariamente el coach_id del alumno).
 * @param clientId alumno autenticado (override mas especifico).
 */
export async function resolveStudentNutritionPrefs(
  coachId: string | null,
  clientId: string
): Promise<StudentNutritionPrefs> {
  // Entitlement (billing) — fail-closed; standalone usa el coach del plan.
  const entitledByModule = coachId ? await getCoachEnabledModules(coachId) : {}
  const nutritionProEnabled = entitledByModule['nutrition_exchanges'] === true

  // Lectura de preferencias (RLS = techo; degradar a null si no se puede leer).
  let coachSections: SectionPrefs | null = null
  let coachPreset: string | null = null
  let clientSections: SectionPrefs | null = null

  try {
    if (coachId) {
      const { data } = await supabase
        .from('coach_feature_prefs')
        .select('preset, sections')
        .eq('coach_id', coachId)
        .eq('domain', NUTRITION_DOMAIN)
        .maybeSingle()
      coachPreset = (data as any)?.preset ?? null
      coachSections = asSections((data as any)?.sections)
    }
  } catch {
    coachSections = null
  }

  try {
    const { data } = await supabase
      .from('client_feature_prefs')
      .select('sections')
      .eq('client_id', clientId)
      .eq('domain', NUTRITION_DOMAIN)
      .maybeSingle()
    clientSections = asSections((data as any)?.sections)
  } catch {
    clientSections = null
  }

  // Master switch del dominio (mas-especifico-gana; ausente => ON). Esta SI se respeta aun en
  // fail-OPEN: es una decision explicita del coach/alumno de ocultar el dominio entero.
  const domainEnabled =
    clientSections?.[DOMAIN_ENABLED_KEY] ?? coachSections?.[DOMAIN_ENABLED_KEY] ?? true

  if (!domainEnabled) {
    const allOff = {} as SectionFlags
    for (const s of NUTRITION_SECTIONS) allOff[s.key] = false
    return { sections: allOff, domainEnabled: false, nutritionProEnabled }
  }

  // Fail-OPEN (mobile no lee FEATURE_PREFS_ENABLED): mostrar TODO lo entitled, ignorando los
  // toggles de seccion. Las core van ON; las gateadas dependen solo del entitlement. El preset se
  // normaliza para cuando mobile lea el flag (modelo completo entitled AND wants); hoy no se usa.
  void normalizePreset(coachPreset)

  const sections = {} as SectionFlags
  for (const section of NUTRITION_SECTIONS) {
    if (section.core) {
      sections[section.key] = true
      continue
    }
    const entitled = section.requiresModule
      ? entitledByModule[section.requiresModule] === true
      : true
    sections[section.key] = entitled
  }

  return { sections, domainEnabled: true, nutritionProEnabled }
}
