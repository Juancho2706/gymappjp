import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { cssInterop } from 'nativewind'
import {
  CreditCard,
  LayoutGrid,
  LifeBuoy,
  Moon,
  Palette,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { SafeAreaView } from 'react-native-safe-area-context'
import { deriveSportTokens } from '@eva/brand-kit'
import { Avatar, Badge, Button, Card, Dialog } from '../../../components'
import { ListRow } from '../../../components/ListRow'
import { AppBackground } from '../../../components/AppBackground'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { useTheme } from '../../../context/ThemeContext'
import { hexToRgba } from '../../../lib/theme'
import { SHADOWS } from '../../../lib/shadows'
import { useWorkspace } from '../../../lib/workspace'
import { getCoachProfile, type CoachProfile } from '../../../lib/coach'
import { canUseBranding } from '../../../lib/coach-tiers'
import { useCoachTabbarScroll } from '../../../components/coach/CoachTabbarScroll'
import { signOutAndRedirectHome } from '../../../lib/auth-actions'
import { requestAccountDeletion } from '../../../lib/account-deletion'

/**
 * E7-02 · Hub de Opciones (coach) — espejo RN del hub móvil web (`apps/web/.../coach/settings/page.tsx`,
 * bloque `md:hidden`). El tab "Opciones" YA no abre Mi Marca directo: abre este índice de HubCards
 * (aquí: `ListRow` + `IconTile`, el vocabulario móvil del DS, ver alumno/perfil). Cada destino es una
 * sub-pantalla o un tab existente. Context-aware por `useWorkspace()` (la ÚNICA fuente de contexto
 * team/org/standalone): si `isManaged` (team_managed/org_managed) el hub se REDUCE — sin Mi Marca ni
 * Suscripción personales (los gestiona el equipo/organización), como en la web.
 *
 * Rutas (contrato del arquitecto E7):
 *  · Mi Marca    → /coach/settings/brand      (el brand studio de E3, mudado bajo el hub)
 *  · Mi plan     → /coach/subscription        (tab existente, solo estado del plan)
 *  · Funciones   → /coach/settings/funciones  (especialidad, qué se ve en el panel, detalle de
 *                                              nutrición, guía y alumno de ejemplo)
 *  · Áreas       → /coach/settings/areas      (completo: CRUD de áreas del builder)
 *  · Equipo      → /coach/team                 (solo si kind es team_*)
 *
 * Ola de orden W3.5: «Módulos» (/coach/modules), «Mi panel» (/coach/settings/mi-panel) y
 * «Funciones de nutrición» (/coach/settings/features) eran TRES filas para el mismo concepto —
 * qué usa el coach y qué se le ve. Colapsaron en UNA: «Funciones». Las tres rutas viejas siguen
 * vivas como redirect (W3.4).
 */

// Let NativeWind drive the lucide icon `color` via `text-*` classes (DS pattern, ver perfil.tsx).
for (const Icon of [CreditCard, LayoutGrid, LifeBuoy, Moon, Palette, SlidersHorizontal, Sun, Trash2, UserCog, Users]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  elite: 'Elite',
  growth: 'Growth',
  scale: 'Scale',
}

/**
 * QA del owner 22-08 (marca ROSA en dark): el tono destacado ERA `sport` (`bg-sport-100` +
 * `text-sport-600`) y salía azul EVA. La rampa `--color-sport-*` se re-tiñe por `brandVars()`,
 * pero el bloque `.dark` de `global.css` la vuelve a declarar con los canales EVA, así que en
 * modo oscuro cualquier `bg-sport-*`/`text-sport-*` cae al azul de fábrica. El ÚNICO color de
 * marca fiable en runtime es el JS `theme.primary` (ThemeContext lo brandea con @eva/brand-kit y
 * no pasa por el cascade de CSS-vars) — mismo patrón que ya usan `MobilePublicCodeRequiredModal`
 * y la píldora del código. Por eso el tono destacado se llama `brand` y se pinta por `style`.
 */
type Tone = 'neutral' | 'brand'

/** 46px rounded tile hosting a HubCard icon (1:1 con el HubCard web: 46×46 rounded-control, icono 22). */
function IconTile({ Icon, tone = 'neutral' }: { Icon: LucideIcon; tone?: Tone }) {
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

/** Apariencia — toggle claro/oscuro cableado a ThemeContext (1:1 con ThemeToggleCard web). */
function AppearanceToggle() {
  const { resolvedScheme, toggleTheme } = useTheme()
  const opts: [('light' | 'dark'), string, LucideIcon][] = [
    ['light', 'Claro', Sun],
    ['dark', 'Oscuro', Moon],
  ]
  return (
    <Card padding="sm">
      <View className="flex-row rounded-control bg-surface-sunken" style={{ gap: 6, padding: 4 }} accessibilityRole="tablist">
        {opts.map(([val, label, Icon]) => {
          const active = resolvedScheme === val
          return (
            <Pressable
              key={val}
              testID={`hub-tema-${val}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => { if (!active) toggleTheme() }}
              className={active ? 'bg-surface-card' : ''}
              style={[
                { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 10 },
                active ? SHADOWS[resolvedScheme].sm : null,
              ]}
            >
              <Icon size={18} strokeWidth={2.2} className={active ? 'text-strong' : 'text-muted'} />
              <Text className={active ? 'font-sans-bold text-strong' : 'font-sans-bold text-muted'} style={{ fontSize: 14.5 }}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Card>
  )
}

/** Viñeta del diálogo de baja — punto danger + texto, para que el alcance se lea de un vistazo. */
function DeletionBullet({ children }: { children: string }) {
  return (
    <View className="flex-row" style={{ gap: 10 }}>
      <View className="bg-danger-500" style={{ width: 5, height: 5, borderRadius: 2.5, marginTop: 7 }} />
      <Text className="font-sans text-muted" style={{ flex: 1, fontSize: 13.5, lineHeight: 19 }}>
        {children}
      </Text>
    </View>
  )
}

/**
 * Zona de peligro — eliminación de cuenta EN-APP.
 *
 * POR QUÉ cambió: hasta la build 51 esto abría un `mailto` y App Review lo rechazó (guideline
 * 5.1.1(v)): solo industrias altamente reguladas pueden exigir un canal de atención para dar de
 * baja; el correo puede acompañar a la baja en-app, nunca reemplazarla.
 *
 * Flujo: confirmación explícita en un Dialog del DS → POST autenticado → cuenta deshabilitada al
 * instante en el server → cerramos sesión por el MISMO camino que el botón "Cerrar sesión" de esta
 * pantalla (`signOutAndRedirectHome`). Si el server falla, el error se muestra inline y se puede
 * reintentar: NUNCA cerramos sesión sin un `ok`, porque dejaría al coach fuera de la app con la
 * cuenta intacta y sin saberlo.
 */
function DangerZone() {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function closeDialog() {
    if (saving) return // una baja en vuelo no se puede abandonar a medias
    setOpen(false)
    setError(null)
  }

  async function confirmDelete() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await requestAccountDeletion()
      // Solo tras el ok del server: la cuenta ya quedó deshabilitada ⇒ salir a la entrada.
      // No hay setSaving(false) porque la pantalla se desmonta en la redirección.
      await signOutAndRedirectHome()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la cuenta. Intenta de nuevo.')
      setSaving(false)
    }
  }

  return (
    <View>
      <View className="mx-0.5 mb-2.5 mt-5 flex-row items-center gap-2">
        <View className="h-3 w-[3px] rounded-sm bg-danger-500" />
        <Text className="font-sans-extra text-danger-600" style={{ fontSize: 11, letterSpacing: 0.77, textTransform: 'uppercase' }}>
          Zona de peligro
        </Text>
      </View>
      <View className="rounded-card border-[1.5px] border-danger-100 bg-surface-card" style={{ padding: 16 }}>
        <View className="flex-row items-center" style={{ gap: 14 }}>
          <View className="items-center justify-center rounded-control bg-danger-100" style={{ width: 46, height: 46 }}>
            <Trash2 size={22} strokeWidth={2} className="text-danger-600" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="font-sans-bold text-strong" style={{ fontSize: 15 }}>Eliminar mi cuenta</Text>
            <Text className="font-sans text-muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 17 }}>
              Cierra tu cuenta, cancela tu suscripción y elimina tus datos. Es definitivo.
            </Text>
          </View>
        </View>
        <Button
          label="Eliminar mi cuenta"
          variant="danger"
          full
          style={{ marginTop: 14 }}
          testID="hub-danger-baja"
          accessibilityRole="button"
          accessibilityLabel="Eliminar mi cuenta"
          accessibilityHint="Abre la confirmación para eliminar tu cuenta de forma definitiva"
          onPress={() => { setError(null); setOpen(true) }}
        />
      </View>

      <Dialog
        open={open}
        onClose={closeDialog}
        title="Eliminar mi cuenta"
        description="Esta acción es definitiva y no se puede deshacer."
        showCloseButton={!saving}
        footer={
          // Botones APILADOS: dos `full` en una fila se desbordan (gotcha shrink-0 del DS).
          <View style={{ gap: 10 }}>
            <Button
              label="Eliminar definitivamente"
              variant="danger"
              full
              loading={saving}
              disabled={saving}
              testID="hub-danger-confirmar"
              accessibilityRole="button"
              accessibilityLabel="Eliminar definitivamente mi cuenta"
              onPress={() => { void confirmDelete() }}
            />
            <Button
              label="Cancelar"
              variant="secondary"
              full
              disabled={saving}
              testID="hub-danger-cancelar"
              accessibilityRole="button"
              accessibilityLabel="Cancelar y conservar mi cuenta"
              onPress={closeDialog}
            />
          </View>
        }
      >
        <View style={{ gap: 10 }}>
          <DeletionBullet>Tu cuenta se cierra de inmediato: no podrás volver a entrar.</DeletionBullet>
          <DeletionBullet>Tus alumnos pierden el acceso a tu app, a sus rutinas y a sus planes.</DeletionBullet>
          <DeletionBullet>Tu suscripción se cancela y no se te vuelve a cobrar.</DeletionBullet>
          <DeletionBullet>Tus datos y los de tu marca se eliminan por completo dentro de 30 días (Ley 21.719).</DeletionBullet>
        </View>
        {error ? (
          <View className="rounded-control border border-danger-100 bg-danger-100" style={{ padding: 12 }}>
            <Text className="font-sans text-danger-600" accessibilityLiveRegion="polite" style={{ fontSize: 13, lineHeight: 18 }}>
              {error}
            </Text>
          </View>
        ) : null}
      </Dialog>
    </View>
  )
}

/** Section eyebrow — accent bar + uppercase 11px extrabold (1:1 con el SectionTitle de perfil/web). */
function SectionTitle({ children }: { children: string }) {
  const { theme } = useTheme()
  return (
    <View className="mx-0.5 mb-2.5 mt-5 flex-row items-center gap-2">
      {/* Barra de acento = marca del coach (antes `bg-sport-500` = azul EVA fijo en dark). */}
      <View className="h-3 w-[3px] rounded-sm" style={{ backgroundColor: theme.primary }} />
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
  const { onScroll } = useCoachTabbarScroll()
  const router = useRouter()
  const ws = useWorkspace()
  // `branding` es la presentación EFECTIVA (preset + gate de tier ya resueltos en ThemeContext) y
  // la MISMA caché que reescribe «Mi marca» al guardar ⇒ el hub refleja el logo nuevo sin reiniciar.
  const { theme, branding, resolvedScheme } = useTheme()
  const [profile, setProfile] = useState<CoachProfile | null>(null)
  const [loading, setLoading] = useState(true)
  // Fill de marca SEGURO para texto blanco (paso ~600 clampeado a AA por @eva/brand-kit): es lo que
  // el token `--cta-fill` significa, resuelto en JS para que no lo pise el `.dark` de global.css.
  const brandCtaFill = useMemo(() => deriveSportTokens(theme.primary).ctaFill, [theme.primary])

  useEffect(() => {
    getCoachProfile()
      .then((p) => setProfile(p))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const isTeam = ws.kind === 'team_owner' || ws.kind === 'team_member'
  const managed = ws.isManaged
  const tier = profile?.subscriptionTier ?? 'free'
  // Pricing v3 (owner 2026-08-21): el white-label está en todos los planes VENDIDOS, así que este
  // flag ya NO gatea el hero. Sobrevive solo para el badge de la fila «Mi Marca»: el único tier
  // sin marca propia no existe hoy: el flag queda como fail-closed de tier corrupto.
  const brandingOk = canUseBranding(tier)
  const displayName = profile?.brandName?.trim() || profile?.fullName?.trim() || 'Coach'
  // QA2-B2: el hero pinta el LOGO de la marca cuando existe (`coaches.logo_url`, la misma
  // columna que edita `coach/settings/brand.tsx`); sin logo cae a la figura EVA del DS.
  // v3: se pinta para TODO tier — un free ya tiene su logo propio.
  // QA owner 22-08: la caché de marca MANDA sobre el perfil (la reescribe «Mi marca» al guardar, así
  // que el logo nuevo aparece al volver) y en dark se prefiere `logo_url_dark` si el coach lo subió.
  const heroLogoUrl =
    (resolvedScheme === 'dark' ? branding?.logoUrlDark?.trim() || branding?.logoUrl?.trim() : branding?.logoUrl?.trim()) ||
    profile?.logoUrl?.trim() ||
    null

  const roleBadge = isTeam
    ? ws.kind === 'team_owner'
      ? 'Dueño del equipo'
      : ws.canManageTeam
        ? 'Co-gestor'
        : 'Miembro'
    : managed
      ? 'Gestionado'
      : `Plan ${TIER_LABEL[tier] ?? 'Gratis'}`
  const heroSubtitle = isTeam ? 'Pool de coaches' : managed ? 'Cuenta gestionada por tu organización' : 'Tu negocio EVA'

  if (loading) {
    return <EvaLoaderScreen subtitle="Cargando opciones…" />
  }

  return (
    <View className="flex-1 bg-surface-app">
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
          {/* Título */}
          <View style={{ paddingTop: 16, paddingBottom: 4 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 21, letterSpacing: -0.6, textTransform: 'uppercase' }}>
              Opciones
            </Text>
            <Text className="font-sans text-muted" style={{ fontSize: 14, marginTop: 4, lineHeight: 22 }}>
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
              {/* QA2-B2: con logo de marca el círculo muestra el LOGO (contain sobre fondo
                  neutro); sin logo — o si la imagen falla — cae a las iniciales del DS. */}
              {/* El anillo del DS es `bg-sport-500` (azul EVA fijo en dark): se pisa por `style` con la marca. */}
              <Avatar
                name={displayName}
                src={heroLogoUrl}
                fit="contain"
                size="xl"
                ring="sport"
                fallback="eva"
                style={{ backgroundColor: theme.primary }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-display-black text-on-dark" style={{ fontSize: 20, letterSpacing: -0.4 }} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text className="font-sans text-on-dark-muted" style={{ fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                  {heroSubtitle}
                </Text>
                <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                  <Badge tone="sport" variant="solid" size="md" label={roleBadge} toneColor={brandCtaFill} />
                </View>
              </View>
            </Card>
          </MotiView>

          {/* Apariencia — toggle claro/oscuro, justo tras el hero (1:1 con web). */}
          <View>
            <SectionTitle>Apariencia</SectionTitle>
            <AppearanceToggle />
          </View>

          {/* Personalización — solo con marca propia (no gestionada). */}
          {!managed ? (
            <View>
              <SectionTitle>Personalización</SectionTitle>
              <Card padding="none">
                <ListRow
                  testID="hub-brand"
                  leading={<IconTile Icon={Palette} tone="brand" />}
                  title="Mi Marca"
                  subtitle="Logo, colores y mensajes de la app del alumno"
                  trailing={brandingOk ? undefined : <Badge tone="sport" variant="soft" label="Pro" toneColor={theme.primary} />}
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
                  leading={<IconTile Icon={Users} tone="brand" />}
                  title="Mi Equipo"
                  subtitle="Marca del pool, miembros y accesos"
                  showChevron
                  onPress={() => router.push('/coach/team')}
                />
              </Card>
            </View>
          ) : null}

          {/* Plan — Suscripción personal. El catálogo de Módulos se demolió (W3.5/W4.3): con «todo
              en todos los planes» no había nada que un coach tuviera o no tuviera, y a un coach
              gestionado la sección quedaba sin una sola fila propia. */}
          {!managed ? (
            <View>
              <SectionTitle>Plan</SectionTitle>
              <Card padding="none">
                <ListRow
                  testID="hub-subscription"
                  leading={<IconTile Icon={CreditCard} />}
                  title="Mi plan"
                  subtitle="Estado de tu plan y alumnos activos"
                  showChevron
                  onPress={() => router.push('/coach/subscription')}
                />
              </Card>
            </View>
          ) : null}

          {/* Configuración — Funciones + Áreas. */}
          <View>
            <SectionTitle>Configuración</SectionTitle>
            <Card padding="none">
              {/* UNA puerta a todo lo que el coach decide sobre su panel (W3.5). Se muestra también
                  a un coach de team: la pantalla decide qué bloques pinta (a un coach gestionado la
                  especialidad se la define su tenant, igual que hoy). Se OCULTA solo al coach
                  administrado por una organización sin team: ahí no decide nada de esto. */}
              {managed && !isTeam ? null : (
                <>
                  <ListRow
                    testID="hub-funciones"
                    leading={<IconTile Icon={SlidersHorizontal} tone="brand" />}
                    title="Funciones"
                    subtitle="Tu especialidad, qué ves en tu panel y tu alumno de ejemplo"
                    showChevron
                    onPress={() => router.push('/coach/settings/funciones')}
                  />
                  <RowDivider />
                </>
              )}
              <ListRow
                testID="hub-areas"
                leading={<IconTile Icon={LayoutGrid} />}
                title="Áreas del builder"
                subtitle="Organiza los días del planificador"
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
                subtitle="Tema, contraseña y datos de tu cuenta"
                showChevron
                onPress={() => router.push('/coach/perfil')}
              />
            </Card>
          </View>

          {/* Zona de peligro — baja de cuenta (siempre alcanzable, 1:1 con web). */}
          <DangerZone />

          {/* Pie — wordmark EVA, espejo del footer del hub web. */}
          <View className="items-center" style={{ paddingTop: 26, gap: 4, opacity: 0.6 }}>
            <Text className="font-display-black text-strong" style={{ fontSize: 24, letterSpacing: -0.5 }}>
              EVA
            </Text>
            <Text className="font-sans-semibold text-subtle" style={{ fontSize: 12 }}>
              Ejercicio Virtual Avanzado · v2.4
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}
