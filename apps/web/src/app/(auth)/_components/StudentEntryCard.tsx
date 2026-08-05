'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

const CODE_RE = /^[A-Z0-9]{4,8}$/

/**
 * Salida para alumnos en la zona (auth) raíz, que es 100% mundo coach: el acceso del alumno
 * es el link /c/<slug|código> de su coach. Sin esta tarjeta, un alumno sin link no tiene
 * ningún camino propio y termina en el registro de COACH (caso real 2026-08-05: alumna
 * eliminada creó una cuenta coach free por accidente intentando "recuperar acceso").
 * /c/<código> ya resuelve en el proxy igual que el slug — aquí solo navegamos.
 */
export function StudentEntryCard() {
    const router = useRouter()
    const [code, setCode] = useState('')
    const normalized = code.trim().toUpperCase()
    const valid = CODE_RE.test(normalized)

    return (
        <div className="mt-6 rounded-[var(--radius-md)] border border-border-subtle bg-surface-sunken px-4 py-4">
            <p className="text-[13.5px] font-bold text-text-strong">¿Eres alumno?</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">
                Tu acceso es el link de tu coach — pídeselo si no lo tienes. Si conoces su código, entra aquí:
            </p>
            <form
                className="mt-2.5 flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    if (valid) router.push(`/c/${normalized}`)
                }}
            >
                <input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="CÓDIGO"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={8}
                    aria-label="Código de tu coach"
                    className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border-subtle bg-transparent px-3 text-center text-sm font-bold tracking-[0.18em] text-text-strong placeholder:font-medium placeholder:tracking-normal placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                />
                <button
                    type="submit"
                    disabled={!valid}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--cta-fill)] px-3.5 text-sm font-bold text-[var(--text-on-sport)] transition-opacity disabled:opacity-40"
                >
                    Ir
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
            </form>
        </div>
    )
}
