import { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Apple, ChevronDown, ChevronLeft, Lock, Save, Sparkles } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Button } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { getCoachOrgContext } from '../../../lib/org'
import {
  DOMAIN_ENABLED_KEY,
  MODULE_LABELS,
  NUTRITION_SECTIONS,
  PRESETS,
  getNutritionPrefs,
  normalizePreset,
  saveNutritionPrefs,
  type ModuleKey,
  type Preset,
  type SectionPrefs,
} from '../../../lib/feature-prefs'

/**
 * Funciones (mobile, standalone coach v1) — espejo de la zona "Funciones" de la web
 * (apps/web/src/components/coach/FeaturePrefsPanel.tsx). El coach elige QUE superficies de la
 * Nutricion se muestran (capa ENABLED del modelo `visible = ENTITLED AND ENABLED`).
 *
 * Estructura: 1 area (dominio nutricion) con:
 *  1. Selector de PRESET (basico/intermedio/profesional).
 *  2. Master switch del dominio (key reservada `_enabled`).
 *  3. Expander "Ajustar secciones" -> toggles por seccion (skip core) con badge Base/Pro.
 *     Las secciones Pro sin entitlement van LOCKED con CTA a la web.
 *
 * Borrador local: los cambios NO persisten por toggle; se commitean UNA vez con "Guardar".
 */

const PRESET_OPTIONS: { value: Preset; label: string; hint: string }[] = [
  { value: 'basico', label: 'Basico', hint: 'Lo esencial: plan, macros y adherencia.' },
  { value: 'intermedio', label: 'Intermedio', hint: 'Suma micros, habitos, recetas y mas.' },
  { value: 'profesional', label: 'Profesional', hint: 'Todo, incluido lo de tus modulos Pro.' },
]

const TOGGLEABLE = NUTRITION_SECTIONS.filter((s) => !s.core)

/** El preset define el estado por defecto de cada seccion toggleable. */
function sectionsForPreset(preset: Preset): SectionPrefs {
  const out: SectionPrefs = {}
  for (const s of TOGGLEABLE) out[s.key] = s.presets[preset] === true
  return out
}

