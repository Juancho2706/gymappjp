/**
 * NutritionV2Summary — tab Nutrición V2 embebido en la ficha del alumno del coach. Poda ola 3
 * (SPEC punto 6): deja de ser el clon degradado de la ficha completa (A) — "Plan vigente", "Hoy"
 * y "Últimos días" ya viven ahí, a un tap por `detailHref`. Este tab pasa a ser SOLO una card de
 * vistazo: estrategia + semana en puntos + energía de hoy + racha, y los dos CTAs de siempre
 * (abrir ficha / crear-versionar plan).
 *
 * Gating (paralelo del server-resolve web `resolveNutritionTabV2`, clients/[clientId]/page.tsx:240):
 * cuando el flag/canary `nutritionV2Coach` está ON Y el fetch del read model responde,
 * `NutricionTab` renderiza este tab; ante flag OFF o CUALQUIER fallo cae al tab V1 exactamente
 * igual (fail-open, cero regresión) — el mismo `null ⇒ NutritionTabB5` del web.
 *
 * Adaptaciones nativas (documentadas en verify-fix/ficha-nutricion-v2.md):
 *  - `PendingNavLink` (spinner "Abriendo ficha…") es un fix de latencia RSC del web; en RN la
 *    navegación es inmediata y el destino trae su propio skeleton, así que no se replica.
 *  - Aviso "Mostrando la última copia disponible." cuando el detail proviene de cache stale
 *    (no existe en web: RSC no tiene cache offline).
 */
import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowUpRight, Plus } from 'lucide-react-native'
import {
  MacroBudget,
  NutritionCard,
  NutritionStatePanel,
  StrategyBadge,
} from '../../../nutrition-v2'
import {
  buildNutritionWeek,
  NutritionClientDetailReadModelSchema,
  type NutritionClientDetailReadModel,
  type NutritionWeekCell,
} from '@eva/nutrition-v2'
import { isEnabled } from '../../../../lib/flags'
import { useEntitlements, useNutritionV2CoachFlagForClientState } from '../../../../lib/entitlements'
import { useWorkspace } from '../../../../lib/workspace'
import {
  getNutritionClientDetailV2,
  nutritionV2CoachScope,
  nutritionV2CoachScopeCacheKey,
} from '../../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../../lib/nutrition-v2-cache'
import {
  NUTRITION_PRO_MODULE_KEY,
  filterHistoryDaysToBaseWindow,
} from '../../../../lib/nutrition-v2-pro'
import { supabase } from '../../../../lib/supabase'
import { buildNutritionTabV2ViewModel } from '../../../../lib/coach-nutrition-v2-tab-logic'
import { themeLucideIcons } from '../../../../lib/themed-lucide'

// QA2 A1: `className` en un icono lucide solo pinta si el componente está registrado en
// nativewind (RN no tiene `currentColor`); sin esto el glyph cae al negro por defecto.
themeLucideIcons(ArrowUpRight, Plus)

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export type CoachNutritionV2Gate = {
  enabled: boolean
  detail: NutritionClientDetailReadModel | null
  offline: boolean
  active: boolean
  /**
   * QA2 A3: `true` mientras TODAVÍA no se sabe qué versión corresponde (entitlements,
   * canary por alumno, sesión, workspace o el fetch del read model sin resolver). El caller
   * debe pintar un skeleton: renderizar V1 en esta ventana es lo que producía el flash
   * "sale la versión antigua y luego la actual" al abrir el tab.
   */
  resolving: boolean
}

