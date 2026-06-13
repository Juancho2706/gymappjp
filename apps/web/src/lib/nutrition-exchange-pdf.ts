/**
 * PDF de pauta por porciones de intercambio — multi-formato, marca por TENANT.
 * Generación 100% client-side con jsPDF (decisión SPEC §Research 4: cero servidor,
 * cero Chromium, privacidad — el plan no viaja). Layout: clon de la pauta Canva de Fran
 * (encabezado branded → objetivos → requerimientos → variantes → comidas con códigos de
 * color → agua + nomenclatura → disclaimer).
 *
 * `buildExchangePdfModel` es PURO (unit-testeable); `downloadNutritionExchangePdf`
 * renderiza el modelo con import dinámico de jspdf.
 */

import type {
    DayVariant,
    ExchangeFoodEquivalence,
    ExchangeGroup,
    ExchangePdfFormat,
    PdfBrand,
} from '@/domain/nutrition/exchange.types'
import {
    dayTotalsByVariant,
    exchangeGroupColor,
    formatPortions,
    hasUnconfirmedMacros,
    macrosForTargets,
    portionsSummaryLabel,
    type MealTargetsLike,
} from '@/services/nutrition-exchanges/exchange-calc'
import { derivePdfPalette, hexToRgb, type Rgb } from '@/lib/nutrition-pdf-brand'

export type ExchangePdfMeal = {
    id: string
    name: string
    notes?: string | null
    dayVariantId?: string | null
    targets: { exchangeGroupId: string; portions: number; notes?: string | null }[]
}

export type ExchangePdfParams = {
    format: ExchangePdfFormat
    brand: PdfBrand
    /** dataURL del logo ya resuelto client-side (loadBrandLogoDataUrl); null ⇒ inicial+color. */
    logoDataUrl?: string | null
    planName: string
    clientName?: string | null
    instructions?: string | null
    /** Objetivo/requerimiento que fija la nutri (campos daily_* del plan). */
    goals: { calories: number; protein: number; carbs: number; fats: number }
    meals: ExchangePdfMeal[]
    variants: Pick<DayVariant, 'id' | 'name'>[]
    groups: ExchangeGroup[]
    equivalences: ExchangeFoodEquivalence[]
    fileStem: string
}

// ─── Modelo puro ────────────────────────────────────────────────────────────────

export type PdfMealLine = {
    mealName: string
    notes: string | null
    /** "2C · 1LAC · 1F" */
    codes: string
    rows: { code: string; color: string; portions: string; groupName: string }[]
    kcal: number
}

export type PdfVariantSection = {
    variantId: string | null
    title: string | null
    meals: PdfMealLine[]
    totals: { calories: number; proteinG: number; carbsG: number; fatsG: number }
}

export type PdfEquivalenceSection = {
    code: string
    color: string
    groupName: string
    refLabel: string
    foods: { name: string; portionLabel: string | null; grams: number | null }[]
}

export type PdfShoppingRow = {
    code: string
    groupName: string
    /** Porciones por día (máximo entre variantes) y estimado semanal. */
    portionsPerDay: string
    portionsPerWeek: string
    examples: string
}

export type ExchangePdfModel = {
    brandName: string
    planName: string
    clientName: string | null
    instructions: string | null
    goals: ExchangePdfParams['goals']
    sections: PdfVariantSection[]
    /** Leyenda de códigos (solo grupos usados, orden sort_order). */
    nomenclature: { code: string; color: string; name: string; refKcal: number }[]
    /** AC3: algún grupo usado con macros sin confirmar ⇒ aviso "referencial". */
    macrosProvisional: boolean
    equivalenceSections: PdfEquivalenceSection[]
    shoppingList: PdfShoppingRow[]
    includeEquivalences: boolean
}

