/**
 * Genera y descarga el DOSSIER del alumno como PDF real (jsPDF, client-side).
 *
 * Tema OSCURO premium: cada hoja se pinta con un rect de fondo sólido (jsPDF no tiene
 * fondo de página global). SOLO colores sólidos — nada de alpha/opacidad, incompatible
 * con PDF. El contenido ya es visible por el coach en la ficha; el archivo queda bajo su
 * control. @privacidad NO incluye pagos/billing (el dossier se comparte con el alumno).
 *
 * DOS modos, un solo renderer (R18):
 * - **hoy**: `dossier.period` ausente ⇒ sale EXACTAMENTE el dossier de siempre.
 * - **mes**: `dossier.period` presente ⇒ eyebrow «informe mensual · i de n», chip del mes,
 *   tiles del período, subtítulos ya resueltos por `@eva/client-dossier` y marca de récord nuevo.
 *
 * Varios informes: `downloadClientDossierPdf([d1, d2, d3])` los concatena en UN PDF con
 * numeración global; con `{ separate: true }` genera N PDF y los entrega en UN zip (`fflate`),
 * nunca N `doc.save()` seguidos (los navegadores bloquean la descarga múltiple).
 */

import { buildTodayTiles, dossierFileStem, slugifyClientName } from '@eva/client-dossier'

import type { ClientDossierData, DossierStatusLevel, DossierTone } from '@/services/client/client-dossier'

// El módulo se carga dinámicamente (`await import('jspdf')`); el tipo sí es estático.
import type { jsPDF } from 'jspdf'

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

/** `DossierTone` (modelo compartido) → paleta de este generador. `mid` = texto medio. */
const TONE_COLOR: Record<DossierTone, RGB> = {
    accent: C.accent,
    success: C.success,
    warning: C.warning,
    danger: C.danger,
    muted: C.muted,
    mid: C.textMid,
}

