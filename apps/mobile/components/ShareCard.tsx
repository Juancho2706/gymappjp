import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  Share,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
} from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Share2,
  X,
  CalendarDays,
  Flame,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { FONT } from '../lib/typography'
import { SHADOWS } from '../lib/shadows'
import { toast } from './Toast'

/**
 * EVA ShareCard — single RN engine for the brandeable share-cards (story format
 * 1080×1350), the mobile mirror of the web canvas generator
 * (`apps/web/src/lib/workout-pr-card-canvas.ts` + its four modals:
 * PRShareCardModal / StreakShareCardModal / ProgressShareCardModal /
 * MonthlySummaryShareCardModal).
 *
 * WHY VIEWS + view-shot (not <canvas>): RN has no canvas. Instead we lay the
 * card out with real Views/Text (DS typography + tokens), render it inside a
 * preview modal, then rasterize that same node to a PNG with `captureRef`
 * (react-native-view-shot) and hand the file to the native share sheet
 * (expo-sharing, falling back to RN's Share API). Same UX contract as the web
 * modals: preview the exact image, then Compartir / Cerrar.
 *
 * ── ALWAYS-DARK CANVAS ──
 * The card face is intentionally dark in BOTH app themes (1:1 with web — every
 * share-card renders on ink-950 regardless of the viewer's scheme, and with the
 * always-dark `WorkoutSummaryModal`). So the card literals below are the fixed
 * DS dark neutrals (ink-950/900 + white alphas), NOT scheme-driven tokens. What
 * DOES follow the brand is the ACCENT (logo/color of the coach): it comes from
 * `useTheme().theme.primary` (already contrast-clamped + white-label aware) and
 * `useTheme().branding` (displayName / logoUrl). `resolvedScheme` still selects
 * the elevation ramp for the on-screen preview chrome.
 *
 * ── PROPORTIONAL LAYOUT (QA-4 fix) ──
 * The card is rasterized at a FIXED 1080×1350 (see handleShare `captureRef`), so
 * the ONLY faithful way to mirror the web canvas is to size every internal element
 * as `webPx × (width / 1080)` — exactly the ratios `workout-pr-card-canvas.ts`
 * draws at (logo 76, name 34, eyebrow 38, exercise name 68, hero 230, pills 34,
 * date 32, footer chip 52…). Hand-tuned DS-role sizes (hero 88, title h2=31,
 * logo 54) rendered ~40-55% larger than web at the 340px reference; on the
 * 6-element `record` card (eyebrow · name · hero · jump pill · date · 1RM pill)
 * that overflowed the flex body and the centered overflow spilled OVER the header
 * (logo on eyebrow) and footer (1RM pill on the brand chip) — the CEO's broken
 * card. Scaling by `k = width/1080` makes the captured PNG identical to web AND
 * guarantees the block fits (web's 6-element layout fits its own canvas). See
 * `buildCardSizes`.
 *
 * ── HOW TO ADD A VARIANT (workout E2, perfil E4, …) ──
 * 1. Add an entry to `SHARE_CARD_VARIANTS` with its motif `icon`, `eyebrow`
 *    default and glow `tone` ('brand' = coach accent, 'ember' = streak orange).
 * 2. In the consumer screen, render:
 *      <ShareCardPreview visible={open} onClose={close} variant="record"
 *        shareMessage="¡Nuevo récord! 💪">
 *        <ShareCardEyebrow>RÉCORD PERSONAL</ShareCardEyebrow>
 *        <ShareCardTitle>Press banca</ShareCardTitle>
 *        <ShareCardHero value="102" unit="kg" />
 *        <ShareCardPill>85 → 102 kg · +20%</ShareCardPill>
 *      </ShareCardPreview>
 *    The children ARE the central block; the engine wraps them with the shared
 *    brand header (logo + name + motif badge) and footer ("<marca> · vía EVA").
 * 3. That's it — brand/logo/accent + capture + share are handled here.
 */

