import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useReducedMotion } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { cssInterop } from 'nativewind'
import QRCode from 'react-native-qrcode-svg'
import { Activity, Camera, Check, ChevronDown, ChevronLeft, Dumbbell, Eye, Flame, Heart, ImageIcon, Info, LayoutTemplate, Loader, Lock, Moon, Palette, Share2, Sparkles, Star, Type, Zap } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, Input, Textarea, SegmentedTabs } from '../../../components'
import { Card } from '../../../components/Card'
import { Switch } from '../../../components/Switch'
import { Select } from '../../../components/Select'
import { GlowBorderCard } from '../../../components/GlowBorderCard'
import { AmbientBrandGlow } from '../../../components/AmbientBrandGlow'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { CompositeLoaderView, LoaderVariantView, type LoaderVariantSize } from '../../../components/loaders/variants'
import { EvaFigure } from '../../../components/entry/EvaFigure'
import { AppBackground } from '../../../components/AppBackground'
import { toast } from '../../../components/Toast'
import { SHADOWS } from '../../../lib/shadows'
import { FONT } from '../../../lib/typography'
import { studentAppUrl, studentLoginUrl } from '../../../lib/student-links'
import { CircularBrandLogo } from '../../../components/CircularBrandLogo'
import { getCoachOrgContext } from '../../../lib/org'
import { getCoachProfile } from '../../../lib/coach'
import { type SubscriptionTier } from '../../../lib/coach-tiers'
import { THEME_PRESETS, getThemePreset, resolveBrandTheme, sealPair, type BrandPreset } from '@eva/brand-kit'
import { FONT_KEY_TUPLE } from '@eva/schemas'
import {
  DEFAULT_LOADER_COMPOSITE,
  LOADER_ANIMATION_KEYS,
  LOADER_ANIMATION_LABELS,
  LOADER_SYMBOL_KEYS,
  LOADER_TEXT_MAX,
  LOADER_VARIANTS,
  LOADER_VARIANT_TUPLE,
  parseLoaderConfig,
  resolveLoaderVariant,
  serializeLoaderConfig,
  type LoaderComposite,
  type LoaderSymbol,
  type LoaderVariant,
} from '../../../lib/brand-loaders'
import {
  getCoachBrandSettings,
  updateCoachBrandSettings,
  uploadCoachLogo,
  type CoachBrandSettings,
} from '../../../lib/coach-brand'
import { clearBranding, mergeStoredBranding, type CoachBranding } from '../../../lib/branding'