const STATUS_META: Record<DossierStatusLevel, { label: string; color: RGB }> = {
    urgente: { label: 'Urgente', color: C.danger },
    atencion: { label: 'Atención', color: C.warning },
    aldia: { label: 'Al día', color: C.success },
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Marca de «récord nuevo» en la tabla de récords del informe mensual.
 *
 * NO se usa «★» (U+2605): las fuentes estándar de jsPDF van en WinAnsiEncoding y el carácter
 * no existe ahí — jsPDF pasa la línea entera a 2 bytes y Helvetica la imprime como basura
 * (mismo motivo por el que la columna de check-ins dice «VAR.» y no «Δ»). Verificado con
 * `doc.output()`: `A★B` sale como `\0A&\5\0B`.
 */
const NEW_PR_MARKER = ' (nuevo)'
const NEW_PR_LEGEND = '(nuevo): supera el máximo de los meses anteriores.'

/**
 * Estados vacíos. En modo mes los textos hablan del PERÍODO (decir «en los últimos 30 días» o
 * «programa activo» en un informe de julio es falso) y son EXACTAMENTE los mismos que imprime el
 * generador HTML de RN: el coach puede exportar el mismo mes desde web o desde el teléfono y no
 * puede recibir dos frases distintas.
 */
const EMPTY = {
    program: { today: 'Sin programa activo asignado.', month: 'Sin programa ni entrenamientos registrados en el período.' },
    volume: {
        today: 'Sin volumen de entrenamiento en los últimos 30 días.',
        month: 'Sin volumen de entrenamiento en el período.',
    },
    nutrition: { today: 'Sin plan de nutrición vigente.', month: 'Sin plan de nutrición vigente en el período.' },
    checkIns: { today: 'Sin check-ins registrados.', month: 'Sin check-ins en el período.' },
} as const

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

/** `2026-07-01` + `2026-07-31` ⇒ `1–31 jul 2026`. Distinto mes ⇒ las dos fechas completas. */
function fmtPeriodRange(fromIso: string | null | undefined, toIso: string | null | undefined): string {
    const a = parseDate(fromIso)
    const b = parseDate(toIso)
    if (!a || !b) return '—'
    if (a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth()) {
        return `${fmtDate(fromIso)} – ${fmtDate(toIso)}`
    }
    const tail = `${MONTHS[b.getMonth()]} ${b.getFullYear()}`
    return a.getDate() === b.getDate() ? `${a.getDate()} ${tail}` : `${a.getDate()}–${b.getDate()} ${tail}`
}

// ─── Contexto de render ──────────────────────────────────────────────────────

/**
 * Agrupa el `doc`, la geometría de la hoja, el cursor `y` y los helpers de dibujo. Se crea UNA
 * vez por documento (`createRenderCtx`) y se reusa para todos los informes que van adentro: sin
 * esto, los helpers eran closures del cuerpo de la función y no se podían llamar en un bucle.
 */
type RenderCtx = {
    doc: jsPDF
    pageW: number
    pageH: number
    margin: number
    contentW: number
    footerReserve: number
    /** Cursor vertical, en mm. Lo mutan los helpers y las secciones. */
    y: number
    setColor: (c: RGB) => void
    setFill: (c: RGB) => void
    setDraw: (c: RGB) => void
    paintBg: () => void
    addPage: () => void
    checkPage: (needed: number) => void
    card: (x: number, yy: number, w: number, h: number, radius?: number) => void
    sectionHeader: (title: string) => void
    emptyState: (text: string) => void
    photoPlaceholder: (px: number, py: number, w: number, h: number) => void
}

function createRenderCtx(doc: jsPDF): RenderCtx {
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 14

    const ctx: RenderCtx = {
        doc,
        pageW,
        pageH,
        margin,
        contentW: pageW - margin * 2,
        footerReserve: 14,
        y: 0,
        setColor: (c) => doc.setTextColor(c[0], c[1], c[2]),
        setFill: (c) => doc.setFillColor(c[0], c[1], c[2]),
        setDraw: (c) => doc.setDrawColor(c[0], c[1], c[2]),

        paintBg() {
            ctx.setFill(C.bg)
            doc.rect(0, 0, pageW, pageH, 'F')
        },

        addPage() {
            doc.addPage()
            ctx.paintBg()
            ctx.y = margin
        },

        checkPage(needed: number) {
            if (ctx.y + needed > pageH - ctx.footerReserve) ctx.addPage()
        },

        card(x: number, yy: number, w: number, h: number, radius = 2.2) {
            ctx.setFill(C.card)
            doc.roundedRect(x, yy, w, h, radius, radius, 'F')
            ctx.setDraw(C.border)
            doc.setLineWidth(0.2)
            doc.roundedRect(x, yy, w, h, radius, radius, 'S')
        },

        sectionHeader(title: string) {
            ctx.checkPage(16)
            ctx.y += 3
            ctx.setFill(C.accent)
            doc.rect(margin, ctx.y - 3.6, 1.5, 4.6, 'F')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10.5)
            ctx.setColor(C.textStrong)
            doc.text(title.toUpperCase(), margin + 4, ctx.y, { charSpace: 0.4 })
            ctx.y += 3
            ctx.setDraw(C.border)
            doc.setLineWidth(0.25)
            doc.line(margin, ctx.y, pageW - margin, ctx.y)
            ctx.y += 5
        },

        emptyState(text: string) {
            ctx.checkPage(10)
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(8.5)
            ctx.setColor(C.muted)
            doc.text(text, margin, ctx.y)
            ctx.y += 7
        },

        photoPlaceholder(px: number, py: number, w: number, h: number) {
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(7)
            ctx.setColor(C.muted)
            doc.text('foto no disponible', px + w / 2, py + h / 2, { align: 'center' })
        },
    }

    return ctx
}

// ─── Render de UN informe ────────────────────────────────────────────────────

/**
 * Pinta un dossier completo arrancando en la página ACTUAL del `doc` (que debe estar recién
 * creada / vacía). El caller es el que decide si hubo `addPage()` antes y el que estampa el
 * footer al final, para que la numeración sea global cuando van varios informes juntos.
 */
