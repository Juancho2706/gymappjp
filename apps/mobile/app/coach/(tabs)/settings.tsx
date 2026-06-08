import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Share, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import QRCode from 'react-native-qrcode-svg'
import { Camera, Check, ImageIcon, Info, Lock, Palette, Share2, Sparkles, Type } from 'lucide-react-native'
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

const COLOR_PRESETS = ['#007AFF', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316']
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
  const brandScore = useMemo(() => {
    let s = 0
    if (logoUrl) s += 25
    if (color && color.toLowerCase() !== '#007aff') s += 20
    if (welcomeMessage.trim()) s += 15
    if (useCustomLoader && loaderText.trim()) s += 20
    if (brandName.trim().length >= 2) s += 20
    return Math.min(100, s)
  }, [logoUrl, color, welcomeMessage, useCustomLoader, loaderText, brandName])

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
              {(() => {
                const ci = contrastInfo(color)
                if (!ci) return null
                const okColor = ci.aa ? theme.success : ci.aaLarge ? '#F59E0B' : theme.destructive
                return (
                  <Text style={{ fontSize: 12, color: okColor, fontFamily: 'Inter_600SemiBold' }}>
                    Texto {ci.txt} sobre tu color: {ci.ratio.toFixed(1)}:1 · {ci.aa ? 'AA ✓' : ci.aaLarge ? 'AA solo texto grande' : 'contraste bajo ⚠'}
                  </Text>
                )
              })()}
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
                  <Segmented theme={theme}
                    options={[{ value: 'gradient', label: 'Gradiente' }, { value: 'solid', label: 'Color sólido' }]}
                    value={isGradient ? 'gradient' : 'solid'}
                    onChange={(v) => setLoaderTextColor(v === 'gradient' ? '' : (loaderTextColor || color))} />
                  {!isGradient ? (
                    <Field theme={theme} label="Color del texto (hex)" value={loaderTextColor} onChangeText={(v: string) => setLoaderTextColor(v.startsWith('#') || v === '' ? v : `#${v}`)} placeholder={color} autoCapitalize="characters" />
                  ) : null}
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
