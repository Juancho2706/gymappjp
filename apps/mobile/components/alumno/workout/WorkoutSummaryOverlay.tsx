import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  GitCommit,
  HeartPulse,
  Move,
  Share2,
  Trophy,
} from 'lucide-react-native'
import { Confetti } from 'react-native-fast-confetti'
import {
  compactDistance,
  summarizeSessionByKind,
  type CardioItem,
  type MobilityItem,
  type SummaryBlock,
  type SummaryLogLike,
} from '@eva/workout-engine'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { haptics } from '../../../lib/haptics'
import { FONT } from '../../../lib/typography'
import { epleyOneRM } from '../../../lib/profile-analytics'
import type { CheckInReminder } from '../../../lib/checkin-thresholds'
import { MuscleMapSvg } from './MuscleMapSvg'
import {
  ShareCardEyebrow,
  ShareCardHero,
  ShareCardPill,
  ShareCardPreview,
  ShareCardTitle,
} from '../../ShareCard'

// ── Always-dark canvas literals (1:1 con el WorkoutSummaryOverlay web sobre ink-950) ──
const INK_950 = '#0B0E13'
const INK_900 = '#12161D'
const BORDER_INV = 'rgba(255,255,255,0.10)'
const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'
const W03 = 'rgba(255,255,255,0.03)'
const W04 = 'rgba(255,255,255,0.04)'
const W05 = 'rgba(255,255,255,0.05)'
const W06 = 'rgba(255,255,255,0.06)'
const W08 = 'rgba(255,255,255,0.08)'
const W10 = 'rgba(255,255,255,0.10)'
const SPORT_500 = '#12B76A'
const SPORT_300 = '#6CE9A6'
const AMBER_200 = '#FDE68A'
const EMBER_500 = '#FF6A3D'
const EMBER_100 = 'rgba(255,106,61,0.14)'
const EMBER_BORDER = 'rgba(255,106,61,0.34)'
const DANGER_500 = '#F04438'
const DANGER_100 = 'rgba(240,68,56,0.14)'
const DANGER_BORDER = 'rgba(240,68,56,0.34)'
const MOBILITY = '#14b8a6'
const ROLLER = '#8b5cf6'