// ── Fixed DS dark-canvas literals (mirror web workout-pr-card-canvas.ts) ──
const INK_950 = '#0B0E13'
const INK_900 = '#12161D'
const EMBER_500 = '#FF6A3D'
const W88 = 'rgba(255,255,255,0.88)'
const W72 = 'rgba(255,255,255,0.72)'
const W62 = 'rgba(255,255,255,0.62)'
const W50 = 'rgba(255,255,255,0.50)'
const W40 = 'rgba(255,255,255,0.40)'
const W10 = 'rgba(255,255,255,0.10)'
const W08 = 'rgba(255,255,255,0.08)'

/** Story canvas aspect (1080×1350 = 4:5) — matches the web PNG exactly. */
const CARD_ASPECT = 1080 / 1350
/** Web canvas width — the reference every internal size is scaled FROM (see buildCardSizes). */
const CANVAS_W = 1080
/** Reference layout width the card renders at on screen (capped by the preview gutters). */
const CARD_W = 340

export type ShareCardTone = 'brand' | 'ember'

export interface ShareCardVariantSpec {
  /** Motif badge icon (top-right) — mirrors the vector icons in the web card. */
  icon: LucideIcon
  /** Default eyebrow copy (consumers can still pass their own <ShareCardEyebrow>). */
  eyebrow: string
  /** Glow + eyebrow/hero tint: 'brand' = coach accent, 'ember' = streak orange. */
  tone: ShareCardTone
}

/**
 * Motif registry. `default` is the wired base variant; the rest mirror the four
 * web cards and are ready for the E2/E4 consumer stages (icon + tone only —
 * the central block is supplied by the consumer as children).
 */
export const SHARE_CARD_VARIANTS = {
  default: { icon: TrendingUp, eyebrow: 'EVA', tone: 'brand' },
  record: { icon: Trophy, eyebrow: 'RÉCORD PERSONAL', tone: 'brand' },
  progress: { icon: TrendingUp, eyebrow: 'MI PROGRESO', tone: 'brand' },
  streak: { icon: Flame, eyebrow: 'RACHA', tone: 'ember' },
  monthly: { icon: CalendarDays, eyebrow: 'RESUMEN DEL MES', tone: 'brand' },
} satisfies Record<string, ShareCardVariantSpec>

export type ShareCardVariant = keyof typeof SHARE_CARD_VARIANTS

