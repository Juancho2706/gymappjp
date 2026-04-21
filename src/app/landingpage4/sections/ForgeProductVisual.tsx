'use client'

import { Dumbbell, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ForgeProductVisual } from '../forge-product-copy'
import { DEMO_BRAND, DEMO_CLIENT_ROWS } from '../_demos/forge-demo-mocks'

function MockChrome({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="forge-brutal-shadow overflow-hidden rounded-xl border-2 border-[var(--forge-ink)] bg-[var(--forge-surface)] shadow-[5px_5px_0_var(--forge-ink)]">
            <div className="flex items-center gap-2 border-b border-[var(--forge-border)] bg-[var(--forge-surface-alt)] px-2 py-1.5">
                <span className="flex gap-1" aria-hidden>
                    <span className="size-1.5 rounded-full bg-[var(--forge-border-strong)]" />
                    <span className="size-1.5 rounded-full bg-[var(--forge-border-strong)]" />
                    <span className="size-1.5 rounded-full bg-[var(--forge-border-strong)]" />
                </span>
                <p className="forge-font-mono flex-1 truncate text-center text-[8px] font-semibold uppercase tracking-widest text-[var(--forge-muted)]">
                    {title}
                </p>
            </div>
            <div className="p-2 sm:p-3">{children}</div>
        </div>
    )
}

function MockBuilder() {
    const days = ['L', 'M', 'X', 'J', 'V'] as const
    return (
        <MockChrome title="plan.eva · semana 5">
            <div className="flex gap-1 overflow-x-auto pb-1">
                {days.map((d, i) => (
                    <button
                        key={d}
                        type="button"
                        disabled
                        className={cn(
                            'forge-font-mono min-w-[2rem] rounded-md border px-2 py-1 text-[9px] font-bold',
                            i === 1
                                ? 'border-[var(--forge-ink)] bg-[var(--forge-ink)] text-[var(--forge-bg)]'
                                : 'border-[var(--forge-border)] bg-[var(--forge-surface-alt)] text-[var(--forge-muted)]'
                        )}
                    >
                        {d}
                    </button>
                ))}
            </div>
            <div className="mt-2 space-y-2">
                {(
                    [
                        { n: 'Press banca', s: '4×8 · 90s', accent: false },
                        { n: 'Remo mancuerna', s: '3×10 · 75s', accent: true },
                    ] as const
                ).map((ex) => (
                    <div
                        key={ex.n}
                        className={cn(
                            'relative rounded-lg border border-[var(--forge-border)] bg-[var(--forge-bg)] py-2 ps-3 pe-2',
                            ex.accent ? 'border-[var(--forge-accent)]/40 bg-[var(--forge-accent-bg)]/40' : ''
                        )}
                    >
                        <div
                            className={cn(
                                'absolute bottom-2 left-0 top-2 w-[3px] rounded-r-sm',
                                ex.accent ? 'bg-[var(--forge-accent)]' : 'bg-[var(--forge-ink)]'
                            )}
                            aria-hidden
                        />
                        <div className="flex items-center justify-between gap-2 ps-1">
                            <Dumbbell className="size-3.5 shrink-0 text-[var(--forge-accent)]" aria-hidden />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-[var(--forge-ink)]">{ex.n}</p>
                                <p className="forge-font-mono text-[8px] text-[var(--forge-muted)]">{ex.s}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </MockChrome>
    )
}

function MockNutrition() {
    return (
        <MockChrome title="nutrición · alumno">
            <div className="rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] p-2">
                <p className="forge-font-mono text-[8px] font-bold uppercase text-[var(--forge-muted)]">Plan activo</p>
                <p className="text-sm font-extrabold text-[var(--forge-ink)]">Volumen controlado</p>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                    [
                        { l: 'P', v: '165g', pct: 72 },
                        { l: 'C', v: '220g', pct: 55 },
                        { l: 'G', v: '62g', pct: 48 },
                    ] as const
                ).map((m) => (
                    <div key={m.l} className="rounded-md border border-[var(--forge-border)] bg-[var(--forge-bg)] p-1.5 text-center">
                        <p className="forge-font-mono text-[8px] text-[var(--forge-muted)]">{m.l}</p>
                        <p className="text-xs font-black text-[var(--forge-ink)]">{m.v}</p>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--forge-surface-alt)]">
                            <div className="h-full rounded-full bg-[var(--forge-accent)]" style={{ width: `${m.pct}%` }} />
                        </div>
                    </div>
                ))}
            </div>
            <p className="forge-font-mono mt-2 text-center text-[8px] text-[var(--forge-muted)]">Adherencia 30d · ejemplo 78%</p>
        </MockChrome>
    )
}

