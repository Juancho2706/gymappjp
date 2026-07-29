/**
 * Historial de la SEMANA visible del alumno (week view) — una sola página del historial que
 * cubre los 7 días Lu-Do y alimenta `buildNutritionWeek`.
 *
 * Por qué existe (reglas de datos de `docs/specs/nutrition-week-view/SPEC.md`):
 *  - **PROHIBIDO** pedir `view=today` con una fecha distinta de hoy: `get_nutrition_today_v2` es
 *    `volatile`, llama `ensure_day_snapshot` (materializa filas create-once) y revienta con fecha
 *    > hoy+1 (`nutrition_v2_snapshot_date_out_of_window`). Pintar la semana JAMÁS debe escribir.
 *  - El consumo de los días pasados sale del historial, que ya existe y ya está cacheado por kind.
 *  - La lista del historial es DISPERSA: solo aparecen fechas con snapshot, con intake V2 o con
 *    log del sistema anterior. Los huecos los rellena `buildNutritionWeek` client-side.
 *
 * Cursor: `get_nutrition_history_page_v2` pagina hacia atrás con `p_before` EXCLUSIVO y sin cota
 * inferior. Pedir `before = domingo + 1` con `pageSize = 7` garantiza traer TODAS las filas de la
 * semana (cualquier día de la semana pedida es más reciente que cualquier día anterior), y las
 * filas de semanas vecinas que puedan colarse simplemente no se usan.
 *
 * Cache: kind `history` ya existente (TTL 30 min), con scope propio por semana para no pisar la
 * primera página del tab Historial. Si la entrada está FRESCA no se vuelve a pedir por red: entrar
 * y salir de los tabs (que remontan) no debe costar un fetch nuevo cada vez.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  NutritionHistoryPageReadModelSchema,
  addNutritionDays,
  type NutritionHistoryDay,
} from '@eva/nutrition-v2'
import { readNutritionV2Cache, writeNutritionV2Cache } from '../../../lib/nutrition-v2-cache'
import { getNutritionHistoryV2 } from '../../../lib/nutrition-v2.api'

/** 7 días Lu-Do: una sola página cubre la semana completa (ver nota del cursor arriba). */
const WEEK_PAGE_SIZE = 7

/** Referencia ESTABLE para el caso sin datos: `[]` inline reencadenaría los memos que la consumen. */
const EMPTY_DAYS: NutritionHistoryDay[] = []

export type NutritionWeekHistory = {
  /** Filas del historial que cubren la semana (dispersas: puede haber menos de 7). */
  days: readonly NutritionHistoryDay[]
  /**
   * `false` mientras no sabemos si el día tiene registro (sesión o lectura en curso). Sin esto,
   * un día pasado mostraría "Sin registros" durante el primer frame — una mentira, porque
   * "sin registro" y "todavía no sé" son estados distintos.
   */
  ready: boolean
}

export function useNutritionWeekHistory(input: {
  userId: string | null
  /** Lunes `YYYY-MM-DD` de la semana visible. `null` ⇒ no se pide nada. */
  weekStartIso: string | null
  /** Gate de la superficie (flag + entitlements). `false` ⇒ no se pide nada. */
  enabled?: boolean
}): NutritionWeekHistory {
  const { userId, weekStartIso, enabled = true } = input
  const [state, setState] = useState<NutritionWeekHistory>({ days: EMPTY_DAYS, ready: false })

  const mountedRef = useRef(true)
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  const load = useCallback(
    async (force: boolean) => {
      if (!userId || !weekStartIso || !enabled) return
      const before = addNutritionDays(weekStartIso, WEEK_PAGE_SIZE)
      if (!before) return
      const scopeKey = `week:${weekStartIso}`

      if (!force) {
        const cached = await readNutritionV2Cache({
          userId,
          clientId: userId,
          kind: 'history',
          scopeKey,
          schema: NutritionHistoryPageReadModelSchema,
          allowStale: true,
        })
        if (!mountedRef.current) return
        if (cached) {
          setState({ days: cached.payload.items, ready: true })
          // Entrada fresca (TTL 30 min): la semana ya está pintada con datos válidos y cambiar de
          // tab no debe recargar más de lo que ya recarga.
          if (!cached.stale) return
        }
      }

      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      try {
        const page = await getNutritionHistoryV2({
          before,
          pageSize: WEEK_PAGE_SIZE,
          signal: controller.signal,
        })
        if (!mountedRef.current) return
        setState({ days: page.items, ready: true })
        await writeNutritionV2Cache({ userId, clientId: userId, kind: 'history', scopeKey, payload: page })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Sin historial la semana igual se pinta (plan proyectado); lo que no se puede es
        // afirmar "sin registro" sobre un día que no pudimos leer.
        if (mountedRef.current) setState((current) => ({ days: current.days, ready: current.days.length > 0 }))
      }
    },
    [enabled, userId, weekStartIso],
  )

  useEffect(() => {
    if (!userId || !weekStartIso || !enabled) {
      setState((current) => (current.days === EMPTY_DAYS && !current.ready ? current : { days: EMPTY_DAYS, ready: false }))
      return
    }
    // Semana nueva ⇒ estado limpio: los días de la semana anterior no describen a esta.
    setState({ days: EMPTY_DAYS, ready: false })
    void load(false)
  }, [enabled, load, userId, weekStartIso])

  return state
}
