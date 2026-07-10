import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import {
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  HeartPulse,
  Info,
  Lock,
  PersonStanding,
  Plus,
  Scale,
  UserRound,
  Utensils,
  Wrench,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MODULE_CATALOG, MODULE_CATALOG_KEYS, type ModuleKey } from '@eva/module-catalog'
import { useEntitlements } from '../../lib/entitlements'
import { getApiBaseUrl } from '../../lib/api'
import { AppBackground } from '../../components/AppBackground'
import { Card } from '../../components'

/**
 * E6-12 · Catálogo de Módulos (coach) — espejo RN read-only del web
 * `apps/web/src/app/coach/settings/modules/_components/ModulesForm.tsx`.
 *
 * Solo LECTURA (compra-only): el coach no se auto-activa módulos. Por cada uno de los 4
 * módulos de pago: icono tonal, badge Activo/De pago, pitch + superficies (copy canónico en
 * `@eva/module-catalog`, sin drift con la web), precio /mes y CTA "Agregar" que hace LINK-OUT
 * al checkout de add-ons de la web (`/coach/subscription#addons`) — nunca compra in-app (regla
 * IAP del spec). Estado Activo derivado de `useEntitlements().hasModule(key)` (mismo gate de
 * VISIBILIDAD que el resto de la app; el gate de DINERO vive server-side en /api/mobile/*).
 */

