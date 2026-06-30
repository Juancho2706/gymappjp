'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Loader2, ArrowRight } from 'lucide-react'
import { clientLoginAction, type ClientLoginState } from './_actions/login.actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: ClientLoginState = {}

interface Props {
    coachSlug: string
    primaryColor: string
    brandName: string
    logoUrl: string | null
}

function SubmitButton({ primaryColor, brandName }: { primaryColor: string; brandName: string }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-control text-base font-bold tracking-[-0.01em] transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: primaryColor, color: 'var(--primary-foreground, #ffffff)' }}
        >
            {pending ? (
                <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ingresando...
                </>
            ) : (
                <>
                    Entrar a {brandName}
                    <ArrowRight className="h-4 w-4" />
                </>
            )}
        </button>
    )
}

export default function ClientLoginForm({ coachSlug, primaryColor, brandName, logoUrl }: Props) {
    const [state, formAction] = useActionState(clientLoginAction, initialState)
    const router = useRouter()

    useEffect(() => {
        if (state.success && state.redirectUrl) {
            // Store sticky branding for the "Intelligent Redirect"
            localStorage.setItem('last_coach_slug', coachSlug)
            localStorage.setItem('coach_brand_name', brandName)
            if (logoUrl) {
                localStorage.setItem('coach_logo_url', logoUrl)
            } else {
                localStorage.removeItem('coach_logo_url')
            }
            
            // Redirect to the appropriate page
            router.push(state.redirectUrl)
        }
    }, [state, coachSlug, brandName, logoUrl, router])

    return (
        <form action={formAction} className="space-y-[13px]">
                <input type="hidden" name="coach_slug" value={coachSlug} />

                <div className="space-y-2">
                    <Label htmlFor="client-email" className="text-text-strong text-[13px] font-semibold">
                        Email
                    </Label>
                    <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                        <Input
                            id="client-email"
                            name="email"
                            type="email"
                            placeholder="tu@email.com"
                            autoComplete="email"
                            required
                            className={cn(
                                'pl-10 border-border-default',
                                'focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)]'
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="client-password" className="text-text-strong text-[13px] font-semibold">
                            Contraseña
                        </Label>
                        <Link
                            href={`/forgot-password?coach_slug=${coachSlug}`}
                            className="text-xs font-semibold hover:underline"
                            style={{ color: primaryColor }}
                        >
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none z-10" />
                        <Input
                            id="client-password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                            className={cn(
                                'pl-10 border-border-default',
                                'focus-visible:border-[var(--theme-primary)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--theme-primary)_30%,transparent)]'
                            )}
                        />
                    </div>
                </div>

                {state?.error && (
                    <div className="animate-fade-in rounded-control border border-transparent bg-[var(--danger-100)] px-4 py-3 text-sm font-semibold text-[var(--danger-600)]">
                        {state.error}
                    </div>
                )}

                <div className="pt-2">
                    <SubmitButton primaryColor={primaryColor} brandName={brandName} />
                </div>
        </form>
    )
}
