import { Fragment, useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import {
  Apple,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Info,
  LayoutGrid,
  PersonStanding,
  Ruler,
  Search,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native'
import { MODULE_CATALOG, type ModuleKey } from '@eva/module-catalog'
import { DOMAIN_ENABLED_KEY, resolvePersonaPrefs, type FeatureDomain } from '@eva/feature-prefs'
import { useEntitlements } from '../../lib/entitlements'
import { useWorkspace } from '../../lib/workspace'
import { listCardioClients, type CardioClientRow } from '../../lib/cardio-coach'
import { getCachedCoachPersonaStatus, type CoachPersonaStatus } from '../../lib/coach-persona'
import { isUuid } from '../../lib/safe-uuid'
import { hexToRgba } from '../../lib/theme'
import { AppBackground } from '../../components/AppBackground'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { Input } from '../../components/Input'
import { Sheet } from '../../components/Sheet'
import { ModuleToolRow, type ModuleToolState } from '../../components/coach/tools/ModuleToolRow'
import { useTheme } from '../../context/ThemeContext'

/**
 * Hub /coach/tools (E6-02) — launcher de los módulos que el coach USA (espejo mobile del
 * `ToolsHub` web `apps/web/.../coach/tools`). Los módulos vienen INCLUIDOS en los planes pagos
 * (CEO 2026-07-17): los ENTITLED se listan arriba; los NO entitled (coach Free) NO se esconden —
 * quedan en su propia sección con aspecto apagado y llevan al catálogo (sin precios por módulo).
 * La capa del plan (`nutrition_exchanges`) va aparte: se configura DENTRO de un plan, no acá.
 *
 * Money-safety: solo VISIBILIDAD; el gate de dinero vive server-side en /api/mobile/*. El picker
 * de composición no pega a la DB sin el módulo. 0 alumnos -> CTA crear alumno (NUNCA crash — el
 * bug web de módulos con 0 alumnos NO se hereda, memoria module_page_crash_no_clients).
 *
 * REDISEÑO 2026-08-22 (QA del owner: «no tiene la estética del resto de la app»). La pantalla
 * hablaba un dialecto propio — cabecera con tile de ícono, una CARD por módulo con círculo de
 * marca, dos chips y un botón primario a todo el ancho. Ahora habla el vocabulario del hub de
 * Opciones y del directorio: título display + secciones con eyebrow, y grupos de FILAS dentro de
 * una `Card padding="none"` (tile 46 teñido con la marca, título + una línea, chip de estado,
 * chevron, fila entera tocable). Los datos y la navegación son los MISMOS.
 */

// Let NativeWind drive the lucide icon `color` via `text-*` classes (DS pattern, ver perfil.tsx).
// Solo para los íconos cuyo color sale de un token de RAMPA que una prop `color` no puede resolver
// (sport-600 del link de volver, sport-400 sobre superficie inversa); el resto usa `color` con
// `theme.*`, que ya viene resuelto por esquema y por marca.
for (const Icon of [ChevronLeft, LayoutGrid]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

type ToolScope = 'student' | 'plan'
type ToolDef = {
  key: ModuleKey
  icon: LucideIcon
  /** Descripcion corta de valor — UNA línea: la fila la trunca, no la envuelve. */
  value: string
  /** Alcance: se usa con un alumno (student) vs se configura dentro del plan (plan). */
  scope: ToolScope
  /** El modulo se captura 1-a-1: abre el picker de alumno antes de navegar. */
  picker?: boolean
  /** Ruta directa (modulos con hub propio que ya listan alumnos). */
  href?: string
}

// Herramientas por-alumno del launcher (scope 'student'). El orden espeja el catalogo del kit;
// la especialidad del coach lo reordena en runtime (ver `orderByPersona`).
const TOOLS: ToolDef[] = [
  {
    key: 'cardio',
    icon: HeartPulse,
    value: 'Zonas de FC, ritmos e intervalos.',
    scope: 'student',
    href: '/coach/cardio',
  },
  {
    key: 'movement_assessment',
    icon: PersonStanding,
    value: 'Screening de 7 patrones con semáforo.',
    scope: 'student',
    href: '/coach/movement',
  },
  {
    key: 'body_composition',
    icon: Ruler,
    value: 'Bioimpedancia y antropometría ISAK.',
    scope: 'student',
    picker: true,
  },
]

// Capa del plan — intercambios NO es herramienta del launcher; vive dentro del plan de nutrición.
const PLAN_TOOL: ToolDef = {
  key: 'nutrition_exchanges',
  icon: Apple,
  value: 'Porciones e intercambios, con tu marca.',
  scope: 'plan',
  href: '/coach/(tabs)/nutricion',
}

/**
 * Módulo → dominio de `@eva/feature-prefs`. Es el puente para ordenar por especialidad: la matriz
 * canónica persona→dominios ya existe y es PURA (`resolvePersonaPrefs`, SPEC coach-onboarding-v2
 * §2), así que la jerarquía no inventa criterio propio ni pide un endpoint nuevo.
 */
const TOOL_DOMAIN: Record<ModuleKey, FeatureDomain> = {
  cardio: 'cardio',
  movement_assessment: 'movement',
  body_composition: 'bodycomp',
  nutrition_exchanges: 'nutrition',
}

export default function ToolsHubScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const { hasModule, ready } = useEntitlements()
  const { isManaged: managed } = useWorkspace()

  // Especialidad del coach: lectura SINCRÓNICA de la caché de sesión del gate de persona (el layout
  // de /coach ya la resolvió antes de que se pueda llegar acá). Sin red, sin loader y sin endpoint
  // nuevo: `null` = no se sabe ⇒ se respeta el orden del catálogo.
  const [personaStatus, setPersonaStatus] = useState<CoachPersonaStatus | null>(
    getCachedCoachPersonaStatus,
  )
  useFocusEffect(
    useCallback(() => {
      setPersonaStatus(getCachedCoachPersonaStatus())
    }, []),
  )

  const personaDomains = useMemo(
    () =>
      personaStatus?.persona
        ? resolvePersonaPrefs(personaStatus.persona, personaStatus.alsoOther)
        : null,
    [personaStatus?.persona, personaStatus?.alsoOther],
  )

  /** Los módulos de la especialidad del coach primero; `sort` es estable ⇒ los demás no se mueven. */
  const orderByPersona = useCallback(
    (list: ToolDef[]): ToolDef[] => {
      if (!personaDomains) return list
      const uses = (t: ToolDef) => personaDomains[TOOL_DOMAIN[t.key]][DOMAIN_ENABLED_KEY] === true
      return [...list].sort((a, b) => Number(uses(b)) - Number(uses(a)))
    },
    [personaDomains],
  )

  const activeTools = useMemo(
    () => orderByPersona(TOOLS.filter((t) => hasModule(t.key))),
    [hasModule, orderByPersona],
  )
  const lockedTools = useMemo(
    () => orderByPersona(TOOLS.filter((t) => !hasModule(t.key))),
    [hasModule, orderByPersona],
  )
  const planActive = hasModule('nutrition_exchanges')
  const anyActive = activeTools.length > 0 || planActive
  const bodycompActive = hasModule('body_composition')

  const [clients, setClients] = useState<CardioClientRow[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Alumnos para el picker de Composicion. Sin el modulo NO se pega a la DB (money-safety).
  useFocusEffect(
    useCallback(() => {
      if (!bodycompActive) {
        setLoadingClients(false)
        return
      }
      let cancelled = false
      void (async () => {
        setLoadingClients(true)
        try {
          const rows = await listCardioClients()
          if (!cancelled) setClients(rows)
        } finally {
          if (!cancelled) setLoadingClients(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [bodycompActive]),
  )

  // Handler primario por fila, calculado por estado (activo / picker / bloqueado / gestionado).
  const primaryFor = useCallback(
    (tool: ToolDef, active: boolean): (() => void) | undefined => {
      if (active) {
        if (tool.picker) return () => setPickerOpen(true)
        return () => router.push(tool.href as never)
      }
      if (managed) return undefined
      return () => router.push('/coach/modules')
    },
    [router, managed],
  )

  const stateFor = (active: boolean): ModuleToolState =>
    active ? 'active' : managed ? 'managed' : 'locked'

  const renderRow = (tool: ToolDef, active: boolean) => (
    <ModuleToolRow
      icon={tool.icon}
      label={MODULE_CATALOG[tool.key].label}
      description={tool.value}
      state={stateFor(active)}
      onPress={primaryFor(tool, active)}
      testID={active ? `tools-use-${tool.key}` : `tools-unlock-${tool.key}`}
    />
  )

  const lockedNote = managed
    ? 'Los activa el owner de tu equipo.'
    : 'Se activan solos cuando tu plan los incluye. Toca uno para ver el catálogo.'

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Back al hub Opciones (Herramientas es sub-pantalla pusheada, 1:1 con /coach/modules). */}
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            testID="tools-back"
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

        {!ready ? (
          <EvaLoaderScreen subtitle="Cargando…" />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
            {/* Cabecera: título display + una línea, igual que Módulos y Opciones. */}
            <View style={{ paddingTop: 8, paddingBottom: 4 }}>
              <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.5 }}>
                Herramientas
              </Text>
              <Text className="font-sans text-muted" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 19 }}>
                {anyActive
                  ? 'Tus módulos de evaluación, uno a uno con cada alumno.'
                  : 'Módulos de evaluación para trabajar alumno por alumno.'}
              </Text>
            </View>

            {!anyActive ? (
              <>
                {/* Empty-state informativo — sin venta in-app (compliance stores, informe 2026-07-31). */}
                <View style={{ marginTop: 14 }}>
                  <SellCard managed={managed} onExplore={() => router.push('/coach/modules')} />
                </View>
                <SectionTitle>No incluidos en tu plan</SectionTitle>
                <Card padding="none">
                  {[...TOOLS, PLAN_TOOL].map((tool, i) => (
                    <Fragment key={tool.key}>
                      {i > 0 ? <RowDivider /> : null}
                      {renderRow(tool, false)}
                    </Fragment>
                  ))}
                </Card>
                <Note>{lockedNote}</Note>
              </>
            ) : (
              <>
                {/* El ALCANCE se dice UNA vez, acá — no como chip repetido en cada módulo. */}
                {activeTools.length > 0 ? (
                  <View
                    className="flex-row items-center rounded-control bg-surface-sunken"
                    style={{ gap: 9, paddingHorizontal: 13, paddingVertical: 10, marginTop: 14 }}
                  >
                    <Info size={16} strokeWidth={2} color={theme.mutedForeground} />
                    <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 12.5, lineHeight: 17 }}>
                      Elige un módulo y luego al alumno.
                    </Text>
                  </View>
                ) : null}

                {/* Activos arriba, con la especialidad del coach primero. */}
                {activeTools.length > 0 ? (
                  <>
                    <SectionTitle>Tus módulos</SectionTitle>
                    <Card padding="none">
                      {activeTools.map((tool, i) => (
                        <Fragment key={tool.key}>
                          {i > 0 ? <RowDivider /> : null}
                          {renderRow(tool, true)}
                        </Fragment>
                      ))}
                    </Card>
                  </>
                ) : null}

                {/* Capa del plan — intercambios vive en el plan, no en el launcher. */}
                {planActive ? (
                  <>
                    <SectionTitle>En el plan de nutrición</SectionTitle>
                    <Card padding="none">{renderRow(PLAN_TOOL, true)}</Card>
                  </>
                ) : null}

                {/* Lo que el plan todavía no cubre — apagado, sin robarle peso a lo usable. */}
                {lockedTools.length > 0 || !planActive ? (
                  <>
                    <SectionTitle>No incluidos en tu plan</SectionTitle>
                    <Card padding="none">
                      {[...lockedTools, ...(planActive ? [] : [PLAN_TOOL])].map((tool, i) => (
                        <Fragment key={tool.key}>
                          {i > 0 ? <RowDivider /> : null}
                          {renderRow(tool, false)}
                        </Fragment>
                      ))}
                    </Card>
                    <Note>{lockedNote}</Note>
                  </>
                ) : null}
              </>
            )}
          </ScrollView>
        )}

        {/* Picker de alumno SINGLE para Composición (captura 1-a-1). */}
        <Sheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title="Elige un alumno"
          description="Composición corporal · se mide a una persona a la vez"
          snapPoints={['55%', '85%']}
        >
          <StudentPicker
            clients={clients}
            loading={loadingClients}
            onPick={(id) => {
              setPickerOpen(false)
              // Guard por uuid: un id nulo generaba la URL `/coach/bodycomp/null` y el param llegaba
              // como el STRING 'null' (truthy) hasta un filtro uuid de PostgREST. Sin id usable se
              // queda en el hub (el picker ya se cerró) en vez de abrir una ficha rota.
              if (isUuid(id)) router.push(`/coach/bodycomp/${id}` as never)
            }}
            onCreate={() => {
              setPickerOpen(false)
              router.push('/coach/(tabs)/clientes')
            }}
          />
        </Sheet>
      </SafeAreaView>
    </View>
  )
}

