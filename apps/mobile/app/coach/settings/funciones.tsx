import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { cssInterop } from 'nativewind'
import * as Haptics from 'expo-haptics'
import {
  Apple,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Dumbbell,
  HeartPulse,
  Lock,
  PersonStanding,
  Ruler,
  Sparkles,
  Trash2,
  UserPlus,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  DOMAIN_ENABLED_KEY,
  normalizePreset,
  type FeatureDomain,
  type FeatureSection,
  type Preset,
  type SectionPrefs,
} from '@eva/feature-prefs'
import { PERSONA_COPY, PERSONA_TILE_ORDER, type Persona } from '@eva/schemas'
import { AppBackground } from '../../../components/AppBackground'
import { Button, Card, Dialog, SegmentedTabs, Sheet } from '../../../components'
import { ListRow } from '../../../components/ListRow'
import { Switch } from '../../../components/Switch'
import { toast } from '../../../components/Toast'
import { BodycompClientPicker } from '../../../components/coach/BodycompClientPicker'
import { useTheme } from '../../../context/ThemeContext'
import { useWorkspace } from '../../../lib/workspace'
import { refreshEntitlements } from '../../../lib/entitlements'
import { getCoachProfile } from '../../../lib/coach'
import { resetCoachPersonaCache } from '../../../lib/coach-persona'
import { listCardioClients, type CardioClientRow } from '../../../lib/cardio-coach'
import { isUuid } from '../../../lib/safe-uuid'
import { domainToggleMessage } from '../../../lib/funciones-copy'
import {
  getCoachDashboardDataMobile,
  persistCoachOnboardingGuide,
  publishCoachOnboarding,
  type MobileDashboardData,
} from '../../../lib/coach-dashboard'
import {
  loadFeaturePrefs,
  saveFeaturePrefs,
  type DomainPrefs,
  type FeaturePrefsScope,
} from '../../../lib/feature-prefs.queries'
import { deleteDemoStudent } from '../../../lib/vive-tu-app'
import {
  GUIDE_PILL_EXPANDED,
  MI_PANEL_GUIA_ROUTE,
  buildDomainSwitchPayload,
  guidePillStorageKey,
  isPersonaDirty,
  loadMiPanelDomains,
  reseedDemoStudent,
  resolveMiPanelVisibility,
  saveMiPanelPersona,
  type MiPanelDomainRow,
} from '../../../lib/mi-panel'

/**
 * «Opciones › Funciones» (Ola de orden W3.3, mockup D aprobado por el owner — decisiones 5A y 6A).
 *
 * UNA pantalla donde antes había tres y media: `settings/mi-panel.tsx` (especialidad + los 5 master
 * switches + guía + alumno de ejemplo), `settings/features.tsx` (preset y secciones de nutrición,
 * con un SEGUNDO master switch del mismo dato), `modules.tsx` (catálogo de qué existe) y el
 * launcher `tools.tsx` (por dónde se abre cada módulo). Las cuatro rutas viven ahora como redirect
 * a esta (W3.4/W4.3); el hub de Opciones las colapsó en una sola fila (W3.5).
 *
 * Espejo funcional de la web (`apps/web/src/app/coach/settings/funciones`). Cinco bloques, en este
 * orden:
 *  1. Tu especialidad — 5 tiles, la segunda pregunta cuando la persona la tiene, el switch
 *     «Ordenar mi panel según mi especialidad» (APAGADO por defecto: cambiar de etiqueta no puede
 *     borrarle los toggles a quien ya los ajustó) y «Guardar».
 *  2. Qué se ve en tu panel — el master switch (`_enabled`) de los 5 dominios, ÚNICA fuente de ese
 *     dato, cada uno con su «Abrir ›» cuando está prendido (6A: el launcher se disuelve acá).
 *  3. Detalle de nutrición — preset + secciones. Sin candados ni CTA de plan (W4.1: regla del
 *     owner «todo está en todos los planes, solo se cobra el cupo»).
 *  4. Tu guía de inicio · 5. Alumno de ejemplo — tal cual venían de «Mi panel».
 *
 * Contextos: a un coach ADMINISTRADO (org, o team) el panel se lo define el tenant — mismo rechazo
 * que hace el endpoint y que el server action de la web, así que los bloques 1/2/4/5 se reemplazan
 * por un aviso. El bloque 3 SÍ se pinta para un team (escribe `team_feature_prefs`, editable solo
 * por el gestor), igual que hacía `features.tsx`; ahí, y solo ahí, el master switch de nutrición
 * viaja DENTRO del bloque 3, porque el bloque 2 no está para sostenerlo.
 *
 * Colores: nunca literales de marca. Los iconos lucide toman su color por `className` gracias al
 * `cssInterop` de abajo (dark mode + white-label en runtime); el enlace «Abrir» usa `theme.primary`
 * porque es el único tono de marca fiable en modo oscuro (gotcha `whitelabel_rn_vars`).
 */