function usedGroups(meals: ExchangePdfMeal[], groups: ExchangeGroup[]): ExchangeGroup[] {
    const used = new Set(meals.flatMap((m) => m.targets.map((t) => t.exchangeGroupId)))
    return groups
        .filter((g) => used.has(g.id))
        .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.code.localeCompare(b.code)))
}

export function buildExchangePdfModel(params: ExchangePdfParams): ExchangePdfModel {
    if (params.format === 'full') {
        throw new Error('Formato "completo" disponible próximamente (v2).')
    }
    const { meals, groups, variants } = params
    const groupById = new Map(groups.map((g) => [g.id, g]))

    const mealLine = (m: ExchangePdfMeal): PdfMealLine => ({
        mealName: m.name,
        notes: m.notes?.trim() || null,
        codes: portionsSummaryLabel(m.targets, groups),
        rows: [...m.targets]
            .map((t) => ({ t, g: groupById.get(t.exchangeGroupId) }))
            .filter((x): x is { t: ExchangePdfMeal['targets'][number]; g: ExchangeGroup } => !!x.g)
            .sort((a, b) => a.g.sortOrder - b.g.sortOrder)
            .map(({ t, g }) => ({
                code: g.code,
                color: exchangeGroupColor(g),
                portions: formatPortions(t.portions),
                groupName: g.name,
            })),
        kcal: macrosForTargets(m.targets, groups).calories,
    })

    const mealsLike: (MealTargetsLike & { meal: ExchangePdfMeal })[] = meals.map((m) => ({
        targets: m.targets,
        dayVariantId: m.dayVariantId ?? null,
        meal: m,
    }))
    const totalsByVariant = dayTotalsByVariant(mealsLike, variants, groups)

    const sections: PdfVariantSection[] = totalsByVariant.map((row) => ({
        variantId: row.variantId,
        title: row.name,
        meals: mealsLike
            .filter((m) => row.variantId == null || m.dayVariantId == null || m.dayVariantId === row.variantId)
            .map((m) => mealLine(m.meal)),
        totals: row.totals,
    }))

    const used = usedGroups(meals, groups)
    const nomenclature = used.map((g) => ({
        code: g.code,
        color: exchangeGroupColor(g),
        name: g.name,
        refKcal: g.refCalories,
    }))

    const allTargets = meals.flatMap((m) => m.targets)
    const macrosProvisional = hasUnconfirmedMacros(allTargets, groups)

    const includeEquivalences = params.format === 'equivalences'
    const equivalencesByGroup = new Map<string, ExchangeFoodEquivalence[]>()
    for (const eq of params.equivalences) {
        const list = equivalencesByGroup.get(eq.exchangeGroupId) ?? []
        list.push(eq)
        equivalencesByGroup.set(eq.exchangeGroupId, list)
    }

    const equivalenceSections: PdfEquivalenceSection[] = includeEquivalences
        ? used
              .filter((g) => (equivalencesByGroup.get(g.id) ?? []).length > 0)
              .map((g) => ({
                  code: g.code,
                  color: exchangeGroupColor(g),
                  groupName: g.name,
                  refLabel: `1 porción ≈ ${Math.round(g.refCalories)} kcal · P ${g.refProteinG}g · CHO ${g.refCarbsG}g · G ${g.refFatsG}g`,
                  foods: (equivalencesByGroup.get(g.id) ?? []).map((f) => ({
                      name: f.name,
                      portionLabel: f.portionLabel,
                      grams: f.portionGrams,
                  })),
              }))
        : []

    // Lista de compras: agregado semanal por grupo (máx. porciones/día entre variantes × 7)
    // con ejemplos del grupo — paridad mínima v1 con Avena (SPEC §Research 2).
    const shoppingList: PdfShoppingRow[] = includeEquivalences
        ? used.map((g) => {
              const perVariantDay = totalsByVariant.map((row) =>
                  mealsLike
                      .filter((m) => row.variantId == null || m.dayVariantId == null || m.dayVariantId === row.variantId)
                      .flatMap((m) => m.targets)
                      .filter((t) => t.exchangeGroupId === g.id)
                      .reduce((sum, t) => sum + t.portions, 0)
              )
              const perDay = Math.max(0, ...perVariantDay)
              const examples = (equivalencesByGroup.get(g.id) ?? [])
                  .slice(0, 3)
                  .map((f) => f.name)
                  .join(', ')
              return {
                  code: g.code,
                  groupName: g.name,
                  portionsPerDay: formatPortions(perDay),
                  portionsPerWeek: formatPortions(Math.round(perDay * 7 * 10) / 10),
                  examples,
              }
          })
        : []

    return {
        brandName: params.brand.brandName,
        planName: params.planName,
        clientName: params.clientName?.trim() || null,
        instructions: params.instructions?.trim() || null,
        goals: params.goals,
        sections,
        nomenclature,
        macrosProvisional,
        equivalenceSections,
        shoppingList,
        includeEquivalences,
    }
}