async function renderDossierReport(
    ctx: RenderCtx,
    dossier: ClientDossierData,
    { index, total }: { index: number; total: number }
): Promise<void> {
    const { doc, pageW, margin, contentW } = ctx
    const { setColor, setFill, setDraw } = ctx
    const period = dossier.period ?? null
    const isMonth = period != null

    // ─── fondo + cabecera ───────────────────────────────────────────────────────
    ctx.paintBg()

    // Línea accent superior.
    setFill(C.accent)
    doc.rect(0, 0, pageW, 1.6, 'F')

    // Eyebrow.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor(C.accent)
    const eyebrow = isMonth ? `INFORME MENSUAL DEL ALUMNO · ${index} DE ${total}` : 'DOSSIER DEL ALUMNO'
    doc.text(eyebrow, margin, 12, { charSpace: 0.9 })

    // Chip (arriba a la derecha): estado+score en modo hoy, rótulo del mes en modo mes.
    const status = STATUS_META[dossier.status.level]
    const chipLabel = isMonth
        ? period.label.toUpperCase()
        : `${status.label.toUpperCase()} · SCORE ${dossier.status.attentionScore}`
    const chipColor = isMonth ? C.accent : status.color
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    const chipTextW = doc.getTextWidth(chipLabel)
    const chipW = chipTextW + 8
    const chipH = 6.5
    const chipX = pageW - margin - chipW
    const chipY = 8
    setFill(chipColor)
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
    ctx.y = ny + 1

    // Sub-línea: email · teléfono.
    const contactParts = [dossier.identity.email, dossier.identity.phone].filter(Boolean) as string[]
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setColor(C.textMid)
    if (contactParts.length) {
        doc.text(contactParts.join('   ·   '), margin, ctx.y)
        ctx.y += 5
    }

    // Cliente desde · estado activo · (racha | período) · fecha de generación.
    doc.setFontSize(8.5)
    setColor(C.muted)
    const metaLine = [
        `Cliente desde ${fmtMonthYear(dossier.identity.clientSinceIso)}`,
        dossier.identity.isActive ? 'Activo' : 'Pausado',
        // La racha es una métrica del PRESENTE ⇒ no aplica a un informe de un mes cerrado.
        isMonth
            ? `Período ${fmtPeriodRange(period.fromIso, period.toIso)}`
            : `Racha ${dossier.identity.streakDays} día${dossier.identity.streakDays === 1 ? '' : 's'}`,
        `Generado ${fmtDate(dossier.generatedAtIso)}`,
    ].join('   ·   ')
    doc.text(metaLine, margin, ctx.y)
    ctx.y += 8

    // ─── GRID DE 6 KPI CARDS (2×3) ───────────────────────────────────────────────
    // Los cuadros ya vienen resueltos por el modelo (R14): en modo mes los arma
    // `buildClientMonthDossier`; en modo hoy los reproduce `buildTodayTiles` con las MISMAS
    // reglas que tenía este archivo (rótulos, dead-band ±0.05 del Δ y umbrales 80/50).
    const tiles = (dossier.tiles?.length ? dossier.tiles : buildTodayTiles(dossier)).slice(0, 6)

    const kGap = 4
    const kW = (contentW - kGap * 2) / 3
    const kH = 21
    for (let i = 0; i < tiles.length; i++) {
        const col = i % 3
        const row = Math.floor(i / 3)
        const kx = margin + col * (kW + kGap)
        const ky = ctx.y + row * (kH + kGap)
        const k = tiles[i]
        ctx.card(kx, ky, kW, kH)
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
        setColor(TONE_COLOR[k.tone] ?? C.muted)
        doc.text(k.sub, kx + 4, ky + 18)
    }
    ctx.y += kH * 2 + kGap + 4

    // ─── PROGRAMA ─────────────────────────────────────────────────────────────────
    ctx.sectionHeader('Programa')
    if (!dossier.program) {
        ctx.emptyState(isMonth ? EMPTY.program.month : EMPTY.program.today)
    } else {
        const p = dossier.program
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        setColor(C.textStrong)
        const nameLine = doc.splitTextToSize(p.name, contentW)
        doc.text(nameLine[0], margin, ctx.y)
        ctx.y += 5
        // Modo mes: el subtítulo lo resuelve el modelo («Semanas 2–7 de 12 · finalizó el 18 jul»).
        // Cuando viene null (fallback «Entrenamientos registrados», que no es un programa real) NO
        // se cae al texto de hoy: imprimiría «Semana 0/1 · 0 días restantes».
        const subtitle = isMonth
            ? (p.subtitle ?? '')
            : `Semana ${p.currentWeek}/${p.totalWeeks}   ·   ${p.daysRemaining} día${p.daysRemaining === 1 ? '' : 's'} restantes`
        if (subtitle) {
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8.5)
            setColor(C.textMid)
            doc.text(subtitle, margin, ctx.y)
            ctx.y += 6
        } else {
            ctx.y += 1
        }
        if (p.days.length === 0) {
            ctx.emptyState('El programa no tiene días con ejercicios cargados.')
        } else {
            for (const d of p.days) {
                ctx.checkPage(5.5)
                setFill(C.accent)
                doc.circle(margin + 1, ctx.y - 1.2, 0.7, 'F')
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8.5)
                setColor(C.textStrong)
                const dayName = doc.splitTextToSize(d.title, contentW - 40)[0]
                doc.text(dayName, margin + 4, ctx.y)
                // `blockCount === 0` = nombre de plan sacado de los logs (sin programa vigente):
                // no hay conteo de ejercicios que mostrar, imprimir «0 ejercicios» sería mentira.
                if (d.blockCount > 0) {
                    doc.setFont('helvetica', 'normal')
                    doc.setFontSize(8)
                    setColor(C.muted)
                    doc.text(`${d.blockCount} ejercicio${d.blockCount === 1 ? '' : 's'}`, pageW - margin, ctx.y, {
                        align: 'right',
                    })
                }
                ctx.y += 5
            }
        }
    }
    ctx.y += 2

    // ─── ENTRENAMIENTO ──────────────────────────────────────────────────────────
    ctx.sectionHeader('Entrenamiento')

    // Récords personales.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(C.textMid)
    ctx.checkPage(8)
    doc.text('RÉCORDS PERSONALES', margin, ctx.y, { charSpace: 0.3 })
    ctx.y += 4
    const prs = dossier.training.personalRecords
    if (prs.length === 0) {
        ctx.emptyState('Sin récords de fuerza registrados.')
    } else {
        // Cabecera de tabla.
        const colEx = margin + 3
        const colMg = margin + contentW * 0.5
        const colMax = margin + contentW * 0.74
        const colReps = margin + contentW * 0.88
        ctx.checkPage(6)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        setColor(C.muted)
        doc.text('EJERCICIO', colEx, ctx.y)
        doc.text('GRUPO', colMg, ctx.y)
        doc.text('MÁX', colMax, ctx.y)
        doc.text('REPS', colReps, ctx.y)
        ctx.y += 1.5
        setDraw(C.border)
        doc.setLineWidth(0.2)
        doc.line(margin, ctx.y, pageW - margin, ctx.y)
        ctx.y += 3.2
        let anyNewPr = false
        for (let i = 0; i < prs.length; i++) {
            const r = prs[i]
            const marked = isMonth && r.isNew === true
            if (marked) anyNewPr = true
            ctx.checkPage(6)
            if (i % 2 === 0) {
                setFill(C.card)
                doc.rect(margin, ctx.y - 3.7, contentW, 5.6, 'F')
            }
            // Ancho del nombre: se le descuenta la marca «(nuevo)» para que no se pisen.
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            const markerW = marked ? doc.getTextWidth(NEW_PR_MARKER) : 0
            doc.setFont('helvetica', 'normal')
            const nameTxt = doc.splitTextToSize(r.exerciseName, Math.max(12, contentW * 0.46 - markerW))[0]
            setColor(C.textStrong)
            doc.text(nameTxt, colEx, ctx.y)
            if (marked) {
                const nameW = doc.getTextWidth(nameTxt)
                doc.setFont('helvetica', 'bold')
                setColor(C.accent)
                doc.text(NEW_PR_MARKER, colEx + nameW, ctx.y)
                doc.setFont('helvetica', 'normal')
            }
            doc.setFontSize(8)
            setColor(C.textMid)
            doc.text(doc.splitTextToSize(r.muscleGroup, contentW * 0.22)[0], colMg, ctx.y)
            doc.setFont('helvetica', 'bold')
            setColor(C.accent)
            doc.text(`${r.maxWeightKg} kg`, colMax, ctx.y)
            doc.setFont('helvetica', 'normal')
            setColor(C.textMid)
            doc.text(`${r.repsAtMax}`, colReps, ctx.y)
            ctx.y += 5.6
        }
        // Leyenda de la marca: solo en modo mes y solo si hay algo marcado.
        if (anyNewPr) {
            ctx.checkPage(6)
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(7)
            setColor(C.muted)
            doc.text(NEW_PR_LEGEND, margin, ctx.y)
            ctx.y += 5
        }
    }
    ctx.y += 3

    // Volumen por grupo (mini bar-chart).
    ctx.checkPage(8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(C.textMid)
    const volTitle = isMonth ? `VOLUMEN POR GRUPO (${period.label.toUpperCase()})` : 'VOLUMEN POR GRUPO (30D)'
    doc.text(volTitle, margin, ctx.y, { charSpace: 0.3 })
    ctx.y += 4.5
    const vol = dossier.training.muscleVolume
    if (vol.length === 0) {
        ctx.emptyState(isMonth ? EMPTY.volume.month : EMPTY.volume.today)
    } else {
        const maxVol = Math.max(...vol.map((v) => v.volume), 1)
        const labelW = 34
        const valW = 22
        const barX = margin + labelW
        const barMaxW = contentW - labelW - valW
        for (const v of vol) {
            ctx.checkPage(6)
            // label
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7.5)
            setColor(C.textMid)
            doc.text(doc.splitTextToSize(v.muscleGroup, labelW - 2)[0], margin, ctx.y)
            // track
            setFill(C.card)
            doc.roundedRect(barX, ctx.y - 2.8, barMaxW, 3.4, 0.8, 0.8, 'F')
            // barra
            const bw = Math.max(1, (v.volume / maxVol) * barMaxW)
            setFill(C.accent)
            doc.roundedRect(barX, ctx.y - 2.8, bw, 3.4, 0.8, 0.8, 'F')
            // valor
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7.5)
            setColor(C.textStrong)
            doc.text(`${v.volume.toLocaleString('es-CL')} kg`, pageW - margin, ctx.y, { align: 'right' })
            ctx.y += 5.6
        }
    }
    ctx.y += 3

    // ─── NUTRICIÓN ──────────────────────────────────────────────────────────────
    ctx.sectionHeader('Nutrición')
    if (!dossier.nutrition) {
        ctx.emptyState(isMonth ? EMPTY.nutrition.month : EMPTY.nutrition.today)
    } else {
        const n = dossier.nutrition
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        setColor(C.textStrong)
        doc.text(doc.splitTextToSize(n.planName, contentW)[0], margin, ctx.y)
        ctx.y += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        setColor(C.muted)
        // Modo mes: la línea ya viene resuelta («12 de 20 días registrados»); NO se imprime
        // la adherencia SEMANAL ni el conteo de franjas de hoy (el modelo mensual los deja en 0).
        // Modo hoy: plan V2, franjas del día vigente. Multi-día ⇒ se avisa que las metas cambian
        // por día (el detalle por variante va abajo).
        let nutriLine: string
        if (isMonth) {
            nutriLine = n.subtitle ?? ''
        } else {
            const mealsNoun = `franja${n.mealsTotal === 1 ? '' : 's'}`
            const mealsLabel = n.hasDaySpecificMeals
                ? `${n.mealsTotal} ${mealsNoun} hoy (las metas varían por día)`
                : `${n.mealsTotal} ${mealsNoun} por día`
            const weeklyLabel =
                n.weeklyInRangePct == null
                    ? null
                    : `Adherencia semanal ${n.weeklyInRangePct}% (${n.weeklyInRangeDays} de ${n.weeklyTrackedDays} día${n.weeklyTrackedDays === 1 ? '' : 's'} en rango)`
            nutriLine = [mealsLabel, weeklyLabel].filter(Boolean).join('   ·   ')
        }
        if (nutriLine) {
            doc.text(nutriLine, margin, ctx.y)
            ctx.y += 6
        } else {
            ctx.y += 1
        }

        // Chips de objetivos. En modo mes el jsonb puede no traer metas (snapshots lazy, R9):
        // cuatro «—» seguidos no informan nada ⇒ se omite el bloque entero.
        const hasAnyGoal =
            n.goals.calories != null || n.goals.protein != null || n.goals.carbs != null || n.goals.fats != null
        if (!isMonth || hasAnyGoal) {
            const goals: { label: string; value: string; color: RGB }[] = [
                { label: 'KCAL', value: n.goals.calories != null ? `${n.goals.calories}` : '—', color: C.accent },
                {
                    label: 'PROTEÍNA',
                    value: n.goals.protein != null ? `${n.goals.protein} g` : '—',
                    color: C.success,
                },
                { label: 'CARBOS', value: n.goals.carbs != null ? `${n.goals.carbs} g` : '—', color: C.warning },
                { label: 'GRASAS', value: n.goals.fats != null ? `${n.goals.fats} g` : '—', color: C.textMid },
            ]
            ctx.checkPage(16)
            const gGap = 4
            const gW = (contentW - gGap * 3) / 4
            const gH = 14
            for (let i = 0; i < goals.length; i++) {
                const gx = margin + i * (gW + gGap)
                ctx.card(gx, ctx.y, gW, gH)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(5.5)
                setColor(goals[i].color)
                doc.text(goals[i].label, gx + 3.5, ctx.y + 5, { charSpace: 0.3 })
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(11)
                setColor(C.textStrong)
                doc.text(goals[i].value, gx + 3.5, ctx.y + 11)
            }
            ctx.y += gH + 4
        }

        // Plan multi-día: kcal por variante ("Base 2.200 kcal · Sábado 2.600 kcal"). Los chips de
        // arriba son las metas de HOY; sin esta línea el PDF ocultaría que el plan cambia por día.
        if (n.dayTargets.length > 1) {
            ctx.checkPage(6)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(6.5)
            setColor(C.muted)
            doc.text('METAS POR DÍA', margin, ctx.y, { charSpace: 0.3 })
            ctx.y += 4
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            setColor(C.textMid)
            const perDay = n.dayTargets
                .map((v) => `${v.label}: ${v.calories == null ? '—' : `${v.calories.toLocaleString('es-CL')} kcal`}`)
                .join('   ·   ')
            for (const line of doc.splitTextToSize(perDay, contentW)) {
                ctx.checkPage(4.6)
                doc.text(line, margin, ctx.y)
                ctx.y += 4.2
            }
            ctx.y += 1
        }
    }
    ctx.y += 2

    // ─── CHECK-INS ──────────────────────────────────────────────────────────────
    ctx.sectionHeader('Check-ins')
    const cis = dossier.checkIns
    if (cis.length === 0) {
        ctx.emptyState(isMonth ? EMPTY.checkIns.month : EMPTY.checkIns.today)
        return
    }

    // Cabecera de tabla.
    const cDate = margin + 3
    const cWeight = margin + contentW * 0.24
    const cDelta = margin + contentW * 0.4
    const cEnergy = margin + contentW * 0.56
    const cNotes = margin + contentW * 0.72
    const notesW = contentW * 0.28 - 4
    ctx.checkPage(6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    setColor(C.muted)
    doc.text('FECHA', cDate, ctx.y)
    doc.text('PESO', cWeight, ctx.y)
    // 'Δ' (Griego) no existe en la codificación WinAnsi de las fuentes estándar de
    // jsPDF (renderiza un glifo erróneo) → etiqueta ASCII-safe. Los valores +/- sí son ASCII.
    doc.text('VAR.', cDelta, ctx.y)
    doc.text('ENERGÍA', cEnergy, ctx.y)
    doc.text('NOTAS', cNotes, ctx.y)
    ctx.y += 1.5
    setDraw(C.border)
    doc.setLineWidth(0.2)
    doc.line(margin, ctx.y, pageW - margin, ctx.y)
    ctx.y += 3.4

    for (let i = 0; i < cis.length; i++) {
        const ci = cis[i]
        const noteLines: string[] = ci.notes ? doc.splitTextToSize(ci.notes, notesW).slice(0, 3) : []
        const rowH = Math.max(5.6, 3 + noteLines.length * 3.4)
        ctx.checkPage(rowH + 1)
        if (i % 2 === 0) {
            setFill(C.card)
            doc.rect(margin, ctx.y - 3.7, contentW, rowH, 'F')
        }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        setColor(C.textStrong)
        doc.text(fmtDate(ci.dateIso), cDate, ctx.y)
        setColor(C.textMid)
        doc.text(ci.weightKg != null ? `${ci.weightKg} kg` : '—', cWeight, ctx.y)
        // Δ coloreado.
        if (ci.weightDeltaKg == null) {
            setColor(C.muted)
            doc.text('—', cDelta, ctx.y)
        } else if (ci.weightDeltaKg > 0.05) {
            setColor(C.warning)
            doc.text(`+${ci.weightDeltaKg.toFixed(1)}`, cDelta, ctx.y)
        } else if (ci.weightDeltaKg < -0.05) {
            setColor(C.success)
            doc.text(`${ci.weightDeltaKg.toFixed(1)}`, cDelta, ctx.y)
        } else {
            setColor(C.muted)
            doc.text('0.0', cDelta, ctx.y)
        }
        setColor(C.textMid)
        doc.text(ci.energyLevel != null ? `${ci.energyLevel}/10` : '—', cEnergy, ctx.y)
        // Notas (multi-línea).
        if (noteLines.length) {
            doc.setFontSize(7.5)
            setColor(C.textMid)
            let nyy = ctx.y
            for (const nl of noteLines) {
                doc.text(nl, cNotes, nyy)
                nyy += 3.4
            }
        } else {
            setColor(C.muted)
            doc.text('—', cNotes, ctx.y)
        }
        ctx.y += rowH
    }
    // Nota de truncado (el mapper capea a los 30 más recientes).
    if (dossier.checkInsTotal > cis.length) {
        ctx.checkPage(6)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(7)
        setColor(C.muted)
        doc.text(`Mostrando los ${cis.length} más recientes de ${dossier.checkInsTotal} check-ins.`, margin, ctx.y)
        ctx.y += 5
    }
    ctx.y += 3

    // Grid de fotos (máx 6 más recientes con photoUrl). Sin `photoUrl` firmada ⇒ sin bloque.
    const withPhotos = cis.filter((c) => !!c.photoUrl).slice(0, 6)
    if (withPhotos.length === 0) return

    ctx.checkPage(10)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(C.textMid)
    doc.text('FOTOS DE PROGRESO', margin, ctx.y, { charSpace: 0.3 })
    ctx.y += 5

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
        if (col === 0) ctx.checkPage(cellH + 2)
        const px = margin + col * (cellW + pGap)
        const py = ctx.y
        // Marco de la foto.
        ctx.card(px, py, cellW, imgH, 1.8)
        const dataUrl = photoDataUrls[i]
        if (dataUrl) {
            try {
                // El JPEG ya viene recortado al ratio de la celda → llenar sin deformar.
                doc.addImage(dataUrl, 'JPEG', px + 1, py + 1, cellW - 2, imgH - 2, undefined, 'FAST')
            } catch {
                ctx.photoPlaceholder(px, py, cellW, imgH)
            }
        } else {
            ctx.photoPlaceholder(px, py, cellW, imgH)
        }
        // Label de fecha.
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        setColor(C.muted)
        doc.text(fmtDate(withPhotos[i].dateIso), px + cellW / 2, py + imgH + 4, { align: 'center' })

        if (col === cols - 1) ctx.y += cellH + 2
    }
    // Si la última fila quedó incompleta, avanzar y igual.
    if (withPhotos.length % cols !== 0) ctx.y += cellH + 2
}

