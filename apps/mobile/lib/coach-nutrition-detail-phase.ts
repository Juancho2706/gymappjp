/**
 * Máquina de estados de apertura de la ficha de nutrición del coach (QA4 · H3).
 *
 * Principio rector: **el error solo existe si un fetch falló de verdad**. Que falte un
 * prerrequisito (sesión, canary por alumno, workspace) es *cargando*, no *error*. Antes de esta
 * pieza la pantalla apagaba `loading` dentro del early-return del efecto de carga, así que el
 * primer commit tras montar caía en el panel ámbar "No pudimos abrir la ficha" con red perfecta
 * (y se quedaba ahí durante todo el ciclo getSession -> cache -> fetch).
 *
 * Módulo PURO y sin dependencias a propósito: se testea desde `tests/` sin arrastrar react-native,
 * Sentry ni el cliente de Supabase.
 */

/** Fase de render de la ficha. `resolving`/`loading` JAMÁS pueden pintar un panel de error. */
export type DetailPhase = 'resolving' | 'loading' | 'blocked' | 'ready' | 'failed'

/**
 * Causa real del fallo. `workspace` no viene de un fetch de la ficha: lo produce un store que dejó
 * de estar cargando sin llegar a `ready` (ver `gatesStalled`), y existe para no colgar la pantalla
 * en un loader infinito.
 */
export type DetailErrorKind = 'network' | 'permission' | 'server' | 'contract' | 'session' | 'workspace'

export interface DetailPhaseInput {
  /** Todos los prerrequisitos resolvieron (entitlements + workspace + rollout + sesión). */
  gatesResolved: boolean
  /**
   * Un store dejó de estar `loading` SIN llegar a `ready` (caso real: `workspace.ts` deja
   * `ready:false` para siempre si no hay cache en disco y el refresh falla). Sin esto, el fix
   * convertiría el panel ámbar en un loader eterno.
   */
  gatesStalled: boolean
  /** Veredicto REAL de rollout/params (solo se mira con los gates ya resueltos). */
  enabled: boolean
  hasDetail: boolean
  errorKind: DetailErrorKind | null
}

export function resolveDetailPhase(input: DetailPhaseInput): DetailPhase {
  // La data manda sobre todo lo demás: un refresco fallido NO tumba una ficha ya en pantalla.
  if (input.hasDetail) return 'ready'
  if (input.errorKind != null) return 'failed'
  if (input.gatesStalled) return 'failed'
  if (!input.gatesResolved) return 'resolving'
  if (!input.enabled) return 'blocked'
  return 'loading'
}

/** Kind efectivo para elegir el copy del panel `failed`. */
export function resolveDetailErrorKind(input: {
  errorKind: DetailErrorKind | null
  gatesStalled: boolean
}): DetailErrorKind {
  if (input.errorKind != null) return input.errorKind
  return 'workspace'
}

/**
 * Un fallo de red NO es lo mismo que un 403 de scope ni que un contrato roto.
 *
 * Se clasifica por forma (`name` + `status`) y no con `instanceof`: el `ZodError` puede venir de
 * otra instancia de zod (paquete del monorepo vs app) y el `instanceof` cross-realm da false.
 */
export function classifyDetailError(error: unknown): DetailErrorKind {
  const name = (error as { name?: unknown } | null)?.name
  const status = (error as { status?: unknown } | null)?.status

  if (name === 'ApiError' && typeof status === 'number') {
    if (status === 401) return 'session'
    if (status === 403 || status === 404) return 'permission'
    return 'server'
  }
  // ZodError: contrato roto entre un binario viejo y una API nueva (riesgo vivo con OTA).
  if (name === 'ZodError' || Array.isArray((error as { issues?: unknown } | null)?.issues)) {
    return 'contract'
  }
  return 'network'
}

export interface DetailErrorCopy {
  icon: 'offline' | 'error' | 'permission'
  title: string
  description: string
}

/** Iconos existentes de `NutritionStatePanel` (`components/nutrition-v2/NutritionV2Kit.tsx`). */
export const DETAIL_ERROR_COPY: Record<DetailErrorKind, DetailErrorCopy> = {
  network: {
    icon: 'offline',
    title: 'Sin conexión',
    description:
      'No pudimos contactar al servidor y no hay una copia local de esta ficha. Reintenta cuando vuelvas a tener señal.',
  },
  permission: {
    icon: 'permission',
    title: 'Esta ficha no está disponible',
    description:
      'El alumno no pertenece al espacio de trabajo activo. Cambia de espacio o vuelve al Centro de Nutrición.',
  },
  server: {
    icon: 'error',
    title: 'No pudimos abrir la ficha',
    description: 'Algo falló de nuestro lado. Reintenta en unos segundos.',
  },
  contract: {
    icon: 'error',
    title: 'Actualiza la aplicación',
    description:
      'Esta versión no entiende los datos de la ficha. Cierra y vuelve a abrir; si sigue, actualiza desde la tienda.',
  },
  session: {
    icon: 'permission',
    title: 'Tu sesión expiró',
    description: 'Vuelve a iniciar sesión para abrir la ficha.',
  },
  workspace: {
    icon: 'error',
    title: 'No pudimos preparar tu espacio',
    description: 'No logramos cargar tu configuración de coach. Reintenta en unos segundos.',
  },
}