function MockClients() {
    return (
        <MockChrome title="clientes · directorio">
            <div className="overflow-hidden rounded-md border border-[var(--forge-border)]">
                <div className="forge-font-mono flex border-b border-[var(--forge-border)] bg-[var(--forge-surface-alt)] px-2 py-1 text-[7px] font-bold uppercase text-[var(--forge-muted)]">
                    <span className="flex-[2]">Alumno</span>
                    <span className="w-12 text-center">Adh.</span>
                    <span className="w-14 text-right">Atención</span>
                </div>
                {DEMO_CLIENT_ROWS.map((row) => (
                    <div key={row.name} className="flex items-center border-b border-[var(--forge-border)] px-2 py-1.5 text-[10px] last:border-b-0">
                        <div className="flex min-w-0 flex-[2] items-center gap-1.5">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] forge-font-mono text-[7px] font-bold">
                                {row.initials}
                            </span>
                            <span className="truncate font-medium text-[var(--forge-ink)]">{row.name}</span>
                        </div>
                        <span className="w-12 text-center font-bold">{row.adherence}%</span>
                        <span className="forge-font-mono w-14 text-right text-[8px]">
                            {row.attention === 'watch' ? (
                                <span className="rounded border border-[var(--forge-warning)]/40 bg-[var(--forge-warning)]/10 px-1 py-0.5 text-[var(--forge-warning)]">
                                    ver
                                </span>
                            ) : (
                                <span className="text-[var(--forge-success)]">ok</span>
                            )}
                        </span>
                    </div>
                ))}
            </div>
        </MockChrome>
    )
}

function MockBrand() {
    return (
        <MockChrome title="ajustes · mi marca">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex-1 space-y-2">
                    <label className="forge-font-mono text-[8px] font-bold uppercase text-[var(--forge-muted)]">Color primario</label>
                    <div className="flex items-center gap-2">
                        <span className="size-8 rounded-md border-2 border-[var(--forge-border)]" style={{ backgroundColor: DEMO_BRAND.hexColor }} />
                        <span className="forge-font-mono rounded border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] px-2 py-1 text-[10px]">
                            {DEMO_BRAND.hexColor}
                        </span>
                    </div>
                    <div>
                        <label className="forge-font-mono text-[8px] font-bold uppercase text-[var(--forge-muted)]">URL pública</label>
                        <p className="forge-font-mono mt-0.5 truncate text-[10px] text-[var(--forge-accent)]">eva.app/c/{DEMO_BRAND.slug}</p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg border border-[var(--forge-border)] bg-[var(--forge-bg)] p-3">
                    <Palette className="size-5 text-[var(--forge-muted)]" aria-hidden />
                    <div className="flex size-14 items-center justify-center rounded-lg border-2 border-dashed border-[var(--forge-border)] bg-[var(--forge-surface)]">
                        <span className="forge-font-mono text-[8px] font-bold text-[var(--forge-muted)]">LOGO</span>
                    </div>
                    <p className="forge-font-mono text-[7px] text-[var(--forge-muted)]">Preview</p>
                </div>
            </div>
        </MockChrome>
    )
}

export function ForgeProductVisual({ visual, className }: { visual: ForgeProductVisual; className?: string }) {
    return (
        <div className={cn('min-h-[200px]', className)} aria-hidden>
            {visual === 'builder' ? <MockBuilder /> : null}
            {visual === 'nutrition' ? <MockNutrition /> : null}
            {visual === 'clients' ? <MockClients /> : null}
            {visual === 'brand' ? <MockBrand /> : null}
        </div>
    )
}
