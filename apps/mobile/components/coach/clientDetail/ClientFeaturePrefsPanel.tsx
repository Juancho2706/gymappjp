import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Apple, ChevronDown, Lock, RotateCcw, Save, SlidersHorizontal, Sparkles } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { EvaLoader } from '../../../components/EvaLoader'
import {
  DOMAIN_ENABLED_KEY,
  MODULE_LABELS,
  NUTRITION_SECTIONS,
  getNutritionPrefs,
  normalizePreset,
  type ModuleKey,
} from '../../../lib/feature-prefs'
import {
  getClientFeaturePrefsOverride,
  setClientFeaturePrefsOverride,
  type SectionPrefs,
} from '../../../lib/coach-client-extras'

/**
 * Panel de OVERRIDE por-alumno de "Funciones" (Zona C) — paridad con ClientFeaturePrefsPanel (web).
 * Capa mas especifica del modelo `visible = ENTITLED (billing) AND ENABLED (preferencia)`.
 * El coach fuerza, SOLO para ESTE alumno, que mostrar/ocultar de Nutricion encima del default coach.
 * Escribe UNICAMENTE client_feature_prefs.sections (RLS coach-owner). NUNCA toca enabled_modules.
 *
 * Draft + guardar: un toggle por seccion (on=mostrar / off=ocultar) que arranca en el valor EFECTIVO
 * (heredado del coach si no hay override). Auto-inherit: si matchea el heredado, se quita del override.
 * "Restaurar heredado" limpia todos los overrides.
 */

const toggleableSections = NUTRITION_SECTIONS.filter((s) => !s.core)

