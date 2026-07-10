import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import {
  CreditCard,
  LayoutGrid,
  LifeBuoy,
  Package,
  Palette,
  SlidersHorizontal,
  UserCog,
  Users,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MODULE_CATALOG_KEYS } from '@eva/module-catalog'
import { Avatar, Badge, Card } from '../../../components'
import { ListRow } from '../../../components/ListRow'
import { AppBackground } from '../../../components/AppBackground'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { useWorkspace } from '../../../lib/workspace'
import { getCoachProfile, type CoachProfile } from '../../../lib/coach'
import { canUseBranding } from '../../../lib/coach-tiers'

/**
 * E7-02 · Hub de Opciones (coach) — espejo RN del hub móvil web (`apps/web/.../coach/settings/page.tsx`,
 * bloque `md:hidden`). El tab "Opciones" YA no abre Mi Marca directo: abre este índice de HubCards
 * (aquí: `ListRow` + `IconTile`, el vocabulario móvil del DS, ver alumno/perfil). Cada destino es una
 * sub-pantalla o un tab existente. Context-aware por `useWorkspace()` (la ÚNICA fuente de contexto
 * team/org/standalone): si `isManaged` (team_managed/org_managed) el hub se REDUCE — sin Mi Marca ni
 * Suscripción personales (los gestiona el equipo/organización), como en la web.
 *
 * Rutas (contrato del arquitecto E7):
 *  · Mi Marca    → /coach/settings/brand    (el brand studio de E3, mudado bajo el hub)
 *  · Suscripción → /coach/subscription      (tab existente)
 *  · Módulos     → /coach/modules           (catálogo E6-12)
 *  · Funciones   → /coach/settings/features  (stub; lo llena fase 3)
 *  · Áreas       → /coach/settings/areas     (stub; lo llena fase 3)
 *  · Equipo      → /coach/settings/team       (solo si kind es team_*)
 */

// Let NativeWind drive the lucide icon `color` via `text-*` classes (DS pattern, ver perfil.tsx).
for (const Icon of [CreditCard, LayoutGrid, LifeBuoy, Package, Palette, SlidersHorizontal, UserCog, Users]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite',
  growth: 'Growth',
  scale: 'Scale',
}

type Tone = 'neutral' | 'sport'
const TILE_BG: Record<Tone, string> = { neutral: 'bg-surface-sunken', sport: 'bg-sport-100' }
const TILE_FG: Record<Tone, string> = { neutral: 'text-ink-700', sport: 'text-sport-600' }

/** 36px rounded tile hosting a row icon (DS ListRow leading slot, 1:1 con perfil). */
function IconTile({ Icon, tone = 'neutral' }: { Icon: LucideIcon; tone?: Tone }) {
  return (
    <View className={`items-center justify-center rounded-md ${TILE_BG[tone]}`} style={{ width: 36, height: 36 }}>
      <Icon size={18} strokeWidth={2} className={TILE_FG[tone]} />
    </View>
  )
}

/** Section eyebrow — accent bar + uppercase 11px extrabold (1:1 con el SectionTitle de perfil/web). */
function SectionTitle({ children }: { children: string }) {
  return (
    <View className="mx-0.5 mb-2.5 mt-5 flex-row items-center gap-2">
      <View className="h-3 w-[3px] rounded-sm bg-sport-500" />
      <Text className="font-sans-extra text-subtle" style={{ fontSize: 11, letterSpacing: 0.77, textTransform: 'uppercase' }}>
        {children}
      </Text>
    </View>
  )
}

/** Hairline divider between stacked rows inside a padding-none Card. */
function RowDivider() {
  return <View className="mx-[14px] border-t border-subtle" />
}

