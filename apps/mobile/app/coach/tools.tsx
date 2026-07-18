import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import {
  Apple,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  ClipboardList,
  HeartPulse,
  Info,
  LayoutGrid,
  Lock,
  PersonStanding,
  Ruler,
  Search,
  UserPlus,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native'
import { MODULE_CATALOG, type ModuleKey } from '@eva/module-catalog'
import { useEntitlements } from '../../lib/entitlements'
import { useWorkspace } from '../../lib/workspace'
import { listCardioClients, type CardioClientRow } from '../../lib/cardio-coach'
import { AppBackground } from '../../components/AppBackground'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { Input } from '../../components/Input'
import { Sheet } from '../../components/Sheet'
import { useTheme } from '../../context/ThemeContext'

/**
 * Hub /coach/tools (E6-02) — launcher de los módulos que el coach USA (espejo mobile del
 * `ToolsHub` web `apps/web/.../coach/tools`). Los módulos vienen INCLUIDOS en los planes pagos
 * (CEO 2026-07-17): los ENTITLED se listan arriba con CTA "Usar"; los NO entitled (coach Free)
 * NO se esconden — aparecen como locked-cards con upsell de UPGRADE de plan (sin precios por
 * módulo), y el empty-state lleva al catálogo/planes.
 * La capa del plan (`nutrition_exchanges`) va aparte: se configura DENTRO de un plan, no acá.
 *
 * Money-safety: solo VISIBILIDAD; el gate de dinero vive server-side en /api/mobile/*. El picker
 * de composición no pega a la DB sin el módulo. 0 alumnos -> CTA crear alumno (NUNCA crash — el
 * bug web de módulos con 0 alumnos NO se hereda, memoria module_page_crash_no_clients).
 */

// Let NativeWind drive the lucide icon `color` via `text-*` classes (DS pattern, ver perfil.tsx).
for (const Icon of [
  Apple, ArrowRight, ChevronLeft, ChevronRight, CirclePlay, ClipboardList, HeartPulse,
  Info, LayoutGrid, Lock, PersonStanding, Ruler, Search, UserPlus, UserRound,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

type ToolScope = 'student' | 'plan'
type ToolDef = {
  key: ModuleKey
  icon: LucideIcon
  /** Descripcion corta de valor (UI del hub, no el pitch comercial del catalogo). */
  value: string
  /** Alcance: se usa con un alumno (student) vs se configura dentro del plan (plan). */
  scope: ToolScope
  /** El modulo se captura 1-a-1: abre el picker de alumno antes de navegar. */
  picker?: boolean
  /** Ruta directa (modulos con hub propio que ya listan alumnos). */
  href?: string
}

// Herramientas por-alumno del launcher (scope 'student'). El orden espeja el catalogo del kit.
const TOOLS: ToolDef[] = [
  {
    key: 'cardio',
    icon: HeartPulse,
    value: 'Zonas de FC personalizadas, calculadora de pace y plantillas de intervalos.',
    scope: 'student',
    href: '/coach/cardio',
  },
  {
    key: 'movement_assessment',
    icon: PersonStanding,
    value: 'Screening de 7 patrones con semáforo de prioridad y evolución.',
    scope: 'student',
    href: '/coach/movement',
  },
  {
    key: 'body_composition',
    icon: Ruler,
    value: 'Bioimpedancia y antropometría ISAK con tendencia por método.',
    scope: 'student',
    picker: true,
  },
]

// Capa del plan — intercambios NO es herramienta del launcher; vive dentro del plan de nutrición.
const PLAN_TOOL: ToolDef = {
  key: 'nutrition_exchanges',
  icon: Apple,
  value: 'Porciones e intercambios, micronutrientes avanzados y PDF con tu marca, dentro del plan.',
  scope: 'plan',
  href: '/coach/(tabs)/nutricion',
}

export default function ToolsHubScreen() {
  const router = useRouter()
  const { hasModule, ready } = useEntitlements()
  const { isManaged: managed } = useWorkspace()

  const activeTools = useMemo(() => TOOLS.filter((t) => hasModule(t.key)), [hasModule])
  const lockedTools = useMemo(() => TOOLS.filter((t) => !hasModule(t.key)), [hasModule])
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

  // Handler primario por card, calculado por estado (activo / picker / bloqueado / gestionado).
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

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Back al hub Opciones (Herramientas es sub-pantalla pusheada, 1:1 con /coach/modules). */}
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            testID="tools-back"
            accessibilityRole="button"
            accessibilityLabel="Volver"
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
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {/* Header: tile de módulos + título */}
            <View className="flex-row items-center" style={{ gap: 10, paddingTop: 8, paddingBottom: 12 }}>
              <View className="items-center justify-center rounded-control bg-sport-100" style={{ width: 36, height: 36 }}>
                <LayoutGrid size={18} strokeWidth={2} className="text-sport-600" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-display-black text-strong" style={{ fontSize: 21, letterSpacing: -0.42 }} numberOfLines={1}>
                  Herramientas
                </Text>
                <Text className="font-sans text-muted" style={{ fontSize: 12.5, marginTop: 1 }} numberOfLines={1}>
                  {anyActive ? 'Tus módulos' : 'Módulos'}
                </Text>
              </View>
            </View>

            {!anyActive ? (
              <View style={{ gap: 14 }}>
                {/* Empty-state que VENDE — nada comprado (no se esconde el catálogo). */}
                <SellCard managed={managed} onExplore={() => router.push('/coach/modules')} />
                <SectionTitle>Incluido en los planes pagos</SectionTitle>
                <View style={{ gap: 12 }}>
                  {[...TOOLS, PLAN_TOOL].map((tool) => (
                    <ModuleHubCard key={tool.key} tool={tool} active={false} managed={managed} onPrimary={primaryFor(tool, false)} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {/* Comprar ≠ usar — recordatorio (espejo del banner web). */}
                <View className="flex-row items-center rounded-control bg-surface-sunken" style={{ gap: 9, paddingHorizontal: 13, paddingVertical: 10 }}>
                  <Info size={15} strokeWidth={2.2} className="text-subtle" style={{ marginTop: 1 }} />
                  <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 12, lineHeight: 17 }}>
                    Elige el módulo y después el alumno. Se mide a una persona a la vez.
                  </Text>
                </View>

                {/* Activos arriba */}
                {activeTools.map((tool) => (
                  <ModuleHubCard key={tool.key} tool={tool} active managed={managed} onPrimary={primaryFor(tool, true)} />
                ))}

                {/* Capa del plan — intercambios vive en el plan, no en el launcher. */}
                {planActive ? (
                  <>
                    <SectionTitle>En el plan de nutrición</SectionTitle>
                    <ModuleHubCard tool={PLAN_TOOL} active managed={managed} onPrimary={primaryFor(PLAN_TOOL, true)} />
                  </>
                ) : null}

                {/* Descubre más — bloqueados con upsell. */}
                {lockedTools.length > 0 || !planActive ? (
                  <>
                    <SectionTitle>Descubre más</SectionTitle>
                    <View style={{ gap: 12 }}>
                      {lockedTools.map((tool) => (
                        <ModuleHubCard key={tool.key} tool={tool} active={false} managed={managed} onPrimary={primaryFor(tool, false)} />
                      ))}
                      {!planActive ? (
                        <ModuleHubCard tool={PLAN_TOOL} active={false} managed={managed} onPrimary={primaryFor(PLAN_TOOL, false)} />
                      ) : null}
                    </View>
                  </>
                ) : null}
              </View>
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
              router.push(`/coach/bodycomp/${id}` as never)
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

/* ── Título de sección (display extrabold, 1:1 con el SectionTitle web) ───────── */
function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="font-display-bold text-strong" style={{ fontSize: 17, letterSpacing: -0.34, paddingTop: 4 }}>
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
        className="items-center justify-center rounded-2xl"
        style={{ width: 60, height: 60, marginBottom: 14, backgroundColor: `${theme.primary}2E` }}
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
          label="Incluidas en los planes pagos — Ver planes"
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

/* ── Card de módulo del hub — alcance + estado + acción según entitlement ─────── */
function ModuleHubCard({
  tool,
  active,
  managed,
  onPrimary,
}: {
  tool: ToolDef
  active: boolean
  managed: boolean
  onPrimary?: () => void
}) {
  const Icon = tool.icon
  const label = MODULE_CATALOG[tool.key].label
  const isPlan = tool.scope === 'plan'

  return (
    <Card padding="md" style={{ gap: 13 }}>
      <View className="flex-row items-start" style={{ gap: 13 }}>
        <View
          className={`items-center justify-center rounded-xl ${active ? 'bg-sport-100' : 'bg-surface-sunken'}`}
          style={{ width: 48, height: 48 }}
        >
          <Icon size={23} strokeWidth={2} className={active ? 'text-sport-600' : 'text-subtle'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="font-display-bold text-strong" style={{ fontSize: 16.5, letterSpacing: -0.2 }}>{label}</Text>
          <Text className="font-sans text-muted" style={{ fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>{tool.value}</Text>
        </View>
      </View>

      {/* Alcance + estado */}
      <View className="flex-row flex-wrap items-center" style={{ gap: 7 }}>
        <View className="flex-row items-center rounded-pill bg-surface-sunken" style={{ gap: 5, paddingHorizontal: 9, height: 24 }}>
          {isPlan ? (
            <ClipboardList size={12} strokeWidth={2.2} className="text-muted" />
          ) : (
            <UserRound size={12} strokeWidth={2.2} className="text-muted" />
          )}
          <Text className="font-sans-bold text-muted" style={{ fontSize: 11 }}>
            {isPlan ? 'Se configura en el plan' : 'Se usa con un alumno'}
          </Text>
        </View>
        {active ? (
          <Badge tone="success" variant="soft" size="sm" dot>
            Activo
          </Badge>
        ) : (
          <Badge tone="neutral" variant="soft" size="sm">
            Con plan pago
          </Badge>
        )}
      </View>

      {/* Acción primaria según estado */}
      {active ? (
        <Button
          label={tool.picker ? 'Usar' : isPlan ? 'Abrir en un plan' : 'Usar'}
          variant="sport"
          leftIcon={isPlan && !tool.picker ? ArrowRight : CirclePlay}
          onPress={onPrimary}
          full
          testID={`tools-use-${tool.key}`}
        />
      ) : managed ? (
        <View className="flex-row items-center rounded-control bg-surface-sunken" style={{ gap: 8, paddingHorizontal: 14, paddingVertical: 11 }}>
          <Lock size={15} strokeWidth={2.2} className="text-subtle" />
          <Text className="font-sans-semibold text-muted" style={{ flex: 1, fontSize: 12.5, lineHeight: 18 }}>
            Pídelo al owner de tu equipo
          </Text>
        </View>
      ) : (
        <Button
          label="Incluido en planes pagos · Ver planes"
          variant="secondary"
          leftIcon={Lock}
          onPress={onPrimary}
          full
          testID={`tools-unlock-${tool.key}`}
        />
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
            <ChevronRight size={17} strokeWidth={2.2} className="text-ink-300" />
          </Pressable>
        ))
      )}
    </View>
  )
}
