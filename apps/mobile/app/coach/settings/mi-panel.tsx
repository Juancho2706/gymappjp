import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { cssInterop } from 'nativewind'
import * as Haptics from 'expo-haptics'
import {
  Apple,
  Check,
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
import type { FeatureDomain } from '@eva/feature-prefs'
import { PERSONA_COPY, PERSONA_TILE_ORDER, type Persona } from '@eva/schemas'
import { AppBackground } from '../../../components/AppBackground'
import { Button, Card, Dialog, SegmentedTabs } from '../../../components'
import { ListRow } from '../../../components/ListRow'
import { Switch } from '../../../components/Switch'
import { toast } from '../../../components/Toast'
import { useTheme } from '../../../context/ThemeContext'
import { useWorkspace } from '../../../lib/workspace'
import { getCoachProfile } from '../../../lib/coach'
import { resetCoachPersonaCache } from '../../../lib/coach-persona'
import {
  getCoachDashboardDataMobile,
  persistCoachOnboardingGuide,
  publishCoachOnboarding,
  type MobileDashboardData,
} from '../../../lib/coach-dashboard'
import { saveFeaturePrefs, type FeaturePrefsScope } from '../../../lib/feature-prefs.queries'
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
 * «Opciones › Mi panel» (SPEC coach-onboarding-v2 §2 y §4; TASKS W8.2.2).
 *
 * Cierra `spec-rn-08`: el chip de la guía dice «Cambiar en Opciones» y la pantalla de persona
 * promete «Opciones › Mi panel», pero en la app no había DÓNDE. Espejo de `MiPanelPane` +
 * `MiPanelClient` de la web, con el molde visual de `settings/features.tsx` (header con back,
 * scroll, cards del DS).
 *
 * Cuatro bloques, en el mismo orden que la web:
 *  1. Tu especialidad — las 5 tarjetas de `PERSONA_TILE_ORDER`, la segunda pregunta cuando la
 *     persona la tiene, el switch «Ordenar mi panel según mi especialidad» (APAGADO por defecto:
 *     cambiar de etiqueta no puede borrarle los toggles a quien ya los ajustó) y «Guardar».
 *  2. Módulos de tu panel — el master switch (`_enabled`) de los 5 dominios. Cada uno se guarda
 *     solo, con reversión optimista si el write falla.
 *  3. Tu guía de inicio — volver a `/coach/guia` siempre, y reactivarla si el coach la cerró.
 *  4. Alumno de ejemplo — borrarlo (con confirmación) o volver a sembrarlo.
 *
 * Solo para coach STANDALONE: a un coach administrado por un team o una org el panel se lo define
 * el tenant (mismo rechazo que el endpoint y que el server action web). La entrada del hub tampoco
 * se pinta, pero esta pantalla se defiende sola porque el deep link existe.
 *
 * Colores: nunca literales de marca. Los iconos lucide toman su color por `className` gracias al
 * `cssInterop` de abajo, así que el `sport-*` del coach (white-label) y el dark mode se resuelven
 * en runtime.
 */

for (const Icon of [
  Apple,
  Check,
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

/** Ícono por dominio — el MISMO mapeo que `MiPanelClient.tsx`. */
const DOMAIN_ICONS: Record<FeatureDomain, LucideIcon> = {
  nutrition: Apple,
  training: Dumbbell,
  cardio: HeartPulse,
  movement: PersonStanding,
  bodycomp: Ruler,
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

export default function CoachMiPanelScreen() {
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

  // Un coach administrado no edita nada acá: su panel lo define el tenant.
  const managed = ws.kind === 'enterprise' || ws.kind === 'team_owner' || ws.kind === 'team_member' || ws.isManaged

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

  const scopeCtx: FeaturePrefsScope = useMemo(
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
    const result = await saveFeaturePrefs(scopeCtx, payload)
    setBusyDomain(null)
    if ('ok' in result) {
      setDomains((current) =>
        current?.map((item) =>
          item.domain === row.domain ? { ...item, enabled: next, sections: payload.sections } : item,
        ) ?? current,
      )
      toast.success(next ? 'Listo, ya se ve.' : 'Listo, lo ocultamos.')
      return
    }
    setDomains((current) =>
      current?.map((item) => (item.domain === row.domain ? { ...item, enabled: row.enabled } : item)) ?? current,
    )
    toast.error(result.error)
  }

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
            testID="mi-panel-back"
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
              Mi panel
            </Text>
            <Text
              className="font-sans text-muted"
              style={{ fontSize: 13.5, marginTop: 4, lineHeight: 19 }}
            >
              Tu especialidad, qué módulos ves y tu guía de inicio.
            </Text>
          </View>

          {managed ? (
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
                Tu panel lo administra tu organización o tu equipo.
              </Text>
            </Card>
          ) : loading ? (
            <Text
              testID="mi-panel-loading"
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
                        testID={`mi-panel-persona-${option}`}
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
                  <Switch
                    value={reorder}
                    onValueChange={setReorder}
                    disabled={savingPersona}
                  />
                </View>

                <Button
                  testID="mi-panel-save-persona"
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

              {/* ── 2. Módulos del panel ────────────────────────────────────────────────── */}
              <SectionTitle>Módulos de tu panel</SectionTitle>
              <Card variant="default" padding="none">
                {(domains ?? []).map((row, index) => {
                  const Icon = DOMAIN_ICONS[row.domain]
                  return (
                    <View
                      key={row.domain}
                      testID={`mi-panel-domain-${row.domain}`}
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
                          {row.description}
                        </Text>
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

              {/* ── 3. Guía de inicio ───────────────────────────────────────────────────── */}
              <SectionTitle>Tu guía de inicio</SectionTitle>
              <Card variant="default" padding="none">
                <ListRow
                  testID="mi-panel-open-guide"
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
                  testID="mi-panel-restore-guide"
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

              {/* ── 4. Alumno de ejemplo ────────────────────────────────────────────────── */}
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
                    testID="mi-panel-reseed-demo"
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
                    testID="mi-panel-delete-demo"
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
              testID="mi-panel-delete-demo-confirm"
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