for (const Icon of [
  Apple,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Dumbbell,
  HeartPulse,
  Lock,
  PersonStanding,
  Ruler,
  Sparkles,
  Trash2,
  UserPlus,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

/** Ícono por persona — el MISMO mapeo que la web y que `onboarding/persona.tsx`. */
const PERSONA_ICONS: Record<Persona, LucideIcon> = {
  strength: Dumbbell,
  nutrition: Apple,
  rehab: PersonStanding,
  endurance: HeartPulse,
  other: Sparkles,
}

/** Ícono por dominio — el MISMO mapeo que `MiPanelClient.tsx` de la web. */
const DOMAIN_ICONS: Record<FeatureDomain, LucideIcon> = {
  nutrition: Apple,
  training: Dumbbell,
  cardio: HeartPulse,
  movement: PersonStanding,
  bodycomp: Ruler,
}

/**
 * Una línea por dominio: qué hace, no qué cuesta. Condensado de `@eva/module-catalog` (el `pitch`
 * del catálogo es de dos frases y acá la fila lo trunca) y del copy que usaba el launcher.
 */
const DOMAIN_PITCH: Record<FeatureDomain, string> = {
  nutrition: 'Pautas, porciones e intercambios del plan.',
  training: 'Programas, biblioteca y ejecución guiada.',
  cardio: 'Zonas de frecuencia cardíaca, ritmos e intervalos.',
  movement: 'Screening de 7 patrones con semáforo.',
  bodycomp: 'Bioimpedancia y antropometría ISAK.',
}

/**
 * A dónde lleva «Abrir ›» (decisión 6A). `bodycomp` no tiene pantalla propia: se mide a un alumno
 * a la vez, así que abre el selector (`BodycompClientPicker`) y navega a su ficha.
 */
const DOMAIN_HREF: Partial<Record<FeatureDomain, string>> = {
  nutrition: '/coach/(tabs)/nutricion',
  training: '/coach/(tabs)/builder',
  cardio: '/coach/cardio',
  movement: '/coach/movement',
}

const PRESET_ITEMS: { value: Preset; label: string }[] = [
  { value: 'basico', label: 'Básico' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'profesional', label: 'Profesional' },
]

const PRESET_HINT: Record<Preset, string> = {
  basico: 'Lo esencial: plan, macros y adherencia.',
  intermedio: 'Suma micros, hábitos, recetas y más.',
  profesional: 'Todo: micros avanzados, objetivos por composición y notas.',
}

/** El preset define el estado por defecto de cada sección toggleable (el catálogo lo declara). */
function sectionsForPreset(toggleable: readonly FeatureSection[], preset: Preset): SectionPrefs {
  const out: SectionPrefs = {}
  for (const section of toggleable) out[section.key] = section.presets[preset] === true
  return out
}

function SectionTitle({ children }: { children: string }) {
  return (
    <View className="mx-0.5 mb-2.5 mt-6 flex-row items-center gap-2">
      <View className="h-3 w-[3px] rounded-sm bg-sport-500" />
      <Text
        className="font-sans-extra text-subtle"
        style={{ fontSize: 11, letterSpacing: 0.77, textTransform: 'uppercase' }}
      >
        {children}
      </Text>
    </View>
  )
}

/** Aviso «esto lo define tu tenant» — el mismo chasis que usaban `mi-panel.tsx` y `features.tsx`. */
function ManagedNotice({ children }: { children: string }) {
  return (
    <Card
      variant="default"
      padding="lg"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}
    >
      <View
        className="items-center justify-center rounded-2xl bg-surface-sunken"
        style={{ width: 44, height: 44 }}
      >
        <Lock size={20} strokeWidth={2} className="text-muted" />
      </View>
      <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>
        {children}
      </Text>
    </Card>
  )
}

export default function CoachFuncionesScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const ws = useWorkspace()

  const [coachId, setCoachId] = useState<string | null>(null)
  const [data, setData] = useState<MobileDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [domains, setDomains] = useState<MiPanelDomainRow[] | null>(null)

  // Borrador de la especialidad (lo confirma «Guardar»).
  const [persona, setPersona] = useState<Persona | null>(null)
  const [alsoOther, setAlsoOther] = useState(false)
  const [reorder, setReorder] = useState(false)

  const [savingPersona, setSavingPersona] = useState(false)
  const [busyDomain, setBusyDomain] = useState<FeatureDomain | null>(null)
  const [busyDemo, setBusyDemo] = useState(false)
  const [busyGuide, setBusyGuide] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Detalle de nutrición (`coach_feature_prefs` o `team_feature_prefs` según el scope).
  const [nutritionPrefs, setNutritionPrefs] = useState<DomainPrefs[] | null>(null)

  // Selector de alumno para «Abrir» Composición corporal.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [clients, setClients] = useState<CardioClientRow[]>([])
  const [loadingClients, setLoadingClients] = useState(false)

  const isTeam = ws.kind === 'team_owner' || ws.kind === 'team_member'
  /**
   * Un coach administrado no edita su panel acá: se lo define el tenant. Mismo predicado que tenía
   * `mi-panel.tsx` (y que el endpoint `/api/mobile/coach/persona` rechaza igual).
   */
  const managed = isTeam || ws.kind === 'enterprise' || ws.isManaged
  /**
   * Nutrición es la excepción: un TEAM sí configura su detalle (sobre `team_feature_prefs`), y solo
   * el gestor lo edita. Enterprise —y el borde «managed sin team visible»— no ven el editor.
   * Espejo exacto de `managedLock` / `canEdit` de `settings/features.tsx`.
   */
  const nutritionLocked = ws.kind === 'enterprise' || (ws.kind === 'standalone' && ws.isManaged)
  const canEditNutrition = isTeam ? ws.canManageTeam : true

  /**
   * Recarga la foto del onboarding y la PUBLICA en el store compartido, igual que hace
   * `app/coach/guia.tsx`: así la píldora flotante y la guía se enteran del cambio sin volver a
   * pedirle nada al servidor.
   */
  const loadDashboard = useCallback(async () => {
    const next = await getCoachDashboardDataMobile()
    if (next) {
      publishCoachOnboarding({ coachId: next.coach.id, onboardingV2: next.onboardingV2 })
      setData(next)
      // El borrador se re-siembra con lo que el servidor acaba de confirmar.
      setPersona(next.onboardingV2.persona)
      setAlsoOther(next.onboardingV2.alsoOther)
      setReorder(false)
    }
    return next
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const profile = await getCoachProfile().catch(() => null)
      if (alive) setCoachId(profile?.id ?? null)
      await loadDashboard().catch(() => null)
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [loadDashboard])

  useEffect(() => {
    if (managed || coachId == null) return
    let alive = true
    void loadMiPanelDomains(coachId).then((rows) => {
      if (alive) setDomains(rows)
    })
    return () => {
      alive = false
    }
  }, [managed, coachId])

  const nutritionScope: FeaturePrefsScope = useMemo(
    () => ({ scope: isTeam ? 'team' : 'coach', coachId, teamId: isTeam ? ws.teamId : null }),
    [isTeam, coachId, ws.teamId],
  )

  // Carga del detalle de nutrición: standalone necesita el coachId; team usa el teamId del workspace.
  useEffect(() => {
    if (nutritionLocked || !ws.ready) return
    if (!isTeam && coachId === null) return
    let alive = true
    setNutritionPrefs(null)
    loadFeaturePrefs(nutritionScope)
      .then((rows) => {
        if (alive) setNutritionPrefs(rows)
      })
      .catch(() => {
        if (alive) setNutritionPrefs([])
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nutritionLocked, ws.ready, ws.teamId, ws.kind, coachId, isTeam])

  const v2 = data?.onboardingV2 ?? null
  const visibility = useMemo(
    () =>
      resolveMiPanelVisibility({
        persona: v2?.persona ?? null,
        demoClientId: v2?.demoClientId ?? null,
        guide: { dismissed: v2?.guide.dismissed === true, hidden: v2?.guide.hidden === true },
      }),
    [v2],
  )

  const panelScope: FeaturePrefsScope = useMemo(
    () => ({ scope: 'coach', coachId, teamId: null }),
    [coachId],
  )

  const secondQuestion = persona ? PERSONA_COPY[persona].secondQuestion : null
  const personaDirty =
    persona != null &&
    isPersonaDirty(
      { persona, alsoOther, reorderPanel: reorder },
      { persona: v2?.persona ?? null, alsoOther: v2?.alsoOther === true },
    )

  function choosePersona(next: Persona) {
    void Haptics.selectionAsync().catch(() => {})
    if (next !== persona) setAlsoOther(false)
    setPersona(next)
  }

  async function onSavePersona() {
    if (persona == null || savingPersona || !personaDirty) return
    setSavingPersona(true)
    const result = await saveMiPanelPersona({ persona, alsoOther, reorderPanel: reorder })
    if (!result.ok) {
      setSavingPersona(false)
      toast.error(result.error)
      return
    }
    // El gate de persona cachea su veredicto por sesión: sin esto, la app seguiría creyendo la
    // especialidad vieja hasta el próximo arranque.
    resetCoachPersonaCache()
    // Con «Ordenar mi panel» el servidor reescribe los master switches: sin revalidar, la barra de
    // tabs sigue mostrando la foto vieja hasta el próximo foreground.
    await refreshEntitlements().catch(() => {})
    await loadDashboard().catch(() => null)
    if (reorder && coachId != null) {
      const rows = await loadMiPanelDomains(coachId)
      setDomains(rows)
    }
    setSavingPersona(false)
    toast.success(result.message)
  }

  async function onToggleDomain(row: MiPanelDomainRow, next: boolean) {
    if (busyDomain != null) return
    setBusyDomain(row.domain)
    // Optimista: el switch responde al dedo y se revierte si la base no lo aceptó.
    setDomains((current) =>
      current?.map((item) => (item.domain === row.domain ? { ...item, enabled: next } : item)) ?? current,
    )
    const payload = buildDomainSwitchPayload(row, next)
    const result = await saveFeaturePrefs(panelScope, payload)
    setBusyDomain(null)
    if ('ok' in result) {
      setDomains((current) =>
        current?.map((item) =>
          item.domain === row.domain ? { ...item, enabled: next, sections: payload.sections } : item,
        ) ?? current,
      )
      // La barra de tabs lee el store de entitlements, no esta tabla: sin esta revalidación el tab
      // recién prendido no vuelve hasta el próximo foreground.
      await refreshEntitlements().catch(() => {})
      // El copy sale del REGISTRO del nav (`lib/funciones-copy.ts`), no de una lista cableada:
      // prometer «ya se ve» de un dominio sin ítem de menú es una mentira de dos segundos.
      toast.success(domainToggleMessage(row.domain, next))
      return
    }
    setDomains((current) =>
      current?.map((item) => (item.domain === row.domain ? { ...item, enabled: row.enabled } : item)) ?? current,
    )
    toast.error(result.error)
  }

  /** «Abrir ›» — el launcher disuelto: cada dominio prendido se abre desde su propia fila. */
  const openDomain = useCallback(
    async (domain: FeatureDomain) => {
      const href = DOMAIN_HREF[domain]
      if (href) {
        router.push(href as never)
        return
      }
      // Composición corporal se mide de a un alumno: primero se elige, después se navega. La lista
      // se pide recién al abrir la hoja (no al montar la pantalla).
      setPickerOpen(true)
      setLoadingClients(true)
      try {
        setClients(await listCardioClients())
      } catch {
        setClients([])
      } finally {
        setLoadingClients(false)
      }
    },
    [router],
  )

  async function onRestoreGuide() {
    if (busyGuide) return
    setBusyGuide(true)
    // Espejo del `hide()` de la guía, al revés: se apagan las DOS banderas, porque apagarla
    // escribe las dos juntas.
    await persistCoachOnboardingGuide({ dismissed: false, hidden: false })
    if (coachId != null) {
      // La píldora recuerda si el coach la había plegado: al reactivar la guía vuelve abierta.
      await AsyncStorage.setItem(guidePillStorageKey(coachId), GUIDE_PILL_EXPANDED).catch(() => {})
    }
    await loadDashboard().catch(() => null)
    setBusyGuide(false)
    toast.success('Tu guía volvió al panel.')
  }

  async function onDeleteDemo() {
    if (busyDemo) return
    setConfirmDelete(false)
    setBusyDemo(true)
    const result = await deleteDemoStudent()
    if (!result.ok) {
      setBusyDemo(false)
      toast.error(result.error)
      return
    }
    await loadDashboard().catch(() => null)
    setBusyDemo(false)
    toast.success(result.deleted ? 'Borramos el alumno de ejemplo.' : 'No había alumno de ejemplo.')
  }

  async function onReseedDemo() {
    if (busyDemo) return
    setBusyDemo(true)
    const result = await reseedDemoStudent()
    if (!result.ok) {
      setBusyDemo(false)
      toast.error(result.error)
      return
    }
    await loadDashboard().catch(() => null)
    setBusyDemo(false)
    const name = result.demoName ?? 'Tu alumno de ejemplo'
    toast.success(
      result.alreadyExisted ? `${name} ya estaba en tu lista.` : `${name} volvió a tu lista de alumnos.`,
    )
  }

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View
          className="flex-row items-center"
          style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}
        >
          <Pressable
            testID="funciones-back"
            accessibilityRole="button"
            accessibilityLabel="Volver a Opciones"
            onPress={() => router.back()}
            hitSlop={10}
            className="flex-row items-center"
            style={{ gap: 2, paddingVertical: 6, paddingHorizontal: 4 }}
          >
            <ChevronLeft size={22} strokeWidth={2.2} className="text-sport-600" />
            <Text className="font-sans-bold text-sport-600" style={{ fontSize: 15 }}>
              Opciones
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 56 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingTop: 8, paddingBottom: 4 }}>
            <Text
              accessibilityRole="header"
              className="font-display-black text-strong"
              style={{ fontSize: 26, letterSpacing: -0.5 }}
            >
              Funciones
            </Text>
            <Text
              className="font-sans text-muted"
              style={{ fontSize: 13.5, marginTop: 4, lineHeight: 19 }}
            >
              Tu especialidad, qué ves en tu panel y tu alumno de ejemplo.
            </Text>
          </View>

          {managed ? (
            <ManagedNotice>Tu panel lo administra tu organización o tu equipo.</ManagedNotice>
          ) : loading ? (
            <Text
              testID="funciones-loading"
              className="font-sans text-muted"
              style={{ fontSize: 13.5, textAlign: 'center', marginTop: 28 }}
            >
              Cargando…
            </Text>
          ) : (
            <>
              {/* ── 1. Especialidad ─────────────────────────────────────────────────────── */}
              <SectionTitle>Tu especialidad</SectionTitle>
              <Card variant="default" padding="lg" style={{ gap: 12 }}>
                <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
                  Con esto ordenamos tu panel. Cambiarla no borra nada de lo que ya tienes.
                </Text>

                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Tu especialidad"
                  style={{ gap: 8 }}
                >
                  {PERSONA_TILE_ORDER.map((option) => {
                    const Icon = PERSONA_ICONS[option]
                    const isSelected = persona === option
                    return (
                      <Pressable
                        key={option}
                        testID={`funciones-persona-${option}`}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected, disabled: savingPersona }}
                        accessibilityLabel={PERSONA_COPY[option].tileTitle}
                        disabled={savingPersona}
                        onPress={() => choosePersona(option)}
                        className={`flex-row items-center rounded-card border ${
                          isSelected ? 'border-sport-500 bg-sport-100' : 'border-subtle bg-surface-card'
                        }`}
                        style={{ gap: 12, padding: 12, opacity: savingPersona ? 0.7 : 1 }}
                      >
                        <View
                          className={`items-center justify-center rounded-control ${
                            isSelected ? 'bg-sport-500' : 'bg-surface-sunken'
                          }`}
                          style={{ width: 38, height: 38 }}
                        >
                          <Icon
                            size={19}
                            strokeWidth={2}
                            className={isSelected ? 'text-on-sport' : 'text-sport-600'}
                          />
                        </View>
                        <Text
                          className="font-sans-bold text-strong"
                          style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19 }}
                        >
                          {PERSONA_COPY[option].tileTitle}
                        </Text>
                        {isSelected ? (
                          <View
                            className="items-center justify-center rounded-full bg-sport-500"
                            style={{ width: 22, height: 22 }}
                          >
                            <Check size={13} strokeWidth={3} className="text-on-sport" />
                          </View>
                        ) : (
                          <ChevronRight size={17} strokeWidth={2.4} className="text-subtle" />
                        )}
                      </Pressable>
                    )
                  })}
                </View>

                {secondQuestion ? (
                  <View
                    className="rounded-card border border-subtle bg-surface-app"
                    style={{ gap: 10, padding: 12 }}
                  >
                    <Text className="font-sans-bold text-strong" style={{ fontSize: 13.5, lineHeight: 19 }}>
                      {secondQuestion}
                    </Text>
                    <SegmentedTabs
                      size="sm"
                      items={[
                        { value: 'si', label: 'Sí' },
                        { value: 'no', label: 'No' },
                      ]}
                      value={alsoOther ? 'si' : 'no'}
                      onChange={(value) => setAlsoOther(value === 'si')}
                    />
                  </View>
                ) : null}

                <View
                  className="flex-row items-center rounded-card border border-subtle bg-surface-app"
                  style={{ gap: 14, padding: 12 }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text className="font-sans-bold text-strong" style={{ fontSize: 13.5 }}>
                      Ordenar mi panel según mi especialidad
                    </Text>
                    <Text
                      className="font-sans text-muted"
                      style={{ fontSize: 12, lineHeight: 17, marginTop: 3 }}
                    >
                      Prende y apaga los módulos de abajo por ti. Si ya los ajustaste a mano, déjalo
                      apagado.
                    </Text>
                  </View>
                  <Switch value={reorder} onValueChange={setReorder} disabled={savingPersona} />
                </View>

                <Button
                  testID="funciones-save-persona"
                  label="Guardar especialidad"
                  variant="sport"
                  size="md"
                  full
                  loading={savingPersona}
                  disabled={savingPersona || !personaDirty}
                  onPress={() => {
                    void onSavePersona()
                  }}
                />
              </Card>

              {/* ── 2. Qué se ve en tu panel ────────────────────────────────────────────── */}
              <SectionTitle>Qué se ve en tu panel</SectionTitle>
              <Card variant="default" padding="none">
                {(domains ?? []).map((row, index) => {
                  const Icon = DOMAIN_ICONS[row.domain]
                  return (
                    <View
                      key={row.domain}
                      testID={`funciones-domain-${row.domain}`}
                      className="flex-row items-center"
                      style={{
                        gap: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 13,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: theme.border,
                      }}
                    >
                      <Icon size={18} strokeWidth={2} className="text-sport-600" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text className="font-sans-bold text-strong" style={{ fontSize: 13.5 }}>
                          {row.label}
                        </Text>
                        <Text
                          className="font-sans text-muted"
                          style={{ fontSize: 11.5, lineHeight: 16, marginTop: 2 }}
                        >
                          {DOMAIN_PITCH[row.domain]}
                        </Text>
                        {/* «Abrir ›» solo con el dominio PRENDIDO: ofrecer la puerta de algo que la
                            app está ocultando es la incoherencia que W1 vino a cerrar. */}
                        {row.enabled ? (
                          <Pressable
                            testID={`funciones-open-${row.domain}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Abrir ${row.label}`}
                            onPress={() => {
                              void openDomain(row.domain)
                            }}
                            hitSlop={8}
                            className="flex-row items-center self-start"
                            style={{ gap: 2, paddingTop: 5 }}
                          >
                            <Text
                              className="font-sans-bold"
                              style={{ fontSize: 12, color: theme.primary }}
                            >
                              Abrir
                            </Text>
                            <ChevronRight size={13} strokeWidth={2.6} color={theme.primary} />
                          </Pressable>
                        ) : null}
                      </View>
                      <Switch
                        value={row.enabled}
                        onValueChange={(next) => {
                          void onToggleDomain(row, next)
                        }}
                        disabled={busyDomain != null}
                      />
                    </View>
                  )
                })}
              </Card>
              <Text
                className="font-sans text-muted"
                style={{ fontSize: 12, lineHeight: 17, marginTop: 10, paddingHorizontal: 2 }}
              >
                Esto ordena tu panel. Por ahora, apagar un módulo también lo oculta en la app de tus alumnos.
              </Text>
            </>
          )}

          {/* ── 3. Detalle de nutrición ─────────────────────────────────────────────────
              `nutritionLocked` implica `managed`, así que el aviso de arriba ya lo dijo: acá la
              sección simplemente no existe en vez de repetir el mismo candado. */}
          {nutritionLocked ? null : (
            <>
              <SectionTitle>Detalle de nutrición</SectionTitle>
              {!canEditNutrition ? (
                <Card
                  variant="default"
                  padding="md"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}
                >
                  <Lock size={16} strokeWidth={2} className="text-muted" />
                  <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 12.5, lineHeight: 18 }}>
                    Solo el gestor del equipo puede cambiar estas funciones. Puedes verlas, pero no editarlas.
                  </Text>
                </Card>
              ) : null}
              {nutritionPrefs === null ? (
                <Text
                  testID="funciones-nutrition-loading"
                  className="font-sans text-muted"
                  style={{ fontSize: 13.5, textAlign: 'center', marginTop: 12 }}
                >
                  Cargando…
                </Text>
              ) : (
                nutritionPrefs.map((prefs) => (
                  <NutritionDetail
                    key={`${nutritionScope.scope}:${nutritionScope.teamId ?? nutritionScope.coachId ?? ''}:${prefs.domain}`}
                    data={prefs}
                    scopeCtx={nutritionScope}
                    canEdit={canEditNutrition}
                    // El master switch vive en el bloque 2 (única fuente). Solo viaja acá cuando ese
                    // bloque no se pinta —un team— para no dejar al equipo sin cómo apagar nutrición.
                    showMasterSwitch={managed}
                  />
                ))
              )}
            </>
          )}

          {managed || loading ? null : (
            <>
              {/* ── 4. Guía de inicio ───────────────────────────────────────────────────── */}
              <SectionTitle>Tu guía de inicio</SectionTitle>
              <Card variant="default" padding="none">
                <ListRow
                  testID="funciones-open-guide"
                  leading={
                    <View
                      className="items-center justify-center rounded-control bg-sport-100"
                      style={{ width: 46, height: 46 }}
                    >
                      <Compass size={22} strokeWidth={2} className="text-sport-600" />
                    </View>
                  }
                  title="Ver mi guía de inicio"
                  subtitle="Tus primeros pasos, siempre disponibles. Aunque ya la hayas terminado o cerrado."
                  showChevron
                  onPress={() => router.push(MI_PANEL_GUIA_ROUTE)}
                />
              </Card>
              {visibility.canRestoreGuide ? (
                <Button
                  testID="funciones-restore-guide"
                  label="Volver a mostrar la guía"
                  variant="outline"
                  size="sm"
                  full
                  loading={busyGuide}
                  disabled={busyGuide}
                  style={{ marginTop: 10 }}
                  onPress={() => {
                    void onRestoreGuide()
                  }}
                />
              ) : null}

              {/* ── 5. Alumno de ejemplo ────────────────────────────────────────────────── */}
              <SectionTitle>Alumno de ejemplo</SectionTitle>
              <Card variant="default" padding="lg" style={{ gap: 12 }}>
                <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
                  {visibility.demoName
                    ? `${visibility.demoName} es un alumno de mentira para que pruebes tu app sin gastar cupo. No cuenta para tu plan ni recibe correos.`
                    : visibility.personaHasNoDemo
                      ? 'Tu especialidad no trae alumno de ejemplo. Elige otra si quieres uno para probar.'
                      : 'No pudimos leer tu especialidad. Vuelve a entrar en un momento.'}
                </Text>

                {visibility.canReseedDemo ? (
                  <Button
                    testID="funciones-reseed-demo"
                    label="Volver a sembrar el alumno de ejemplo"
                    variant="secondary"
                    size="sm"
                    full
                    leftIcon={UserPlus}
                    loading={busyDemo}
                    disabled={busyDemo}
                    onPress={() => {
                      void onReseedDemo()
                    }}
                  />
                ) : null}

                {visibility.canDeleteDemo ? (
                  <Button
                    testID="funciones-delete-demo"
                    label="Borrar alumno de ejemplo"
                    variant="destructive"
                    size="sm"
                    full
                    leftIcon={Trash2}
                    loading={busyDemo}
                    disabled={busyDemo}
                    onPress={() => setConfirmDelete(true)}
                  />
                ) : null}
              </Card>
            </>
          )}
        </ScrollView>

        {/* Selector de alumno para «Abrir» Composición corporal (captura 1-a-1). */}
        <Sheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title="Elige un alumno"
          description="Composición corporal · se mide a una persona a la vez"
          snapPoints={['55%', '85%']}
        >
          <BodycompClientPicker
            clients={clients}
            loading={loadingClients}
            onPick={(id) => {
              setPickerOpen(false)
              // Guard por uuid: un id nulo generaba la URL `/coach/bodycomp/null` y el param llegaba
              // como el STRING 'null' (truthy) hasta un filtro uuid de PostgREST.
              if (isUuid(id)) router.push(`/coach/bodycomp/${id}` as never)
            }}
            onCreate={() => {
              setPickerOpen(false)
              router.push('/coach/(tabs)/clientes')
            }}
          />
        </Sheet>
      </SafeAreaView>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Borrar alumno de ejemplo"
        description={
          visibility.demoName
            ? `${visibility.demoName} y todo lo que se sembró con él desaparecen de tu lista. Puedes volver a crearlo cuando quieras.`
            : 'El alumno de ejemplo y todo lo que se sembró con él desaparecen de tu lista.'
        }
        showCloseButton={!busyDemo}
        footer={
          // Botones APILADOS: dos `full` en una fila se desbordan (gotcha shrink-0 del DS).
          <View style={{ gap: 10 }}>
            <Button
              testID="funciones-delete-demo-confirm"
              label="Borrar"
              variant="danger"
              full
              loading={busyDemo}
              disabled={busyDemo}
              onPress={() => {
                void onDeleteDemo()
              }}
            />
            <Button
              label="Cancelar"
              variant="ghost"
              full
              disabled={busyDemo}
              onPress={() => setConfirmDelete(false)}
            />
          </View>
        }
      >
        {/* `Dialog` exige `children`: el cuerpo ya lo dice `description`; no hay nada más que mostrar. */}
        {null}
      </Dialog>
    </View>
  )
}