export default function CoachFuncionesScreen() {
  const { theme } = useTheme()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  // Guard org-managed (espejo web settings/funciones: `if (orgManaged) redirect('/coach/dashboard')`).
  // Enterprise no tiene zona Funciones (las prefs las gobierna la org). Conservador: solo redirige
  // con CERTEZA (org_id en el JWT); si la lectura falla, fail-OPEN (el standalone nunca se redirige).
  const [orgManaged, setOrgManaged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const [entitledByModule, setEntitledByModule] = useState<Partial<Record<ModuleKey, boolean>>>({})
  const [preset, setPreset] = useState<Preset>('basico')
  const [sections, setSections] = useState<SectionPrefs>({})
  const [saved, setSaved] = useState<{ preset: Preset; sections: SectionPrefs }>({ preset: 'basico', sections: {} })

  useEffect(() => {
    ;(async () => {
      try {
        // Fail-open: si la lectura del contexto falla, no se trata como org-managed.
        const org = await getCoachOrgContext().catch(() => ({ isOrgManaged: false } as { isOrgManaged: boolean }))
        if (org.isOrgManaged) {
          setOrgManaged(true)
          router.replace('/coach/home')
          return // no cargamos prefs ni parpadeamos el editor; el loader se mantiene
        }
        const prefs = await getNutritionPrefs()
        setEntitledByModule(prefs.entitledByModule)
        setPreset(prefs.preset)
        setSections(prefs.sections)
        setSaved({ preset: prefs.preset, sections: prefs.sections })
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  // `_enabled` ausente => dominio prendido (no rompe coaches backfilleados).
  const domainEnabled = sections[DOMAIN_ENABLED_KEY] ?? true
  const dirty = useMemo(
    () => preset !== saved.preset || JSON.stringify(sections) !== JSON.stringify(saved.sections),
    [preset, sections, saved],
  )

  function applyPreset(next: Preset) {
    if (next === preset) return
    // Cambiar de preset re-siembra las secciones a su default, preservando el master switch.
    setPreset(next)
    setSections({ ...sectionsForPreset(next), [DOMAIN_ENABLED_KEY]: domainEnabled })
  }

  function toggleDomain(nextEnabled: boolean) {
    setSections((s) => ({ ...s, [DOMAIN_ENABLED_KEY]: nextEnabled }))
  }

  function toggleSection(key: string, nextOn: boolean) {
    setSections((s) => ({ ...s, [key]: nextOn }))
  }

  function discard() {
    setPreset(saved.preset)
    setSections(saved.sections)
  }

  async function save() {
    setSaving(true)
    try {
      const result = await saveNutritionPrefs({ preset, sections })
      if (!result.ok) {
        Alert.alert('Error', result.error || 'No se pudo guardar.')
        return
      }
      setSaved({ preset, sections })
      Alert.alert('Listo', 'Funciones guardadas.')
    } finally {
      setSaving(false)
    }
  }

  // Loader también mientras redirige al coach org-managed (no parpadea el editor de funciones).
  if (loading || orgManaged) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando funciones…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
      <ScreenHeader title="Funciones" subtitle="Elige que tan a fondo trabajas la nutricion" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Area: Nutricion ── */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
          <View style={styles.sectionHead}>
            <Apple size={18} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Nutricion</Text>
          </View>

          {/* 1. Selector de preset */}
          <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.background, borderRadius: theme.radius.xl }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              ¿Que tan a fondo trabajas la nutricion?
            </Text>
            <Text style={[styles.cardSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Elige un punto de partida. Puedes ajustar cada seccion despues.
            </Text>
            <View style={styles.presetRow}>
              {PRESET_OPTIONS.map((opt) => {
                const selected = preset === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => applyPreset(opt.value)}
                    activeOpacity={0.8}
                    disabled={saving}
                    style={[
                      styles.presetBtn,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? theme.primary + '14' : theme.card,
                        borderRadius: theme.radius.lg,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 13.5, fontFamily: 'Montserrat_700Bold', color: selected ? theme.primary : theme.mutedForeground }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <Text style={[styles.cardSub, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginTop: 8 }]}>
              {PRESET_OPTIONS.find((o) => o.value === preset)?.hint}
            </Text>
          </View>

          {/* 2. Master switch del dominio */}
          <View style={[styles.masterRow, { borderColor: theme.border, backgroundColor: theme.background, borderRadius: theme.radius.xl }]}>
            <View style={styles.masterText}>
              <View style={styles.masterHead}>
                <Apple size={15} color={theme.primary} />
                <Text style={[styles.cardTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Mostrar Nutricion</Text>
              </View>
              <Text style={[styles.cardSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Apaga esto si no usas el modulo. Oculta el menu y su contenido para ti y tus alumnos. No borra ningun dato.
              </Text>
            </View>
            <Switch
              value={domainEnabled}
              onValueChange={toggleDomain}
              disabled={saving}
              trackColor={{ false: theme.border, true: theme.primary + '88' }}
              thumbColor={domainEnabled ? theme.primary : theme.mutedForeground}
            />
          </View>

          {/* 3. Expander "Ajustar secciones" */}
          <View style={[styles.adjustWrap, { borderColor: theme.border, backgroundColor: theme.background, borderRadius: theme.radius.xl }]}>
            <TouchableOpacity
              onPress={() => domainEnabled && setAdjustOpen((o) => !o)}
              disabled={!domainEnabled}
              activeOpacity={0.7}
              style={[styles.adjustHead, !domainEnabled && { opacity: 0.5 }]}
            >
              <Text style={[styles.cardTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Ajustar secciones</Text>
              <ChevronDown
                size={18}
                color={theme.mutedForeground}
                style={{ transform: [{ rotate: adjustOpen && domainEnabled ? '180deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {adjustOpen && domainEnabled && (
              <View style={[styles.sectionList, { borderTopColor: theme.border }]}>
                {TOGGLEABLE.map((section) => {
                  const isPro = section.requiresModule !== null
                  const entitled = section.requiresModule ? entitledByModule[section.requiresModule] === true : true
                  const locked = isPro && !entitled
                  // wants = pref guardada ?? default del preset actual.
                  const checked = (sections[section.key] ?? section.presets[preset]) === true

                  return (
                    <View key={section.key} style={[styles.sectionItem, { borderTopColor: theme.border }]}>
                      <View style={styles.sectionInfo}>
                        <View style={styles.sectionLabelRow}>
                          <Text style={[styles.sectionLabel, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                            {section.label}
                          </Text>
                          <Badge theme={theme} isPro={isPro} />
                        </View>
                        <Text style={[styles.sectionTip, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                          {locked ? MODULE_LABELS[section.requiresModule!] : section.tooltip}
                        </Text>
                      </View>

                      {locked ? (
                        <TouchableOpacity
                          onPress={() => Linking.openURL('https://eva-app.cl/coach/subscription#addons').catch(() => {})}
                          activeOpacity={0.8}
                          style={[styles.unlockBtn, { borderColor: theme.primary, backgroundColor: theme.primary + '0D', borderRadius: theme.radius.lg }]}
                        >
                          <Lock size={13} color={theme.primary} />
                          <Text style={[styles.unlockText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Desbloquear</Text>
                        </TouchableOpacity>
                      ) : (
                        <Switch
                          value={checked}
                          onValueChange={(v) => toggleSection(section.key, v)}
                          disabled={saving}
                          trackColor={{ false: theme.border, true: theme.primary + '88' }}
                          thumbColor={checked ? theme.primary : theme.mutedForeground}
                        />
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </View>

          {/* Footer: descartar + guardar */}
          <View style={styles.footer}>
            {dirty && (
              <TouchableOpacity onPress={discard} disabled={saving} activeOpacity={0.7} style={styles.discardBtn}>
                <Text style={{ color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold', fontSize: 13 }}>Descartar</Text>
              </TouchableOpacity>
            )}
            <Button
              label={saving ? 'Guardando…' : 'Guardar'}
              leftIcon={Save}
              loading={saving}
              disabled={saving || !dirty}
              onPress={save}
            />
          </View>
        </View>

        {/* Explainer Modulos vs Funciones */}
        <Text style={[styles.explainer, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          <Text style={{ color: theme.foreground, fontFamily: 'Montserrat_700Bold' }}>Modulos</Text> es lo que compraste
          (entitlements de pago). <Text style={{ color: theme.foreground, fontFamily: 'Montserrat_700Bold' }}>Funciones</Text>{' '}
          es lo que decides mostrar de eso. Apagar una funcion nunca cancela un modulo ni borra datos — solo la oculta.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function Badge({ theme, isPro }: { theme: any; isPro: boolean }) {
  if (isPro) {
    return (
      <View style={[styles.badge, { backgroundColor: '#F59E0B1A' }]}>
        <Sparkles size={9} color="#D97706" />
        <Text style={[styles.badgeText, { color: '#D97706' }]}>PRO</Text>
      </View>
    )
  }
  return (
    <View style={[styles.badge, { backgroundColor: theme.secondary ?? theme.border }]}>
      <Text style={[styles.badgeText, { color: theme.mutedForeground }]}>BASE</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  section: { padding: 16, borderWidth: 1, gap: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' },
  card: { borderWidth: 1, padding: 14 },
  cardTitle: { fontSize: 14 },
  cardSub: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  presetBtn: { flex: 1, borderWidth: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  masterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, padding: 14 },
  masterText: { flex: 1 },
  masterHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  adjustWrap: { borderWidth: 1, overflow: 'hidden' },
  adjustHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, minHeight: 44 },
  sectionList: { borderTopWidth: 1 },
  sectionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  sectionInfo: { flex: 1 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  sectionLabel: { fontSize: 13.5 },
  sectionTip: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, minHeight: 40 },
  unlockText: { fontSize: 11, letterSpacing: 0.3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: 0.6 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 2 },
  discardBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  explainer: { fontSize: 11.5, lineHeight: 17, paddingHorizontal: 4 },
})
