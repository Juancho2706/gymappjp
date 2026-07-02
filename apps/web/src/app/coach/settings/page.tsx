import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import { getTierCapabilities, ADDON_MODULE_KEYS, type SubscriptionTier } from '@/lib/constants'
import { Palette, Package, ChevronRight, Users, CreditCard, SlidersHorizontal, LayoutGrid, LifeBuoy, type LucideIcon } from 'lucide-react'
import { BrandUpsell } from './_components/BrandUpsell'
import { SupportPane } from './_components/SupportPane'
import { SubscriptionContent } from '../subscription/_components/SubscriptionContent'
import { DangerZone } from './_components/DangerZone'
import { CoachSignOutCard } from './_components/CoachSignOut'
import { ThemeToggleCard } from './_components/ThemeToggleCard'
import { getCoachSettingsForUser } from './_data/settings.queries'
import { BrandSettingsForm } from './BrandSettingsForm'
import { LogoUploadForm } from './LogoUploadForm'
import { ModulesForm } from './modules/_components/ModulesForm'
import { FeaturePrefsPanel } from '@/components/coach/FeaturePrefsPanel'
import { AreasManager } from './areas/_components/AreasManager'
import { getModulesContext } from './modules/_data/modules.queries'
import { getFuncionesContext } from './funciones/_data/funciones.queries'
import { getAreasContext } from './areas/_data/areas.queries'
import { CoachSettingsDesktop, type SettingsSectionId } from './_components/CoachSettingsDesktop'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Opciones | EVA',
}

const TIER_LABEL: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    pro: 'Pro',
    elite: 'Elite',
}

/** Eyebrow de grupo — etiqueta uppercase del DS. */
function Eyebrow({ children, tone = 'subtle' }: { children: React.ReactNode; tone?: 'subtle' | 'danger' }) {
    return (
        <p
            className="px-1 text-[11px] font-extrabold uppercase tracking-[0.07em]"
            style={{ color: tone === 'danger' ? 'var(--danger-600)' : 'var(--text-subtle)' }}
        >
            {children}
        </p>
    )
}

/** Badge soft del hub — espejo del Badge variant="soft" del DS. */
function HubBadge({ label, tone = 'neutral' }: { label: string; tone?: 'sport' | 'neutral' }) {
    return (
        <span
            className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold"
            style={
                tone === 'sport'
                    ? { background: 'var(--sport-100)', color: 'var(--sport-700)' }
                    : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }
            }
        >
            {label}
        </span>
    )
}

/** Card del hub "Opciones" — patrón único (tile de icono + título + descripción + chevron). */
function HubCard({
    href,
    icon: Icon,
    title,
    desc,
    tone = 'neutral',
    badge,
}: {
    href: string
    icon: LucideIcon
    title: string
    desc: string
    tone?: 'sport' | 'neutral'
    badge?: { label: string; tone?: 'sport' | 'neutral' }
}) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-3.5 rounded-card border border-subtle bg-surface-card p-4 transition-all hover:border-[var(--sport-300)] hover:shadow-[var(--shadow-sm)]"
        >
            <span
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-control"
                style={
                    tone === 'sport'
                        ? { background: 'var(--sport-100)', color: 'var(--sport-600)' }
                        : { background: 'var(--surface-sunken)', color: 'var(--ink-700)' }
                }
            >
                <Icon className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-bold text-strong">{title}</h3>
                    {badge && <HubBadge label={badge.label} tone={badge.tone} />}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{desc}</p>
            </div>
            <ChevronRight className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--ink-300)' }} />
        </Link>
    )
}

/** Pie del hub — wordmark EVA + versión, espejo del footer del UI kit. */
function SettingsFooter() {
    return (
        <div className="flex flex-col items-center gap-2 pt-6 opacity-60">
            <span className="font-display text-2xl font-black tracking-tight text-strong">EVA</span>
            <span className="text-xs font-semibold text-subtle">EVA · Ejercicio Virtual Avanzado · v2.4</span>
        </div>
    )
}

