'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Sparkles, ChevronDown } from 'lucide-react'
import { CoachBrandAvatar, EvaBrandFallback } from '@/components/coach/CoachBrandAvatar'
import { NewsBellButton } from '@/components/coach/NewsBellButton'
import { AmbientBrandGlow } from '@/components/coach/AmbientBrandGlow'
import { BillingBanners } from './banners/BillingBanners'
import { DomainOffBanner } from './banners/DomainOffBanner'
import { VerifyEmailBanner } from './banners/VerifyEmailBanner'
import { RegistrationMirror } from '../../_components/RegistrationMirror'
import { PulseHero } from './PulseHero'
import { PriorityCard } from './PriorityCard'
import { AgendaCard } from './AgendaCard'
import { NewsFeed } from './NewsFeed'
import { DashboardFab } from './DashboardFab'
import { DesktopBento } from './DesktopBento'
import { InviteCodePill } from './invite/InviteCodePill'
import { ClientStatsSheet } from './sheets/ClientStatsSheet'
import { WorkspaceSwitchSheet } from './sheets/WorkspaceSwitchSheet'
import { todayLabel } from '../_lib/dashboard-design'
import type { DomainsEnabled } from '../_lib/quick-actions'
import type { DashboardV2Data } from '../_data/types'
import type { WorkspaceSummary } from '@/domain/auth/types'
import type { Persona } from '@eva/schemas'
import type { SubscriptionTier } from '@/lib/constants'
import { studentCountLabel, tierMaxClientsFor } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface Props {
    data: DashboardV2Data
    /** Reservado: lo consumía el modal de bienvenida Free (borrado el 22-08). */
    coachId: string
    coachName: string
    /** Reservado: lo consumía el checklist v1; la guía v2 arma sus links con `@eva/onboarding`. */
    coachSlug: string
    coachInviteCode?: string | null
    /**
     * Reservado: lo consumía el modal de bienvenida Free (`?welcome=free`), borrado el 22-08 —
     * la guía (`/coach/guia`) ES la bienvenida (owner: «un solo onboarding por área»). La prop
     * sigue en el contrato porque el RSC ya la resuelve y la guía la usará si vuelve a hacer falta.
     */
    persona: Persona | null
    subscriptionTier: SubscriptionTier
    /**
     * Reservado: la señal de marca del onboarding v2 la calcula el servidor (`hasCustomBrand`:
     * logo O preset O color no sembrado), no este booleano de «tiene logo visible».
     */
    hasCoachLogo: boolean
    /** Logo de marca del coach — usado como tile del avatar del header móvil (fallback iniciales). */
    coachLogoUrl?: string | null
    /**
     * Variante DARK del logo (`coaches.logo_url_dark`). Sin ella el header móvil pintaba SIEMPRE
     * el logo claro: un logo pensado para fondo blanco quedaba ilegible con el panel en oscuro
     * (bug de white-label del QA 22-08). `ThemedLogo` cae al claro cuando el coach no subió dark.
     */
    coachLogoDarkUrl?: string | null
    /** Alumnos activos standalone reales (is_archived=false) para el banner del plan gratuito. */
    activeClientCount?: number | null
    /** `coaches.max_clients`: cupo efectivo del coach (override manual / grandfather). GANA. */
    coachMaxClients?: number | null
    /** `coaches.created_at`: ancla del grandfather de pricing v2 si faltara la columna. */
    coachCreatedAt?: string | null
    /**
     * `coaches.email_verified_at` ya resuelto a booleano por el RSC (W3.11). `false` ⇒ se pinta el
     * banner de verificación blanda. La señal NUNCA es `auth.users.email_confirmed_at`: bajo D1 = A
     * el alta nace `email_confirm: true` y esa columna queda seteada para todos.
     */
    emailVerified?: boolean
    workspaces: WorkspaceSummary[]
    /**
     * Master switch por dominio ya resuelto por el RSC (`resolveDomainsEnabled`, W2.7). Hoy solo
     * gobierna el FAB de acciones rápidas. OPCIONAL y fail-OPEN a propósito: sin la prop (o sin la
     * key del dominio) se ofrece todo — visibilidad, nunca autorización.
     */
    domainsEnabled?: DomainsEnabled
}

