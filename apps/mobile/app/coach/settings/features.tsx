import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import { Apple, ChevronDown, ChevronLeft, Lock, Sparkles, Wrench } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  DOMAIN_ENABLED_KEY,
  normalizePreset,
  type FeatureSection,
  type ModuleKey,
  type Preset,
  type SectionPrefs,
} from '@eva/feature-prefs'
import { MODULE_CATALOG } from '@eva/module-catalog'
import { AppBackground } from '../../../components/AppBackground'
import { Badge, Card, SegmentedTabs } from '../../../components'
import { Switch } from '../../../components/Switch'
import { toast } from '../../../components/Toast'
import { useTheme } from '../../../context/ThemeContext'
import { useWorkspace } from '../../../lib/workspace'
import { useEntitlements } from '../../../lib/entitlements'
import { getCoachProfile } from '../../../lib/coach'
import {
  loadFeaturePrefs,
  saveFeaturePrefs,
  type DomainPrefs,
  type FeaturePrefsScope,
} from '../../../lib/feature-prefs.queries'

/**
 * E7-04 · Funciones (feature-prefs) — panel real. Espejo mobile de FeaturePrefsPanel (web,
 * coach/settings/funciones): por dominio (hoy Nutrición) un selector de PRESET (Básico/Intermedio/
 * Profesional), un master switch del dominio (`_enabled`), y toggles por sección con badge Base/Pro +
 * lock Pro (CTA a la web para desbloquear). Modelo `visible = ENTITLED AND ENABLED`: este panel SOLO
 * escribe la capa ENABLED (@eva/feature-prefs); el ENTITLED lo aporta useEntitlements() (E0-C1). El
 * scope (standalone vs team) sale de useWorkspace() (E7-01, única resolución de contexto); en team solo
 * el gestor edita (canManageTeam), el resto ve read-only. Persistencia por PostgREST directo (RLS =
 * gate real), MISMA tabla que lee el gate de nav del alumno (E0-C3) → coherente al re-montar.
 */

