import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { MotiView } from 'moti'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { Confetti } from 'react-native-fast-confetti'
import { AlertTriangle, Check, ChevronRight, ClipboardCheck, CloudOff, GitCommit, HeartPulse, Medal, Move, Share2, Watch } from 'lucide-react-native'
import {
  compactDistance,
  formatCardioReps,
  formatClockDuration,
  formatWeightEsCl,
  MUSCLE_REGIONS,
  muscleGroupsToRegionIntensity,
  summarizeSessionByKind,
  sideRepsFromMetadata,
  type CardioItem,
  type MobilityItem,
  type SummaryBlock,
  type SummaryLogLike,
} from '@eva/workout-engine'
import { epleyOneRM } from '../../../../lib/profile-analytics'
import { hexToRgba } from '../../../../lib/theme'
import { FONT } from '../../../../lib/typography'
import { getTodayInSantiago } from '../../../../lib/date-utils'
import type { CheckInReminder } from '../../../../lib/checkin-thresholds'
import { useTheme } from '../../../../context/ThemeContext'
import { MuscleMapSvg } from '../MuscleMapSvg'
import { WeekStreakDots } from './WeekStreakDots'
import { NumberTicker, formatThousandsEsCl } from './NumberTicker'
import type { ExecTheme } from './exec-theme'
import type { WeeklyStreak } from './weekly-streak'
import { buildWorkoutShareData, DEFAULT_SHARE_PRESET_ID, ShareWorkoutCta, WorkoutShareComposer } from '../../share'
import { captureAppEvent } from '../../../../lib/analytics'
import {
  ShareCardDate,
  ShareCardEyebrow,
  ShareCardHero,
  ShareCardPill,
  ShareCardPreview,
  ShareCardTitle,
} from '../../../ShareCard'

// Coreografia en DOS fases (contrato mockup concepto-a-v2 "Final"): primero el clima celebratorio
// (titulo + confeti sutil), luego las stats entran en stagger con los tickers contando. Tras la fase 1
// "Volver al inicio" YA es visible (todo skippable). reduced-motion salta directo a la fase 2 con valores
// directos. El haptic epico NO se dispara aqui: ya lo emitio el host (`cel.celebrate('sesion_completada')`).
const CLIMATE_MS = 1200

/** Slug es-CL para el nombre del PNG del PR (espejo del slugify de WorkoutSummaryOverlay). */
function slugify(s: string): string {
  return (
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'record'
  )
}

function fmtShortDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

interface DetectedPR {
  exerciseName: string
  newWeightKg: number
  prevWeightKg: number
  prevAchievedAt: string | null
  pct: number
  estimated1RM: number
}

/**
 * Log de serie AL FINAL, ensanchado con la `metadata` jsonb del hold por-lado (`{left_sec, right_sec}`).
 * `SummaryLogLike` (motor) la estripa; el host ya la manda intacta en `sessionLogs` (mismo objeto que
 * `logs`), así que sólo la EXPONEMOS al tipo — aditivo (opcional) ⇒ V2 byte-idéntico, sin prop nueva ni
 * cambio en el montaje. La usa la tarjeta "Lo que hiciste" para partir "45s izq · 43s der" en movilidad
 * per_side. El motor queda intocable. Espejo 1:1 de la web.
 */
type FinalLogLike = SummaryLogLike & {
  metadata?: { left_sec?: number | null; right_sec?: number | null } | null
}

type DidType = 'cardio' | 'mobility' | 'roller'
interface DidRow {
  key: string
  type: DidType
  name: string
  /** Dato logueado ya formateado (es-CL) — la columna derecha tabular. */
  data: string
}

/** Minutos compactos para cardio: "12min" (≥60s) o "45s" (sub-minuto, honesto en vez de "0min"). */
function fmtDidDuration(sec: number): string {
  return sec >= 60 ? `${Math.round(sec / 60)}min` : `${Math.round(sec)}s`
}

/** Distancia es-CL: "2,5 km" (≥1000 m, coma decimal, 1 decimal) o "800 m" (<1000 m). */
function fmtDidDistance(m: number): string {
  if (m >= 1000) return `${(Math.round((m / 1000) * 10) / 10).toString().replace('.', ',')} km`
  return `${Math.round(m)} m`
}

/**
 * Cardio → "Xmin · Y,Z km" con "· N bpm" si hubo FC media; sólo lo registrado (fallback: rondas).
 * En las modalidades rep-based (Fase C) el motor entrega además el CONTEO con su unidad, así que la
 * cuerda dice "8min · 420 saltos · 152 bpm" y la escaladora "12min · 45 pisos" en vez de esconder el
 * dato. `repsUnit` sólo viaja cuando la modalidad lo pide ⇒ el resto del resumen queda igual.
 */
function cardioDidData(c: CardioItem): string {
  const parts: string[] = []
  if (c.durationSec != null && c.durationSec > 0) parts.push(fmtDidDuration(c.durationSec))
  if (c.distanceM != null && c.distanceM > 0) parts.push(fmtDidDistance(c.distanceM))
  if (c.repsDone != null && c.repsDone > 0) parts.push(formatCardioReps(c.repsDone, c.repsUnit ?? null))
  if (c.avgHr != null && c.avgHr > 0) parts.push(`${c.avgHr} bpm`)
  if (parts.length === 0) parts.push(`${c.rounds} ${c.rounds === 1 ? 'ronda' : 'rondas'}`)
  return parts.join(' · ')
}