export function useCoachNutritionV2Detail(clientId: string): CoachNutritionV2Gate {
  const entitlements = useEntitlements()
  const {
    ready: workspaceReady,
    kind: workspaceKind,
    teamId: workspaceTeamId,
    orgId: workspaceOrgId,
  } = useWorkspace()
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionResolved, setSessionResolved] = useState(false)
  const [detail, setDetail] = useState<NutritionClientDetailReadModel | null>(null)
  const [offline, setOffline] = useState(false)
  /** `false` mientras el fetch/lectura de cache del read model está en vuelo. */
  const [detailSettled, setDetailSettled] = useState(false)
  const date = useMemo(todayInSantiago, [])

  const scope = useMemo(
    () =>
      workspaceReady
        ? nutritionV2CoachScope({ kind: workspaceKind, teamId: workspaceTeamId, orgId: workspaceOrgId })
        : null,
    [workspaceReady, workspaceKind, workspaceTeamId, workspaceOrgId],
  )
  const scopeCacheKey = scope ? nutritionV2CoachScopeCacheKey(scope) : null
  // Canary por alumno: el resumen V2 aparece en la ficha aunque el flag global del coach esté apagado;
  // el flag global sigue prendiendo V2 por sí solo (OR) sin esperar esta consulta.
  const { value: clientCanaryV2, resolved: canaryResolved } = useNutritionV2CoachFlagForClientState(clientId)
  const globalFlagV2 = entitlements.ready && isEnabled('nutritionV2Coach')
  const enabled = entitlements.ready && (globalFlagV2 || clientCanaryV2)

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(
      ({ data }) => { if (active) { setUserId(data.session?.user.id ?? null); setSessionResolved(true) } },
      () => { if (active) setSessionResolved(true) },
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || !userId || !clientId || !scope || !scopeCacheKey) return

    const detailScopeKey = `${scopeCacheKey}:${date}`
    const controller = new AbortController()
    let active = true
    let hasCopy = false
    setDetailSettled(false)

    void (async () => {
      const cached = await readNutritionV2Cache({
        userId,
        clientId,
        kind: 'clientDetail',
        scopeKey: detailScopeKey,
        schema: NutritionClientDetailReadModelSchema,
        allowStale: true,
      })
      if (active && cached) {
        hasCopy = true
        setDetail(cached.payload)
        setOffline(cached.stale)
      }

      try {
        const fresh = await getNutritionClientDetailV2({
          clientId,
          scope,
          date,
          signal: controller.signal,
        })
        if (!active) return
        setDetail(fresh)
        setOffline(false)
        await writeNutritionV2Cache({
          userId,
          clientId,
          kind: 'clientDetail',
          scopeKey: detailScopeKey,
          payload: fresh,
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Fail-open: sin copia previa el detail sigue null y el caller renderiza V1.
        if (active && hasCopy) setOffline(true)
      } finally {
        // Settled = ya se sabe si hay V2 o hay que caer a V1 (éxito, cache o fallo).
        if (active) setDetailSettled(true)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [clientId, date, enabled, userId, scope, scopeCacheKey])

  // ¿Aún no se sabe qué versión toca? Todas las señales que pueden FLIPEAR la decisión:
  //  - entitlements sin asentar (el flag global aún no se conoce),
  //  - canary por alumno en vuelo (puede prender V2 con el flag global apagado),
  //  - sesión/workspace sin resolver (el fetch del read model no arranca sin ellos),
  //  - fetch del read model en vuelo.
  // El global ON corta el suspenso del canary: V2 ya está decidido, solo falta el detail.
  //
  // IMPORTANTE: cada término se apoya en señales que SIEMPRE asientan, para que un fallo no
  // deje el skeleton colgado. Por eso se usa "asentado" (`ready || !loading`) y no `ready`:
  // sin cache en disco y con la red caída, `ready` se queda en false para siempre mientras
  // `loading` sí baja ⇒ con `ready` el tab habría quedado en skeleton eterno. Y el fetch solo
  // cuenta como pendiente cuando sus prerequisitos (userId, scope) EXISTEN; si resolvieron a
  // null el read model no se va a pedir nunca y corresponde caer a V1 (fail-open).
  const entitlementsSettled = entitlements.ready || !entitlements.loading
  const gateUndecided = !entitlementsSettled || (!globalFlagV2 && !canaryResolved)
  const prereqsPending = enabled && (!sessionResolved || !workspaceReady)
  const fetchPending = enabled && userId != null && scope != null && !detailSettled
  const resolving = detail == null && (gateUndecided || prereqsPending || fetchPending)

  return { enabled, detail, offline, active: enabled && detail != null, resolving }
}

/** CTA sólida ember del tab (web NutritionTabV2.tsx:91,109: bg-ember-500 hover:bg-ember-600). */
function EmberCta({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string
  accessibilityLabel: string
  onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
      {({ pressed }) => (
        <View
          className={cx(
            'min-h-11 flex-row items-center justify-center gap-2 rounded-control px-4',
            pressed ? 'bg-ember-600' : 'bg-ember-500',
          )}
        >
          <Plus size={16} className="text-white" />
          <Text className="text-sm font-semibold text-white">{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

/**
 * Celda de la semana con los tipos REALES del read model del coach (mismo patrón que
 * `CoachWeekCell` de la ficha completa `coach/nutrition-v2/[clientId].tsx`): así el punto de la
 * tira no castea nada.
 */
type SummaryWeekCell = NutritionWeekCell<
  NutritionClientDetailReadModel['plan']['dayVariants'][number],
  NutritionClientDetailReadModel['recentDays'][number]
>

/**
 * ¿El día tiene registro? Espejo deliberado del mismo helper en `WeekDayNav.tsx` (documentado ahí
 * como "vive en cada gemelo": es regla de PRESENTACIÓN del punto, no de datos, y cada superficie
 * la repite en vez de acoplarse a un componente compartido).
 */
function hasLoggedIntake(cell: SummaryWeekCell): boolean {
  if (cell.state === 'future') return false
  if (cell.state === 'past-logged') return true
  if (cell.isLegacy === true) return true
  const consumed = cell.consumed
  if (consumed == null) return false
  return consumed.entryCount > 0 || consumed.calories > 0
}

/** Racha de días consecutivos con registro terminando en el día más reciente con datos. */
function computeWeekStreak(cells: readonly SummaryWeekCell[]): number {
  let streak = 0
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const cell = cells[index]
    if (cell.state === 'future') continue
    if (!hasLoggedIntake(cell)) break
    streak += 1
  }
  return streak
}

/**
 * Tira compacta de 7 puntos (semana Lu-Do): verde = con registro, tenue = pasado sin registro,
 * hueco = futuro. Presentacional puro, NO navegable (a diferencia de `WeekDayNav` de la ficha
 * completa): esta card es un vistazo, el detalle por día vive a un tap en `detailHref`.
 */
function WeekGlanceDots({ cells }: { cells: readonly SummaryWeekCell[] }) {
  if (cells.length === 0) return null
  const loggedCount = cells.filter(hasLoggedIntake).length
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Semana: ${loggedCount} de 7 días con registro`}
      className="flex-row gap-1.5"
    >
      {cells.map((cell) => {
        const logged = hasLoggedIntake(cell)
        const dotTone = logged
          ? 'bg-success-500'
          : cell.state === 'future'
            ? 'border border-strong'
            : 'bg-ink-300'
        return <View key={cell.isoDate} className={cx('h-2 w-2 rounded-full', dotTone)} />
      })}
    </View>
  )
}

export function NutritionV2Summary({
  detail,
  clientId,
  offline,
}: {
  detail: NutritionClientDetailReadModel
  clientId: string
  offline: boolean
}) {
  const router = useRouter()
  const entitlements = useEntitlements()
  const hasNutritionPro = entitlements.hasModule(NUTRITION_PRO_MODULE_KEY)
  const date = useMemo(todayInSantiago, [])

  // Espejo del server web: recorta el historial a la ventana base (~30d) sin addon Pro
  // (clients/[clientId]/page.tsx:273-275) y luego proyecta con el mapper puro compartido.
  const view = useMemo(
    () =>
      buildNutritionTabV2ViewModel({
        clientId,
        detail,
        nutritionProEnabled: hasNutritionPro,
        recentDaysForDisplay: hasNutritionPro
          ? detail.recentDays
          : filterHistoryDaysToBaseWindow(detail.recentDays, date),
      }),
    [clientId, detail, hasNutritionPro, date],
  )

  const openDetail = () => router.push(view.detailHref)
  const openBuilder = () => router.push(view.builderHref)

  // Semana Lu-Do de vistazo (mismo mecanismo que la ficha completa: `plan.dayVariants` + el
  // historial disperso ya descargado, CERO fetch nuevo y cero `get_nutrition_today_v2` con otra
  // fecha). `detail.recentDays` alcanza siempre para componer 7 días, con o sin addon Pro.
  const weekCells = useMemo<SummaryWeekCell[]>(
    () =>
      buildNutritionWeek({
        variants: detail.plan.dayVariants,
        history: detail.recentDays,
        weekStartIso: date,
        todayIso: date,
      }),
    [date, detail],
  )
  const loggedDaysCount = useMemo(() => weekCells.filter(hasLoggedIntake).length, [weekCells])
  const weekStreak = useMemo(() => computeWeekStreak(weekCells), [weekCells])

  return (
    <View className="min-w-0 gap-6">
      {offline ? (
        <Text className="text-xs text-muted">Mostrando la última copia disponible.</Text>
      ) : null}

      {/* Header: eyebrow + título + acciones (web NutritionTabV2.tsx:71-98; en móvil el
          sm:flex-row no aplica → columna con las acciones en fila envolvente). */}
      <View className="gap-3">
        <View className="min-w-0">
          <Text className="font-sans-extra text-[10px] uppercase tracking-[1px] text-muted">
            Nutrición · V2
          </Text>
          <Text className="mt-1 font-display text-xl font-bold text-strong">
            Ficha nutricional
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir ficha nutrición completa"
            onPress={openDetail}
          >
            {({ pressed }) => (
              <View
                className={cx(
                  'min-h-11 flex-row items-center gap-2 rounded-control border border-default px-3',
                  pressed ? 'bg-surface-sunken' : 'bg-surface-card',
                )}
              >
                <Text className="text-sm font-semibold text-strong">
                  Abrir ficha nutrición completa
                </Text>
                <ArrowUpRight size={16} className="text-strong" />
              </View>
            )}
          </Pressable>
          <EmberCta
            label={view.builderCtaLabel}
            accessibilityLabel={view.builderCtaLabel}
            onPress={openBuilder}
          />
        </View>
      </View>

      {!view.hasActivePlan ? (
        <NutritionStatePanel
          icon="empty"
          title="Sin plan V2 vigente"
          description="Este alumno todavía no tiene una versión publicada de su plan de nutrición. Crea la primera para ver metas, franjas y adherencia."
          action={<EmberCta label="Crear plan" accessibilityLabel="Crear plan" onPress={openBuilder} />}
        />
      ) : (
        // Card única de vistazo (SPEC punto 6 / mockup "Tab del menu de alumnos — resumen, no
        // clon"): estrategia + semana en puntos + energía de hoy + racha. El detalle completo
        // (plan vigente, franjas, historial) vive en la ficha a un tap por el CTA de arriba —
        // ya no se clona acá.
        <NutritionCard>
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="font-display text-base font-semibold text-strong">Esta semana</Text>
            {view.plan ? <StrategyBadge compact strategy={view.plan.strategy} /> : null}
          </View>

          <View className="mt-3">
            <WeekGlanceDots cells={weekCells} />
          </View>

          <View className="mt-4">
            <MacroBudget calories={view.today.calories} macros={view.today.macros} />
          </View>

          <Text className="mt-3 text-sm text-muted" style={{ fontVariant: ['tabular-nums'] }}>
            {loggedDaysCount} de 7 días con registro · racha {weekStreak}
          </Text>
        </NutritionCard>
      )}
    </View>
  )
}