/** Hero de identidad — card invertida con avatar + badge de plan/rol. */
function IdentityHero({ name, subtitle, badge }: { name: string; subtitle: string; badge: string }) {
    const initial = (name?.trim()?.charAt(0) || 'C').toUpperCase()
    return (
        <div className="flex items-center gap-4 rounded-card p-5 bg-[var(--surface-inverse)]">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-2xl font-black bg-[var(--sport-500)] text-[var(--text-on-sport)] ring-2 ring-[var(--sport-400)]/40">
                {initial}
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate font-display text-xl font-black text-on-dark">{name}</p>
                <p className="mt-0.5 truncate text-[13px] text-on-dark-muted">{subtitle}</p>
                <span className="mt-2 inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold bg-[var(--sport-500)] text-[var(--text-on-sport)]">
                    {badge}
                </span>
            </div>
        </div>
    )
}

/** Cuerpo de un panel de la SettingsShell (desktop): subtítulo opcional + contenido embebido,
 *  en la caja de lectura angosta del DS (--dt-read-narrow). El título grande (panehd) lo pone
 *  CoachSettingsDesktop desde el label del rail. */
function PaneBody({ desc, children }: { desc?: string; children: ReactNode }) {
    return (
        <>
            {desc && <p className="dt-set-panesub">{desc}</p>}
            <div className="dt-set-embed">{children}</div>
        </>
    )
}

