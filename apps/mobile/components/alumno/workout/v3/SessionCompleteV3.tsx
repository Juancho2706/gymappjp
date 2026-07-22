import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { MotiView } from 'moti'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { Confetti } from 'react-native-fast-confetti'
import { ChevronRight, ClipboardCheck, Medal, Share2 } from 'lucide-react-native'
import {
  compactDistance,
  formatClockDuration,
  formatSessionDuration,
  formatWeightEsCl,
  MUSCLE_REGIONS,
  muscleGroupsToRegionIntensity,
  summarizeSessionByKind,
  type SummaryBlock,
  type SummaryLogLike,
} from '@eva/workout-engine'
import { epleyOneRM } from '../../../../lib/profile-analytics'
import { hexToRgba } from '../../../../lib/theme'
import { FONT } from '../../../../lib/typography'
import type { CheckInReminder } from '../../../../lib/checkin-thresholds'
import { MuscleMapSvg } from '../MuscleMapSvg'
import { WeekStreakDots } from './WeekStreakDots'
import { NumberTicker, formatThousandsEsCl } from './NumberTicker'
import { JuicyButton } from './JuicyButton'
import type { ExecTheme } from './exec-theme'
import type { WeeklyStreak } from './weekly-streak'
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
  logs: SummaryLogLike[]
  exerciseMaxes: Record<string, number>
  exerciseMaxDates?: Record<string, string>
  durationSec?: number
  substitutedBlockIds?: string[]
  /** Racha semanal derivada (E4.4); null = no derivable (offline) → se oculta. */
  weeklyStreak: WeeklyStreak | null
  /** Recordatorio de check-in post-entreno (E2-18), null cuando no toca. */
  checkInReminder?: CheckInReminder | null
  checkInLastRelative?: string | null
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
  checkInReminder = null,
  checkInLastRelative = null,
  onCheckIn,
  onDone,
}: SessionCompleteV3Props) {
  const s = exec.surface
  const gold = exec.pr

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

  const completedSets = logs.length
  const plannedSets = useMemo(() => blocks.reduce((n, b) => n + (b.sets || 0), 0), [blocks])
  const totalReps = useMemo(() => logs.reduce((acc, l) => acc + (l.reps_done || 0), 0), [logs])
  const totalVolume = useMemo(() => logs.reduce((acc, l) => acc + (l.weight_kg || 0) * (l.reps_done || 0), 0), [logs])
  const durationLabel = formatSessionDuration(durationSec)

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

  const [shareOpen, setShareOpen] = useState(false)
  const [prCard, setPrCard] = useState<DetectedPR | null>(null)

  const prSuffix = detectedPRs.length ? ` 🏆 ${detectedPRs.length} récord${detectedPRs.length > 1 ? 's' : ''}!` : ''
  const sessionShareMsg = `¡Completé "${planTitle}"! 💪 ${completedSets} series · ${totalReps} reps · ${Math.round(totalVolume)} kg${prSuffix}`

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
              mas denso si hubo PRs. reduced-motion ⇒ sin confeti. */}
          {visible && !reducedMotion ? (
            <Confetti autoplay fadeOutOnEnd count={detectedPRs.length > 0 ? 160 : 90} colors={[brand, gold, '#4ADE80', '#38BDF8']} />
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
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: hexToRgba(gold, 0.5),
                    backgroundColor: hexToRgba(gold, pressed ? 0.24 : 0.14),
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  })}
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
                </Pressable>
              </FadeIn>
            ) : null}

            {/* Mapa muscular frente/espalda con intensidades + leyenda (MuscleMapSvg reusado). */}
            {hasMuscleMap ? (
              <FadeIn play={showStats} reduced={reducedMotion} y={12} delay={220} duration={360}>
                <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: s.borderSubtle, backgroundColor: s.surfaceSunken, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6 }}>
                  <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: s.textMuted, marginBottom: 8 }}>
                    Trabajado hoy
                  </Text>
                  <MuscleMapSvg groups={session.muscleWork} reducedMotion={reducedMotion} legendVariant="tiers" />
                </View>
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

          {/* Acciones — "Volver al inicio" SIEMPRE visible (skippable). Compartir arriba (secundario). */}
          <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, gap: 10, borderTopWidth: 1, borderTopColor: s.borderSubtle, backgroundColor: s.appBg }}>
            <JuicyButton
              testID="final-share"
              label="Compartir logro"
              onPress={() => setShareOpen(true)}
              exec={exec}
              height={60}
              fontSize={17}
              reducedMotion={reducedMotion}
              icon={<Share2 size={17} color={exec.accentText} />}
            />
            {/* Secundario con chrome real (.a2-finalsec): 52px, radio 15, #1c1c24 + borde 2px #2f2f3a. */}
            <Pressable
              testID="final-done"
              onPress={onDone}
              accessibilityRole="button"
              accessibilityLabel="Volver al inicio"
              style={({ pressed }) => ({
                height: 52,
                borderRadius: 15,
                backgroundColor: pressed ? '#22222c' : '#1c1c24',
                borderWidth: 2,
                borderColor: '#2f2f3a',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 15, letterSpacing: 0.3, color: '#e8e8ee' }}>Volver al inicio</Text>
            </Pressable>
          </View>
        </SafeAreaView>

        {/* Share-card branded del resumen de sesion (reusa ShareCardPreview, embedded para evitar el brick
            gris del Modal anidado en Android — mismo patron que WorkoutSummaryOverlay). */}
        <ShareCardPreview
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          variant="default"
          shareMessage={sessionShareMsg}
          fileName="eva-entreno"
          embedded
        >
          <ShareCardEyebrow color={brand}>ENTRENAMIENTO</ShareCardEyebrow>
          <ShareCardTitle>{planTitle}</ShareCardTitle>
          <ShareCardHero value={totalVolume > 0 ? String(Math.round(totalVolume)) : durationLabel} unit={totalVolume > 0 ? 'kg' : undefined} color={brand} />
          <ShareCardPill>{completedSets} series{totalReps > 0 ? ` · ${totalReps} reps` : ''}</ShareCardPill>
        </ShareCardPreview>

        {/* Share-card branded de un PR. */}
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
