import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, Share, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { cssInterop } from 'nativewind'
import QRCode from 'react-native-qrcode-svg'
import { Camera, Check, ChevronDown, ChevronLeft, Eye, ImageIcon, Info, LayoutTemplate, Loader, Lock, Moon, Palette, Share2, Sparkles, Type } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, Input, Textarea, SegmentedTabs } from '../../../components'
import { Card } from '../../../components/Card'
import { Switch } from '../../../components/Switch'
import { Select } from '../../../components/Select'
import { GlowBorderCard } from '../../../components/GlowBorderCard'
import { AmbientBrandGlow } from '../../../components/AmbientBrandGlow'
import { EvaLoader, EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { toast } from '../../../components/Toast'
import { SHADOWS } from '../../../lib/shadows'
import { FONT } from '../../../lib/typography'
import { getCoachOrgContext } from '../../../lib/org'
import { getCoachProfile } from '../../../lib/coach'
import { canUseBranding, type SubscriptionTier } from '../../../lib/coach-tiers'
import { getApiBaseUrl } from '../../../lib/api'
import { THEME_PRESETS, getThemePreset, resolveBrandTheme, type BrandPreset } from '@eva/brand-kit'
import { FONT_KEY_TUPLE, LOADER_VARIANT_TUPLE } from '@eva/schemas'
import {
  getCoachBrandSettings,
  updateCoachBrandSettings,
  uploadCoachLogo,
  type CoachBrandSettings,
} from '../../../lib/coach-brand'
import { saveStoredBranding, type CoachBranding } from '../../../lib/branding'

// Let NativeWind drive the lucide `color` via `text-*` classes (same DS pattern
// as the alumno perfil re-skin) so every icon color is a DS token — dark mode +
// the white-label brand ramp resolve at runtime. Icons used as Button leftIcons
// still receive their color from the Button (that path is unaffected).
for (const Icon of [Camera, Check, ChevronDown, ChevronLeft, Eye, ImageIcon, Info, LayoutTemplate, Loader, Lock, Moon, Palette, Share2, Sparkles, Type]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

const COLOR_PRESETS = ['#007AFF', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316']
// EVA wordmark gradient stops (violet / cyan / emerald) — brand asset constant,
// same as EvaLoader; not a themable surface.
const WORDMARK_COLORS = ['#8B5CF6', '#06B6D4', '#10B981']

// M-F8: contraste WCAG del color de marca como fondo de botón (texto blanco vs negro).
function relLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  const ch = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase()
}

// M-F9: paleta de matices (tap) — picker sin dep nativa. 12 tonos × 3 luminancias.
const HUE_STEPS = Array.from({ length: 12 }, (_, i) => i * 30)
const LIGHTNESS = [42, 55, 68]

function contrastInfo(hex: string): { txt: string; ratio: number; aa: boolean; aaLarge: boolean } | null {
  const l = relLuminance(hex)
  if (l == null) return null
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  const cw = ratio(l, 1)
  const cb = ratio(l, 0)
  const best = cw >= cb ? { txt: 'blanco', ratio: cw } : { txt: 'negro', ratio: cb }
  return { ...best, aa: best.ratio >= 4.5, aaLarge: best.ratio >= 3 }
}

const HEX6 = /^#[0-9a-fA-F]{6}$/
// EVA defaults: si el color guardado es uno de estos NO es un custom legacy (mirror web EVA_DEFAULT_COLORS).
const EVA_DEFAULT_COLORS = new Set(['#007aff', '#10b981', '#2680ff'])

// ── Metadata white-label v2 (espejo de las tablas web brand-presets/brand-fonts/brand-loaders/brand-composer) ──
// Nombres de `feel` (mirror FEEL_META de la web) para el filtro/badge de la galería de temas.
const FEEL_ORDER = ['bold', 'calm', 'techy', 'warm'] as const
const FEEL_LABELS: Record<string, string> = { bold: 'Audaz', calm: 'Calmo', techy: 'Tech', warm: 'Cálido' }

// Etiquetas de las 12 fuentes curadas (mirror CURATED_FONTS). RN no carga estas familias → se muestra
// solo la etiqueta; el brand_font_key persistido lo renderiza el login del alumno (servido por web).
const FONT_LABELS: Record<string, string> = {
  inter: 'Inter', montserrat: 'Montserrat', 'plus-jakarta': 'Plus Jakarta', hanken: 'Hanken Grotesk',
  manrope: 'Manrope', poppins: 'Poppins', sora: 'Sora', 'space-grotesk': 'Space Grotesk',
  outfit: 'Outfit', figtree: 'Figtree', 'dm-sans': 'DM Sans', lexend: 'Lexend',
}

// Etiquetas/notas de las 7 variantes de loader (mirror LOADER_VARIANTS de la web).
const LOADER_VARIANT_META: Record<string, { label: string; note: string }> = {
  eva: { label: 'EVA', note: 'Wordmark animado (default)' },
  progreso: { label: 'Progreso', note: 'Barra que se llena' },
  anillo: { label: 'Anillo', note: 'Aro que gira' },
  radar: { label: 'Radar', note: 'Pings concéntricos' },
  cometa: { label: 'Cometa', note: 'Órbita con estela' },
  ritmo: { label: 'Ritmo', note: 'Barras que laten' },
  orbitas: { label: 'Órbitas', note: 'Puntos en órbita' },
}

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
  const [loaderTextColor, setLoaderTextColor] = useState('')
  const [loaderIconMode, setLoaderIconMode] = useState<'eva' | 'coach' | 'none'>('eva')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [welcomeModalEnabled, setWelcomeModalEnabled] = useState(false)
  const [welcomeModalType, setWelcomeModalType] = useState<'text' | 'video'>('text')
  const [welcomeModalContent, setWelcomeModalContent] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUrlDark, setLogoUrlDark] = useState<string | null>(null)

  // E7-10 — white-label v2 avanzado (mismas columnas que respeta el login del alumno, lib/branding.ts).
  const [themePresetKey, setThemePresetKey] = useState<string | null>(null)
  const [loginLayoutKey, setLoginLayoutKey] = useState<LoginLayoutKey>('clasico')
  const [secondaryColor, setSecondaryColor] = useState('')
  const [accentLight, setAccentLight] = useState('')
  const [accentDark, setAccentDark] = useState('')
  const [neutralTint, setNeutralTint] = useState(false)
  const [fontKey, setFontKey] = useState('')
  const [loaderVariant, setLoaderVariant] = useState('eva')
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
        setLoaderTextColor(s.loaderTextColor ?? '')
        setLoaderIconMode((s.loaderIconMode as 'eva' | 'coach' | 'none') ?? 'eva')
        setWelcomeMessage(s.welcomeMessage ?? '')
        setWelcomeModalEnabled(s.welcomeModalEnabled)
        setWelcomeModalType(s.welcomeModalType)
        setWelcomeModalContent(s.welcomeModalContent ?? '')
        setLogoUrl(s.logoUrl)
        setLogoUrlDark(s.logoUrlDark)
        setThemePresetKey(s.themePresetKey)
        setLoginLayoutKey(resolveLoginLayout(s.loginLayoutKey))
        setSecondaryColor(s.brandSecondaryColor ?? '')
        setAccentLight(s.accentLight ?? '')
        setAccentDark(s.accentDark ?? '')
        setNeutralTint(s.neutralTint)
        setFontKey(s.brandFontKey ?? '')
        setLoaderVariant(s.loaderVariant ?? 'eva')
      }
      setLoading(false)
    })()
  }, [])

  const isGradient = !loaderTextColor

  // E7-10 — tema (preset) activo gobierna el color de los previews (espejo de resolvePresetBranding):
  // sin preset ⇒ color libre legacy. El color libre se PRESERVA (reversible al chip "Personalizado").
  const activePreset = useMemo(() => getThemePreset(themePresetKey), [themePresetKey])
  const effectivePrimary = activePreset ? activePreset.brandColor : color
  const hasLegacyCustom = !!color && !EVA_DEFAULT_COLORS.has(color.toLowerCase())
  // Tema derivado en vivo (mismo motor que el render real del alumno) → previews del avanzado.
  const advTheme = useMemo(() => {
    const opt = (v: string) => (HEX6.test(v) ? v : null)
    const base = HEX6.test(effectivePrimary) ? effectivePrimary : '#10B981'
    return resolveBrandTheme({
      brandColor: base,
      accentLight: opt(accentLight),
      accentDark: opt(accentDark),
      secondaryLight: opt(secondaryColor),
      secondaryDark: opt(secondaryColor),
      neutralTint,
    })
  }, [effectivePrimary, accentLight, accentDark, secondaryColor, neutralTint])
  const tintThemes = useMemo(() => {
    const base = HEX6.test(effectivePrimary) ? effectivePrimary : '#10B981'
    return { off: resolveBrandTheme({ brandColor: base, neutralTint: false }), on: resolveBrandTheme({ brandColor: base, neutralTint: true }) }
  }, [effectivePrimary])

  const brandScore = useMemo(() => {
    let s = 0
    if (logoUrl) s += 20
    if (activePreset || (color && color.toLowerCase() !== '#007aff')) s += 15
    if (welcomeMessage.trim()) s += 15
    if (useCustomLoader && loaderText.trim()) s += 15
    if (brandName.trim().length >= 2) s += 15
    if (fontKey) s += 10
    if (loaderVariant && loaderVariant !== 'eva') s += 5
    if (HEX6.test(secondaryColor)) s += 5
    return Math.min(100, s)
  }, [logoUrl, activePreset, color, welcomeMessage, useCustomLoader, loaderText, brandName, fontKey, loaderVariant, secondaryColor])

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
      (loaderTextColor || '') !== (settings.loaderTextColor || '') ||
      loaderIconMode !== ((settings.loaderIconMode as string) ?? 'eva') ||
      (welcomeMessage || '') !== (settings.welcomeMessage || '') ||
      welcomeModalEnabled !== settings.welcomeModalEnabled ||
      welcomeModalType !== settings.welcomeModalType ||
      (welcomeModalContent || '') !== (settings.welcomeModalContent || '') ||
      // E7-10 — avanzado
      (themePresetKey ?? null) !== (settings.themePresetKey ?? null) ||
      loginLayoutKey !== resolveLoginLayout(settings.loginLayoutKey) ||
      (secondaryColor || '') !== (settings.brandSecondaryColor || '') ||
      (accentLight || '') !== (settings.accentLight || '') ||
      (accentDark || '') !== (settings.accentDark || '') ||
      neutralTint !== settings.neutralTint ||
      (fontKey || '') !== (settings.brandFontKey || '') ||
      (loaderVariant || 'eva') !== (settings.loaderVariant || 'eva')
    )
  }, [settings, fullName, brandName, color, useBrandColors, useCustomLoader, loaderText, loaderTextColor, loaderIconMode, welcomeMessage, welcomeModalEnabled, welcomeModalType, welcomeModalContent, themePresetKey, loginLayoutKey, secondaryColor, accentLight, accentDark, neutralTint, fontKey, loaderVariant])

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
    const url = `https://eva-app.cl/c/${publicId}`
    const codeLine = settings.inviteCode ? ` Tu código: ${settings.inviteCode}.` : ''
    try {
      await Share.share({ message: `Entrená conmigo en ${brandName || 'mi app'}: ${url}.${codeLine}` })
    } catch {}
  }

  async function save() {
    setSaving(true)
    const r = await updateCoachBrandSettings({
      fullName,
      brandName,
      primaryColor: color,
      useBrandColors,
      loaderText: loaderText || null,
      loaderTextColor: loaderTextColor || null,
      loaderIconMode,
      useCustomLoader,
      welcomeMessage: welcomeMessage || null,
      welcomeModalEnabled,
      welcomeModalContent: welcomeModalContent || null,
      welcomeModalType,
      // E7-10 — avanzado
      themePresetKey,
      loginLayoutKey,
      brandSecondaryColor: secondaryColor || null,
      accentLight: accentLight || null,
      accentDark: accentDark || null,
      neutralTint,
      brandFontKey: fontKey || null,
      loaderVariant,
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
        useCustomLoader,
        loaderText: loaderText || null,
        loaderTextColor: loaderTextColor || null,
        loaderIconMode,
        welcomeMessage: welcomeMessage || null,
        welcomeModalEnabled,
        welcomeModalContent: welcomeModalContent || null,
        welcomeModalType,
        logoUrlDark,
        themePresetKey,
        loginLayoutKey,
        brandSecondaryColor: secondaryColor || null,
        accentLight: accentLight || null,
        accentDark: accentDark || null,
        neutralTint,
        brandFontKey: fontKey || null,
        loaderVariant,
      })
      const next: CoachBranding = {
        coachId: settings.id,
        coachSlug: settings.slug,
        // Preset activo ⇒ el color efectivo es el del tema (espejo de resolvePresetBranding).
        primaryColor: effectivePrimary,
        displayName: brandName,
        inviteCode: settings.inviteCode ?? '',
      }
      setBranding(next)
      saveStoredBranding(next).catch(() => {})
    }
  }

  if (loading) {
    return <EvaLoaderScreen subtitle="Cargando tu marca…" />
  }

  // M-F4: tier-gate — branding es starter+. Free (no gestionado por org) ve upsell.
  if (!orgManaged && !canUseBranding(tier)) {
    return (
      <View className="flex-1 bg-surface-app">
        <AppBackground />
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <BackHeader />
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
            <ScreenTitle />
            <Card variant="default" padding="lg" style={{ alignItems: 'center', gap: 14, marginTop: 24 }}>
              <View className="items-center justify-center rounded-2xl bg-sport-100" style={{ width: 56, height: 56 }}>
                <Lock size={26} className="text-sport-600" />
              </View>
              <Text className="font-display-bold text-strong" style={{ fontSize: 19, textAlign: 'center', letterSpacing: -0.3 }}>
                Marca personalizada en Starter+
              </Text>
              <Text className="font-sans text-muted" style={{ fontSize: 13.5, lineHeight: 20, textAlign: 'center' }}>
                Subí a Starter (o superior) para personalizar el logo, los colores, el loader y el mensaje de bienvenida que ven tus alumnos al instalar tu app.
              </Text>
              <Button
                label="Ver planes y upgrade"
                variant="sport"
                full
                testID="mimarca-upgrade"
                onPress={() => Linking.openURL(`${getApiBaseUrl()}/coach/subscription`).catch(() => null)}
              />
            </Card>
          </ScrollView>
        </SafeAreaView>
      </View>
    )
  }

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
                <View className="items-center justify-center overflow-hidden rounded-xl border border-subtle bg-surface-sunken" style={{ width: 64, height: 64 }}>
                  {logoUrl ? (
                    <Image source={{ uri: logoUrl }} style={{ width: 64, height: 64 }} contentFit="cover" transition={150} />
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
              <View className="items-center justify-center border-t border-subtle" style={{ paddingTop: 14, minHeight: 64 }}>
                {useCustomLoader && loaderText.trim() ? (
                  <BrandWordmark text={loaderText.trim()} gradient={isGradient} solidColor={loaderTextColor || effectivePrimary} />
                ) : (
                  <EvaLoader size="sm" />
                )}
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
                {orgName ? `Tu marca la gestiona ${orgName}.` : 'Tu marca la gestiona tu organización.'} No podés editarla desde acá.
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

              {/* Identidad */}
              <SectionCard icon={Type} title="Identidad">
                <Input label="Tu nombre" value={fullName} onChangeText={setFullName} placeholder="Nombre y apellido" testID="mimarca-fullname" />
                <Input label="Nombre de marca" value={brandName} onChangeText={setBrandName} placeholder="Mi Gimnasio" testID="mimarca-brandname" />
                {/* P4: el CÓDIGO es el identificador principal — permanente, no editable. */}
                {settings?.inviteCode ? (
                  <ReadonlyRow label="Tu código (permanente)" value={settings.inviteCode} />
                ) : null}
                {/* slug legacy: solo-lectura (inmutable). Sigue funcionando como alias para alumnos antiguos. */}
                {settings?.hasLegacySlug && settings.slug ? (
                  <ReadonlyRow label="URL legacy (alias, no editable)" value={`eva-app.cl/c/${settings.slug}`} />
                ) : null}
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
                  Elegí un tema curado: color y tono en un tap. Todos están calibrados para verse legibles en claro y oscuro.
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

              {/* Color / tema de marca */}
              <SectionCard icon={Palette} title="Color de marca">
                {activePreset ? (
                  <View className="flex-row items-start rounded-control border border-sport-200 bg-sport-100" style={{ gap: 8, padding: 10 }}>
                    <Sparkles size={13} className="text-sport-600" style={{ marginTop: 1 }} />
                    <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 11.5, lineHeight: 16 }}>
                      Tu tema <Text className="font-sans-bold text-strong">{activePreset.label}</Text> define el color. Tu color libre queda guardado; elegí "Personalizado" arriba para volver a él.
                    </Text>
                  </View>
                ) : null}
                <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                  {COLOR_PRESETS.map((c) => {
                    const active = c.toLowerCase() === color.toLowerCase()
                    return (
                      <Pressable
                        key={c}
                        testID={`mimarca-color-${c.replace('#', '')}`}
                        accessibilityRole="button"
                        onPress={() => setColor(c)}
                        className={`items-center justify-center rounded-full ${active ? 'border-2 border-strong' : 'border-2 border-transparent'}`}
                        style={{ width: 40, height: 40, backgroundColor: c }}
                      >
                        {active ? <Check size={16} color="#FFFFFF" /> : null}
                      </Pressable>
                    )
                  })}
                </View>
                {/* M-F9: paleta de matices (tap) */}
                <Text className="font-sans-medium text-muted" style={{ fontSize: 12 }}>Paleta de matices</Text>
                <View style={{ gap: 6 }}>
                  {LIGHTNESS.map((l) => (
                    <View key={l} className="flex-row flex-wrap" style={{ gap: 6 }}>
                      {HUE_STEPS.map((h) => {
                        const hex = hslToHex(h, 75, l)
                        const active = hex.toLowerCase() === color.toLowerCase()
                        return (
                          <Pressable
                            key={`${h}-${l}`}
                            testID={`mimarca-hue-${h}-${l}`}
                            accessibilityRole="button"
                            onPress={() => setColor(hex)}
                            className={`rounded-full ${active ? 'border-2 border-strong' : 'border-2 border-transparent'}`}
                            style={{ width: 22, height: 22, backgroundColor: hex }}
                          />
                        )
                      })}
                    </View>
                  ))}
                </View>
                <Input
                  label="Hex personalizado"
                  value={color}
                  onChangeText={(v: string) => setColor(v.startsWith('#') ? v : `#${v}`)}
                  placeholder="#007AFF"
                  autoCapitalize="characters"
                  testID="mimarca-hex"
                />
                {(() => {
                  const ci = contrastInfo(color)
                  if (!ci) return null
                  const cls = ci.aa ? 'text-success-600' : ci.aaLarge ? 'text-warning-600' : 'text-danger-600'
                  return (
                    <Text className={`font-sans-semibold ${cls}`} style={{ fontSize: 12 }}>
                      Texto {ci.txt} sobre tu color: {ci.ratio.toFixed(1)}:1 · {ci.aa ? 'AA ✓' : ci.aaLarge ? 'AA solo texto grande' : 'contraste bajo ⚠'}
                    </Text>
                  )
                })()}
                {/* Escribe use_brand_colors_coach: tiñe el panel del COACH (no la app del alumno, que ya
                    hereda la marca por tier). Etiqueta alineada a la web ("usar mi marca en mi panel"). */}
                <ToggleRow
                  label="Usar mi marca también en mi panel"
                  value={useBrandColors}
                  onValueChange={setUseBrandColors}
                  testID="mimarca-use-brand-colors"
                />
              </SectionCard>

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
                        if (v === 'coach' && !logoUrl) { toast.info('Subí un logo primero para usarlo en el loader.'); return }
                        setLoaderIconMode(v as 'eva' | 'coach' | 'none')
                      }}
                    />

                    <FieldLabel>Estilo del texto</FieldLabel>
                    <SegmentedTabs
                      items={[{ value: 'gradient', label: 'Gradiente' }, { value: 'solid', label: 'Color sólido' }]}
                      value={isGradient ? 'gradient' : 'solid'}
                      onChange={(v) => setLoaderTextColor(v === 'gradient' ? '' : (loaderTextColor || color))}
                    />
                    {!isGradient ? (
                      <Input
                        label="Color del texto (hex)"
                        value={loaderTextColor}
                        onChangeText={(v: string) => setLoaderTextColor(v.startsWith('#') || v === '' ? v : `#${v}`)}
                        placeholder={color}
                        autoCapitalize="characters"
                        testID="mimarca-loader-color"
                      />
                    ) : null}
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

              {/* Branding avanzado (Pro) — acordeón: color2 + fuente + tinte + acento por modo + variante de
                  loader. Toda esta pantalla ya está detrás del gate canUseBranding (Pro+), así que acá no
                  hay teaser extra; el badge "PRO" es informativo. Previews en vivo con @eva/brand-kit. */}
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
                      <View className="rounded-full bg-sport-100" style={{ paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text className="font-sans-bold text-sport-600" style={{ fontSize: 9, letterSpacing: 0.4 }}>PRO</Text>
                      </View>
                    </View>
                    <Text className="font-sans text-muted" style={{ fontSize: 11.5 }} numberOfLines={2}>Color secundario, fuente, tinte, acento por modo y loader.</Text>
                  </View>
                  <ChevronDown size={18} className="text-muted" style={{ transform: [{ rotate: advancedOpen ? '180deg' : '0deg' }] }} />
                </Pressable>

                {advancedOpen ? (
                  <View style={{ gap: 20 }}>
                    {/* Color secundario */}
                    <View style={{ gap: 8 }}>
                      <FieldLabel>Color secundario</FieldLabel>
                      <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17 }}>Para badges, etiquetas y la 2ª serie de gráficos. Opcional.</Text>
                      <View className="flex-row items-center" style={{ gap: 10 }}>
                        <View className="border-subtle" style={{ width: 42, height: 42, borderRadius: 10, borderWidth: 1, backgroundColor: HEX6.test(secondaryColor) ? secondaryColor : advTheme.light.accent2 }} />
                        <View style={{ flex: 1 }}>
                          <Input
                            value={secondaryColor}
                            onChangeText={(v: string) => setSecondaryColor(v.startsWith('#') || v === '' ? v : `#${v}`)}
                            placeholder="#00C7BE (opcional)"
                            autoCapitalize="characters"
                            testID="mimarca-secondary"
                          />
                        </View>
                        {secondaryColor ? (
                          <Pressable onPress={() => setSecondaryColor('')} hitSlop={8} accessibilityRole="button">
                            <Text className="font-sans-medium text-muted" style={{ fontSize: 12, textDecorationLine: 'underline' }}>Quitar</Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <AdvPreviewFrame label={secondaryColor ? 'Así se ven tus badges' : 'Sin secundario · usa tu color principal'}>
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

                    {/* Tinte de marca + acento por modo */}
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
                      <FieldLabel>Acento por modo (opcional)</FieldLabel>
                      <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17 }}>Forzá un acento distinto en claro y oscuro. Vacío = se calcula solo desde tu color.</Text>
                      <Input label="Acento claro" value={accentLight} onChangeText={(v: string) => setAccentLight(v.startsWith('#') || v === '' ? v : `#${v}`)} placeholder="auto" autoCapitalize="characters" testID="mimarca-accent-light" />
                      <Input label="Acento oscuro" value={accentDark} onChangeText={(v: string) => setAccentDark(v.startsWith('#') || v === '' ? v : `#${v}`)} placeholder="auto" autoCapitalize="characters" testID="mimarca-accent-dark" />
                      <AdvPreviewFrame label="Acento resuelto por modo">
                        <View className="flex-row" style={{ gap: 8 }}>
                          {(['light', 'dark'] as const).map((mode) => {
                            const t = advTheme[mode]
                            return (
                              <View key={mode} style={{ flex: 1, borderRadius: 8, borderWidth: 1, padding: 8, backgroundColor: t.bg, borderColor: t.border }}>
                                <Text style={{ fontSize: 8, fontFamily: FONT.uiBold, letterSpacing: 0.5, color: t.textMuted, marginBottom: 5 }}>{mode === 'light' ? 'CLARO' : 'OSCURO'}</Text>
                                <View style={{ borderRadius: 6, paddingVertical: 4, alignItems: 'center', backgroundColor: t.accent }}>
                                  <Text style={{ fontSize: 10, fontFamily: FONT.uiBold, color: t.accentText }}>Acción</Text>
                                </View>
                              </View>
                            )
                          })}
                        </View>
                      </AdvPreviewFrame>
                    </View>

                    {/* Variante de loader (7) — escribe loader_variant. Solo etiqueta/nota (mirror grid web). */}
                    <View style={{ gap: 8 }}>
                      <FieldLabel>Estilo de la pantalla de carga</FieldLabel>
                      <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17 }}>La animación que ve tu alumno mientras carga su app.</Text>
                      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                        {LOADER_VARIANT_TUPLE.map((v) => {
                          const meta = LOADER_VARIANT_META[v]
                          const selected = (loaderVariant || 'eva') === v
                          return (
                            <Pressable
                              key={v}
                              testID={`mimarca-loader-variant-${v}`}
                              accessibilityRole="button"
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
              <ReadonlyRow label="URL" value={`eva-app.cl/c/${settings.inviteCode || settings.slug}`} />
              {settings.hasLegacySlug ? (
                <ReadonlyRow label="Enlace alternativo (legacy)" value={`eva-app.cl/c/${settings.slug}`} />
              ) : null}
              {/* M-F7: QR del acceso del alumno (escaneable para instalar/entrar). */}
              <View className="items-center" style={{ gap: 8, paddingVertical: 6 }}>
                <View className="border-subtle" style={{ backgroundColor: '#FFFFFF', padding: 12, borderRadius: 14, borderWidth: 1 }}>
                  <QRCode value={`https://eva-app.cl/c/${settings.inviteCode || settings.slug}/login`} size={150} backgroundColor="#FFFFFF" color="#0F172A" />
                </View>
                <Text className="font-sans text-muted" style={{ fontSize: 11.5, textAlign: 'center' }}>
                  Tu alumno escanea y entra a tu app. Tu código es permanente.
                </Text>
              </View>
              <Button label="Compartir link" variant="secondary" leftIcon={Share2} onPress={shareLink} full testID="mimarca-share" />
            </SectionCard>
          ) : null}

          {/* M-F5 (reemplazo): la cuenta NO se borra desde la app — se solicita por correo. */}
          <SectionCard icon={Lock} title="Cuenta">
            <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
              La eliminación de cuenta no se hace desde la app. Escribinos a contacto@eva-app.cl y gestionamos la baja (datos, pagos y app de tus alumnos) según la Ley 21.719.
            </Text>
            <Button
              label="Solicitar baja por correo"
              variant="secondary"
              full
              testID="mimarca-baja"
              onPress={() => Linking.openURL('mailto:contacto@eva-app.cl?subject=' + encodeURIComponent('Solicitud de baja de cuenta EVA')).catch(() => {})}
            />
          </SectionCard>
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
      <Text className="font-sans text-muted" style={{ fontSize: 13, marginTop: 4 }}>Personalizá la app de tus alumnos</Text>
    </View>
  )
}

/** Loader wordmark del preview — letras Archivo black con gradiente EVA o color sólido. */
function BrandWordmark({ text, gradient, solidColor }: { text: string; gradient: boolean; solidColor: string }) {
  return (
    <View className="flex-row">
      {text.split('').map((ch, i) => (
        <Text key={i} style={{ fontSize: 30, fontFamily: FONT.displayBlack, letterSpacing: -1, color: gradient ? WORDMARK_COLORS[i % WORDMARK_COLORS.length] : solidColor }}>
          {ch}
        </Text>
      ))}
    </View>
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
          <Image source={{ uri: logo }} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={150} />
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
