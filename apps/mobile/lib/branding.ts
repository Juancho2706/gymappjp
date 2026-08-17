import AsyncStorage from '@react-native-async-storage/async-storage'
import { parseCoachIdentifier } from '@eva/schemas'
import { supabase } from './supabase'

export interface CoachBranding {
  coachId: string
  coachSlug: string
  primaryColor: string
  /** Nombre visible de la marca (`coaches.brand_name`). */
  displayName: string
  inviteCode: string
  logoUrl?: string | null
  // E1-14 — payload white-label del login del alumno (espejo de `getClientLoginCoach` en web:
  // apps/web/src/app/c/[coach_slug]/login/_data/login.queries.ts). Columnas con GRANT SELECT a
  // `anon` verificado (auditoria E0-B1) — el login es pre-auth y lee como `anon`. Opcionales por
  // DB-compat (fallback a las columnas minimas si una falta en una DB vieja).
  /** Logo alternativo para modo oscuro (`logo_url_dark`). */
  logoUrlDark?: string | null
  /** Tagline del hero de login (`welcome_message`). */
  welcomeMessage?: string | null
  /** Tier de suscripcion — gatea el branding (isBrandingAllowed: < Pro => EVA). */
  subscriptionTier?: string | null
  /** Variante de layout del login: clasico | hero | energia | minimal (`login_layout_key`). */
  loginLayoutKey?: string | null
  /**
   * LEGACY (W-brand B2): color secundario suelto (`brand_secondary_color`). Ya no se lee de DB
   * ni se resuelve — el campo sobrevive en el tipo solo por compat con caches viejas del device.
   */
  brandSecondaryColor?: string | null
  /** LEGACY (W-brand B2): override de acento claro (`accent_light`). Ya no se lee ni resuelve. */
  accentLight?: string | null
  /** LEGACY (W-brand B2): override de acento oscuro (`accent_dark`). Ya no se lee ni resuelve. */
  accentDark?: string | null
  /** Tiñe neutrales con el hue de marca (`neutral_tint`). */
  neutralTint?: boolean | null
  /** Fuente de display curada (`brand_font_key`). */
  brandFontKey?: string | null
  /** Tema preset curado — su precedencia se resuelve con `resolvePresetBranding` (`theme_preset_key`). */
  themePresetKey?: string | null
  /** Variante de loader sugerida (`loader_variant`). */
  loaderVariant?: string | null
  /** Config cruda del compositor de loader (`loader_config`, jsonb → string JSON). */
  loaderConfig?: string | null
  // M-F1: loader personalizado del coach (lo consume EvaLoader). Opcionales por DB-compat.
  useCustomLoader?: boolean
  loaderText?: string | null
  loaderIconMode?: 'eva' | 'coach' | 'none' | string | null
  /** LEGACY (W-brand B4): ya no se lee ni escribe — el color lo decide el motor de contraste. */
  loaderTextColor?: string | null
  /**
   * Ejecutor V3 (E0.7) — tema del ejecutor del alumno (`executor_theme`): 'coach' usa los
   * colores del coach, 'eva' usa la paleta EVA. Lo consume la Ola 2; hoy solo se transporta.
   */
  executorTheme?: 'coach' | 'eva' | string | null
  /**
   * QA4 — `use_brand_colors_coach`: si el coach apaga el toggle, su PROPIO panel va neutro
   * (paridad con `BrandCoachLoadingShell` + `coach/layout.tsx` en web). Tri-estado a proposito:
   * `null`/`undefined` = desconocido ⇒ se trata como ACTIVADO (regla web: `!== false`).
   *
   * SOLO lo llena el camino AUTENTICADO del coach (`fetchOwnCoachBranding`). El select anonimo
   * del login del alumno NO pide esta columna a proposito: si le faltara el GRANT a `anon`, el
   * select rich fallaria y se apagaria TODO el white-label del login.
   */
  useBrandColorsCoach?: boolean | null
}

const BRANDING_KEY = 'eva_coach_branding'

export class CoachBrandingLookupError extends Error {
  constructor() {
    super('No se pudo consultar el branding del coach')
    this.name = 'CoachBrandingLookupError'
  }
}

