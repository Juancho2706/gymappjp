/**
 * Genera y descarga el DOSSIER del alumno como PDF real (jsPDF, client-side).
 *
 * Tema OSCURO premium: cada hoja se pinta con un rect de fondo sólido (jsPDF no tiene
 * fondo de página global). SOLO colores sólidos — nada de alpha/opacidad, incompatible
 * con PDF. El contenido ya es visible por el coach en la ficha; el archivo queda bajo su
 * control. @privacidad NO incluye pagos/billing (el dossier se comparte con el alumno).
 */

import type { ClientDossierData, DossierStatusLevel } from '@/services/client/client-dossier'

type RGB = [number, number, number]

// Paleta oscura (sólidos, sin opacidad).
const C = {
    bg: [11, 15, 25] as RGB, // #0B0F19
    card: [22, 29, 46] as RGB, // #161D2E
    border: [42, 51, 72] as RGB, // #2A3348
    textStrong: [248, 250, 252] as RGB, // #F8FAFC
    textMid: [148, 163, 184] as RGB, // #94A3B8
    muted: [100, 116, 139] as RGB, // #64748B
    accent: [249, 115, 22] as RGB, // #F97316
    success: [16, 185, 129] as RGB, // #10B981
    warning: [245, 158, 11] as RGB, // #F59E0B
    danger: [239, 68, 68] as RGB, // #EF4444
}

