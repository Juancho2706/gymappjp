import { Fragment } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import {
  Dumbbell,
  HeartPulse,
  LifeBuoy,
  PersonStanding,
  Settings,
  Shield,
  SlidersHorizontal,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native'
import { buildMobileBar, groupNavItems, type NavModule } from '@eva/coach-nav'
import { Card } from '../../../components/Card'
import { ListRow } from '../../../components/ListRow'
import { AppBackground } from '../../../components/AppBackground'
import { COACH_TABBAR_CLEARANCE, coachNavRoute } from '../../../components/coach/CoachMobileChrome'
import { useCoachTabbarScroll } from '../../../components/coach/CoachTabbarScroll'
import { useTheme } from '../../../context/ThemeContext'
import { useCoachNavState } from '../../../lib/coach-nav-state'
import { hexToRgba } from '../../../lib/theme'

/**
 * Hoja «Más» (Ola de orden W2.6, decisión 3A del owner: TAB, no modal).
 *
 * La cápsula del coach tiene 5 slots y desde W2.5 los gasta en [Inicio, Alumnos, 2 dominios de la
 * especialidad, «Más»]. Todo lo demás que el coach TIENE VISIBLE —los dominios que no entraron,
 * Equipo, Funciones, Opciones, Soporte— aterriza acá: es el `overflow` de la MISMA llamada a
 * `buildMobileBar` que arma la barra (por eso los inputs salen de `useCoachNavState`, compartido
 * con `CoachMobileChrome`). Antes de W2.5 ese sobrante no existía: el `.slice(0, 5)` lo tiraba a la
 * basura y un coach de team perdía «Equipo» sin aviso.
 *
 * Solo VISIBILIDAD: nada se autoriza acá. Un dominio apagado ni siquiera llega a `overflow`, y su
 * ruta igual redirige server-side (W1.4). Sección sin filas ⇒ no se pinta (tampoco su encabezado),
 * mismo criterio que el sidebar web de W2.4.
 *
 * Chasis visual = el del hub Opciones (`(tabs)/settings.tsx`): título display, secciones con
 * eyebrow y filas `ListRow` + tile 46 dentro de una `Card padding="none"`.
 */

// Let NativeWind drive the lucide icon `color` via `text-*` classes (DS pattern, ver settings.tsx).
// Es la lista COMPLETA de íconos que una fila puede pintar: los del registro que pueden sobrar de
// la barra (Programas, Nutrición, Cardio, Movimiento, Equipo, Opciones) + los dos que no tienen
// pantalla propia en RN y por eso no viven en `NAV_ROUTE` (Funciones, Soporte).
for (const Icon of [Dumbbell, HeartPulse, LifeBuoy, PersonStanding, Settings, Shield, SlidersHorizontal, Utensils]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

/** Íconos de las keys que NO tienen destino propio en RN (se navegan por el `href` del registro). */
const EXTRA_ICON: Record<string, LucideIcon> = {
  funciones: SlidersHorizontal,
  support: LifeBuoy,
}

/**
 * Una línea por fila: qué es esa pantalla, en las palabras del coach. La fila TRUNCA (no envuelve),
 * así que son cortas a propósito. `options` y `settings_team` son el mismo hub en dos contextos.
 */
const ROW_SUBTITLE: Record<string, string> = {
  programs: 'Biblioteca y plantillas',
  nutrition: 'Planes y alimentos',
  cardio: 'Zonas, pace e intervalos',
  movement: 'Screening y reporte semáforo',
  team: 'Tu pool y sus alumnos',
  funciones: 'Especialidad y qué se ve en tu panel',
  options: 'Marca, plan y cuenta',
  settings_team: 'Marca, plan y cuenta',
  support: 'Escríbenos si algo no funciona',
}

/** 46px rounded tile con el ícono de la fila (versión mínima del `IconTile` del hub Opciones). */
function IconTile({ Icon, tone = 'neutral' }: { Icon: LucideIcon; tone?: 'neutral' | 'brand' }) {
  const { theme } = useTheme()
  const brand = tone === 'brand'
  return (
    <View
      className={`items-center justify-center rounded-control ${brand ? '' : 'bg-surface-sunken'}`}
      style={[{ width: 46, height: 46 }, brand ? { backgroundColor: hexToRgba(theme.primary, 0.14) } : null]}
    >
      {/* Ramas separadas a propósito: `className` y `color` compiten por la misma prop vía
          `cssInterop`, así que cada tono usa UNA sola vía (marca = `color` imperativo). */}
      {brand ? (
        <Icon size={22} strokeWidth={2} color={theme.primary} />
      ) : (
        <Icon size={22} strokeWidth={2} className="text-ink-700" />
      )}
    </View>
  )
}

/** Section eyebrow — barra de acento con la marca + 11px extrabold (1:1 con el hub Opciones). */
function SectionTitle({ children }: { children: string }) {
  const { theme } = useTheme()
  return (
    <View className="mx-0.5 mb-2.5 mt-5 flex-row items-center gap-2">
      <View className="h-3 w-[3px] rounded-sm" style={{ backgroundColor: theme.primary }} />
      <Text className="font-sans-extra text-subtle" style={{ fontSize: 11, letterSpacing: 0.77, textTransform: 'uppercase' }}>
        {children}
      </Text>
    </View>
  )
}

/** Hairline divider entre filas apiladas dentro de una Card padding="none". */
function RowDivider() {
  return <View className="mx-[14px] border-t border-subtle" />
}

/** Grupo con encabezado. Sin filas no se pinta NADA (ni el encabezado): BRIEF §5.2. */
function NavSection({ title, items, onOpen }: { title: string; items: NavModule[]; onOpen: (item: NavModule) => void }) {
  if (items.length === 0) return null
  return (
    <View>
      <SectionTitle>{title}</SectionTitle>
      <Card padding="none">
        {items.map((item, index) => {
          const Icon = coachNavRoute(item.key)?.icon ?? EXTRA_ICON[item.key] ?? SlidersHorizontal
          return (
            <Fragment key={item.key}>
              {index > 0 ? <RowDivider /> : null}
              <ListRow
                testID={`coach-more-${item.key}`}
                leading={<IconTile Icon={Icon} tone={item.featureDomain != null ? 'brand' : 'neutral'} />}
                title={item.label}
                subtitle={ROW_SUBTITLE[item.key]}
                showChevron
                accessibilityLabel={item.label}
                onPress={() => onOpen(item)}
              />
            </Fragment>
          )
        })}
      </Card>
    </View>
  )
}

export default function CoachMoreScreen() {
  const router = useRouter()
  const { onScroll } = useCoachTabbarScroll()
  const { visible, domainOrder } = useCoachNavState()

  const { overflow } = buildMobileBar(visible, domainOrder)
  const groups = groupNavItems(overflow)

  // `coachNavRoute` manda sobre el `href` del registro porque las rutas de RN NO son las de la web
  // (Programas vive en `/coach/builder`, Nutrición en `/coach/nutricion`). Las keys sin pantalla
  // propia en RN (Funciones, Soporte) caen al `href` compartido.
  function open(item: NavModule) {
    router.push((coachNavRoute(item.key)?.path ?? item.href) as never)
  }

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: COACH_TABBAR_CLEARANCE }}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <View style={{ paddingTop: 16, paddingBottom: 4 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 21, letterSpacing: -0.6, textTransform: 'uppercase' }}>
              Más
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 14, marginTop: 4, lineHeight: 22 }}>
              Lo que no cabe en la barra.
            </Text>
          </View>

          <NavSection title="Tu trabajo" items={groups.trabajo} onOpen={open} />
          <NavSection title="Gestión" items={groups.gestion} onOpen={open} />
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}