/** "3 de julio de 2026" — the milestone happened today (mirror web todayLong). */
function todayLong(): string {
  return new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** SPORT_500 — the EVA fallback accent (mirror web SSR fallback in workout-pr-card-canvas.ts:15). */
const SPORT_500 = '#2680FF'

/**
 * Per-card proportional sizes — every value is `webPx × (width / 1080)`, i.e. the exact ratio the web
 * canvas draws at (workout-pr-card-canvas.ts), because the card is rasterized at a fixed 1080×1350.
 * This is the QA-4 fix: it makes the mobile PNG 1:1 with web AND guarantees the central block fits the
 * flex body at any device width (web's own 6-element record layout fits its 1350 canvas).
 */
export interface CardSizes {
  k: number
  padX: number
  padTop: number
  padBottom: number
  // header
  headerLogo: number
  headerLogoRadius: number
  headerLogoInitial: number
  headerGap: number
  headerNameFont: number
  headerNameLS: number
  motif: number
  // central block
  eyebrowFont: number
  eyebrowLH: number
  eyebrowLS: number
  titleFont: number
  titleLH: number
  subtitleFont: number
  subtitleLH: number
  heroFont: number
  heroLH: number
  heroLS: number
  unitFont: number
  unitMB: number
  pillFont: number
  pillLH: number
  pillPadX: number
  pillPadY: number
  dateFont: number
  dateLH: number
  bodyGap: number
  // footer
  footerChip: number
  footerChipRadius: number
  footerChipInitial: number
  footerGap: number
  footerRowGap: number
  footerNameFont: number
  footerNameLS: number
  viaFont: number
}

function buildCardSizes(width: number): CardSizes {
  const k = width / CANVAS_W
  const r = (n: number) => Math.round(n * k)
  return {
    k,
    padX: r(80), // web PAD_X
    padTop: Math.round(r(80) * 0.9),
    padBottom: Math.round(r(80) * 0.8),
    // header (web: logo 76 @y88, name 34 @baseline140 ls1, motif 84)
    headerLogo: r(76),
    headerLogoRadius: r(20),
    headerLogoInitial: r(42),
    headerGap: r(24),
    headerNameFont: r(34),
    headerNameLS: Math.max(0.3, 1 * k),
    motif: r(84),
    // central (web: eyebrow 38 ls6, name 68 advance78, subtitle 34, hero 230 ls-4, unit 60, pill 34 padX28 padY16, date 32)
    eyebrowFont: r(38),
    eyebrowLH: Math.round(38 * k * 1.1),
    eyebrowLS: r(6),
    titleFont: r(68),
    titleLH: r(78),
    subtitleFont: r(34),
    subtitleLH: Math.round(34 * k * 1.3),
    heroFont: r(230),
    heroLH: r(230),
    heroLS: -r(4),
    unitFont: r(60),
    unitMB: Math.round(230 * k * 0.06),
    pillFont: r(34),
    pillLH: Math.round(34 * k * 1.15),
    pillPadX: r(28),
    pillPadY: r(16),
    dateFont: r(32),
    dateLH: Math.round(32 * k * 1.3),
    bodyGap: Math.round(width * 0.04),
    // footer (web: chip 52 @cy1300 r15, name 30 ls1, via 24)
    footerChip: r(52),
    footerChipRadius: r(15),
    footerChipInitial: r(26),
    footerGap: r(24),
    footerRowGap: r(22),
    footerNameFont: r(30),
    footerNameLS: Math.max(0.3, 1 * k),
    viaFont: r(24),
  }
}

/**
 * Chrome context: the ShareCardCanvas publishes the coach accent + the variant's tone color AND the
 * proportional `sizes` so the central-block building blocks (eyebrow/title/hero/pill/date) size
 * themselves off the current card width instead of hardcoded DS-role numbers. Web paints the eyebrow
 * with `accent`/`ember` and the hero with `accent` (workout-pr-card-canvas.ts:650-653, 663-665);
 * mobile must not fall back to #2680FF for white-label coaches. Explicit `color` props still win.
 */
const ShareCardChromeContext = createContext<{ accent: string; toneColor: string; sizes: CardSizes }>({
  accent: SPORT_500,
  toneColor: SPORT_500,
  sizes: buildCardSizes(CARD_W),
})

// ─────────────────────────────────────────────────────────────────────────────
// Central-block building blocks — the shared vocabulary of the web cards
// (eyebrow / title / hero metric / pill). Consumers compose these as children.
// ─────────────────────────────────────────────────────────────────────────────

/** Tracked, tinted eyebrow (accent for 'brand' cards, ember for streak). */
export function ShareCardEyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const { toneColor, sizes } = useContext(ShareCardChromeContext)
  return (
    <Text
      style={{
        fontFamily: FONT.displayBold,
        fontSize: sizes.eyebrowFont,
        lineHeight: sizes.eyebrowLH,
        letterSpacing: sizes.eyebrowLS,
        textTransform: 'uppercase',
        color: color ?? toneColor,
      }}
      numberOfLines={1}
    >
      {children}
    </Text>
  )
}

/** Big display title (up to 2 lines) — mirror web exercise name wrap (max 2 lines, …). */
export function ShareCardTitle({ children }: { children: ReactNode }) {
  const { sizes } = useContext(ShareCardChromeContext)
  return (
    <Text
      style={{ fontFamily: FONT.displayBold, fontSize: sizes.titleFont, lineHeight: sizes.titleLH, letterSpacing: -sizes.k * 2, color: '#FFFFFF' }}
      numberOfLines={2}
    >
      {children}
    </Text>
  )
}

/** Small muted subtitle (e.g. the student's first name). */
export function ShareCardSubtitle({ children }: { children: ReactNode }) {
  const { sizes } = useContext(ShareCardChromeContext)
  return (
    <Text style={{ fontFamily: FONT.ui, fontSize: sizes.subtitleFont, lineHeight: sizes.subtitleLH, color: W50 }} numberOfLines={1}>
      {children}
    </Text>
  )
}