/**
 * Movilidad → holds. Si el bloque es per_side (algún log trae `metadata.left_sec/right_sec`), parte por
 * lado: "45s izq · 43s der" con la SUMA del hold por lado a lo largo de las series (decisión: "lo más
 * honesto" = tiempo total sostenido por lado; en el caso 1-serie coincide con el valor único). Si no es
 * per_side: "N×Ms" cuando el hold es uniforme, o "N series · Ts" (total) cuando varía; "N series" si no
 * se registró hold.
 */
function mobilityDidData(blockLogs: FinalLogLike[]): string {
  const perSide = blockLogs.some((l) => l.metadata && (l.metadata.left_sec != null || l.metadata.right_sec != null))
  if (perSide) {
    let left = 0
    let right = 0
    let hasL = false
    let hasR = false
    for (const l of blockLogs) {
      if (l.metadata?.left_sec != null) { left += l.metadata.left_sec; hasL = true }
      if (l.metadata?.right_sec != null) { right += l.metadata.right_sec; hasR = true }
    }
    const segs: string[] = []
    if (hasL) segs.push(`${left}s izq`)
    if (hasR) segs.push(`${right}s der`)
    if (segs.length > 0) return segs.join(' · ')
  }
  const sets = blockLogs.length
  const holds = blockLogs.map((l) => l.actual_hold_sec).filter((h): h is number => h != null && h > 0)
  if (holds.length === 0) return `${sets} ${sets === 1 ? 'serie' : 'series'}`
  const uniform = holds.length === sets && holds.every((h) => h === holds[0])
  if (uniform) return `${sets}×${holds[0]}s`
  return `${sets} ${sets === 1 ? 'serie' : 'series'} · ${holds.reduce((a, h) => a + h, 0)}s`
}

/** Roller → "N pasadas" (suma de `reps_done`); fallback a series si no se contaron pasadas. */
function rollerDidData(blockLogs: FinalLogLike[]): string {
  const passes = blockLogs.reduce((a, l) => a + (l.reps_done ?? 0), 0)
  if (passes > 0) return `${passes} ${passes === 1 ? 'pasada' : 'pasadas'}`
  const sets = blockLogs.length
  return `${sets} ${sets === 1 ? 'serie' : 'series'}`
}

/**
 * Filas de "Lo que hiciste" en ORDEN DEL PLAN: recorre cardio + movilidad/roller (fuerza excluida: su
 * camino es el mapa pintado) y ordena por índice del bloque. Ejercicios sin registro no entran (el motor
 * ya sólo devuelve bloques con logs). Vacío ⇒ el host cae al mapa gris de fallback.
 */
function buildDidRows(
  cardio: CardioItem[],
  mobility: MobilityItem[],
  blocks: SummaryBlock[],
  logs: FinalLogLike[],
): DidRow[] {
  const order = new Map(blocks.map((b, i) => [b.id, i]))
  const rows: DidRow[] = []
  for (const c of cardio) rows.push({ key: c.blockId, type: 'cardio', name: c.name, data: cardioDidData(c) })
  for (const m of mobility) {
    const blockLogs = logs.filter((l) => l.block_id === m.blockId)
    rows.push({
      key: m.blockId,
      type: m.kind,
      name: m.name,
      data: m.kind === 'roller' ? rollerDidData(blockLogs) : mobilityDidData(blockLogs),
    })
  }
  return rows.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
}

/**
 * Estado de la sincronización de la cola que corre DETRÁS del resumen (decisión CEO 2026-07-25: el
 * resumen se muestra al toque y la cola se drena en background). `idle` = no hay nada encolado ⇒ el chip
 * no se pinta (el camino feliz de RN es instantáneo y no debe llenarse de chrome).
 */
export type FinalSyncState =
  | { status: 'idle'; count?: number }
  | { status: 'syncing'; count: number }
  | { status: 'done'; count?: number }
  | { status: 'pending'; count: number }
  /**
   * Series DESCARTADAS por el flush (FK 23503: el bloque ya no existe tras un reseed del plan). No es
   * "pendiente": son series entrenadas que NO van a subir nunca. Manda sobre cualquier otro estado —
   * jamás puede quedar un 'done' verde encima de una pérdida de datos.
   */
  | { status: 'discarded'; count: number }

