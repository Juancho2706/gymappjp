import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncStatus = 'loading' | 'error' | 'empty' | 'data'

interface Options<T> {
  /** Decide si la data cargada cuenta como "vacía" (para mostrar EmptyState vs ErrorState). */
  isEmpty?: (data: T) => boolean
}

/**
 * Hook de carga estándar (Ola 0): envuelve un loader async con try/catch y expone
 * {status: loading|error|empty|data}. Resuelve el "loader infinito" (siempre se
 * apaga el loading) y permite distinguir error-de-red de vacío-real con retry.
 */
export function useAsyncData<T>(loader: () => Promise<T>, opts: Options<T> = {}) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // Ref para usar SIEMPRE el loader más reciente sin re-disparar el efecto.
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const d = await loaderRef.current()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load('initial') }, [load])

  const status: AsyncStatus =
    loading && data == null ? 'loading'
      : error && data == null ? 'error'
        : data != null && opts.isEmpty?.(data) ? 'empty'
          : 'data'

  return { data, loading, refreshing, error, status, reload: load, setData }
}
