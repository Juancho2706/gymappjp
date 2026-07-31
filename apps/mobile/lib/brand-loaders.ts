/**
 * Registro UNICO de loaders de marca en RN — espejo EXACTO de los dos modulos puros de web:
 *   - `apps/web/src/lib/brand-loaders.ts`  (las 7 variantes + metadata de galeria)
 *   - `apps/web/src/lib/brand-composer.ts` (shape del compositor + parse/serialize de loader_config)
 *
 * Data pura: 0 deps de React/RN/DOM. Lo consumen los componentes (components/loaders/*), el editor
 * de Mi Marca y la capa de persistencia (lib/coach-brand.ts). Fuente de verdad de las KEYS =
 * `@eva/schemas` (mismo z.enum que valida la web), aca solo vive la metadata de display.
 *
 * PRECEDENCIA (identica a web, EvaRouteLoader.tsx:127-153):
 *   loader_config (compositor)  >  loader_variant (!= 'eva')  >  loader legacy (texto/icono)  >  EVA
 */

import { LOADER_VARIANT_TUPLE, type LoaderVariant } from '@eva/schemas'

export { LOADER_VARIANT_TUPLE, type LoaderVariant }

export const DEFAULT_LOADER_VARIANT: LoaderVariant = 'eva'

export type LoaderVariantMeta = {
  label: string
  note: string
  /** Lleva icono central (logo del coach o figura EVA). 'ritmo' no. */
  hasIcon: boolean
  /** Lleva wordmark. */
  hasWordmark: boolean
}

export const LOADER_VARIANTS: Record<LoaderVariant, LoaderVariantMeta> = {
  eva: { label: 'EVA (default)', note: 'El loader actual de EVA', hasIcon: true, hasWordmark: true },
  progreso: { label: 'Progreso', note: 'Anillo + barra de avance', hasIcon: true, hasWordmark: true },
  anillo: { label: 'Anillo', note: 'Anillo punteado girando', hasIcon: true, hasWordmark: true },
  radar: { label: 'Radar', note: 'Pings tipo sonar', hasIcon: true, hasWordmark: true },
  cometa: { label: 'Cometa', note: 'Cola de gradiente girando', hasIcon: true, hasWordmark: true },
  ritmo: { label: 'Ritmo', note: 'Barras de ecualizador', hasIcon: false, hasWordmark: true },
  orbitas: { label: 'Orbitas', note: 'Dos arcos contra-rotando', hasIcon: true, hasWordmark: true },
}

/** Type guard: el string (valor crudo de DB) es una variante valida. Fail-closed. */
export function isLoaderVariant(value: string | null | undefined): value is LoaderVariant {
  return value != null && (LOADER_VARIANT_TUPLE as readonly string[]).includes(value)
}

/** Normaliza un valor crudo a una variante valida (default 'eva' si invalido/null). */
export function resolveLoaderVariant(value: string | null | undefined): LoaderVariant {
  return isLoaderVariant(value) ? value : DEFAULT_LOADER_VARIANT
}

// ── Compositor "Crear el mio" (simbolo x animacion x texto) ──────────────────────────────────
// Espejo 1:1 de apps/web/src/lib/brand-composer.ts. Si cambia alla, cambia aca.

export const LOADER_SYMBOL_KEYS = [
  'logo',
  'initial',
  'dumbbell',
  'flame',
  'bolt',
  'heart',
  'activity',
  'star',
] as const
export type LoaderSymbol = (typeof LOADER_SYMBOL_KEYS)[number]

export const LOADER_ANIMATION_KEYS = ['pulso', 'orbita', 'barra', 'respiracion'] as const
export type LoaderAnimation = (typeof LOADER_ANIMATION_KEYS)[number]

/** Maximo de caracteres del texto del loader compuesto (espejo del loader legacy). */
export const LOADER_TEXT_MAX = 10

export type LoaderComposite = {
  symbol: LoaderSymbol
  animation: LoaderAnimation
  /** Texto opcional (wordmark); si se omite, el render usa el texto de marca. */
  text?: string
}

/** Punto de arranque cuando el coach entra a la ruta "Crear el mio". */
export const DEFAULT_LOADER_COMPOSITE: LoaderComposite = { symbol: 'initial', animation: 'pulso' }

export const LOADER_SYMBOL_LABELS: Record<LoaderSymbol, string> = {
  logo: 'Mi logo',
  initial: 'Inicial',
  dumbbell: 'Mancuerna',
  flame: 'Llama',
  bolt: 'Rayo',
  heart: 'Corazon',
  activity: 'Pulso',
  star: 'Estrella',
}

export const LOADER_ANIMATION_LABELS: Record<LoaderAnimation, string> = {
  pulso: 'Pulso',
  orbita: 'Orbita',
  barra: 'Barra',
  respiracion: 'Respiracion',
}

export function isLoaderSymbol(v: unknown): v is LoaderSymbol {
  return typeof v === 'string' && (LOADER_SYMBOL_KEYS as readonly string[]).includes(v)
}
export function isLoaderAnimation(v: unknown): v is LoaderAnimation {
  return typeof v === 'string' && (LOADER_ANIMATION_KEYS as readonly string[]).includes(v)
}

/**
 * Parsea/valida un `loader_config` crudo (jsonb, objeto JS o string JSON) a un LoaderComposite.
 * Fail-closed: null si el shape no es estricto → el caller cae a `loader_variant`. Nunca lanza.
 */
export function parseLoaderConfig(raw: unknown): LoaderComposite | null {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      obj = JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const rec = obj as Record<string, unknown>
  if (!isLoaderSymbol(rec.symbol) || !isLoaderAnimation(rec.animation)) return null

  const out: LoaderComposite = { symbol: rec.symbol, animation: rec.animation }
  if (typeof rec.text === 'string') {
    const text = rec.text.trim().slice(0, LOADER_TEXT_MAX)
    if (text) out.text = text
  }
  return out
}

/** Serializa un LoaderComposite a string JSON estable ('' si null). */
export function serializeLoaderConfig(config: LoaderComposite | null): string {
  if (!config) return ''
  const clean: LoaderComposite = { symbol: config.symbol, animation: config.animation }
  if (config.text) {
    const t = config.text.trim().slice(0, LOADER_TEXT_MAX)
    if (t) clean.text = t
  }
  return JSON.stringify(clean)
}