export interface SessionCompleteV3Props {
  visible: boolean
  exec: ExecTheme
  reducedMotion: boolean
  /** Titulo celebratorio corto: "Día 3" o el nombre del plan → "¡{completionLabel} completo!". */
  completionLabel: string
  planTitle: string
  /** Subtitulo de contexto ("Empuje · Semana 2 · Fase Fuerza"), null si no hay contexto. */
  contextLine: string | null
  blocks: SummaryBlock[]
  /** Logs de la sesión. El host manda `sessionLogs` con la `metadata` per_side intacta (ver `FinalLogLike`). */
  logs: FinalLogLike[]
  exerciseMaxes: Record<string, number>
  exerciseMaxDates?: Record<string, string>
  durationSec?: number
  substitutedBlockIds?: string[]
  /** Racha semanal derivada (E4.4); null = no derivable (offline) → se oculta. */
  weeklyStreak: WeeklyStreak | null
  /**
   * `clients.id` del alumno (Share Entreno F8): semilla del `?ref=` de atribución del card. Lo sabe
   * el host (`useWorkoutSession`), no esta pantalla. `null` (offline / cliente sin resolver) ⇒ el
   * link del card sale limpio y el resto de la feature funciona igual.
   */
  clientId?: string | null
  /** Recordatorio de check-in post-entreno (E2-18), null cuando no toca. */
  checkInReminder?: CheckInReminder | null
  checkInLastRelative?: string | null
  /**
   * "Importar de tu reloj" (specs/cardio-conectado F2) — MISMO patrón que `checkInReminder`: la card
   * solo existe si el host manda el callback. Es el host quien sabe si hay agregador de salud en esta
   * build (`isHealthAvailable()`), si la sesión tuvo bloques cardio y si quedaron ejes vacíos; acá no
   * se importa nada nativo. null/ausente ⇒ pantalla byte-idéntica a la previa.
   */
  onImportFromWatch?: (() => void) | null
  /**
   * Hoja del import, montada DENTRO de esta ventana (el resumen es un `<Modal>` y anidar otro Modal
   * deja la pantalla gris en Android al volver de una Activity — mismo motivo que `ShareCardPreview
   * embedded`). El host arma el nodo y lo pasa acá; esta pantalla solo lo ubica.
   */
  watchImportSlot?: React.ReactNode
  /** Sincronización en background de la cola de series (chip discreto bajo el título). */
  syncState?: FinalSyncState
  onCheckIn: () => void
  onDone: () => void
}

/**
 * SessionCompleteV3 (E4.3) — pantalla FINAL del ejecutor V3. EVOLUCION del `WorkoutSummaryOverlay` dentro
 * del contrato visual nuevo (mockup concepto-a-v2 "Final"): reusa la MISMA derivacion de datos del motor
 * (`summarizeSessionByKind`, mapa muscular `MuscleMapSvg`, PRs por `exerciseMaxes`) y la share-card existente
 * (`ShareCardPreview`), reencuadradas en la coreografia de dos fases (clima → stats con tickers). Dark-only
 * via `exec.surface`; el oro del PR es el token universal `exec.pr`.
 *
 * Reemplaza al overlay legacy SOLO bajo V3 (ExecutorV2/Legacy conservan `WorkoutSummaryOverlay`).
 */
