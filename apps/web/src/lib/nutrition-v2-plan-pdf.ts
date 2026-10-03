/**
 * PDF de la pauta V2 — la versión que la nutricionista entrega en consulta.
 *
 * Por qué existe: la V1 tenía PDF (`nutrition-exchange-pdf.ts`) y la V2, que es la canónica, no
 * tenía ninguno. Las nutricionistas lo nombran como su objeción número uno: sacaban pantallazos o
 * rearmaban la pauta en Canva. Este PDF tiene que poder entregarse tal cual: marca del coach,
 * metas, el día ordenado por horario, cada comida con medidas caseras, reemplazos y porciones,
 * la lista de equivalencias y, si se pide, una hoja de registro semanal para imprimir.
 *
 * Misma arquitectura que el PDF V1: 100 % en el navegador con jsPDF (sin servidor, el plan no viaja)
 * y marca por tenant resuelta server-side (`nutrition-pdf-brand.ts`). `buildNutritionV2PlanPdfModel`
 * es PURO y testeable; `downloadNutritionV2PlanPdf` lo dibuja con import dinámico de jspdf.
 *
 * Tipografía: helvetica (WinAnsi). Nada de caracteres fuera de Latin-1 (≈, →, ✓): jsPDF los
 * imprime como basura con las fuentes estándar.
 */

