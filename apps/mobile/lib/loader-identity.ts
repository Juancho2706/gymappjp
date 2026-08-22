/**
 * DECISION PURA de la identidad de la pantalla de carga: ¿EVA o la marca del coach?
 *
 * Vive aparte de los componentes (0 deps de React/RN) porque es la regla que el owner
 * describe como "el splash arranca en EVA y, si tengo Mi marca, cambia a lo mío": una regla
 * de producto, no de render. La consumen `components/loaders/BrandedLoader.tsx` (orquestador
 * de las ~68 pantallas de carga) y `components/loaders/EvaLegacyLoader.tsx`.
 *
 * ENTRADA: el branding **efectivo** del `ThemeContext` — el que ya paso por
 * `resolveEffectiveCoachBrandPresentation` (tier aplicado y preset materializado en
 * `primaryColor`). Pasarle el payload CRUDO de `loadStoredBranding()` seria un bug: un coach
 * con tema preset "rosa" guarda `primary_color` viejo en DB y el color real solo aparece tras
 * resolver el preset — leer el crudo es exactamente como sale azul EVA una marca rosa.
 *
 * REGLA (owner 2026-08-22): hay marca cuando la cuenta muestra ALGO propio —
 *   color distinto del azul de sistema  ·  logo cargado  ·  loader personalizado.
 * Un coach que nunca toco nada (azul EVA, sin logo, sin loader) es identidad EVA: la figura
 * blanca y el wordmark "EVA", igual que el splash nativo.
 */

import { parseLoaderConfig, resolveLoaderVariant } from './brand-loaders'

/** Wordmark de la identidad EVA. Es firma, nunca protagonista. */
export const EVA_WORDMARK = 'EVA'

/** Tope del wordmark de marca: mas largo que esto no entra en una linea del loader. */
export const LOADER_WORDMARK_MAX = 14

/**
 * Azules "de sistema": ninguno identifica a un coach.
 *  - `#1462DC` = azul EVA (`DEFAULT_BRAND` de lib/theme, token `--color-sport-600`).
 *  - `#2563EB` = `DEFAULT_BRAND_HEX` de lib/color-contrast.
 *  - `#007AFF` = `SYSTEM_PRIMARY_COLOR` de lib/coach (y el default del editor de Mi Marca).
 * Un coach que elija a proposito uno de estos igual entra a la rama de marca por su logo,
 * su nombre en el loader o su animacion — el color solo no alcanza para distinguirlo.
 */
const SYSTEM_BLUES = new Set(['#1462dc', '#2563eb', '#007aff'])

export type LoaderIconMode = 'eva' | 'coach' | 'none'

/** Subconjunto del branding efectivo que decide la identidad del loader. */
export interface LoaderIdentitySource {
  primaryColor?: string | null
  /** `coaches.brand_name` — el nombre de la marca, no el texto del loader. */
  displayName?: string | null
  logoUrl?: string | null
  logoUrlDark?: string | null
  useCustomLoader?: boolean | null
  loaderText?: string | null
  loaderIconMode?: string | null
  loaderVariant?: string | null
  loaderConfig?: string | null
}

export type LoaderIdentityKind = 'eva' | 'brand'

export interface LoaderIdentity {
  /** `eva` = figura blanca + firma "EVA". `brand` = la marca del coach. */
  kind: LoaderIdentityKind
  /** Wordmark ya resuelto y en mayusculas (`EVA` o el nombre/texto de la marca). */
  word: string
  /** Logo del coach para el esquema pedido, o `null` si toca figura. */
  logoUri: string | null
  /** `true` ⇒ la figura EVA se tiñe con `theme.primary` (marca sin logo). */
  tintFigure: boolean
  /** `false` solo cuando el coach eligio "Sin icono" para su loader. */
  showIcon: boolean
}