export function SessionCompleteV3({
  visible,
  exec,
  reducedMotion,
  completionLabel,
  planTitle,
  contextLine,
  blocks,
  logs,
  exerciseMaxes,
  exerciseMaxDates = {},
  durationSec,
  substitutedBlockIds = [],
  weeklyStreak,
  clientId = null,
  checkInReminder = null,
  checkInLastRelative = null,
  onImportFromWatch = null,
  watchImportSlot = null,
  syncState,
  onCheckIn,
  onDone,
}: SessionCompleteV3Props) {
  const s = exec.surface
  const gold = exec.pr
  // Marca REAL del coach para el card (Share Entreno F8). Sale del contexto y no del `exec` a
  // propósito: `exec.accent` puede ser el verde EVA (executor_theme = 'eva') mientras el card tiene
  // que llevar el color, el nombre, el logo y el @handle del coach. `branding` ya viene resuelto y
  // gateado por tier (ForceScheme del ejecutor lo conserva).
  const { branding } = useTheme()

  const session = useMemo(
    () => summarizeSessionByKind(blocks, logs, substitutedBlockIds),
    [blocks, logs, substitutedBlockIds],
  )

  const detectedPRs = useMemo<DetectedPR[]>(() => {
    return session.strength
      .filter((ex) => {
        const historicMax = exerciseMaxes[ex.exerciseId]
        return historicMax != null && ex.maxWeight > historicMax
      })
      .map((ex) => {
        const setAtMax = ex.sets.reduce((best, cur) => {
          const cw = cur.weight_kg ?? 0
          const bw = best.weight_kg ?? 0
          return cw > bw ? cur : best
        }, ex.sets[0])
        const repsAtMax = setAtMax?.reps_done ?? 1
        const prevKg = exerciseMaxes[ex.exerciseId]!
        const pct = prevKg > 0 ? Math.round(((ex.maxWeight - prevKg) / prevKg) * 1000) / 10 : 100
        return {
          exerciseName: ex.name,
          newWeightKg: ex.maxWeight,
          prevWeightKg: prevKg,
          prevAchievedAt: exerciseMaxDates[ex.exerciseId] ?? null,
          pct,
          estimated1RM: Math.round(epleyOneRM(ex.maxWeight, Math.max(1, repsAtMax)) * 10) / 10,
        }
      })
      .sort((a, b) => b.newWeightKg - a.newWeightKg)
  }, [session.strength, exerciseMaxes, exerciseMaxDates])

  const topPr = detectedPRs[0] ?? null

  const hasMuscleMap = useMemo(() => {
    const intensity = muscleGroupsToRegionIntensity(session.muscleWork)
    return MUSCLE_REGIONS.some((r) => intensity[r] > 0)
  }, [session.muscleWork])

  // "Lo que hiciste" (QA4): en días SIN mapa pintado, listamos los ejercicios NO-fuerza registrados
  // (cardio/movilidad/roller) en orden del plan con su dato logueado — en vez del mapa gris a secas.
  const didRows = useMemo(
    () => buildDidRows(session.cardio, session.mobility, blocks, logs),
    [session.cardio, session.mobility, blocks, logs],
  )

  const completedSets = logs.length
  const plannedSets = useMemo(() => blocks.reduce((n, b) => n + (b.sets || 0), 0), [blocks])
  // Volumen: en fuerza POR LADO suma izq + der (R3/R34, misma fórmula que `session-summary` del motor y
  // que el tonelaje del coach); sin desglose usa `reps_done` como siempre.
  const totalVolume = useMemo(
    () =>
      logs.reduce((acc, l) => {
        const sides = sideRepsFromMetadata(l.metadata)
        return acc + (l.weight_kg || 0) * (sides ? sides.left + sides.right : l.reps_done || 0)
      }, 0),
    [logs],
  )

  // Stat secundario adaptativo: volumen (fuerza) → distancia (cardio) → series (tipado).
  const hasVolume = totalVolume > 0
  const hasDistance = !hasVolume && session.totalCardioDistanceM > 0

  // ── Fases ──
  const [phase, setPhase] = useState<'climate' | 'stats'>(reducedMotion ? 'stats' : 'climate')
  useEffect(() => {
    if (!visible) {
      setPhase(reducedMotion ? 'stats' : 'climate')
      return
    }
    if (reducedMotion) {
      setPhase('stats')
      return
    }
    setPhase('climate')
    const t = setTimeout(() => setPhase('stats'), CLIMATE_MS)
    return () => clearTimeout(t)
  }, [visible, reducedMotion])
  const showStats = phase === 'stats'

  const [composerOpen, setComposerOpen] = useState(false)
  const [prCard, setPrCard] = useState<DetectedPR | null>(null)

  /**
   * Datos del card de compartir (Share Entreno F8.3). Se arma con lo que esta pantalla YA tiene en
   * memoria: cero queries nuevas y cero derivación propia — el adaptador reusa `summarizeSessionByKind`
   * y replica la misma detección de récords de acá arriba, así el card no puede contradecir al resumen.
   *
   * `useMemo` NO es una optimización opcional: el mini del CTA y los seis minis de preset del composer
   * son `ShareCanvas` memoizados por REFERENCIA de `data`; un objeto nuevo por render los repintaría
   * enteros (9 stickers + silueta SVG cada uno) en cada tick de animación de la pantalla.
   */
  const shareData = useMemo(
    () =>
      buildWorkoutShareData({
        blocks,
        logs,
        substitutedBlockIds,
        exerciseMaxes,
        exerciseMaxDates,
        planTitle,
        contextLine,
        durationSec: durationSec ?? null,
        weeklyStreak,
        branding,
        clientId,
        // Mismo día que usa el ejecutor para todo lo demás (check-in, racha): la fecha del card
        // tiene que coincidir con la del entreno que se acaba de guardar.
        todayISO: getTodayInSantiago().iso,
      }),
    [
      blocks,
      logs,
      substitutedBlockIds,
      exerciseMaxes,
      exerciseMaxDates,
      planTitle,
      contextLine,
      durationSec,
      weeklyStreak,
      branding,
      clientId,
    ],
  )

  const brand = exec.accent

  // "Series" es un TILE de la grilla (contrato: 3.er stat, no una fila full-width). Numero en BLANCO
  // (solo el PR va dorado). Se reutiliza como 2.o tile cuando no hay volumen/distancia, o como 3.er
  // tile (fila 2) cuando si los hay.
  const seriesTile = (
    <StatTile label="Series" exec={exec}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <NumberTicker
          value={completedSets}
          format={(n) => String(Math.round(n))}
          play={showStats}
          reduced={reducedMotion}
          style={{ fontFamily: FONT.monoBold, fontSize: 24, color: s.text, fontVariant: ['tabular-nums'] }}
          testID="final-series"
        />
        <Text style={{ fontFamily: FONT.monoBold, fontSize: 16, color: s.textDim }}>/ {plannedSets}</Text>
      </View>
    </StatTile>
  )

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDone} statusBarTranslucent>
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: s.appBgDeep }}>
          {/* Degradado radial calido del contrato (.a2-screen: #1c1c24 → #16161d → #121218). Antes era
              un plano #16161d; ahora reproduce el mismo clima que el resto del ejecutor V3. */}
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="execFinalBg" cx="50%" cy="-8%" r="120%">
                <Stop offset="0%" stopColor="#1c1c24" />
                <Stop offset="42%" stopColor="#16161d" />
                <Stop offset="100%" stopColor="#121218" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#execFinalBg)" />
          </Svg>
          {/* Confeti sutil de cierre (react-native-fast-confetti, ya usado por el resumen legacy). Ligeramente
              mas denso si hubo PRs. reduced-motion ⇒ sin confeti.
              `isInfinite={false}`: la libreria trae `isInfinite` en TRUE por defecto — sin esto el confeti
              se reciclaba PARA SIEMPRE en la pantalla Final (QA device). Una sola pasada y muere; la caida
              se acorta a 3,5s (default 8s) para que la celebracion no tape las estadisticas. */}
          {visible && !reducedMotion ? (
            <Confetti
              autoplay
              isInfinite={false}
              fallDuration={3500}
              fadeOutOnEnd
              count={detectedPRs.length > 0 ? 160 : 90}
              colors={[brand, gold, '#4ADE80', '#38BDF8']}
            />
          ) : null}

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 28, paddingBottom: 16, gap: 22 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Fase 1 — clima: titulo celebratorio + subtitulo. Entra siempre (fade). */}
            <FadeIn play={visible} reduced={reducedMotion} y={14} duration={380} style={{ alignItems: 'center', gap: 6 }}>
              {/* Sin medalla-heroe: el contrato (concepto-a-v2 "Final") solo tiene confeti + titulo. */}
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 28, letterSpacing: -0.6, color: s.text, textAlign: 'center' }}>
                ¡{completionLabel} completo!
              </Text>
              {contextLine ? (
                <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: s.textMuted, textAlign: 'center' }}>{contextLine}</Text>
              ) : null}
              {/* Chip de sincronización (decisión CEO 2026-07-25) — el resumen NO espera a la cola: se
                  abre al toque y acá se cuenta lo que se está subiendo detrás. Discreto por diseño. */}
              <SyncChip state={syncState} exec={exec} />
            </FadeIn>

            {/* Fase 2 — stats con tickers (stagger). Grilla 2 columnas del contrato: Duración + secundario
                (Volumen/Distancia) arriba, Series como tile abajo. Números en BLANCO (solo el PR es dorado). */}
            <FadeIn play={showStats} reduced={reducedMotion} y={12} delay={0} duration={340}>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <StatTile label="Duración" exec={exec}>
                    <NumberTicker
                      value={durationSec ?? 0}
                      format={(n) => formatClockDuration(Math.round(n))}
                      play={showStats}
                      reduced={reducedMotion}
                      style={{ fontFamily: FONT.monoBold, fontSize: 26, color: s.text, fontVariant: ['tabular-nums'] }}
                      testID="final-duration"
                    />
                  </StatTile>
                  {hasVolume || hasDistance ? (
                    <StatTile label={hasVolume ? 'Volumen' : 'Distancia'} exec={exec}>
                      {hasVolume ? (
                        <TickerWithUnit value={totalVolume} unit="kg" format={formatThousandsEsCl} play={showStats} reduced={reducedMotion} brand={s.text} muted={s.textMuted} testID="final-volume" />
                      ) : (
                        <Text style={{ fontFamily: FONT.monoBold, fontSize: 26, color: s.text, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                          {compactDistance(session.totalCardioDistanceM, 'm')}
                        </Text>
                      )}
                    </StatTile>
                  ) : (
                    seriesTile
                  )}
                </View>
                {hasVolume || hasDistance ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {seriesTile}
                    <View style={{ flex: 1 }} />
                  </View>
                ) : null}
              </View>
            </FadeIn>

            {/* PR dorado con medalla (E4.3) — separado, "para que se sienta ganado". */}
            {topPr ? (
              <FadeIn play={showStats} reduced={reducedMotion} y={12} delay={160} duration={360}>
                <Pressable
                  testID="final-pr"
                  onPress={() => setPrCard(topPr)}
                >
                  {/* css-interop descarta `style` cuando es funcion (auditoria a1 §2.1): el chrome dorado
                      vive en esta View interna con `style` estatico. */}
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        borderRadius: 16,
                        borderWidth: 2,
                        borderColor: hexToRgba(gold, 0.5),
                        backgroundColor: hexToRgba(gold, pressed ? 0.24 : 0.14),
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                      }}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: gold }}>
                        <Medal size={20} color="#3a2a06" strokeWidth={2.6} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                          <NumberTicker
                            value={topPr.newWeightKg}
                            format={(n) => formatWeightEsCl(n)}
                            play={showStats}
                            reduced={reducedMotion}
                            delayMs={reducedMotion ? 0 : 160}
                            style={{ fontFamily: FONT.displayBlack, fontSize: 22, color: gold, fontVariant: ['tabular-nums'] }}
                          />
                          <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: hexToRgba(gold, 0.9) }}>kg</Text>
                        </View>
                        <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted }} numberOfLines={1}>
                          PR · {topPr.exerciseName}
                          {detectedPRs.length > 1 ? ` · +${detectedPRs.length - 1} más` : ''}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Share2 size={13} color={hexToRgba(gold, 0.9)} />
                        <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 10, color: hexToRgba(gold, 0.9) }}>Compartir</Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              </FadeIn>
            ) : null}

            {/* Mapa muscular / "Lo que hiciste" (QA4). Tres caminos (espejo 1:1 de la web):
                1) CON fuerza (hasMuscleMap) → mapa PINTADO frente/espalda con leyenda. INTACTO.
                2) SIN fuerza pero con ejercicios tipados (cardio/movilidad/roller) → "Lo que hiciste": una
                   fila por ejercicio registrado, en orden del plan, con su dato logueado (el CEO pidió mostrar
                   los datos ahí en vez del mapa gris a secas).
                3) SIN ningún log tipado (sesión "vacía") → mapa gris de fallback, como antes. */}
            <FadeIn play={showStats} reduced={reducedMotion} y={12} delay={220} duration={360}>
              <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: s.borderSubtle, backgroundColor: s.surfaceSunken, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6 }}>
                {hasMuscleMap ? (
                  <>
                    <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: s.textMuted, marginBottom: 8 }}>
                      Trabajado hoy
                    </Text>
                    <View>
                      <MuscleMapSvg groups={session.muscleWork} reducedMotion={reducedMotion} legendVariant="tiers" showLegend />
                    </View>
                  </>
                ) : didRows.length > 0 ? (
                  <View style={{ paddingBottom: 4 }}>
                    {/* Eyebrow del contrato (10px/800/.1em/#7f7f8c), igual que los labels de las StatTiles. */}
                    <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1.0, textTransform: 'uppercase', color: '#7f7f8c', marginBottom: 6 }}>
                      Lo que hiciste
                    </Text>
                    {didRows.map((row) => (
                      <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                        <DidIcon type={row.type} />
                        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: FONT.uiExtra, fontSize: 13, color: '#d4d4dc' }}>
                          {row.name}
                        </Text>
                        <Text style={{ fontFamily: FONT.uiExtra, fontSize: 13, color: '#ffffff', fontVariant: ['tabular-nums'] }}>
                          {row.data}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <>
                    <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: s.textMuted, marginBottom: 8 }}>
                      Sin trabajo de fuerza hoy
                    </Text>
                    {/* Sin atenuación extra: el neutro del mapa ya es tenue por diseño («Contorno
                        firme» 30-08) — el 0.55 encima lo devolvía a invisible. */}
                    <View>
                      <MuscleMapSvg groups={session.muscleWork} reducedMotion={reducedMotion} legendVariant="tiers" showLegend={false} />
                    </View>
                  </>
                )}
              </View>
            </FadeIn>

            {/* "Importar de tu reloj" (cardio-conectado F2) — entre lo que hiciste y las acciones. Solo
                aparece si el host lo habilita (agregador disponible + cardio con ejes vacíos). */}
            {onImportFromWatch ? (
              <FadeIn play={showStats} reduced={reducedMotion} y={12} delay={260} duration={340}>
                <WatchImportRow onPress={onImportFromWatch} exec={exec} />
              </FadeIn>
            ) : null}

            {/* Racha semanal (E4.4) — dots Lun→Dom + copy neutro. Se auto-oculta si no hay senal. */}
            {weeklyStreak ? (
              <FadeIn play={showStats} reduced={reducedMotion} y={12} delay={280} duration={340}>
                <WeekStreakDots streak={weeklyStreak} exec={exec} compact />
              </FadeIn>
            ) : null}

            {/* Check-in post-entreno (E2-18) — preservado del overlay legacy. */}
            {checkInReminder?.variant ? (
              <FadeIn play={showStats} reduced={reducedMotion} y={12} delay={320} duration={340}>
                <CheckInRow reminder={checkInReminder} lastRelative={checkInLastRelative} onPress={onCheckIn} exec={exec} />
              </FadeIn>
            ) : null}
          </ScrollView>

          {/* Acciones — "Volver al inicio" SIEMPRE visible (skippable). Compartir arriba, ahora como
              CTA protagonista (decisión del owner, SPEC §Decisiones 5). */}
          <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, gap: 10, borderTopWidth: 1, borderTopColor: s.borderSubtle, backgroundColor: s.appBg }}>
            {/* CTA de compartir (Share Entreno F8.2). REEMPLAZA al `JuicyButton` "Compartir logro"
                que abría la share-card estática: mismo lugar, mismo testID y mismo lenguaje juicy,
                pero ahora promete —y muestra— el card real y abre el composer. `play={showStats}`
                lo ancla a la fase 2 del resumen (1200 ms) y él agrega su propia espera ⇒ entra
                ~1,5 s tras el confetti, dentro de la ventana 1,2-1,8 s del SPEC. */}
            <ShareWorkoutCta
              testID="final-share"
              data={shareData}
              accent={exec.accent}
              accentText={exec.accentText}
              reducedMotion={reducedMotion}
              play={showStats}
              onPress={() => {
                // F7.2 — boca del funnel de Compartir Entreno. `card_kind` es el estilo con el que
                // ABRE el composer (siempre el de fábrica); el estilo que el alumno termine eligiendo
                // lo reporta `student_share_style_selected`. Sin datos de salud en las props (21.719):
                // nada de kg, músculos ni ejercicios, solo metadatos de la interacción.
                captureAppEvent('student_share_card_opened', {
                  card_kind: DEFAULT_SHARE_PRESET_ID,
                  surface: 'workout_summary',
                })
                setComposerOpen(true)
              }}
            />
            {/* Secundario con chrome real (.a2-finalsec): 52px, radio 15, #1c1c24 + borde 2px #2f2f3a. */}
            <Pressable
              testID="final-done"
              onPress={onDone}
              accessibilityRole="button"
              accessibilityLabel="Volver al inicio"
            >
              {/* css-interop descarta `style` cuando es funcion (auditoria a1 §2.1): el chrome del
                  secundario vive en esta View interna con `style` estatico. */}
              {({ pressed }) => (
                <View
                  style={{
                    height: 52,
                    borderRadius: 15,
                    backgroundColor: pressed ? '#22222c' : '#1c1c24',
                    borderWidth: 2,
                    borderColor: '#2f2f3a',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: FONT.uiExtra, fontSize: 15, letterSpacing: 0.3, color: '#e8e8ee' }}>Volver al inicio</Text>
                </View>
              )}
            </Pressable>
          </View>
        </SafeAreaView>

        {/* Hoja del import del reloj (cardio-conectado F2): overlay en ESTA ventana, nunca un Modal
            anidado (mismo motivo que la share-card embedded). */}
        {watchImportSlot}

        {/* Composer de Share Entreno (F8.3). Ocupa el lugar de la vieja `ShareCardPreview variant="default"`
            del resumen: aquella era una placa fija de una sola cara, esta es el editor completo (6 presets,
            foto, stickers arrastrables, destinos). `embedded` por el MISMO motivo que la share-card del PR
            de abajo: el resumen ya es un `<Modal>` y anidar otro deja la pantalla gris en Android al volver
            de la Activity de compartir. */}
        <WorkoutShareComposer
          visible={composerOpen}
          onClose={() => setComposerOpen(false)}
          data={shareData}
          embedded
        />

        {/* Share-card branded de un PR — affordance APARTE (se abre desde la banda dorada, comparte UN
            récord y no la sesión). Se conserva tal cual: el CTA nuevo reemplaza la entrada de sesión. */}
        <ShareCardPreview
          visible={prCard != null}
          onClose={() => setPrCard(null)}
          variant="record"
          shareMessage={prCard ? `¡Nuevo récord en ${prCard.exerciseName}! 💪 ${prCard.newWeightKg} kg` : undefined}
          fileName={prCard ? `record-${slugify(prCard.exerciseName)}` : 'eva-record'}
          embedded
        >
          {prCard ? (
            <>
              <ShareCardEyebrow color={brand}>RÉCORD PERSONAL</ShareCardEyebrow>
              <ShareCardTitle>{prCard.exerciseName}</ShareCardTitle>
              <ShareCardHero value={formatWeightEsCl(prCard.newWeightKg)} unit="KG" color={brand} />
              {prCard.prevWeightKg > 0 ? (
                <ShareCardPill tone="success">
                  {formatWeightEsCl(prCard.prevWeightKg)} → {formatWeightEsCl(prCard.newWeightKg)} kg · +{formatWeightEsCl(prCard.pct)}%
                </ShareCardPill>
              ) : (
                <ShareCardPill>Primer récord personal</ShareCardPill>
              )}
              {prCard.prevAchievedAt ? <ShareCardPill>Superaste tus {prCard.prevWeightKg} kg del {fmtShortDate(prCard.prevAchievedAt)}</ShareCardPill> : null}
              <ShareCardDate />
              <ShareCardPill>1RM estimado · {formatWeightEsCl(prCard.estimated1RM)} kg</ShareCardPill>
            </>
          ) : null}
        </ShareCardPreview>
      </SafeAreaProvider>
    </Modal>
  )
}