export function DashboardShell({
    data,
    coachName,
    coachInviteCode,
    subscriptionTier,
    coachLogoUrl,
    coachLogoDarkUrl,
    activeClientCount,
    coachMaxClients,
    coachCreatedAt,
    emailVerified = true,
    workspaces,
    domainsEnabled,
}: Props) {
    const [statsSheetOpen, setStatsSheetOpen] = useState(false)
    const [wsSheetOpen, setWsSheetOpen] = useState(false)
    const firstName = coachName?.split(' ')[0] || 'Coach'
    const openInsights = () => setStatsSheetOpen(true)
    // Multi-workspace ⇒ el avatar abre el switcher de espacio (bottom-sheet). Con un solo
    // espacio el avatar sigue navegando a Opciones y NO lleva caret (misma condición que el
    // topbar desktop: workspaces.length > 1).
    const hasMultiWorkspace = workspaces.length > 1
    // Cupo REAL de ESTE coach para los dos banners de plan: la columna `coaches.max_clients` GANA
    // (la escribe el write-path y respeta el override manual), y si faltara, el grandfather de
    // pricing v2 la reconstruye desde su fecha de creación. NUNCA el catálogo de VENTA
    // (TIER_CONFIG): un coach anterior al corte del 18-08 conserva free 3 / pro 30 / elite 100 y
    // el banner tiene que hablar de SU cupo, no del de un coach nuevo.
    // `Math.max(1, …)`: el cupo ahora sale de una COLUMNA de DB y las barras dividen por él — un 0
    // suelto pintaría `NaN%`. Piso defensivo, no una regla de negocio.
    const maxClients = Math.max(1, coachMaxClients ?? tierMaxClientsFor(subscriptionTier, coachCreatedAt))
    // Puente a Teams: mismo momento de ventas de siempre (~80% del techo) pero medido contra el
    // cupo real. Con el 80 escrito a mano el banner era INALCANZABLE — Elite hoy topa en 60 (el
    // gate de cupo corta antes de llegar a 80) y un grandfathered de 100 lo veía recién al 80%.
    const teamsBridgeThreshold = Math.ceil(maxClients * 0.8)

    return (
        <>
            {/* El modal de bienvenida Free (`?welcome=free`) ya no existe: la guía es la bienvenida
                (owner 22-08). Lo único que ese modal hacía además de saludar era espejar la
                conversión del alta por Google (Meta `CompleteRegistration` + PostHog
                `coach_registered`), y eso NO se pierde: el coach nuevo la dispara en `/coach/guia`
                y el legado que todavía aterrice acá con `?welcome=free&eid=` la dispara desde este
                mismo espejo. */}
            <Suspense>
                <LegacyRegistrationMirror />
            </Suspense>

            {/* Sin px propio: el gutter lateral lo da CoachMainWrapper (px-4/md:px-8) — evita el
                doble padding (36px) que estrechaba todo en móvil vs el diseño (~20px).
                Móvil: `-mt-6` cancela el `py-6` (24px) top del contenedor de CoachMainWrapper
                (que NO se toca) para que el saludo arranque cerca del top; el único aire que queda
                es el `--mobile-content-top-offset` (safe-area del notch + 1rem) que aplica el
                wrapper. Desktop conserva su spacing (`md:mt-0` + el `md:py-10` del wrapper).
                Estructural: la fuente real del gap vive en CoachMainWrapper.tsx:54 (pt-offset) +
                CoachMainWrapper.tsx:72 (py-6) — al ser compartido con /c del alumno se neutraliza
                acá en vez de tocar el wrapper. */}
            {/* Glow ambiental brand-tinted detrás del hero/stats (decisión CEO 2026-07-04, revierte
                el "fondo limpio sin tonalidad" del CD original): AmbientBrandGlow se auto-manda al
                fondo con -z-10; `isolate` acota ese stacking context al dashboard para que el glow
                no escape detrás del layout. El contenido (banners/hero/bento + el header móvil de
                abajo, todos hijos en flujo sin z negativo) queda por encima. El glow es full-bleed
                (inset-y-0 + w-screen) → cubre el dashboard entero y llega a los bordes laterales de
                pantalla escapando el gutter del wrapper; ver AmbientBrandGlow para la geometría. */}
            <div className="relative isolate z-10 mx-auto -mt-6 w-full pb-10 md:mt-0 md:pt-2">
                <AmbientBrandGlow />
                {/* Billing / tier banners (functional — not part of the design tree). `empty:hidden`
                    colapsa el bloque (y su margen) cuando no hay ningún banner que mostrar → sin
                    aire muerto extra bajo el notch para coaches sin avisos. */}
                <div className="mb-4 flex flex-col gap-2 empty:hidden">
                    {/* W1.5 — dominio apagado: PRIMERO de la pila porque es el único que responde a
                        la acción que el coach ACABA de hacer (abrió/tipeó una ruta de un dominio que
                        él mismo apagó y `assertDomainEnabled` lo devolvió acá con
                        `?notice=domain_off&domain=…`). Los demás hablan de estados que vienen de
                        antes, y este además se va solo: se cierra con × y no se persiste (2A).
                        `Suspense` porque lee `useSearchParams` (mismo motivo que el espejo de
                        registro de arriba). */}
                    <Suspense>
                        <DomainOffBanner />
                    </Suspense>
                    {/* W3.11 — verificación blanda: el aviso de CUENTA (sin correo probado no hay
                        reset de clave), y el único que no bloquea nada. Sin CTA de pago (regla de
                        tiendas iOS). */}
                    {!emailVerified && <VerifyEmailBanner />}
                    <BillingBanners
                        subscriptionStatus={data.subscriptionStatus}
                        currentPeriodEnd={data.currentPeriodEnd}
                        trialEndsAt={data.trialEndsAt}
                        activeClientCount={data.kpi.totalClients}
                    />
                    {subscriptionTier === 'free' && (
                        <FreeTierBanner
                            activeClients={activeClientCount ?? data.kpi.totalClients}
                            maxClients={maxClients}
                        />
                    )}
                    {subscriptionTier === 'elite' && data.kpi.totalClients >= teamsBridgeThreshold && (
                        <TeamsBridgeBanner
                            totalClients={data.kpi.totalClients}
                            maxClients={maxClients}
                        />
                    )}
                </div>

                {/* Guía de inicio v2 — NO se pinta acá. Vivió arriba del dashboard (SPEC §6, D5=A)
                    hasta que el owner decidió (22-08) que el panel del día 1 se ve LLENO: la guía
                    se mudó a `/coach/guia` con sus tarjetas del día 1 (marca en 60 s, alumno de
                    ejemplo, nudge de persona) y acá quedó la píldora flotante del layout. */}

                {/* ───────── Mobile (eva-app structure, <md) ───────── */}
                <div className="md:hidden">
                    <header className="flex items-center justify-between gap-2 pb-3.5">
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-semibold text-[var(--text-muted)]">
                                {todayLabel()}
                            </div>
                            <h1 className="truncate font-display text-[28px] font-black leading-[1.05] tracking-[-0.03em] text-[var(--text-strong)]">
                                Hola, {firstName}
                            </h1>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <button
                                type="button"
                                onClick={openInsights}
                                aria-label="Insights"
                                className="flex size-10 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-card text-[var(--text-strong)] transition-colors hover:bg-surface-sunken"
                            >
                                <Sparkles className="size-[19px]" />
                            </button>
                            {/* Campana REAL: en móvil el único acceso a Novedades es este header
                                (el CoachTopBar es `hidden md:flex`). Antes era un botón estático SIN
                                onClick → la campana no hacía nada al tocarla y el feed era inalcanzable
                                en móvil. NewsBellButton trae su propio Sheet + badge de no-leídos;
                                `mobileTriggerClassName` lo viste como tile del header (igual a Insights). */}
                            <NewsBellButton mobileTriggerClassName="size-10 shrink-0 rounded-control border border-border-subtle bg-surface-card text-[var(--text-strong)] [&_svg]:size-[19px] hover:bg-surface-sunken hover:text-[var(--text-strong)]" />
                            {/* Avatar de espacio. Con >1 workspace: botón con caret que abre el
                                switcher de espacio (bottom-sheet). Con 1 solo: link a Opciones,
                                sin caret. */}
                            {hasMultiWorkspace ? (
                                <button
                                    type="button"
                                    onClick={() => setWsSheetOpen(true)}
                                    aria-label="Cambiar de espacio"
                                    className="relative shrink-0"
                                >
                                    <HeaderBrandTile logoUrl={coachLogoUrl} logoDarkUrl={coachLogoDarkUrl} name={coachName} />
                                    <span className="absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-[var(--surface-app)] bg-surface-card text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
                                        <ChevronDown className="size-3" />
                                    </span>
                                </button>
                            ) : (
                                <Link
                                    href="/coach/settings"
                                    aria-label="Tu cuenta"
                                    className="relative shrink-0"
                                >
                                    <HeaderBrandTile logoUrl={coachLogoUrl} logoDarkUrl={coachLogoDarkUrl} name={coachName} />
                                </Link>
                            )}
                        </div>
                    </header>

                    {/* Código de invitación a un toque del saludo: el dato ya llegaba al shell pero
                        solo se veía en Ajustes → Mi Marca. `pb-3.5` repite el aire del header para que
                        el bloque sume una fila sin romper el ritmo vertical; `empty:hidden` colapsa esa
                        fila (y su padding) cuando la pastilla se apaga sola por no haber código todavía
                        — mismo truco que el bloque de banners de arriba. */}
                    <div className="pb-3.5 empty:hidden">
                        <InviteCodePill inviteCode={coachInviteCode} variant="mobile" />
                    </div>

                    <PulseHero kpi={data.kpi} onAdherence={openInsights} />

                    <div className="mb-[22px]">
                        <PriorityCard
                            items={data.topRiskClients}
                            showNextStep
                            agendaPending={data.agenda.length}
                            expiringOverdue={
                                data.expiringPrograms.filter((p) => p.daysLeft <= 0).length
                            }
                            avgAdherence={data.kpi.avgAdherence}
                        />
                    </div>

                    <div className="mb-6">
                        <AgendaCard items={data.agenda} />
                    </div>

                    <div className="mb-[18px]">
                        <NewsFeed
                            expiring={data.expiringPrograms}
                            activities={data.recentActivities}
                            pendingCheckins={data.pendingCheckinsCount}
                        />
                    </div>
                </div>

                {/* ───────── Desktop (eva-desktop bento, md+) ───────── */}
                <div className="hidden md:block">
                    <DesktopBento
                        data={data}
                        coachName={coachName}
                        coachInviteCode={coachInviteCode}
                        onAdherence={openInsights}
                    />
                </div>

            </div>

            <DashboardFab domainsEnabled={domainsEnabled} />

            <ClientStatsSheet
                open={statsSheetOpen}
                onOpenChange={setStatsSheetOpen}
                adherenceStats={data.adherenceStats}
                nutritionStats={data.nutritionStats}
            />

            {hasMultiWorkspace && (
                <WorkspaceSwitchSheet
                    open={wsSheetOpen}
                    onOpenChange={setWsSheetOpen}
                    workspaces={workspaces}
                />
            )}
        </>
    )
}