export function normalizeCoachIdentifier(input: string): string {
  const parsed = parseCoachIdentifier(input)
  return parsed.type === 'invalid' ? '' : parsed.value
}

// Nota: `display_name` NO es columna de `coaches` (fuente de verdad = `brand_name`, alineado con la
// query del login web). El select rich pide todo el payload white-label del login; el min es el
// fallback DB-compat para DBs viejas que no tengan las columnas v2 (todas con GRANT anon).
// W-brand B1/B2/B4 (dueño 2026-08-17): `brand_secondary_color`, `accent_light`, `accent_dark` y
// `loader_text_color` SALIERON del select — las columnas quedan en DB (grandfather pasivo) pero
// dejan de leerse: el par se deriva vía `sealPair` y el color del texto del loader lo decide el
// motor de contraste del tema.
const BRANDING_COLS_RICH =
  'id, slug, primary_color, brand_name, invite_code, logo_url, logo_url_dark, welcome_message, subscription_tier, login_layout_key, neutral_tint, brand_font_key, theme_preset_key, loader_variant, loader_config, use_custom_loader, loader_text, loader_icon_mode, executor_theme'
const BRANDING_COLS_MIN = 'id, slug, primary_color, brand_name, invite_code'

export async function fetchBrandingByCoachIdentifier(identifierInput: string): Promise<CoachBranding | null> {
  const identifier = parseCoachIdentifier(identifierInput)
  if (identifier.type === 'invalid') return null

  const runQuery = (cols: string) => {
    const q = supabase.from('coaches').select(cols)
    return identifier.type === 'code'
      ? q.eq('invite_code', identifier.value).maybeSingle()
      : q.eq('slug', identifier.value).maybeSingle()
  }

  // M-F1: intenta columnas de loader; si la DB no las tiene, cae a las mínimas.
  let res = (await runQuery(BRANDING_COLS_RICH)) as { data: any; error: any }
  if (res.error) res = (await runQuery(BRANDING_COLS_MIN)) as { data: any; error: any }
  const data = res.data
  if (res.error) throw new CoachBrandingLookupError()
  if (!data) return null

  return mapCoachRowToBranding(data)
}

/** Fila cruda de `coaches` → payload de marca. Unica fuente del mapeo (anon + autenticado). */
function mapCoachRowToBranding(data: any): CoachBranding {
  const rawLoaderConfig = data.loader_config
  const branding: CoachBranding = {
    coachId: data.id,
    coachSlug: data.slug,
    // Azul EVA (= token `--color-sport-600`), el mismo que `DEFAULT_BRAND` en `lib/theme.ts`.
    primaryColor: data.primary_color ?? '#1462DC',
    displayName: data.brand_name ?? data.slug,
    inviteCode: data.invite_code,
    logoUrl: data.logo_url ?? null,
    logoUrlDark: data.logo_url_dark ?? null,
    welcomeMessage: data.welcome_message ?? null,
    subscriptionTier: data.subscription_tier ?? null,
    loginLayoutKey: data.login_layout_key ?? null,
    // W-brand B2: secundario/acentos almacenados ya no se leen — quedan null en el payload
    // (el resolutor deriva el par del primario; con preset manda el catálogo).
    brandSecondaryColor: null,
    accentLight: null,
    accentDark: null,
    neutralTint: data.neutral_tint ?? null,
    brandFontKey: data.brand_font_key ?? null,
    themePresetKey: data.theme_preset_key ?? null,
    loaderVariant: data.loader_variant ?? null,
    loaderConfig:
      typeof rawLoaderConfig === 'string'
        ? rawLoaderConfig
        : rawLoaderConfig
          ? JSON.stringify(rawLoaderConfig)
          : null,
    useCustomLoader: data.use_custom_loader ?? false,
    loaderText: data.loader_text ?? null,
    loaderIconMode: data.loader_icon_mode ?? null,
    // W-brand B4: el color del texto del loader ya no se lee — lo decide el motor de contraste.
    loaderTextColor: null,
    executorTheme: data.executor_theme ?? 'coach',
    // Solo viene por el camino autenticado; ausente ⇒ null (= desconocido = activado).
    useBrandColorsCoach: data.use_brand_colors_coach ?? null,
  }

  return branding
}

