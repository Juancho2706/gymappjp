// DB-compat: el APK puede pegar a una prod STANDALONE (sin columnas v2/enterprise
// como org_id, reviewed_at) o, en el futuro, a la DB local/enterprise (que SÍ las
// tiene). Para correr en ambas sin tocar la BD: lecturas con fallback (intento rico
// con columnas enterprise → si falta una, reintento mínimo) + inserts condicionales.

export interface QueryResult<T> {
  data: T | null
  error: { code?: string; message?: string } | null
}

/** True si el error de PostgREST/Supabase es por columna/relación inexistente. */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  const code = e.code ?? ''
  const msg = (e.message ?? '').toLowerCase()
  return (
    code === 'PGRST204' || // PostgREST: column not found in schema cache
    code === '42703' || // postgres: undefined_column
    code === 'PGRST200' || // relación embebida inexistente
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find')
  )
}

/**
 * Intenta el query rico (con columnas enterprise). Si falla por columna faltante,
 * reintenta el mínimo. `rich`/`minimal` devuelven un query builder de Supabase
 * (thenable) — se construyen frescos en cada llamada.
 */
export async function selectWithFallback<T>(
  rich: () => PromiseLike<QueryResult<T>>,
  minimal: () => PromiseLike<QueryResult<T>>
): Promise<QueryResult<T>> {
  const res = await rich()
  if (res.error && isMissingColumnError(res.error)) {
    return await minimal()
  }
  return res
}

/** Spread helper para inserts: incluye la key solo si el valor no es null/undefined. */
export function optionalCol<T>(key: string, value: T | null | undefined): Record<string, T> {
  return value == null ? {} : { [key]: value }
}