export function ClientFeaturePrefsPanel({ clientId }: { clientId: string }) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [baseEffective, setBaseEffective] = useState<Record<string, boolean>>({})
  const [domainEnabledBase, setDomainEnabledBase] = useState(true)
  const [entitledByModule, setEntitledByModule] = useState<Partial<Record<ModuleKey, boolean>>>({})
  const [draft, setDraft] = useState<SectionPrefs>({})
  const [saved, setSaved] = useState<SectionPrefs>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [prefs, override] = await Promise.all([getNutritionPrefs(), getClientFeaturePrefsOverride(clientId)])
      if (cancelled) return
      const preset = normalizePreset(prefs.preset)
      // baseEffective (heredado coach standalone): coachSections[k] ?? presets[preset]
      const eff: Record<string, boolean> = {}
      for (const s of NUTRITION_SECTIONS) {
        eff[s.key] = (prefs.sections[s.key] ?? s.presets[preset]) === true
      }
      setBaseEffective(eff)
      setDomainEnabledBase(prefs.sections[DOMAIN_ENABLED_KEY] ?? true)
      setEntitledByModule(prefs.entitledByModule)
      setDraft(override)
      setSaved(override)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [clientId])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])
  const overrideCount = Object.keys(draft).length

  function setKey(key: string, value: boolean, inheritedValue: boolean) {
    setDraft((d) => {
      const next = { ...d }
      if (value === inheritedValue) delete next[key]
      else next[key] = value
      return next
    })
  }

  async function save() {
    setBusy(true)
    setError(null)
    const r = await setClientFeaturePrefsOverride({ clientId, sections: draft as Record<string, boolean> })
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return }
    setSaved(draft)
  }

  const domainEnabledEff = draft[DOMAIN_ENABLED_KEY] ?? domainEnabledBase
  const amber = '#F59E0B'

  return (
    <View style={[styles.card, { backgroundColor: amber + '0E', borderColor: amber + '55', borderRadius: theme.radius.xl }]}>
      <TouchableOpacity activeOpacity={0.75} onPress={() => setOpen((o) => !o)} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBox, { backgroundColor: amber + '22' }]}>
            <SlidersHorizontal size={16} color={amber} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: amber, fontFamily: 'Montserrat_700Bold' }]}>Funciones para este alumno</Text>
              {overrideCount > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: amber + '33' }]}>
                  <Text style={[styles.countTxt, { color: amber, fontFamily: theme.fontSans }]}>{overrideCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sobrescribe el default tuyo (coach) solo para este alumno</Text>
          </View>
        </View>
        <MotiView animate={{ rotate: open ? '180deg' : '0deg' }} transition={{ type: 'timing', duration: 200 }}>
          <ChevronDown size={18} color={amber} />
        </MotiView>
      </TouchableOpacity>

      {open ? (
        loading ? (
          <View style={{ paddingVertical: 18 }}><EvaLoader size="sm" subtitle="Cargando funciones…" /></View>
        ) : (
          <MotiView from={{ opacity: 0, translateY: -4 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 200 }} style={styles.body}>
            {/* Master switch del dominio */}
            <View style={[styles.rowMaster, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <View style={{ flexShrink: 1 }}>
                <View style={styles.rowTitleWrap}>
                  <Apple size={14} color={amber} />
                  <Text style={[styles.rowLabel, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>Mostrar Nutrición</Text>
                  {draft[DOMAIN_ENABLED_KEY] !== undefined ? <View style={[styles.overrideDot, { backgroundColor: amber }]} /> : null}
                </View>
                <Text style={[styles.rowHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Apaga toda la nutrición de este alumno. No borra su historial.</Text>
              </View>
              <Toggle on={domainEnabledEff} disabled={busy} onChange={(v) => setKey(DOMAIN_ENABLED_KEY, v, domainEnabledBase)} />
            </View>

            <View style={{ gap: 6 }}>
              {toggleableSections.map((section) => {
                const isPro = section.requiresModule !== null
                const entitled = section.requiresModule ? entitledByModule[section.requiresModule] === true : true
                const locked = isPro && !entitled
                const inherited = baseEffective[section.key] === true
                const checked = (draft[section.key] ?? inherited) === true

                if (locked) {
                  return (
                    <View key={section.key} style={[styles.rowSection, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
                      <View style={styles.rowTitleWrap}>
                        <Text style={[styles.sectionLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{section.label}</Text>
                        <ProBadge />
                      </View>
                      <View style={styles.lockWrap}>
                        <Lock size={12} color={theme.primary} />
                        <Text style={[styles.lockTxt, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>{MODULE_LABELS[section.requiresModule!]}</Text>
                      </View>
                    </View>
                  )
                }

                return (
                  <View key={section.key} style={[styles.rowSection, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
                    <View style={styles.rowTitleWrap}>
                      <Text style={[styles.sectionLabel, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>{section.label}</Text>
                      {isPro ? <ProBadge /> : <BaseBadge />}
                      {draft[section.key] !== undefined ? <View style={[styles.overrideDot, { backgroundColor: amber }]} /> : null}
                    </View>
                    <Toggle on={checked} disabled={busy} onChange={(v) => setKey(section.key, v, inherited)} />
                  </View>
                )
              })}
            </View>

            {error ? <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: theme.fontSans }}>{error}</Text> : null}

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity activeOpacity={0.8} disabled={busy || overrideCount === 0} onPress={() => setDraft({})} style={[styles.restoreBtn, { opacity: busy || overrideCount === 0 ? 0.4 : 1 }]}>
                <RotateCcw size={14} color={theme.mutedForeground} />
                <Text style={[styles.restoreTxt, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Restaurar heredado</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} disabled={busy || !dirty} onPress={save} style={[styles.saveBtn, { backgroundColor: dirty && !busy ? amber : theme.muted, borderRadius: theme.radius.lg }]}>
                <Save size={14} color={dirty && !busy ? '#FFFFFF' : theme.mutedForeground} />
                <Text style={[styles.saveTxt, { color: dirty && !busy ? '#FFFFFF' : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{busy ? 'Guardando…' : 'Guardar configuración'}</Text>
              </TouchableOpacity>
            </View>
          </MotiView>
        )
      ) : null}
    </View>
  )
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity activeOpacity={0.8} disabled={disabled} onPress={() => onChange(!on)} style={[styles.track, { backgroundColor: on ? theme.primary : theme.muted }]}>
      <MotiView animate={{ translateX: on ? 18 : 2 }} transition={{ type: 'timing', duration: 160 }} style={[styles.knob, { backgroundColor: '#FFFFFF' }]} />
    </TouchableOpacity>
  )
}

function ProBadge() {
  return (
    <View style={[styles.badge, { backgroundColor: '#F59E0B18' }]}>
      <Sparkles size={9} color="#F59E0B" />
      <Text style={[styles.badgeTxt, { color: '#F59E0B', fontFamily: 'Inter_700Bold' }]}>Pro</Text>
    </View>
  )
}

function BaseBadge() {
  const { theme } = useTheme()
  return (
    <View style={[styles.badge, { backgroundColor: theme.muted }]}>
      <Text style={[styles.badgeTxt, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Base</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, paddingHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.8 },
  countBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  countTxt: { fontSize: 10 },
  subtitle: { fontSize: 10.5, marginTop: 2 },
  body: { gap: 10, paddingBottom: 14, paddingTop: 2 },
  rowMaster: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  rowSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  rowTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  rowLabel: { fontSize: 13.5 },
  rowHint: { fontSize: 10.5, marginTop: 2, lineHeight: 14 },
  sectionLabel: { fontSize: 13.5, flexShrink: 1 },
  overrideDot: { width: 6, height: 6, borderRadius: 3 },
  lockWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockTxt: { fontSize: 11 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
  track: { width: 40, height: 24, borderRadius: 12, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 2 },
  restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 4 },
  restoreTxt: { fontSize: 12 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  saveTxt: { fontSize: 12 },
})