/** "12 jun" — fecha corta es-CL a partir de un ymd (YYYY-MM-DD). */
function fmtShortDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Duración → "45:12" (mm:ss) o "1h 05" desde 1 hora. "—" si no llega el dato. */
function fmtDuration(totalSec: number | undefined): string {
  if (totalSec == null || totalSec <= 0) return '—'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const MONO = FONT.monoBold
const BOLD = FONT.uiBold
const DISPLAY = FONT.displayBlack

type SummaryTile = { value: string; unit?: string; label: string }

function cardioTiles(c: CardioItem): SummaryTile[] {
  const tiles: SummaryTile[] = []
  if (c.durationSec != null && c.durationSec > 0) tiles.push({ value: fmtDuration(c.durationSec), label: 'Tiempo' })
  if (c.distanceM != null && c.distanceM > 0) tiles.push({ value: compactDistance(c.distanceM, 'm'), label: 'Distancia' })
  if (c.avgHr != null && c.avgHr > 0) tiles.push({ value: String(c.avgHr), unit: 'bpm', label: 'FC media' })
  if (c.rounds > 1) tiles.push({ value: String(c.rounds), label: 'Rondas' })
  if (tiles.length === 0) tiles.push({ value: String(c.rounds), label: c.rounds === 1 ? 'Ronda' : 'Rondas' })
  return tiles
}

function mobilityTiles(m: MobilityItem): SummaryTile[] {
  const tiles: SummaryTile[] = [{ value: String(m.sets), label: m.sets === 1 ? 'Serie' : 'Series' }]
  if (m.holdSec != null && m.holdSec > 0) tiles.push({ value: fmtDuration(m.holdSec), label: 'Hold total' })
  return tiles
}

interface DetectedPR {
  exerciseName: string
  newWeightKg: number
  prevWeightKg: number
  prevAchievedAt: string | null
  pct: number
  estimated1RM: number
}

export interface WorkoutSummaryOverlayProps {
  visible: boolean
  planTitle: string
  blocks: SummaryBlock[]
  logs: SummaryLogLike[]
  exerciseMaxes: Record<string, number>
  /** Fecha (ymd) del máximo histórico por ejercicio → "superaste tus 80 kg del 12 jun". */
  exerciseMaxDates?: Record<string, string>
  /** Duración de la sesión en segundos (cronómetro congelado al finalizar). */
  durationSec?: number
  /** Nombre del programa activo (nudge "seguí tu progreso"). null en planes sueltos. */
  programName?: string | null
  /** Sub-línea de contexto del programa (Día X de Y / "Programa semanal"). */
  nextHint?: string | null
  /** Bloques con sustitución activa → guard anti-PR-falso (su peso no marca récord en el slot original). */
  substitutedBlockIds?: string[]
  /** Recordatorio de check-in post-entreno (E2-18) — null cuando no toca. */
  checkInReminder?: CheckInReminder | null
  /** "Último: hace N días" ya formateado (el executor lo calcula con formatRelativeDate). */
  checkInLastRelative?: string | null
  onCheckIn: () => void
  onDone: () => void
  onClose?: () => void
}

/**
 * WorkoutSummaryOverlay (mobile) — cierre de sesión rico (E2-15/16/18).
 *
 * Reemplaza el `WorkoutSummaryModal` legacy con el resumen completo del overlay web
 * (`c/[coach_slug]/workout/[planId]/WorkoutSummaryOverlay.tsx`): PRs con guard anti-falso para
 * sustituidos, conteo polimórfico (fuerza + cardio + movilidad/roller), mapa muscular anatómico
 * (`MuscleMapSvg` sobre paths compartidos), hint de próxima sesión — todo derivado en una sola
 * pasada con `summarizeSessionByKind` (@eva/workout-engine, misma lógica pura que web).
 *
 * E2-16: cada PR y el resumen abren un `ShareCardPreview` branded (motor `ShareCard`).
 * E2-18: si toca check-in por umbrales (`checkInReminder`), muestra el prompt DS que navega a
 * check-in.
 */
export function WorkoutSummaryOverlay({
  visible,
  planTitle,
  blocks,
  logs,
  exerciseMaxes,
  exerciseMaxDates = {},
  durationSec,
  programName = null,
  nextHint = null,
  substitutedBlockIds = [],
  checkInReminder = null,
  checkInLastRelative = null,
  onCheckIn,
  onDone,
  onClose,
}: WorkoutSummaryOverlayProps) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const brand = theme.primary

  const session = useMemo(
    () => summarizeSessionByKind(blocks, logs, substitutedBlockIds),
    [blocks, logs, substitutedBlockIds],
  )
  const exerciseBreakdown = session.strength

  const detectedPRs = useMemo<DetectedPR[]>(() => {
    return exerciseBreakdown
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
  }, [exerciseBreakdown, exerciseMaxes, exerciseMaxDates])

  const muscleGroupVolume = useMemo(() => {
    const maxV = session.strengthMuscleVolume[0]?.vol ?? 1
    return session.strengthMuscleVolume.map(({ group, vol }) => ({ group, vol, pct: Math.round((vol / maxV) * 100) }))
  }, [session.strengthMuscleVolume])

  const hasMuscleMap = useMemo(
    () => session.muscleWork.some((g) => g.vol > 0),
    [session.muscleWork],
  )
  const hasNonStrength = session.cardio.length > 0 || session.mobility.length > 0

  const completedSets = logs.length
  const totalReps = logs.reduce((acc, l) => acc + (l.reps_done || 0), 0)
  const totalVolume = logs.reduce((acc, l) => acc + (l.weight_kg || 0) * (l.reps_done || 0), 0)

  const heroSecondary =
    totalVolume > 0
      ? { value: String(Math.round(totalVolume)), unit: 'kg', label: 'Volumen total' }
      : session.totalCardioDistanceM > 0
        ? { value: compactDistance(session.totalCardioDistanceM, 'm'), unit: undefined as string | undefined, label: 'Distancia' }
        : { value: String(completedSets), unit: undefined as string | undefined, label: completedSets === 1 ? 'Serie' : 'Series' }

  const [shareOpen, setShareOpen] = useState(false)
  const [prCard, setPrCard] = useState<DetectedPR | null>(null)

  // Celebración al abrir (respeta reduce-motion). Confetti extra si hubo PRs.
  useEffect(() => {
    if (visible) haptics.success()
  }, [visible])

  const durationLabel = fmtDuration(durationSec)
  const sessionShareMsg = `¡Completé "${planTitle}"! 💪 ${completedSets} series · ${totalReps} reps · ${Math.round(totalVolume)} kg${detectedPRs.length ? ` · ${detectedPRs.length} récord${detectedPRs.length > 1 ? 's' : ''}!` : ''}`

  const onOpenPr = useCallback((pr: DetectedPR) => {
    haptics.tap()
    setPrCard(pr)
  }, [])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose ?? onDone} statusBarTranslucent>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: INK_950 }}>
        {visible && !motion.reduced ? (
          <Confetti autoplay fadeOutOnEnd colors={[brand, '#F59E0B', SPORT_500, theme.cyan]} />
        ) : null}

        {onClose && (
          <Pressable
            testID="summary-close"
            onPress={onClose}
            style={{ position: 'absolute', top: 12, right: 16, zIndex: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: W08 }}
          >
            <Text style={{ fontFamily: BOLD, fontSize: 16, color: ON_DARK }}>✕</Text>
          </Pressable>
        )}

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 20, gap: 24 }} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={[{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: SPORT_500, marginBottom: 8 }, theme.shadowGlowBlue]}>
              <Check size={36} color="#fff" strokeWidth={2.5} />
            </View>
            <Text style={{ fontFamily: DISPLAY, fontSize: 28, letterSpacing: -0.6, color: ON_DARK, textAlign: 'center' }}>¡Sesión completada!</Text>
            <Text style={{ fontFamily: theme.fontSans, fontSize: 14, color: ON_DARK_MUTED, textAlign: 'center' }}>{planTitle}</Text>
          </View>

          {/* Hero: Duración + stat adaptativo, luego series · reps */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: INK_900, paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ fontFamily: MONO, fontSize: 32, color: SPORT_500 }}>{durationLabel}</Text>
                <Text style={{ fontFamily: BOLD, fontSize: 11, color: ON_DARK_MUTED, marginTop: 8 }}>Duración</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: INK_900, paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ fontFamily: MONO, fontSize: 32, color: SPORT_500 }}>
                  {heroSecondary.value}
                  {heroSecondary.unit ? <Text style={{ fontFamily: BOLD, fontSize: 15, color: ON_DARK_MUTED }}> {heroSecondary.unit}</Text> : null}
                </Text>
                <Text style={{ fontFamily: BOLD, fontSize: 11, color: ON_DARK_MUTED, marginTop: 8 }}>{heroSecondary.label}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W03, paddingVertical: 10 }}>
              <Text style={{ fontFamily: theme.fontSans, fontSize: 14, color: ON_DARK_MUTED }}>
                <Text style={{ fontFamily: BOLD, color: ON_DARK }}>{completedSets}</Text> series
              </Text>
              {totalReps > 0 ? (
                <Text style={{ fontFamily: theme.fontSans, fontSize: 14, color: ON_DARK_MUTED }}>
                  · <Text style={{ fontFamily: BOLD, color: ON_DARK }}>{totalReps}</Text> reps
                </Text>
              ) : null}
            </View>
          </View>

          {/* PRs */}
          {detectedPRs.length > 0 && (
            <View style={{ borderRadius: 20, borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)', backgroundColor: 'rgba(245,158,11,0.14)', padding: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Trophy size={16} color={AMBER_200} />
                <Text style={{ fontFamily: DISPLAY, fontSize: 14, color: AMBER_200 }}>
                  {detectedPRs.length} {detectedPRs.length === 1 ? 'récord personal' : 'récords personales'}
                </Text>
              </View>
              {detectedPRs.map((pr) => (
                <Pressable
                  key={pr.exerciseName}
                  testID={`summary-pr-${pr.exerciseName}`}
                  onPress={() => onOpenPr(pr)}
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', backgroundColor: W06, paddingHorizontal: 12, paddingVertical: 10 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 14, color: ON_DARK }}>{pr.exerciseName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Share2 size={12} color="rgba(253,230,138,0.9)" />
                      <Text style={{ fontFamily: BOLD, fontSize: 10, color: 'rgba(253,230,138,0.9)' }}>Compartir</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: theme.fontSans, fontSize: 12, color: ON_DARK_MUTED, marginTop: 2 }}>
                    {pr.prevWeightKg} kg → {pr.newWeightKg} kg{pr.pct > 0 ? ` (+${pr.pct}%)` : ''}
                  </Text>
                  {pr.prevAchievedAt ? (
                    <Text style={{ fontFamily: theme.fontSans, fontSize: 10, color: 'rgba(253,230,138,0.8)', marginTop: 4 }}>
                      Superaste tus {pr.prevWeightKg} kg del {fmtShortDate(pr.prevAchievedAt)}
                    </Text>
                  ) : null}
                  <Text style={{ fontFamily: theme.fontSans, fontSize: 10, color: ON_DARK_MUTED, marginTop: 4 }}>
                    1RM estimado: <Text style={{ fontFamily: BOLD, color: ON_DARK }}>{pr.estimated1RM} kg</Text>
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Por ejercicio */}
          {exerciseBreakdown.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: BOLD, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: ON_DARK_MUTED }}>Por ejercicio</Text>
              {exerciseBreakdown.map((ex, i) => (
                <View key={`${ex.exerciseId}-${i}`} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W04, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: BOLD, fontSize: 14, color: ON_DARK }}>{ex.name}</Text>
                    <Text style={{ fontFamily: theme.fontSans, fontSize: 10, color: ON_DARK_MUTED }}>{ex.muscleGroup}</Text>
                  </View>
                  <Text style={{ fontFamily: MONO, fontSize: 12, color: ON_DARK_MUTED }}>
                    <Text style={{ color: ON_DARK }}>{ex.sets.length}</Text> series · <Text style={{ color: ON_DARK }}>{Math.round(ex.totalVolume)}</Text> kg
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Cardio y movilidad */}
          {hasNonStrength && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: BOLD, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: ON_DARK_MUTED }}>Cardio y movilidad</Text>
              {session.cardio.map((c) => (
                <NonStrengthCard key={c.blockId} name={c.name} typeLabel="Cardio" accent={EMBER_500} icon={<HeartPulse size={16} color={EMBER_500} />} tiles={cardioTiles(c)} />
              ))}
              {session.mobility.map((m) => (
                <NonStrengthCard
                  key={m.blockId}
                  name={m.name}
                  typeLabel={m.kind === 'roller' ? 'Foam roller' : 'Movilidad'}
                  accent={m.kind === 'roller' ? ROLLER : MOBILITY}
                  icon={m.kind === 'roller' ? <GitCommit size={16} color={ROLLER} /> : <Move size={16} color={MOBILITY} />}
                  tiles={mobilityTiles(m)}
                />
              ))}
            </View>
          )}

          {/* Músculos trabajados */}
          {(hasMuscleMap || muscleGroupVolume.length > 0) && (
            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: BOLD, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: ON_DARK_MUTED }}>Músculos trabajados</Text>
              {hasMuscleMap && (
                <View style={{ borderRadius: 20, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W03, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 }}>
                  <MuscleMapSvg groups={session.muscleWork} />
                </View>
              )}
              <View style={{ gap: 8 }}>
                {muscleGroupVolume.map(({ group, pct, vol }) => (
                  <View key={group} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: theme.fontSans, fontSize: 12, color: ON_DARK }}>{group}</Text>
                      <Text style={{ fontFamily: MONO, fontSize: 12, color: ON_DARK_MUTED }}>{Math.round(vol)} kg</Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: W10, overflow: 'hidden' }}>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: brand, width: `${pct}%` as `${number}%` }} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Lo que viene */}
          {programName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(18,183,106,0.25)', backgroundColor: 'rgba(18,183,106,0.08)', paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: SPORT_500 }}>
                <ArrowRight size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: BOLD, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: SPORT_300 }}>Lo que viene</Text>
                <Text style={{ fontFamily: BOLD, fontSize: 14, color: ON_DARK }} numberOfLines={1}>Seguí tu progreso en {programName}</Text>
                {nextHint ? <Text style={{ fontFamily: theme.fontSans, fontSize: 12, color: ON_DARK_MUTED }} numberOfLines={1}>{nextHint}</Text> : null}
              </View>
            </View>
          ) : null}

          {/* Check-in prompt (E2-18) */}
          {checkInReminder?.variant ? (
            <CheckInPrompt reminder={checkInReminder} lastRelative={checkInLastRelative} onPress={onCheckIn} fontSans={theme.fontSans} />
          ) : null}
        </ScrollView>

        {/* Barra de acciones fija */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: BORDER_INV, backgroundColor: INK_950 }}>
          <Pressable
            testID="summary-share"
            onPress={() => { haptics.tap(); setShareOpen(true) }}
            style={{ height: 52, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W08, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Share2 size={16} color={ON_DARK} />
            <Text style={{ fontFamily: BOLD, fontSize: 15, color: ON_DARK }}>Compartir</Text>
          </Pressable>
          <Pressable
            testID="summary-done"
            onPress={onDone}
            style={[{ flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: brand }, theme.shadowGlowBlue]}
          >
            <Text style={{ fontFamily: BOLD, fontSize: 16, color: theme.primaryForeground }}>Volver al inicio</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* E2-16: share-card branded del resumen de sesión */}
      <ShareCardPreview
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        variant="default"
        shareMessage={sessionShareMsg}
        fileName="eva-entreno"
      >
        <ShareCardEyebrow color={brand}>ENTRENAMIENTO</ShareCardEyebrow>
        <ShareCardTitle>{planTitle}</ShareCardTitle>
        <ShareCardHero value={totalVolume > 0 ? String(Math.round(totalVolume)) : durationLabel} unit={totalVolume > 0 ? 'kg' : undefined} color={brand} />
        <ShareCardPill>{completedSets} series{totalReps > 0 ? ` · ${totalReps} reps` : ''}</ShareCardPill>
      </ShareCardPreview>

      {/* E2-16: share-card branded de un PR nuevo */}
      <ShareCardPreview
        visible={prCard != null}
        onClose={() => setPrCard(null)}
        variant="record"
        shareMessage={prCard ? `¡Nuevo récord en ${prCard.exerciseName}! 💪 ${prCard.newWeightKg} kg` : undefined}
        fileName="eva-record"
      >
        {prCard ? (
          <>
            <ShareCardEyebrow>RÉCORD PERSONAL</ShareCardEyebrow>
            <ShareCardTitle>{prCard.exerciseName}</ShareCardTitle>
            <ShareCardHero value={String(prCard.newWeightKg)} unit="kg" color={brand} />
            <ShareCardPill tone="success">{prCard.prevWeightKg} → {prCard.newWeightKg} kg{prCard.pct > 0 ? ` · +${prCard.pct}%` : ''}</ShareCardPill>
          </>
        ) : null}
      </ShareCardPreview>
    </Modal>
  )
}

