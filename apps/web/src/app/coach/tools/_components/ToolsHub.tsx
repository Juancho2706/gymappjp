'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Apple,
    ArrowRight,
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
    UserRound,
    type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { ADDON_CONFIG } from '@/lib/constants'
import type { EnabledModules, ModuleKey } from '@/services/entitlements.service'
import type { ToolsHubClient } from '../_data/tools.queries'

type ToolDef = {
    key: ModuleKey
    icon: LucideIcon
    label: string
    value: string
    scope: 'student' | 'plan'
    href?: string
    picker?: boolean
}

// Herramientas por-alumno (kit: scope 'student') — el orden espeja el catálogo del kit.
const TOOLS: ToolDef[] = [
    {
        key: 'cardio',
        icon: HeartPulse,
        label: ADDON_CONFIG.cardio.label,
        value: 'Zonas de FC personalizadas, calculadora de pace y plantillas de intervalos.',
        scope: 'student',
        href: '/coach/cardio',
    },
    {
        key: 'movement_assessment',
        icon: PersonStanding,
        label: ADDON_CONFIG.movement_assessment.label,
        value: 'Screening de 7 patrones con semáforo de prioridad y evolución.',
        scope: 'student',
        href: '/coach/movement',
    },
    {
        key: 'body_composition',
        icon: Ruler,
        label: ADDON_CONFIG.body_composition.label,
        value: 'Bioimpedancia y antropometría ISAK con tendencia por método.',
        scope: 'student',
        picker: true,
    },
]

// Capa del plan — intercambios NO es herramienta del launcher; vive en el plan (kit).
const PLAN_TOOL: ToolDef = {
    key: 'nutrition_exchanges',
    icon: Apple,
    label: ADDON_CONFIG.nutrition_exchanges.label,
    value: 'Porciones e intercambios, micronutrientes avanzados y PDF con tu marca, dentro del plan.',
    scope: 'plan',
    href: '/coach/nutrition-plans',
}

const CTA_SPORT =
    'flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] px-[18px] text-[15px] font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all hover:opacity-90 active:scale-[0.97]'
const CTA_SECONDARY =
    'flex min-h-12 w-full items-center justify-center gap-2 rounded-control border-[1.5px] border-default bg-surface-card px-[18px] text-[15px] font-bold text-strong transition-colors hover:bg-surface-sunken active:scale-[0.97]'

function fmtClp(n: number) {
    return '$' + n.toLocaleString('es-CL')
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="pt-1 font-display text-[17px] font-extrabold tracking-[-0.02em] text-strong">
            {children}
        </h2>
    )
}

/** Tarjeta de módulo en el hub — alcance + estado + acción según entitlement (kit ModuleHubCard). */
function ModuleHubCard({
    tool,
    active,
    managed,
    onUse,
}: {
    tool: ToolDef
    active: boolean
    managed: boolean
    onUse?: () => void
}) {
    const Icon = tool.icon
    const isPlan = tool.scope === 'plan'
    return (
        <Card padding="md" className="gap-[13px]">
            <div className="flex items-start gap-[13px]">
                <span
                    className={cn(
                        'flex size-12 shrink-0 items-center justify-center rounded-[14px]',
                        active ? 'bg-sport-100 text-sport-600' : 'bg-surface-sunken text-subtle'
                    )}
                >
                    <Icon className="size-[23px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-display text-[16.5px] font-extrabold tracking-[-0.01em] text-strong">
                        {tool.label}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{tool.value}</p>
                </div>
            </div>

            {/* Alcance + estado (honestidad de alcance: el coach sabe qué hace antes de entrar) */}
            <div className="flex flex-wrap items-center gap-[7px]">
                <span className="inline-flex h-6 items-center gap-[5px] rounded-pill bg-surface-sunken px-[9px] text-[11px] font-bold text-muted">
                    {isPlan ? <ClipboardList className="size-3" aria-hidden /> : <UserRound className="size-3" aria-hidden />}
                    {isPlan ? 'Se configura en el plan' : 'Se usa con un alumno'}
                </span>
                {active ? (
                    <Badge tone="success" variant="soft" size="sm" dot>
                        Activo
                    </Badge>
                ) : (
                    <Badge tone="neutral" variant="soft" size="sm">
                        De pago
                    </Badge>
                )}
            </div>

            {/* Acción primaria según estado */}
            {active ? (
                tool.picker ? (
                    <button type="button" onClick={onUse} className={CTA_SPORT}>
                        <CirclePlay className="size-[18px]" aria-hidden />
                        Usar
                    </button>
                ) : (
                    <Link href={tool.href ?? '/coach/settings/modules'} className={CTA_SPORT}>
                        {isPlan ? (
                            <ArrowRight className="size-[18px]" aria-hidden />
                        ) : (
                            <CirclePlay className="size-[18px]" aria-hidden />
                        )}
                        {isPlan ? 'Abrir en un plan' : 'Usar'}
                    </Link>
                )
            ) : managed ? (
                <div className="flex items-center gap-2 rounded-control bg-surface-sunken px-3.5 py-[11px] text-muted">
                    <Lock className="size-[15px] shrink-0 text-subtle" aria-hidden />
                    <span className="text-[12.5px] font-semibold leading-snug">Pídelo al owner de tu equipo</span>
                </div>
            ) : (
                <Link href="/coach/settings/modules" className={CTA_SECONDARY}>
                    <Lock className="size-4" aria-hidden />
                    Desbloquear · {fmtClp(ADDON_CONFIG[tool.key].priceClpMensual)}/mes
                </Link>
            )}
        </Card>
    )
}

function subscribePickerMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 760px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}

/** matchMedia md-up (mismo patrón que Asignar en Programas): desktop → Dialog, móvil → bottom-sheet. */
function useIsDesktopMd() {
    return useSyncExternalStore(
        subscribePickerMd,
        () => window.matchMedia('(min-width: 760px)').matches,
        () => true
    )
}

/** Selector de alumno SINGLE para Composición (los módulos son captura 1-a-1). */
function PickerBody({
    clients,
    onPick,
}: {
    clients: ToolsHubClient[]
    onPick: (id: string) => void
}) {
    const [q, setQ] = useState('')
    const list = useMemo(
        () =>
            clients.filter((c) =>
                (c.full_name ?? '').toLowerCase().includes(q.trim().toLowerCase())
            ),
        [clients, q]
    )
    return (
        <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-[11px] pb-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-sport-100 text-sport-600">
                    <Ruler className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-extrabold text-strong">Elegí un alumno</p>
                    <p className="text-[12.5px] text-muted">Composición corporal · se mide a una persona a la vez</p>
                </div>
            </div>
            <div className="mb-2.5">
                <Input
                    iconLeft={<Search aria-hidden />}
                    placeholder="Buscar alumno…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
            </div>
            <div className="-mx-1 flex max-h-[52vh] flex-col overflow-y-auto overscroll-contain">
                {list.length === 0 && (
                    <p className="py-7 text-center text-[13px] text-subtle">Sin resultados</p>
                )}
                {list.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => onPick(c.id)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 py-[11px] text-left transition-colors hover:bg-surface-sunken active:scale-[0.99]"
                    >
                        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--ink-900)] font-display text-sm font-extrabold text-[var(--sport-400)]">
                            {(c.full_name ?? '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-strong">
                            {c.full_name ?? 'Alumno'}
                        </span>
                        <ChevronRight className="size-[17px] shrink-0 text-[var(--ink-300)]" aria-hidden />
                    </button>
                ))}
            </div>
        </div>
    )
}

function StudentPicker({
    open,
    clients,
    onOpenChange,
    onPick,
}: {
    open: boolean
    clients: ToolsHubClient[]
    onOpenChange: (open: boolean) => void
    onPick: (id: string) => void
}) {
    const isDesktop = useIsDesktopMd()
    const description = 'Elegí a quién medir — la captura es 1-a-1.'

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[min(88dvh,88svh)] overflow-y-auto overscroll-contain border-subtle bg-surface-card text-body sm:max-w-[440px]">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Elegí un alumno</DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
                    <PickerBody clients={clients} onPick={onPick} />
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                showCloseButton={false}
                className="max-h-[min(88dvh,88svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
            >
                <div className="flex max-h-[min(88dvh,88svh)] flex-col overflow-y-auto overscroll-contain px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                    <div
                        className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]"
                        aria-hidden="true"
                    />
                    <SheetHeader className="border-0 bg-transparent p-0">
                        <SheetTitle className="sr-only">Elegí un alumno</SheetTitle>
                        <SheetDescription className="sr-only">{description}</SheetDescription>
                    </SheetHeader>
                    <PickerBody clients={clients} onPick={onPick} />
                </div>
            </SheetContent>
        </Sheet>
    )
}

/**
 * Hub / launcher de módulos "Herramientas" (kit ModulesHub). Activos arriba con CTA Usar,
 * capa del plan aparte, "Descubre más" con upsell, y empty-state que VENDE cuando no hay
 * nada comprado (el catálogo bloqueado no se esconde).
 */