/** `eid` del alta: id de evento opaco, mismo patrón que valida `/coach/guia`. */
const REGISTRATION_EID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

/**
 * Espejo de conversión del alta Free por Google para el aterrizaje LEGADO
 * `/coach/dashboard?welcome=free&eid=…`.
 *
 * Hoy ese link lo emite el camino viejo (correos y sesiones abiertas antes del onboarding v2): el
 * coach nuevo pasa por «¿A qué te dedicas?» y cae en `/coach/guia`, que monta el mismo
 * `RegistrationMirror`. Sin esto, borrar el modal se habría llevado la conversión de quien todavía
 * llega por acá. `RegistrationMirror` limpia los params de la URL, así que no se re-emite.
 */
function LegacyRegistrationMirror() {
    const searchParams = useSearchParams()
    if (searchParams.get('welcome') !== 'free') return null
    const eid = searchParams.get('eid')
    if (eid == null || !REGISTRATION_EID_PATTERN.test(eid)) return null
    return <RegistrationMirror eid={eid} />
}

/**
 * Tile de marca del header móvil — espejo del avatar de cuenta del topbar desktop
 * (CoachTopBar): si el coach tiene logo, tile circular con `object-contain` sobre fondo
 * (blanco en light / superficie hundida en dark); si no, cae a las iniciales con anillo sport.
 * Tamaño `md` (40px) para igualar la huella del avatar previo del header.
 */
