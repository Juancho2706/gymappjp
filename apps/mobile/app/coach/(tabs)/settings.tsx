import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Share, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { Camera, Check, ImageIcon, Info, Lock, Palette, Share2, Sparkles, Type } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader, Section, InfoRow } from '../../../components'
import { EvaLoader, EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { getCoachOrgContext } from '../../../lib/org'
import {
  getCoachBrandSettings,
  updateCoachBrandSettings,
  uploadCoachLogo,
  type CoachBrandSettings,
} from '../../../lib/coach-brand'
import { saveStoredBranding, type CoachBranding } from '../../../lib/branding'

const COLOR_PRESETS = ['#007AFF', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316']
const WORDMARK_COLORS = ['#8B5CF6', '#06B6D4', '#10B981']

export default function MiMarcaScreen() {
  const { theme, setBranding } = useTheme()

  const [loading, setLoading] = useState(true)
  const [orgManaged, setOrgManaged] = useState(false)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [settings, setSettings] = useState<CoachBrandSettings | null>(null)

  const [brandName, setBrandName] = useState('')
  const [color, setColor] = useState('#007AFF')
  const [useBrandColors, setUseBrandColors] = useState(false)
  const [useCustomLoader, setUseCustomLoader] = useState(false)
  const [loaderText, setLoaderText] = useState('')
  const [loaderTextColor, setLoaderTextColor] = useState('')
  const [loaderIconMode, setLoaderIconMode] = useState<'eva' | 'coach' | 'none'>('eva')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (async () => {
      const [ctx, s] = await Promise.all([getCoachOrgContext(), getCoachBrandSettings()])
      setOrgManaged(ctx.isOrgManaged)
      setOrgName(ctx.orgName)
      if (s) {
        setSettings(s)
        setBrandName(s.brandName)
        setColor(s.primaryColor)
        setUseBrandColors(s.useBrandColors)
        setUseCustomLoader(s.useCustomLoader)
        setLoaderText(s.loaderText ?? '')
        setLoaderTextColor(s.loaderTextColor ?? '')
        setLoaderIconMode((s.loaderIconMode as 'eva' | 'coach' | 'none') ?? 'eva')
        setWelcomeMessage(s.welcomeMessage ?? '')
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
    const url = `https://eva-app.cl/c/${settings.slug}`
    const code = settings.inviteCode ? ` Código: ${settings.inviteCode}.` : ''
    try {
      await Share.share({ message: `Entrená conmigo en ${brandName || 'mi app'}: ${url}.${code}` })
    } catch {}
  }

  async function save() {
    setError(null)
    setSaved(false)
    setSaving(true)
    const r = await updateCoachBrandSettings({
      brandName,
      primaryColor: color,
      useBrandColors,
      loaderText: loaderText || null,
      loaderTextColor: loaderTextColor || null,
      loaderIconMode,
      useCustomLoader,
      welcomeMessage: welcomeMessage || null,
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
              <Field theme={theme} label="Nombre de marca" value={brandName} onChangeText={setBrandName} placeholder="Mi Gimnasio" />
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
              <Field theme={theme} label="Hex personalizado" value={color} onChangeText={(v: string) => setColor(v.startsWith('#') ? v : `#${v}`)} placeholder="#007AFF" autoCapitalize="characters" />
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
              <Field theme={theme} label="Mensaje en el login del alumno" value={welcomeMessage} onChangeText={setWelcomeMessage} placeholder="Mensaje para tus alumnos al entrar" multiline />
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
            <InfoRow label="URL" value={`eva-app.cl/c/${settings.slug}`} last />
            <Button label="Compartir link" variant="outline" leftIcon={Share2} onPress={shareLink} full />
          </SectionCard>
        ) : null}
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
