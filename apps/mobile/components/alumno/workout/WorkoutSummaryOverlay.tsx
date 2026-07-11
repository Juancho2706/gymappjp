import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Modal, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
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
  formatClockDuration,
  formatSessionDuration,
  muscleGroupsToRegionIntensity,
  MUSCLE_REGIONS,
  summarizeSessionByKind,
  type CardioItem,
  type MobilityItem,
  type SummaryBlock,
  type SummaryLogLike,
} from '@eva/workout-engine'
import { deriveSportTokens } from '@eva/brand-kit'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { haptics } from '../../../lib/haptics'
import { SHADOWS } from '../../../lib/shadows'
import { resolveSportRamp } from '../../../lib/theme'
import { FONT } from '../../../lib/typography'
import { epleyOneRM } from '../../../lib/profile-analytics'
import type { CheckInReminder } from '../../../lib/checkin-thresholds'
import { MuscleMapSvg } from './MuscleMapSvg'
import {
  ShareCardDate,
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
// --sport-300 (eyebrow "Lo que viene") NO es un literal fijo: el web lo inyecta como
// deriveSportTokens(primaryColor).ramp['300'] (layout.tsx:290 + brand-kit index.ts:281,295), o sea
// un tinte de la MARCA del coach. En white-label debe recolorearse igual que el sport-500 semántico
// (círculo del check, hero, nudge = `theme.primary`). Se deriva por-marca dentro del componente
// (deriveSportTokens(brand).ramp['300']) en vez de hardcodear el azul EVA #93BEFF.
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

/**
 * Número con coma decimal es-CL para la share-card del PR — espejo EXACTO de
 * `fmtWeight`/`fmtPct` del web (`records/pr-card.ts:20-22`, `workout-pr-card-canvas.ts:89-91`:
 * `String(n).replace('.', ',')`). El canvas web pinta el peso hero, el pill de salto y el 1RM
 * con coma ("102,5 kg", "+12,5%"); la ShareCard móvil pasaba `String()` crudo → punto. Enteros
 * quedan intactos (String no añade decimales).
 */
function fmtDecimalCL(n: number): string {
  return String(n).replace('.', ',')
}

/**
 * Slug para el nombre del PNG del PR — espejo EXACTO del `slugify` web (PRShareCardModal.tsx:20-30):
 * minúsculas + NFD sin diacríticos + no-alfanum→'-' + trim guiones + slice(0,48), fallback 'record'.
 * El web nombra el archivo compartido `record-{slug}.png`; aquí pasamos `record-{slug}` (ShareCard le
 * añade la extensión) para paridad de nombre.
 */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'record'
  )
}

/** "#rrggbb" + alfa → "rgba(r,g,b,a)" — para tintar la marca del coach (nudge sport-500/x). */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const MONO = FONT.monoBold
const BOLD = FONT.uiBold
// font-medium (~500) — etiqueta de nombre de grupo bajo cada barra de kg de "Músculos trabajados"
// (web WorkoutSummaryOverlay.tsx:464 `font-medium text-on-dark`). El web la pinta en medium, no
// regular; FONT.uiMedium ya está cargado (usado en ShareCard dateLine, ShareCard.tsx:548).
const MEDIUM = FONT.uiMedium
// font-semibold (~600) — nombres de ejercicio (§6) y NonStrengthCard (§7.1), MÁS las etiquetas
// pequeñas muted que el web pinta `font-semibold`, no `font-bold`: labels de hero "Duración"/adaptativo
// (web WorkoutSummaryOverlay.tsx:289,298), chip "Compartir" del PR (:350), valor 1RM (:364) y label de
// tile en NonStrengthCard (:130). El web usa `font-semibold text-sm/[10px]/[11px]`, no bold.
const SEMIBOLD = FONT.uiSemibold
const DISPLAY = FONT.displayBlack
// Encabezado del panel de PRs: web usa la SANS en peso black (`text-sm font-black`, sin font-display —
// WorkoutSummaryOverlay.tsx:320). El sans más pesado cargado en mobile es uiExtra (800).
const SANS_BLACK = FONT.uiExtra