// Let NativeWind drive the lucide `color` via `text-*` classes (same DS pattern
// as the alumno perfil re-skin) so every icon color is a DS token — dark mode +
// the white-label brand ramp resolve at runtime. Icons used as Button leftIcons
// still receive their color from the Button (that path is unaffected).
for (const Icon of [Activity, Camera, Check, ChevronDown, ChevronLeft, Eye, ImageIcon, Info, LayoutTemplate, Loader, Lock, Moon, Palette, Share2, Sparkles, Type]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

// Paleta EVA del ejecutor (Sport / Aqua / Ember) — mismos swatches que la web
// (BrandSettingsForm.tsx "Colores EVA"). Constante de marca, no superficie tematizable.
const EVA_EXECUTOR_SWATCHES = ['#2680FF', '#18ABD4', '#FF6A3D']

// Iconos del compositor "Crear el mío" (mismos 6 que la web + logo/inicial).
const COMPOSER_ICONS: Record<Exclude<LoaderSymbol, 'logo' | 'initial'>, LucideIcon> = {
  dumbbell: Dumbbell,
  flame: Flame,
  bolt: Zap,
  heart: Heart,
  activity: Activity,
  star: Star,
}

// W1b: la rueda de color libre (swatches + paleta de matices + hex + contraste WCAG) se ELIMINÓ.
// La selección de color vive en la galería de temas (presets). Los helpers de HSL/contraste que la
// alimentaban se removieron con ella.

const HEX6 = /^#[0-9a-fA-F]{6}$/
/** Azul EVA (= token `--color-sport-600`), el color con el que se previsualiza sin marca valida. */
const EVA_BLUE = '#1462DC'
// EVA defaults: si el color guardado es uno de estos NO es un custom legacy (mirror web EVA_DEFAULT_COLORS).
// `#1462dc` es el azul EVA de hoy; los otros tres son defaults HISTORICOS que siguen guardados en
// cuentas viejas y tampoco son un color elegido por el coach, por eso no se borran de la lista.
const EVA_DEFAULT_COLORS = new Set(['#1462dc', '#007aff', '#10b981', '#2680ff'])

// ── Metadata white-label v2 (espejo de las tablas web brand-presets/brand-fonts/brand-loaders/brand-composer) ──
// Nombres de `feel` (mirror FEEL_META de la web) para el filtro/badge de la galería de temas.
const FEEL_ORDER = ['bold', 'calm', 'techy', 'warm'] as const
// Paridad 17-08: mismas etiquetas que FEEL_META web (Intenso/Sereno/Techy/Cálido).
const FEEL_LABELS: Record<string, string> = { bold: 'Intenso', calm: 'Sereno', techy: 'Techy', warm: 'Cálido' }

// Etiquetas de las 12 fuentes curadas (mirror CURATED_FONTS). RN no carga estas familias → se muestra
// solo la etiqueta; el brand_font_key persistido lo renderiza el login del alumno (servido por web).
const FONT_LABELS: Record<string, string> = {
  inter: 'Inter', montserrat: 'Montserrat', 'plus-jakarta': 'Plus Jakarta', hanken: 'Hanken Grotesk',
  manrope: 'Manrope', poppins: 'Poppins', sora: 'Sora', 'space-grotesk': 'Space Grotesk',
  outfit: 'Outfit', figtree: 'Figtree', 'dm-sans': 'DM Sans', lexend: 'Lexend',
}

// QA4: las etiquetas/notas de las 7 variantes ya NO se duplican acá — viven en
// `lib/brand-loaders.ts` (LOADER_VARIANTS), la misma fuente que usa el render real.

// Layouts de login (mirror LOGIN_LAYOUTS de brand-composer.ts; el login del alumno mobile ya los respeta).
const LOGIN_LAYOUT_KEYS = ['clasico', 'hero', 'energia', 'minimal'] as const
type LoginLayoutKey = (typeof LOGIN_LAYOUT_KEYS)[number]
const LOGIN_LAYOUT_META: Record<LoginLayoutKey, { label: string; note: string }> = {
  clasico: { label: 'Clásico', note: 'Hero con tu color + hoja' },
  hero: { label: 'Hero grande', note: 'Logo centrado con fundido' },
  energia: { label: 'Energía', note: 'Entrada animada del loader' },
  minimal: { label: 'Minimal', note: 'Tipografía sobre fondo sólido' },
}
function resolveLoginLayout(v?: string | null): LoginLayoutKey {
  return v && (LOGIN_LAYOUT_KEYS as readonly string[]).includes(v) ? (v as LoginLayoutKey) : 'clasico'
}

export default function MiMarcaScreen() {
  const { setBranding, resolvedScheme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [loading, setLoading] = useState(true)
  const [orgManaged, setOrgManaged] = useState(false)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [tier, setTier] = useState<SubscriptionTier>('free')
  const [settings, setSettings] = useState<CoachBrandSettings | null>(null)

  const [fullName, setFullName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [color, setColor] = useState('#007AFF')
  const [useBrandColors, setUseBrandColors] = useState(false)
  const [useCustomLoader, setUseCustomLoader] = useState(false)
  const [loaderText, setLoaderText] = useState('')
  // W-brand B4: murió el estado `loaderTextColor` — el color del texto lo decide el motor.
  const [loaderIconMode, setLoaderIconMode] = useState<'eva' | 'coach' | 'none'>('eva')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [welcomeModalEnabled, setWelcomeModalEnabled] = useState(false)
  const [welcomeModalType, setWelcomeModalType] = useState<'text' | 'video'>('text')
  const [welcomeModalContent, setWelcomeModalContent] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUrlDark, setLogoUrlDark] = useState<string | null>(null)

  // E7-10 — white-label v2 avanzado (mismas columnas que respeta el login del alumno, lib/branding.ts).
  // W-brand B1/B2: murieron los estados de secundario/acentos — el par del tema se deriva
  // (sealPair) o viene curado del preset; ya no hay hex editable.
  const [themePresetKey, setThemePresetKey] = useState<string | null>(null)
  const [loginLayoutKey, setLoginLayoutKey] = useState<LoginLayoutKey>('clasico')
  const [neutralTint, setNeutralTint] = useState(false)
  const [fontKey, setFontKey] = useState('')
  const [loaderVariant, setLoaderVariant] = useState('eva')
  // QA4 — compositor "Crear el mío" (`loader_config`). null ⇒ ruta "Elegir animación".
  // PRECEDE a la variante en el render (misma precedencia que la web).
  const [loaderConfig, setLoaderConfig] = useState<LoaderComposite | null>(null)
  // QA4 — tema del ejecutor del alumno (`executor_theme`): el ejecutor V3 ya lo consume en RN.
  const [executorTheme, setExecutorTheme] = useState<'coach' | 'eva'>('coach')
  // UI local del acordeón avanzado + galería.
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [feelFilter, setFeelFilter] = useState<'all' | (typeof FEEL_ORDER)[number]>('all')

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingDark, setUploadingDark] = useState(false)

  useEffect(() => {
    (async () => {
      const [ctx, s, profile] = await Promise.all([getCoachOrgContext(), getCoachBrandSettings(), getCoachProfile()])
      setOrgManaged(ctx.isOrgManaged)
      setOrgName(ctx.orgName)
      if (profile) setTier(profile.subscriptionTier)
      if (s) {
        setSettings(s)
        setFullName(s.fullName)
        setBrandName(s.brandName)
        setColor(s.primaryColor)
        setUseBrandColors(s.useBrandColors)
        setUseCustomLoader(s.useCustomLoader)
        setLoaderText(s.loaderText ?? '')
        setLoaderIconMode((s.loaderIconMode as 'eva' | 'coach' | 'none') ?? 'eva')
        setWelcomeMessage(s.welcomeMessage ?? '')
        setWelcomeModalEnabled(s.welcomeModalEnabled)
        setWelcomeModalType(s.welcomeModalType)
        setWelcomeModalContent(s.welcomeModalContent ?? '')
        setLogoUrl(s.logoUrl)
        setLogoUrlDark(s.logoUrlDark)
        setThemePresetKey(s.themePresetKey)
        setLoginLayoutKey(resolveLoginLayout(s.loginLayoutKey))
        setNeutralTint(s.neutralTint)
        setFontKey(s.brandFontKey ?? '')
        setLoaderVariant(s.loaderVariant ?? 'eva')
        setLoaderConfig(parseLoaderConfig(s.loaderConfig))
        setExecutorTheme(s.executorTheme === 'eva' ? 'eva' : 'coach')
      }
      setLoading(false)
    })()
  }, [])

  // E7-10 — tema (preset) activo gobierna el color de los previews (espejo de resolvePresetBranding):
  // sin preset ⇒ color libre legacy. El color libre se PRESERVA (reversible al chip "Personalizado").
  const activePreset = useMemo(() => getThemePreset(themePresetKey), [themePresetKey])
  const effectivePrimary = activePreset ? activePreset.brandColor : color
  const hasLegacyCustom = !!color && !EVA_DEFAULT_COLORS.has(color.toLowerCase())
  // W-brand B2 — par del tema EN VIVO (mismo contrato que resolveEffectiveCoachBrandTheme):
  // preset ⇒ par curado del catálogo (modo estricto de sealPair); sin preset ⇒ secundario
  // derivado del primario. Alimenta el preview del acordeón; ya no hay hex editable.
  const advPair = useMemo(() => {
    const base = HEX6.test(effectivePrimary) ? effectivePrimary : EVA_BLUE
    return sealPair({ brandColor: base, themePresetKey: themePresetKey ?? null })
  }, [effectivePrimary, themePresetKey])
  // Tema derivado en vivo (mismo motor que el render real del alumno) → previews del avanzado.
  // Acentos: solo los del preset (los almacenados dejaron de aplicar — B2).
  const advTheme = useMemo(() => {
    const base = HEX6.test(effectivePrimary) ? effectivePrimary : EVA_BLUE
    return resolveBrandTheme({
      brandColor: base,
      accentLight: activePreset?.accentLight ?? null,
      accentDark: activePreset?.accentDark ?? null,
      secondaryLight: advPair.secondary,
      secondaryDark: advPair.secondary,
      neutralTint,
    })
  }, [effectivePrimary, activePreset, advPair, neutralTint])
  const tintThemes = useMemo(() => {
    const base = HEX6.test(effectivePrimary) ? effectivePrimary : EVA_BLUE
    return { off: resolveBrandTheme({ brandColor: base, neutralTint: false }), on: resolveBrandTheme({ brandColor: base, neutralTint: true }) }
  }, [effectivePrimary])

  // Brand Score — pesos 1:1 con el web BrandSettingsForm (H6): logo20 · color15 · welcomeMsg10 ·
  // modal10 · brandName10 · loader10 · fuente10 · variante10. La fuente y la variante se cuentan
  // por su valor EFECTIVO (el preset activo aporta si el coach no eligió). W-brand B1: el criterio
  // "secundario 5" murió con su input — el par ahora existe siempre (curado o derivado).
  const effectiveFontKey = fontKey || (activePreset?.fontKey ?? '')
  const effectiveLoaderVariant = loaderVariant && loaderVariant !== 'eva' ? loaderVariant : (activePreset?.loaderVariant ?? 'eva')
  // Serialización estable del compositor — se compara y se persiste siempre por esta vía.
  const loaderConfigJson = useMemo(() => serializeLoaderConfig(loaderConfig), [loaderConfig])
  const brandScore = useMemo(() => {
    let s = 0
    if (logoUrl) s += 20
    // Paridad 17-08: 20 pts como en web (W-brand movió los 5 del secundario al tema; RN quedaba en 95).
    if (activePreset || (color && color.toLowerCase() !== '#007aff')) s += 20
    if (welcomeMessage.trim()) s += 10
    if (welcomeModalEnabled && welcomeModalContent.trim()) s += 10
    if (brandName.trim() && brandName.trim() !== fullName.trim()) s += 10
    if (useCustomLoader && loaderText.trim()) s += 10
    if (effectiveFontKey) s += 10
    // Variante O compositor (1:1 con web: "loader variante/config 10").
    if (loaderConfigJson || effectiveLoaderVariant !== 'eva') s += 10
    return Math.min(100, s)
  }, [logoUrl, activePreset, color, welcomeMessage, welcomeModalEnabled, welcomeModalContent, brandName, fullName, useCustomLoader, loaderText, effectiveFontKey, effectiveLoaderVariant, loaderConfigJson])

  // "Sin guardar" (dirty) — mirrors the web BrandSettingsForm indicator + drives
  // the unified save FAB. Logo is excluded: it persists immediately on upload.
  const dirty = useMemo(() => {
    if (!settings) return false
    return (
      fullName !== settings.fullName ||
      brandName !== settings.brandName ||
      color.toLowerCase() !== settings.primaryColor.toLowerCase() ||
      useBrandColors !== settings.useBrandColors ||
      useCustomLoader !== settings.useCustomLoader ||
      (loaderText || '') !== (settings.loaderText || '') ||
      loaderIconMode !== ((settings.loaderIconMode as string) ?? 'eva') ||
      (welcomeMessage || '') !== (settings.welcomeMessage || '') ||
      welcomeModalEnabled !== settings.welcomeModalEnabled ||
      welcomeModalType !== settings.welcomeModalType ||
      (welcomeModalContent || '') !== (settings.welcomeModalContent || '') ||
      // E7-10 — avanzado (W-brand B1/B2: secundario/acentos ya no son estado del editor)
      (themePresetKey ?? null) !== (settings.themePresetKey ?? null) ||
      loginLayoutKey !== resolveLoginLayout(settings.loginLayoutKey) ||
      neutralTint !== settings.neutralTint ||
      (fontKey || '') !== (settings.brandFontKey || '') ||
      (loaderVariant || 'eva') !== (settings.loaderVariant || 'eva') ||
      // QA4 — compositor + ejecutor
      loaderConfigJson !== (settings.loaderConfig ?? '') ||
      executorTheme !== (settings.executorTheme === 'eva' ? 'eva' : 'coach')
    )
  }, [settings, fullName, brandName, color, useBrandColors, useCustomLoader, loaderText, loaderIconMode, welcomeMessage, welcomeModalEnabled, welcomeModalType, welcomeModalContent, themePresetKey, loginLayoutKey, neutralTint, fontKey, loaderVariant, loaderConfigJson, executorTheme])

  async function pickLogo(variant: 'light' | 'dark' = 'light') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { toast.error('Permiso de galería denegado.'); return }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 })
    if (res.canceled || !res.assets?.[0]?.uri) return
    const setBusy = variant === 'dark' ? setUploadingDark : setUploading
    setBusy(true)
    // El logo persiste al instante (direct-to-Storage) — igual que el logo claro; no entra al FAB.
    const r = await uploadCoachLogo(res.assets[0].uri, variant)
    setBusy(false)
    if (!r.ok) { toast.error(r.error ?? 'No se pudo subir el logo.'); return }
    if (variant === 'dark') setLogoUrlDark(r.url ?? null)
    else setLogoUrl(r.url ?? null)
    toast.success(variant === 'dark' ? 'Logo oscuro actualizado' : 'Logo actualizado')
  }

  async function shareLink() {
    if (!settings) return
    // P4: el código es el identificador principal (permanente). El slug solo si es legacy.
    const publicId = settings.inviteCode || settings.slug
    const url = studentAppUrl(publicId)
    // El codigo va en su propia linea: pegado al final de la URL, el punto que cerraba la frase
    // se colaba DENTRO del enlace en varios clientes y al alumno le llegaba un link roto.
    const codeLine = settings.inviteCode ? `\nTu código: ${settings.inviteCode}` : ''
    try {
      // `url` ademas del texto, como los otros dos "Compartir link" de la app
      // (`CoachDashboardSections`): iOS arma la actividad de enlace con ese campo y Android lo
      // ignora, por eso la URL viaja TAMBIEN dentro del mensaje.
      await Share.share({ message: `Entrena conmigo en ${brandName || 'mi app'}: ${url}${codeLine}`, url })
    } catch {
      // Este catch estaba MUDO: si el menu de compartir no abria, el coach veia un boton que no
      // hacia nada y no habia forma de saber por que (reporte de un coach, 2026-08-12).
      toast.error('No pudimos abrir el menú para compartir. Copia el link de arriba.')
    }
  }

  async function save() {
    setSaving(true)
    const r = await updateCoachBrandSettings({
      fullName,
      brandName,
      primaryColor: color,
      useBrandColors,
      loaderText: loaderText || null,
      loaderIconMode,
      // Paridad web 17-08: sin texto no hay loader custom (web lo deriva del texto; el toggle solo no basta).
      useCustomLoader: useCustomLoader && loaderText.trim().length > 0,
      welcomeMessage: welcomeMessage || null,
      welcomeModalEnabled,
      welcomeModalContent: welcomeModalContent || null,
      welcomeModalType,
      // E7-10 — avanzado (W-brand B1/B2/B4: secundario/acentos/color de texto ya no viajan)
      themePresetKey,
      loginLayoutKey,
      neutralTint,
      brandFontKey: fontKey || null,
      loaderVariant,
      // QA4 — compositor + ejecutor (opt-in en coach-brand.ts: solo viajan si se mandan).
      loaderConfig: loaderConfigJson || null,
      executorTheme,
    })
    setSaving(false)
    if (!r.ok) { toast.error(r.error ?? 'No se pudo guardar.'); return }
    toast.success('Marca guardada')
    if (settings) {
      // Refrescar el baseline local para que "Sin guardar" (dirty) se apague tras guardar.
      setSettings({
        ...settings,
        fullName,
        brandName,
        primaryColor: color,
        useBrandColors,
        useCustomLoader: useCustomLoader && loaderText.trim().length > 0,
        loaderText: loaderText || null,
        loaderIconMode,
        welcomeMessage: welcomeMessage || null,
        welcomeModalEnabled,
        welcomeModalContent: welcomeModalContent || null,
        welcomeModalType,
        logoUrlDark,
        themePresetKey,
        loginLayoutKey,
        neutralTint,
        brandFontKey: fontKey || null,
        loaderVariant,
        loaderConfig: loaderConfigJson || null,
        executorTheme,
        logoUrl,
      })
      // QA4 (P0-2) — la cache de marca se escribe COMPLETA y por merge.
      // Antes este payload era parcial y `saveStoredBranding` reemplazaba el objeto entero: cada
      // Guardar borraba logo, loader (texto/icono/color/variante), welcome_message, login_layout y
      // executor_theme del device. Ahora se manda todo lo que el editor conoce y `mergeStoredBranding`
      // conserva lo que no conoce (mismo coach; si el coachId difiere, reemplaza).
      const patch: Partial<CoachBranding> = {
        coachId: settings.id,
        coachSlug: settings.slug,
        // Preset activo ⇒ el color efectivo es el del tema (espejo de resolvePresetBranding).
        primaryColor: effectivePrimary,
        displayName: brandName,
        inviteCode: settings.inviteCode ?? '',
        subscriptionTier: tier,
        themePresetKey,
        // W-brand B1/B2: campos muertos — null EXPLÍCITO para limpiar restos de la cache local
        // del device (mergeStoredBranding: null limpia). La DB no se toca (grandfather pasivo).
        brandSecondaryColor: null,
        accentLight: null,
        accentDark: null,
        neutralTint,
        brandFontKey: fontKey || null,
        logoUrl,
        logoUrlDark,
        welcomeMessage: welcomeMessage || null,
        loginLayoutKey,
        loaderVariant,
        loaderConfig: loaderConfigJson || null,
        useCustomLoader: useCustomLoader && loaderText.trim().length > 0,
        loaderText: loaderText || null,
        loaderIconMode,
        // W-brand B4: idem — se limpia el color de texto legacy cacheado.
        loaderTextColor: null,
        executorTheme,
        useBrandColorsCoach: useBrandColors,
      }
      // QA4 (P1-4) — "usar mi marca en mi panel" apagado ⇒ el panel del coach va neutro EVA
      // (paridad con BrandCoachLoadingShell / coach/layout.tsx en web). No afecta al alumno:
      // su app resuelve la marca desde el enlace/código del coach, no desde este device.
      if (!useBrandColors) {
        setBranding(null)
        clearBranding().catch(() => {})
      } else {
        const merged = await mergeStoredBranding(patch)
        setBranding(merged ?? (patch as CoachBranding))
      }
    }
  }

  if (loading) {
    return <EvaLoaderScreen subtitle="Cargando tu marca…" />
  }

  // Pricing v3 (owner 2026-08-21): el white-label está en TODOS los planes — Pro se paga por cupo
  // de alumnos y por sacarse el sello «Hecho con EVA», NO por la marca. Murió el tier-gate M-F4
  // («branding es starter+») y con él la pantalla «Marca personalizada no disponible»: el form ya
  // no lo gatea el tier. El caso `orgManaged` sigue igual (la marca la manda la organización).

  const scoreBarClass = brandScore >= 80 ? 'bg-success-500' : brandScore >= 50 ? 'bg-warning-500' : 'bg-primary'
  const scoreTextClass = brandScore >= 80 ? 'text-success-600' : brandScore >= 50 ? 'text-warning-600' : 'text-strong'

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <BackHeader />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 200, gap: 14 }} showsVerticalScrollIndicator={false}>
          <ScreenTitle />

          {/* Brand score + estado "Sin guardar" */}
          <View>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 8 }}>
              <Text className="font-sans-medium text-muted" style={{ fontSize: 12 }}>Marca completada</Text>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                {dirty ? (
                  <View className="rounded-full bg-warning-100" style={{ paddingHorizontal: 9, paddingVertical: 3 }}>
                    <Text className="font-sans-bold text-warning-700" style={{ fontSize: 10.5, letterSpacing: 0.3 }}>Sin guardar</Text>
                  </View>
                ) : null}
                <Text className={`font-sans-extra ${scoreTextClass}`} style={{ fontSize: 14 }}>{brandScore}%</Text>
              </View>
            </View>
            <View className="rounded-full bg-surface-sunken" style={{ height: 6, overflow: 'hidden' }}>
              <View className={`h-full rounded-full ${scoreBarClass}`} style={{ width: `${brandScore}%` }} />
            </View>
          </View>

          {/* Live preview — marco con glow de marca (GlowBorderCard) + halo ambiental (AmbientBrandGlow),
              ambos teñidos por el color EFECTIVO (preset activo o color libre) → refleja ediciones sin guardar. */}
          <GlowBorderCard tint={HEX6.test(effectivePrimary) ? effectivePrimary : undefined}>
            <Card variant="default" padding="md" style={{ gap: 14, overflow: 'hidden' }}>
              <AmbientBrandGlow accent={HEX6.test(effectivePrimary) ? effectivePrimary : undefined} />
              <View className="flex-row items-center" style={{ gap: 14 }}>
                <View className="items-center justify-center overflow-hidden rounded-full border border-subtle bg-surface-sunken" style={{ width: 64, height: 64 }}>
                  {logoUrl ? (
                    <CircularBrandLogo uri={logoUrl} size={64} backgroundColor="transparent" />
                  ) : (
                    <Text style={{ color: effectivePrimary, fontFamily: FONT.displayBold, fontSize: 30 }}>{(brandName || 'E').charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} className="font-display-bold text-strong" style={{ fontSize: 18, letterSpacing: -0.3 }}>
                    {brandName || 'Tu marca'}
                  </Text>
                  <View className="flex-row items-center" style={{ gap: 8, marginTop: 5 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: effectivePrimary }} />
                    <Text className="text-muted" style={{ fontFamily: FONT.mono, fontSize: 12 }}>{effectivePrimary.toUpperCase()}</Text>
                    {activePreset ? (
                      <View className="rounded-full bg-sport-100" style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text className="font-sans-bold text-sport-600" style={{ fontSize: 9.5 }}>{activePreset.label}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
              <View className="items-center justify-center border-t border-subtle" style={{ paddingTop: 14, minHeight: 96 }}>
                <LoaderPreview
                  config={loaderConfig}
                  variant={resolveLoaderVariant(loaderVariant)}
                  useCustomLoader={useCustomLoader}
                  loaderText={loaderText}
                  loaderIconMode={loaderIconMode}
                  logoUrl={logoUrl}
                  logoUrlDark={logoUrlDark}
                  fallbackColor={effectivePrimary}
                  size="md"
                />
              </View>
              {/* M-F6: preview full-screen de la app del alumno con la marca actual */}
              <Button
                label="Ver app del alumno (pantalla completa)"
                variant="secondary"
                leftIcon={Eye}
                full
                testID="mimarca-preview"
                onPress={() => router.push({ pathname: '/coach/brand-preview', params: { color: effectivePrimary, name: brandName, logo: logoUrl ?? '', loaderText } })}
              />
            </Card>
          </GlowBorderCard>

          {orgManaged ? (
            <Card variant="default" padding="md" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Lock size={18} className="text-muted" />
              <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
                {orgName ? `Tu marca la gestiona ${orgName}.` : 'Tu marca la gestiona tu organización.'} No puedes editarla desde acá.
              </Text>
            </Card>
          ) : (
            <>
              {/* Logo — dos slots (claro + oscuro), 1:1 con los LogoSlot de la web. */}
              <SectionCard icon={ImageIcon} title="Logo">
                <View className="flex-row" style={{ gap: 12 }}>
                  <LogoSlot
                    label="Logo claro"
                    hint="Para fondos claros."
                    logo={logoUrl}
                    brandName={brandName}
                    accent={effectivePrimary}
                    uploading={uploading}
                    onPress={() => pickLogo('light')}
                    testID="mimarca-logo-upload"
                  />
                  <LogoSlot
                    label="Logo oscuro"
                    hint="Se usa en modo oscuro."
                    dark
                    logo={logoUrlDark}
                    brandName={brandName}
                    accent={effectivePrimary}
                    uploading={uploadingDark}
                    onPress={() => pickLogo('dark')}
                    testID="mimarca-logo-dark-upload"
                  />
                </View>
                <View className="flex-row items-start rounded-control border border-subtle bg-surface-sunken" style={{ gap: 8, padding: 10 }}>
                  <Info size={13} className="text-muted" style={{ marginTop: 1 }} />
                  <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 11, lineHeight: 16 }}>
                    El logo se ve dentro de la app. El oscuro es opcional (si falta se usa el claro). El ícono de la app instalada usa el de EVA (limitación de la tienda).
                  </Text>
                </View>
              </SectionCard>

              {/* Identidad — orden 1:1 con web: nombre de marca PRIMERO (lo público), luego tu nombre (privado). */}
              <SectionCard icon={Type} title="Identidad de tu marca">
                <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17, marginTop: -4 }}>
                  Esta información es lo primero que ven tus alumnos al abrir tu app.
                </Text>
                <View style={{ gap: 6 }}>
                  <Input label="Nombre de tu marca" value={brandName} onChangeText={setBrandName} placeholder="Mi Gimnasio" testID="mimarca-brandname" />
                  <Text className="font-sans text-muted" style={{ fontSize: 10, lineHeight: 14 }}>
                    Nombre que ven tus alumnos en la app instalada, la pestaña del navegador y el título.
                  </Text>
                </View>
                {/* P4: el CÓDIGO es el identificador principal — permanente, no editable. */}
                {settings?.inviteCode ? (
                  <ReadonlyRow label="Tu código (permanente)" value={settings.inviteCode} />
                ) : null}
                {/* slug legacy: solo-lectura (inmutable). Sigue funcionando como alias para alumnos antiguos. */}
                {settings?.hasLegacySlug && settings.slug ? (
                  <ReadonlyRow label="URL legacy (alias, no editable)" value={studentAppUrl(settings.slug).replace('https://', '')} />
                ) : null}
                <View style={{ gap: 6 }}>
                  <Input label="Tu nombre completo" value={fullName} onChangeText={setFullName} placeholder="Nombre y apellido" testID="mimarca-fullname" />
                  <Text className="font-sans text-muted" style={{ fontSize: 10, lineHeight: 14 }}>
                    Privado — para facturación y soporte. Tus alumnos no lo ven.
                  </Text>
                </View>
              </SectionCard>

              {/* Bienvenida (login del alumno) */}
              <SectionCard icon={Type} title="Bienvenida">
                <Textarea
                  label="Mensaje en el login del alumno"
                  value={welcomeMessage}
                  onChangeText={setWelcomeMessage}
                  placeholder="Mensaje para tus alumnos al entrar"
                  maxLength={240}
                  showCount
                  minRows={3}
                  testID="mimarca-welcome-message"
                />
              </SectionCard>

              {/* Mensaje al entrar al dashboard del alumno */}
              <SectionCard icon={Sparkles} title="Mensaje al entrar al dashboard">
                <ToggleRow
                  label="Mostrar mensaje o video al alumno"
                  value={welcomeModalEnabled}
                  onValueChange={setWelcomeModalEnabled}
                  testID="mimarca-welcome-modal-enabled"
                />
                {welcomeModalEnabled ? (
                  <>
                    <SegmentedTabs
                      items={[{ value: 'text', label: 'Texto' }, { value: 'video', label: 'Video' }]}
                      value={welcomeModalType}
                      onChange={(v) => setWelcomeModalType(v as 'text' | 'video')}
                    />
                    {welcomeModalType === 'text' ? (
                      <Textarea
                        label="Mensaje"
                        value={welcomeModalContent}
                        onChangeText={setWelcomeModalContent}
                        placeholder="Ej: ¡Feliz lunes! Esta semana nos enfocamos en..."
                        maxLength={1000}
                        showCount
                        minRows={3}
                        testID="mimarca-modal-text"
                      />
                    ) : (
                      <Input
                        label="URL de YouTube o Vimeo"
                        value={welcomeModalContent}
                        onChangeText={setWelcomeModalContent}
                        placeholder="https://youtube.com/watch?v=..."
                        autoCapitalize="none"
                        keyboardType="url"
                        testID="mimarca-modal-url"
                      />
                    )}
                  </>
                ) : null}
              </SectionCard>

              {/* Tema de marca (galería de presets curados) — escribe theme_preset_key. El color libre
                  se preserva (reversible al chip "Personalizado"). El preset OVERRIDE al color al leer. */}
              <SectionCard icon={Sparkles} title="Tema de tu marca">
                <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
                  Elige un tema curado: color y tono en un tap. Todos están calibrados para verse legibles en claro y oscuro.
                </Text>
                {/* Filtro por feel */}
                <View className="flex-row flex-wrap" style={{ gap: 7 }}>
                  <FeelChip label="Todos" active={feelFilter === 'all'} onPress={() => setFeelFilter('all')} />
                  {FEEL_ORDER.map((f) => (
                    <FeelChip key={f} label={FEEL_LABELS[f]} active={feelFilter === f} onPress={() => setFeelFilter(f)} testID={`mimarca-theme-feel-${f}`} />
                  ))}
                </View>
                <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                  {hasLegacyCustom ? (
                    <PresetCard
                      legacyColor={color}
                      selected={themePresetKey === null}
                      onPress={() => setThemePresetKey(null)}
                      testID="mimarca-theme-legacy"
                    />
                  ) : null}
                  {THEME_PRESETS.filter((p) => feelFilter === 'all' || p.feel === feelFilter).map((p) => (
                    <PresetCard
                      key={p.key}
                      preset={p}
                      selected={themePresetKey === p.key}
                      onPress={() => setThemePresetKey(p.key)}
                      testID={`mimarca-theme-${p.key}`}
                    />
                  ))}
                </View>
              </SectionCard>

              {/* W1b: la rueda de color libre se ELIMINÓ — la selección de color vive en la galería de
                  temas (presets curados) de arriba. El color legacy se preserva en `color` (hidden) y es
                  reversible vía el chip "Personalizado". El toggle "usar mi marca en mi panel" se de-anidó
                  a su propia card, tras "Diseño del login" (1:1 con web). */}

              {/* Loader animado */}
              <SectionCard icon={Sparkles} title="Loader animado">
                <ToggleRow
                  label="Usar loader personalizado"
                  value={useCustomLoader}
                  onValueChange={setUseCustomLoader}
                  testID="mimarca-use-custom-loader"
                />
                {useCustomLoader ? (
                  <>
                    <Input
                      label="Texto del loader (máx 10)"
                      value={loaderText}
                      onChangeText={(v: string) => setLoaderText(v.toUpperCase().slice(0, 10))}
                      placeholder="MI MARCA"
                      autoCapitalize="characters"
                      testID="mimarca-loader-text"
                    />

                    <FieldLabel>Ícono</FieldLabel>
                    <SegmentedTabs
                      items={[{ value: 'eva', label: 'EVA' }, { value: 'coach', label: 'Mi logo' }, { value: 'none', label: 'Sin ícono' }]}
                      value={loaderIconMode}
                      onChange={(v) => {
                        // "Mi logo" requiere un logo subido (el web lo muestra deshabilitado).
                        if (v === 'coach' && !logoUrl) { toast.info('Sube un logo primero para usarlo en el loader.'); return }
                        setLoaderIconMode(v as 'eva' | 'coach' | 'none')
                      }}
                    />

                    {/* W-brand B4: murieron el selector Gradiente/Sólido y el input hex del color
                        del texto — el color lo decide el motor de contraste del tema (siempre
                        legible en claro y oscuro). */}
                    <Text className="font-sans text-muted" style={{ fontSize: 11, lineHeight: 15 }}>
                      El texto se pinta automáticamente con tu color de marca, calibrado para ser
                      legible en claro y oscuro.
                    </Text>
                  </>
                ) : null}
              </SectionCard>

              {/* Diseño del login del alumno (4 variantes) — escribe login_layout_key (el login mobile del
                  alumno ya lo respeta, app/(auth)/login.tsx). Los thumbs se tiñen con el color efectivo. */}
              <SectionCard icon={LayoutTemplate} title="Diseño del login">
                <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
                  Cómo se ve la primera pantalla que abren tus alumnos. Todas usan tu tema, logo y tipografía.
                </Text>
                <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                  {LOGIN_LAYOUT_KEYS.map((key) => {
                    const meta = LOGIN_LAYOUT_META[key]
                    const selected = loginLayoutKey === key
                    return (
                      <Pressable
                        key={key}
                        testID={`mimarca-layout-${key}`}
                        accessibilityRole="button"
                        onPress={() => setLoginLayoutKey(key)}
                        className={`rounded-2xl border p-2 ${selected ? 'border-sport-500 bg-sport-100' : 'border-subtle'}`}
                        style={{ width: '47%', gap: 8 }}
                      >
                        <View style={{ position: 'relative' }}>
                          <LoginLayoutThumb layout={key} accent={effectivePrimary} />
                          {selected ? (
                            <View className="absolute items-center justify-center rounded-full bg-sport-600" style={{ right: 6, top: 6, width: 18, height: 18 }}>
                              <Check size={11} color="#FFFFFF" />
                            </View>
                          ) : null}
                        </View>
                        <View>
                          <Text className="font-sans-bold text-strong" style={{ fontSize: 12.5 }} numberOfLines={1}>{meta.label}</Text>
                          <Text className="font-sans text-muted" style={{ fontSize: 10.5, lineHeight: 14 }} numberOfLines={2}>{meta.note}</Text>
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              </SectionCard>

              {/* Usar mi marca en mi panel — card propia (de-anidada del color): tiñe el chrome del COACH,
                  no la app del alumno (que ya hereda por tier). Escribe use_brand_colors_coach. 1:1 con web. */}
              <SectionCard icon={Palette} title="Tu panel">
                <ToggleRow
                  label="Usar mi marca también en mi panel"
                  value={useBrandColors}
                  onValueChange={setUseBrandColors}
                  testID="mimarca-use-brand-colors"
                />
                <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17 }}>
                  Si se activa, tu panel de coach usa tu color y estilos de marca. Si no, usa los del sistema. No afecta la app del alumno.
                </Text>
              </SectionCard>

              {/* Ejecutor de entrenamiento (executor_theme) — 1:1 con web (BrandSettingsForm).
                  El ejecutor V3 de RN ya consume este campo; hasta ahora no se podía elegir en mobile. */}
              <SectionCard icon={Activity} title="Ejecutor de entrenamiento">
                <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18, marginTop: -4 }}>
                  Elige los colores que ven tus alumnos mientras entrenan.
                </Text>
                <View className="flex-row" style={{ gap: 10 }}>
                  <ExecutorThemeCard
                    title="Mis colores"
                    note="Usa el color de tu marca."
                    swatches={[HEX6.test(effectivePrimary) ? effectivePrimary : '#007AFF']}
                    selected={executorTheme === 'coach'}
                    onPress={() => setExecutorTheme('coach')}
                    testID="mimarca-executor-coach"
                  />
                  <ExecutorThemeCard
                    title="Colores EVA"
                    note="Paleta EVA multicolor."
                    swatches={EVA_EXECUTOR_SWATCHES}
                    selected={executorTheme === 'eva'}
                    onPress={() => setExecutorTheme('eva')}
                    testID="mimarca-executor-eva"
                  />
                </View>
              </SectionCard>

              {/* Branding avanzado — acordeón: color2 + fuente + tinte + acento por modo + variante de
                  loader. Pricing v3 (owner 2026-08-21): el white-label está en todos los planes, así
                  que MURIÓ el badge "PRO" de este encabezado — decía que era pago y ya no lo es.
                  Previews en vivo con @eva/brand-kit. */}
              <Card variant="default" padding="md" style={{ gap: advancedOpen ? 16 : 0 }}>
                <Pressable
                  testID="mimarca-advanced-toggle"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: advancedOpen }}
                  onPress={() => setAdvancedOpen((v) => !v)}
                  className="flex-row items-center"
                  style={{ gap: 10 }}
                >
                  <View className="items-center justify-center rounded-control bg-sport-100" style={{ width: 34, height: 34 }}>
                    <Sparkles size={17} className="text-sport-600" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View className="flex-row items-center" style={{ gap: 7 }}>
                      <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>Branding avanzado</Text>
                    </View>
                    <Text className="font-sans text-muted" style={{ fontSize: 11.5 }} numberOfLines={2}>Par de colores del tema, fuente, tinte y pantalla de carga.</Text>
                  </View>
                  <ChevronDown size={18} className="text-muted" style={{ transform: [{ rotate: advancedOpen ? '180deg' : '0deg' }] }} />
                </Pressable>

                {advancedOpen ? (
                  <View style={{ gap: 20 }}>
                    {/* W-brand B1/B2: murió el input hex del secundario. El par lo decide el tema:
                        preset ⇒ par curado del catálogo; sin preset ⇒ derivado del primario vía
                        sealPair (misma fórmula que el Sello v2). Solo lectura. */}
                    <View style={{ gap: 8 }}>
                      <FieldLabel>Par de colores de tu tema</FieldLabel>
                      <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17 }}>
                        {activePreset
                          ? 'Tu tema trae su par curado: primario + secundario para badges, etiquetas y la 2ª serie de gráficos.'
                          : 'El secundario (badges, etiquetas y 2ª serie de gráficos) se deriva automáticamente de tu color principal.'}
                      </Text>
                      <View className="flex-row" style={{ gap: 10 }} testID="mimarca-theme-pair">
                        {([['Primario', advPair.primary], ['Secundario', advPair.secondary]] as const).map(([label, hex]) => (
                          <View key={label} className="flex-row items-center rounded-control border border-subtle bg-surface-sunken" style={{ flex: 1, gap: 8, padding: 8 }}>
                            <View className="border-subtle" style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, backgroundColor: hex }} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text className="font-sans-bold text-strong" style={{ fontSize: 11 }}>{label}</Text>
                              <Text className="text-muted" style={{ fontFamily: FONT.mono, fontSize: 10.5 }} numberOfLines={1}>{hex.toUpperCase()}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                      <AdvPreviewFrame label="Así se ven tus badges">
                        <View className="flex-row" style={{ gap: 8 }}>
                          {(['light', 'dark'] as const).map((mode) => {
                            const t = advTheme[mode]
                            return (
                              <View key={mode} style={{ flex: 1, borderRadius: 8, borderWidth: 1, padding: 8, backgroundColor: t.bg, borderColor: t.border }}>
                                <Text style={{ fontSize: 8, fontFamily: FONT.uiBold, letterSpacing: 0.5, color: t.textMuted, marginBottom: 5 }}>{mode === 'light' ? 'CLARO' : 'OSCURO'}</Text>
                                <View className="flex-row items-center" style={{ gap: 6 }}>
                                  <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: t.accent2 }}>
                                    <Text style={{ fontSize: 9, fontFamily: FONT.uiBold, color: t.accent2Text }}>Etiqueta</Text>
                                  </View>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent2 }} />
                                </View>
                              </View>
                            )
                          })}
                        </View>
                      </AdvPreviewFrame>
                    </View>

                    {/* Fuente de títulos (Select — RN no carga las familias, se persiste la key para el alumno web) */}
                    <View style={{ gap: 8 }}>
                      <FieldLabel>Fuente de títulos</FieldLabel>
                      <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17 }}>Se aplica a los títulos de la app del alumno. El cuerpo queda en la fuente base.</Text>
                      <Select
                        value={fontKey || '__default'}
                        onValueChange={(v: string) => setFontKey(v === '__default' ? '' : v)}
                        searchable
                        title="Fuente de títulos"
                        options={[{ value: '__default', label: 'Predeterminada (EVA)' }, ...FONT_KEY_TUPLE.map((k) => ({ value: k, label: FONT_LABELS[k] ?? k }))]}
                      />
                    </View>

                    {/* Tinte de marca */}
                    <View style={{ gap: 10 }}>
                      <ToggleRow label="Tinte de marca en los fondos" value={neutralTint} onValueChange={setNeutralTint} testID="mimarca-neutral-tint" />
                      <AdvPreviewFrame label="Sin tinte vs. con tinte (se nota más en oscuro)">
                        <View className="flex-row" style={{ gap: 8 }}>
                          {([['off', 'Sin tinte', tintThemes.off], ['on', 'Con tinte', tintThemes.on]] as const).map(([k, label, th]) => {
                            const active = (k === 'on') === neutralTint
                            const t = th.dark
                            return (
                              <View key={k} style={{ flex: 1, borderRadius: 10, borderWidth: 2, padding: 8, backgroundColor: t.bg, borderColor: active ? effectivePrimary : 'transparent' }}>
                                <Text style={{ fontSize: 8, fontFamily: FONT.uiBold, letterSpacing: 0.5, color: t.textMuted, marginBottom: 5 }}>{label.toUpperCase()}</Text>
                                <View style={{ borderRadius: 6, padding: 6, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, gap: 4 }}>
                                  <View style={{ height: 5, width: '75%', borderRadius: 3, backgroundColor: t.border }} />
                                  <View style={{ height: 5, width: '50%', borderRadius: 3, backgroundColor: t.border }} />
                                  <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: effectivePrimary }} />
                                </View>
                              </View>
                            )
                          })}
                        </View>
                      </AdvPreviewFrame>
                      {/* W-brand B1/B2: murieron los inputs "Acento claro/oscuro" — el acento se
                          calcula siempre desde el color principal (o lo trae el preset). */}
                    </View>

                    {/* Pantalla de carga — unificada: elegir una animación lista O armar la tuya
                        (rutas mutuamente excluyentes, 1:1 con BrandAdvancedSection de la web).
                        `loader_config` PRECEDE a `loader_variant` en el render, acá y en la web. */}
                    <View style={{ gap: 10 }}>
                      <FieldLabel>Pantalla de carga</FieldLabel>
                      <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17 }}>
                        Esto es lo que ve tu alumno mientras carga su app. También lo ves tú en tu panel.
                      </Text>
                      <View className="flex-row" style={{ gap: 8 }}>
                        <LoaderRouteCard
                          title="Elegir animación"
                          note="Una de las animaciones listas de EVA"
                          active={!loaderConfig}
                          onPress={() => setLoaderConfig(null)}
                          testID="mimarca-loader-route-variant"
                        />
                        <LoaderRouteCard
                          title="Crear el mío"
                          note="Combina símbolo, animación y texto"
                          active={!!loaderConfig}
                          onPress={() => setLoaderConfig((prev) => prev ?? DEFAULT_LOADER_COMPOSITE)}
                          testID="mimarca-loader-route-composer"
                        />
                      </View>

                      {loaderConfig ? (
                        <LoaderComposer
                          value={loaderConfig}
                          onChange={setLoaderConfig}
                          logoUrl={logoUrl}
                          brandName={brandName}
                        />
                      ) : (
                        <>
                          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                            {LOADER_VARIANT_TUPLE.map((v) => {
                              const meta = LOADER_VARIANTS[v]
                              const selected = resolveLoaderVariant(loaderVariant) === v
                              return (
                                <Pressable
                                  key={v}
                                  testID={`mimarca-loader-variant-${v}`}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected }}
                                  onPress={() => setLoaderVariant(v)}
                                  className={`rounded-xl border ${selected ? 'border-sport-500 bg-sport-100' : 'border-subtle'}`}
                                  style={{ width: '31%', padding: 9 }}
                                >
                                  <Text className="font-sans-bold text-strong" style={{ fontSize: 11.5 }} numberOfLines={1}>{meta.label}</Text>
                                  <Text className="font-sans text-muted" style={{ fontSize: 9.5, lineHeight: 13 }} numberOfLines={2}>{meta.note}</Text>
                                </Pressable>
                              )
                            })}
                          </View>
                          {/* Vista previa REAL: los mismos componentes que corren en la app. */}
                          <AdvPreviewFrame label="Vista previa en vivo">
                            <View className="items-center justify-center" style={{ minHeight: 130, overflow: 'hidden' }}>
                              <LoaderPreview
                                config={null}
                                variant={resolveLoaderVariant(loaderVariant)}
                                useCustomLoader={useCustomLoader}
                                loaderText={loaderText}
                                loaderIconMode={loaderIconMode}
                                logoUrl={logoUrl}
                                logoUrlDark={logoUrlDark}
                                fallbackColor={effectivePrimary}
                                size="md"
                              />
                            </View>
                          </AdvPreviewFrame>
                        </>
                      )}
                    </View>
                  </View>
                ) : null}
              </Card>
            </>
          )}

          {/* Compartir con alumnos */}
          {settings ? (
            <SectionCard icon={Share2} title="Compartir con alumnos">
              {settings.inviteCode ? (
                <View className="self-start rounded-control border border-sport-200 bg-sport-100" style={{ paddingHorizontal: 14, paddingVertical: 7 }}>
                  <Text className="font-display-bold text-sport-600" style={{ fontSize: 18, letterSpacing: 4 }}>{settings.inviteCode}</Text>
                </View>
              ) : null}
              {/* P4: URL principal por código (permanente). El slug solo se muestra como enlace alternativo legacy. */}
              <ReadonlyRow label="URL" value={studentAppUrl(settings.inviteCode || settings.slug).replace('https://', '')} />
              {settings.hasLegacySlug ? (
                <ReadonlyRow label="Enlace alternativo (legacy)" value={studentAppUrl(settings.slug).replace('https://', '')} />
              ) : null}
              {/* M-F7: QR del acceso del alumno (escaneable para instalar/entrar). */}
              <View className="items-center" style={{ gap: 8, paddingVertical: 6 }}>
                <View className="border-subtle" style={{ backgroundColor: '#FFFFFF', padding: 12, borderRadius: 14, borderWidth: 1 }}>
                  <QRCode value={studentLoginUrl(settings.inviteCode || settings.slug)} size={150} backgroundColor="#FFFFFF" color="#0F172A" />
                </View>
                <Text className="font-sans text-muted" style={{ fontSize: 11.5, textAlign: 'center' }}>
                  Tu alumno escanea y entra a tu app. Tu código es permanente.
                </Text>
              </View>
              <Button label="Compartir link" variant="secondary" leftIcon={Share2} onPress={shareLink} full testID="mimarca-share" />
            </SectionCard>
          ) : null}

          {/* La baja de cuenta se de-anidó a la "Zona de peligro" del hub Opciones (1:1 con web);
              ya no vive dentro de Mi Marca. */}
        </ScrollView>

        {/* Guardado unificado (FAB) — Mi Marca ahora es sub-pantalla del hub Opciones (pushed sobre
            las tabs), sin cápsula de tabs debajo: el FAB flota justo sobre el safe-area. */}
        {!orgManaged && dirty ? (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 20 }}
          >
            <Button
              label={saving ? 'Guardando...' : 'Guardar cambios'}
              variant="sport"
              full
              loading={saving}
              onPress={save}
              testID="mimarca-save"
              style={SHADOWS[resolvedScheme].lg}
            />
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  )
}