import {
    buildNutritionPlanDowStrip,
    sortNutritionDayVariantsForDisplay,
    type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import { getEvaBadgeUrl } from '@eva/tiers'
import type { PdfBrand } from '@/domain/nutrition/exchange.types'
import { derivePdfPalette, hexToRgb, type Rgb } from '@/lib/nutrition-pdf-brand'

// ─── Entrada ────────────────────────────────────────────────────────────────────

type PlanDayVariant = NutritionPlanReadModel['dayVariants'][number]
type PlanMealSlot = PlanDayVariant['mealSlots'][number]

/** Alimento de la lista de equivalencias de un grupo (V2: `exchange_group_foods`). */
export type PlanPdfEquivalenceFood = {
    exchangeGroupId: string
    name: string
    brand?: string | null
    portionLabel: string | null
    portionGrams: number | null
}

export type PlanPdfPageSize = 'letter' | 'a4'

export type PlanPdfOptions = {
    pageSize: PlanPdfPageSize
    /** Metas y macros visibles. Algunas profesionales las ocultan (p. ej. conducta alimentaria). */
    includeMacros: boolean
    includeEquivalences: boolean
    /** Hoja de registro semanal para imprimir. */
    includeTracker: boolean
}

export const DEFAULT_PLAN_PDF_OPTIONS: PlanPdfOptions = {
    pageSize: 'letter',
    includeMacros: true,
    includeEquivalences: true,
    includeTracker: false,
}

export type PlanPdfInput = {
    plan: NutritionPlanReadModel
    brand: PdfBrand
    clientName: string | null
    equivalences: readonly PlanPdfEquivalenceFood[]
    options: PlanPdfOptions
    /** Fecha de entrega (YYYY-MM-DD, Santiago). Inyectada para que el modelo sea puro. */
    todayIso: string
}

// ─── Modelo ─────────────────────────────────────────────────────────────────────

export type PlanPdfMacros = { calories: number; proteinG: number; carbsG: number; fatsG: number }

export type PlanPdfItem = {
    name: string
    brand: string | null
    amount: string
    optional: boolean
    notes: string | null
    swaps: string[]
}

export type PlanPdfPortion = { code: string; name: string; color: string; portions: string; notes: string | null }

export type PlanPdfSlot = {
    time: string | null
    name: string
    instructions: string | null
    items: PlanPdfItem[]
    portions: PlanPdfPortion[]
    macros: PlanPdfMacros
    /** "2C · 1LAC · 1F" para la línea de tiempo. */
    portionCodes: string
}

export type PlanPdfDay = {
    title: string
    appliesTo: string
    targets: PlanPdfTargets | null
    slots: PlanPdfSlot[]
}

export type PlanPdfTargets = {
    calories: number | null
    proteinG: number | null
    carbsG: number | null
    fatsG: number | null
    fiberG: number | null
    waterMl: number | null
    sodiumMg: number | null
}

export type PlanPdfMacroSplit = { protein: number; carbs: number; fats: number }

export type PlanPdfWeekCell = { short: string; variantTitle: string; calories: number | null; own: boolean }

export type PlanPdfEquivalenceGroup = {
    code: string
    name: string
    color: string
    refLine: string
    foods: { name: string; portion: string; grams: string }[]
    moreCount: number
}

export type PlanPdfModel = {
    brandName: string
    planName: string
    clientName: string | null
    meta: { label: string; value: string }[]
    showMacros: boolean
    targets: PlanPdfTargets | null
    macroSplit: PlanPdfMacroSplit | null
    targetsCaption: string | null
    week: PlanPdfWeekCell[] | null
    glance: PlanPdfSlot[]
    notes: string | null
    days: PlanPdfDay[]
    equivalences: PlanPdfEquivalenceGroup[]
    tracker: { rows: string[] } | null
    hasPortions: boolean
    fileName: string
}

const EQUIVALENCE_FOODS_PER_GROUP = 14

const nf = (value: number, digits = 0) =>
    value.toLocaleString('es-CL', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** 0.5 ⇒ "½", 1.5 ⇒ "1½": como se escriben las porciones en una pauta chilena. */
export function formatPdfPortions(value: number): string {
    const whole = Math.trunc(value)
    const frac = Math.round((value - whole) * 100) / 100
    const fracGlyph = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : null
    if (frac === 0) return String(whole)
    if (fracGlyph) return whole === 0 ? fracGlyph : `${whole}${fracGlyph}`
    return nf(value, 2)
}

function formatTime(value: string | null): string | null {
    if (!value) return null
    const m = /^(\d{1,2}):(\d{2})/.exec(value.trim())
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

function formatDateEs(iso: string | null | undefined): string | null {
    if (!iso) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function formatQuantity(quantity: number, unit: string): string {
    const u = unit.trim()
    return `${nf(quantity, 1)}${u === 'g' || u === 'ml' ? ' ' : ' '}${u}`.trim()
}

/** "2 huevos (122 g)" si hay medida casera; si no, "122 g". Rango "100–150 g" cuando lo hay. */
function formatItemAmount(item: PlanMealSlot['prescriptionItems'][number]): string {
    const base =
        item.minimumQuantity != null &&
        item.maximumQuantity != null &&
        item.maximumQuantity > item.minimumQuantity
            ? `${nf(item.minimumQuantity, 1)}–${formatQuantity(item.maximumQuantity, item.unit)}`
            : formatQuantity(item.quantity, item.unit)
    const household = item.householdLabel?.trim()
    return household ? `${household} (${base})` : base
}

function slotMacros(slot: PlanMealSlot): PlanPdfMacros {
    const sum = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }
    for (const item of slot.prescriptionItems) {
        if (item.optional) continue
        sum.calories += item.macros.calories ?? 0
        sum.proteinG += item.macros.proteinG ?? 0
        sum.carbsG += item.macros.carbsG ?? 0
        sum.fatsG += item.macros.fatsG ?? 0
    }
    for (const target of slot.exchangeTargets ?? []) {
        sum.calories += target.ref.calories * target.portions
        sum.proteinG += target.ref.proteinG * target.portions
        sum.carbsG += target.ref.carbsG * target.portions
        sum.fatsG += target.ref.fatsG * target.portions
    }
    const t = slot.targets
    return {
        calories: Math.round(t?.calories ?? sum.calories),
        proteinG: Math.round(t?.proteinG ?? sum.proteinG),
        carbsG: Math.round(t?.carbsG ?? sum.carbsG),
        fatsG: Math.round(t?.fatsG ?? sum.fatsG),
    }
}

function buildSlot(slot: PlanMealSlot, colorByGroupId: Map<string, string>): PlanPdfSlot {
    const portions = [...(slot.exchangeTargets ?? [])]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((t) => ({
            code: t.groupCode,
            name: t.groupName,
            color: t.color && hexToRgb(t.color) ? t.color : (colorByGroupId.get(t.exchangeGroupId) ?? '#64748B'),
            portions: formatPdfPortions(t.portions),
            notes: t.notes?.trim() || null,
        }))
    return {
        time: formatTime(slot.startTime),
        name: slot.name,
        instructions: slot.instructions?.trim() || null,
        items: slot.prescriptionItems.map((item) => ({
            name: item.name?.trim() || 'Alimento',
            brand: item.brand?.trim() || null,
            amount: formatItemAmount(item),
            optional: item.optional,
            notes: item.notes?.trim() || null,
            swaps: (item.substitutions ?? []).map((s) =>
                s.quantity != null && s.unit ? `${s.name} (${formatQuantity(s.quantity, s.unit)})` : s.name,
            ),
        })),
        portions,
        macros: slotMacros(slot),
        portionCodes: portions.map((p) => `${p.portions}${p.code}`).join(' · '),
    }
}

function toTargets(t: PlanDayVariant['targets'] | null | undefined): PlanPdfTargets | null {
    if (!t) return null
    const out: PlanPdfTargets = {
        calories: t.calories ?? null,
        proteinG: t.proteinG ?? null,
        carbsG: t.carbsG ?? null,
        fatsG: t.fatsG ?? null,
        fiberG: t.fiberG ?? null,
        waterMl: t.waterMl ?? null,
        sodiumMg: t.sodiumMg ?? null,
    }
    return Object.values(out).some((v) => v != null) ? out : null
}

/** Reparto de la energía en % (4/4/9 kcal por gramo). Null si falta algún macro. */
export function macroEnergySplit(t: PlanPdfTargets | null): PlanPdfMacroSplit | null {
    if (!t || t.proteinG == null || t.carbsG == null || t.fatsG == null) return null
    const p = t.proteinG * 4
    const c = t.carbsG * 4
    const f = t.fatsG * 9
    const total = p + c + f
    if (total <= 0) return null
    const protein = Math.round((p / total) * 100)
    const fats = Math.round((f / total) * 100)
    return { protein, carbs: 100 - protein - fats, fats }
}

function safeFileStem(value: string): string {
    const ascii = value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return ascii.slice(0, 60) || 'pauta'
}

export function buildNutritionV2PlanPdfModel(input: PlanPdfInput): PlanPdfModel {
    const { plan, options } = input
    const summary = plan.plan
    const groups = plan.exchangeGroups ?? []
    const colorByGroupId = new Map(groups.map((g) => [g.id, g.color && hexToRgb(g.color) ? g.color : '#64748B']))

    const variants = sortNutritionDayVariantsForDisplay(plan.dayVariants)
    const baseVariant = variants.find((v) => v.isDefault) ?? variants[0] ?? null
    const cells = buildNutritionPlanDowStrip({ variants: plan.dayVariants })

    const days: PlanPdfDay[] = variants.map((variant) => {
        const own = cells.filter((cell) => cell.variant?.id === variant.id)
        const appliesTo =
            own.length === 7 ? 'Todos los días' : own.length === 0 ? 'Sin días asignados' : own.map((c) => c.longLabel).join(' · ')
        return {
            title: variants.length === 1 ? 'Tu día' : variant.label,
            appliesTo,
            targets: toTargets(variant.targets),
            slots: variant.mealSlots.map((slot) => buildSlot(slot, colorByGroupId)),
        }
    })

    const baseTargets = toTargets(baseVariant?.targets)
    const multiDay = variants.length > 1
    const targetsDiffer =
        multiDay &&
        variants.some((v) => {
            const t = toTargets(v.targets)
            return t?.calories !== baseTargets?.calories
        })

    const week: PlanPdfWeekCell[] | null = multiDay
        ? cells.map((cell) => ({
              short: cell.shortLabel,
              variantTitle: cell.variant?.label ?? '—',
              calories: cell.variant?.targets?.calories ?? null,
              own: cell.isOwnDay,
          }))
        : null

    // Equivalencias: solo de los grupos que la pauta usa, en el orden del diccionario.
    const usedGroupIds = new Set(
        plan.dayVariants.flatMap((v) => v.mealSlots.flatMap((s) => (s.exchangeTargets ?? []).map((t) => t.exchangeGroupId))),
    )
    const hasPortions = usedGroupIds.size > 0
    const equivalences: PlanPdfEquivalenceGroup[] =
        options.includeEquivalences && hasPortions
            ? groups
                  .filter((g) => usedGroupIds.has(g.id) && !g.composedOf?.length)
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
                  .map((g) => {
                      const foods = input.equivalences.filter((f) => f.exchangeGroupId === g.id)
                      return {
                          code: g.code,
                          name: g.name,
                          color: colorByGroupId.get(g.id) ?? '#64748B',
                          refLine: `1 porción: ${nf(g.refCalories)} kcal · P ${nf(g.refProteinG, 1)} g · C ${nf(g.refCarbsG, 1)} g · G ${nf(g.refFatsG, 1)} g`,
                          foods: foods.slice(0, EQUIVALENCE_FOODS_PER_GROUP).map((f) => ({
                              name: f.brand ? `${f.name} (${f.brand})` : f.name,
                              portion: f.portionLabel?.trim() || '—',
                              grams: f.portionGrams != null ? `${nf(f.portionGrams, 1)} g` : '',
                          })),
                          moreCount: Math.max(0, foods.length - EQUIVALENCE_FOODS_PER_GROUP),
                      }
                  })
                  .filter((g) => g.foods.length > 0)
            : []

    const meta: { label: string; value: string }[] = []
    const from = formatDateEs(summary?.effectiveFrom)
    if (from) meta.push({ label: 'Vigente desde', value: from })
    const to = formatDateEs(summary?.effectiveTo)
    if (to) meta.push({ label: 'Hasta', value: to })
    if (summary?.versionNumber) meta.push({ label: 'Versión', value: String(summary.versionNumber) })
    const delivered = formatDateEs(input.todayIso)
    if (delivered) meta.push({ label: 'Entregada', value: delivered })

    const glance = baseVariant ? baseVariant.mealSlots.map((slot) => buildSlot(slot, colorByGroupId)) : []
    const planName = summary?.name?.trim() || 'Pauta alimentaria'
    const clientName = input.clientName?.trim() || null

    return {
        brandName: input.brand.brandName,
        planName,
        clientName,
        meta,
        showMacros: options.includeMacros,
        targets: options.includeMacros ? baseTargets : null,
        macroSplit: options.includeMacros ? macroEnergySplit(baseTargets) : null,
        targetsCaption: options.includeMacros && targetsDiffer ? `Metas de ${baseVariant?.label ?? 'tu día base'}. Los días con metas propias las muestran en su página.` : null,
        week,
        glance,
        notes: plan.visibleNotes?.trim() || null,
        days,
        equivalences,
        tracker: options.includeTracker ? { rows: [...glance.map((s) => s.name), 'Agua'] } : null,
        hasPortions,
        fileName: `pauta-${safeFileStem(clientName ?? planName)}.pdf`,
    }
}

// ─── Render ─────────────────────────────────────────────────────────────────────

const INK: Rgb = [17, 24, 39]
const BODY: Rgb = [55, 65, 81]
const MUTED: Rgb = [107, 114, 128]
const FAINT: Rgb = [156, 163, 175]
const RULE: Rgb = [229, 231, 235]
const PAPER_TINT: Rgb = [248, 249, 251]
const WHITE: Rgb = [255, 255, 255]
const CARBS: Rgb = [232, 163, 61]
const FATS: Rgb = [100, 116, 139]

function mix(a: Rgb, b: Rgb, t: number): Rgb {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ]
}

type JsPdfDoc = InstanceType<typeof import('jspdf').jsPDF>

/** Dibuja el modelo. Devuelve el documento para que el caller lo guarde (o un test lo inspeccione). */
export async function renderNutritionV2PlanPdf(
    model: PlanPdfModel,
    params: { brand: PdfBrand; logoDataUrl: string | null; pageSize: PlanPdfPageSize },
): Promise<JsPdfDoc> {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: params.pageSize, compress: true })
    const palette = derivePdfPalette(params.brand)
    const accent = palette.accent
    const deep = palette.headerBg
    const accentSoft = mix(accent, WHITE, 0.88)
    const accentMid = mix(accent, WHITE, 0.55)

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const M = 16
    const W = pageW - M * 2
    const bottomLimit = pageH - 20
    let y = 0

    const text = (rgb: Rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2])
    const fill = (rgb: Rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2])
    const draw = (rgb: Rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2])
    const font = (style: 'normal' | 'bold' | 'italic' | 'bolditalic', size: number) => {
        doc.setFont('helvetica', style)
        doc.setFontSize(size)
    }
    const label = (value: string, x: number, yy: number, rgb: Rgb, size = 6.6, align: 'left' | 'right' | 'center' = 'left') => {
        font('bold', size)
        text(rgb)
        doc.setCharSpace(0.45)
        doc.text(value.toUpperCase(), x, yy, { align })
        doc.setCharSpace(0)
    }
    const withOpacity = (opacity: number, paint: () => void) => {
        const GState = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState
        const setG = (doc as unknown as { setGState: (g: unknown) => void }).setGState.bind(doc)
        setG(new GState({ opacity }))
        paint()
        setG(new GState({ opacity: 1 }))
    }
    const wrap = (value: string, width: number): string[] => doc.splitTextToSize(value, width) as string[]
    const codeDot = (cx: number, cy: number, r: number, hex: string, code: string) => {
        fill(hexToRgb(hex) ?? accent)
        doc.circle(cx, cy, r, 'F')
        font('bold', code.length > 2 ? r * 1.5 : r * 2)
        text(WHITE)
        doc.text(code, cx, cy + r * 0.36, { align: 'center' })
    }

    // Cabecera chica de las páginas interiores.
    const interiorHeader = (section: string) => {
        fill(accent)
        doc.rect(0, 0, pageW, 1.4, 'F')
        label(model.brandName, M, 10, deep, 6.4)
        font('normal', 7.2)
        text(MUTED)
        const right = [model.planName, model.clientName].filter(Boolean).join('  ·  ')
        doc.text(wrap(right, W * 0.6)[0] ?? '', pageW - M, 10, { align: 'right' })
        draw(RULE)
        doc.setLineWidth(0.25)
        doc.line(M, 13.5, pageW - M, 13.5)
        label(section, M, 22, accent, 7)
        y = 26
    }
    const newPage = (section: string) => {
        doc.addPage()
        interiorHeader(section)
    }

    // ═══ PORTADA ═══════════════════════════════════════════════════════════════
    const bandH = 72
    fill(deep)
    doc.rect(0, 0, pageW, bandH, 'F')
    // Formas de la marca: dos discos del color de acento, recortados por el borde de la banda.
    withOpacity(0.22, () => {
        fill(accent)
        doc.circle(pageW - 20, 8, 46, 'F')
    })
    withOpacity(0.14, () => {
        fill(accent)
        doc.circle(pageW - 58, bandH + 6, 26, 'F')
    })
    // La banda tapa lo que el disco inferior pinta fuera de ella.
    fill(WHITE)
    doc.rect(0, bandH, pageW, 40, 'F')
    fill(accent)
    doc.rect(0, 0, pageW, 1.6, 'F')

    let brandX = M
    if (params.logoDataUrl) {
        try {
            fill(WHITE)
            doc.roundedRect(M, 11, 15, 15, 3, 3, 'F')
            doc.addImage(params.logoDataUrl, M + 1.5, 12.5, 12, 12)
            brandX = M + 19
        } catch {
            brandX = M
        }
    }
    if (brandX === M) {
        fill(accent)
        doc.roundedRect(M, 11, 15, 15, 3, 3, 'F')
        font('bold', 12)
        text(WHITE)
        doc.text(model.brandName.charAt(0).toUpperCase() || 'E', M + 7.5, 21, { align: 'center' })
        brandX = M + 19
    }
    label(model.brandName, brandX, 17, WHITE, 7.4)
    font('normal', 7.4)
    text(mix(WHITE, deep, 0.35))
    doc.text('Pauta alimentaria personalizada', brandX, 22.4)

    label('Pauta alimentaria', M, 38, accentMid, 7)
    font('bold', 22)
    text(WHITE)
    const titleLines = wrap(model.planName, W - 30).slice(0, 2)
    doc.text(titleLines, M, 46.5)
    let afterTitle = 46.5 + (titleLines.length - 1) * 8.4
    if (model.clientName) {
        font('normal', 11)
        text(mix(WHITE, deep, 0.2))
        doc.text(`Para ${model.clientName}`, M, afterTitle + 7.5)
        afterTitle += 7.5
    }
    // Metadatos al pie de la banda.
    const metaY = bandH - 7
    let metaX = M
    for (const item of model.meta) {
        label(item.label, metaX, metaY - 4.2, mix(WHITE, deep, 0.45), 5.6)
        font('bold', 8.6)
        text(WHITE)
        doc.text(item.value, metaX, metaY)
        metaX += Math.max(30, doc.getTextWidth(item.value) + 12)
    }

    y = bandH + 12

    // ─── Metas del día ───
    if (model.showMacros && model.targets) {
        const t = model.targets
        label('Metas diarias', M, y, MUTED)
        y += 4
        const heroW = 52
        const tileH = 30
        fill(deep)
        doc.roundedRect(M, y, heroW, tileH, 3, 3, 'F')
        font('bold', 25)
        text(WHITE)
        doc.text(t.calories != null ? nf(t.calories) : '—', M + 5, y + 16)
        label('kcal al día', M + 5, y + 23.5, mix(WHITE, deep, 0.4), 6)

        const macros: { name: string; grams: number | null; pct: number | null; color: Rgb }[] = [
            { name: 'Proteína', grams: t.proteinG, pct: model.macroSplit?.protein ?? null, color: accent },
            { name: 'Carbohidratos', grams: t.carbsG, pct: model.macroSplit?.carbs ?? null, color: CARBS },
            { name: 'Grasas', grams: t.fatsG, pct: model.macroSplit?.fats ?? null, color: FATS },
        ]
        const gap = 3.5
        const tileW = (W - heroW - gap * 3) / 3
        macros.forEach((m, i) => {
            const x = M + heroW + gap + i * (tileW + gap)
            fill(PAPER_TINT)
            doc.roundedRect(x, y, tileW, tileH, 3, 3, 'F')
            fill(m.color)
            doc.roundedRect(x + 4, y + 4.5, 6, 1.6, 0.8, 0.8, 'F')
            label(m.name, x + 4, y + 11, MUTED, 5.8)
            font('bold', 16)
            text(INK)
            doc.text(m.grams != null ? `${nf(m.grams)} g` : '—', x + 4, y + 20)
            if (m.pct != null) {
                font('normal', 7)
                text(MUTED)
                doc.text(`${m.pct} % de la energía`, x + 4, y + 25.5)
            }
        })
        y += tileH + 5

        if (model.macroSplit) {
            const s = model.macroSplit
            const barH = 3.2
            const parts: [number, Rgb][] = [
                [s.protein, accent],
                [s.carbs, CARBS],
                [s.fats, FATS],
            ]
            fill(RULE)
            doc.roundedRect(M, y, W, barH, barH / 2, barH / 2, 'F')
            let x = M
            parts.forEach(([pct, color], i) => {
                const w = (W * pct) / 100
                if (w <= 0) return
                fill(color)
                if (i === 0) doc.roundedRect(x, y, w, barH, barH / 2, barH / 2, 'F')
                else if (i === parts.length - 1) doc.roundedRect(x, y, w, barH, barH / 2, barH / 2, 'F')
                else doc.rect(x, y, w, barH, 'F')
                x += w
            })
            // Esquinas internas planas: repinta el borde de unión del primer y último tramo.
            const pW = (W * s.protein) / 100
            const fW = (W * s.fats) / 100
            fill(accent)
            if (pW > barH) doc.rect(M + pW - barH / 2, y, barH / 2, barH, 'F')
            fill(FATS)
            if (fW > barH) doc.rect(M + W - fW, y, barH / 2, barH, 'F')
            y += barH + 8
        }

        const extras: string[] = []
        if (t.fiberG != null) extras.push(`Fibra ${nf(t.fiberG)} g`)
        if (t.waterMl != null) extras.push(`Agua ${nf(t.waterMl / 1000, 1)} L`)
        if (t.sodiumMg != null) extras.push(`Sodio máx. ${nf(t.sodiumMg)} mg`)
        if (extras.length > 0) {
            font('bold', 7.6)
            let x = M
            for (const e of extras) {
                const w = doc.getTextWidth(e) + 7
                fill(accentSoft)
                doc.roundedRect(x, y - 3.6, w, 5.6, 2.8, 2.8, 'F')
                text(deep)
                doc.text(e, x + 3.5, y + 0.3)
                x += w + 2.5
            }
            y += 6
        }
        if (model.targetsCaption) {
            font('italic', 7)
            text(MUTED)
            doc.text(wrap(model.targetsCaption, W), M, y + 1)
            y += 5
        }
        y += 4
    }

    // ─── Tu semana (multi-día) ───
    if (model.week) {
        label('Tu semana', M, y, MUTED)
        y += 3.5
        const cellGap = 2
        const cellW = (W - cellGap * 6) / 7
        const cellH = 17
        model.week.forEach((cell, i) => {
            const x = M + i * (cellW + cellGap)
            if (cell.own) {
                fill(accentSoft)
                doc.roundedRect(x, y, cellW, cellH, 2.4, 2.4, 'F')
            } else {
                draw(RULE)
                doc.setLineWidth(0.3)
                doc.roundedRect(x, y, cellW, cellH, 2.4, 2.4, 'S')
            }
            font('bold', 8.4)
            text(cell.own ? deep : INK)
            doc.text(cell.short, x + cellW / 2, y + 5.6, { align: 'center' })
            font('normal', 6)
            text(MUTED)
            doc.text(wrap(cell.variantTitle, cellW - 2)[0] ?? '', x + cellW / 2, y + 10, { align: 'center' })
            if (model.showMacros && cell.calories != null) {
                font('bold', 6.6)
                text(BODY)
                doc.text(`${nf(cell.calories)} kcal`, x + cellW / 2, y + 14.4, { align: 'center' })
            }
        })
        y += cellH + 8
    }

    // ─── Tu día de un vistazo ───
    if (model.glance.length > 0) {
        const rowH = 9.2
        const needed = 8 + model.glance.length * rowH
        if (y + needed > bottomLimit) {
            newPage('Tu día de un vistazo')
        } else {
            label(model.week ? 'Tu día base de un vistazo' : 'Tu día de un vistazo', M, y, MUTED)
            y += 5
        }
        const lineX = M + 17
        draw(accentMid)
        doc.setLineWidth(0.5)
        doc.line(lineX, y + 2, lineX, y + (model.glance.length - 1) * rowH + 2)
        for (const slot of model.glance) {
            font('bold', 9)
            text(INK)
            doc.text(slot.time ?? '', M + 12, y + 3.2, { align: 'right' })
            fill(WHITE)
            draw(accent)
            doc.setLineWidth(0.7)
            doc.circle(lineX, y + 2, 1.6, 'FD')
            font('bold', 9.4)
            text(INK)
            doc.text(slot.name, lineX + 5, y + 3.2)
            const nameW = doc.getTextWidth(slot.name)
            const detail = slot.portionCodes || (slot.items.length > 0 ? `${slot.items.length} ${slot.items.length === 1 ? 'alimento' : 'alimentos'}` : '')
            if (detail) {
                font('normal', 7.6)
                text(MUTED)
                doc.text(wrap(detail, W - 60 - nameW)[0] ?? '', lineX + 8 + nameW, y + 3.2)
            }
            if (model.showMacros && slot.macros.calories > 0) {
                font('bold', 8.4)
                text(BODY)
                doc.text(`${nf(slot.macros.calories)} kcal`, pageW - M, y + 3.2, { align: 'right' })
            }
            y += rowH
        }
        y += 3
    }

    // ─── Indicaciones ───
    if (model.notes) {
        font('normal', 8.8)
        const lines = wrap(model.notes, W - 14)
        const boxH = 12 + lines.length * 4.4
        if (y + boxH > bottomLimit) newPage('Indicaciones')
        fill(accentSoft)
        doc.roundedRect(M, y, W, boxH, 3, 3, 'F')
        fill(accent)
        doc.rect(M, y + 3, 1.4, boxH - 6, 'F')
        label('Indicaciones de tu profesional', M + 7, y + 6.5, deep, 6.2)
        font('normal', 8.8)
        text(BODY)
        doc.text(lines, M + 7, y + 11.6)
        y += boxH + 6
    }

    // ═══ DETALLE POR COMIDA ════════════════════════════════════════════════════
    const leftCol = 30
    const bodyX = M + leftCol
    const bodyW = W - leftCol - 4

    const measureSlot = (slot: PlanPdfSlot): number => {
        let h = 6
        for (const item of slot.items) {
            font('bold', 8.8)
            h += Math.max(1, wrap(item.brand ? `${item.name} · ${item.brand}` : item.name, bodyW * 0.58).length) * 4.2
            if (item.notes) {
                font('italic', 7.4)
                h += wrap(item.notes, bodyW - 4).length * 3.5
            }
            if (item.swaps.length) {
                font('normal', 7.4)
                h += wrap(`Puedes cambiarlo por: ${item.swaps.join(' · ')}`, bodyW - 4).length * 3.5
            }
            h += 2.2
        }
        if (slot.portions.length) h += Math.ceil(slot.portions.length / 2) * 7 + 1
        if (slot.instructions) {
            font('italic', 7.6)
            h += wrap(slot.instructions, bodyW).length * 3.6 + 2
        }
        if (model.showMacros) h += 7
        return Math.max(h + 1, 24)
    }

    const drawSlot = (slot: PlanPdfSlot, section: string) => {
        const h = measureSlot(slot)
        if (y + h > bottomLimit) newPage(section)
        const top = y
        draw(RULE)
        doc.setLineWidth(0.3)
        fill(WHITE)
        doc.roundedRect(M, top, W, h, 3, 3, 'FD')
        fill(PAPER_TINT)
        doc.roundedRect(M, top, leftCol, h, 3, 3, 'F')
        doc.rect(M + leftCol - 3, top, 3, h, 'F')
        fill(accent)
        doc.rect(M, top + 4, 1.2, 8, 'F')
        font('bold', 12)
        text(INK)
        doc.text(slot.time ?? '—', M + 5, top + 10)
        font('bold', 7.6)
        text(BODY)
        doc.text(wrap(slot.name, leftCol - 7).slice(0, 3), M + 5, top + 15)

        let cy = top + 7
        for (const item of slot.items) {
            font('bold', 8.8)
            text(INK)
            const nameLines = wrap(item.brand ? `${item.name} · ${item.brand}` : item.name, bodyW * 0.58)
            doc.text(nameLines, bodyX, cy)
            const lastNameW = doc.getTextWidth(nameLines[nameLines.length - 1] ?? '')
            if (item.optional) {
                font('bold', 5.8)
                const tagW = doc.getTextWidth('OPCIONAL') + 4
                const tagX = bodyX + lastNameW + 2.5
                fill(accentSoft)
                doc.roundedRect(tagX, cy - 3.1 + (nameLines.length - 1) * 4.2, tagW, 4, 2, 2, 'F')
                text(deep)
                doc.text('OPCIONAL', tagX + 2, cy - 0.3 + (nameLines.length - 1) * 4.2)
            }
            font('normal', 8.4)
            text(BODY)
            doc.text(item.amount, M + W - 4, cy, { align: 'right', maxWidth: bodyW * 0.4 })
            cy += nameLines.length * 4.2
            if (item.notes) {
                font('italic', 7.4)
                text(MUTED)
                const lines = wrap(item.notes, bodyW - 4)
                doc.text(lines, bodyX + 1, cy - 0.6)
                cy += lines.length * 3.5
            }
            if (item.swaps.length) {
                font('normal', 7.4)
                text(MUTED)
                const lines = wrap(`Puedes cambiarlo por: ${item.swaps.join(' · ')}`, bodyW - 4)
                doc.text(lines, bodyX + 1, cy - 0.6)
                cy += lines.length * 3.5
            }
            cy += 2.2
        }
        if (slot.portions.length) {
            const chipW = (bodyW - 3) / 2
            slot.portions.forEach((p, i) => {
                const col = i % 2
                const row = Math.floor(i / 2)
                const x = bodyX + col * (chipW + 3)
                const yy = cy + row * 7 - 3
                const tint = mix(hexToRgb(p.color) ?? accent, WHITE, 0.86)
                fill(tint)
                doc.roundedRect(x, yy, chipW, 5.8, 2.9, 2.9, 'F')
                codeDot(x + 2.9, yy + 2.9, 2.3, p.color, p.code)
                font('bold', 8)
                text(INK)
                doc.text(`${p.portions} × ${p.name}`, x + 7, yy + 3.9, { maxWidth: chipW - 9 })
            })
            cy += Math.ceil(slot.portions.length / 2) * 7 + 1
        }
        if (slot.instructions) {
            font('italic', 7.6)
            text(BODY)
            const lines = wrap(slot.instructions, bodyW)
            doc.text(lines, bodyX, cy)
            cy += lines.length * 3.6 + 2
        }
        if (model.showMacros) {
            draw(RULE)
            doc.setLineWidth(0.2)
            doc.line(bodyX, top + h - 8.5, M + W - 4, top + h - 8.5)
            font('bold', 7.4)
            text(BODY)
            const m = slot.macros
            doc.text(`${nf(m.calories)} kcal`, bodyX, top + h - 4)
            font('normal', 7.2)
            text(MUTED)
            doc.text(`P ${nf(m.proteinG)} g   ·   C ${nf(m.carbsG)} g   ·   G ${nf(m.fatsG)} g`, M + W - 4, top + h - 4, { align: 'right' })
        }
        y = top + h + 4
    }

    for (const day of model.days) {
        const section = model.days.length > 1 ? `Detalle · ${day.title}` : 'Detalle por comida'
        newPage(section)
        font('bold', 17)
        text(INK)
        doc.text(day.title, M, y + 4)
        font('normal', 8.4)
        text(MUTED)
        doc.text(day.appliesTo, M, y + 9.5)
        if (model.showMacros && day.targets?.calories != null) {
            const t = day.targets
            font('bold', 10)
            text(deep)
            doc.text(`${nf(t.calories ?? 0)} kcal`, pageW - M, y + 4, { align: 'right' })
            font('normal', 7.4)
            text(MUTED)
            const parts = [
                t.proteinG != null ? `P ${nf(t.proteinG)} g` : null,
                t.carbsG != null ? `C ${nf(t.carbsG)} g` : null,
                t.fatsG != null ? `G ${nf(t.fatsG)} g` : null,
            ].filter(Boolean)
            doc.text(parts.join('  ·  '), pageW - M, y + 9.5, { align: 'right' })
        }
        y += 16
        if (day.slots.length === 0) {
            font('italic', 9)
            text(MUTED)
            doc.text('Día flexible: sin comidas prescritas. Sigue tus metas del día.', M, y)
            y += 8
        }
        for (const slot of day.slots) drawSlot(slot, section)
    }

    // ═══ EQUIVALENCIAS ═════════════════════════════════════════════════════════
    if (model.equivalences.length > 0) {
        const section = 'Lista de equivalencias'
        newPage(section)
        font('bold', 17)
        text(INK)
        doc.text('Cambia dentro del mismo grupo', M, y + 4)
        font('normal', 8.4)
        text(MUTED)
        doc.text(
            wrap('Cada alimento de un grupo equivale a 1 porción. Puedes elegir cualquiera de la lista, pero no cambies porciones de un grupo por otro.', W),
            M,
            y + 9.5,
        )
        y += 18
        const colGap = 6
        const colW = (W - colGap) / 2
        const rowH = 4.6
        const blockH = (g: PlanPdfEquivalenceGroup) => 15 + g.foods.length * rowH + (g.moreCount > 0 ? rowH : 0) + 3
        let colY = [y, y]
        for (const g of model.equivalences) {
            const h = blockH(g)
            let col = colY[0] <= colY[1] ? 0 : 1
            if (colY[col] + h > bottomLimit) {
                const other = col === 0 ? 1 : 0
                if (colY[other] + h <= bottomLimit) col = other
                else {
                    newPage(section)
                    colY = [y, y]
                    col = 0
                }
            }
            const x = M + col * (colW + colGap)
            let by = colY[col]
            const rgb = hexToRgb(g.color) ?? accent
            fill(mix(rgb, WHITE, 0.86))
            doc.roundedRect(x, by, colW, 12, 2.6, 2.6, 'F')
            codeDot(x + 6, by + 6, 3.4, g.color, g.code)
            font('bold', 9.4)
            text(INK)
            doc.text(wrap(g.name, colW - 16)[0] ?? g.name, x + 12, by + 5.4)
            font('normal', 6.4)
            text(BODY)
            doc.text(wrap(g.refLine, colW - 16)[0] ?? '', x + 12, by + 9.4)
            by += 16
            g.foods.forEach((f, i) => {
                if (i % 2 === 1) {
                    fill(PAPER_TINT)
                    doc.rect(x, by - 3.3, colW, rowH, 'F')
                }
                font('normal', 7.6)
                text(INK)
                doc.text(wrap(f.name, colW * 0.5)[0] ?? f.name, x + 2, by)
                text(BODY)
                doc.text(wrap(f.portion, colW * 0.32)[0] ?? '', x + colW * 0.54, by)
                text(MUTED)
                doc.text(f.grams, x + colW - 2, by, { align: 'right' })
                by += rowH
            })
            if (g.moreCount > 0) {
                font('italic', 7)
                text(MUTED)
                doc.text(`y ${g.moreCount} alimentos más en la app`, x + 2, by)
                by += rowH
            }
            colY[col] = by + 5
        }
        y = Math.max(colY[0], colY[1])
    }

    // ═══ REGISTRO SEMANAL ══════════════════════════════════════════════════════
    if (model.tracker) {
        const section = 'Registro semanal'
        newPage(section)
        font('bold', 17)
        text(INK)
        doc.text('Tu semana, a mano', M, y + 4)
        font('normal', 8.4)
        text(MUTED)
        doc.text('Marca cada comida que hiciste según la pauta. Llévalo a tu próximo control.', M, y + 9.5)
        y += 17
        const days = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
        const firstCol = 46
        const dayW = (W - firstCol) / 7
        const rowH = 10
        fill(deep)
        doc.roundedRect(M, y, W, 8, 2, 2, 'F')
        days.forEach((d, i) => {
            font('bold', 8)
            text(WHITE)
            doc.text(d, M + firstCol + i * dayW + dayW / 2, y + 5.4, { align: 'center' })
        })
        label('Comida', M + 4, y + 5.2, WHITE, 6.4)
        y += 8
        model.tracker.rows.forEach((row, r) => {
            if (r % 2 === 0) {
                fill(PAPER_TINT)
                doc.rect(M, y, W, rowH, 'F')
            }
            font('bold', 8.4)
            text(INK)
            doc.text(wrap(row, firstCol - 6)[0] ?? row, M + 4, y + 6.4)
            days.forEach((_, i) => {
                const cx = M + firstCol + i * dayW + dayW / 2
                draw(accentMid)
                doc.setLineWidth(0.4)
                doc.roundedRect(cx - 2.6, y + 2.4, 5.2, 5.2, 1, 1, 'S')
            })
            y += rowH
        })
        y += 10
        const fields = ['Peso', 'Cómo me sentí esta semana', 'Dudas para mi próximo control']
        for (const f of fields) {
            label(f, M, y, MUTED, 6.4)
            draw(RULE)
            doc.setLineWidth(0.3)
            doc.line(M, y + 7, pageW - M, y + 7)
            if (f !== 'Peso') doc.line(M, y + 14, pageW - M, y + 14)
            y += f === 'Peso' ? 14 : 21
        }
    }

    // ═══ PIE EN TODAS LAS PÁGINAS ══════════════════════════════════════════════
    const total = doc.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
        doc.setPage(p)
        const fy = pageH - 11
        draw(RULE)
        doc.setLineWidth(0.25)
        doc.line(M, fy - 3.5, pageW - M, fy - 3.5)
        font('bold', 6.6)
        text(BODY)
        doc.text(model.clientName ? `${model.brandName}  ·  Pauta de ${model.clientName}` : model.brandName, M, fy)
        font('normal', 6.6)
        text(FAINT)
        doc.text(`${p} / ${total}`, pageW - M, fy, { align: 'right' })
        font('normal', 6)
        doc.text('Pauta de uso personal. No reemplaza una evaluación clínica, dietética ni médica.', M, fy + 3.6)
        if (palette.evaBadgeLabel) {
            doc.textWithLink(palette.evaBadgeLabel, pageW - M - doc.getTextWidth(palette.evaBadgeLabel), fy + 3.6, {
                url: getEvaBadgeUrl('nutrition_pdf'),
            })
        }
    }
    return doc
}

/** Genera y descarga el PDF. Lanza si jspdf no carga; el caller muestra el toast. */
export async function downloadNutritionV2PlanPdf(
    input: PlanPdfInput & { logoDataUrl: string | null },
): Promise<void> {
    const model = buildNutritionV2PlanPdfModel(input)
    const doc = await renderNutritionV2PlanPdf(model, {
        brand: input.brand,
        logoDataUrl: input.logoDataUrl,
        pageSize: input.options.pageSize,
    })
    doc.save(model.fileName)
}