const STATUS_META: Record<DossierStatusLevel, { label: string; color: RGB }> = {
    urgente: { label: 'Urgente', color: C.danger },
    atencion: { label: 'Atención', color: C.warning },
    aldia: { label: 'Al día', color: C.success },
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function parseDate(iso: string | null | undefined): Date | null {
    if (!iso) return null
    const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
    return isFinite(d.getTime()) ? d : null
}

function fmtDate(iso: string | null | undefined): string {
    const d = parseDate(iso)
    if (!d) return '—'
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function fmtMonthYear(iso: string | null | undefined): string {
    const d = parseDate(iso)
    if (!d) return '—'
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function slugify(name: string): string {
    return (
        name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'alumno'
    )
}

export async function downloadClientDossierPdf(dossier: ClientDossierData): Promise<void> {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 14
    const contentW = pageW - margin * 2
    const footerReserve = 14

    let y = 0

    // ─── helpers de dibujo ──────────────────────────────────────────────────────
    const setColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
    const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])
    const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])

    function paintBg() {
        setFill(C.bg)
        doc.rect(0, 0, pageW, pageH, 'F')
    }

    function addPage() {
        doc.addPage()
        paintBg()
        y = margin
    }

    function checkPage(needed: number) {
        if (y + needed > pageH - footerReserve) addPage()
    }

    function card(x: number, yy: number, w: number, h: number, radius = 2.2) {
        setFill(C.card)
        doc.roundedRect(x, yy, w, h, radius, radius, 'F')
        setDraw(C.border)
        doc.setLineWidth(0.2)
        doc.roundedRect(x, yy, w, h, radius, radius, 'S')
    }

    function sectionHeader(title: string) {
        checkPage(16)
        y += 3
        setFill(C.accent)
        doc.rect(margin, y - 3.6, 1.5, 4.6, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10.5)
        setColor(C.textStrong)
        doc.text(title.toUpperCase(), margin + 4, y, { charSpace: 0.4 })
        y += 3
        setDraw(C.border)
        doc.setLineWidth(0.25)
        doc.line(margin, y, pageW - margin, y)
        y += 5
    }

    function emptyState(text: string) {
        checkPage(10)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(8.5)
        setColor(C.muted)
        doc.text(text, margin, y)
        y += 7
    }

    // ─── PÁGINA 1 · fondo + cabecera ─────────────────────────────────────────────
    paintBg()

    // Línea accent superior.
    setFill(C.accent)
    doc.rect(0, 0, pageW, 1.6, 'F')

    // Eyebrow.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor(C.accent)
    doc.text('DOSSIER DEL ALUMNO', margin, 12, { charSpace: 0.9 })

    // Chip de estado (arriba a la derecha).
    const status = STATUS_META[dossier.status.level]
    const chipLabel = `${status.label.toUpperCase()} · SCORE ${dossier.status.attentionScore}`
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    const chipTextW = doc.getTextWidth(chipLabel)
    const chipW = chipTextW + 8
    const chipH = 6.5
    const chipX = pageW - margin - chipW
    const chipY = 8
    setFill(status.color)
    doc.roundedRect(chipX, chipY, chipW, chipH, 1.6, 1.6, 'F')
    setColor(C.bg)
    doc.text(chipLabel, chipX + 4, chipY + 4.4)

    // Nombre.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    setColor(C.textStrong)
    const nameLines = doc.splitTextToSize(dossier.identity.fullName, contentW - chipW - 6)
    let ny = 24
    for (const line of nameLines.slice(0, 2)) {
        doc.text(line, margin, ny)
        ny += 9
    }
    y = ny + 1

    // Sub-línea: email · teléfono.
    const contactParts = [dossier.identity.email, dossier.identity.phone].filter(Boolean) as string[]
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setColor(C.textMid)
    if (contactParts.length) {
        doc.text(contactParts.join('   ·   '), margin, y)
        y += 5
    }

    // Cliente desde · estado activo · fecha de generación.
    doc.setFontSize(8.5)
    setColor(C.muted)
    const metaLine = [
        `Cliente desde ${fmtMonthYear(dossier.identity.clientSinceIso)}`,
        dossier.identity.isActive ? 'Activo' : 'Pausado',
        `Racha ${dossier.identity.streakDays} día${dossier.identity.streakDays === 1 ? '' : 's'}`,
        `Generado ${fmtDate(dossier.generatedAtIso)}`,
    ].join('   ·   ')
    doc.text(metaLine, margin, y)
    y += 8

    // ─── GRID DE 6 KPI CARDS (2×3) ───────────────────────────────────────────────
    const m = dossier.metrics
    const weightVal = m.currentWeightKg != null ? `${m.currentWeightKg} kg` : '—'
    let weightSub = 'sin cambio'
    let weightSubColor: RGB = C.muted
    // Mismo dead-band ±0.05 que la tabla de check-ins (sin él, +0.03 renderiza "+0.0 kg" ámbar).
    if (m.weightDeltaKg != null && Math.abs(m.weightDeltaKg) > 0.05) {
        if (m.weightDeltaKg > 0) {
            weightSub = `+${Math.abs(m.weightDeltaKg).toFixed(1)} kg`
            weightSubColor = C.warning
        } else {
            weightSub = `${m.weightDeltaKg.toFixed(1)} kg`
            weightSubColor = C.success
        }
    }

    const kpis: { label: string; value: string; sub: string; subColor: RGB }[] = [
        { label: 'Peso', value: weightVal, sub: weightSub, subColor: weightSubColor },
        {
            label: 'Adherencia semanal',
            value: `${m.adherenceWeeklyPct}%`,
            sub: 'entrenamientos',
            subColor: m.adherenceWeeklyPct >= 80 ? C.success : m.adherenceWeeklyPct >= 50 ? C.warning : C.danger,
        },
        { label: 'Racha', value: `${dossier.identity.streakDays}`, sub: 'días seguidos', subColor: C.accent },
        {
            label: 'Workouts semana',
            value: `${m.workoutsDone}/${m.workoutsTarget}`,
            sub: 'esta semana',
            subColor: C.textMid,
        },
        {
            label: 'Nutrición 30d',
            value: m.nutritionAdherence30dPct == null ? '—' : `${m.nutritionAdherence30dPct}%`,
            sub: 'adherencia',
            subColor:
                m.nutritionAdherence30dPct == null
                    ? C.muted
                    : m.nutritionAdherence30dPct >= 80
                      ? C.success
                      : m.nutritionAdherence30dPct >= 50
                        ? C.warning
                        : C.danger,
        },
        {
            label: 'Check-ins',
            value: `${m.checkInCompliancePct}%`,
            sub: 'cumplimiento',
            subColor: m.checkInCompliancePct >= 80 ? C.success : m.checkInCompliancePct >= 50 ? C.warning : C.danger,
        },
    ]

    const kGap = 4
    const kW = (contentW - kGap * 2) / 3
    const kH = 21
    for (let i = 0; i < kpis.length; i++) {
        const col = i % 3
        const row = Math.floor(i / 3)
        const kx = margin + col * (kW + kGap)
        const ky = y + row * (kH + kGap)
        const k = kpis[i]
        card(kx, ky, kW, kH)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6)
        setColor(C.muted)
        doc.text(k.label.toUpperCase(), kx + 4, ky + 5.5, { charSpace: 0.3 })
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(15)
        setColor(C.textStrong)
        doc.text(k.value, kx + 4, ky + 13.5)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        setColor(k.subColor)
        doc.text(k.sub, kx + 4, ky + 18)
    }
    y += kH * 2 + kGap + 4

    // ─── PROGRAMA ─────────────────────────────────────────────────────────────────
    sectionHeader('Programa')
    if (!dossier.program) {
        emptyState('Sin programa activo asignado.')
    } else {
        const p = dossier.program
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        setColor(C.textStrong)
        const nameLine = doc.splitTextToSize(p.name, contentW)
        doc.text(nameLine[0], margin, y)
        y += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        setColor(C.textMid)
        doc.text(
            `Semana ${p.currentWeek}/${p.totalWeeks}   ·   ${p.daysRemaining} día${p.daysRemaining === 1 ? '' : 's'} restantes`,
            margin,
            y
        )
        y += 6
        if (p.days.length === 0) {
            emptyState('El programa no tiene días con ejercicios cargados.')
        } else {
            for (const d of p.days) {
                checkPage(5.5)
                setFill(C.accent)
                doc.circle(margin + 1, y - 1.2, 0.7, 'F')
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8.5)
                setColor(C.textStrong)
                const dayName = doc.splitTextToSize(d.title, contentW - 40)[0]
                doc.text(dayName, margin + 4, y)
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
                setColor(C.muted)
                doc.text(`${d.blockCount} ejercicio${d.blockCount === 1 ? '' : 's'}`, pageW - margin, y, {
                    align: 'right',
                })
                y += 5
            }
        }
    }
    y += 2

    // ─── ENTRENAMIENTO ──────────────────────────────────────────────────────────
    sectionHeader('Entrenamiento')

    // Récords personales.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(C.textMid)
    checkPage(8)
    doc.text('RÉCORDS PERSONALES', margin, y, { charSpace: 0.3 })
    y += 4
    const prs = dossier.training.personalRecords
    if (prs.length === 0) {
        emptyState('Sin récords de fuerza registrados.')
    } else {
        // Cabecera de tabla.
        const colEx = margin + 3
        const colMg = margin + contentW * 0.5
        const colMax = margin + contentW * 0.74
        const colReps = margin + contentW * 0.88
        checkPage(6)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        setColor(C.muted)
        doc.text('EJERCICIO', colEx, y)
        doc.text('GRUPO', colMg, y)
        doc.text('MÁX', colMax, y)
        doc.text('REPS', colReps, y)
        y += 1.5
        setDraw(C.border)
        doc.setLineWidth(0.2)
        doc.line(margin, y, pageW - margin, y)
        y += 3.2
        for (let i = 0; i < prs.length; i++) {
            const r = prs[i]
            checkPage(6)
            if (i % 2 === 0) {
                setFill(C.card)
                doc.rect(margin, y - 3.7, contentW, 5.6, 'F')
            }
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            setColor(C.textStrong)
            doc.text(doc.splitTextToSize(r.exerciseName, contentW * 0.46)[0], colEx, y)
            setColor(C.textMid)
            doc.text(doc.splitTextToSize(r.muscleGroup, contentW * 0.22)[0], colMg, y)
            doc.setFont('helvetica', 'bold')
            setColor(C.accent)
            doc.text(`${r.maxWeightKg} kg`, colMax, y)
            doc.setFont('helvetica', 'normal')
            setColor(C.textMid)
            doc.text(`${r.repsAtMax}`, colReps, y)
            y += 5.6
        }
    }
    y += 3

    // Volumen por grupo (mini bar-chart).
    checkPage(8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(C.textMid)
    doc.text('VOLUMEN POR GRUPO (30D)', margin, y, { charSpace: 0.3 })
    y += 4.5
    const vol = dossier.training.muscleVolume
    if (vol.length === 0) {
        emptyState('Sin volumen de entrenamiento en los últimos 30 días.')
    } else {
        const maxVol = Math.max(...vol.map((v) => v.volume), 1)
        const labelW = 34
        const valW = 22
        const barX = margin + labelW
        const barMaxW = contentW - labelW - valW
        for (const v of vol) {
            checkPage(6)
            // label
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7.5)
            setColor(C.textMid)
            doc.text(doc.splitTextToSize(v.muscleGroup, labelW - 2)[0], margin, y)
            // track
            setFill(C.card)
            doc.roundedRect(barX, y - 2.8, barMaxW, 3.4, 0.8, 0.8, 'F')
            // barra
            const bw = Math.max(1, (v.volume / maxVol) * barMaxW)
            setFill(C.accent)
            doc.roundedRect(barX, y - 2.8, bw, 3.4, 0.8, 0.8, 'F')
            // valor
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7.5)
            setColor(C.textStrong)
            doc.text(`${v.volume.toLocaleString('es-CL')} kg`, pageW - margin, y, { align: 'right' })
            y += 5.6
        }
    }
    y += 3

    // ─── NUTRICIÓN ──────────────────────────────────────────────────────────────
    sectionHeader('Nutrición')
    if (!dossier.nutrition) {
        emptyState('Sin plan de nutrición activo.')
    } else {
        const n = dossier.nutrition
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        setColor(C.textStrong)
        doc.text(doc.splitTextToSize(n.planName, contentW)[0], margin, y)
        y += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        setColor(C.muted)
        // Con comidas day-specific el total del plan NO es "por día" (7×4 diría "28 por día").
        const mealsNoun = `comida${n.mealsTotal === 1 ? '' : 's'}`
        const mealsLabel = n.hasDaySpecificMeals
            ? `${n.mealsTotal} ${mealsNoun} en el plan (varía por día)`
            : `${n.mealsTotal} ${mealsNoun} por día`
        doc.text(mealsLabel, margin, y)
        y += 6

        // Chips de objetivos.
        const goals: { label: string; value: string; color: RGB }[] = [
            { label: 'KCAL', value: n.goals.calories != null ? `${n.goals.calories}` : '—', color: C.accent },
            { label: 'PROTEÍNA', value: n.goals.protein != null ? `${n.goals.protein} g` : '—', color: C.success },
            { label: 'CARBOS', value: n.goals.carbs != null ? `${n.goals.carbs} g` : '—', color: C.warning },
            { label: 'GRASAS', value: n.goals.fats != null ? `${n.goals.fats} g` : '—', color: C.textMid },
        ]
        checkPage(16)
        const gGap = 4
        const gW = (contentW - gGap * 3) / 4
        const gH = 14
        for (let i = 0; i < goals.length; i++) {
            const gx = margin + i * (gW + gGap)
            card(gx, y, gW, gH)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(5.5)
            setColor(goals[i].color)
            doc.text(goals[i].label, gx + 3.5, y + 5, { charSpace: 0.3 })
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            setColor(C.textStrong)
            doc.text(goals[i].value, gx + 3.5, y + 11)
        }
        y += gH + 4
    }
    y += 2

    // ─── CHECK-INS ──────────────────────────────────────────────────────────────
    sectionHeader('Check-ins')
    const cis = dossier.checkIns
    if (cis.length === 0) {
        emptyState('Sin check-ins registrados.')
    } else {
        // Cabecera de tabla.
        const cDate = margin + 3
        const cWeight = margin + contentW * 0.24
        const cDelta = margin + contentW * 0.4
        const cEnergy = margin + contentW * 0.56
        const cNotes = margin + contentW * 0.72
        const notesW = contentW * 0.28 - 4
        checkPage(6)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        setColor(C.muted)
        doc.text('FECHA', cDate, y)
        doc.text('PESO', cWeight, y)
        // 'Δ' (Griego) no existe en la codificación WinAnsi de las fuentes estándar de
        // jsPDF (renderiza un glifo erróneo) → etiqueta ASCII-safe. Los valores +/- sí son ASCII.
        doc.text('VAR.', cDelta, y)
        doc.text('ENERGÍA', cEnergy, y)
        doc.text('NOTAS', cNotes, y)
        y += 1.5
        setDraw(C.border)
        doc.setLineWidth(0.2)
        doc.line(margin, y, pageW - margin, y)
        y += 3.4

        for (let i = 0; i < cis.length; i++) {
            const ci = cis[i]
            const noteLines: string[] = ci.notes ? doc.splitTextToSize(ci.notes, notesW).slice(0, 3) : []
            const rowH = Math.max(5.6, 3 + noteLines.length * 3.4)
            checkPage(rowH + 1)
            if (i % 2 === 0) {
                setFill(C.card)
                doc.rect(margin, y - 3.7, contentW, rowH, 'F')
            }
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            setColor(C.textStrong)
            doc.text(fmtDate(ci.dateIso), cDate, y)
            setColor(C.textMid)
            doc.text(ci.weightKg != null ? `${ci.weightKg} kg` : '—', cWeight, y)
            // Δ coloreado.
            if (ci.weightDeltaKg == null) {
                setColor(C.muted)
                doc.text('—', cDelta, y)
            } else if (ci.weightDeltaKg > 0.05) {
                setColor(C.warning)
                doc.text(`+${ci.weightDeltaKg.toFixed(1)}`, cDelta, y)
            } else if (ci.weightDeltaKg < -0.05) {
                setColor(C.success)
                doc.text(`${ci.weightDeltaKg.toFixed(1)}`, cDelta, y)
            } else {
                setColor(C.muted)
                doc.text('0.0', cDelta, y)
            }
            setColor(C.textMid)
            doc.text(ci.energyLevel != null ? `${ci.energyLevel}/10` : '—', cEnergy, y)
            // Notas (multi-línea).
            if (noteLines.length) {
                doc.setFontSize(7.5)
                setColor(C.textMid)
                let nyy = y
                for (const nl of noteLines) {
                    doc.text(nl, cNotes, nyy)
                    nyy += 3.4
                }
            } else {
                setColor(C.muted)
                doc.text('—', cNotes, y)
            }
            y += rowH
        }
        // Nota de truncado (el mapper capea a los 30 más recientes).
        if (dossier.checkInsTotal > cis.length) {
            checkPage(6)
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(7)
            setColor(C.muted)
            doc.text(
                `Mostrando los ${cis.length} más recientes de ${dossier.checkInsTotal} check-ins.`,
                margin,
                y
            )
            y += 5
        }
        y += 3

        // Grid de fotos (máx 6 más recientes con photoUrl).
        const withPhotos = cis.filter((c) => !!c.photoUrl).slice(0, 6)
        if (withPhotos.length > 0) {
            checkPage(10)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            setColor(C.textMid)
            doc.text('FOTOS DE PROGRESO', margin, y, { charSpace: 0.3 })
            y += 5

            const cols = 3
            const pGap = 4
            const cellW = (contentW - pGap * (cols - 1)) / cols
            const imgH = cellW * 1.1
            const cellH = imgH + 6
            // Ratio de la celda destino: la foto se recorta (center-crop) a este ratio
            // en el canvas, así llenar la celda no la deforma.
            const targetRatio = (cellW - 2) / (imgH - 2)

            // Prefetch de TODAS las fotos en paralelo (baja la latencia total del export).
            // Cada una con su try/catch → null: un fetch fallido (TTL vencido / CORS /
            // timeout) se salta silenciosamente y no rompe el PDF.
            const photoDataUrls = await Promise.all(
                withPhotos.map(async (c) => {
                    try {
                        return await fetchImageAsJpegDataUrl(c.photoUrl as string, targetRatio)
                    } catch {
                        return null
                    }
                })
            )

            for (let i = 0; i < withPhotos.length; i++) {
                const col = i % cols
                if (col === 0) checkPage(cellH + 2)
                const px = margin + col * (cellW + pGap)
                const py = y
                // Marco de la foto.
                card(px, py, cellW, imgH, 1.8)
                const dataUrl = photoDataUrls[i]
                if (dataUrl) {
                    try {
                        // El JPEG ya viene recortado al ratio de la celda → llenar sin deformar.
                        doc.addImage(dataUrl, 'JPEG', px + 1, py + 1, cellW - 2, imgH - 2, undefined, 'FAST')
                    } catch {
                        photoPlaceholder(px, py, cellW, imgH)
                    }
                } else {
                    photoPlaceholder(px, py, cellW, imgH)
                }
                // Label de fecha.
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(6.5)
                setColor(C.muted)
                doc.text(fmtDate(withPhotos[i].dateIso), px + cellW / 2, py + imgH + 4, { align: 'center' })

                if (col === cols - 1) y += cellH + 2
            }
            // Si la última fila quedó incompleta, avanzar y igual.
            if (withPhotos.length % cols !== 0) y += cellH + 2
        }
    }

    function photoPlaceholder(px: number, py: number, w: number, h: number) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        setColor(C.muted)
        doc.text('foto no disponible', px + w / 2, py + h / 2, { align: 'center' })
    }

    // ─── FOOTER en cada página ────────────────────────────────────────────────────
    const total = doc.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
        doc.setPage(p)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        setColor(C.muted)
        doc.text(`Generado con EVA · ${fmtDate(dossier.generatedAtIso)}`, margin, pageH - 7)
        doc.text(`${p}/${total}`, pageW - margin, pageH - 7, { align: 'right' })
    }

    const stem = `dossier-${slugify(dossier.identity.fullName)}-${(dossier.generatedAtIso || '').slice(0, 10) || 'sf'}`
    doc.save(`${stem}.pdf`)
}

