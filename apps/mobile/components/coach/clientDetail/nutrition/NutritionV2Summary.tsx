/**
 * NutritionV2Summary — tab Nutrición V2 embebido en la ficha del alumno del coach. Poda ola 3
 * (SPEC punto 6): deja de ser el clon degradado de la ficha completa (A) — "Plan vigente", "Hoy"
 * y "Últimos días" ya viven ahí, a un tap por `detailHref`. Este tab pasa a ser SOLO una card de
 * vistazo: estrategia + semana en puntos + energía de hoy + racha, y los dos CTAs de siempre
 * (abrir ficha / crear-versionar plan).
 *
 * Gating: V2 es canónica en standalone y Team. Enterprise conserva su superficie aislada hasta su
 * retiro explícito; un fallo de lectura V2 no vuelve silenciosamente a la UI V1.
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
import { useEntitlements } from '../../../../lib/entitlements'
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
  /** Solo standalone/Team con un identificador válido pueden usar V2. */
  workspaceSupported: boolean
  /** Enterprise conserva la superficie aislada hasta el trabajo de retiro dedicado. */
  legacyWorkspace: boolean
  /**
   * `true` mientras sesión, workspace, entitlements o el fetch V2 no se resuelven. El caller
   * pinta un skeleton para no sustituir una superficie por otra durante la carga.
   */
  resolving: boolean
  retry: () => void
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
  const [retryNonce, setRetryNonce] = useState(0)
  const date = useMemo(todayInSantiago, [])

  const scope = useMemo(
    () =>
      workspaceReady
        ? nutritionV2CoachScope({ kind: workspaceKind, teamId: workspaceTeamId, orgId: workspaceOrgId })
        : null,
    [workspaceReady, workspaceKind, workspaceTeamId, workspaceOrgId],
  )
  const scopeCacheKey = scope ? nutritionV2CoachScopeCacheKey(scope) : null
  const enabled = entitlements.ready && scope !== null

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
        // Sin copia previa el caller muestra un estado V2 recuperable, nunca la UI V1.
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
  }, [clientId, date, enabled, userId, scope, scopeCacheKey, retryNonce])

  // Cada término se apoya en señales que siempre asientan; un fallo de red no deja el skeleton
  // colgado. `ready || !loading` cubre el caso sin cache y con una revalidación fallida.
  const entitlementsSettled = entitlements.ready || !entitlements.loading
  const gateUndecided = !entitlementsSettled
  const prereqsPending = enabled && (!sessionResolved || !workspaceReady)
  const fetchPending = enabled && userId != null && scope != null && !detailSettled
  const resolving = detail == null && (gateUndecided || prereqsPending || fetchPending)

  return {
    enabled,
    detail,
    offline,
    active: enabled && detail != null,
    workspaceSupported: workspaceReady && scope !== null,
    legacyWorkspace: workspaceReady && workspaceKind === 'enterprise',
    resolving,
    retry: () => {
      setDetail(null)
      setOffline(false)
      setDetailSettled(false)
      setRetryNonce((value) => value + 1)
    },
  }
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
  // RETIRO del par viejo (R2): el CTA de crear/editar navega al EDITOR UNICO, ya no al wizard.
  const openEditor = () => router.push(view.editorHref)

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
            onPress={openEditor}
          />
        </View>
      </View>

      {!view.hasActivePlan ? (
        <NutritionStatePanel
          icon="empty"
          title="Sin plan publicado"
          description="Este alumno todavía no tiene un plan de nutrición publicado. Crea la primera para ver metas, franjas y adherencia."
          action={<EmberCta label="Crear plan" accessibilityLabel="Crear plan" onPress={openEditor} />}
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