export default function CoachSettingsHubScreen() {
  const router = useRouter()
  const ws = useWorkspace()
  const [profile, setProfile] = useState<CoachProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCoachProfile()
      .then((p) => setProfile(p))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const isTeam = ws.kind === 'team_owner' || ws.kind === 'team_member'
  const managed = ws.isManaged
  const tier = profile?.subscriptionTier ?? 'starter'
  const displayName = profile?.brandName?.trim() || profile?.fullName?.trim() || 'Coach'
  const brandingOk = canUseBranding(tier)

  const roleBadge = isTeam
    ? ws.kind === 'team_owner'
      ? 'Dueño del equipo'
      : ws.canManageTeam
        ? 'Co-gestor'
        : 'Miembro'
    : managed
      ? 'Gestionado'
      : `Plan ${TIER_LABEL[tier] ?? 'Starter'}`
  const heroSubtitle = isTeam ? 'Pool de coaches' : managed ? 'Cuenta gestionada por tu organización' : 'Tu negocio EVA'

  if (loading) {
    return <EvaLoaderScreen subtitle="Cargando opciones…" />
  }

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {/* Título */}
          <View style={{ paddingTop: 16, paddingBottom: 4 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 26, letterSpacing: -0.52 }}>
              Opciones
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 19 }}>
              {managed
                ? 'La marca y la suscripción las gestiona tu equipo. Acá están los módulos y tu cuenta.'
                : 'Tu marca, tu suscripción y la configuración de tu cuenta, todo en un solo lugar.'}
            </Text>
          </View>

          {/* IdentityHero — card inverse con avatar + badge de plan/rol (1:1 con web). */}
          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 450 }}
            style={{ marginTop: 14 }}
          >
            <Card variant="inverse" padding="lg" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Avatar name={displayName} size="xl" ring="sport" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-display-black text-on-dark" style={{ fontSize: 20, letterSpacing: -0.4 }} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text className="font-sans text-on-dark-muted" style={{ fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                  {heroSubtitle}
                </Text>
                <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                  <Badge tone="sport" variant="solid" size="md" label={roleBadge} />
                </View>
              </View>
            </Card>
          </MotiView>

          {/* Personalización — solo con marca propia (no gestionada). */}
          {!managed ? (
            <View>
              <SectionTitle>Personalización</SectionTitle>
              <Card padding="none">
                <ListRow
                  testID="hub-brand"
                  leading={<IconTile Icon={Palette} tone="sport" />}
                  title="Mi Marca"
                  subtitle="Logo, colores y mensajes de la app del alumno"
                  trailing={brandingOk ? undefined : <Badge tone="sport" variant="soft" label="Pro" />}
                  showChevron
                  onPress={() => router.push('/coach/settings/brand')}
                />
              </Card>
            </View>
          ) : null}

          {/* Tu equipo — solo si el workspace activo es un team. */}
          {isTeam ? (
            <View>
              <SectionTitle>Tu equipo</SectionTitle>
              <Card padding="none">
                <ListRow
                  testID="hub-team"
                  leading={<IconTile Icon={Users} tone="sport" />}
                  title="Mi Equipo"
                  subtitle="Marca del pool, miembros y accesos"
                  showChevron
                  onPress={() => router.push('/coach/settings/team')}
                />
              </Card>
            </View>
          ) : null}

          {/* Plan — Suscripción (personal) + Módulos. */}
          <View>
            <SectionTitle>{managed ? 'Lo que paga el equipo' : 'Plan'}</SectionTitle>
            <Card padding="none">
              {!managed ? (
                <>
                  <ListRow
                    testID="hub-subscription"
                    leading={<IconTile Icon={CreditCard} />}
                    title="Suscripción"
                    subtitle="Tu plan, facturación y alumnos activos"
                    showChevron
                    onPress={() => router.push('/coach/subscription')}
                  />
                  <RowDivider />
                </>
              ) : null}
              <ListRow
                testID="hub-modules"
                leading={<IconTile Icon={Package} tone="sport" />}
                title={managed ? 'Módulos del equipo' : 'Módulos'}
                subtitle="Catálogo de módulos disponibles"
                trailing={<Badge tone="sport" variant="soft" label={`${MODULE_CATALOG_KEYS.length} módulos`} />}
                showChevron
                onPress={() => router.push('/coach/modules')}
              />
            </Card>
          </View>

          {/* Configuración — Funciones + Áreas. */}
          <View>
            <SectionTitle>Configuración</SectionTitle>
            <Card padding="none">
              <ListRow
                testID="hub-features"
                leading={<IconTile Icon={SlidersHorizontal} />}
                title="Funciones"
                subtitle="Qué tan a fondo trabajas la nutrición y qué ven tus alumnos"
                showChevron
                onPress={() => router.push('/coach/settings/features')}
              />
              <RowDivider />
              <ListRow
                testID="hub-areas"
                leading={<IconTile Icon={LayoutGrid} />}
                title="Áreas del builder"
                subtitle="Organizá los días del planificador"
                showChevron
                onPress={() => router.push('/coach/settings/areas')}
              />
            </Card>
          </View>

          {/* Cuenta — Soporte + Mi cuenta (tema, contraseña y logout viven en el tab Mi cuenta). */}
          <View>
            <SectionTitle>Cuenta</SectionTitle>
            <Card padding="none">
              <ListRow
                testID="hub-support"
                leading={<IconTile Icon={LifeBuoy} />}
                title="Soporte"
                subtitle="Escríbenos si algo no funciona o necesitas ayuda"
                showChevron
                onPress={() => router.push('/coach/support')}
              />
              <RowDivider />
              <ListRow
                testID="hub-account"
                leading={<IconTile Icon={UserCog} />}
                title="Mi cuenta"
                subtitle="Tema, contraseña y cierre de sesión"
                showChevron
                onPress={() => router.push('/coach/perfil')}
              />
            </Card>
          </View>

          {/* Pie — wordmark EVA, espejo del footer del hub web. */}
          <View className="items-center" style={{ paddingTop: 26, gap: 4, opacity: 0.6 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 22, letterSpacing: -0.5 }}>
              EVA
            </Text>
            <Text className="font-sans-semibold text-subtle" style={{ fontSize: 11 }}>
              Ejercicio Virtual Avanzado · v2.4
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}
