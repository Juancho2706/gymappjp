'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isValidInviteCode } from '@/lib/coach/invite-code'
import { INVITE_TINT_CLASS, InviteStudentSheet, copyToClipboard, useCopiedFlag } from './InviteStudentSheet'

interface Props {
    inviteCode?: string | null
    /** 'mobile' = pastilla de 40px ancho completo · 'desktop' = control de 48px de la fila del bento. */
    variant?: 'mobile' | 'desktop'
    className?: string
}

export function InviteCodePill({ inviteCode, variant = 'mobile', className }: Props) {
    const [open, setOpen] = useState(false)
    const [copied, setCopied] = useCopiedFlag()

    // Coach recién creado: el layout de /coach todavía no le generó el código. No pintamos pastilla
    // vacía ni placeholder — el bloque simplemente no existe hasta que haya un código real.
    if (!isValidInviteCode(inviteCode)) return null

    const code = inviteCode.trim()
    const isDesktop = variant === 'desktop'

    const copyCode = async () => {
        // Solo el código: el link vive en la hoja, y pegar una URL cuando el coach pidió el código
        // rompe el flujo de dictárselo al alumno.
        if (await copyToClipboard(code)) setCopied(true)
    }

    return (
        <>
            <div
                className={cn(
                    'flex items-center gap-[10px] border',
                    INVITE_TINT_CLASS,
                    isDesktop
                        ? 'h-12 rounded-control border-[1.5px] pl-[15px] pr-[6px]'
                        : 'h-11 w-full rounded-pill pl-[13px] pr-[6px]',
                    className
                )}
            >
                {/* Hermanos, NUNCA anidados: un <button> dentro de otro es HTML inválido. */}
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Invitar alumno"
                    className={cn(
                        'flex h-full min-w-0 flex-1 items-center gap-[10px] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                        isDesktop ? 'rounded-control' : 'rounded-pill'
                    )}
                >
                    {/* En desktop la etiqueta se acorta a "CÓDIGO": la fila del bento no da el ancho. */}
                    <span className="shrink-0 text-[10.5px] font-extrabold uppercase leading-none tracking-[0.06em] text-[var(--theme-primary,var(--sport-500))]">
                        {isDesktop ? 'CÓDIGO' : 'TU CÓDIGO'}
                    </span>
                    <span
                        className={cn(
                            'eva-mono truncate text-[15px] font-extrabold leading-none text-strong',
                            isDesktop ? 'tracking-[0.18em]' : 'tracking-[0.2em]'
                        )}
                    >
                        {code}
                    </span>
                </button>

                {isDesktop ? (
                    <button
                        type="button"
                        onClick={copyCode}
                        aria-label="Copiar tu código de invitación"
                        className="eva-press flex size-9 shrink-0 items-center justify-center rounded-[10px] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        style={{
                            color: copied ? 'var(--success-700)' : 'var(--theme-primary, var(--sport-500))',
                        }}
                    >
                        {copied ? (
                            <Check className="size-4 shrink-0" strokeWidth={2.1} />
                        ) : (
                            <Copy className="size-4 shrink-0" strokeWidth={2.1} />
                        )}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={copyCode}
                        aria-label="Copiar tu código de invitación"
                        /* El chip se ve de 28px, pero el ::after lo estira a 44px de alto tocable:
                           el dedo no debe fallar por un target de 28px. */
                        className="eva-press relative inline-flex h-7 shrink-0 items-center gap-[6px] rounded-pill px-[11px] text-[12.5px] font-extrabold leading-none outline-none after:absolute after:inset-x-0 after:top-1/2 after:h-full after:-translate-y-1/2 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        style={
                            copied
                                ? { background: 'var(--success-100)', color: 'var(--success-700)' }
                                : {
                                      background: 'var(--theme-primary, var(--sport-500))',
                                      color: 'var(--text-on-sport)',
                                  }
                        }
                    >
                        {copied ? (
                            <Check className="size-[14px] shrink-0" strokeWidth={2.1} />
                        ) : (
                            <Copy className="size-[14px] shrink-0" strokeWidth={2.1} />
                        )}
                        {copied ? 'Copiado' : 'Copiar'}
                    </button>
                )}

                <span className="sr-only" aria-live="polite">
                    {copied ? 'Código copiado' : ''}
                </span>
            </div>

            <InviteStudentSheet open={open} onOpenChange={setOpen} inviteCode={code} />
        </>
    )
}