// ─── Render jsPDF ───────────────────────────────────────────────────────────────

const NEUTRAL = {
    sectionBg: [241, 245, 249] as Rgb,
    altRowBg: [248, 250, 252] as Rgb,
    textDark: [15, 23, 42] as Rgb,
    textMid: [71, 85, 105] as Rgb,
    textLight: [148, 163, 184] as Rgb,
    white: [255, 255, 255] as Rgb,
    border: [203, 213, 225] as Rgb,
}

export async function downloadNutritionExchangePdf(params: ExchangePdfParams): Promise<void> {
    const model = buildExchangePdfModel(params)
    const palette = derivePdfPalette(params.brand)
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 14
    const contentW = pageW - margin * 2
    let y = 0

    const setColor = (rgb: Rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2])
    const setFill = (rgb: Rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2])
    const setDraw = (rgb: Rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2])
    const filledRect = (x: number, yy: number, w: number, h: number, fill: Rgb) => {
        setFill(fill)
        doc.rect(x, yy, w, h, 'F')
    }
    const hLine = (yy: number) => {
        setDraw(NEUTRAL.border)
        doc.setLineWidth(0.25)
        doc.line(margin, yy, pageW - margin, yy)
    }
    const checkPage = (needed: number) => {
        if (y + needed > pageH - 16) {
            doc.addPage()
            y = margin
        }
    }
    const groupBadge = (x: number, yy: number, code: string, colorHex: string) => {
        const rgb = hexToRgb(colorHex) ?? palette.accent
        setFill(rgb)
        doc.circle(x + 3.2, yy, 3.2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(code.length > 2 ? 4.6 : 6)
        setColor(NEUTRAL.white)
        doc.text(code, x + 3.2, yy + 0.9, { align: 'center' })
    }

    // ─── Header branded ───
    filledRect(0, 0, pageW, 30, palette.headerBg)
    setFill(palette.accent)
    doc.rect(0, 0, pageW, 1.2, 'F')

    let textX = margin
    if (model.brandName) {
        if (params.logoDataUrl) {
            try {
                doc.addImage(params.logoDataUrl, 'PNG', margin, 5, 14, 14)
                textX = margin + 18
            } catch {
                // logo ilegible ⇒ fallback inicial+color
                groupBadge(margin, 11, model.brandName.charAt(0).toUpperCase(), params.brand.primaryColor)
                textX = margin + 10
            }
        }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        setColor(palette.accent)
        doc.text(model.brandName.toUpperCase(), textX, 9)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    setColor(palette.headerText)
    const titleLines = doc.splitTextToSize((model.planName || 'Pauta nutricional').toUpperCase(), contentW - 40)
    doc.text(titleLines, textX, 16)
    if (model.clientName) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        setColor(NEUTRAL.textLight)
        doc.text(model.clientName, textX, 23)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor(NEUTRAL.textLight)
    doc.text(new Date().toLocaleDateString('es-CL'), pageW - margin, 9, { align: 'right' })

    y = 37

    // ─── Requerimientos (objetivo de la nutri) ───
    filledRect(margin, y - 4, contentW, 12, NEUTRAL.sectionBg)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor(NEUTRAL.textMid)
    doc.text('REQUERIMIENTOS DIARIOS', margin + 3, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setColor(NEUTRAL.textDark)
    doc.text(
        `${model.goals.calories} kcal  ·  P ${model.goals.protein} g  ·  CHO ${model.goals.carbs} g  ·  G ${model.goals.fats} g`,
        margin + 3,
        y + 5
    )
    y += 13

    if (model.macrosProvisional) {
        checkPage(8)
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(6.5)
        setColor(NEUTRAL.textMid)
        doc.text(
            'Macros por grupo referenciales (en validación profesional). Los totales derivados son aproximados.',
            margin,
            y
        )
        y += 6
    }

    if (model.instructions) {
        checkPage(14)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        setColor(NEUTRAL.textMid)
        doc.text('INDICACIONES', margin, y)
        y += 4
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        for (const line of doc.splitTextToSize(model.instructions, contentW)) {
            checkPage(4.5)
            doc.text(line, margin, y)
            y += 4.2
        }
        y += 3
    }

    // ─── Secciones por variante de día ───
    for (const section of model.sections) {
        if (section.title) {
            checkPage(10)
            filledRect(margin, y, contentW, 7, palette.headerBg)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8.5)
            setColor(NEUTRAL.white)
            doc.text(`DÍA ${section.title.toUpperCase()}`, margin + 3, y + 4.8)
            y += 10
        }

        for (const meal of section.meals) {
            checkPage(12)
            filledRect(margin, y, contentW, 8, NEUTRAL.sectionBg)
            setFill(palette.accent)
            doc.rect(margin, y, 2.5, 8, 'F')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(9)
            setColor(NEUTRAL.textDark)
            doc.text(meal.mealName.toUpperCase(), margin + 6, y + 5.2)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            setColor(NEUTRAL.textMid)
            doc.text(meal.codes, pageW - margin - 2, y + 5.2, { align: 'right' })
            y += 11

            for (const row of meal.rows) {
                checkPage(7)
                groupBadge(margin + 2, y - 1, row.code, row.color)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8.5)
                setColor(NEUTRAL.textDark)
                doc.text(`${row.portions} ×`, margin + 10, y)
                doc.setFont('helvetica', 'normal')
                setColor(NEUTRAL.textMid)
                doc.text(row.groupName, margin + 20, y)
                y += 6
            }
            if (meal.notes) {
                checkPage(5)
                doc.setFont('helvetica', 'italic')
                doc.setFontSize(7.5)
                setColor(NEUTRAL.textMid)
                for (const line of doc.splitTextToSize(meal.notes, contentW - 6)) {
                    checkPage(4)
                    doc.text(line, margin + 3, y)
                    y += 3.8
                }
            }
            y += 2.5
        }

        // Totales derivados de la sección
        checkPage(10)
        hLine(y - 1)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        setColor(NEUTRAL.textMid)
        const t = section.totals
        doc.text(
            `Total${section.title ? ` (${section.title})` : ''}: ${Math.round(t.calories)} kcal · P ${t.proteinG} g · CHO ${t.carbsG} g · G ${t.fatsG} g`,
            margin,
            y + 3.5
        )
        y += 10
    }

    // ─── Agua + nomenclatura de códigos ───
    checkPage(12 + model.nomenclature.length * 5.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    setColor(NEUTRAL.textDark)
    doc.text('AGUA: 1.5 a 2 litros al día (8 vasos). Preferir agua antes que bebidas o jugos.', margin, y)
    y += 7
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor(NEUTRAL.textMid)
    doc.text('NOMENCLATURA DE CÓDIGOS', margin, y)
    y += 5
    for (const item of model.nomenclature) {
        checkPage(6)
        groupBadge(margin + 1, y - 1, item.code, item.color)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        setColor(NEUTRAL.textMid)
        doc.text(`${item.code} = ${item.name} (~${Math.round(item.refKcal)} kcal por porción)`, margin + 10, y)
        y += 5.5
    }

    // ─── Equivalencias + lista de compras (formato equivalences) ───
    if (model.includeEquivalences) {
        doc.addPage()
        y = margin
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        setColor(NEUTRAL.textDark)
        doc.text('EQUIVALENCIAS POR GRUPO', margin, y)
        y += 8

        for (const section of model.equivalenceSections) {
            checkPage(14)
            filledRect(margin, y, contentW, 8, NEUTRAL.sectionBg)
            groupBadge(margin + 2, y + 4, section.code, section.color)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8.5)
            setColor(NEUTRAL.textDark)
            doc.text(section.groupName.toUpperCase(), margin + 10, y + 5.2)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6.5)
            setColor(NEUTRAL.textMid)
            doc.text(section.refLabel, pageW - margin - 2, y + 5.2, { align: 'right' })
            y += 11

            for (let i = 0; i < section.foods.length; i++) {
                const f = section.foods[i]
                checkPage(6)
                if (i % 2 === 1) filledRect(margin, y - 3.2, contentW, 5.4, NEUTRAL.altRowBg)
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
                setColor(NEUTRAL.textDark)
                doc.text(doc.splitTextToSize(f.name, contentW * 0.55)[0], margin + 3, y)
                setColor(NEUTRAL.textMid)
                doc.text(f.portionLabel ?? '—', margin + contentW * 0.6, y)
                doc.text(f.grams != null ? `${f.grams} g` : '—', pageW - margin - 2, y, { align: 'right' })
                y += 5.4
            }
            y += 4
        }

        // Lista de compras semanal
        checkPage(16 + model.shoppingList.length * 6)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        setColor(NEUTRAL.textDark)
        doc.text('LISTA DE COMPRAS (SEMANAL ESTIMADA)', margin, y)
        y += 7
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        setColor(NEUTRAL.textLight)
        doc.text('GRUPO', margin + 3, y)
        doc.text('PORCIONES/DÍA', margin + contentW * 0.42, y)
        doc.text('PORCIONES/SEMANA', margin + contentW * 0.62, y)
        y += 2.5
        hLine(y)
        y += 4
        for (const row of model.shoppingList) {
            checkPage(8)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            setColor(NEUTRAL.textDark)
            doc.text(`${row.code} — ${row.groupName}`, margin + 3, y)
            doc.setFont('helvetica', 'normal')
            setColor(NEUTRAL.textMid)
            doc.text(row.portionsPerDay, margin + contentW * 0.42, y)
            doc.text(row.portionsPerWeek, margin + contentW * 0.62, y)
            y += 4.2
            if (row.examples) {
                doc.setFont('helvetica', 'italic')
                doc.setFontSize(6.5)
                setColor(NEUTRAL.textLight)
                doc.text(doc.splitTextToSize(`Ej: ${row.examples}`, contentW - 6)[0], margin + 3, y)
                y += 4.6
            } else {
                y += 1.5
            }
        }
    }

    // ─── Footer en TODAS las páginas ───
    const pageCount = doc.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        const footerY = pageH - 8
        setDraw(NEUTRAL.border)
        doc.setLineWidth(0.25)
        doc.line(margin, footerY - 3, pageW - margin, footerY - 3)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        setColor(NEUTRAL.textLight)
        doc.text(
            `${palette.generatedWithLabel}. Uso personal. No reemplaza valoración clínica, dietética ni médica.`,
            margin,
            footerY
        )
        doc.text(`${p}/${pageCount}`, pageW - margin, footerY, { align: 'right' })
    }

    const safeStem = params.fileStem.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'pauta-porciones'
    doc.save(`${safeStem}.pdf`)
}