/**
 * Chip de sincronización en background. Cuatro estados visibles: subiendo (spinner + "Sincronizando N
 * series…"), listo (check verde), quedó algo (nube tachada ámbar + "se sincronizan solas") y DESCARTE
 * (triángulo rojo + el copy de pérdida de datos, espejo literal del toast web de `OfflineWorkoutQueueSync`).
 * `idle` no pinta nada. El descarte NO puede caer al camino verde: son series entrenadas que se perdieron.
 */
function SyncChip({ state, exec }: { state: FinalSyncState | undefined; exec: ExecTheme }) {
  if (!state || state.status === 'idle') return null
  const s = exec.surface
  const syncing = state.status === 'syncing'
  const pending = state.status === 'pending'
  const discarded = state.status === 'discarded'
  const n = state.count ?? 0
  const plural = n !== 1 ? 's' : ''
  const tone = discarded ? '#F04438' : pending ? exec.pr : syncing ? s.textMuted : '#4ADE80'
  const label = discarded
    ? `No pudimos guardar ${n} serie${plural} registrada${plural} sin conexión. Revisa tu entrenamiento.`
    : syncing
      ? `Sincronizando ${n} serie${plural}…`
      : pending
        ? `${n} serie${plural} sin sincronizar · se suben solas`
        : 'Todo sincronizado'
  return (
    <View
      testID="final-sync-chip"
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
        // El copy del descarte es una frase completa: el chip deja de ser píldora de una línea y pasa a
        // caja redondeada que envuelve (14px de radio) para no truncar el aviso.
        borderRadius: discarded ? 14 : 999,
        borderWidth: 1,
        borderColor: hexToRgba(tone, 0.34),
        backgroundColor: hexToRgba(tone, 0.1),
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      {syncing ? (
        // El spinner nativo mide 20dp: se escala para no engordar el chip (mismo alto que los iconos).
        <ActivityIndicator size="small" color={tone} style={{ width: 14, height: 14, transform: [{ scale: 0.7 }] }} />
      ) : discarded ? (
        <AlertTriangle size={13} color={tone} strokeWidth={2.6} />
      ) : pending ? (
        <CloudOff size={13} color={tone} strokeWidth={2.4} />
      ) : (
        <Check size={13} color={tone} strokeWidth={2.8} />
      )}
      <Text
        testID="final-sync-chip-label"
        style={{ flexShrink: 1, fontFamily: FONT.uiBold, fontSize: 11.5, color: tone }}
        numberOfLines={discarded ? 3 : 1}
      >
        {label}
      </Text>
    </View>
  )
}

