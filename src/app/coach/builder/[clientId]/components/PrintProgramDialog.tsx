'use client'

import { useRef } from 'react'
import { X, Printer } from 'lucide-react'
import { getMuscleColor } from '../muscle-colors'
import type { DayState } from '../types'

interface PrintProgramDialogProps {
    open: boolean
    onClose: () => void
    programName: string
    clientName?: string
    weeksToRepeat: number
    days: DayState[]
    /** Optional extra days for week B (A/B mode) */
    daysB?: DayState[]
    isABMode?: boolean
}

const DAYS_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function PrintProgramDialog({ open, onClose, programName, clientName, weeksToRepeat, days, daysB, isABMode }: PrintProgramDialogProps) {
    const printRef = useRef<HTMLDivElement>(null)

    if (!open) return null

    function handlePrint() {
        const content = printRef.current
        if (!content) return

        const printWindow = window.open('', '_blank', 'width=900,height=700')
        if (!printWindow) return

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8" />
                <title>${programName}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 32px; }
                    h1 { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 4px; }
                    .subtitle { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 32px; }
                    .variant-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #444; border-bottom: 2px solid #111; padding-bottom: 6px; margin: 24px 0 16px; }
                    .days-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
                    .day { border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; break-inside: avoid; }
                    .day-header { background: #f5f5f5; padding: 10px 14px; border-bottom: 1px solid #e5e5e5; }
                    .day-name { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #888; }
                    .day-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #111; margin-top: 2px; }
                    .day-stats { font-size: 9px; color: #888; margin-top: 4px; }
                    .blocks { padding: 10px 14px; }
                    .block { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px dashed #f0f0f0; }
                    .block:last-child { border-bottom: none; }
                    .block-accent { width: 3px; border-radius: 2px; align-self: stretch; flex-shrink: 0; min-height: 32px; }
                    .block-info { flex: 1; }
                    .block-name { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #111; }
                    .block-meta { font-size: 9px; color: #666; margin-top: 2px; }
                    .block-progression { font-size: 8px; color: #16a34a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px; }
                    .block-ss { font-size: 8px; color: #2563eb; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px; }
                    .rest-day { padding: 20px 14px; text-align: center; color: #aaa; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; }
                    .empty-day { display: none; }
                    @media print {
                        body { padding: 16px; }
                        .days-grid { grid-template-columns: repeat(3, 1fr); }
                    }
                </style>
            </head>
            <body>
                ${content.innerHTML}
            </body>
            </html>
        `)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => { printWindow.print(); printWindow.close() }, 300)
    }

    function renderDays(dayList: DayState[]) {
        const activeDays = dayList.filter(d => d.blocks.length > 0 || d.is_rest)
        if (activeDays.length === 0) return null

        return (
            <div className="days-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {activeDays.map(day => (
                    <div key={day.id} className="day" style={{ border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden', breakInside: 'avoid' }}>
                        <div className="day-header" style={{ background: '#f5f5f5', padding: '10px 14px', borderBottom: '1px solid #e5e5e5' }}>
                            <div className="day-name" style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#888' }}>
                                {DAYS_NAMES[day.id]}
                            </div>
                            {day.title && (
                                <div className="day-title" style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#111', marginTop: '2px' }}>
                                    {day.title}
                                </div>
                            )}
                            <div className="day-stats" style={{ fontSize: '9px', color: '#888', marginTop: '4px' }}>
                                {day.is_rest ? 'Descanso' : `${day.blocks.length} ejercicios · ${day.blocks.reduce((s, b) => s + (b.sets || 0), 0)} series`}
                            </div>
                        </div>
                        <div className="blocks" style={{ padding: '10px 14px' }}>
                            {day.is_rest ? (
                                <div style={{ textAlign: 'center', color: '#aaa', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', padding: '12px 0' }}>
                                    Día de Descanso
                                </div>
                            ) : day.blocks.map((block, idx) => {
                                const color = getMuscleColor(block.muscle_group)
                                return (
                                    <div key={block.uid} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '7px 0', borderBottom: idx < day.blocks.length - 1 ? '1px dashed #f0f0f0' : 'none' }}>
                                        <div style={{ width: '3px', borderRadius: '2px', alignSelf: 'stretch', flexShrink: 0, minHeight: '28px', backgroundColor: color }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#111' }}>
                                                {block.exercise_name}
                                            </div>
                                            <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                                                {block.sets ?? '?'} × {block.reps ?? '?'}
                                                {block.target_weight_kg ? ` · ${block.target_weight_kg} kg` : ''}
                                                {block.rest_time ? ` · ${block.rest_time}` : ''}
                                                {block.rir ? ` · ${block.rir}` : ''}
                                            </div>
                                            {block.superset_group && (
                                                <div style={{ fontSize: '8px', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px' }}>
                                                    Superset {block.superset_group}
                                                </div>
                                            )}
                                            {block.progression_type && (
                                                <div style={{ fontSize: '8px', color: '#16a34a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px' }}>
                                                    ↑ +{block.progression_value ?? '?'}{block.progression_type === 'weight' ? 'kg/sem' : ' rep/ses'}
                                                </div>
                                            )}
                                            {block.notes && (
                                                <div style={{ fontSize: '8px', color: '#999', marginTop: '2px', fontStyle: 'italic' }}>
                                                    {block.notes}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Vista Previa de Impresión</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">{programName}{clientName ? ` — ${clientName}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity"
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

                {/* Preview content (scrollable) */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div ref={printRef}>
                        {/* Program title */}
                        <h1 style={{ fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '4px' }}>
                            {programName}
                        </h1>
                        <p style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '24px' }}>
                            {clientName ? `Cliente: ${clientName} · ` : ''}{weeksToRepeat} semanas{isABMode ? ' · Semanas A/B' : ''}
                        </p>

                        {/* Week A */}
                        {isABMode && (
                            <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#444', borderBottom: '2px solid #111', paddingBottom: '6px', margin: '0 0 16px' }}>
                                Semana A
                            </div>
                        )}
                        {renderDays(days)}

                        {/* Week B */}
                        {isABMode && daysB && (
                            <>
                                <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#444', borderBottom: '2px solid #111', paddingBottom: '6px', margin: '32px 0 16px' }}>
                                    Semana B
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
