'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

interface CoachRow {
    name: string
    clients: number
    health: number | null
}

interface MetricRow {
    label: string
    value: number
    suffix: string
}

interface Props {
    orgName: string
    orgSlug: string
    primaryColor: string | null
    metrics: MetricRow[]
    coaches: CoachRow[]
    activeClients: number
    unassignedClients: number
    inactiveClients: number
    totalClients: number
}

// Solid colors for PDF (no opacity)
const C = {
    headerBg: [15, 23, 42] as [number, number, number],
    accent: [245, 158, 11] as [number, number, number],       // amber-400 (EVA enterprise)
    sectionBg: [241, 245, 249] as [number, number, number],
    textDark: [15, 23, 42] as [number, number, number],
    textMid: [71, 85, 105] as [number, number, number],
    textLight: [148, 163, 184] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    border: [203, 213, 225] as [number, number, number],
    green: [16, 185, 129] as [number, number, number],
    amber: [245, 158, 11] as [number, number, number],
    red: [239, 68, 68] as [number, number, number],
}

function metricColor(value: number): [number, number, number] {
    if (value >= 80) return C.green
    if (value >= 50) return C.amber
    return C.red
}

export function ReportsPdfButton({
    orgName,
    orgSlug,
    primaryColor,
    metrics,
    coaches,
    activeClients,
    unassignedClients,
    inactiveClients,
    totalClients,
}: Props) {
    const [loading, setLoading] = useState(false)

    async function handleDownload() {
        setLoading(true)
        try {
            const { jsPDF } = await import('jspdf')
            const doc = new jsPDF({ unit: 'mm', format: 'a4' })

            const pageW = doc.internal.pageSize.getWidth()
            const margin = 14
            const contentW = pageW - margin * 2
            let y = 0

            const date = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            const safeStem = `reporte-${orgSlug}-${new Date().toISOString().slice(0, 10)}`

            // ─── Header ──────────────────────────────────────────────────
            doc.setFillColor(...C.headerBg)
            doc.rect(0, 0, pageW, 38, 'F')

            // Accent bar
            doc.setFillColor(...C.accent)
            doc.rect(0, 0, 4, 38, 'F')

            doc.setFont('helvetica', 'bold')
            doc.setFontSize(18)
            doc.setTextColor(...C.white)
            doc.text(orgName, margin + 4, 16)

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
            doc.setTextColor(...C.textLight)
            doc.text('Reporte semanal operacional', margin + 4, 24)
            doc.text(date, margin + 4, 30)

            // "EVA Enterprise" top-right
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(...C.accent)
            doc.text('EVA ENTERPRISE', pageW - margin - 4, 16, { align: 'right' })
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(...C.textLight)
            doc.text('Weekly Brief', pageW - margin - 4, 22, { align: 'right' })

            y = 50

            // ─── Key Metrics ─────────────────────────────────────────────
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            doc.setTextColor(...C.textDark)
            doc.text('Métricas clave', margin, y)
            y += 6

            const cellW = contentW / 2
            const cellH = 22

            metrics.forEach((m, i) => {
                const col = i % 2
                const row = Math.floor(i / 2)
                const x = margin + col * cellW
                const cy = y + row * (cellH + 3)

                doc.setFillColor(...C.sectionBg)
                doc.roundedRect(x, cy, cellW - 2, cellH, 2, 2, 'F')

                doc.setFont('helvetica', 'bold')
                doc.setFontSize(16)
                const color = metricColor(m.value)
                doc.setTextColor(...color)
                doc.text(`${m.value}${m.suffix}`, x + 5, cy + 13)

                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
                doc.setTextColor(...C.textMid)
                doc.text(m.label, x + 5, cy + 19)
            })

            y += Math.ceil(metrics.length / 2) * (cellH + 3) + 10

            // ─── Resumen alumnos ──────────────────────────────────────────
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            doc.setTextColor(...C.textDark)
            doc.text('Pool de alumnos', margin, y)
            y += 6

            const clientRows: [string, string][] = [
                ['Total en pool', String(totalClients)],
                ['Activos', String(activeClients)],
                ['Sin coach asignado', String(unassignedClients)],
                ['Inactivos', String(inactiveClients)],
            ]
            clientRows.forEach(([label, value]) => {
                doc.setFillColor(...C.sectionBg)
                doc.rect(margin, y, contentW, 8, 'F')

                doc.setFont('helvetica', 'normal')
                doc.setFontSize(9)
                doc.setTextColor(...C.textMid)
                doc.text(label, margin + 4, y + 5.5)

                const valColor = (label.includes('Sin coach') || label.includes('Inactivos')) && Number(value) > 0
                    ? C.amber
                    : C.textDark
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(...valColor)
                doc.text(value, margin + contentW - 4, y + 5.5, { align: 'right' })

                y += 9
            })
            y += 8

            // ─── Coach Performance ────────────────────────────────────────
            if (coaches.length > 0) {
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(11)
                doc.setTextColor(...C.textDark)
                doc.text('Performance de coaches', margin, y)
                y += 6

                // Table header
                doc.setFillColor(...C.headerBg)
                doc.rect(margin, y, contentW, 8, 'F')
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8)
                doc.setTextColor(...C.white)
                doc.text('Coach', margin + 4, y + 5.5)
                doc.text('Alumnos', margin + contentW * 0.55, y + 5.5)
                doc.text('Health', margin + contentW * 0.8, y + 5.5)
                y += 8

                coaches.forEach((coach, i) => {
                    const bg = i % 2 === 0 ? C.white : C.sectionBg
                    doc.setFillColor(...bg)
                    doc.rect(margin, y, contentW, 8, 'F')

                    doc.setFont('helvetica', 'normal')
                    doc.setFontSize(9)
                    doc.setTextColor(...C.textDark)
                    doc.text(coach.name, margin + 4, y + 5.5)
                    doc.text(String(coach.clients), margin + contentW * 0.55, y + 5.5)
                    doc.text(coach.health ? `${coach.health}/100` : 'N/D', margin + contentW * 0.8, y + 5.5)
                    y += 8
                })
                y += 6
            }

            // ─── Footer ───────────────────────────────────────────────────
            const pageH = doc.internal.pageSize.getHeight()
            doc.setFillColor(...C.headerBg)
            doc.rect(0, pageH - 14, pageW, 14, 'F')
            doc.setFillColor(...C.accent)
            doc.rect(0, pageH - 14, 4, 14, 'F')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.setTextColor(...C.textLight)
            doc.text('Generado por EVA Enterprise', margin + 4, pageH - 5)
            doc.text(new Date().toLocaleString('es-CL'), pageW - margin - 4, pageH - 5, { align: 'right' })

            doc.save(`${safeStem}.pdf`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleDownload}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-400 transition-colors disabled:opacity-50"
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {loading ? 'Generando...' : 'Descargar PDF'}
        </button>
    )
}