/** Cabecera de retorno al hub Opciones (Mi Marca es ahora sub-pantalla, 1:1 con /coach/modules). */
function BackHeader() {
  const router = useRouter()
  return (
    <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
      <Pressable
        testID="mimarca-back"
        accessibilityRole="button"
        accessibilityLabel="Volver a Opciones"
        onPress={() => router.back()}
        hitSlop={10}
        className="flex-row items-center"
        style={{ gap: 2, paddingVertical: 6, paddingHorizontal: 4 }}
      >
        <ChevronLeft size={22} strokeWidth={2.2} className="text-sport-600" />
        <Text className="font-sans-bold text-sport-600" style={{ fontSize: 15 }}>Opciones</Text>
      </Pressable>
    </View>
  )
}

/** Encabezado de pantalla (display black + subtítulo), 1:1 con el patrón re-skin. */
function ScreenTitle() {
  return (
    <View style={{ paddingTop: 16, paddingBottom: 4 }}>
      <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.52 }}>Mi Marca</Text>
      <Text className="font-sans text-muted" style={{ fontSize: 13, marginTop: 4 }}>Personaliza la app de tus alumnos</Text>
    </View>
  )
}

/**
 * Vista previa del loader — QA4 (P2-6): renderiza los MISMOS componentes que corren en la app
 * (components/loaders/*) con el estado EN VIVO del editor, respetando la precedencia real
 * loader_config > loader_variant > loader legacy (texto/ícono) > figura EVA.
 *
 * Antes el preview pintaba el wordmark con el degradado tricolor EVA mientras el render real lo
 * pintaba en color sólido: el coach elegía a ciegas.
 *
 * Límite conocido: las variantes leen `theme.primary` del contexto (la marca YA aplicada), así que
 * un cambio de tema/color sin guardar todavía no se refleja en el color de la animación.
 */
