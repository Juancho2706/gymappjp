import { useCallback, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  HeartPulse,
  Info,
  LayoutGrid,
  PersonStanding,
  Ruler,
  Search,
  UserRound,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native'
import { MODULE_CATALOG } from '@eva/module-catalog'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { useEntitlements } from '../../lib/entitlements'
import type { ModuleKey } from '../../lib/entitlements-core'
import { listCardioClients, type CardioClientRow } from '../../lib/cardio-coach'
import { AppBackground } from '../../components/AppBackground'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { Input } from '../../components/Input'
import { Sheet } from '../../components/Sheet'

/**
 * Hub /coach/tools (E6-02) — launcher de los modulos que el coach USA (espejo mobile del
 * `ToolsHub` web `apps/web/.../coach/tools`). "Comprar != usar": aca aparecen SOLO los
 * modulos ENTITLED (via `useEntitlements().hasModule`); el catalogo de COMPRA vive en
 * `/coach/modules`. Cada card navega al contrato de rutas del arquitecto:
 *   cardio -> /coach/cardio · movement_assessment -> /coach/movement · body_composition ->
 *   /coach/bodycomp/[clientId] (captura 1-a-1 => picker de alumno primero).
 *
 * Money-safety: solo VISIBILIDAD; el gate de dinero vive server-side en /api/mobile/*. Sin
 * ningun modulo del hub NO se listan alumnos (cero fetch). Empty-states en todo: 0 modulos
 * -> CTA al catalogo; 0 alumnos en el picker -> CTA crear alumno (NUNCA crash — el bug web
 * de modulos con 0 alumnos NO se hereda, memoria module_page_crash_no_clients).
 */

type ToolDef = {
  key: Extract<ModuleKey, 'cardio' | 'movement_assessment' | 'body_composition'>
  icon: LucideIcon
  /** Descripcion corta de valor (UI del hub, no el pitch comercial del catalogo). */
  value: string
  /** El modulo se captura 1-a-1: abre el picker de alumno antes de navegar. */
  picker?: boolean
  /** Ruta directa (modulos con hub propio que ya listan alumnos). */
  href?: string
}

// Herramientas por-alumno del launcher. `nutrition_exchanges` NO va aca: es del plan.
const TOOLS: ToolDef[] = [
  {
    key: 'cardio',
    icon: HeartPulse,
    value: 'Zonas de FC personalizadas, calculadora de pace y plantillas de intervalos.',
    href: '/coach/cardio',
  },
  {
    key: 'movement_assessment',
    icon: PersonStanding,
    value: 'Screening de 7 patrones con semaforo de prioridad y evolucion.',
    href: '/coach/movement',
  },
  {
    key: 'body_composition',
    icon: Ruler,
    value: 'Bioimpedancia y antropometria ISAK con tendencia por metodo.',
    picker: true,
  },
]

export default function ToolsHubScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { hasModule, ready } = useEntitlements()

  const activeTools = useMemo(() => TOOLS.filter((t) => hasModule(t.key)), [hasModule])
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

  const onUse = useCallback(
    (tool: ToolDef) => {
      if (tool.picker) {
        setPickerOpen(true)
        return
      }
      if (tool.href) router.push(tool.href as never)
    },
    [router],
  )

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />

      {/* Header: back + tile de modulos + titulo */}
      <View style={styles.header}>
        <TouchableOpacity
          testID="tools-back"
          onPress={() => router.back()}
          activeOpacity={0.8}
          style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <ChevronLeft size={20} color={theme.foreground} />
        </TouchableOpacity>
        <View className="bg-sport-100" style={styles.iconTile}>
          <LayoutGrid size={18} color={theme.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.hTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]} numberOfLines={1}>
            Herramientas
          </Text>
          <Text style={[styles.hSub, { color: theme.mutedForeground, fontFamily: FONT.ui }]} numberOfLines={1}>
            {activeTools.length > 0 ? 'Tus modulos' : 'Modulos'}
          </Text>
        </View>
      </View>

      {!ready ? (
        <EvaLoaderScreen subtitle="Cargando…" />
      ) : activeTools.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.muted, borderRadius: theme.radius.xl }]}>
            <LayoutGrid size={26} color={theme.mutedForeground} strokeWidth={2} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>
            Aun no tenes modulos activos
          </Text>
          <Text style={[styles.emptyBody, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
            Cardio, evaluacion de movimiento y composicion corporal son herramientas profesionales por alumno.
            Activalas para verlas aca.
          </Text>
          <Button
            label="Ver modulos"
            variant="sport"
            onPress={() => router.push('/coach/modules')}
            style={{ marginTop: 6 }}
            testID="tools-empty-cta"
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* Comprar != usar — recordatorio (espejo del banner web) */}
          <View style={[styles.infoBanner, { backgroundColor: theme.secondary }]}>
            <Info size={15} color={theme.mutedForeground} style={{ marginTop: 1 }} />
            <Text style={[styles.infoTxt, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
              Elegi el modulo y despues el alumno. Se mide a una persona a la vez.
            </Text>
          </View>

          {activeTools.map((tool) => (
            <ToolCard key={tool.key} tool={tool} onUse={() => onUse(tool)} />
          ))}
        </ScrollView>
      )}

      {/* Picker de alumno SINGLE para Composicion (captura 1-a-1) */}
      <Sheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Elegi un alumno"
        description="Composicion corporal · se mide a una persona a la vez"
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
  )
}

