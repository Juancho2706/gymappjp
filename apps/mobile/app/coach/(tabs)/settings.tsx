import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Share, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import QRCode from 'react-native-qrcode-svg'
import { Camera, Check, ImageIcon, Info, Lock, MessageSquare, Palette, RotateCcw, Share2, Smartphone, Sparkles, Type, Zap } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader, Section, InfoRow } from '../../../components'
import { EvaLoader, EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { getCoachOrgContext } from '../../../lib/org'
import { getCoachProfile } from '../../../lib/coach'
import { canUseBranding, type SubscriptionTier } from '../../../lib/coach-tiers'
import { getApiBaseUrl } from '../../../lib/api'
import {
  getCoachBrandSettings,
  updateCoachBrandSettings,
  uploadCoachLogo,
  type CoachBrandSettings,
} from '../../../lib/coach-brand'
import { saveStoredBranding, type CoachBranding } from '../../../lib/branding'

// Espejo del PRESET_COLORS de la web (BrandSettingsForm) — 8 presets, sin #007AFF (es el default,
// se restaura con el boton "Restaurar por defecto"). El hue grid extra (M-F9) se mantiene debajo.
const COLOR_PRESETS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316']
const DEFAULT_BRAND_COLOR = '#007AFF'
const WORDMARK_COLORS = ['#8B5CF6', '#06B6D4', '#10B981']

// Espejo de generateBrandPalette (web src/lib/color-utils.ts): paleta auto desde el color primario.
function hexToHslArr(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h *= 60
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}
function hslToHex2(h: number, s: number, l: number): string {
  const sN = s / 100, lN = l / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lN - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const toHex = (n: number) => { const v = Math.round((n + m) * 255).toString(16); return v.length === 1 ? '0' + v : v }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
function brandPalette(primaryHex: string) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(primaryHex) ? primaryHex : DEFAULT_BRAND_COLOR
  const [h, s, l] = hexToHslArr(safe)
  return {
    primary: safe,
    primaryDark: hslToHex2(h, Math.min(s + 10, 100), Math.max(l - 15, 10)),
    primaryLight: hslToHex2(h, Math.max(s - 10, 0), Math.min(l + 20, 95)),
    primarySurface: hslToHex2(h, Math.max(s - 20, 0), Math.min(l + 35, 97)),
    primaryGlow: hslToHex2(h, s, Math.min(l + 10, 90)),
  }
}

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

export default function MiMarcaScreen() {
  const { theme, setBranding } = useTheme()
  const router = useRouter()

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

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

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
      }
      setLoading(false)
    })()
  }, [])

  const isGradient = !loaderTextColor
  // Espejo EXACTO del brandScore de la web (BrandSettingsForm): logo 25 · color≠default 20 ·
  // mensaje bienvenida 15 · loader custom + texto 15 · modal bienvenida + contenido 15 ·
  // marca distinta del nombre completo 10.
  const brandScore = useMemo(() => {
    let s = 0
    if (logoUrl) s += 25
    if (color && color.toLowerCase() !== DEFAULT_BRAND_COLOR.toLowerCase()) s += 20
    if (welcomeMessage.trim()) s += 15
    if (useCustomLoader && loaderText.trim()) s += 15
    if (welcomeModalEnabled && welcomeModalContent.trim()) s += 15
    if (brandName && brandName !== fullName) s += 10
    return Math.min(100, s)
  }, [logoUrl, color, welcomeMessage, useCustomLoader, loaderText, welcomeModalEnabled, welcomeModalContent, brandName, fullName])

  async function pickLogo() {
    setError(null)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { setError('Permiso de galería denegado.'); return }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 })
    if (res.canceled || !res.assets?.[0]?.uri) return
    setUploading(true)
    const r = await uploadCoachLogo(res.assets[0].uri)
    setUploading(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo subir el logo.'); return }
    setLogoUrl(r.url ?? null)
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
    setError(null)
    setSaved(false)
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
    })
    setSaving(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return }
    setSaved(true)
    if (settings) {
      const next: CoachBranding = {
        coachId: settings.id,
        coachSlug: settings.slug,
        primaryColor: color,
        displayName: brandName,
        inviteCode: settings.inviteCode ?? '',
      }
      setBranding(next)
      saveStoredBranding(next).catch(() => {})
    }
  }

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Mi Marca" subtitle="Cargando..." />
        <EvaLoaderScreen subtitle="Cargando tu marca…" />
      </SafeAreaView>
    )
  }

  // M-F4: tier-gate — branding es starter+. Free (no gestionado por org) ve upsell.
  if (!orgManaged && !canUseBranding(tier)) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Mi Marca" subtitle="Personalizá la app de tus alumnos" />
        <View style={styles.gateWrap}>
          <View style={[styles.gateCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <View style={[styles.gateIcon, { backgroundColor: theme.primary + '1A' }]}>
              <Lock size={26} color={theme.primary} />
            </View>
            <Text style={[styles.gateTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Marca personalizada en Starter+</Text>
            <Text style={[styles.gateText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Subí a Starter (o superior) para personalizar el logo, los colores, el loader y el mensaje de bienvenida que ven tus alumnos al instalar tu app.
            </Text>
            <Button label="Ver planes y upgrade" onPress={() => Linking.openURL(`${getApiBaseUrl()}/coach/subscription`).catch(() => null)} full />
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title="Mi Marca" subtitle="Personalizá la app de tus alumnos" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Intro (espejo web: page.tsx header + WhatChangesList) */}
        <Text style={[styles.introTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
          Personaliza la app de tus alumnos
        </Text>
        <Text style={[styles.introBody, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Tus alumnos instalan tu app como si fuera tuya. Aquí defines cómo se ve: logo, colores, nombre y mensajes. Cada alumno ve TU marca, no la de EVA.
        </Text>
        <WhatChangesList theme={theme} />

        {/* Brand score */}
        <View style={styles.scoreRow}>
          <Text style={[styles.scoreLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Marca completada</Text>
          <Text style={[styles.scoreValue, { color: brandScore >= 80 ? theme.success : brandScore >= 50 ? '#F59E0B' : theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{brandScore}%</Text>
        </View>
        <View style={[styles.scoreTrack, { backgroundColor: theme.muted }]}>
          <View style={{ width: `${brandScore}%`, height: '100%', borderRadius: 99, backgroundColor: brandScore >= 80 ? theme.success : brandScore >= 50 ? '#F59E0B' : color }} />
        </View>

        {/* Live preview */}
        <View style={[styles.preview, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <View style={styles.previewTop}>
            <View style={[styles.logoBox, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImg} contentFit="cover" transition={150} />
              ) : (
                <Text style={[styles.logoInitial, { color, fontFamily: 'Montserrat_800ExtraBold' }]}>{(brandName || 'E').charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.previewName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{brandName || 'Tu marca'}</Text>
              <View style={styles.swatchRow}>
                <View style={[styles.swatchDot, { backgroundColor: color }]} />
                <Text style={[styles.previewColor, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{color.toUpperCase()}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.loaderPreview, { borderColor: theme.border }]}>
            {useCustomLoader && loaderText.trim() ? (
              <BrandWordmark text={loaderText.trim()} gradient={isGradient} solidColor={loaderTextColor || color} />
            ) : (
              <EvaLoader size="sm" />
            )}
          </View>
          {/* M-F6: preview full-screen de la app del alumno con la marca actual */}
          <Button
            label="Ver app del alumno (pantalla completa)"
            variant="outline"
            onPress={() => router.push({ pathname: '/coach/brand-preview', params: { color, name: brandName, logo: logoUrl ?? '', loaderText } })}
            full
          />
        </View>

        {orgManaged ? (
          <View style={[styles.lockCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <Lock size={18} color={theme.mutedForeground} />
            <Text style={[styles.lockText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {orgName ? `Tu marca la gestiona ${orgName}.` : 'Tu marca la gestiona tu organización.'} No podés editarla desde acá.
            </Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={[styles.errorBox, { borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '14' }]}>
                <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text>
              </View>
            ) : null}

            {/* Identity */}
            <SectionCard theme={theme} icon={Type} title="Identidad">
              <Field theme={theme} label="Tu nombre" value={fullName} onChangeText={setFullName} placeholder="Nombre y apellido" />
              <Field theme={theme} label="Nombre de marca" value={brandName} onChangeText={setBrandName} placeholder="Mi Gimnasio" />
              {/* P4: el CÓDIGO es el identificador principal — permanente, no editable. */}
              {settings?.inviteCode ? (
                <InfoRow label="Tu código (permanente)" value={settings.inviteCode} last={!settings.hasLegacySlug} />
              ) : null}
              {/* slug legacy: solo-lectura (inmutable). Sigue funcionando como alias para alumnos antiguos. */}
              {settings?.hasLegacySlug && settings.slug ? (
                <InfoRow label="URL legacy (alias, no editable)" value={`eva-app.cl/c/${settings.slug}`} last />
              ) : null}
            </SectionCard>

            {/* Logo */}
            <SectionCard theme={theme} icon={ImageIcon} title="Logo">
              <Button label={uploading ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'} variant="outline" leftIcon={Camera} onPress={pickLogo} disabled={uploading} full />
              <View style={[styles.noteRow, { borderColor: theme.border }]}>
                <Info size={13} color={theme.mutedForeground} />
                <Text style={[styles.note, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  El logo se ve dentro de la app. El ícono de la app instalada usa el de EVA (limitación de la tienda).
                </Text>
              </View>
            </SectionCard>

            {/* Color */}
            <SectionCard theme={theme} icon={Palette} title="Color de marca">
              <View style={styles.swatchGrid}>
                {COLOR_PRESETS.map((c) => {
                  const active = c.toLowerCase() === color.toLowerCase()
                  return (
                    <TouchableOpacity key={c} onPress={() => setColor(c)} activeOpacity={0.8}
                      style={[styles.swatch, { backgroundColor: c, borderColor: active ? theme.foreground : 'transparent' }]}>
                      {active ? <Check size={16} color="#fff" /> : null}
                    </TouchableOpacity>
                  )
                })}
              </View>
              {/* M-F9: paleta de matices (tap) */}
              <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Paleta de matices</Text>
              <View style={styles.hueGrid}>
                {LIGHTNESS.map((l) => (
                  <View key={l} style={styles.hueRow}>
                    {HUE_STEPS.map((h) => {
                      const hex = hslToHex(h, 75, l)
                      const active = hex.toLowerCase() === color.toLowerCase()
                      return (
                        <TouchableOpacity key={`${h}-${l}`} onPress={() => setColor(hex)} activeOpacity={0.8}
                          style={[styles.hueDot, { backgroundColor: hex, borderColor: active ? theme.foreground : 'transparent' }]} />
                      )
                    })}
                  </View>
                ))}
              </View>
              <Field theme={theme} label="Hex personalizado" value={color} onChangeText={(v: string) => setColor(v.startsWith('#') ? v : `#${v}`)} placeholder="#007AFF" autoCapitalize="characters" />
              <View style={styles.contrastRow}>
                {(() => {
                  const ci = contrastInfo(color)
                  if (!ci) return null
                  const okColor = ci.aa ? theme.success : ci.aaLarge ? '#F59E0B' : theme.destructive
                  return (
                    <Text style={{ flex: 1, fontSize: 12, color: okColor, fontFamily: 'Inter_600SemiBold' }}>
                      Texto {ci.txt} sobre tu color: {ci.ratio.toFixed(1)}:1 · {ci.aa ? 'AA ✓' : ci.aaLarge ? 'AA solo texto grande' : 'contraste bajo ⚠'}
                    </Text>
                  )
                })()}
                {color.toLowerCase() !== DEFAULT_BRAND_COLOR.toLowerCase() ? (
                  <TouchableOpacity onPress={() => setColor(DEFAULT_BRAND_COLOR)} activeOpacity={0.7} style={styles.resetBtn} hitSlop={6}>
                    <RotateCcw size={12} color={theme.mutedForeground} />
                    <Text style={{ fontSize: 12, color: theme.mutedForeground, fontFamily: theme.fontSans }}>Restaurar por defecto</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Paleta generada automáticamente (espejo web) */}
              <Text style={[styles.paletteLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>PALETA GENERADA AUTOMÁTICAMENTE</Text>
              {(() => {
                const p = brandPalette(color)
                const cells = [
                  { label: 'Primario', c: p.primary },
                  { label: 'Oscuro', c: p.primaryDark },
                  { label: 'Claro', c: p.primaryLight },
                  { label: 'Superficie', c: p.primarySurface },
                  { label: 'Brillo', c: p.primaryGlow },
                ]
                return (
                  <View style={styles.paletteRow}>
                    {cells.map((cell) => (
                      <View key={cell.label} style={styles.paletteCell}>
                        <View style={[styles.paletteSwatch, { backgroundColor: cell.c, borderColor: theme.border }]} />
                        <Text style={[styles.paletteCellLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{cell.label}</Text>
                      </View>
                    ))}
                  </View>
                )
              })()}

              {/* Vista previa del botón principal (espejo web) */}
              <View style={[styles.btnPreviewWrap, { borderColor: theme.border, backgroundColor: theme.muted }]}>
                <Text style={[styles.btnPreviewLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Vista previa del botón principal</Text>
                <View style={[styles.btnPreview, { backgroundColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_BRAND_COLOR }]}>
                  <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Montserrat_700Bold' }}>Ingresar al Panel</Text>
                </View>
              </View>

              <Toggle theme={theme} label="Aplicar mis colores a la app del alumno" on={useBrandColors} onPress={() => setUseBrandColors((v) => !v)} />
            </SectionCard>

            {/* Loader */}
            <SectionCard theme={theme} icon={Sparkles} title="Loader animado">
              <Toggle theme={theme} label="Usar loader personalizado" on={useCustomLoader} onPress={() => setUseCustomLoader((v) => !v)} />
              {useCustomLoader ? (
                <>
                  <Field theme={theme} label="Texto del loader (máx 10)" value={loaderText} onChangeText={(v: string) => setLoaderText(v.toUpperCase().slice(0, 10))} placeholder="MI MARCA" autoCapitalize="characters" />

                  <Label theme={theme}>Ícono</Label>
                  <Segmented theme={theme}
                    options={[{ value: 'eva', label: 'EVA' }, { value: 'coach', label: 'Mi logo', disabled: !logoUrl }, { value: 'none', label: 'Sin ícono' }]}
                    value={loaderIconMode} onChange={(v) => setLoaderIconMode(v as 'eva' | 'coach' | 'none')} />

                  <Label theme={theme}>Estilo del texto</Label>
                  {/* Espejo web: dos cards con preview en vivo del wordmark (gradiente vs sólido). */}
                  <View style={styles.styleCardRow}>
                    <TouchableOpacity
                      onPress={() => setLoaderTextColor('')}
                      activeOpacity={0.85}
                      style={[styles.styleCard, { borderColor: isGradient ? theme.primary : theme.border, backgroundColor: isGradient ? theme.primary + '0D' : theme.card }]}
                    >
                      <BrandWordmark text={(loaderText || 'EVA').toUpperCase()} gradient solidColor={color} />
                      <Text style={[styles.styleCardLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>GRADIENTE ANIMADO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setLoaderTextColor(loaderTextColor || color)}
                      activeOpacity={0.85}
                      style={[styles.styleCard, { borderColor: !isGradient ? theme.primary : theme.border, backgroundColor: !isGradient ? theme.primary + '0D' : theme.card }]}
                    >
                      <BrandWordmark text={(loaderText || 'EVA').toUpperCase()} gradient={false} solidColor={loaderTextColor || color} />
                      <Text style={[styles.styleCardLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>COLOR SÓLIDO</Text>
                    </TouchableOpacity>
                  </View>
                  {!isGradient ? (
                    <Field theme={theme} label="Color del texto (hex)" value={loaderTextColor} onChangeText={(v: string) => setLoaderTextColor(v.startsWith('#') || v === '' ? v : `#${v}`)} placeholder={color} autoCapitalize="characters" />
                  ) : null}
                  <Text style={{ fontSize: 11, color: theme.mutedForeground, fontFamily: theme.fontSans, lineHeight: 15 }}>
                    Gradiente: el mismo estilo animado que usa EVA. Color sólido: tu color de marca con animación de pulso.
                  </Text>
                </>
              ) : null}
            </SectionCard>

            {/* Welcome */}
            <SectionCard theme={theme} icon={Type} title="Bienvenida">
              <Field theme={theme} label="Mensaje en el login del alumno" value={welcomeMessage} onChangeText={setWelcomeMessage} placeholder="Mensaje para tus alumnos al entrar" multiline maxLength={240} />
              <Text style={{ fontSize: 11, color: theme.mutedForeground, fontFamily: theme.fontSans, textAlign: 'right' }}>{welcomeMessage.length}/240</Text>
            </SectionCard>

            {/* Welcome modal — aparece al entrar al dashboard del alumno */}
            <SectionCard theme={theme} icon={Sparkles} title="Mensaje al entrar al dashboard">
              <Toggle theme={theme} label="Mostrar mensaje o video al alumno" on={welcomeModalEnabled} onPress={() => setWelcomeModalEnabled((v) => !v)} />
              {welcomeModalEnabled ? (
                <>
                  <Segmented theme={theme}
                    options={[{ value: 'text', label: 'Texto' }, { value: 'video', label: 'Video' }]}
                    value={welcomeModalType} onChange={(v) => setWelcomeModalType(v as 'text' | 'video')} />
                  {welcomeModalType === 'text' ? (
                    <Field theme={theme} label="Mensaje" value={welcomeModalContent} onChangeText={setWelcomeModalContent} placeholder="Ej: ¡Feliz lunes! Esta semana nos enfocamos en..." multiline maxLength={1000} />
                  ) : (
                    <Field theme={theme} label="URL de YouTube o Vimeo" value={welcomeModalContent} onChangeText={setWelcomeModalContent} placeholder="https://youtube.com/watch?v=..." autoCapitalize="none" keyboardType="url" />
                  )}
                </>
              ) : null}
            </SectionCard>

            <Button label={saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar cambios'} onPress={save} disabled={saving} full />
          </>
        )}

        {/* Share */}
        {settings ? (
          <SectionCard theme={theme} icon={Share2} title="Compartir con alumnos">
            {settings.inviteCode ? (
              <View style={[styles.codeChip, { borderColor: theme.primary + '33', backgroundColor: theme.primary + '14' }]}>
                <Text style={[styles.codeText, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>{settings.inviteCode}</Text>
              </View>
            ) : null}
            {/* P4: URL principal por código (permanente). El slug solo se muestra como enlace alternativo legacy. */}
            <InfoRow label="URL" value={`eva-app.cl/c/${settings.inviteCode || settings.slug}`} last={!settings.hasLegacySlug} />
            {settings.hasLegacySlug ? (
              <InfoRow label="Enlace alternativo (legacy)" value={`eva-app.cl/c/${settings.slug}`} last />
            ) : null}
            {/* M-F7: QR del acceso del alumno (escaneable para instalar/entrar). */}
            <View style={styles.qrWrap}>
              <View style={[styles.qrBox, { backgroundColor: '#FFFFFF', borderColor: theme.border }]}>
                <QRCode value={`https://eva-app.cl/c/${settings.inviteCode || settings.slug}/login`} size={150} backgroundColor="#FFFFFF" color="#0F172A" />
              </View>
              <Text style={[styles.qrHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Tu alumno escanea y entra a tu app. Tu código es permanente.</Text>
            </View>
            <Button label="Compartir link" variant="outline" leftIcon={Share2} onPress={shareLink} full />
          </SectionCard>
        ) : null}

        {/* M-F5 (reemplazo): la cuenta NO se borra desde la app — se solicita por correo. */}
        <SectionCard theme={theme} icon={Lock} title="Cuenta">
          <Text style={[styles.dangerText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            La eliminación de cuenta no se hace desde la app. Escribinos a contacto@eva-app.cl y gestionamos la baja (datos, pagos y app de tus alumnos) según la Ley 21.719.
          </Text>
          <Button label="Solicitar baja por correo" variant="outline" onPress={() => Linking.openURL('mailto:contacto@eva-app.cl?subject=' + encodeURIComponent('Solicitud de baja de cuenta EVA')).catch(() => {})} full />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  )
}

function BrandWordmark({ text, gradient, solidColor }: { text: string; gradient: boolean; solidColor: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {text.split('').map((ch, i) => (
        <Text key={i} style={{ fontSize: 30, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -1, color: gradient ? WORDMARK_COLORS[i % WORDMARK_COLORS.length] : solidColor }}>
          {ch}
        </Text>
      ))}
    </View>
  )
}

// Espejo de WhatChangesList.tsx (web): grid de 6 items de "qué cambia" con tu marca.
const WHAT_CHANGES_ITEMS = [
  { icon: Palette, label: 'Color de marca', desc: 'Botones, activos, gráficos y brillos' },
  { icon: ImageIcon, label: 'Logo', desc: 'Login, navegación e instalación' },
  { icon: Type, label: 'Nombre', desc: 'Título de la app y pestaña' },
  { icon: MessageSquare, label: 'Mensaje de bienvenida', desc: 'Pantalla de login del alumno' },
  { icon: Zap, label: 'Loader animado', desc: 'Transiciones de carga' },
  { icon: Smartphone, label: 'Icono de app', desc: 'Pantalla de inicio del teléfono' },
]

function WhatChangesList({ theme }: { theme: any }) {
  return (
    <View style={styles.whatGrid}>
      {WHAT_CHANGES_ITEMS.map(({ icon: Icon, label, desc }) => (
        <View key={label} style={[styles.whatItem, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
          <View style={[styles.whatIcon, { backgroundColor: theme.primary + '1A' }]}>
            <Icon size={16} color={theme.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.whatLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{label}</Text>
            <Text style={[styles.whatDesc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{desc}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function SectionCard({ theme, icon: Icon, title, children }: { theme: any; icon: any; title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.sectionHead}>
        <Icon size={15} color={theme.primary} />
        <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

function Label({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{children}</Text>
}

function Field({ theme, label, multiline, ...rest }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput placeholderTextColor={theme.mutedForeground} multiline={multiline}
        style={[styles.input, multiline && { height: 84, textAlignVertical: 'top', paddingTop: 10 }, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} {...rest} />
    </View>
  )
}

function Segmented({ theme, options, value, onChange }: { theme: any; options: { value: string; label: string; disabled?: boolean }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={[styles.segmented, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <TouchableOpacity key={o.value} disabled={o.disabled} onPress={() => onChange(o.value)} activeOpacity={0.8}
            style={[styles.segItem, active && { backgroundColor: theme.primary }, o.disabled && { opacity: 0.4 }]}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{o.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function Toggle({ theme, label, on, onPress }: { theme: any; label: string; on: boolean; onPress: () => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleText, { color: theme.foreground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.switch, { backgroundColor: on ? theme.primary : theme.muted }]}>
        <View style={[styles.knob, { backgroundColor: '#fff', alignSelf: on ? 'flex-end' : 'flex-start' }]} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  gateCard: { borderWidth: 1, padding: 24, gap: 14, alignItems: 'center', maxWidth: 420, width: '100%' },
  gateIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  gateTitle: { fontSize: 19, textAlign: 'center', letterSpacing: -0.3 },
  gateText: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  hueGrid: { gap: 6 },
  hueRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  hueDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  qrWrap: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  qrBox: { padding: 12, borderRadius: 14, borderWidth: 1 },
  qrHint: { fontSize: 11.5, textAlign: 'center' },
  dangerText: { fontSize: 12.5, lineHeight: 18 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120, gap: 14 },
  introTitle: { fontSize: 20, letterSpacing: -0.3, lineHeight: 26 },
  introBody: { fontSize: 13, lineHeight: 19, marginTop: -6 },
  whatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  whatItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, padding: 12, width: '48.5%' },
  whatIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  whatLabel: { fontSize: 12.5 },
  whatDesc: { fontSize: 11, lineHeight: 14, marginTop: 2 },
  contrastRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  paletteLabel: { fontSize: 10, letterSpacing: 0.8, marginTop: 2 },
  paletteRow: { flexDirection: 'row', gap: 12 },
  paletteCell: { alignItems: 'center', gap: 4 },
  paletteSwatch: { width: 34, height: 34, borderRadius: 9, borderWidth: 1 },
  paletteCellLabel: { fontSize: 9 },
  btnPreviewWrap: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  btnPreviewLabel: { fontSize: 12 },
  btnPreview: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  styleCardRow: { flexDirection: 'row', gap: 8 },
  styleCard: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6 },
  styleCardLabel: { fontSize: 9, letterSpacing: 0.5 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreLabel: { fontSize: 12 },
  scoreValue: { fontSize: 14 },
  scoreTrack: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: -6 },
  preview: { padding: 16, borderWidth: 1, gap: 14 },
  previewTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoBox: { width: 64, height: 64, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: 64, height: 64 },
  logoInitial: { fontSize: 30 },
  previewName: { fontSize: 18, letterSpacing: -0.3 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  swatchDot: { width: 14, height: 14, borderRadius: 7 },
  previewColor: { fontSize: 12 },
  loaderPreview: { borderTopWidth: 1, paddingTop: 14, alignItems: 'center', justifyContent: 'center', minHeight: 64 },
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1 },
  lockText: { fontSize: 13, flex: 1, lineHeight: 18 },
  errorBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  sectionCard: { padding: 16, borderWidth: 1, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontSize: 14 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  fieldLabel: { fontSize: 12 },
  input: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  noteRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: 10, padding: 10 },
  note: { fontSize: 11, lineHeight: 16, flex: 1 },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  codeChip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  codeText: { fontSize: 18, letterSpacing: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 2 },
  toggleText: { fontSize: 14, flex: 1 },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11 },
})
