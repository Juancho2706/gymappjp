/**
 * Clasificación del resultado de la carga del plan del ejecutor (Sentry EVA-MOBILE-9).
 *
 * Por qué existe: con supabase-js 2.x un fallo de RED en `maybeSingle()` NO lanza — resuelve
 * `{ data: null, error: { message: 'TypeError: Failed to fetch' | 'Network request failed' … }, status: 0 }`.
 * Un 4xx/RLS también resuelve `{ data: null, error, status: 4xx }`, y un plan inexistente resuelve
 * `{ data: null, error: null }`. Los tres caían en el mismo `if (!data)`, así que el alumno sin señal
 * veía la pantalla MENTIROSA «Rutina sin ejercicios · tu coach probablemente esté actualizando tu
 * plan» (o el spinner eterno, si algo lanzaba antes). Separar los casos es lo que permite ofrecer
 * «Reintentar» en vez de un diagnóstico falso.
 *
 * Módulo PURO y sin dependencias a propósito (mismo patrón que `coach-nutrition-detail-phase.ts`): se
 * testea desde `tests/` sin arrastrar react-native, NetInfo ni el cliente de Supabase.
 */

/** Veredicto de una carga del plan. `empty` es el vacío REAL (plan sin ejercicios), no un fallo. */
export type PlanLoadOutcome = 'ok' | 'empty' | 'offline' | 'error'

export interface PlanLoadInput {
  /** Excepción capturada (p. ej. `getClientProfile()` lanzando). */
  thrown?: unknown
  /** `error` del resultado de PostgREST. */
  error?: { message?: string; code?: string } | null
  /** `status` del resultado de PostgREST. 0 = el fetch nunca llegó a la red. */
  status?: number
  /** `data` del resultado de PostgREST. */
  data?: unknown
}

/**
 * Marcas de un fallo de TRANSPORTE. Deliberadamente por texto: ni RN ni el navegador exponen un
 * código estable para "el fetch no salió", y el `status: 0` de PostgREST no viaja cuando el error
 * llega como excepción.
 */
const NETWORK_MARKERS = [
  'failed to fetch',
  'network request failed',
  'network',
  'timeout',
  'timed out',
  'load failed',
] as const

/** ¿El texto de este error habla de transporte caído (y no de permisos/validación/servidor)? */
export function isNetworkFailureMessage(value: unknown): boolean {
  const message =
    typeof value === 'string'
      ? value
      : typeof (value as { message?: unknown } | null)?.message === 'string'
        ? ((value as { message: string }).message)
        : ''
  if (!message) return false
  const lower = message.toLowerCase()
  return NETWORK_MARKERS.some((marker) => lower.includes(marker))
}

/**
 * Veredicto de la carga del plan. El orden importa: una excepción manda sobre todo, después el
 * `error` de PostgREST, y recién con ambos limpios se mira si hubo o no fila.
 *
 * OJO: esto clasifica por la FORMA del fallo, que es una pista, no la verdad. La verdad de "hay red
 * o no" la da NetInfo (`checkOnline`), y el hook la consulta encima de este veredicto — mismo
 * criterio que el guardado de series, donde un error no-de-red con conexión plena NO es offline.
 */
export function classifyPlanLoad(input: PlanLoadInput): PlanLoadOutcome {
  if (input.thrown !== undefined) {
    return isNetworkFailureMessage(input.thrown) ? 'offline' : 'error'
  }
  if (input.error) {
    if (input.status === 0 || isNetworkFailureMessage(input.error)) return 'offline'
    return 'error'
  }
  // Sin `error` pero sin llegar a la red: el fetch se cortó antes de tener respuesta.
  if (input.status === 0) return 'offline'
  if (input.data == null) return 'empty'
  return 'ok'
}