// Timeout del fetch de cada foto: una URL colgada no puede dejar el spinner infinito.
const PHOTO_FETCH_TIMEOUT_MS = 8000

/**
 * Descarga una imagen (posible webp), la CENTER-CROPea al aspect ratio de la celda
 * destino (`targetRatio` = ancho/alto) y la normaliza a un data URL JPEG que jsPDF sí
 * soporta. Así la celda se llena sin deformar fotos retrato (3:4 / 9:16). Devuelve
 * null si el entorno no tiene canvas o si la imagen no pudo decodificarse.
 */
async function fetchImageAsJpegDataUrl(url: string, targetRatio: number): Promise<string | null> {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
    // AbortSignal.timeout no existe en runtimes viejos → fallback sin señal.
    const init: RequestInit =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? { signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS) }
            : {}
    const res = await fetch(url, init)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    try {
        // Recorte fuente centrado (sx/sy/sw/sh) al ratio destino.
        const ratio = Number.isFinite(targetRatio) && targetRatio > 0 ? targetRatio : 1
        const srcRatio = bitmap.width / bitmap.height
        let sx = 0
        let sy = 0
        let sw = bitmap.width
        let sh = bitmap.height
        if (srcRatio > ratio) {
            // Fuente más ancha que la celda → recortar los costados.
            sw = Math.max(1, Math.round(bitmap.height * ratio))
            sx = Math.round((bitmap.width - sw) / 2)
        } else if (srcRatio < ratio) {
            // Fuente más alta (retrato) → recortar arriba/abajo.
            sh = Math.max(1, Math.round(bitmap.width / ratio))
            sy = Math.round((bitmap.height - sh) / 2)
        }
        // Acotar el tamaño para no inflar el PDF (fotos de móvil son enormes).
        const maxSide = 700
        const scale = Math.min(1, maxSide / Math.max(sw, sh))
        const w = Math.max(1, Math.round(sw * scale))
        const h = Math.max(1, Math.round(sh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        // drawImage de 9 argumentos: recorte fuente → canvas destino completo.
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h)
        return canvas.toDataURL('image/jpeg', 0.82)
    } finally {
        bitmap.close?.()
    }
}
