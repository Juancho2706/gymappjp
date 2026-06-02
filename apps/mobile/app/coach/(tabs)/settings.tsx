import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { Camera, Check, Lock } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader, Section, InfoRow } from '../../../components'
import { EvaLoader, EvaLoaderScreen } from '../../../components/EvaLoader'
import { getCoachOrgContext } from '../../../lib/org'
import {
  getCoachBrandSettings,
  updateCoachBrandSettings,
  uploadCoachLogo,
  type CoachBrandSettings,
} from '../../../lib/coach-brand'
import { saveStoredBranding, type CoachBranding } from '../../../lib/branding'

const COLOR_PRESETS = ['#007AFF', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#F97316']

export default function MiMarcaScreen() {
  const { theme, setBranding } = useTheme()
  const insets = useSafeAreaInsets()

  const [loading, setLoading] = useState(true)
  const [orgManaged, setOrgManaged] = useState(false)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [settings, setSettings] = useState<CoachBrandSettings | null>(null)

  // Editable state
  const [brandName, setBrandName] = useState('')
  const [color, setColor] = useState('#007AFF')
  const [useBrandColors, setUseBrandColors] = useState(false)
  const [useCustomLoader, setUseCustomLoader] = useState(false)
  const [loaderText, setLoaderText] = useState('')
  const [loaderTextColor, setLoaderTextColor] = useState('')
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
        setWelcomeMessage(s.welcomeMessage ?? '')
        setLogoUrl(s.logoUrl)
      }
      setLoading(false)
    })()
  }, [])

  async function pickLogo() {
    setError(null)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { setError('Permiso de galería denegado.'); return }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    })
    if (res.canceled || !res.assets?.[0]?.uri) return
    setUploading(true)
    const r = await uploadCoachLogo(res.assets[0].uri)
    setUploading(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo subir el logo.'); return }
    setLogoUrl(r.url ?? null)
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
      useCustomLoader,
      welcomeMessage: welcomeMessage || null,
    })
    setSaving(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return }
    setSaved(true)
    // Adopt the coach's own brand accent across the app.
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
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Mi Marca" subtitle="Cargando..." />
        <EvaLoaderScreen subtitle="Cargando tu marca…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Mi Marca" subtitle="Personalizá la app de tus alumnos" />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Live preview */}
        <View style={[styles.preview, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <View style={styles.previewTop}>
            <View style={[styles.logoBox, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImg} contentFit="cover" transition={150} />
              ) : (
                <Text style={[styles.logoInitial, { color, fontFamily: 'Montserrat_800ExtraBold' }]}>
                  {(brandName || 'E').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.previewName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                {brandName || 'Tu marca'}
              </Text>
              <View style={styles.swatchRow}>
                <View style={[styles.swatchDot, { backgroundColor: color }]} />
                <Text style={[styles.previewColor, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{color.toUpperCase()}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.loaderPreview, { borderColor: theme.border }]}>
            {useCustomLoader && loaderText.trim() ? (
              <Text style={{ fontSize: 30, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -1, color: loaderTextColor || color }}>
                {loaderText.trim()}
              </Text>
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

            {/* Logo */}
            <Button label={uploading ? 'Subiendo...' : 'Cambiar logo'} variant="outline" leftIcon={Camera} onPress={pickLogo} disabled={uploading} full />

            {/* Brand name */}
            <Field theme={theme} label="Nombre de marca" value={brandName} onChangeText={setBrandName} placeholder="Mi Gimnasio" />

            {/* Color */}
            <Label theme={theme}>Color de marca</Label>
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

            {/* Loader */}
            <Toggle theme={theme} label="Usar loader personalizado" on={useCustomLoader} onPress={() => setUseCustomLoader((v) => !v)} />
            {useCustomLoader ? (
              <>
                <Field theme={theme} label="Texto del loader" value={loaderText} onChangeText={setLoaderText} placeholder="Mi Marca" />
                <Field theme={theme} label="Color del texto (hex)" value={loaderTextColor} onChangeText={(v: string) => setLoaderTextColor(v.startsWith('#') || v === '' ? v : `#${v}`)} placeholder={color} autoCapitalize="characters" />
              </>
            ) : null}

            {/* Welcome message */}
            <Field theme={theme} label="Mensaje de bienvenida" value={welcomeMessage} onChangeText={setWelcomeMessage} placeholder="Mensaje para tus alumnos al entrar" multiline />

            <Button label={saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar cambios'} onPress={save} disabled={saving} full />
          </>
        )}

        {/* URL info */}
        {settings ? (
          <Section title="Tu enlace de alumno">
            <InfoRow label="URL" value={`eva-app.cl/c/${settings.slug}`} />
            {settings.inviteCode ? <InfoRow label="Código de invitación" value={settings.inviteCode} last /> : null}
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
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
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  fieldLabel: { fontSize: 12 },
  input: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 2 },
  toggleText: { fontSize: 14, flex: 1 },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11 },
})