type SummaryTile = { value: string; unit?: string; label: string }

function cardioTiles(c: CardioItem): SummaryTile[] {
  const tiles: SummaryTile[] = []
  if (c.durationSec != null && c.durationSec > 0) tiles.push({ value: formatClockDuration(c.durationSec), label: 'Tiempo' })
  if (c.distanceM != null && c.distanceM > 0) tiles.push({ value: compactDistance(c.distanceM, 'm'), label: 'Distancia' })
  if (c.avgHr != null && c.avgHr > 0) tiles.push({ value: String(c.avgHr), unit: 'bpm', label: 'FC media' })
  if (c.rounds > 1) tiles.push({ value: String(c.rounds), label: 'Rondas' })
  if (tiles.length === 0) tiles.push({ value: String(c.rounds), label: c.rounds === 1 ? 'Ronda' : 'Rondas' })
  return tiles
}

function mobilityTiles(m: MobilityItem): SummaryTile[] {
  const tiles: SummaryTile[] = [{ value: String(m.sets), label: m.sets === 1 ? 'Serie' : 'Series' }]
  if (m.holdSec != null && m.holdSec > 0) tiles.push({ value: formatClockDuration(m.holdSec), label: 'Hold total' })
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
  /** Nombre del programa activo (nudge "sigue tu progreso"). null en planes sueltos. */
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
  /**
   * Descarte opcional del overlay. PARIDAD ESTRICTA: el overlay web no tiene control de cerrar — su
   * única salida es "Volver al inicio" → onDone (web WorkoutSummaryOverlay.tsx:517-524). El executor
   * deliberadamente NO lo pasa (ver ExecutorV2), de modo que el ✕ no se renderiza y `onRequestClose`
   * cae en onDone. Se conserva como prop por si un consumidor futuro necesita el idioma móvil de un
   * descarte explícito, pero por defecto queda sin cablear para no añadir una vía de escape ausente en web.
   */
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
  const { theme, branding } = useTheme()
  const motion = useEvaMotion()
  const brand = theme.primary
  // Tinte sport-300 derivado de la marca del coach — espejo de web layout.tsx:290
  // (--sport-300 = deriveSportTokens(primaryColor).ramp['300']). Usado en el eyebrow "Lo que viene".
  const sport300 = useMemo(() => deriveSportTokens(brand).ramp['300'], [brand])
  // --sport-500 = MARCA EXACTA verbatim del coach (brand-kit index.ts:297 `ramp['500'] === brandHex`),
  // distinto de --theme-primary (`theme.primary` = accent CONTRAST-CLAMPED, layout.tsx:276,308). El web
  // tiñe con --sport-500 el círculo del check (WorkoutSummaryOverlay.tsx:270) y los valores del hero
  // Duración/adaptativo (:288,:292); con --theme-primary sólo las barras (:470) y "Volver al inicio"
  // (:520). Para un brand que requiera clamp en canvas oscuro ambos difieren, así que derivamos del
  // primaryColor CRUDO (`branding.primaryColor`) vía resolveSportRamp — el mismo helper que alimenta las
  // vars --color-sport-* de NativeWind. (Pasar `theme.primary` sería un no-op: ramp['500'] devuelve su
  // input verbatim; el fix real exige el color de marca crudo, no el accent ya clampado.)
  const sport500 = useMemo(() => resolveSportRamp(branding?.primaryColor).sport500, [branding?.primaryColor])

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

  // Guard idéntico a web (WorkoutSummaryOverlay.tsx:200-203): sólo mostramos la card si alguna
  // REGIÓN renderizada se enciende. Chequear `g.vol > 0` por GRUPO dejaría una silueta apagada
  // cuando el grupo trabajado no mapea a ninguna región del SVG.
  const hasMuscleMap = useMemo(() => {
    const intensity = muscleGroupsToRegionIntensity(session.muscleWork)
    return MUSCLE_REGIONS.some((r) => intensity[r] > 0)
  }, [session.muscleWork])
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

  // Hero "Duración" y ShareCardHero: `formatSessionDuration` (explícita, sin segundos — un 0:40
  // se leía como 40 min siendo 40 s). Los tiles de cardio/hold usan `formatClockDuration` (mm:ss).
  const durationLabel = formatSessionDuration(durationSec)
  const prSuffix = detectedPRs.length ? ` 🏆 ${detectedPRs.length} récord${detectedPRs.length > 1 ? 's' : ''}!` : ''
  const sessionShareMsg = `¡Completé "${planTitle}"! 💪 ${completedSets} series · ${totalReps} reps · ${Math.round(totalVolume)} kg${prSuffix}`

  const onOpenPr = useCallback((pr: DetectedPR) => {
    haptics.tap()
    setPrCard(pr)
  }, [])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose ?? onDone} statusBarTranslucent>
      {/* SafeAreaProvider PROPIO: el contexto de insets del root NO cruza la barrera del RN Modal
          (iOS lo presenta en otra jerarquía nativa) → sin esto el inset top vuelve 0 y el check queda
          pegado al reloj del sistema. Re-mide dentro del modal para dar el respiro superior (paridad web pt-safe). */}
      <SafeAreaProvider>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: INK_950 }}>
        {/* Celebración al abrir (respeta reduce-motion). Ráfaga AMPLIFICADA si hubo PRs — espejo del
            web, que con PRs dispara 3 tandas (200 + 2×80) y sin PRs una sola de 80
            (WorkoutSummaryOverlay.tsx:246-252). Aquí lo expresamos subiendo `count`. */}
        {visible && !motion.reduced ? (
          <Confetti
            autoplay
            fadeOutOnEnd
            count={detectedPRs.length > 0 ? 250 : 120}
            colors={[brand, '#F59E0B', theme.success, theme.cyan]}
          />
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
          <FadeIn play={visible} reduced={motion.reduced} y={12} duration={350} style={{ alignItems: 'center', gap: 6 }}>
            {/* Círculo del check: fondo --sport-500 (marca verbatim), NO --theme-primary clamped
                (web WorkoutSummaryOverlay.tsx:270). marginBottom 10 + gap:6 del FadeIn = 16px al título,
                espejo del wrapper `mb-4` web (:267). */}
            <View style={[{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: sport500, marginBottom: 10 }, theme.shadowGlowBlue]}>
              <Check size={36} color="#fff" strokeWidth={2} />
            </View>
            <Text style={{ fontFamily: DISPLAY, fontSize: 28, letterSpacing: -0.6, color: ON_DARK, textAlign: 'center' }}>¡Sesión completada!</Text>
            <Text style={{ fontFamily: theme.fontSans, fontSize: 14, color: ON_DARK_MUTED, textAlign: 'center' }}>{planTitle}</Text>
          </FadeIn>

          {/* Hero: Duración + stat adaptativo, luego series · reps */}
          <FadeIn play={visible} reduced={motion.reduced} y={8} delay={50} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: INK_900, paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ fontFamily: MONO, fontSize: 34, color: sport500 }}>{durationLabel}</Text>
                <Text style={{ fontFamily: SEMIBOLD, fontSize: 11, color: ON_DARK_MUTED, marginTop: 8 }}>Duración</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: INK_900, paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ fontFamily: MONO, fontSize: 34, color: sport500 }}>
                  {heroSecondary.value}
                  {heroSecondary.unit ? <Text style={{ fontFamily: BOLD, fontSize: 16, color: ON_DARK_MUTED }}> {heroSecondary.unit}</Text> : null}
                </Text>
                <Text style={{ fontFamily: SEMIBOLD, fontSize: 11, color: ON_DARK_MUTED, marginTop: 8 }}>{heroSecondary.label}</Text>
              </View>
            </View>
            {/* Web (WorkoutSummaryOverlay.tsx:302-309): contenedor `tabular-nums` y separador `·`
                a 50% del muted (`text-on-dark-muted/50`). Aplicamos fontVariant a los números y
                bajamos la opacidad del `·` a la mitad. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W03, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ fontFamily: theme.fontSans, fontSize: 14, color: ON_DARK_MUTED }}>
                <Text style={{ fontFamily: BOLD, color: ON_DARK, fontVariant: ['tabular-nums'] }}>{completedSets}</Text> series
              </Text>
              {totalReps > 0 ? (
                <>
                  <Text style={{ fontFamily: theme.fontSans, fontSize: 14, color: withAlpha(ON_DARK_MUTED, 0.5) }}>·</Text>
                  <Text style={{ fontFamily: theme.fontSans, fontSize: 14, color: ON_DARK_MUTED }}>
                    <Text style={{ fontFamily: BOLD, color: ON_DARK, fontVariant: ['tabular-nums'] }}>{totalReps}</Text> reps
                  </Text>
                </>
              ) : null}
            </View>
          </FadeIn>

          {/* PRs */}
          {detectedPRs.length > 0 && (
            <FadeIn play={visible} reduced={motion.reduced} y={0} duration={300}>
            <View style={{ borderRadius: 20, borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)', overflow: 'hidden' }}>
              {/* Gradiente diagonal amber→yellow (web: `bg-gradient-to-br from-amber-500/20 to-yellow-500/10`,
                  WorkoutSummaryOverlay.tsx:319). amber-500 #f59e0b @20% → yellow-500 #eab308 @10%. */}
              <LinearGradient
                colors={['rgba(245,158,11,0.20)', 'rgba(234,179,8,0.10)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
              <View style={{ padding: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Trophy size={16} color={AMBER_200} />
                <Text style={{ fontFamily: SANS_BLACK, fontSize: 14, color: AMBER_200 }}>
                  {detectedPRs.length} {detectedPRs.length === 1 ? 'récord personal' : 'récords personales'}
                </Text>
              </View>
              {detectedPRs.map((pr, i) => (
                <FadeIn key={pr.exerciseName} play={visible} reduced={motion.reduced} y={10} delay={100 * i} duration={280}>
                <Pressable
                  testID={`summary-pr-${pr.exerciseName}`}
                  onPress={() => onOpenPr(pr)}
                  // rounded-lg (8px) es la excepción visual explícita de la card dorada (spec §5.2 /
                  // web WorkoutSummaryOverlay.tsx:346), NO el rounded-control del DS.
                  style={({ pressed }) => ({ borderRadius: 8, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : W06, paddingHorizontal: 12, paddingVertical: 8 })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontFamily: BOLD, fontSize: 14, color: ON_DARK }}>{pr.exerciseName}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Share2 size={12} color="rgba(253,230,138,0.9)" />
                      <Text style={{ fontFamily: SEMIBOLD, fontSize: 10, color: 'rgba(253,230,138,0.9)' }}>Compartir</Text>
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
                    1RM estimado: <Text style={{ fontFamily: SEMIBOLD, color: ON_DARK }}>{pr.estimated1RM} kg</Text>
                  </Text>
                </Pressable>
                </FadeIn>
              ))}
              </View>
            </View>
            </FadeIn>
          )}

          {/* Por ejercicio */}
          {exerciseBreakdown.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: BOLD, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: ON_DARK_MUTED }}>Por ejercicio</Text>
              {/* Web: fila `flex flex-wrap items-baseline justify-between gap-2`
                  (WorkoutSummaryOverlay.tsx:387): con un nombre largo el bloque de stats (series · kg
                  vol.) ENVUELVE a una nueva línea en vez de comprimirse. Espejamos `flexWrap:'wrap'`;
                  el bloque de nombre usa `flexShrink:1` (mirror del `<div>` flex-initial del web, no
                  `flex:1`) para que un nombre largo consuma la línea y empuje los stats debajo. */}
              {exerciseBreakdown.map((ex, i) => (
                <FadeIn key={`${ex.exerciseId}-${i}`} play={visible} reduced={motion.reduced} y={16} delay={50 + 60 * i} duration={300} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W04, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ fontFamily: SEMIBOLD, fontSize: 14, color: ON_DARK }}>{ex.name}</Text>
                    <Text style={{ fontFamily: theme.fontSans, fontSize: 10, color: ON_DARK_MUTED }}>{ex.muscleGroup}</Text>
                  </View>
                  {/* Web: `text-xs text-on-dark-muted tabular-nums` (SANS regular tabular) con SÓLO los
                      números en `font-bold text-on-dark`; el texto 'series ·'/'kg vol.' va en peso
                      normal muted (WorkoutSummaryOverlay.tsx:393-395). No es mono. */}
                  <Text style={{ fontFamily: theme.fontSans, fontSize: 12, color: ON_DARK_MUTED, fontVariant: ['tabular-nums'] }}>
                    <Text style={{ fontFamily: BOLD, color: ON_DARK }}>{ex.sets.length}</Text> series · <Text style={{ fontFamily: BOLD, color: ON_DARK }}>{Math.round(ex.totalVolume)}</Text> kg vol.
                  </Text>
                </FadeIn>
              ))}
            </View>
          )}

          {/* Cardio y movilidad */}
          {hasNonStrength && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: BOLD, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: ON_DARK_MUTED }}>Cardio y movilidad</Text>
              {/* Índice de stagger CONTINUO cardio→movilidad: en el web ambos .map son hijos del mismo
                  staggerContainer (WorkoutSummaryOverlay.tsx:414-441), así que el escalonado sigue el
                  orden del DOM sin reiniciarse. */}
              {session.cardio.map((c, i) => (
                <FadeIn key={c.blockId} play={visible} reduced={motion.reduced} y={16} delay={50 + 60 * i} duration={300}>
                  <NonStrengthCard name={c.name} typeLabel="Cardio" accent={EMBER_500} icon={<HeartPulse size={16} color={EMBER_500} />} tiles={cardioTiles(c)} />
                </FadeIn>
              ))}
              {session.mobility.map((m, i) => (
                <FadeIn key={m.blockId} play={visible} reduced={motion.reduced} y={16} delay={50 + 60 * (session.cardio.length + i)} duration={300}>
                  <NonStrengthCard
                    name={m.name}
                    typeLabel={m.kind === 'roller' ? 'Foam roller' : 'Movilidad'}
                    accent={m.kind === 'roller' ? ROLLER : MOBILITY}
                    icon={m.kind === 'roller' ? <GitCommit size={16} color={ROLLER} /> : <Move size={16} color={MOBILITY} />}
                    tiles={mobilityTiles(m)}
                  />
                </FadeIn>
              ))}
            </View>
          )}

          {/* Músculos trabajados. Web: `<section className="mb-8">` = 32px de margen inferior, la
              ÚNICA sección con mb-8 (el resto usa mb-6 = 24px, WorkoutSummaryOverlay.tsx:446). El
              ScrollView aplica `gap: 24` uniforme, así que sumamos 8px extra (marginBottom) para
              llegar a los 32px del web en la separación Músculos→'Lo que viene'. */}
          {(hasMuscleMap || muscleGroupVolume.length > 0) && (
            <View style={{ marginBottom: 8 }}>
              {/* Separaciones internas EXPLÍCITAS (web WorkoutSummaryOverlay.tsx): título h3 `mb-3` = 12px
                  hasta el mapa (:447) y contenedor del mapa `mb-4` = 16px hasta las barras (:455). Antes
                  un `gap:10` uniforme daba 10/10; fijamos marginBottom 12 (título) y 16 (mapa). */}
              <Text style={{ fontFamily: BOLD, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: ON_DARK_MUTED, marginBottom: 12 }}>Músculos trabajados</Text>
              {/* px-3 pt-3 pb-1 + mb-4 (web WorkoutSummaryOverlay.tsx:455). */}
              {hasMuscleMap && (
                <FadeIn play={visible} reduced={motion.reduced} y={8} duration={300} style={{ marginBottom: 16, borderRadius: 20, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W03, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>
                  <MuscleMapSvg groups={session.muscleWork} reducedMotion={motion.reduced} />
                </FadeIn>
              )}
              <View style={{ gap: 8 }}>
                {muscleGroupVolume.map(({ group, pct, vol }) => (
                  <View key={group} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: MEDIUM, fontSize: 12, color: ON_DARK }}>{group}</Text>
                      {/* Web (WorkoutSummaryOverlay.tsx:465) pinta "{vol} kg" en SANS `text-on-dark-muted`,
                          sin mono/tabular. Espejamos la sans; tabular-nums sólo alinea los dígitos. */}
                      <Text style={{ fontFamily: theme.fontSans, fontSize: 12, color: ON_DARK_MUTED, fontVariant: ['tabular-nums'] }}>{Math.round(vol)} kg</Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: W10, overflow: 'hidden' }}>
                      <MuscleBar pct={pct} color={brand} reduced={motion.reduced} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Lo que viene */}
          {programName ? (
            <FadeIn play={visible} reduced={motion.reduced} y={8} delay={100} duration={300} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, borderColor: withAlpha(brand, 0.25), backgroundColor: withAlpha(brand, 0.08), paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: brand }}>
                <ArrowRight size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: BOLD, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: sport300 }}>Lo que viene</Text>
                <Text style={{ fontFamily: BOLD, fontSize: 14, color: ON_DARK }} numberOfLines={1}>Sigue tu progreso en {programName}</Text>
                {nextHint ? <Text style={{ fontFamily: theme.fontSans, fontSize: 12, color: ON_DARK_MUTED }} numberOfLines={1}>{nextHint}</Text> : null}
              </View>
            </FadeIn>
          ) : null}

          {/* Check-in prompt (E2-18) — ADICIÓN MOBILE-ONLY SANCIONADA, NO una regresión de paridad.
              El overlay web NO tiene sección de check-in: sus secciones son header, hero, PRs, por
              ejercicio, cardio/movilidad, músculos, nudge y footer (web WorkoutSummaryOverlay.tsx:258-529);
              no existe CheckInPrompt en la fuente de verdad. Este prompt (entre el nudge y el footer) es
              funcionalidad exclusiva de mobile: no debe confundirse con un elemento ausente del web ni
              eliminarse por "paridad". */}
          {checkInReminder?.variant ? (
            <CheckInPrompt reminder={checkInReminder} lastRelative={checkInLastRelative} onPress={onCheckIn} fontSans={theme.fontSans} />
          ) : null}
        </ScrollView>

        {/* Acciones finales. Web las apila en columna full-width dentro del scroll (mt-auto): Compartir
            arriba (secundario) + "Volver al inicio" abajo (primario) — WorkoutSummaryOverlay.tsx:505-525.
            Aquí conservamos la barra FIJA (idioma móvil defendible) pero apilada en columna para
            replicar la orientación y jerarquía web. */}
        <View style={{ flexDirection: 'column', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: BORDER_INV, backgroundColor: INK_950 }}>
          {/* DIVERGENCIA IDIOMÁTICA DOCUMENTADA (share): el web `handleShare`
              (WorkoutSummaryOverlay.tsx:222-237) comparte TEXTO plano vía navigator.share, y sin
              Web Share API cae a clipboard mostrando el estado 'Copiado' (<Check emerald> 2s). En
              móvil abrimos un `ShareCardPreview` branded (imagen-tarjeta) — más rico y nativo — con
              el MISMO texto web adjunto a la hoja nativa como `shareMessage` (sessionShareMsg). El
              estado 'Copiado' NO aplica: la hoja de compartir nativa siempre está disponible (no hay
              rama de clipboard). Degradar a share de texto ELIMINARÍA la tarjeta branded existente
              (prohibido), por eso se preserva + documenta. */}
          <Pressable
            testID="summary-share"
            onPress={() => { haptics.tap(); setShareOpen(true) }}
            // h-10 (40px) secundario / h-12 (48px) primario — paridad numérica con web
            // (WorkoutSummaryOverlay.tsx:509,520).
            style={({ pressed }) => ({ height: 40, borderRadius: 14, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : W08, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 })}
          >
            <Share2 size={16} color={ON_DARK} />
            {/* Web (WorkoutSummaryOverlay.tsx:509): `font-semibold text-sm` (peso 600), no bold. */}
            <Text style={{ fontFamily: SEMIBOLD, fontSize: 14, color: ON_DARK }}>Compartir logro</Text>
          </Pressable>
          <Pressable
            testID="summary-done"
            onPress={onDone}
            // Web usa `shadow-lg` = drop-shadow NEUTRO (sin tinte de marca), no un glow
            // (WorkoutSummaryOverlay.tsx:520). Sobre el canvas siempre-oscuro del overlay usamos la
            // rampa neutra dark del DS (SHADOWS.dark.lg) en vez del glow sport de la marca.
            style={[{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: brand }, SHADOWS.dark.lg]}
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
        // Nombre del PNG = `record-{slug}` (ShareCard añade .png) → paridad con el web
        // `record-{slug}.png` (PRShareCardModal.tsx:42,72). Antes era el estático 'eva-record'.
        fileName={prCard ? `record-${slugify(prCard.exerciseName)}` : 'eva-record'}
      >
        {prCard ? (
          <>
            <ShareCardEyebrow color={brand}>RÉCORD PERSONAL</ShareCardEyebrow>
            <ShareCardTitle>{prCard.exerciseName}</ShareCardTitle>
            {/* Coma decimal es-CL como el canvas web (fmtWeight/fmtPct): "102,5 kg", "+12,5%". */}
            {/* Unidad hero en MAYÚSCULAS: el canvas web pinta "KG" (workout-pr-card-canvas.ts:673),
                no "kg". Espejamos el casing dentro de la reimplementación Views de la tarjeta. */}
            <ShareCardHero value={fmtDecimalCL(prCard.newWeightKg)} unit="KG" color={brand} />
            {/* Web canvas (workout-pr-card-canvas.ts:676-684): el pill verde de salto sólo aparece si
                prevWeightKg>0; con máximo histórico 0 muestra el literal neutro "Primer récord personal"
                (tono neutro, no success), no "0 → X kg · +100%". */}
            {prCard.prevWeightKg > 0 ? (
              // Canvas web (workout-pr-card-canvas.ts:676-679): con prevWeightKg>0 SIEMPRE pinta
              // "· +pct%" (sin guard pct>0; ese guard sólo vive en la card del overlay web :356, no en
              // el canvas que esta ShareCard replica). Reflejamos el canvas: mostramos "· +pct%" siempre.
              <ShareCardPill tone="success">{fmtDecimalCL(prCard.prevWeightKg)} → {fmtDecimalCL(prCard.newWeightKg)} kg · +{fmtDecimalCL(prCard.pct)}%</ShareCardPill>
            ) : (
              <ShareCardPill>Primer récord personal</ShareCardPill>
            )}
            <ShareCardDate />
            <ShareCardPill>1RM estimado · {fmtDecimalCL(prCard.estimated1RM)} kg</ShareCardPill>
          </>
        ) : null}
      </ShareCardPreview>
      </SafeAreaProvider>
    </Modal>
  )
}