export function ToolsHub({
    managed,
    modules,
    clients,
}: {
    managed: boolean
    modules: EnabledModules
    clients: ToolsHubClient[]
}) {
    const router = useRouter()
    const [pickerOpen, setPickerOpen] = useState(false)

    const activeTools = TOOLS.filter((t) => modules[t.key] === true)
    const lockedTools = TOOLS.filter((t) => modules[t.key] !== true)
    const planActive = modules[PLAN_TOOL.key] === true
    const anyActive = activeTools.length > 0 || planActive

    return (
        <div className="space-y-4">
            <header className="space-y-1.5">
                <h1 className="flex items-center gap-2 font-display text-xl font-extrabold tracking-[-0.02em] text-strong">
                    <span className="inline-flex size-9 items-center justify-center rounded-control bg-sport-100 text-sport-600">
                        <LayoutGrid className="size-5" aria-hidden />
                    </span>
                    Herramientas
                </h1>
                <p className="text-[12.5px] text-muted">{anyActive ? 'Tus módulos' : 'Módulos'}</p>
            </header>

            {!anyActive ? (
                <>
                    {/* Estado vacío que VENDE — nada comprado (no se esconde el catálogo) */}
                    <Card variant="inverse" padding="lg" className="items-center gap-0 text-center">
                        <span className="mb-3.5 flex size-[60px] items-center justify-center rounded-[18px] bg-[color-mix(in_oklab,var(--sport-500)_18%,transparent)] text-[var(--sport-400)]">
                            <LayoutGrid className="size-7" aria-hidden />
                        </span>
                        <h2 className="font-display text-[22px] font-black tracking-[-0.02em] text-on-dark">
                            Potenciá tu evaluación
                        </h2>
                        <p className="mx-auto mt-2 max-w-[290px] text-[13.5px] leading-relaxed text-on-dark-muted">
                            Cardio con zonas, screening de movimiento y composición corporal — herramientas
                            profesionales por alumno.
                        </p>
                        {!managed ? (
                            <Link
                                href="/coach/settings/modules"
                                className={cn(CTA_SPORT, 'mt-[18px] min-h-14 text-[17px]')}
                            >
                                Ver planes y módulos
                                <ArrowRight className="size-5" aria-hidden />
                            </Link>
                        ) : (
                            <p className="mt-4 text-[12.5px] font-semibold text-on-dark-muted">
                                Pedile al owner de tu equipo que active los módulos.
                            </p>
                        )}
                    </Card>
                    <SectionTitle>Lo que podés desbloquear</SectionTitle>
                    <div className="flex flex-col gap-3">
                        {[...TOOLS, PLAN_TOOL].map((t) => (
                            <ModuleHubCard key={t.key} tool={t} active={false} managed={managed} />
                        ))}
                    </div>
                </>
            ) : (
                <>
                    {/* Comprar ≠ usar — recordatorio sutil */}
                    <div className="flex items-center gap-[9px] rounded-control bg-surface-sunken px-[13px] py-2.5">
                        <Info className="size-[15px] shrink-0 text-subtle" aria-hidden />
                        <p className="flex-1 text-xs leading-snug text-muted">
                            Elegí el módulo y después el alumno. Se mide a una persona a la vez.
                        </p>
                    </div>

                    {/* Activos arriba */}
                    {activeTools.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {activeTools.map((t) => (
                                <ModuleHubCard
                                    key={t.key}
                                    tool={t}
                                    active
                                    managed={managed}
                                    onUse={t.picker ? () => setPickerOpen(true) : undefined}
                                />
                            ))}
                        </div>
                    )}

                    {/* Capa del plan — intercambios vive en el plan, no en el launcher */}
                    {planActive && (
                        <>
                            <SectionTitle>En el plan de nutrición</SectionTitle>
                            <ModuleHubCard tool={PLAN_TOOL} active managed={managed} />
                        </>
                    )}

                    {/* Descubre más — bloqueados con upsell */}
                    {(lockedTools.length > 0 || !planActive) && (
                        <>
                            <SectionTitle>Descubre más</SectionTitle>
                            <div className="flex flex-col gap-3">
                                {lockedTools.map((t) => (
                                    <ModuleHubCard key={t.key} tool={t} active={false} managed={managed} />
                                ))}
                                {!planActive && (
                                    <ModuleHubCard tool={PLAN_TOOL} active={false} managed={managed} />
                                )}
                            </div>
                        </>
                    )}
                </>
            )}

            <StudentPicker
                open={pickerOpen}
                clients={clients}
                onOpenChange={setPickerOpen}
                onPick={(id) => {
                    setPickerOpen(false)
                    router.push(`/coach/clients/${id}/bodycomp`)
                }}
            />
        </div>
    )
}