function LoaderPreview({
  config,
  variant,
  useCustomLoader,
  loaderText,
  loaderIconMode,
  logoUrl,
  logoUrlDark,
  fallbackColor,
  size = 'md',
}: {
  config: LoaderComposite | null
  variant: LoaderVariant
  useCustomLoader: boolean
  loaderText: string
  loaderIconMode: 'eva' | 'coach' | 'none'
  logoUrl: string | null
  logoUrlDark: string | null
  fallbackColor: string
  size?: LoaderVariantSize
}) {
  const { theme, resolvedScheme } = useTheme()
  const reduceMotion = useReducedMotion()
  const customText = loaderText.trim()
  // Misma regla que el runtime: sin loader custom el wordmark es 'EVA'.
  const word = useCustomLoader && customText ? customText.toUpperCase() : 'EVA'
  const showIcon = loaderIconMode !== 'none'
  // Logo por modo (el oscuro cae al claro), solo si el ícono es "Mi logo".
  const logoUri =
    loaderIconMode === 'coach'
      ? (resolvedScheme === 'dark' ? logoUrlDark || logoUrl : logoUrl) || null
      : null

  if (config) {
    return <CompositeLoaderView config={config} brandName={word} logoUri={logoUri} showIcon={showIcon} size={size} reduceMotion={reduceMotion} />
  }
  if (variant !== 'eva') {
    return <LoaderVariantView variant={variant} brandName={word} logoUri={logoUri} showIcon={showIcon} size={size} reduceMotion={reduceMotion} />
  }
  // Rama EVA legacy — espejo de EvaLegacyLoader, pero con el estado sin guardar del editor.
  return (
    <View className="items-center justify-center" style={{ gap: 10 }}>
      {logoUri ? (
        <CircularBrandLogo uri={logoUri} size={44} backgroundColor={theme.card} padding={4} />
      ) : showIcon ? (
        <EvaFigure size={44} style={resolvedScheme === 'dark' ? null : { tintColor: theme.foreground }} />
      ) : null}
      {useCustomLoader && customText ? (
        // W-brand B4: el color del texto ya no es configurable — va en el color de marca efectivo.
        <Text style={{ fontSize: 24, lineHeight: 28, color: fallbackColor, fontFamily: FONT.displayBold, letterSpacing: -0.5 }}>
          {word}
        </Text>
      ) : null}
    </View>
  )
}

