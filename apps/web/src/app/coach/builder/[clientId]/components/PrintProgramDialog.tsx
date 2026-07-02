'use client'

import { useRef } from 'react'
import { X, Printer } from 'lucide-react'
import { getMuscleColor } from '../muscle-colors'
import { groupContiguousSupersetRuns } from '@/lib/workout-block-grouping'
import type { DayState, BuilderBlock } from '../types'

interface PrintProgramDialogProps {
    open: boolean
    onClose: () => void
    programName: string
    clientName?: string
    coachName?: string
    weeksToRepeat: number
    days: DayState[]
    daysB?: DayState[]
    isABMode?: boolean
}

const DAYS_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const PRINT_STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #111; background: #fff; padding: 20px 28px;
}
.doc-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 24px; padding-bottom: 14px; border-bottom: 3px solid #111;
}
.doc-title { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em; color: #111; }
.doc-meta { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 5px; }
.coach-badge {
    font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em;
    color: #444; background: #f0f0f0; padding: 3px 8px; border-radius: 5px; display: inline-block;
}
.variant-header {
    display: flex; align-items: center; gap: 10px; margin: 18px 0 12px;
}
.variant-title { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; color: #111; white-space: nowrap; }
.variant-line { flex: 1; height: 2px; background: #111; }
.day {
    border: 1.5px solid #e0e0e0; border-radius: 8px; overflow: hidden;
    margin-bottom: 14px;
    break-inside: avoid; page-break-inside: avoid;
}
.day-header {
    background: #f7f7f7; padding: 10px 16px; border-bottom: 1.5px solid #e0e0e0;
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
}
.day-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; color: #888; flex-shrink: 0; }
.day-title { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: #111; }
.day-stats { font-size: 9px; color: #888; margin-left: auto; flex-shrink: 0; }
.blocks { padding: 0 16px; }
.block {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 10px 0; border-bottom: 1px solid #f0f0f0;
    break-inside: avoid; page-break-inside: avoid;
}
.block:last-child { border-bottom: none; }
.block-accent { width: 3px; border-radius: 2px; align-self: stretch; flex-shrink: 0; min-height: 32px; }
.block-num { font-size: 9px; font-weight: 900; color: #ccc; width: 18px; flex-shrink: 0; padding-top: 1px; }
.block-body { flex: 1; min-width: 0; }
.block-name { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #111; line-height: 1.25; }
.block-meta { font-size: 10px; color: #555; margin-top: 3px; font-weight: 500; }
.block-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.tag { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 2px 6px; border-radius: 3px; }
.tag-progression { background: #dcfce7; color: #15803d; }
/* Superserie: bracket con borde/negrita (no depende de que impriman fondos) + tinta sport (#1462DC) */
.superset {
    border: 1.5px solid #1462DC; border-left-width: 4px; border-radius: 6px;
    background: #F0F6FF; margin: 8px 0; padding-bottom: 2px;
    break-inside: avoid; page-break-inside: avoid;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.superset-head { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #0B47B0; padding: 6px 14px 0; }
.superset-note { font-size: 8px; font-weight: 700; color: #1462DC; padding: 1px 14px 4px; }
.superset .blocks { padding: 0 14px; }
.block-notes { font-size: 9px; color: #888; margin-top: 3px; font-style: italic; line-height: 1.4; }
.rest-day { padding: 14px 16px; text-align: center; color: #bbb; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; }
@media print {
    body { padding: 0; }
    @page { margin: 14mm 16mm; size: A4 portrait; }
}
`

export function PrintProgramDialog({ open, onClose, programName, clientName, coachName, weeksToRepeat, days, daysB, isABMode }: PrintProgramDialogProps) {
    const printRef = useRef<HTMLDivElement>(null)

    if (!open) return null

    function handlePrint() {
        const content = printRef.current
        if (!content) return
        const printWindow = window.open('', '_blank', 'width=960,height=800')
        if (!printWindow) return
        printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${programName}</title><style>${PRINT_STYLES}</style></head><body>${content.innerHTML}</body></html>`)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => { printWindow.print(); printWindow.close() }, 350)
    }

    // `ordinal` (ej. "A1") = posición del ejercicio dentro de una superserie; cuando viene,
    // reemplaza el número correlativo en tinta sport → deja claro el orden de ejecución.
    // La pertenencia a superserie NO se marca por bloque: la comunica el bracket (singleton
    // guard: una letra huérfana se imprime como bloque suelto normal, sin tag engañoso).
    function renderBlock(block: BuilderBlock, idx: number, ordinal?: string) {
        const color = getMuscleColor(block.muscle_group)
        const metaParts: string[] = []
        if (block.sets && block.reps) metaParts.push(`${block.sets} series × ${block.reps} reps`)
        if (block.target_weight_kg) metaParts.push(`${block.target_weight_kg} kg`)
        if (block.rest_time) metaParts.push(`Descanso: ${block.rest_time}`)
        if (block.rir != null && block.rir !== '' && block.rir !== '0') metaParts.push(`RIR ${block.rir}`)
        if (block.tempo) metaParts.push(`Tempo ${block.tempo}`)

        const hasTags = !!block.progression_type

        return (
            <div
                key={block.uid}
                className="block"
                style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    padding: '10px 0',
                    borderBottom: '1px solid #f0f0f0',
                    breakInside: 'avoid',
                }}
            >
                <div style={{ width: '3px', borderRadius: '2px', alignSelf: 'stretch', flexShrink: 0, minHeight: '32px', backgroundColor: color }} />
                <div
                    className="block-num"
                    style={{ fontSize: ordinal ? '10px' : '9px', fontWeight: 900, color: ordinal ? '#1462DC' : '#ccc', width: '18px', flexShrink: 0, paddingTop: '1px' }}
                >
                    {ordinal ?? String(idx + 1).padStart(2, '0')}
                </div>
                <div className="block-body" style={{ flex: 1, minWidth: 0 }}>
                    <div className="block-name" style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#111', lineHeight: 1.25 }}>
                        {block.exercise_name}
                    </div>
                    {metaParts.length > 0 && (
                        <div className="block-meta" style={{ fontSize: '10px', color: '#555', marginTop: '3px', fontWeight: 500 }}>
                            {metaParts.join(' · ')}
                        </div>
                    )}
                    {hasTags && (
                        <div className="block-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            {block.progression_type && (
                                <span className="tag tag-progression" style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 6px', borderRadius: '3px', background: '#dcfce7', color: '#15803d' }}>
                                    Progresión: +{block.progression_value ?? '?'}{block.progression_type === 'weight' ? ' kg/sem' : ' rep/ses'}
                                </span>
                            )}
                        </div>
                    )}
                    {block.notes && (
                        <div className="block-notes" style={{ fontSize: '9px', color: '#888', marginTop: '3px', fontStyle: 'italic', lineHeight: 1.4 }}>
                            {block.notes}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    function renderDays(dayList: DayState[]) {
        const activeDays = dayList.filter(d => d.blocks.length > 0 || d.is_rest)
        if (activeDays.length === 0) return null

        return (
            <div>
                {activeDays.map(day => (
                    <div
                        key={day.id}
                        className="day"
                        style={{
                            border: '1.5px solid #e0e0e0',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            marginBottom: '14px',
                            breakInside: 'avoid',
                        }}
                    >
                        {/* Day header */}
                        <div
                            className="day-header"
                            style={{
                                background: '#f7f7f7',
                                padding: '10px 16px',
                                borderBottom: '1.5px solid #e0e0e0',
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: '10px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#888', flexShrink: 0 }}>
                                {DAYS_NAMES[day.id]}
                            </span>
                            {day.title && (
                                <span style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#111' }}>
                                    {day.title}
                                </span>
                            )}
                            <span style={{ fontSize: '9px', color: '#888', marginLeft: 'auto', flexShrink: 0 }}>
                                {day.is_rest
                                    ? 'Descanso'
                                    : `${day.blocks.length} ejercicio${day.blocks.length !== 1 ? 's' : ''} · ${day.blocks.reduce((s, b) => s + (b.sets || 0), 0)} series`}
                            </span>
                        </div>

                        {/* Exercises */}
                        <div className="blocks" style={{ padding: '0 16px' }}>
                            {day.is_rest ? (
                                <div style={{ textAlign: 'center', color: '#bbb', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', padding: '14px 0' }}>
                                    Día de Descanso
                                </div>
                            ) : (
                                (() => {
                                    // Mismo agrupador canónico que preview/ficha (singleton guard incluido):
                                    // superserie ⇒ bracket con nota de orden; bloque suelto ⇒ como siempre.
                                    const rows = day.blocks.map((b, i) => ({ ...b, id: b.uid, order_index: i }))
                                    const groups = groupContiguousSupersetRuns(rows)
                                    let runningIdx = 0
                                    return groups.map((group) => {
                                        if (group.type !== 'superset') {
                                            const el = renderBlock(group.blocks[0], runningIdx)
                                            runningIdx += 1
                                            return el
                                        }
                                        const letter = group.supersetLetter ?? '?'
                                        const startIdx = runningIdx
                                        const order = group.blocks.map((_, bi) => `${letter}${bi + 1}`).join(' → ')
                                        const members = group.blocks.map((block, bi) =>
                                            renderBlock(block, startIdx + bi, `${letter}${bi + 1}`)
                                        )
                                        runningIdx += group.blocks.length
                                        return (
                                            <div
                                                key={group.key}
                                                className="superset"
                                                style={{
                                                    border: '1.5px solid #1462DC', borderLeftWidth: '4px', borderRadius: '6px',
                                                    background: '#F0F6FF', margin: '8px 0', paddingBottom: '2px',
                                                    breakInside: 'avoid', pageBreakInside: 'avoid',
                                                    WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
                                                }}
                                            >
                                                <div className="superset-head" style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#0B47B0', padding: '6px 14px 0' }}>
                                                    Superserie {letter} · {group.blocks.length} ejercicios
                                                </div>
                                                <div className="superset-note" style={{ fontSize: '8px', fontWeight: 700, color: '#1462DC', padding: '1px 14px 4px' }}>
                                                    Alterná los ejercicios ({order}) en cada ronda
                                                </div>
                                                <div className="blocks" style={{ padding: '0 14px' }}>
                                                    {members}
                                                </div>
                                            </div>
                                        )
                                    })
                                })()
                            )}
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    const metaLine = [
        clientName ? `Cliente: ${clientName}` : null,
        `${weeksToRepeat} semana${weeksToRepeat !== 1 ? 's' : ''}`,
        isABMode ? 'Semanas A/B' : null,
    ].filter(Boolean).join(' · ')

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-0 md:items-center md:p-4">
            <div className="bg-background border border-border rounded-t-sheet md:rounded-card shadow-2xl w-full max-w-3xl max-h-[88dvh] md:max-h-[90vh] flex flex-col overflow-hidden pb-safe md:pb-0">
                <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)] md:hidden" aria-hidden="true" />
                {/* Dialog header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
                    <div>
                        <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground">Vista previa de impresión</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">{programName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 text-white text-[13px] font-bold rounded-control hover:opacity-90 transition-opacity"
                            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                        >
                            <Printer className="w-4 h-4" />
                            Imprimir / PDF
                        </button>
                        <button onClick={onClose} className="p-2 rounded-control hover:bg-muted transition-colors text-muted-foreground">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Preview — white bg always, single-column list */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-zinc-800">
                    <div
                        ref={printRef}
                        style={{ background: '#fff', color: '#111', padding: '20px 28px', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}
                    >
                        {/* Document header */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '14px', borderBottom: '3px solid #111' }}>
                            <div>
                                <div style={{ fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#111' }}>
                                    {programName}
                                </div>
                                <div style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '5px' }}>
                                    {metaLine}
                                </div>
                            </div>
                            {coachName && (
                                <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#444', background: '#f0f0f0', padding: '3px 8px', borderRadius: '5px', display: 'inline-block', flexShrink: 0, marginLeft: '16px' }}>
                                    {coachName}
                                </span>
                            )}
                        </div>

                        {/* Week A */}
                        {isABMode && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 12px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#111', whiteSpace: 'nowrap' }}>Semana A</span>
                                <div style={{ flex: 1, height: '2px', background: '#111' }} />
                            </div>
                        )}
                        {renderDays(days)}

                        {/* Week B */}
                        {isABMode && daysB && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0 12px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#111', whiteSpace: 'nowrap' }}>Semana B</span>
                                    <div style={{ flex: 1, height: '2px', background: '#111' }} />
                                </div>
                                {renderDays(daysB)}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