/** Hero metric: huge number + small unit baseline (mirror the 230px web hero). */
export function ShareCardHero({ value, unit, color }: { value: string; unit?: string; color?: string }) {
  const { accent, sizes } = useContext(ShareCardChromeContext)
  return (
    <View style={styles.heroRow}>
      <Text
        style={{ fontFamily: FONT.displayBlack, fontSize: sizes.heroFont, lineHeight: sizes.heroLH, letterSpacing: sizes.heroLS, color: color ?? accent }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {unit ? (
        <Text style={{ fontFamily: FONT.displayBold, fontSize: sizes.unitFont, color: W50, marginBottom: sizes.unitMB }}>{unit}</Text>
      ) : null}
    </View>
  )
}

/** Rounded pill (context line under the hero). `tone` tints success/ember/neutral. */
export function ShareCardPill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'accent' | 'ember'
}) {
  const { sizes } = useContext(ShareCardChromeContext)
  // 'ember' mirrors the streak pill in the web canvas (ember 0.14 bg / ember text,
  // workout-pr-card-canvas.ts:841-842).
  const bg =
    tone === 'success' ? 'rgba(52,211,153,0.14)'
    : tone === 'ember' ? withAlpha(EMBER_500, 0.14)
    : tone === 'accent' ? W10
    : W08
  const fg = tone === 'success' ? '#34D399' : tone === 'ember' ? EMBER_500 : W72
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 9999, paddingHorizontal: sizes.pillPadX, paddingVertical: sizes.pillPadY }}>
      <Text style={{ fontFamily: FONT.uiSemibold, fontSize: sizes.pillFont, lineHeight: sizes.pillLH, color: fg }} numberOfLines={1}>
        {children}
      </Text>
    </View>
  )
}

/** Today's date, rendered like the web footer date line. Optional convenience. */
export function ShareCardDate() {
  const { sizes } = useContext(ShareCardChromeContext)
  return <Text style={{ fontFamily: FONT.uiMedium, fontSize: sizes.dateFont, lineHeight: sizes.dateLH, color: W62 }}>{todayLong()}</Text>
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand chrome — logo chip shared by header + footer.
// ─────────────────────────────────────────────────────────────────────────────
function LogoChip({
  logoUrl,
  brandName,
  accent,
  size,
  radius,
  initialSize,
}: {
  logoUrl: string | null | undefined
  brandName: string
  accent: string
  size: number
  radius: number
  initialSize: number
}) {
  if (logoUrl) {
    // Coach logo on a neutral white backplate so a light logo survives the dark
    // canvas (mirror of drawLogoChip `needsBackplate` in the web generator).
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#FFFFFF', padding: size * 0.14 }}>
        <Image
          source={{ uri: logoUrl }}
          style={{ flex: 1, borderRadius: Math.max(4, radius - size * 0.14) }}
          contentFit="contain"
        />
      </View>
    )
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.displayBold, fontSize: initialSize, color: '#FFFFFF' }}>
        {brandName.charAt(0).toUpperCase()}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ShareCardCanvas — the branded card face (header + children + footer). This is
// the node captured by view-shot. Exported for advanced consumers that want the
// bare card (e.g. an inline preview), but most screens use ShareCardPreview.
// ─────────────────────────────────────────────────────────────────────────────
interface CanvasProps {
  variant: ShareCardVariant
  brandName: string
  logoUrl: string | null | undefined
  accent: string
  width: number
  children: ReactNode
}