interface NutritionDetailProps {
  data: DomainPrefs
  scopeCtx: FeaturePrefsScope
  canEdit: boolean
  /** El master switch del dominio solo se pinta cuando el bloque 2 no está (scope team). */
  showMasterSwitch: boolean
}

/**
 * Detalle de nutrición: preset + secciones. Borrador local, commit único con «Guardar» (espejo del
 * `DomainFuncionesGroup` de la web).
 *
 * W4.1: las dos secciones que antes salían con candado (`micros_advanced`, `goals_bodycomp`) son
 * toggles normales. La regla del owner es «todo está en todos los planes, solo se cobra el cupo»:
 * no queda distinción de plan que bloquearlas, así que se fueron el badge Base/Pro, el «Requiere
 * <módulo>» y el botón «Ver mi plan».
 */
function NutritionDetail({ data, scopeCtx, canEdit, showMasterSwitch }: NutritionDetailProps) {
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
      // El master switch del dominio mueve la barra de tabs, que lee el store de entitlements y no
      // esta tabla: sin revalidar, el cambio no se ve hasta el próximo foreground.
      await refreshEntitlements().catch(() => {})
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
    <View style={{ gap: 12 }}>
      {/* 1. Selector de preset */}
      <Card variant="default" padding="lg" style={{ gap: 10 }}>
        <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>
          ¿Qué tan a fondo trabajas {data.label.toLowerCase()}?
        </Text>
        <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
          Elige un punto de partida. Puedes ajustar cada sección después.
        </Text>
        <View style={{ opacity: canEdit ? 1 : 0.55, marginTop: 2 }} pointerEvents={canEdit ? 'auto' : 'none'}>
          <SegmentedTabs<Preset> items={PRESET_ITEMS} value={preset} onChange={applyPreset} />
        </View>
        <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18 }}>
          {PRESET_HINT[preset]}
        </Text>
      </Card>

      {/* 2. Master switch — SOLO donde el bloque «Qué se ve en tu panel» no existe (team). */}
      {showMasterSwitch ? (
        <Card variant="default" padding="lg" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>
              Mostrar {data.label}
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 12, lineHeight: 17, marginTop: 3 }}>
              Apaga esto si no lo usas. Oculta el menú y su contenido para ti y tus alumnos. No borra datos.
            </Text>
          </View>
          <Switch
            value={domainEnabled}
            onValueChange={(next) => setSections((s) => ({ ...s, [DOMAIN_ENABLED_KEY]: next }))}
            disabled={!canEdit}
          />
        </Card>
      ) : null}

      {/* 3. Ajustar secciones */}
      <Card variant="default" padding="none" radius="lg">
        <Pressable
          testID="funciones-adjust-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: adjustOpen, disabled: !domainEnabled }}
          onPress={() => domainEnabled && setAdjustOpen((o) => !o)}
          disabled={!domainEnabled}
          className="flex-row items-center justify-between"
          style={{ paddingHorizontal: 16, paddingVertical: 14, opacity: domainEnabled ? 1 : 0.5 }}
        >
          <Text className="font-sans-bold text-strong" style={{ fontSize: 14 }}>
            Ajustar secciones
          </Text>
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
                    <Text className="font-sans-medium text-strong" style={{ fontSize: 13.5 }}>
                      {section.label}
                    </Text>
                    <Text
                      className="font-sans text-muted"
                      style={{ fontSize: 11.5, lineHeight: 16, marginTop: 2 }}
                    >
                      {section.tooltip}
                    </Text>
                  </View>
                  <Switch
                    value={checked}
                    onValueChange={(v) => toggleSection(section.key, v)}
                    disabled={!canEdit}
                  />
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
            testID="funciones-discard"
            accessibilityRole="button"
            onPress={discard}
            disabled={busy}
            hitSlop={6}
            style={{ paddingHorizontal: 14, paddingVertical: 10, opacity: busy ? 0.4 : 1 }}
          >
            <Text className="font-sans-bold text-muted" style={{ fontSize: 13 }}>
              Descartar
            </Text>
          </Pressable>
          <Pressable
            testID="funciones-save"
            accessibilityRole="button"
            onPress={() => {
              void save()
            }}
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