function NonStrengthCard({
  name,
  typeLabel,
  accent,
  icon,
  tiles,
}: {
  name: string
  typeLabel: string
  accent: string
  icon: React.ReactNode
  tiles: SummaryTile[]
}) {
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W03, paddingHorizontal: 12, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 14, color: ON_DARK }} numberOfLines={1}>{name}</Text>
        </View>
        <Text style={{ fontFamily: BOLD, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: accent, backgroundColor: accent + '28', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{typeLabel}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.map((t, i) => (
          <View key={i} style={{ flexGrow: 1, minWidth: '46%', borderRadius: 12, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W05, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontFamily: MONO, fontSize: 20, color: ON_DARK }}>
              {t.value}
              {t.unit ? <Text style={{ fontFamily: BOLD, fontSize: 11, color: ON_DARK_MUTED }}> {t.unit}</Text> : null}
            </Text>
            <Text style={{ fontFamily: BOLD, fontSize: 10, color: ON_DARK_MUTED, marginTop: 6 }}>{t.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** Prompt de check-in post-entreno (E2-18), variant-aware sobre el canvas oscuro del resumen. */
function CheckInPrompt({
  reminder,
  lastRelative,
  onPress,
  fontSans,
}: {
  reminder: CheckInReminder
  lastRelative: string | null
  onPress: () => void
  fontSans: string
}) {
  const overdue = reminder.variant === 'overdue'
  const first = reminder.variant === 'first'
  const accent = overdue ? DANGER_500 : EMBER_500
  const bg = first ? W05 : overdue ? DANGER_100 : EMBER_100
  const border = first ? BORDER_INV : overdue ? DANGER_BORDER : EMBER_BORDER
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
      testID="summary-checkin-prompt"
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 12 }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: first ? W08 : accent }}>
        <ClipboardCheck size={18} color={first ? ON_DARK_MUTED : '#fff'} strokeWidth={2.25} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: BOLD, fontSize: 14, color: first ? ON_DARK : accent }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontFamily: fontSans, fontSize: 12, color: first ? ON_DARK_MUTED : accent }} numberOfLines={1}>{sub}</Text>
      </View>
      <ChevronRight size={18} color={first ? ON_DARK_MUTED : accent} />
    </Pressable>
  )
}
