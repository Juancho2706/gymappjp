'use client'

import { useActionState, useState, use } from 'react'
import { useFormStatus } from 'react-dom'
import { Lock, Loader2, ShieldCheck, Check, Circle } from 'lucide-react'
import { changePasswordAction, type ChangePasswordState } from '../login/_actions/login.actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordVisibilityToggle } from '@/components/auth/PasswordVisibilityToggle'

const initialState: ChangePasswordState = {}

interface Props {
    params: Promise<{ coach_slug: string }>
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending || disabled}
            className="w-full h-12 rounded-control text-base font-bold tracking-[-0.01em] disabled:opacity-60 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: 'var(--theme-primary, #007AFF)', color: 'var(--primary-foreground, #ffffff)' }}
        >
            {pending ? (
                <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                </span>
            ) : (
                'Guardar nueva contraseña'
            )}
        </button>
    )
}

export default function ChangePasswordPage({ params }: Props) {
    const { coach_slug } = use(params)
    const [state, formAction] = useActionState(changePasswordAction, initialState)

    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    // Reglas reactivas (espejo del kit flow.jsx › AccesoEstados state 'contrasena').
    // El gate del botón usa SOLO las que el server valida (>= 8 chars + coinciden); "1 número" y
    // "1 mayúscula" son pistas de fuerza (ayudan a pasar la protección de contraseñas filtradas de
    // Supabase) pero no bloquean, para no prometer de más respecto al ChangePasswordSchema.
    const rules: { label: string; ok: boolean; gates: boolean }[] = [
        { label: '8+ caracteres', ok: password.length >= 8, gates: true },
        { label: '1 número', ok: /\d/.test(password), gates: false },
        { label: '1 mayúscula', ok: /[A-Z]/.test(password), gates: false },
        { label: 'Coinciden', ok: password.length > 0 && password === confirm, gates: true },
    ]
    const canSubmit = rules.filter((r) => r.gates).every((r) => r.ok)

    return (
        <div className="min-h-dvh flex items-center justify-center p-4 pt-safe bg-background">
            <div className="w-full max-w-md animate-slide-up">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-card bg-theme-subtle border border-theme mb-4">
                        <ShieldCheck className="w-8 h-8 text-theme" />
                    </div>
                    <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-text-strong">
                        Crea tu contraseña
                    </h1>
                    <p className="mt-2 text-text-muted text-sm max-w-xs mx-auto">
                        Es tu primer acceso. Por seguridad, debes crear una contraseña propia.
                    </p>
                </div>

                <div className="bg-surface-card border border-border-subtle rounded-card p-8 shadow-[var(--shadow-lg)]">
                    <form action={formAction} className="space-y-5">
                        <input type="hidden" name="coach_slug" value={coach_slug} />

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-text-strong text-[13px] font-semibold">
                                Nueva contraseña
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                                <Input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Mínimo 8 caracteres"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 pr-12 border-border-default focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)]"
                                />
                                <PasswordVisibilityToggle
                                    visible={showPassword}
                                    onToggle={() => setShowPassword((v) => !v)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm_password" className="text-text-strong text-[13px] font-semibold">
                                Confirmar contraseña
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                                <Input
                                    id="confirm_password"
                                    name="confirm_password"
                                    type={showConfirm ? 'text' : 'password'}
                                    placeholder="Repite tu contraseña"
                                    required
                                    autoComplete="new-password"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    className="pl-10 pr-12 border-border-default focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)]"
                                />
                                <PasswordVisibilityToggle
                                    visible={showConfirm}
                                    onToggle={() => setShowConfirm((v) => !v)}
                                />
                            </div>
                        </div>

                        {/* Chips reactivos de reglas — viran a verde a medida que se cumplen. */}
                        <div className="flex flex-wrap gap-2">
                            {rules.map((r) => (
                                <span
                                    key={r.label}
                                    className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill text-[11.5px] font-bold transition-colors"
                                    style={
                                        r.ok
                                            ? { background: 'var(--success-100)', color: 'var(--success-700)' }
                                            : { background: 'var(--surface-sunken)', color: 'var(--text-subtle)' }
                                    }
                                >
                                    {r.ok ? <Check className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                                    {r.label}
                                </span>
                            ))}
                        </div>

                        {state?.error && (
                            <div className="animate-fade-in rounded-control border border-transparent bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                                {state.error}
                            </div>
                        )}

                        <div className="pt-2">
                            <SubmitButton disabled={!canSubmit} />
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