/**
 * QA4 (P1-3) — marca PROPIA del coach logueado, leida bajo su sesion (RLS: id = auth.uid()).
 * Camino AUTENTICADO: es el unico que pide `use_brand_colors_coach` (ver nota del tipo).
 * Fail-soft por DB-compat: rich+toggle → rich → minimo.
 */
export async function fetchOwnCoachBranding(userId: string): Promise<CoachBranding | null> {
  const runQuery = (cols: string) => supabase.from('coaches').select(cols).eq('id', userId).maybeSingle()

  let res = (await runQuery(`${BRANDING_COLS_RICH}, use_brand_colors_coach`)) as { data: any; error: any }
  if (res.error) res = (await runQuery(BRANDING_COLS_RICH)) as { data: any; error: any }
  if (res.error) res = (await runQuery(BRANDING_COLS_MIN)) as { data: any; error: any }
  if (res.error || !res.data) return null

  return mapCoachRowToBranding(res.data)
}

export async function fetchBrandingByInviteCode(inviteCode: string): Promise<CoachBranding | null> {
  return fetchBrandingByCoachIdentifier(inviteCode)
}

export async function saveStoredBranding(branding: CoachBranding): Promise<void> {
  await AsyncStorage.setItem(BRANDING_KEY, JSON.stringify(branding))
}

/**
 * QA4 (P0-2) — escritura NO destructiva de la cache de marca.
 *
 * `saveStoredBranding` reemplaza el objeto entero: un caller que solo conoce parte del payload
 * (el editor de Mi Marca) borraba en silencio logo, loader, welcome_message, login_layout,
 * executor_theme… (todos opcionales ⇒ TypeScript no lo veia). Este helper mergea sobre lo
 * almacenado y persiste el resultado.
 *
 * Reglas:
 *  - `undefined` en el patch NO pisa (se conserva lo guardado); `null` SI limpia explicitamente.
 *  - El merge solo ocurre si es el MISMO coach; si `coachId` difiere, reemplazo total (nunca
 *    revivir campos de otra marca cacheada en el device).
 *  - Devuelve el payload final (o null si el resultado no seria un branding valido).
 */
export async function mergeStoredBranding(patch: Partial<CoachBranding>): Promise<CoachBranding | null> {
  const prev = await loadStoredBranding()
  const sameCoach = !!prev && (!patch.coachId || prev.coachId === patch.coachId)
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<CoachBranding>
  const next = { ...(sameCoach ? prev : null), ...defined } as CoachBranding
  if (!isStoredCoachBranding(next)) return null
  await saveStoredBranding(next)
  return next
}

// QA4 (P1-3) — memo del bootstrap de la marca propia: una sola resolucion por usuario y por
// arranque de app. `clearBranding()` lo resetea (cierre de sesion) para que el proximo coach
// que entre en el mismo device vuelva a resolver la suya.
let ownBrandingBootstrappedFor: string | null = null

export interface OwnBrandingBootstrapResult {
  /** true ⇒ el caller debe aplicar `branding` (puede ser null = panel neutro EVA). */
  handled: boolean
  branding: CoachBranding | null
}

const BOOTSTRAP_SKIPPED: OwnBrandingBootstrapResult = { handled: false, branding: null }

/**
 * QA4 (P1-3 + P1-4) — al entrar el COACH a su panel, carga y cachea SU PROPIA marca.
 *
 * Antes nadie lo hacia: la cache solo la escribia el flujo del ALUMNO (codigo/enlace del coach) y
 * el Guardar de Mi Marca ⇒ un coach en un device limpio veia EVA, y un device que antes uso el
 * flujo de alumno de OTRO coach pintaba el panel con la marca ajena.
 *
 * Honra `use_brand_colors_coach` como la web: si esta explicitamente en false, el panel del coach
 * va neutro (se limpia la cache). `null` (columna sin valor) = ACTIVADO.
 *
 * Es best-effort y no bloquea nada: ante error de red no memoiza y se reintenta en el proximo montaje.
 */
