import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, Share, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { cssInterop } from 'nativewind'
import QRCode from 'react-native-qrcode-svg'
import { Camera, Check, Eye, ImageIcon, Info, Lock, Palette, Share2, Sparkles, Type } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, Input, Textarea, SegmentedTabs } from '../../../components'
import { Card } from '../../../components/Card'
import { Switch } from '../../../components/Switch'
import { EvaLoader, EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { toast } from '../../../components/Toast'
import { SHADOWS } from '../../../lib/shadows'
import { FONT } from '../../../lib/typography'
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

// Let NativeWind drive the lucide `color` via `text-*` classes (same DS pattern
// as the alumno perfil re-skin) so every icon color is a DS token — dark mode +
// the white-label brand ramp resolve at runtime. Icons used as Button leftIcons
// still receive their color from the Button (that path is unaffected).
for (const Icon of [Camera, Check, Eye, ImageIcon, Info, Lock, Palette, Share2, Sparkles, Type]) {
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

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

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
  const brandScore = useMemo(() => {
    let s = 0
    if (logoUrl) s += 25
    if (color && color.toLowerCase() !== '#007aff') s += 20
    if (welcomeMessage.trim()) s += 15
    if (useCustomLoader && loaderText.trim()) s += 20
    if (brandName.trim().length >= 2) s += 20
    return Math.min(100, s)
  }, [logoUrl, color, welcomeMessage, useCustomLoader, loaderText, brandName])

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
      (welcomeModalContent || '') !== (settings.welcomeModalContent || '')
    )
  }, [settings, fullName, brandName, color, useBrandColors, useCustomLoader, loaderText, loaderTextColor, loaderIconMode, welcomeMessage, welcomeModalEnabled, welcomeModalType, welcomeModalContent])

  async function pickLogo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { toast.error('Permiso de galería denegado.'); return }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 })
    if (res.canceled || !res.assets?.[0]?.uri) return
    setUploading(true)
    const r = await uploadCoachLogo(res.assets[0].uri)
    setUploading(false)
    if (!r.ok) { toast.error(r.error ?? 'No se pudo subir el logo.'); return }
    setLogoUrl(r.url ?? null)
    toast.success('Logo actualizado')
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
      })
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
    return <EvaLoaderScreen subtitle="Cargando tu marca…" />
  }

  // M-F4: tier-gate — branding es starter+. Free (no gestionado por org) ve upsell.
  if (!orgManaged && !canUseBranding(tier)) {
    return (
      <View className="flex-1 bg-surface-app">
        <AppBackground />
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
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

          {/* Live preview */}
          <Card variant="default" padding="md" style={{ gap: 14 }}>
            <View className="flex-row items-center" style={{ gap: 14 }}>
              <View className="items-center justify-center overflow-hidden rounded-xl border border-subtle bg-surface-sunken" style={{ width: 64, height: 64 }}>
                {logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={{ width: 64, height: 64 }} contentFit="cover" transition={150} />
                ) : (
                  <Text style={{ color, fontFamily: FONT.displayBold, fontSize: 30 }}>{(brandName || 'E').charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} className="font-display-bold text-strong" style={{ fontSize: 18, letterSpacing: -0.3 }}>
                  {brandName || 'Tu marca'}
                </Text>
                <View className="flex-row items-center" style={{ gap: 8, marginTop: 5 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
                  <Text className="text-muted" style={{ fontFamily: FONT.mono, fontSize: 12 }}>{color.toUpperCase()}</Text>
                </View>
              </View>
            </View>
            <View className="items-center justify-center border-t border-subtle" style={{ paddingTop: 14, minHeight: 64 }}>
              {useCustomLoader && loaderText.trim() ? (
                <BrandWordmark text={loaderText.trim()} gradient={isGradient} solidColor={loaderTextColor || color} />
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
              onPress={() => router.push({ pathname: '/coach/brand-preview', params: { color, name: brandName, logo: logoUrl ?? '', loaderText } })}
            />
          </Card>

          {orgManaged ? (
            <Card variant="default" padding="md" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Lock size={18} className="text-muted" />
              <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
                {orgName ? `Tu marca la gestiona ${orgName}.` : 'Tu marca la gestiona tu organización.'} No podés editarla desde acá.
              </Text>
            </Card>
          ) : (
            <>
              {/* Logo */}
              <SectionCard icon={ImageIcon} title="Logo">
                <Button
                  label={uploading ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  variant="secondary"
                  leftIcon={Camera}
                  onPress={pickLogo}
                  disabled={uploading}
                  loading={uploading}
                  full
                  testID="mimarca-logo-upload"
                />
                <View className="flex-row items-start rounded-control border border-subtle bg-surface-sunken" style={{ gap: 8, padding: 10 }}>
                  <Info size={13} className="text-muted" style={{ marginTop: 1 }} />
                  <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 11, lineHeight: 16 }}>
                    El logo se ve dentro de la app. El ícono de la app instalada usa el de EVA (limitación de la tienda).
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

              {/* Color / tema de marca */}
              <SectionCard icon={Palette} title="Color de marca">
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
                <ToggleRow
                  label="Aplicar mis colores a la app del alumno"
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

        {/* Guardado unificado (FAB) — flota sobre la cápsula de tabs cuando hay cambios sin guardar (parity web). */}
        {!orgManaged && dirty ? (
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 84 }}
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
