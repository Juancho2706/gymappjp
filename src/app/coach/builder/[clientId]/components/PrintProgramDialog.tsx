'use client'

import { useRef } from 'react'
import { X, Printer } from 'lucide-react'
import { getMuscleColor } from '../muscle-colors'
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
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 28px 32px; }
.doc-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 3px solid #111; }
.doc-title { font-size: 26px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em; color: #111; }
.doc-meta { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 6px; }
.doc-client { font-size: 12px; font-weight: 700; color: #111; text-transform: uppercase; letter-spacing: 0.1em; }
.doc-right { text-align: right; }
.coach-badge { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #444; background: #f0f0f0; padding: 4px 10px; border-radius: 6px; display: inline-block; }
.variant-header { display: flex; align-items: center; gap: 12px; margin: 20px 0 14px; }
.variant-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; color: #111; }
.variant-line { flex: 1; height: 2px; background: #111; }
.days-grid { display: grid; gap: 14px; }
.day { border: 1.5px solid #e0e0e0; border-radius: 10px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
.day-header { background: #f7f7f7; padding: 10px 14px; border-bottom: 1.5px solid #e0e0e0; }
.day-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; color: #888; }
.day-title { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: #111; margin-top: 3px; }
.day-stats { font-size: 9px; color: #888; margin-top: 3px; }
.blocks { padding: 8px 14px; }
.block { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; }
.block + .block { border-top: 1px dashed #ebebeb; }
.block-accent { width: 3px; border-radius: 2px; align-self: stretch; flex-shrink: 0; min-height: 36px; }
.block-info { flex: 1; min-width: 0; }
.block-num { font-size: 8px; font-weight: 900; color: #bbb; margin-bottom: 1px; }
.block-name { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #111; line-height: 1.2; }
.block-meta { font-size: 10px; color: #555; margin-top: 3px; font-weight: 500; }
.block-tag { display: inline-block; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; padding: 1px 5px; border-radius: 3px; margin-top: 3px; margin-right: 4px; }
.tag-superset { background: #dbeafe; color: #1d4ed8; }
.tag-progression { background: #dcfce7; color: #15803d; }
.block-notes { font-size: 9px; color: #888; margin-top: 3px; font-style: italic; }
.rest-day { padding: 16px 14px; text-align: center; color: #bbb; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; }
@media print {
    body { padding: 16px 20px; }
    @page { margin: 12mm 14mm; size: A4 portrait; }
}
`

export function PrintProgramDialog({ open, onClose, programName, clientName, coachName, weeksToRepeat, days, daysB, isABMode }: PrintProgramDialogProps) {
    const printRef = useRef<HTMLDivElement>(null)

    if (!open) return null

    function handlePrint() {
        const content = printRef.current
        if (!content) return
        const printWindow = window.open('', '_blank', 'width=920,height=750')
        if (!printWindow) return
        printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${programName}</title><style>${PRINT_STYLES}</style></head><body>${content.innerHTML}</body></html>`)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => { printWindow.print(); printWindow.close() }, 350)
    }

    function getGridCols(count: number): string {
        if (count <= 2) return 'repeat(2, 1fr)'
        if (count <= 4) return 'repeat(2, 1fr)'
        return 'repeat(3, 1fr)'
    }

    function renderBlock(block: BuilderBlock, idx: number, isLast: boolean) {
        const color = getMuscleColor(block.muscle_group)
        const metaParts: string[] = []
        if (block.sets && block.reps) metaParts.push(`${block.sets} × ${block.reps}`)
        if (block.target_weight_kg) metaParts.push(`${block.target_weight_kg} kg`)
        if (block.rest_time) metaParts.push(`↻ ${block.rest_time}`)
        if (block.rir) metaParts.push(`RIR ${block.rir}`)
        if (block.tempo) metaParts.push(`Tempo ${block.tempo}`)

        return (
            <div key={block.uid} className="block" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderTop: idx > 0 ? '1px dashed #ebebeb' : 'none' }}>
                <div className="block-accent" style={{ width: '3px', borderRadius: '2px', alignSelf: 'stretch', flexShrink: 0, minHeight: '36px', backgroundColor: color }} />
                <div className="block-info" style={{ flex: 1, minWidth: 0 }}>
                    <div className="block-num" style={{ fontSize: '8px', fontWeight: 900, color: '#bbb', marginBottom: '1px' }}>
                        {String(idx + 1).padStart(2, '0')}
                    </div>
                    <div className="block-name" style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#111', lineHeight: 1.2 }}>
                        {block.exercise_name}
                    </div>
                    {metaParts.length > 0 && (
                        <div className="block-meta" style={{ fontSize: '10px', color: '#555', marginTop: '3px', fontWeight: 500 }}>
                            {metaParts.join(' · ')}
                        </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: metaParts.length ? '3px' : '2px' }}>
                        {block.superset_group && (
                            <span className="block-tag tag-superset" style={{ display: 'inline-block', fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '1px 5px', borderRadius: '3px', background: '#dbeafe', color: '#1d4ed8' }}>
                                Superset {block.superset_group}
                            </span>
                        )}
                        {block.progression_type && (
                            <span className="block-tag tag-progression" style={{ display: 'inline-block', fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '1px 5px', borderRadius: '3px', background: '#dcfce7', color: '#15803d' }}>
                                +{block.progression_value ?? '?'}{block.progression_type === 'weight' ? ' kg/sem' : ' rep/ses'}
                            </span>
                        )}
                    </div>
                    {block.notes && (
                        <div className="block-notes" style={{ fontSize: '9px', color: '#888', marginTop: '3px', fontStyle: 'italic' }}>
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
        const cols = getGridCols(activeDays.length)

        return (
            <div className="days-grid" style={{ display: 'grid', gridTemplateColumns: cols, gap: '14px' }}>
                {activeDays.map(day => (
                    <div key={day.id} className="day" style={{ border: '1.5px solid #e0e0e0', borderRadius: '10px', overflow: 'hidden', breakInside: 'avoid' }}>
                        <div className="day-header" style={{ background: '#f7f7f7', padding: '10px 14px', borderBottom: '1.5px solid #e0e0e0' }}>
                            <div className="day-label" style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#888' }}>
                                {DAYS_NAMES[day.id]}
                            </div>
                            {day.title && (
                                <div className="day-title" style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#111', marginTop: '3px' }}>
                                    {day.title}
                                </div>
                            )}
                            <div className="day-stats" style={{ fontSize: '9px', color: '#888', marginTop: '3px' }}>
                                {day.is_rest
                                    ? 'Descanso'
                                    : `${day.blocks.length} ejercicio${day.blocks.length !== 1 ? 's' : ''} · ${day.blocks.reduce((s, b) => s + (b.sets || 0), 0)} series`}
                            </div>
                        </div>
                        <div className="blocks" style={{ padding: '8px 14px' }}>
                            {day.is_rest ? (
                                <div style={{ textAlign: 'center', color: '#bbb', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', padding: '14px 0' }}>
                                    Día de Descanso
                                </div>
                            ) : day.blocks.map((block, idx) => renderBlock(block, idx, idx === day.blocks.length - 1))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Dialog header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Vista Previa de Impresión</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">{programName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity"
                            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                        >
                            <Printer className="w-4 h-4" />
                            Imprimir / PDF
                        </button>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Preview — always white bg to match print output */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-zinc-800">
                    <div
                        ref={printRef}
                        style={{ background: '#fff', color: '#111', padding: '28px 32px', borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}
                    >
                        {/* Document header */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', paddingBottom: '16px', borderBottom: '3px solid #111' }}>
                            <div>
                                <div style={{ fontSize: '26px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#111' }}>
                                    {programName}
                                </div>
                                <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '6px' }}>
                                    {metaLine}
                                </div>
                            </div>
                            {coachName && (
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#444', background: '#f0f0f0', padding: '4px 10px', borderRadius: '6px', display: 'inline-block' }}>
                                        {coachName}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Week A */}
                        {isABMode && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 14px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#111' }}>Semana A</span>
                                <div style={{ flex: 1, height: '2px', background: '#111' }} />
                            </div>
                        )}
                        {renderDays(days)}

                        {/* Week B */}
                        {isABMode && daysB && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '28px 0 14px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#111' }}>Semana B</span>
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