/** Identidad EVA pura — la de arranque: sin sesion, sin cache de marca o marca no permitida. */
export const EVA_LOADER_IDENTITY: LoaderIdentity = {
  kind: 'eva',
  word: EVA_WORDMARK,
  logoUri: null,
  tintFigure: false,
  showIcon: true,
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/** Color propio = hex valido que no sea uno de los azules de sistema. */
export function isOwnBrandColor(color: string | null | undefined): boolean {
  const hex = clean(color).toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(hex)) return false
  return !SYSTEM_BLUES.has(hex)
}

/**
 * Wordmark presentable: colapsa espacios, corta al tope y —si el nombre completo no entra—
 * se queda con la PRIMERA palabra antes que con un recorte a media palabra
 * ("Josefit Entrenamiento Personal" ⇒ "JOSEFIT", no "JOSEFIT ENTREN").
 */
export function fitLoaderWordmark(raw: string, max: number = LOADER_WORDMARK_MAX): string {
  const normalized = clean(raw).replace(/\s+/g, ' ')
  if (!normalized) return ''
  if (normalized.length <= max) return normalized
  const first = normalized.split(' ')[0]
  return (first.length <= max ? first : normalized.slice(0, max)).trim()
}

function pickLogo(source: LoaderIdentitySource, scheme: 'light' | 'dark'): string | null {
  // Misma regla que el resto del repo (`resolveThemedLogoSrcs` en web): en oscuro gana el
  // logo oscuro y cae al claro; en claro manda el claro.
  const dark = clean(source.logoUrlDark)
  const light = clean(source.logoUrl)
  const picked = scheme === 'dark' ? dark || light : light || dark
  return picked || null
}

function normalizeIconMode(raw: string | null | undefined): LoaderIconMode | null {
  const value = clean(raw).toLowerCase()
  if (value === 'coach' || value === 'none' || value === 'eva') return value
  return null
}

/**
 * Resuelve la identidad del loader a partir del branding EFECTIVO.
 *
 * @param branding branding del `ThemeContext` (ya tier-gateado y con preset materializado).
 * @param scheme   esquema resuelto — decide cual de los dos logos se usa.
 */
export function resolveLoaderIdentity(
  branding: LoaderIdentitySource | null | undefined,
  scheme: 'light' | 'dark' = 'dark',
): LoaderIdentity {
  if (!branding) return EVA_LOADER_IDENTITY

  const logo = pickLogo(branding, scheme)
  const customText = clean(branding.loaderText)
  const hasCustomText = Boolean(branding.useCustomLoader) && customText.length > 0
  const hasVariant = resolveLoaderVariant(branding.loaderVariant) !== 'eva'
  const hasComposite = parseLoaderConfig(branding.loaderConfig ?? null) != null
  const hasCustomLoader = hasCustomText || hasVariant || hasComposite

  const name = fitLoaderWordmark(clean(branding.displayName))
  const branded = Boolean(isOwnBrandColor(branding.primaryColor) || logo || hasCustomLoader)

  if (!branded) return EVA_LOADER_IDENTITY

  const iconMode = normalizeIconMode(branding.loaderIconMode)
  // "Sin icono" es una eleccion explicita y se respeta. "EVA" solo gana cuando el coach de
  // verdad configuro su loader (texto/animacion/compositor): si nunca lo toco, ese 'eva' es
  // el default de un selector escondido en Avanzado y no puede tapar el logo de la marca en
  // su propia app — que era justo el sintoma ("tengo Mi marca y sigo viendo EVA").
  const wantsEvaFigure = iconMode === 'eva' && hasCustomLoader
  const showIcon = iconMode !== 'none'
  const logoUri = showIcon && logo && !wantsEvaFigure ? logo : null

  const word = fitLoaderWordmark(hasCustomText ? customText : name) || EVA_WORDMARK

  return {
    kind: 'brand',
    word: word.toUpperCase(),
    logoUri,
    tintFigure: showIcon && !logoUri,
    showIcon,
  }
}