export default async function CoachSettingsPage() {
    const { user, coach, clientCount } = await getCoachSettingsForUser()
    if (!user) redirect('/login')
    if (!coach) redirect('/login')
    if (coach.subscription_status === 'org_managed') redirect('/coach/dashboard')

    const displayName = coach.brand_name || coach.full_name || 'Coach'
    const clientLabel = `${clientCount} ${clientCount === 1 ? 'alumno' : 'alumnos'}`
    const enabledModules = (coach.enabled_modules && typeof coach.enabled_modules === 'object'
        ? (coach.enabled_modules as Record<string, unknown>)
        : {})
    const activeModuleCount = ADDON_MODULE_KEYS.filter((k) => enabledModules[k] === true).length

    // C (Settings hub): en contexto team la marca es DEL EQUIPO (Brand Studio en /coach/team)
    // y la facturación la maneja EVA — acá queda lo del coach como persona: módulos y cuenta.
    if (coach.subscription_status === 'team_managed') {
        return (
            <div className="mx-auto max-w-3xl animate-fade-in space-y-6 px-4 py-6 md:px-8">
                <div>
                    <h1 className="font-display text-xl font-black uppercase tracking-tighter text-strong md:text-2xl">Opciones</h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                        La marca y la suscripción las gestiona tu equipo. Aquí están los módulos del pool y tu cuenta personal.
                    </p>
                </div>

                <IdentityHero name={displayName} subtitle="Pool de coaches · gestión del equipo" badge="Co-gestor" />

                <div className="space-y-3">
                    <Eyebrow>Apariencia</Eyebrow>
                    <ThemeToggleCard />
                </div>

                <div className="space-y-3">
                    <Eyebrow>Tu equipo</Eyebrow>
                    <HubCard
                        href="/coach/team"
                        icon={Users}
                        title="Mi Equipo"
                        desc="Marca del pool, miembros, accesos y código de invitación"
                        tone="sport"
                    />
                </div>

                {/* Funciones del equipo — visibilidad de nutrición (solo gestores; la query/RLS gatean) */}
                <div className="space-y-3">
                    <Eyebrow>Lo que paga el equipo</Eyebrow>
                    <HubCard
                        href="/coach/settings/modules"
                        icon={Package}
                        title="Módulos del equipo"
                        desc="Catálogo de módulos del pool"
                        badge={{ label: `${activeModuleCount} activos`, tone: 'sport' }}
                    />
                </div>
                <div className="space-y-3">
                    <Eyebrow>Configuración</Eyebrow>
                    <HubCard
                        href="/coach/settings/funciones"
                        icon={SlidersHorizontal}
                        title="Funciones del equipo"
                        desc="Visibilidad de nutrición del equipo"
                    />
                    <HubCard
                        href="/coach/settings/areas"
                        icon={LayoutGrid}
                        title="Áreas del builder"
                        desc="Organizá los días del planificador"
                    />
                </div>

                <div className="space-y-3">
                    <Eyebrow>Cuenta</Eyebrow>
                    <HubCard
                        href="/coach/support"
                        icon={LifeBuoy}
                        title="Soporte"
                        desc="Escribinos si algo no funciona o necesitás ayuda"
                    />
                    <CoachSignOutCard />
                </div>

                <DangerZone />

                <SettingsFooter />
            </div>
        )
    }

    const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
    const capabilities = getTierCapabilities(tier)
    // Sin branding (Free): el hub Opciones se mantiene ENTERO (kit: la card Mi Marca lleva
    // badge Pro y rutea al upsell — /coach/settings/brand lo renderiza como sub-pantalla).
    const canUseBranding = capabilities.canUseBranding

    // ── Desktop (≥760): SettingsShell de 2 paneles (rail + sección embebida) ──
    // Las sub-páginas siguen vivas como rutas directas; en desktop embebemos su contenido REAL
    // (mismos componentes + mismos datos) sin navegación. Data de cada sección en paralelo.
    const [modulesRes, funcionesRes, areasRes] = await Promise.all([
        getModulesContext(),
        getFuncionesContext(),
        getAreasContext(),
    ])

    const sections: Partial<Record<SettingsSectionId, ReactNode>> = {
        marca: canUseBranding ? (
            <PaneBody desc="Personalizá la app de tus alumnos: logo, colores, nombre y mensajes. Cada alumno ve TU marca, no la de EVA.">
                <div className="space-y-6">
                    <LogoUploadForm currentLogoUrl={coach.logo_url} brandName={coach.brand_name} />
                    <BrandSettingsForm coach={coach} />
                </div>
            </PaneBody>
        ) : (
            <PaneBody desc="Tu app, con tu identidad — disponible desde Starter.">
                <BrandUpsell tier={tier} />
            </PaneBody>
        ),
        suscripcion: (
            <PaneBody desc="Tu plan, facturación, alumnos activos y métodos de pago.">
                <Suspense fallback={<p className="text-sm text-muted">Cargando estado de suscripción…</p>}>
                    <SubscriptionContent embedded />
                </Suspense>
            </PaneBody>
        ),
        apariencia: (
            <PaneBody desc="Tema claro u oscuro de la interfaz del panel.">
                <ThemeToggleCard />
            </PaneBody>
        ),
        soporte: (
            <PaneBody>
                <SupportPane />
            </PaneBody>
        ),
        eliminar: (
            <PaneBody>
                <DangerZone />
            </PaneBody>
        ),
    }
    if (modulesRes.ctx) {
        sections.modulos = (
            <PaneBody desc="Conocé los módulos disponibles para tu cuenta.">
                <ModulesForm
                    modules={modulesRes.ctx.modules}
                    killedByOperator={modulesRes.ctx.killedByOperator}
                    isTeamManager={modulesRes.ctx.isTeamManager}
                    scope={modulesRes.ctx.scope}
                    tier={modulesRes.ctx.tier}
                    nutritionVisible={modulesRes.ctx.nutritionVisible}
                />
            </PaneBody>
        )
    }
    if (funcionesRes.ctx) {
        sections.funciones = (
            <PaneBody desc="Elegí qué tan a fondo trabajás la nutrición y qué secciones ven vos y tus alumnos.">
                {funcionesRes.ctx.scope === 'team' ? (
                    <FeaturePrefsPanel scope="team" teamId={funcionesRes.ctx.teamId!} domains={funcionesRes.ctx.domains} />
                ) : (
                    <FeaturePrefsPanel scope="coach" domains={funcionesRes.ctx.domains} />
                )}
            </PaneBody>
        )
    }
    if (areasRes.ctx) {
        sections.areas = (
            <PaneBody desc="Organizá los días de entrenamiento con tus propias áreas (Movilidad, Core, HYROX…).">
                <AreasManager initialAreas={areasRes.ctx.areas} canEdit={areasRes.ctx.canEdit} scope={areasRes.ctx.scope} />
            </PaneBody>
        )
    }

    // Standalone (todos los tiers — Free ve el hub con Mi Marca badge Pro → upsell):
    //  · Móvil (<760): hub "Opciones" aplanado (un solo patrón de card), verbatim del diseño móvil.
    //  · Desktop (≥760): SettingsShell de 2 paneles 1:1 con DesktopOpciones.
    return (
        <>
            <div className="mx-auto max-w-3xl animate-fade-in space-y-6 px-4 py-6 md:hidden">
                <div>
                    <h1 className="font-display text-xl font-black uppercase tracking-tighter text-strong">Opciones</h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                        Tu marca, tu suscripción y la configuración de tu cuenta, todo en un solo lugar.
                    </p>
                </div>

                <IdentityHero name={displayName} subtitle={`Coach · ${clientLabel}`} badge={`Plan ${TIER_LABEL[tier] ?? 'Starter'}`} />

                <div className="space-y-3">
                    <Eyebrow>Apariencia</Eyebrow>
                    <ThemeToggleCard />
                </div>

                <div className="space-y-3">
                    <Eyebrow>Personalización</Eyebrow>
                    {canUseBranding ? (
                        <HubCard
                            href="/coach/settings/brand"
                            icon={Palette}
                            title="Mi Marca"
                            desc="Logo, colores, nombre y mensajes de la app del alumno"
                            tone="sport"
                        />
                    ) : (
                        <HubCard
                            href="/coach/settings/brand"
                            icon={Palette}
                            title="Mi Marca"
                            desc="Logo, colores y nombre en la app de tus alumnos"
                            tone="sport"
                            badge={{ label: 'Pro', tone: 'sport' }}
                        />
                    )}
                </div>

                {/* Plan: suscripción base + módulos de pago, juntos. */}
                <div className="space-y-3">
                    <Eyebrow>Plan</Eyebrow>
                    <HubCard
                        href="/coach/subscription"
                        icon={CreditCard}
                        title="Suscripción"
                        desc="Tu plan, facturación, alumnos activos y métodos de pago"
                    />
                    <HubCard
                        href="/coach/settings/modules"
                        icon={Package}
                        title="Módulos"
                        desc="Catálogo de módulos disponibles"
                        badge={{ label: `${ADDON_MODULE_KEYS.length} módulos`, tone: 'sport' }}
                    />
                </div>

                <div className="space-y-3">
                    <Eyebrow>Configuración</Eyebrow>
                    <HubCard
                        href="/coach/settings/funciones"
                        icon={SlidersHorizontal}
                        title="Funciones de nutrición"
                        desc="Qué tan a fondo trabajás la nutrición y qué ven los alumnos"
                    />
                    <HubCard
                        href="/coach/settings/areas"
                        icon={LayoutGrid}
                        title="Áreas del builder"
                        desc="Organizá los días del planificador"
                    />
                </div>

                <div className="space-y-3">
                    <Eyebrow>Cuenta</Eyebrow>
                    <HubCard
                        href="/coach/support"
                        icon={LifeBuoy}
                        title="Soporte"
                        desc="Escribinos si algo no funciona o necesitás ayuda"
                    />
                    <CoachSignOutCard />
                </div>

                {/* Danger zone — account deletion (siempre alcanzable) */}
                <DangerZone />

                <SettingsFooter />
            </div>

            <div className="hidden w-full animate-fade-in md:block">
                <div className="mx-auto w-full max-w-[1600px] px-4 pb-3 pt-5 md:px-8">
                    <CoachSettingsDesktop sections={sections} />
                </div>
            </div>
        </>
    )
}