/** Footer en TODAS las páginas del documento: numeración global «p/total» (R18). */
function paintFooters(ctx: RenderCtx, generatedAtIso: string): void {
    const { doc, pageW, pageH, margin } = ctx
    const total = doc.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
        doc.setPage(p)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        ctx.setColor(C.muted)
        doc.text(`Generado con EVA · ${fmtDate(generatedAtIso)}`, margin, pageH - 7)
        doc.text(`${p}/${total}`, pageW - margin, pageH - 7, { align: 'right' })
    }
}

// ─── Nombres de archivo ──────────────────────────────────────────────────────

/** Nombre del dossier «de hoy» (sin período): `dossier-<slug>-<yyyy-mm-dd>`. Igual que siempre. */
function todayStem(d: ClientDossierData): string {
    return `dossier-${slugifyClientName(d.identity.fullName)}-${(d.generatedAtIso || '').slice(0, 10) || 'sf'}`
}

/** Nombre de UN informe: por mes si tiene período, si no el de hoy. */
function reportStem(d: ClientDossierData): string {
    return d.period ? dossierFileStem(d.identity.fullName, [d.period.monthKey]) : todayStem(d)
}

/** Nombre del conjunto: `dossier-<slug>-2026-07_2026-09` (primero y último mes pedidos). */
function bundleStem(list: ClientDossierData[]): string {
    const monthKeys = list.map((d) => d.period?.monthKey).filter((k): k is string => !!k)
    if (monthKeys.length === 0) return todayStem(list[0])
    return dossierFileStem(list[0].identity.fullName, monthKeys)
}