/* ── Card de modulo entitled ─────────────────────────────────────────────────── */
function ToolCard({ tool, onUse }: { tool: ToolDef; onUse: () => void }) {
  const { theme } = useTheme()
  const Icon = tool.icon
  const label = MODULE_CATALOG[tool.key].label

  return (
    <Card padding="md" style={{ gap: 13 }}>
      <View style={styles.cardHead}>
        <View className="bg-sport-100" style={styles.cardIconTile}>
          <Icon size={23} color={theme.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.cardLabel, { color: theme.foreground, fontFamily: FONT.displayBold }]}>{label}</Text>
          <Text style={[styles.cardValue, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>{tool.value}</Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        <View style={[styles.scopeChip, { backgroundColor: theme.secondary }]}>
          <UserRound size={12} color={theme.mutedForeground} />
          <Text style={[styles.scopeTxt, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            Se usa con un alumno
          </Text>
        </View>
        <Badge tone="success" variant="soft" size="sm" dot>
          Activo
        </Badge>
      </View>

      <Button
        label="Usar"
        variant="sport"
        leftIcon={CirclePlay}
        onPress={onUse}
        testID={`tools-use-${tool.key}`}
      />
    </Card>
  )
}

/* ── Picker de alumno (lista + busqueda) ─────────────────────────────────────── */
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
        <Text style={[styles.pickerEmpty, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
          Aun no tenes alumnos. Agrega uno para tomar mediciones de composicion corporal.
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
        <Text style={[styles.pickerHint, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>Cargando alumnos…</Text>
      ) : list.length === 0 ? (
        <Text style={[styles.pickerHint, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>Sin resultados</Text>
      ) : (
        list.map((c) => (
          <TouchableOpacity
            key={c.id}
            testID={`tools-picker-client-${c.id}`}
            activeOpacity={0.75}
            onPress={() => onPick(c.id)}
            style={styles.pickerRow}
          >
            <View style={[styles.avatar, { backgroundColor: theme.foreground }]}>
              <Text style={[styles.avatarTxt, { color: theme.card, fontFamily: FONT.displayBold }]}>
                {(c.full_name ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.pickerName, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>
              {c.full_name ?? 'Alumno'}
            </Text>
            <ChevronRight size={17} color={theme.mutedForeground} />
          </TouchableOpacity>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  hTitle: { fontSize: 19, letterSpacing: -0.4 },
  hSub: { fontSize: 12.5, marginTop: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 12 },
  infoBanner: { flexDirection: 'row', gap: 9, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  infoTxt: { flex: 1, fontSize: 12, lineHeight: 17 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  cardIconTile: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 16.5, letterSpacing: -0.2 },
  cardValue: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    height: 24,
  },
  scopeTxt: { fontSize: 11 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 14 },
  emptyIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20, letterSpacing: -0.4, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 340 },
  pickerEmpty: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  pickerHint: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 14 },
  pickerName: { flex: 1, fontSize: 14.5 },
})