/** Tarjeta de ruta de la pantalla de carga: "Elegir animación" vs "Crear el mío" (excluyentes). */
function LoaderRouteCard({ title, note, active, onPress, testID }: { title: string; note: string; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`rounded-xl border-2 ${active ? 'border-sport-500 bg-sport-100' : 'border-subtle'}`}
      style={{ flex: 1, padding: 10, gap: 2 }}
    >
      <Text className="font-sans-bold text-strong" style={{ fontSize: 12 }} numberOfLines={1}>{title}</Text>
      <Text className="font-sans text-muted" style={{ fontSize: 10, lineHeight: 13 }} numberOfLines={2}>{note}</Text>
    </Pressable>
  )
}

/**
 * Compositor "Crear el mío" (`loader_config`) — espejo de `_components/LoaderComposer.tsx` de la web:
 * símbolo × animación × texto opcional. No es un editor libre: combina piezas parametrizadas.
 * La vista previa es el MISMO `CompositeLoaderView` que renderiza la app del alumno.
 */
function LoaderComposer({ value, onChange, logoUrl, brandName }: {
  value: LoaderComposite; onChange: (next: LoaderComposite) => void; logoUrl: string | null; brandName: string
}) {
  const { theme } = useTheme()
  const reduceMotion = useReducedMotion()
  const patch = (p: Partial<LoaderComposite>) => onChange({ ...value, ...p })
  const initial = (brandName.trim().charAt(0) || 'E').toUpperCase()
  const word = (value.text?.trim() || brandName.trim() || 'EVA').toUpperCase()

  return (
    <View className="rounded-xl border border-subtle" style={{ padding: 12, gap: 12 }}>
      <View style={{ gap: 6 }}>
        <FieldLabel>Símbolo</FieldLabel>
        <Text className="font-sans text-muted" style={{ fontSize: 11, lineHeight: 15 }}>La figura que gira o late al centro de la animación.</Text>
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {LOADER_SYMBOL_KEYS.map((key) => {
            const selected = value.symbol === key
            const disabled = key === 'logo' && !logoUrl
            const tint = selected ? theme.primary : theme.mutedForeground
            const Icon = key === 'logo' || key === 'initial' ? null : COMPOSER_ICONS[key]
            return (
              <Pressable
                key={key}
                testID={`mimarca-loader-symbol-${key}`}
                accessibilityRole="button"
                accessibilityLabel={`Símbolo ${key}`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => {
                  if (disabled) { toast.info('Sube un logo primero para usarlo en el loader.'); return }
                  patch({ symbol: key })
                }}
                className={`items-center justify-center rounded-xl border-2 ${selected ? 'border-sport-500 bg-sport-100' : 'border-subtle'}`}
                style={{ width: '22%', height: 52, opacity: disabled ? 0.4 : 1 }}
              >
                {key === 'logo' ? (
                  logoUrl ? (
                    <CircularBrandLogo uri={logoUrl} size={26} backgroundColor={theme.card} padding={2} />
                  ) : (
                    <Text className="font-sans-semibold text-muted" style={{ fontSize: 9.5 }}>Logo</Text>
                  )
                ) : key === 'initial' ? (
                  <Text style={{ fontSize: 20, color: tint, fontFamily: FONT.displayBold }}>{initial}</Text>
                ) : Icon ? (
                  <Icon size={20} color={tint} strokeWidth={2.2} />
                ) : null}
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <FieldLabel>Animación</FieldLabel>
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {LOADER_ANIMATION_KEYS.map((anim) => {
            const selected = value.animation === anim
            return (
              <Pressable
                key={anim}
                testID={`mimarca-loader-anim-${anim}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => patch({ animation: anim })}
                className={`items-center justify-center rounded-xl border-2 ${selected ? 'border-sport-500 bg-sport-100' : 'border-subtle'}`}
                style={{ width: '47%', paddingVertical: 9 }}
              >
                <Text className={`font-sans-bold ${selected ? 'text-sport-600' : 'text-muted'}`} style={{ fontSize: 12 }}>
                  {LOADER_ANIMATION_LABELS[anim]}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <Input
        label={`Texto del loader (máx ${LOADER_TEXT_MAX})`}
        value={value.text ?? ''}
        onChangeText={(v: string) => {
          const up = v.toUpperCase().slice(0, LOADER_TEXT_MAX)
          patch({ text: up.trim() ? up : undefined })
        }}
        placeholder={(brandName.trim() || 'EVA').toUpperCase()}
        autoCapitalize="characters"
        testID="mimarca-loader-composite-text"
      />
      <Text className="font-sans text-muted" style={{ fontSize: 10.5, lineHeight: 14, marginTop: -4 }}>
        Vacío = usa el nombre de tu marca.
      </Text>

      <AdvPreviewFrame label="Así se ve al cargar la app">
        <View className="items-center justify-center" style={{ minHeight: 130, overflow: 'hidden' }}>
          <CompositeLoaderView
            config={value}
            brandName={word}
            logoUri={value.symbol === 'logo' ? logoUrl : null}
            showIcon
            size="md"
            reduceMotion={reduceMotion}
          />
        </View>
      </AdvPreviewFrame>
    </View>
  )
}

/** Tarjeta de tema del ejecutor ("Mis colores" / "Colores EVA") — mirror del par de cards web. */
function ExecutorThemeCard({ title, note, swatches, selected, onPress, testID }: {
  title: string; note: string; swatches: string[]; selected: boolean; onPress: () => void; testID?: string
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-control border ${selected ? 'border-sport-500 bg-sport-100' : 'border-subtle'}`}
      style={{ flex: 1, padding: 12, gap: 8 }}
    >
      <View className="flex-row items-center justify-between" style={{ gap: 6 }}>
        <Text className="font-sans-bold text-strong" style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>{title}</Text>
        {selected ? <Check size={14} className="text-sport-600" /> : null}
      </View>
      <View className="flex-row" style={{ gap: 6 }}>
        {swatches.map((c) => (
          <View key={c} className="border-subtle" style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, backgroundColor: c }} />
        ))}
      </View>
      <Text className="font-sans text-muted" style={{ fontSize: 10.5, lineHeight: 14 }} numberOfLines={2}>{note}</Text>
    </Pressable>
  )
}

/** Sección: Card DS con cabecera de ícono (tinte de marca) + título. */
function SectionCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <Card variant="default" padding="md" style={{ gap: 12 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Icon size={15} className="text-primary" />
        <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>{title}</Text>
      </View>
      {children}
    </Card>
  )
}

/** Fila read-only estilo Input deshabilitado (código permanente, slug legacy, URL). */
function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text className="font-sans-semibold text-strong" style={{ fontSize: 13 }}>{label}</Text>
      <View className="justify-center rounded-control border border-subtle bg-surface-sunken" style={{ paddingHorizontal: 14, height: 46 }}>
        <Text className="font-sans-medium text-muted" style={{ fontSize: 14 }} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  )
}

/** Etiqueta de campo (uppercase, para los selectores del loader). */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-sans-bold text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 }}>
      {children}
    </Text>
  )
}

