'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowRight,
    Check,
    ClipboardCheck,
    Loader2,
    Palette,
    Rocket,
    Route,
    ShieldCheck,
    UserCheck,
    Users,
} from 'lucide-react'
import { advanceOnboardingStep, updateOrgBrandingAction } from '../_actions/onboarding.actions'
import { inviteCoachAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    orgName: string
    currentStep: number
    primaryColor: string
    seatsIncluded: number
    hasLogo: boolean
    stats: {
        activeCoaches: number
        pendingInvites: number
        totalClients: number
        assignedClients: number
        unassignedClients: number
    }
}

const STEPS = [
    { icon: Palette, label: 'Marca', route: 'brand' },
    { icon: Users, label: 'Coaches', route: 'coaches' },
    { icon: UserCheck, label: 'Alumnos', route: 'clients' },
    { icon: Route, label: 'Asignaciones', route: 'assignments' },
    { icon: Rocket, label: 'Launch', route: '' },
]

function percent(value: number, total: number) {
    if (total <= 0) return 0
    return Math.round((value / total) * 100)
}

export function OnboardingWizard({
    orgSlug,
    orgName,
    currentStep,
    primaryColor,
    seatsIncluded,
    hasLogo,
    stats,
}: Props) {
    const router = useRouter()
    const [step, setStep] = useState(Math.min(currentStep, STEPS.length - 1))
    const [pending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [color, setColor] = useState(primaryColor)
    const [name, setName] = useState(orgName)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<'coach' | 'org_admin'>('coach')

    const assignedRate = percent(stats.assignedClients, Math.max(1, stats.totalClients))
    const readinessItems = [
        { label: 'Marca reconocible', done: hasLogo || Boolean(color), detail: hasLogo ? 'Logo cargado' : 'Color definido' },
        { label: 'Primer coach activo', done: stats.activeCoaches > 0, detail: `${stats.activeCoaches}/${seatsIncluded} coaches` },
        { label: 'Pool de alumnos', done: stats.totalClients > 0, detail: `${stats.totalClients} alumnos` },
        { label: 'Asignacion inicial', done: stats.assignedClients > 0 && stats.unassignedClients === 0, detail: `${assignedRate}% asignados` },
    ]
    const readiness = percent(readinessItems.filter(item => item.done).length, readinessItems.length)

    const advance = (nextStep: number) => {
        setError(null)
        startTransition(async () => {
            const res = await advanceOnboardingStep(orgSlug, nextStep)
            if (res?.error) { setError(res.error); return }
            if (nextStep >= 5) { router.push(`/org/${orgSlug}`); return }
            setStep(nextStep)
        })
    }

    const saveBranding = () => {
        setError(null)
        startTransition(async () => {
            const fd = new FormData()
            fd.set('name', name)
            fd.set('primary_color', color)
            const res = await updateOrgBrandingAction(orgSlug, fd)
            if (res?.error) { setError(res.error); return }
            setStep(1)
        })
    }

    const sendInvite = () => {
        if (!inviteEmail) return
        setError(null)
        startTransition(async () => {
            const fd = new FormData()
            fd.set('email', inviteEmail)
            fd.set('role', inviteRole)
            const res = await inviteCoachAction(orgSlug, fd)
            if (res?.error) { setError(res.error); return }
            setInviteEmail('')
        })
    }

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 md:px-8 md:py-8 xl:grid-cols-[1fr_390px]">
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 md:p-7">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Implementation workspace
                        </span>
                        <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-400">
                            {readiness}% readiness
                        </span>
                    </div>

                    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_230px] lg:items-end">
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
                                Activar {orgName}
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Setup guiado para llegar a valor real: marca lista, coaches activos, alumnos cargados y asignaciones iniciales.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
                            <div className="flex items-end justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Readiness</p>
                                    <p className="mt-2 text-5xl font-black text-white">{readiness}</p>
                                </div>
                                <Rocket className="mb-2 h-7 w-7 text-emerald-300" aria-hidden="true" />
                            </div>
                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
                                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${readiness}%` }} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-7 grid gap-2 md:grid-cols-5">
                        {STEPS.map((item, index) => {
                            const done = index < step
                            const active = index === step
                            const Icon = item.icon
                            return (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => setStep(index)}
                                    className={`rounded-xl border p-3 text-left transition ${
                                        active
                                            ? 'border-emerald-400/40 bg-emerald-400/10'
                                            : done
                                                ? 'border-emerald-400/20 bg-zinc-950/80'
                                                : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <Icon className={active || done ? 'h-4 w-4 text-emerald-300' : 'h-4 w-4 text-zinc-500'} />
                                        {done && <Check className="h-4 w-4 text-emerald-300" />}
                                    </div>
                                    <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-zinc-100">{item.label}</p>
                                </button>
                            )
                        })}
                    </div>

                    <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                        {step === 0 && (
                            <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
                                <div className="space-y-4">
                                    <div>
                                        <h2 className="text-lg font-black text-white">Marca base</h2>
                                        <p className="mt-1 text-sm text-zinc-500">Define nombre y color. El logo avanzado se carga desde Brand Center.</p>
                                    </div>
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Nombre</span>
                                        <input
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            maxLength={80}
                                            className="mt-2 h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Color primario</span>
                                        <div className="mt-2 flex items-center gap-3">
                                            <input
                                                type="color"
                                                value={color}
                                                onChange={e => setColor(e.target.value)}
                                                className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 p-1"
                                            />
                                            <span className="font-mono text-sm text-zinc-400">{color}</span>
                                        </div>
                                    </label>
                                    <button
                                        onClick={saveBranding}
                                        disabled={pending || name.length < 2}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-50"
                                        style={{ backgroundColor: color }}
                                    >
                                        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Guardar y seguir
                                    </button>
                                </div>
                                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-black text-white" style={{ backgroundColor: color }}>
                                            {name.charAt(0).toUpperCase() || '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-white">{name || orgName}</p>
                                            <p className="text-xs text-zinc-500">Preview enterprise</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 1 && (
                            <div className="space-y-5">
                                <div>
                                    <h2 className="text-lg font-black text-white">Equipo inicial</h2>
                                    <p className="mt-1 text-sm text-zinc-500">{stats.activeCoaches} coaches activos, {stats.pendingInvites} pendientes, {seatsIncluded} seats disponibles.</p>
                                </div>
                                <div className="grid gap-2 md:grid-cols-[1fr_150px_auto]">
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={e => setInviteEmail(e.target.value)}
                                        placeholder="coach@email.com"
                                        className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
                                    />
                                    <select
                                        value={inviteRole}
                                        onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
                                        className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                                    >
                                        <option value="coach">Coach</option>
                                        <option value="org_admin">Admin</option>
                                    </select>
                                    <button
                                        onClick={sendInvite}
                                        disabled={pending || !inviteEmail}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-zinc-950 disabled:opacity-50"
                                    >
                                        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Vincular
                                    </button>
                                </div>
                                <StepActions orgSlug={orgSlug} step={step} pending={pending} advance={advance} />
                            </div>
                        )}

                        {step === 2 && (
                            <StepPanel
                                title="Pool de alumnos"
                                body={`${stats.totalClients} alumnos cargados. Para llegar a valor, carga aunque sea una muestra real y valida que tengan coach asignado.`}
                                href={`/org/${orgSlug}/clients`}
                                hrefLabel="Abrir alumnos"
                                step={step}
                                pending={pending}
                                advance={advance}
                                orgSlug={orgSlug}
                            />
                        )}

                        {step === 3 && (
                            <StepPanel
                                title="Asignacion inicial"
                                body={`${stats.assignedClients} asignados, ${stats.unassignedClients} sin coach. Antes de lanzar, evita que el owner vea alumnos sin responsable.`}
                                href={`/org/${orgSlug}/assignments`}
                                hrefLabel="Abrir asignaciones"
                                step={step}
                                pending={pending}
                                advance={advance}
                                orgSlug={orgSlug}
                            />
                        )}

                        {step === 4 && (
                            <div className="space-y-5 text-center">
                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                                    <Rocket className="h-8 w-8" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white">Launch review</h2>
                                    <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
                                        Si el readiness no esta perfecto igual puedes entrar al dashboard. Lo importante es saber que queda pendiente.
                                    </p>
                                </div>
                                <button
                                    onClick={() => advance(5)}
                                    disabled={pending}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-black text-zinc-950 disabled:opacity-50"
                                >
                                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                                    Ir al dashboard
                                </button>
                            </div>
                        )}

                        {error && <p className="mt-4 text-center text-xs font-semibold text-red-300">{error}</p>}
                    </div>
                </section>

                <aside className="space-y-5">
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Outcome checklist</h2>
                        </div>
                        <div className="mt-4 space-y-3">
                            {readinessItems.map(item => (
                                <div key={item.label} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                    <span className={item.done ? 'text-emerald-300' : 'text-zinc-600'}>
                                        <Check className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <p className="text-sm font-bold text-zinc-100">{item.label}</p>
                                        <p className="mt-0.5 text-xs text-zinc-500">{item.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                        <h2 className="text-lg font-black text-white">CSM notes</h2>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Sin herramientas pagas: usa esta pantalla como checklist vivo, agenda follow-up manual y valida un outcome de negocio antes de llamar el onboarding exitoso.
                        </p>
                    </section>
                </aside>
            </div>
        </div>
    )
}

function StepActions({
    orgSlug,
    step,
    pending,
    advance,
}: {
    orgSlug: string
    step: number
    pending: boolean
    advance: (nextStep: number) => void
}) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row">
            <Link
                href={`/org/${orgSlug}/${STEPS[step].route}`}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-bold text-zinc-200 hover:bg-zinc-900"
            >
                Abrir modulo
                <ArrowRight className="h-4 w-4" />
            </Link>
            <button
                onClick={() => advance(step + 1)}
                disabled={pending}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-zinc-950 disabled:opacity-50"
            >
                Siguiente
                <ArrowRight className="h-4 w-4" />
            </button>
        </div>
    )
}

function StepPanel({
    title,
    body,
    href,
    hrefLabel,
    step,
    pending,
    advance,
    orgSlug,
}: {
    title: string
    body: string
    href: string
    hrefLabel: string
    step: number
    pending: boolean
    advance: (nextStep: number) => void
    orgSlug: string
}) {
    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-black text-white">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">{body}</p>
            </div>
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900 p-4">
                <Link href={href} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 hover:text-emerald-200">
                    {hrefLabel}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
            <StepActions orgSlug={orgSlug} step={step} pending={pending} advance={advance} />
        </div>
    )
}