/** Tile de stat con valor (children = ticker) + label. */
function StatTile({ label, exec, children }: { label: string; exec: ExecTheme; children: React.ReactNode }) {
  const s = exec.surface
  return (
    <View style={{ flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: s.border, backgroundColor: s.surface, paddingHorizontal: 14, paddingVertical: 16, alignItems: 'flex-start' }}>
      {children}
      {/* Label del contrato (.a2-stat .sl): 10px, peso 800, MAYUSCULAS, tracking .08em, #7f7f8c. */}
      <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: '#7f7f8c', marginTop: 8 }}>{label}</Text>
    </View>
  )
}

/** Icono por tipo (16px, gris neutro #8f8f9c) — mismos glifos que el resumen V2 (cardio/movilidad/roller). */
function DidIcon({ type }: { type: DidType }) {
  const color = '#8f8f9c'
  if (type === 'cardio') return <HeartPulse size={16} color={color} />
  if (type === 'roller') return <GitCommit size={16} color={color} />
  return <Move size={16} color={color} />
}

/** Ticker + unidad en una fila baseline (para "4.860 kg"). */
function TickerWithUnit({
  value, unit, format, play, reduced, brand, muted, testID,
}: {
  value: number
  unit: string
  format: (n: number) => string
  play: boolean
  reduced: boolean
  brand: string
  muted: string
  testID?: string
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <NumberTicker value={value} format={format} play={play} reduced={reduced} style={{ fontFamily: FONT.monoBold, fontSize: 26, color: brand, fontVariant: ['tabular-nums'] }} testID={testID} />
      <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: muted }}>{unit}</Text>
    </View>
  )
}

