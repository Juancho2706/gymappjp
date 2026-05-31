'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function MfaBanner({ orgSlug }: { orgSlug: string }) {
    const [mfaMissing, setMfaMissing] = useState(false)

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.mfa.listFactors().then(({ data }) => {
            const hasVerified = data?.totp?.some(f => f.status === 'verified')
            setMfaMissing(!hasVerified)
        }).catch(() => setMfaMissing(true))
    }, [])

    if (!mfaMissing) return null

    return (
        <div className="flex items-center gap-3 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-tight">
                <span className="font-semibold">Seguridad:</span> Tu cuenta no tiene 2FA activo.{' '}
                <Link
                    href={`/org/${orgSlug}/setup-mfa`}
                    className="underline hover:no-underline font-medium"
                >
                    Activar 2FA →
                </Link>
            </p>
        </div>
    )
}