/**
 * Entrada escalonada por sección/card — espejo de las animaciones framer del overlay web
 * (WorkoutSummaryOverlay.tsx): header opacity 0→1 / y 12→0 0.35s (:261-266), hero y 8→0 delay 0.05s
 * 0.3s (:279-284), sección PRs opacity 0→1 (:314-317) con cada card y 10→0 delay 0.1*i 0.28s
 * (:339-345), "Por ejercicio"/cardio staggerContainer(0.06, 0.05) + fadeSlideUp y 16→0 (:374-387,
 * :405-410), contenedor del mapa y 8→0 0.3s (:451-454) y nudge y 8→0 delay 0.1s (:483-487).
 * Reduced-motion: se pinta en el estado final sin animar (paridad web `initial={false}`/duration:0).
 * Se reproduce en CADA apertura (`play` = visible) porque el RN Modal no remonta el árbol al cerrar,
 * a diferencia del overlay web que se monta de cero cada vez.
 */
function FadeIn({
  children,
  play,
  reduced,
  y = 8,
  delay = 0,
  duration = 300,
  style,
}: {
  children: React.ReactNode
  play: boolean
  reduced: boolean | null
  y?: number
  delay?: number
  duration?: number
  style?: StyleProp<ViewStyle>
}) {
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current
  useEffect(() => {
    if (reduced) {
      progress.setValue(1)
      return
    }
    if (!play) {
      progress.setValue(0)
      return
    }
    progress.setValue(0)
    const anim = Animated.timing(progress, { toValue: 1, duration, delay, useNativeDriver: true })
    anim.start()
    return () => anim.stop()
  }, [play, reduced, delay, duration, progress])
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [y, 0] })
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>
}

