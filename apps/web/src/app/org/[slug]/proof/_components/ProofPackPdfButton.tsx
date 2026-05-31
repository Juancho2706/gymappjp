'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

interface Props {
    orgName: string
    orgSlug: string
    primaryColor: string | null
    logoUrl: string | null
    plan: string
    metrics: { label: string; value: string }[]
    capabilities: string[]
    activeClients: number
    activeCoaches: number
    auditCount: number
}

const C = {
    dark: [15, 23, 42] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    amber: [245, 158, 11] as [number, number, number],
    emerald: [16, 185, 129] as [number, number, number],
    mid: [71, 85, 105] as [number, number, number],
    light: [148, 163, 184] as [number, number, number],
    sectionBg: [241, 245, 249] as [number, number, number],
}

export function ProofPackPdfButton({ orgName, orgSlug, primaryColor, plan, metrics, capabilities, activeClients, activeCoaches, auditCount }: Props) {
    const [loading, setLoading] = useState(false)

    async function handleDownload() {
        setLoading(true)
        try {
            const { jsPDF } = await import('jspdf')
            const doc = new jsPDF({ unit: 'mm', format: 'a4' })
            const pageW = doc.internal.pageSize.getWidth()
            const pageH = doc.internal.pageSize.getHeight()
            const margin = 14
            const contentW = pageW - margin * 2
            const date = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })
            let y = 0

            // ── Cover header ─────────────────────────────────────────────
            doc.setFillColor(...C.dark)
            doc.rect(0, 0, pageW, 55, 'F')
            doc.setFillColor(...C.amber)
            doc.rect(0, 0, 5, 55, 'F')

            // Org name
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(22)
            doc.setTextColor(...C.white)
            doc.text(orgName, margin + 6, 20)

            // Subtitle
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            doc.setTextColor(...C.light)
            doc.text('Proof Pack — Platform Overview', margin + 6, 29)
            doc.text(date, margin + 6, 36)

            // Plan badge top-right
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(9)
            doc.setTextColor(...C.amber)
            doc.text(`Plan: ${plan.toUpperCase()}`, pageW - margin - 5, 22, { align: 'right' })
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.setTextColor(...C.light)
            doc.text('Powered by EVA Enterprise', pageW - margin - 5, 30, { align: 'right' })

            y = 65

            // ── Business metrics ─────────────────────────────────────────
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(12)
            doc.setTextColor(...C.dark)
            doc.text('Métricas del negocio', margin, y)
            y += 7

            const cellW = contentW / 2
            const cellH = 18
            metrics.forEach((m, i) => {
                const col = i % 2
                const row = Math.floor(i / 2)
                const x = margin + col * cellW
                const cy = y + row * (cellH + 3)

                doc.setFillColor(...C.sectionBg)
                doc.roundedRect(x, cy, cellW - 2, cellH, 2, 2, 'F')

                doc.setFont('helvetica', 'bold')
                doc.setFontSize(14)
                doc.setTextColor(...C.dark)
                doc.text(m.value, x + 5, cy + 11)

                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
                doc.setTextColor(...C.mid)
                doc.text(m.label, x + 5, cy + 16)
            })

            y += Math.ceil(metrics.length / 2) * (cellH + 3) + 10

            // ── Platform capabilities ─────────────────────────────────────
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(12)
            doc.setTextColor(...C.dark)
            doc.text('Capacidades habilitadas', margin, y)
            y += 7

            const half = Math.ceil(capabilities.length / 2)
            capabilities.forEach((cap, i) => {
                const col = i < half ? 0 : 1
                const row = i < half ? i : i - half
                const x = margin + col * (contentW / 2)
                const cy = y + row * 8

                doc.setFillColor(...C.emerald)
                doc.circle(x + 2, cy + 1.5, 1.5, 'F')

                doc.setFont('helvetica', 'normal')
                doc.setFontSize(9)
                doc.setTextColor(...C.dark)
                doc.text(cap, x + 6, cy + 3)
            })

            y += half * 8 + 10

            // ── Security & Trust ──────────────────────────────────────────
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(12)
            doc.setTextColor(...C.dark)
            doc.text('Seguridad y confianza', margin, y)
            y += 7

            const trustItems = [
                `${activeCoaches} coaches enterprise activos`,
                `${activeClients} alumnos en el pool organizacional`,
                `${auditCount} eventos auditados`,
                'Tenant isolation por org_id + Row Level Security',
                'RBAC con permisos granulares por rol',
                'MFA obligatorio para administradores',
                'Audit log exportable con checksum SHA-256',
            ]
            trustItems.forEach(item => {
                doc.setFillColor(...C.sectionBg)
                doc.rect(margin, y, contentW, 7, 'F')
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(9)
                doc.setTextColor(...C.dark)
                doc.text(`✓  ${item}`, margin + 3, y + 5)
                y += 8
            })

            // ── Footer ────────────────────────────────────────────────────
            doc.setFillColor(...C.dark)
            doc.rect(0, pageH - 12, pageW, 12, 'F')
            doc.setFillColor(...C.amber)
            doc.rect(0, pageH - 12, 5, 12, 'F')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.setTextColor(...C.light)
            doc.text('Generado por EVA Enterprise · eva-app.cl', margin + 6, pageH - 4)
            doc.text(new Date().toLocaleString('es-CL'), pageW - margin - 5, pageH - 4, { align: 'right' })

            doc.save(`proof-pack-${orgSlug}-${new Date().toISOString().slice(0, 10)}.pdf`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleDownload}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-zinc-950 hover:bg-amber-300 transition-colors disabled:opacity-50"
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {loading ? 'Generando PDF...' : 'Descargar Proof Pack'}
        </button>
    )
}