export async function bootstrapOwnCoachBranding(): Promise<OwnBrandingBootstrapResult> {
  try {
    // getSession() lee la sesion LOCAL (sin round-trip): esto corre en el arranque del panel.
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return BOOTSTRAP_SKIPPED
    if (ownBrandingBootstrappedFor === userId) return BOOTSTRAP_SKIPPED

    const own = await fetchOwnCoachBranding(userId)
    if (!own) return BOOTSTRAP_SKIPPED // no es coach, o fallo la lectura ⇒ no memoizar

    // OJO con el orden: `clearBranding()` resetea el memo, asi que se marca DESPUES de limpiar.
    if (own.useBrandColorsCoach === false) {
      await clearBranding()
      ownBrandingBootstrappedFor = userId
      return { handled: true, branding: null }
    }
    await saveStoredBranding(own)
    ownBrandingBootstrappedFor = userId
    return { handled: true, branding: own }
  } catch {
    return BOOTSTRAP_SKIPPED
  }
}

// Memo del refresco de marca del ALUMNO: una resolucion por usuario y por arranque, igual que el
// del coach. `clearBranding()` lo resetea.
let clientBrandingRefreshedFor: string | null = null

/**
 * El ALUMNO vuelve a resolver la marca de SU coach al entrar a la app.
 *
 * Sin esto la cache la escribia UNICAMENTE la pantalla del codigo del coach (`CoachIdentifierForm`),
 * asi que un coach que cambiaba su color NUNCA lo veia reflejado en los alumnos que ya habian
 * entrado alguna vez: seguian con la marca vieja hasta reinstalar o volver a tipear el codigo. El
 * coach si veia la suya al dia (`bootstrapOwnCoachBranding`), lo que hacia el sintoma mas confuso
 * todavia — "yo lo veo bien y mis alumnos no".
 *
 * Best-effort y memoizado: una sola consulta por arranque, y ante error NO memoiza, asi que se
 * reintenta en el proximo montaje en vez de dejar la marca vieja pegada para siempre.
 */
export async function refreshClientCoachBranding(): Promise<CoachBranding | null> {
  try {
    // Sesion LOCAL, sin round-trip: esto corre en el montaje del arbol del alumno.
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return null
    if (clientBrandingRefreshedFor === userId) return null

    const { data: row, error } = await supabase
      .from('clients')
      .select('coach_id')
      .eq('id', userId)
      .maybeSingle()
    if (error) return null
    const coachId = (row as { coach_id?: string | null } | null)?.coach_id
    // Sin fila de cliente (p. ej. un COACH entrando) no hay nada que refrescar y tampoco se
    // memoiza: esta funcion solo la llama el arbol del alumno.
    if (!coachId) return null

    // Misma lectura por id que usa el coach para su propia marca (RLS: `coaches_select_authenticated`
    // deja al alumno leer la fila de SU coach).
    const fresh = await fetchOwnCoachBranding(coachId)
    if (!fresh) return null

    await saveStoredBranding(fresh)
    clientBrandingRefreshedFor = userId
    return fresh
  } catch {
    return null
  }
}

export async function loadStoredBranding(): Promise<CoachBranding | null> {
  const raw = await AsyncStorage.getItem(BRANDING_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isStoredCoachBranding(parsed)) return parsed
    await AsyncStorage.removeItem(BRANDING_KEY)
    return null
  } catch {
    await AsyncStorage.removeItem(BRANDING_KEY).catch(() => {})
    return null
  }
}

export async function clearBranding(): Promise<void> {
  // Cierre de sesion / cambio de marca: el proximo coach del device debe re-resolver la suya.
  ownBrandingBootstrappedFor = null
  clientBrandingRefreshedFor = null
  await AsyncStorage.removeItem(BRANDING_KEY)
}

function isStoredCoachBranding(value: unknown): value is CoachBranding {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CoachBranding>
  return (
    typeof candidate.coachId === 'string' &&
    candidate.coachId.length > 0 &&
    typeof candidate.coachSlug === 'string' &&
    candidate.coachSlug.length > 0 &&
    typeof candidate.primaryColor === 'string' &&
    typeof candidate.displayName === 'string' &&
    typeof candidate.inviteCode === 'string'
  )
}