/**
 * Barra de volumen por grupo muscular. Anima el ancho 0→pct% con un resorte suave (paridad con
 * web, que usa `springs.smooth` = stiffness:200, damping:25 — WorkoutSummaryOverlay.tsx:471-473 +
 * animation-presets.ts:5). Reduced-motion: se pinta directo en su estado final sin animar.
 */
function MuscleBar({ pct, color, reduced }: { pct: number; color: string; reduced: boolean | null }) {
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current
  useEffect(() => {
    if (reduced) {
      progress.setValue(1)
      return
    }
    progress.setValue(0)
    Animated.spring(progress, { toValue: 1, stiffness: 200, damping: 25, mass: 1, useNativeDriver: false }).start()
  }, [pct, reduced, progress])
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${pct}%`] })
  return <Animated.View style={{ height: 8, borderRadius: 4, backgroundColor: color, width }} />
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
    <View style={{ borderRadius: 20, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W03, paddingHorizontal: 12, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={{ flex: 1, fontFamily: SEMIBOLD, fontSize: 14, color: ON_DARK }} numberOfLines={1}>{name}</Text>
        </View>
        {/* tracking-wide del web = 0.025em; a font-size 10px ≈ 0.25px (WorkoutSummaryOverlay.tsx:112). */}
        <Text style={{ fontFamily: BOLD, fontSize: 10, letterSpacing: 0.25, textTransform: 'uppercase', color: accent, backgroundColor: accent + '28', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{typeLabel}</Text>
      </View>
      {/* Web usa `grid grid-cols-2 gap-2` (WorkoutSummaryOverlay.tsx:118): COLUMNAS FIJAS. Un tile
          único (cardio con sólo 'Rondas', o movilidad con sólo 'Series') ocupa media fila (columna
          izquierda), no el ancho completo. Con `flexGrow:1` un tile solitario se estiraba a full-width,
          cambiando el layout visible. Fijamos el ancho a ~48% (dos columnas reales sobre el gap de 8px)
          en vez de flexGrow para que el tile único quede a media fila como en la grilla web. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.map((t, i) => (
          <View key={i} style={{ width: '48%', borderRadius: 14, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W05, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ fontFamily: MONO, fontSize: 20, color: ON_DARK }}>
              {t.value}
              {t.unit ? <Text style={{ fontFamily: BOLD, fontSize: 11, color: ON_DARK_MUTED }}> {t.unit}</Text> : null}
            </Text>
            <Text style={{ fontFamily: SEMIBOLD, fontSize: 10, color: ON_DARK_MUTED, marginTop: 6 }}>{t.label}</Text>
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