// Let NativeWind drive the lucide icon `color` via `text-*` classes (DS pattern, ver perfil.tsx).
for (const Icon of [
  CheckCircle2, ChevronLeft, ClipboardList, HeartPulse, Info, Lock,
  PersonStanding, Plus, Scale, UserRound, Utensils, Wrench,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

/** Ícono por módulo — 1:1 con el `MODULE_ICONS` del web ModulesForm. */
const MODULE_ICONS: Record<ModuleKey, LucideIcon> = {
  cardio: HeartPulse,
  movement_assessment: PersonStanding,
  body_composition: Scale,
  nutrition_exchanges: Utensils,
}

/** Alcance de uso: se configura en el plan (nutrición) vs se usa con un alumno (resto). */
const PLAN_SCOPED_MODULES: ReadonlySet<ModuleKey> = new Set(['nutrition_exchanges'])

/** Add-ons checkout de la web — única superficie de compra (LINK-OUT, sin IAP). */
const ADDONS_URL = `${getApiBaseUrl()}/coach/subscription#addons`

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

// Small pill (surface chip / scope chip) — mirror of the web `rounded-pill` chips.
function Chip({ children, icon, outline }: { children: string; icon?: LucideIcon; outline?: boolean }) {
  const Icon = icon
  return (
    <View
      className={`flex-row items-center self-start rounded-pill ${outline ? 'border border-subtle' : 'bg-surface-sunken'}`}
      style={{ gap: 5, paddingHorizontal: 8, paddingVertical: 3 }}
    >
      {Icon ? <Icon size={11} strokeWidth={2.4} className="text-muted" /> : null}
      <Text className={`font-sans-bold ${outline ? 'text-subtle' : 'text-muted'}`} style={{ fontSize: 10.5 }}>
        {children}
      </Text>
    </View>
  )
}

function ModuleCard({ moduleKey, active }: { moduleKey: ModuleKey; active: boolean }) {
  const entry = MODULE_CATALOG[moduleKey]
  const Icon = MODULE_ICONS[moduleKey]
  const planScoped = PLAN_SCOPED_MODULES.has(moduleKey)

  return (
    <Card padding="none" style={{ overflow: 'hidden' }}>
      <View style={{ padding: 16 }}>
        <View className="flex-row items-start" style={{ gap: 13 }}>
          <View
            className={`items-center justify-center rounded-xl ${active ? 'bg-sport-100' : 'bg-surface-sunken'}`}
            style={{ width: 46, height: 46 }}
          >
            <Icon size={22} strokeWidth={2} className={active ? 'text-sport-600' : 'text-subtle'} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
              <Text className="font-sans-bold text-strong" style={{ fontSize: 15.5 }}>
                {entry.label}
              </Text>
              {active ? (
                <View className="flex-row items-center rounded-pill bg-success-100" style={{ gap: 4, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <CheckCircle2 size={13} strokeWidth={2.4} className="text-success-700" />
                  <Text className="font-sans-bold text-success-700" style={{ fontSize: 11.5 }}>Activo</Text>
                </View>
              ) : (
                <View className="flex-row items-center rounded-pill bg-surface-sunken" style={{ gap: 4, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Lock size={12} strokeWidth={2.4} className="text-muted" />
                  <Text className="font-sans-bold text-muted" style={{ fontSize: 11.5 }}>De pago</Text>
                </View>
              )}
            </View>
            <Text className="font-sans text-muted" style={{ fontSize: 13, lineHeight: 19, marginTop: 4 }}>
              {entry.pitch}
            </Text>
          </View>
        </View>

        {/* Superficies + alcance */}
        <View className="flex-row flex-wrap items-center" style={{ gap: 6, marginTop: 12 }}>
          <Chip icon={planScoped ? ClipboardList : UserRound}>
            {planScoped ? 'Se configura en el plan' : 'Se usa con un alumno'}
          </Chip>
          {entry.surfaces.map((surface) => (
            <Chip key={surface} outline>{surface}</Chip>
          ))}
        </View>

        {active ? (
          <View className="flex-row items-center" style={{ gap: 6, marginTop: 12 }}>
            <CheckCircle2 size={15} strokeWidth={2.2} className="text-success-700" />
            <Text className="font-sans-bold text-success-700" style={{ fontSize: 12.5 }}>
              Incluido en tu cuenta
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center justify-between" style={{ gap: 10, marginTop: 14 }}>
            <Pressable
              testID={`modulos-cta-${moduleKey}`}
              accessibilityRole="button"
              accessibilityLabel={`Agregar ${entry.label}`}
              onPress={() => { void Linking.openURL(ADDONS_URL).catch(() => {}) }}
              className="flex-row items-center rounded-control bg-sport-500"
              style={{ gap: 6, paddingHorizontal: 16, height: 40 }}
            >
              <Plus size={16} strokeWidth={2.6} className="text-on-sport" />
              <Text className="font-sans-bold text-on-sport" style={{ fontSize: 14 }}>Agregar</Text>
            </Pressable>
            <View style={{ alignItems: 'flex-end' }}>
              <Text className="font-mono text-strong" style={{ fontSize: 15.5 }}>
                {clpFormatter.format(entry.priceClp)}
              </Text>
              <Text className="font-sans text-subtle" style={{ fontSize: 11, marginTop: -1 }}>/ mes</Text>
            </View>
          </View>
        )}
      </View>
    </Card>
  )
}

export default function CoachModulesScreen() {
  const router = useRouter()
  const { hasModule } = useEntitlements()

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Back header */}
        <View className="flex-row items-center" style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            testID="modulos-back"
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            hitSlop={10}
            className="flex-row items-center"
            style={{ gap: 2, paddingVertical: 6, paddingHorizontal: 4 }}
          >
            <ChevronLeft size={22} strokeWidth={2.2} className="text-sport-600" />
            <Text className="font-sans-bold text-sport-600" style={{ fontSize: 15 }}>Ajustes</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: 8, paddingBottom: 16 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.5 }}>
              Módulos
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 13.5, marginTop: 4, lineHeight: 19 }}>
              Herramientas de pago para potenciar tu práctica. Cada módulo se cobra aparte de tu plan.
            </Text>
          </View>

          {/* Comprar ≠ usar — banner info (1:1 con la web) */}
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 350 }}
          >
            <View className="flex-row items-start rounded-control bg-sport-100" style={{ gap: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 }}>
              <Info size={17} strokeWidth={2.2} className="text-sport-600" style={{ marginTop: 1 }} />
              <Text className="font-sans-bold text-sport-700" style={{ flex: 1, fontSize: 12.5, lineHeight: 18 }}>
                Activa un módulo acá y úsalo desde Herramientas. La compra se completa en la web con tu cuenta.
              </Text>
            </View>
          </MotiView>

          <View style={{ gap: 12 }}>
            {MODULE_CATALOG_KEYS.map((key) => (
              <ModuleCard key={key} moduleKey={key} active={hasModule(key)} />
            ))}
          </View>

          <Text className="font-sans text-subtle" style={{ fontSize: 11.5, textAlign: 'center', lineHeight: 17, marginTop: 16 }}>
            El cobro se prorratea al período. Gestioná las bajas desde Suscripción.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}