/** Fila con Switch DS (E0-E2). testID va en el wrapper (el Switch no expone testID). */
function ToggleRow({ label, value, onValueChange, testID }: { label: string; value: boolean; onValueChange: (next: boolean) => void; testID?: string }) {
  return (
    <View className="flex-row items-center justify-between" style={{ gap: 12, marginTop: 2 }}>
      <Text className="font-sans text-strong" style={{ flex: 1, fontSize: 14 }}>{label}</Text>
      <View testID={testID}>
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    </View>
  )
}

/** Slot de logo (claro u oscuro) — thumbnail + botón de subida. Mirror del LogoSlot de la web. */
function LogoSlot({ label, hint, dark, logo, brandName, accent, uploading, onPress, testID }: {
  label: string; hint: string; dark?: boolean; logo: string | null; brandName: string; accent: string; uploading: boolean; onPress: () => void; testID?: string
}) {
  return (
    <View style={{ flex: 1, gap: 7 }}>
      <View className="flex-row items-center" style={{ gap: 5 }}>
        {dark ? <Moon size={12} className="text-muted" /> : null}
        <Text className="font-sans-bold text-strong" style={{ fontSize: 11.5 }}>{label}</Text>
      </View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`Subir ${label}`}
        onPress={onPress}
        disabled={uploading}
        className={`items-center justify-center overflow-hidden rounded-control border border-dashed border-subtle ${dark ? '' : 'bg-surface-sunken'}`}
        style={{ aspectRatio: 16 / 9, backgroundColor: dark ? '#0A0D12' : undefined }}
      >
        {logo ? (
          <CircularBrandLogo uri={logo} size={80} backgroundColor={dark ? '#0A0D12' : '#FFFFFF'} padding={7} />
        ) : (
          <Text style={{ color: dark ? '#94A3B8' : accent, fontFamily: FONT.displayBold, fontSize: 22 }}>{(brandName || 'E').charAt(0).toUpperCase()}</Text>
        )}
        <View className="absolute flex-row items-center" style={{ bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.42)', paddingVertical: 3, justifyContent: 'center', gap: 4 }}>
          <Camera size={11} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontFamily: FONT.uiBold }}>{uploading ? 'Subiendo…' : logo ? 'Cambiar' : 'Subir'}</Text>
        </View>
      </Pressable>
      <Text className="font-sans text-muted" style={{ fontSize: 10 }}>{hint}</Text>
    </View>
  )
}