function HeaderBrandTile({
    logoUrl,
    logoDarkUrl,
    name,
}: {
    logoUrl?: string | null
    logoDarkUrl?: string | null
    name: string
}) {
    // Contrato compartido con el topbar/sidebar: logo custom cuando corresponde y EVA cuando
    // el white-label no está disponible. El fallback conserva el anillo sport del header.
    return (
        <CoachBrandAvatar
            name={name}
            logoUrl={logoUrl}
            logoDarkUrl={logoDarkUrl}
            size="md"
            fallback={<EvaBrandFallback size="md" className="ring-2 ring-[var(--sport-500)]/40" />}
        />
    )
}

function FreeTierBanner({ activeClients, maxClients }: { activeClients: number; maxClients: number }) {
    // Cupo REAL del coach (lo resuelve el shell), no el catálogo de venta: un free anterior al
    // corte del 18-08 conserva sus 3 y el banner mostraba 2 — contradecía al gate que lo deja
    // crear el tercero.
    const max = maxClients
    // `activeClients` = alumnos activos reales (excluye archivados); la barra se topa en 100%.
    const pct = Math.round((Math.min(activeClients, max) / max) * 100)
    const over = activeClients > max
    const full = activeClients >= max

    return (
        <div
            className={cn(
                'mt-3 flex items-center justify-between gap-4 rounded-card border px-4 py-3',
                over
                    ? 'border-[var(--danger-500)]/30 bg-[var(--danger-100)]'
                    : full
                      ? 'border-[var(--warning-500)]/30 bg-[var(--warning-100)]'
                      : 'border-border-subtle bg-surface-card'
            )}
        >
            <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--text-strong)]">
                    {activeClients === 0
                        ? `Tu plan gratis incluye ${studentCountLabel(max)}`
                        : over
                          ? `${activeClients} de ${studentCountLabel(max)} · ${activeClients - max} sobre el límite`
                          : `${activeClients} de ${studentCountLabel(max)} · Plan gratuito`}
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-[var(--track)]">
                    <div
                        className={cn(
                            'h-full rounded-pill transition-all',
                            over
                                ? 'bg-[var(--danger-500)]'
                                : full
                                  ? 'bg-[var(--warning-500)]'
                                  : 'bg-[var(--success-500)]'
                        )}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
            <Link
                href="/coach/subscription"
                className="shrink-0 text-xs font-bold text-sport-500 hover:underline"
            >
                {full ? 'Expandir límite →' : 'Ver planes →'}
            </Link>
        </div>
    )
}

function TeamsBridgeBanner({ totalClients, maxClients }: { totalClients: number; maxClients: number }) {
    // MISMO cupo real que dispara el banner (~80% de este número): así el porcentaje y el copy
    // nunca se contradicen con el umbral («80/60 · 100%» era el síntoma del techo hardcodeado).
    const max = maxClients
    const pct = Math.round((Math.min(totalClients, max) / max) * 100)

    return (
        <div className="mt-3 flex items-center justify-between gap-4 rounded-card border border-[var(--success-500)]/30 bg-[var(--success-100)] px-4 py-3">
            <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--text-strong)]">
                    {totalClients}/{max} alumnos · {pct}% de tu plan Elite
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {/* `max` = cupo real de ESTE coach en vez de un número a mano: el corte hacia
                        Teams ES su techo (60 con el catálogo nuevo, 100 si viene grandfathered). */}
                    ¿Más de {max} alumnos o trabajas con otros profesionales? Conoce EVA Teams
                </p>
            </div>
            <a
                href="mailto:contacto@eva-app.cl?subject=Quiero%20conocer%20EVA%20Teams"
                className="shrink-0 text-xs font-bold text-[var(--success-600)] hover:underline"
            >
                Conversemos →
            </a>
        </div>
    )
}