/* ── Eyebrow de sección — barra de MARCA + label 11px (1:1 con el hub de Opciones) ───── */
function SectionTitle({ children }: { children: string }) {
  const { theme } = useTheme()
  return (
    <View className="mx-0.5 mb-2.5 mt-5 flex-row items-center gap-2">
      {/* La barrita sale de `theme.primary` (marca del coach), no de `bg-sport-*`. */}
      <View style={{ height: 12, width: 3, borderRadius: 2, backgroundColor: theme.primary }} />
      <Text className="font-sans-extra text-subtle" style={{ fontSize: 11, letterSpacing: 0.77, textTransform: 'uppercase' }}>
        {children}
      </Text>
    </View>
  )
}

/** Separador hairline entre filas apiladas dentro de una `Card padding="none"`. */
function RowDivider() {
  return <View className="mx-[14px] border-t border-subtle" />
}

/** Pie de sección — explica el estado sin ocupar una fila. */
function Note({ children }: { children: string }) {
  return (
    <Text className="font-sans text-subtle" style={{ fontSize: 11.5, lineHeight: 16, marginTop: 8, paddingHorizontal: 2 }}>
      {children}
    </Text>
  )
}

/* ── Empty-state que VENDE — card inverse (espejo del estado vacío web) ───────── */
function SellCard({ managed, onExplore }: { managed: boolean; onExplore: () => void }) {
  const { theme } = useTheme()
  return (
    <Card variant="inverse" padding="lg" style={{ alignItems: 'center', gap: 0 }}>
      <View
        renderToHardwareTextureAndroid
        className="items-center justify-center rounded-2xl"
        style={{ width: 60, height: 60, marginBottom: 14, backgroundColor: hexToRgba(theme.primary, 0.18) }}
      >
        <LayoutGrid size={28} strokeWidth={2} className="text-sport-400" />
      </View>
      <Text className="font-display-black text-on-dark" style={{ fontSize: 22, letterSpacing: -0.44, textAlign: 'center' }}>
        Potencia tu evaluación
      </Text>
      <Text className="font-sans text-on-dark-muted" style={{ fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 300 }}>
        Cardio con zonas, screening de movimiento y composición corporal — herramientas profesionales por alumno.
      </Text>
      {!managed ? (
        <Button
          label="No incluidas en tu plan — Ver módulos"
          variant="sport"
          onPress={onExplore}
          full
          style={{ marginTop: 18 }}
          testID="tools-empty-cta"
        />
      ) : (
        <Text className="font-sans-semibold text-on-dark-muted" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 16 }}>
          Pídele al owner de tu equipo que active los módulos.
        </Text>
      )}
    </Card>
  )
}

