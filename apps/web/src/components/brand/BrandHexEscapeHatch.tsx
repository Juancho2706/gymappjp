'use client'

import { useState } from 'react'
import { ChevronDown, Pipette, ShieldCheck } from 'lucide-react'
import { sealPair } from '@eva/brand-kit'
import { cn } from '@/lib/utils'
import { generateBrandPalette, getContrastInfo } from '@/lib/color-utils'

/**
 * W-brand B3 — escape hatch «manual de marca» de los studios Team/Org.
 *
 * UN solo input de hex exacto: entra el primario del manual de marca del cliente y el MOTOR
 * deriva todo lo demás — rampa `generateBrandPalette`, par `sealPair` (fórmula D3.2) y el gate
 * WCAG del brand-kit como última palabra sobre contraste. Diferencia vs la rueda de julio: el
 * hex ya no sale crudo hacia acentos sueltos — entra un hex, sale una paleta curada.
 *
 * El componente NO persiste nada: al aplicar entrega `(hex, secundarioDerivado)` al caller
 * (el studio rellena sus columnas actuales y limpia los acentos sueltos legacy).
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/

type Appearance = 'app' | 'dark'

type Props = {
    /** Hex exacto vigente (grandfather) — precarga el input; null = sin color custom actual. */
    currentHex: string | null
    /** Aplica el hex: el caller recibe el primario normalizado y el par derivado vía sealPair. */
    onApply: (hex: string, derivedSecondary: string) => void
    disabled?: boolean
    appearance?: Appearance
}

/** Clases por apariencia (mismo criterio que ThemePresetGallery: Org vive en shell zinc oscuro). */
const AP: Record<Appearance, {
    trigger: string
    triggerTitle: string
    sub: string
    panel: string
    input: string
    apply: string
    chipLabel: string
    ok: string
}> = {
    app: {
        trigger: 'border-subtle',
        triggerTitle: 'text-strong',
        sub: 'text-muted',
        panel: '',
        input: 'h-[38px] w-full min-w-0 flex-1 rounded-sm border-[1.5px] border-default bg-surface-card px-3 font-mono text-[13.5px] font-semibold text-strong outline-none focus:border-strong disabled:opacity-50',
        apply: 'h-[38px] shrink-0 rounded-sm bg-[var(--surface-inverse)] px-4 text-[12.5px] font-bold text-on-dark disabled:opacity-50',
        chipLabel: 'text-subtle',
        ok: 'text-[var(--success-700)]',
    },
    dark: {
        trigger: 'border-zinc-800',
        triggerTitle: 'text-zinc-100',
        sub: 'text-zinc-500',
        panel: '',
        input: 'h-[38px] w-full min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 font-mono text-[13.5px] font-semibold text-zinc-100 outline-none focus:border-amber-300 disabled:opacity-50',
        apply: 'h-[38px] shrink-0 rounded-lg bg-amber-400 px-4 text-[12.5px] font-black text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50',
        chipLabel: 'text-zinc-500',
        ok: 'text-emerald-300',
    },
}

/** Normaliza la entrada del usuario a `#rrggbb` (tolera pegar sin `#`); null si no es hex. */
function normalizeHexInput(raw: string): string | null {
    const v = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`
    return HEX_RE.test(v) ? v : null
}

export function BrandHexEscapeHatch({ currentHex, onApply, disabled, appearance = 'app' }: Props) {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState(currentHex ?? '')
    const ap = AP[appearance]

    const normalized = normalizeHexInput(value)
    // Paleta derivada en vivo: el hex nunca viaja crudo — pasa por el motor completo.
    const derived = normalized
        ? {
            palette: generateBrandPalette(normalized),
            pair: sealPair({ brandColor: normalized, themePresetKey: null }),
            contrast: getContrastInfo(normalized),
        }
        : null

    return (
        <div className={cn('mt-3 overflow-hidden rounded-control border', ap.trigger)}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
            >
                <Pipette className={cn('h-[17px] w-[17px] shrink-0', ap.sub)} />
                <span className="min-w-0 flex-1">
                    <span className={cn('block text-[13.5px] font-bold', ap.triggerTitle)}>¿Tienes manual de marca?</span>
                    <span className={cn('block text-[11.5px]', ap.sub)}>Ingresa tu hex exacto — EVA deriva el resto</span>
                </span>
                <ChevronDown className={cn('h-[17px] w-[17px] shrink-0 transition-transform', ap.sub, open && 'rotate-180')} />
            </button>

            {open && (
                <div className="px-3.5 pb-4 pt-1">
                    <div className="flex items-center gap-2">
                        <input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            disabled={disabled}
                            maxLength={7}
                            placeholder="#0D9488"
                            aria-label="Hex exacto de tu manual de marca"
                            className={ap.input}
                        />
                        <button
                            type="button"
                            disabled={disabled || !derived}
                            onClick={() => {
                                if (!normalized || !derived) return
                                onApply(normalized, derived.pair.secondary)
                            }}
                            className={ap.apply}
                        >
                            Aplicar
                        </button>
                    </div>

                    {derived && (
                        <div className="mt-3">
                            {/* Paleta derivada visible: primario exacto + par sealPair + rampa del motor. */}
                            <div className={cn('mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em]', ap.chipLabel)}>
                                Paleta derivada
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {([
                                    ['Primario', derived.palette.primary],
                                    ['Par', derived.pair.secondary],
                                    ['Oscuro', derived.palette.primaryDark],
                                    ['Claro', derived.palette.primaryLight],
                                    ['Superficie', derived.palette.primarySurface],
                                ] as const).map(([label, hex]) => (
                                    <div key={label} className="flex flex-col items-center gap-1">
                                        <span
                                            className="h-8 w-11 rounded-[8px] border border-black/10"
                                            style={{ background: hex }}
                                            title={`${label} ${hex}`}
                                        />
                                        <span className={cn('text-[9.5px] font-semibold', ap.chipLabel)}>{label}</span>
                                    </div>
                                ))}
                            </div>
                            <p className={cn('mt-2 flex items-center gap-1.5 text-[11px] font-semibold', ap.ok)}>
                                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                                El gate WCAG ajusta el contraste automáticamente — nada queda ilegible.
                            </p>
                        </div>
                    )}
                    {!derived && value.trim() !== '' && (
                        <p className={cn('mt-2 text-[11px]', ap.sub)}>Formato: #RRGGBB (ej. #0D9488).</p>
                    )}
                </div>
            )}
        </div>
    )
}