/** Desambigua nombres repetidos dentro del zip (`zipSync` pisaría la entrada silenciosamente). */
function uniqueStems(list: ClientDossierData[]): string[] {
    const seen = new Map<string, number>()
    return list.map((d) => {
        const base = reportStem(d)
        const n = (seen.get(base) ?? 0) + 1
        seen.set(base, n)
        return n === 1 ? base : `${base}-${n}`
    })
}

/**
 * Dispara la descarga de un blob con un `<a download>` temporal.
 *
 * `doc.save()` de jsPDF hace esto mismo por dentro, pero acá el blob es un zip. La URL se revoca
 * en el próximo tick: revocarla en la misma vuelta del event loop cancela la descarga en Safari.
 */
function saveBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    try {
        a.click()
    } finally {
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 0)
    }
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Genera y descarga el/los dossier(s).
 *
 * - 1 informe ⇒ un PDF (`doc.save`), como siempre.
 * - N informes ⇒ un PDF con `addPage()` entre informes y footer con numeración GLOBAL.
 * - N informes con `{ separate: true }` ⇒ N PDF empaquetados en UN zip (`fflate`). Nunca N
 *   `doc.save()` seguidos: el navegador bloquea la segunda descarga.
 */
export async function downloadClientDossierPdf(
    input: ClientDossierData | ClientDossierData[],
    opts?: { separate?: boolean }
): Promise<void> {
    const list = Array.isArray(input) ? input : [input]
    if (list.length === 0) return

    const { jsPDF: JsPDF } = await import('jspdf')
    // `generatedAtIso` es ÚNICO para toda la exportación (R15): el footer usa el del primero.
    const generatedAtIso = list[0].generatedAtIso

    // ── N informes separados ⇒ un doc por informe, todo dentro de un zip.
    if (opts?.separate && list.length > 1) {
        const { zipSync } = await import('fflate')
        const stems = uniqueStems(list)
        const files: Record<string, Uint8Array> = {}
        for (let i = 0; i < list.length; i++) {
            const doc = new JsPDF({ unit: 'mm', format: 'a4' })
            const ctx = createRenderCtx(doc)
            await renderDossierReport(ctx, list[i], { index: i + 1, total: list.length })
            paintFooters(ctx, list[i].generatedAtIso || generatedAtIso)
            files[`${stems[i]}.pdf`] = new Uint8Array(doc.output('arraybuffer'))
        }
        const zipped = zipSync(files, { level: 6 })
        saveBlob(`${bundleStem(list)}.zip`, new Blob([zipped], { type: 'application/zip' }))
        return
    }

    // ── 1 informe, o N concatenados en un solo documento.
    const doc = new JsPDF({ unit: 'mm', format: 'a4' })
    const ctx = createRenderCtx(doc)
    for (let i = 0; i < list.length; i++) {
        // Cada informe arranca en hoja nueva; la primera ya existe.
        if (i > 0) doc.addPage()
        await renderDossierReport(ctx, list[i], { index: i + 1, total: list.length })
    }
    paintFooters(ctx, generatedAtIso)

    doc.save(`${list.length > 1 ? bundleStem(list) : reportStem(list[0])}.pdf`)
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