/* ── Picker de alumno (lista + búsqueda) ─────────────────────────────────────── */
function StudentPicker({
  clients,
  loading,
  onPick,
  onCreate,
}: {
  clients: CardioClientRow[]
  loading: boolean
  onPick: (id: string) => void
  onCreate: () => void
}) {
  const { theme } = useTheme()
  const [q, setQ] = useState('')

  const list = useMemo(
    () => clients.filter((c) => (c.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase())),
    [clients, q],
  )

  if (!loading && clients.length === 0) {
    // Empty-state 0 alumnos: NO crash — CTA a crear alumno.
    return (
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
        <Text className="font-sans text-muted" style={{ fontSize: 13.5, lineHeight: 20, textAlign: 'center' }}>
          Aún no tienes alumnos. Agrega uno para tomar mediciones de composición corporal.
        </Text>
        <Button label="Crear alumno" variant="sport" leftIcon={UserPlus} onPress={onCreate} testID="tools-picker-create" />
      </View>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <Input
        testID="tools-picker-search"
        leftIcon={Search}
        placeholder="Buscar alumno…"
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <Text className="font-sans text-muted" style={{ fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>Cargando alumnos…</Text>
      ) : list.length === 0 ? (
        <Text className="font-sans text-muted" style={{ fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>Sin resultados</Text>
      ) : (
        list.map((c) => (
          <Pressable
            key={c.id}
            testID={`tools-picker-client-${c.id}`}
            accessibilityRole="button"
            onPress={() => onPick(c.id)}
            className="flex-row items-center"
            style={{ gap: 12, paddingVertical: 10 }}
          >
            <View className="items-center justify-center rounded-full bg-ink-900" style={{ width: 38, height: 38 }}>
              <Text className="font-display-bold text-sport-400" style={{ fontSize: 14 }}>
                {(c.full_name ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text className="font-sans-bold text-strong" style={{ flex: 1, fontSize: 14.5 }} numberOfLines={1}>
              {c.full_name ?? 'Alumno'}
            </Text>
            <ChevronRight size={16} strokeWidth={2} color={theme.ink300} />
          </Pressable>
        ))
      )}
    </View>
  )
}