export const ShareCardCanvas = function ShareCardCanvas({
  variant,
  brandName,
  logoUrl,
  accent,
  width,
  children,
}: CanvasProps) {
  const spec = SHARE_CARD_VARIANTS[variant]
  const MotifIcon = spec.icon
  const toneColor = spec.tone === 'ember' ? EMBER_500 : accent
  const sizes = buildCardSizes(width)

  return (
    <ShareCardChromeContext.Provider value={{ accent, toneColor, sizes }}>
    {/* border-white/10 del marco: web PRShareCardModal.tsx:115 lo pinta en el contenedor del preview
        (`... rounded-card border border-white/10 bg-[var(--ink-950)] shadow-2xl`). */}
    <View style={{ width, aspectRatio: CARD_ASPECT, borderRadius: 20, borderWidth: 1, borderColor: W10, overflow: 'hidden', backgroundColor: INK_950 }}>
      {/* Ink base gradient (mirror drawCardBase). */}
      <LinearGradient
        colors={[INK_950, INK_900]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleFill}
      />
      {/* Accent glow at the top (approximates the web radial glow; expo-image/
          RN can't do a true radial, so a top-weighted linear tint reads as the
          same "energy" behind the header). */}
      <LinearGradient
        colors={[withAlpha(toneColor, 0.32), withAlpha(toneColor, 0)]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleFill}
      />

      <View style={{ flex: 1, paddingHorizontal: sizes.padX, paddingTop: sizes.padTop, paddingBottom: sizes.padBottom }}>
        {/* ── Brand header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sizes.headerGap }}>
          <LogoChip logoUrl={logoUrl} brandName={brandName} accent={accent} size={sizes.headerLogo} radius={sizes.headerLogoRadius} initialSize={sizes.headerLogoInitial} />
          <Text style={{ fontFamily: FONT.displayBold, fontSize: sizes.headerNameFont, letterSpacing: sizes.headerNameLS, color: W88 }} numberOfLines={1}>
            {brandName.toUpperCase()}
          </Text>
          <View style={{ flex: 1 }} />
          <MotifIcon size={sizes.motif} color={toneColor} strokeWidth={2.4} />
        </View>

        {/* ── Central block (consumer children) ── */}
        <View style={{ flex: 1, justifyContent: 'center', gap: sizes.bodyGap }}>{children}</View>

        {/* ── Brand footer: <marca> · vía EVA ── */}
        <View style={{ gap: sizes.footerGap }}>
          <View style={{ height: 1, backgroundColor: W10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sizes.footerRowGap }}>
            <LogoChip logoUrl={logoUrl} brandName={brandName} accent={accent} size={sizes.footerChip} radius={sizes.footerChipRadius} initialSize={sizes.footerChipInitial} />
            <Text style={{ fontFamily: FONT.displayBold, fontSize: sizes.footerNameFont, letterSpacing: sizes.footerNameLS, color: W72 }} numberOfLines={1}>
              {brandName.toUpperCase()}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontFamily: FONT.uiSemibold, fontSize: sizes.viaFont, color: W40 }}>vía EVA</Text>
          </View>
        </View>
      </View>
    </View>
    </ShareCardChromeContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ShareCardPreview — full-screen overlay: preview the card, then share/close.
// ─────────────────────────────────────────────────────────────────────────────
export interface ShareCardPreviewProps {
  visible: boolean
  onClose: () => void
  /** Motif; defaults to 'default'. */
  variant?: ShareCardVariant
  /** Text attached to the native share sheet. */
  shareMessage?: string
  /** Base file name for the PNG (no extension). */
  fileName?: string
  /**
   * Override the share behavior. Receives the captured PNG file URI; if
   * provided, the engine does NOT open its own share sheet (the consumer owns
   * it). Omit for the default expo-sharing → RN Share fallback flow.
   */
  onShare?: (uri: string) => void | Promise<void>
  /** Fired after a successful default share. */
  onShared?: () => void
  /**
   * Render as an absolute-fill overlay (NO own native <Modal>) instead of a Modal.
   * QA-5 fix: a React Native <Modal> nested inside another native <Modal> (the
   * WorkoutSummaryOverlay) stacks two Android Dialog windows; when the native share
   * Activity backgrounds the app and it resumes, Android fails to restore the nested
   * Dialog and leaves the screen as the modal's grey dim scrim with NO content
   * (the CEO's "pantalla gris" brick). Web never hits this because both overlays are
   * portaled siblings in ONE DOM. When this consumer is ALREADY inside a host Modal
   * (or full-screen overlay), pass `embedded` so only ONE native window exists and
   * background/resume is clean. Top-level consumers (perfil) keep the default Modal.
   */
  embedded?: boolean
  /** The central block (see ShareCard* building blocks). */
  children: ReactNode
}