/** Chip de filtro por "feel" de la galería de temas. */
function FeelChip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-full border ${active ? 'border-sport-500 bg-sport-100' : 'border-subtle'}`}
      style={{ paddingHorizontal: 12, paddingVertical: 5 }}
    >
      <Text className={`font-sans-semibold ${active ? 'text-sport-600' : 'text-muted'}`} style={{ fontSize: 12 }}>{label}</Text>
    </Pressable>
  )
}

/** Tarjeta de un preset de tema (o el chip "Personalizado" legacy). Swatch de la paleta + label + feel. */
function PresetCard({ preset, legacyColor, selected, onPress, testID }: {
  preset?: BrandPreset; legacyColor?: string; selected: boolean; onPress: () => void; testID?: string
}) {
  const label = preset ? preset.label : 'Personalizado'
  const sub = preset ? (FEEL_LABELS[preset.feel] ?? preset.feel) : 'Tu color actual'
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-2xl border p-2.5 ${selected ? 'border-sport-500 bg-sport-100' : 'border-subtle'}`}
      style={{ width: '47%', gap: 8 }}
    >
      <View style={{ position: 'relative' }}>
        <View className="flex-row overflow-hidden rounded-lg border border-subtle" style={{ height: 32 }}>
          {preset ? (
            <>
              <View style={{ flex: 1, backgroundColor: preset.brandColor }} />
              <View style={{ width: '30%', backgroundColor: preset.secondaryColor }} />
              <View style={{ width: '22%', backgroundColor: preset.accentLight ?? preset.brandColor }} />
            </>
          ) : (
            <View style={{ flex: 1, backgroundColor: legacyColor || '#007AFF' }} />
          )}
        </View>
        {selected ? (
          <View className="absolute items-center justify-center rounded-full bg-sport-600" style={{ right: 4, top: 4, width: 17, height: 17 }}>
            <Check size={10} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <View>
        <Text className="font-sans-bold text-strong" style={{ fontSize: 12.5 }} numberOfLines={1}>{label}</Text>
        <View className="flex-row items-center" style={{ gap: 3 }}>
          <Sparkles size={9} className="text-muted" />
          <Text className="font-sans text-muted" style={{ fontSize: 10 }} numberOfLines={1}>{sub}</Text>
        </View>
      </View>
    </Pressable>
  )
}