for (const Icon of [Apple, ChevronDown, ChevronLeft, Lock, Sparkles, Wrench]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

const PRESET_ITEMS: { value: Preset; label: string }[] = [
  { value: 'basico', label: 'Básico' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'profesional', label: 'Profesional' },
]

const PRESET_HINT: Record<Preset, string> = {
  basico: 'Lo esencial: plan, macros y adherencia.',
  intermedio: 'Suma micros, hábitos, recetas y más.',
  profesional: 'Todo, incluido lo de tus módulos Pro.',
}

/** El preset define el estado por defecto de cada sección toggleable (el catálogo lo declara). */
function sectionsForPreset(toggleable: readonly FeatureSection[], preset: Preset): SectionPrefs {
  const out: SectionPrefs = {}
  for (const section of toggleable) out[section.key] = section.presets[preset] === true
  return out
}

export default function CoachFeaturesScreen() {
  const router = useRouter()
  const ws = useWorkspace()
  const ent = useEntitlements()

  const [coachId, setCoachId] = useState<string | null>(null)
  const [domains, setDomains] = useState<DomainPrefs[] | null>(null)

  const isTeam = ws.kind === 'team_owner' || ws.kind === 'team_member'
  // Enterprise (org gestiona) o el borde "managed sin team visible" ⇒ sin editor (espejo del redirect
  // de la web). En team la edición existe pero la gatea `canEdit` (solo gestor); no se bloquea entera.
  const managedLock = ws.kind === 'enterprise' || (ws.kind === 'standalone' && ws.isManaged)
  const canEdit = isTeam ? ws.canManageTeam : true

  const scopeCtx: FeaturePrefsScope = useMemo(
    () => ({ scope: isTeam ? 'team' : 'coach', coachId, teamId: isTeam ? ws.teamId : null }),
    [isTeam, coachId, ws.teamId],
  )

  // Entitlement por módulo (capa ENTITLED, post kill-switch) desde el único source de pago mobile.
  const entitledByModule: Partial<Record<ModuleKey, boolean>> = useMemo(
    () => ({
      nutrition_exchanges: ent.hasModule('nutrition_exchanges'),
      body_composition: ent.hasModule('body_composition'),
    }),
    [ent],
  )

  useEffect(() => {
    let alive = true
    getCoachProfile()
      .then((c) => { if (alive) setCoachId(c?.id ?? null) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Carga las prefs del scope activo. Standalone necesita el coachId; team usa el teamId del workspace.
  const needsCoachId = !isTeam
  useEffect(() => {
    if (managedLock) return
    if (!ws.ready) return
    if (needsCoachId && coachId === null) return
    let alive = true
    setDomains(null)
    loadFeaturePrefs(scopeCtx)
      .then((d) => { if (alive) setDomains(d) })
      .catch(() => { if (alive) setDomains([]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managedLock, ws.ready, ws.teamId, ws.kind, coachId, needsCoachId])

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Back header */}
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            testID="features-back"
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

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: 8, paddingBottom: 8 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.5 }}>
              Funciones
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 19 }}>
              {isTeam
                ? 'Elegí qué se muestra de la nutrición para el equipo y sus alumnos.'
                : 'Elegí qué tan a fondo trabajás la nutrición y qué secciones ven vos y tus alumnos.'}
            </Text>
          </View>

          {managedLock ? (
            <ManagedLock />
          ) : !canEdit ? (
            <ReadOnlyBanner />
          ) : null}

          {managedLock ? null : domains === null ? (
            <Text testID="features-loading" className="font-sans text-muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 28 }}>
              Cargando…
            </Text>
          ) : (
            domains.map((d) => (
              <DomainGroup
                key={`${scopeCtx.scope}:${scopeCtx.teamId ?? scopeCtx.coachId ?? ''}:${d.domain}`}
                data={d}
                scopeCtx={scopeCtx}
                entitledByModule={entitledByModule}
                canEdit={canEdit}
              />
            ))
          )}

          {managedLock ? null : (
            <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 18, marginTop: 18, paddingHorizontal: 2 }}>
              <Text className="font-sans-bold text-strong">Módulos</Text> es lo que compraste (entitlements de pago).{' '}
              <Text className="font-sans-bold text-strong">Funciones</Text> es lo que decidís mostrar de eso. Apagar una
              función nunca cancela un módulo ni borra datos — solo la oculta.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

function ManagedLock() {
  return (
    <Card variant="default" padding="lg" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <View className="items-center justify-center rounded-2xl bg-surface-sunken" style={{ width: 44, height: 44 }}>
        <Lock size={20} strokeWidth={2} className="text-muted" />
      </View>
      <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>
        Las funciones de nutrición las gestiona tu organización.
      </Text>
    </Card>
  )
}

function ReadOnlyBanner() {
  return (
    <Card variant="default" padding="md" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
      <Lock size={16} strokeWidth={2} className="text-muted" />
      <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 12.5, lineHeight: 18 }}>
        Solo el gestor del equipo puede cambiar estas funciones. Podés verlas, pero no editarlas.
      </Text>
    </Card>
  )
}

interface DomainGroupProps {
  data: DomainPrefs
  scopeCtx: FeaturePrefsScope
  entitledByModule: Partial<Record<ModuleKey, boolean>>
  canEdit: boolean
}

/** UNA área del panel: preset + master switch + toggles de sección. Estado de borrador local; commit
 *  único con "Guardar" (espejo del DomainFuncionesGroup de la web). */
function DomainGroup({ data, scopeCtx, entitledByModule, canEdit }: DomainGroupProps) {
  const { theme } = useTheme()

  const toggleable = useMemo(() => data.sections.filter((s) => !s.core), [data.sections])

  const [preset, setPreset] = useState<Preset>(normalizePreset(data.preset))
  const [sections, setSections] = useState<SectionPrefs>(data.sectionPrefs)
  const [saved, setSaved] = useState<{ preset: Preset; sections: SectionPrefs }>({
    preset: normalizePreset(data.preset),
    sections: data.sectionPrefs,
  })
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // `_enabled` ausente ⇒ dominio prendido (no rompe coaches backfilleados).
  const domainEnabled = sections[DOMAIN_ENABLED_KEY] ?? true
  const dirty = preset !== saved.preset || JSON.stringify(sections) !== JSON.stringify(saved.sections)

  // Cambiar de preset re-siembra las secciones a su default, preservando el master switch.
  function applyPreset(next: Preset) {
    if (next === preset || !canEdit) return
    setPreset(next)
    setSections({ ...sectionsForPreset(toggleable, next), [DOMAIN_ENABLED_KEY]: domainEnabled })
  }

  function toggleDomain(next: boolean) {
    setSections((s) => ({ ...s, [DOMAIN_ENABLED_KEY]: next }))
  }

  function toggleSection(key: string, next: boolean) {
    setSections((s) => ({ ...s, [key]: next }))
  }

  async function save() {
    if (busy || !dirty) return
    setBusy(true)
    const res = await saveFeaturePrefs(scopeCtx, {
      domain: data.domain,
      preset,
      sections: sections as Record<string, boolean>,
    })
    setBusy(false)
    if ('ok' in res) {
      setSaved({ preset, sections })
      toast.success('Funciones guardadas')
    } else {
      toast.error(res.error)
    }
  }

  function discard() {
    setPreset(saved.preset)
    setSections(saved.sections)
  }

  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      {/* Cabecera del área */}
      <View className="flex-row items-center" style={{ gap: 8, marginBottom: 2 }}>
        <Apple size={17} strokeWidth={2} className="text-sport-600" />
        <Text className="font-display-bold text-strong" style={{ fontSize: 16, letterSpacing: -0.2 }}>{data.label}</Text>
      </View>

      {/* 1. Selector de preset */}
      <Card variant="default" padding="lg" style={{ gap: 10 }}>
        <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>
          ¿Qué tan a fondo trabajás {data.label.toLowerCase()}?
        </Text>
        <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
          Elegí un punto de partida. Podés ajustar cada sección después.
        </Text>
        <View style={{ opacity: canEdit ? 1 : 0.55, marginTop: 2 }} pointerEvents={canEdit ? 'auto' : 'none'}>
          <SegmentedTabs<Preset>
            items={PRESET_ITEMS}
            value={preset}
            onChange={applyPreset}
          />
        </View>
        <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>{PRESET_HINT[preset]}</Text>
      </Card>

      {/* 2. Master switch del dominio */}
      <Card variant="default" padding="lg" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>Mostrar {data.label}</Text>
          <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17, marginTop: 3 }}>
            Apagá esto si no usás el módulo. Oculta el menú y su contenido para vos y tus alumnos. No borra datos.
          </Text>
        </View>
        <Switch value={domainEnabled} onValueChange={toggleDomain} disabled={!canEdit} />
      </Card>

      {/* 3. Ajustar secciones */}
      <Card variant="default" padding="none" radius="lg">
        <Pressable
          testID="features-adjust-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: adjustOpen, disabled: !domainEnabled }}
          onPress={() => domainEnabled && setAdjustOpen((o) => !o)}
          disabled={!domainEnabled}
          className="flex-row items-center justify-between"
          style={{ paddingHorizontal: 16, paddingVertical: 14, opacity: domainEnabled ? 1 : 0.5 }}
        >
          <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>Ajustar secciones</Text>
          <ChevronDown
            size={18}
            strokeWidth={2}
            className="text-muted"
            style={{ transform: [{ rotate: adjustOpen ? '180deg' : '0deg' }] }}
          />
        </Pressable>

        {adjustOpen && domainEnabled ? (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.border }}>
            {toggleable.map((section, i) => {
              const isPro = section.requiresModule !== null
              const entitled = section.requiresModule ? entitledByModule[section.requiresModule] === true : true
              const locked = isPro && !entitled
              const checked = (sections[section.key] ?? section.presets[preset]) === true
              return (
                <View
                  key={section.key}
                  className="flex-row items-center"
                  style={{
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: theme.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View className="flex-row items-center" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <Text className="font-sans-medium text-strong" style={{ fontSize: 13.5 }}>{section.label}</Text>
                      {isPro ? (
                        <Badge label="Pro" tone="warning" size="sm" icon={<Sparkles size={10} strokeWidth={2.4} className="text-warning" />} />
                      ) : (
                        <Badge label="Base" tone="neutral" size="sm" />
                      )}
                    </View>
                    <Text className="font-sans text-muted" style={{ fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>
                      {locked
                        ? `Requiere ${MODULE_CATALOG[section.requiresModule as ModuleKey].label}`
                        : section.tooltip}
                    </Text>
                  </View>

                  {locked ? (
                    <Pressable
                      testID={`features-unlock-${section.key}`}
                      accessibilityRole="button"
                      onPress={() => Linking.openURL('https://eva-app.cl/coach/subscription#addons').catch(() => {})}
                      hitSlop={8}
                      className="flex-row items-center rounded-pill bg-sport-100"
                      style={{ gap: 5, paddingHorizontal: 11, paddingVertical: 8 }}
                    >
                      <Lock size={13} strokeWidth={2.2} className="text-sport-600" />
                      <Text className="font-sans-bold text-sport-600" style={{ fontSize: 12 }}>Desbloquear</Text>
                    </Pressable>
                  ) : (
                    <Switch
                      value={checked}
                      onValueChange={(v) => toggleSection(section.key, v)}
                      disabled={!canEdit}
                    />
                  )}
                </View>
              )
            })}
          </View>
        ) : null}
      </Card>

      {/* Footer: descartar + guardar (solo si editable) */}
      {canEdit && dirty ? (
        <View className="flex-row items-center justify-end" style={{ gap: 8, marginTop: 2 }}>
          <Pressable
            testID="features-discard"
            accessibilityRole="button"
            onPress={discard}
            disabled={busy}
            hitSlop={6}
            style={{ paddingHorizontal: 14, paddingVertical: 10, opacity: busy ? 0.4 : 1 }}
          >
            <Text className="font-sans-bold text-muted" style={{ fontSize: 13 }}>Descartar</Text>
          </Pressable>
          <Pressable
            testID="features-save"
            accessibilityRole="button"
            onPress={save}
            disabled={busy}
            className="rounded-control bg-cta-fill"
            style={{ paddingHorizontal: 18, paddingVertical: 11, opacity: busy ? 0.6 : 1 }}
          >
            <Text className="font-sans-bold text-on-sport" style={{ fontSize: 13 }}>
              {busy ? 'Guardando…' : 'Guardar configuración'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}