/**
 * Fila "Importar de tu reloj" (cardio-conectado F2) — mismo chrome que la de check-in, acento del
 * ejecutor. Solo se monta si el host mandó el callback (ver `onImportFromWatch`): esta pantalla no
 * consulta el agregador de salud ni conoce los bloques cardio.
 */
function WatchImportRow({ onPress, exec }: { onPress: () => void; exec: ExecTheme }) {
  const s = exec.surface
  const accent = exec.accent
  return (
    <Pressable
      testID="btn-watch-import-open"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Importar el entrenamiento que registró tu reloj"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, borderColor: hexToRgba(accent, 0.34), backgroundColor: hexToRgba(accent, 0.1), paddingHorizontal: 12, paddingVertical: 12 }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: accent }}>
        <Watch size={18} color={exec.accentText} strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: accent }} numberOfLines={1}>Importar de tu reloj</Text>
        <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: s.textMuted }} numberOfLines={2}>
          Completa lo que dejaste en blanco del cardio
        </Text>
      </View>
      <ChevronRight size={18} color={accent} />
    </Pressable>
  )
}

/** Fila compacta de check-in (E2-18) sobre el canvas exec — variant-aware. */
function CheckInRow({
  reminder, lastRelative, onPress, exec,
}: {
  reminder: CheckInReminder
  lastRelative: string | null
  onPress: () => void
  exec: ExecTheme
}) {
  const s = exec.surface
  const first = reminder.variant === 'first'
  const overdue = reminder.variant === 'overdue'
  const accent = overdue ? '#F04438' : exec.celebration
  const title = first
    ? 'Registra tu primer check-in'
    : overdue
      ? '¡Check-in pendiente!'
      : reminder.daysSince === 3
        ? 'Check-in próximo'
        : `Check-in próximo — hace ${reminder.daysSince} días`
  const sub = first ? 'Peso y energía en segundos' : lastRelative ? `Último: ${lastRelative}` : 'Peso y energía en segundos'
  return (
    <Pressable
      testID="final-checkin"
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, borderColor: first ? s.border : hexToRgba(accent, 0.34), backgroundColor: first ? s.surfaceSunken : hexToRgba(accent, 0.12), paddingHorizontal: 12, paddingVertical: 12 }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: first ? s.border : accent }}>
        <ClipboardCheck size={18} color={first ? s.textMuted : '#fff'} strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: first ? s.text : accent }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: first ? s.textMuted : accent }} numberOfLines={1}>{sub}</Text>
      </View>
      <ChevronRight size={18} color={first ? s.textMuted : accent} />
    </Pressable>
  )
}

/**
 * Entrada con fade + slide (moti) — reduced-motion pinta el estado final directo (sin translate). Se
 * reproduce cuando `play` pasa a true (fase 2 revelada), con `delay` para el stagger.
 */
function FadeIn({
  children, play, reduced, y = 8, delay = 0, duration = 300, style,
}: {
  children: React.ReactNode
  play: boolean
  reduced: boolean
  y?: number
  delay?: number
  duration?: number
  style?: React.ComponentProps<typeof MotiView>['style']
}) {
  const shown = reduced || play
  return (
    <MotiView
      style={style}
      from={reduced ? { opacity: 1, translateY: 0 } : { opacity: 0, translateY: y }}
      animate={{ opacity: shown ? 1 : 0, translateY: shown ? 0 : y }}
      transition={reduced ? { type: 'timing', duration: 0 } : { type: 'timing', duration, delay }}
    >
      {children}
    </MotiView>
  )
}
