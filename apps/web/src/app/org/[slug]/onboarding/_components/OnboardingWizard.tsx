'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Users, UserCheck, GitBranch, Rocket, Palette } from 'lucide-react'
import { advanceOnboardingStep, updateOrgBrandingAction } from '../_actions/onboarding.actions'
import { inviteCoachAction } from '../../_actions/org.actions'

interface Props {
    orgSlug: string
    orgName: string
    currentStep: number
    primaryColor: string
    seatsIncluded: number
    stats: { activeCoaches: number; pendingInvites: number; totalClients: number }
}

const STEPS = [
    { icon: Palette, label: 'Branding' },
    { icon: Users, label: 'Coaches' },
    { icon: UserCheck, label: 'Clientes' },
    { icon: GitBranch, label: 'Asignaciones' },
    { icon: Rocket, label: 'Listo' },
]

export function OnboardingWizard({ orgSlug, orgName, currentStep, primaryColor, seatsIncluded, stats }: Props) {
    const router = useRouter()
    const [step, setStep] = useState(currentStep)
    const [pending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [color, setColor] = useState(primaryColor)
    const [name, setName] = useState(orgName)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<'coach' | 'org_admin'>('coach')

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
        <div className="space-y-6">
            {/* Step indicators */}
            <div className="flex items-center justify-center gap-1">
                {STEPS.map((s, i) => {
                    const done = i < step
                    const active = i === step
                    return (
                        <div key={i} className="flex items-center gap-1">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                                ${done ? 'bg-emerald-500 text-white' : active ? 'text-white' : 'bg-muted text-muted-foreground'}`}
                                style={active ? { backgroundColor: color } : undefined}
                            >
                                {done ? <Check className="w-4 h-4" /> : i + 1}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`w-6 h-0.5 ${i < step ? 'bg-emerald-500' : 'bg-border'}`} />
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                {/* Step 0 — Branding */}
                {step === 0 && (
                    <>
                        <div>
                            <h2 className="text-lg font-bold">Personaliza tu organización</h2>
                            <p className="text-sm text-muted-foreground mt-1">Nombre y color que verán tus coaches y alumnos</p>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">Nombre</label>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    maxLength={80}
                                    className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">Color primario</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={color}
                                        onChange={e => setColor(e.target.value)}
                                        className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5"
                                    />
                                    <span className="text-sm font-mono text-muted-foreground">{color}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={saveBranding}
                            disabled={pending || name.length < 2}
                            className="w-full h-10 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            style={{ backgroundColor: color }}
                        >
                            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Continuar →
                        </button>
                    </>
                )}

                {/* Step 1 — Invite coaches */}
                {step === 1 && (
                    <>
                        <div>
                            <h2 className="text-lg font-bold">Invita a tus coaches</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Tienes {seatsIncluded} seats. {stats.activeCoaches} activos, {stats.pendingInvites} pendientes.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    placeholder="coach@email.com"
                                    className="flex-1 h-9 px-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                                <select
                                    value={inviteRole}
                                    onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
                                    className="h-9 px-2 text-sm rounded-lg border border-border bg-background"
                                >
                                    <option value="coach">Coach</option>
                                    <option value="org_admin">Admin</option>
                                </select>
                                <button
                                    onClick={sendInvite}
                                    disabled={pending || !inviteEmail}
                                    className="px-3 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"
                                >
                                    {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Invitar'}
                                </button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Los coaches deben tener cuenta en EVA para recibir la invitación.</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => advance(2)}
                                disabled={pending}
                                className="flex-1 h-10 rounded-lg bg-secondary hover:bg-accent text-sm font-medium transition-colors"
                            >
                                Omitir por ahora
                            </button>
                            <button
                                onClick={() => advance(2)}
                                disabled={pending}
                                className="flex-1 h-10 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                            >
                                Siguiente →
                            </button>
                        </div>
                    </>
                )}

                {/* Step 2 — Import clients */}
                {step === 2 && (
                    <>
                        <div>
                            <h2 className="text-lg font-bold">Importa tus clientes</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {stats.totalClients > 0
                                    ? `${stats.totalClients} clientes en el pool.`
                                    : 'Agrega clientes desde el panel o importa más tarde.'}
                            </p>
                        </div>
                        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center space-y-2">
                            <p className="text-sm text-muted-foreground">Importación CSV disponible en el panel de Clientes</p>
                            <a
                                href={`/org/${orgSlug}/clients`}
                                className="text-xs text-violet-500 hover:underline"
                                target="_blank"
                            >
                                Ir al panel de clientes →
                            </a>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => advance(3)} disabled={pending} className="flex-1 h-10 rounded-lg bg-secondary hover:bg-accent text-sm font-medium">
                                Omitir
                            </button>
                            <button onClick={() => advance(3)} disabled={pending} className="flex-1 h-10 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold">
                                Siguiente →
                            </button>
                        </div>
                    </>
                )}

                {/* Step 3 — Assignments */}
                {step === 3 && (
                    <>
                        <div>
                            <h2 className="text-lg font-bold">Asigna clientes a coaches</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Puedes asignar desde el panel de Clientes en cualquier momento.
                            </p>
                        </div>
                        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-center">
                            <a href={`/org/${orgSlug}/clients`} className="text-xs text-violet-500 hover:underline" target="_blank">
                                Ir al panel de asignaciones →
                            </a>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => advance(4)} disabled={pending} className="flex-1 h-10 rounded-lg bg-secondary hover:bg-accent text-sm font-medium">
                                Omitir
                            </button>
                            <button onClick={() => advance(4)} disabled={pending} className="flex-1 h-10 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold">
                                Siguiente →
                            </button>
                        </div>
                    </>
                )}

                {/* Step 4 — Review & go live */}
                {step === 4 && (
                    <>
                        <div className="text-center space-y-2">
                            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                                <Rocket className="w-7 h-7 text-emerald-500" />
                            </div>
                            <h2 className="text-lg font-bold">¡Todo listo!</h2>
                            <p className="text-sm text-muted-foreground">
                                <strong>{name}</strong> está configurada.<br />
                                {stats.activeCoaches} coach{stats.activeCoaches !== 1 ? 'es' : ''} · {stats.totalClients} cliente{stats.totalClients !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <button
                            onClick={() => advance(5)}
                            disabled={pending}
                            className="w-full h-11 rounded-xl text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                            style={{ backgroundColor: color }}
                        >
                            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                            Ir al dashboard
                        </button>
                    </>
                )}

                {error && <p className="text-xs text-red-400 text-center">{error}</p>}
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
                Paso {step + 1} de {STEPS.length} · Puedes salir y continuar más tarde
            </p>
        </div>
    )
}