/** Marco chico para los mini-previews del branding avanzado (mirror PreviewFrame de la web). */
function AdvPreviewFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="rounded-lg border border-subtle bg-surface-sunken" style={{ padding: 10, gap: 6 }}>
      <Text className="font-sans-semibold text-muted" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
      {children}
    </View>
  )
}

/** Mini-maqueta esquemática de cada layout de login (mirror del Thumb de la web LoginLayoutPicker). */
function LoginLayoutThumb({ layout, accent }: { layout: LoginLayoutKey; accent: string }) {
  const frame = { height: 64, width: '100%' as const, borderRadius: 8, overflow: 'hidden' as const, borderWidth: 1 }
  if (layout === 'clasico') {
    return (
      <View className="border-subtle bg-surface-sunken" style={frame}>
        <View style={{ height: 28, backgroundColor: accent }} />
        <View className="items-center bg-surface-card" style={{ marginTop: -8, width: '85%', alignSelf: 'center', flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, paddingTop: 8, gap: 4 }}>
          <View style={{ height: 5, width: 32, borderRadius: 3, backgroundColor: accent, opacity: 0.5 }} />
          <View className="bg-surface-sunken" style={{ height: 5, width: 48, borderRadius: 3 }} />
        </View>
      </View>
    )
  }
  if (layout === 'hero') {
    return (
      <View className="border-subtle items-center justify-center" style={[frame, { backgroundColor: withAlpha(accent, 0.12), gap: 6 }]}>
        <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: accent }} />
        <View className="bg-surface-sunken" style={{ height: 5, width: 40, borderRadius: 3 }} />
      </View>
    )
  }
  if (layout === 'energia') {
    return (
      <View className="border-subtle items-center justify-center" style={[frame, { backgroundColor: withAlpha(accent, 0.09) }]}>
        <View className="items-center justify-center" style={{ width: 34, height: 34 }}>
          <View style={{ position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: accent, opacity: 0.35 }} />
          <View style={{ position: 'absolute', width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: accent, opacity: 0.18 }} />
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: accent }} />
        </View>
      </View>
    )
  }
  // minimal
  return (
    <View className="border-subtle bg-surface-sunken items-center justify-center" style={[frame, { gap: 6 }]}>
      <View style={{ height: 8, width: 56, borderRadius: 3, backgroundColor: accent }} />
      <View className="bg-surface-card" style={{ height: 5, width: 40, borderRadius: 3 }} />
      <View className="bg-surface-card" style={{ height: 5, width: 64, borderRadius: 3 }} />
    </View>
  )
}

/** rgba() a partir de un hex sólido a una opacidad dada (tinte de los thumbs de login). */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return `rgba(38,128,255,${a})`
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