export function ShareCardPreview({
  visible,
  onClose,
  variant = 'default',
  shareMessage,
  fileName = 'eva-card',
  onShare,
  onShared,
  embedded = false,
  children,
}: ShareCardPreviewProps) {
  const { theme, branding, resolvedScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { width: winW } = useWindowDimensions()
  const cardRef = useRef<View>(null)
  const [busy, setBusy] = useState(false)

  const brandName = branding?.displayName?.trim() || 'EVA'
  const logoUrl = branding?.logoUrl ?? null
  const accent = theme.primary
  // Fit the reference-width card into the screen with comfortable gutters.
  const cardWidth = Math.min(CARD_W, winW - 48)

  // Embedded mode has no native Modal, so the Android hardware-back must be caught
  // here to close the PREVIEW (not the host overlay behind it) — parity with the
  // Modal path's onRequestClose. Only while this overlay is actually showing.
  useEffect(() => {
    if (!embedded || !visible) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => sub.remove()
  }, [embedded, visible, onClose])

  async function handleShare() {
    if (busy) return
    setBusy(true)
    try {
      // Rasterize the exact previewed node a resolución FIJA 1080×1350 (independiente
      // del device), espejo del canvas web que siempre exporta 1080×1350
      // (workout-pr-card-canvas.ts:634). Sin width/height, view-shot salía a
      // cardWidth × devicePixelRatio (≈680–1020px según @2x/@3x), por debajo de 1080.
      let uri: string
      try {
        uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1350 })
      } catch {
        // Fallo REAL de captura (no cancelación) → toast de error, espejo del web
        // (PRShareCardModal.tsx:52-55: blob null → toast.error + cierre).
        toast.error('No pudimos generar la imagen. Intenta de nuevo.')
        return
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

      // `fileName` VIVO (antes prop muerta): el capture a tmpfile queda con un nombre temporal
      // aleatorio, mientras el web nombra el PNG compartido/descargado con la prop
      // (`new File([blob], fileName, …)`, PRShareCardModal.tsx:72 → `record-{slug}.png`). Renombramos
      // el archivo capturado a `${fileName}.png` para paridad de nombre. Best-effort: si el move falla
      // en alguna plataforma, compartimos el tmpfile original (nunca romper el share por el renombrado).
      let shareUri = uri
      try {
        const safe = (fileName || 'eva-card').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'eva-card'
        const from = uri.startsWith('file://') ? uri : `file://${uri}`
        const to = `${FileSystem.cacheDirectory}${safe}.png`
        if (to !== from) {
          await FileSystem.deleteAsync(to, { idempotent: true })
          await FileSystem.moveAsync({ from, to })
          shareUri = to
        }
      } catch {
        shareUri = uri
      }

      if (onShare) {
        await onShare(shareUri)
        return
      }

      // Default: native share sheet with the PNG. El web comparte la IMAGEN + el TEXTO juntos
      // (`navigator.share({ files, title, text })` — PRShareCardModal.tsx:72-75; y el brag de sesión
      // series·reps·kg·récords viaja como `text` en WorkoutSummaryOverlay.tsx:224/231). `Sharing.shareAsync`
      // sólo comparte el ARCHIVO: su `dialogTitle` es el título del chooser (Android), NO contenido
      // compartido → en iOS el brag textual se perdía. En iOS usamos RN `Share.share({ url, message })`
      // para adjuntar imagen + texto igual que web. En Android mantenemos expo-sharing (comparte el PNG
      // real; el Share.share de Android no adjunta archivo, sólo texto — perderíamos la tarjeta branded).
      if (Platform.OS === 'ios') {
        // RN Share distingue cancelación de éxito: dismissedAction = el usuario cerró la hoja → silencio
        // (como el web, que sólo traga el AbortError de cancelación en web-share.ts:29). No es error.
        const result = await Share.share({ url: shareUri, message: shareMessage ?? '' })
        if (result.action === Share.dismissedAction) return
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, {
          mimeType: 'image/png',
          dialogTitle: shareMessage || 'Compartir',
          UTI: 'public.png',
        })
      } else {
        const result = await Share.share({ url: shareUri, message: shareMessage ?? '' })
        if (result.action === Share.dismissedAction) return
      }
      onShared?.()
    } catch {
      // Fallo real de la hoja de compartir (expo-sharing lanza; la cancelación del
      // usuario NO lanza — resuelve). El comentario previo "silent (matches web modal
      // UX)" era inexacto: tragaba también los fallos reales sin avisar.
      toast.error('No pudimos compartir la imagen. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  // Shared preview body (backdrop + blur veil + card column + actions). Rendered either inside a native
  // Modal (default, top-level consumers) or as a bare absolute-fill overlay (embedded, inside a host Modal).
  const body = (
    <Pressable
      onPress={onClose}
      style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
    >
      {/* Backdrop desenfocado + velo negro — espejo de web PRShareCardModal.tsx:102
          (`bg-black/80 backdrop-blur-sm`): la BlurView desenfoca el overlay del resumen
          detrás y el velo lo oscurece (~0.8). Ambas capas con pointerEvents="none" para
          que el tap caiga en el Pressable de cierre. */}
      <BlurView intensity={24} tint="dark" style={StyleFill} pointerEvents="none" />
      <View style={[StyleFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} pointerEvents="none" />
      {/* stopPropagation: taps inside the card column must not dismiss */}
      <Pressable onPress={() => {}} style={{ width: cardWidth, gap: 16 }}>
        {/* Captured node. `collapsable={false}` is required on Android so the
            view is a real backing surface view-shot can snapshot. */}
        <View ref={cardRef} collapsable={false} style={SHADOWS[resolvedScheme].xl}>
          <ShareCardCanvas
            variant={variant}
            brandName={brandName}
            logoUrl={logoUrl}
            accent={accent}
            width={cardWidth}
          >
            {children}
          </ShareCardCanvas>
        </View>

        {/* Actions.
            DIVERGENCIA IDIOMÁTICA DOCUMENTADA (vs web PRShareCardModal.tsx:127-146, spec §12.4):
            el modal web muestra HASTA 3 botones — primario 'Compartir'/'Guardar imagen', un
            secundario 'Guardar' (Download) cuando `canShare`, y 'Cerrar'. Aquí sólo hay
            'Compartir' + 'Cerrar': la hoja de compartir NATIVA (expo-sharing / RN Share, arriba en
            handleShare) YA incluye "Guardar imagen"/"Save Image", por lo que un botón de descarga
            separado sería redundante y exigiría una nueva dependencia (expo-media-library +
            permiso de galería). El affordance de guardar se preserva vía la hoja nativa. */}
        <Pressable
          onPress={handleShare}
          disabled={busy}
          style={[styles.shareBtn, { backgroundColor: accent, opacity: busy ? 0.6 : 1 }]}
        >
          {/* El spinner reemplaza SÓLO el ícono; el label "Compartir" permanece (paridad con el
              modal web PRShareCardModal donde Loader2 sustituye el ícono, no el texto). */}
          {busy ? (
            <ActivityIndicator color={theme.primaryForeground} />
          ) : (
            <Share2 size={18} color={theme.primaryForeground} />
          )}
          <Text style={[styles.shareBtnLabel, { color: theme.primaryForeground }]}>Compartir</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <X size={16} color={W72} />
          <Text style={styles.closeBtnLabel}>Cerrar</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  )

  // Embedded: bare absolute-fill overlay (single native window — no nested Modal). See `embedded` prop.
  if (embedded) {
    if (!visible) return null
    return <View style={[StyleFill, { zIndex: 50, elevation: 50 }]}>{body}</View>
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {body}
    </Modal>
  )
}

// Absolute-fill for the gradient/overlay layers (kept as a shared object).
const StyleFill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 }

/** "#rrggbb" + alpha → "rgba(r,g,b,a)" (accent glow tint). */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = {
  // ── modal chrome ──
  backdrop: {
    // El oscurecimiento vive en el velo sobre la BlurView (ver render); el Pressable
    // queda transparente para no tapar el desenfoque (paridad web `bg-black/80 backdrop-blur-sm`).
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
  },
  shareBtn: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  shareBtnLabel: { fontFamily: FONT.uiBold, fontSize: 16 } as TextStyle,
  closeBtn: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  },
  closeBtnLabel: { fontFamily: FONT.uiSemibold, fontSize: 14, color: W72 } as TextStyle,

  // ── card body ──
  heroRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 8 },
}
