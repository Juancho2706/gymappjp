/**
 * Genera PDF en el navegador (sin enviar el plan al servidor).
 * @legal Contenido ya visible en la app; el archivo queda bajo control del usuario.
 */

import { calculateFoodItemMacros, type FoodItemForMacros } from '@/lib/nutrition-utils'

export type NutritionPdfMeal = {
  name: string
  food_items: FoodItemForMacros[]
}

export type NutritionPdfParams = {
  planName: string
  date: string
  instructions?: string | null
  meals: NutritionPdfMeal[]
  goals: { calories: number; protein: number; carbs: number; fats: number }
  fileStem: string
}

// Color palette — colores sólidos, sin opacidad para compatibilidad PDF
const C = {
  headerBg: [15, 23, 42] as [number, number, number],      // slate-900
  accent: [16, 185, 129] as [number, number, number],       // emerald-500
  sectionBg: [241, 245, 249] as [number, number, number],   // slate-100
  altRowBg: [248, 250, 252] as [number, number, number],    // slate-50
  textDark: [15, 23, 42] as [number, number, number],       // slate-900
  textMid: [71, 85, 105] as [number, number, number],       // slate-600
  textLight: [148, 163, 184] as [number, number, number],   // slate-400
  white: [255, 255, 255] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],      // slate-300
  kcalColor: [234, 88, 12] as [number, number, number],     // orange-600
  proteinColor: [37, 99, 235] as [number, number, number],  // blue-600
  carbsColor: [5, 150, 105] as [number, number, number],    // emerald-600
  fatsColor: [147, 51, 234] as [number, number, number],    // purple-600
}

export async function downloadNutritionDayPdf(params: NutritionPdfParams): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentW = pageW - margin * 2

  let y = 0

  // ─── helpers ────────────────────────────────────────────────────────────────

  function checkPage(needed: number) {
    if (y + needed > pageH - 16) {
      doc.addPage()
      y = margin
    }
  }

  function setColor(rgb: [number, number, number]) {
    doc.setTextColor(rgb[0], rgb[1], rgb[2])
  }

  function setFill(rgb: [number, number, number]) {
    doc.setFillColor(rgb[0], rgb[1], rgb[2])
  }

  function setDraw(rgb: [number, number, number]) {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2])
  }

  function filledRect(x: number, yy: number, w: number, h: number, fill: [number, number, number]) {
    setFill(fill)
    doc.rect(x, yy, w, h, 'F')
  }

  function hLine(yy: number, color: [number, number, number] = C.border) {
    setDraw(color)
    doc.setLineWidth(0.25)
    doc.line(margin, yy, pageW - margin, yy)
  }

  function macroChip(
    x: number,
    yy: number,
    label: string,
    value: string,
    color: [number, number, number],
    chipW: number
  ) {
    // fondo sólido muy claro del color (mezcla manual)
    const bgR = Math.round(255 - (255 - color[0]) * 0.08)
    const bgG = Math.round(255 - (255 - color[1]) * 0.08)
    const bgB = Math.round(255 - (255 - color[2]) * 0.08)
    filledRect(x, yy - 3.5, chipW, 12, [bgR, bgG, bgB] as [number, number, number])

    // borde sutil del color
    setDraw(color)
    doc.setLineWidth(0.3)
    doc.rect(x, yy - 3.5, chipW, 12, 'S')

    // label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    setColor(color)
    doc.text(label.toUpperCase(), x + 2.5, yy + 0.5)

    // value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setColor(C.textDark)
    doc.text(value, x + 2.5, yy + 5.5)
  }

  // ─── HEADER ─────────────────────────────────────────────────────────────────

  filledRect(0, 0, pageW, 28, C.headerBg)

  // accent bar top
  setFill(C.accent)
  doc.rect(0, 0, pageW, 1.2, 'F')

  // app name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setColor(C.accent)
  doc.text('EVA FITNESS', margin, 9)

  // plan name
  const displayName = (params.planName || 'Plan nutricional').toUpperCase()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor(C.white)
  const planLines = doc.splitTextToSize(displayName, contentW - 35)
  doc.text(planLines, margin, 17)

  // date — right aligned
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(C.textLight)
  doc.text(formatDate(params.date), pageW - margin, 9, { align: 'right' })

  y = 36

  // ─── GOALS ROW ──────────────────────────────────────────────────────────────

  const chipW = (contentW - 9) / 4
  macroChip(margin, y, 'KCAL META', String(params.goals.calories), C.kcalColor, chipW)
  macroChip(margin + chipW + 3, y, 'PROTEÍNA', `${params.goals.protein}g`, C.proteinColor, chipW)
  macroChip(margin + (chipW + 3) * 2, y, 'CARBOHIDRATOS', `${params.goals.carbs}g`, C.carbsColor, chipW)
  macroChip(margin + (chipW + 3) * 3, y, 'GRASAS', `${params.goals.fats}g`, C.fatsColor, chipW)

  y += 14

  // ─── INSTRUCTIONS ───────────────────────────────────────────────────────────

  const instr = params.instructions?.trim()
  if (instr) {
    checkPage(18)
    filledRect(margin, y, contentW, 6, C.sectionBg)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor(C.textMid)
    doc.text('INDICACIONES DEL COACH', margin + 3, y + 4)
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor(C.textMid)
    const instrLines = doc.splitTextToSize(instr, contentW - 6)
    for (const line of instrLines) {
      checkPage(4.5)
      doc.text(line, margin + 3, y)
      y += 4.2
    }
    y += 3
  }

  // ─── MEALS ──────────────────────────────────────────────────────────────────

  let totalCalories = 0
  let totalProtein = 0
  let totalCarbs = 0
  let totalFats = 0

  for (const meal of params.meals) {
    const items = meal.food_items ?? []
    let mCalories = 0
    let mProtein = 0
    let mCarbs = 0
    let mFats = 0

    const mealMacros = items.map((fi) => {
      const m = fi.foods
        ? calculateFoodItemMacros({ quantity: fi.quantity ?? 0, unit: fi.unit ?? 'g', foods: fi.foods })
        : null
      if (m) { mCalories += m.calories; mProtein += m.protein; mCarbs += m.carbs; mFats += m.fats }
      return { fi, m }
    })

    // section header
    checkPage(10)
    filledRect(margin, y, contentW, 8, C.sectionBg)
    setFill(C.accent)
    doc.rect(margin, y, 2.5, 8, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setColor(C.textDark)
    doc.text(meal.name.toUpperCase(), margin + 6, y + 5.2)

    // subtotal right
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    setColor(C.textMid)
    doc.text(`${Math.round(mCalories)} kcal`, pageW - margin, y + 5.2, { align: 'right' })

    y += 10

    // table header
    checkPage(6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    setColor(C.textLight)
    doc.text('ALIMENTO', margin + 3, y)
    doc.text('CANT.', margin + contentW * 0.50, y)
    doc.text('KCAL', margin + contentW * 0.62, y)
    doc.text('P', margin + contentW * 0.73, y)
    doc.text('C', margin + contentW * 0.80, y)
    doc.text('G', margin + contentW * 0.87, y)
    y += 2.5
    hLine(y)
    y += 3

    // food items
    for (let i = 0; i < mealMacros.length; i++) {
      const { fi, m } = mealMacros[i]
      const name = fi.foods?.name ?? '—'
      const qty = fi.quantity ?? 0
      const unit = fi.unit ?? 'g'

      checkPage(6)

      if (i % 2 === 1) filledRect(margin, y - 3.5, contentW, 5.8, C.altRowBg)

      // food name
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      setColor(C.textDark)
      const nameParts = doc.splitTextToSize(name, contentW * 0.46)
      doc.text(nameParts[0], margin + 3, y)

      // quantity
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      setColor(C.textMid)
      doc.text(`${qty}${unit}`, margin + contentW * 0.50, y)

      if (m) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        setColor(C.textMid)
        doc.text(`${Math.round(m.calories)}`, margin + contentW * 0.62, y)
        doc.text(`${Math.round(m.protein)}`, margin + contentW * 0.73, y)
        doc.text(`${Math.round(m.carbs)}`, margin + contentW * 0.80, y)
        doc.text(`${Math.round(m.fats)}`, margin + contentW * 0.87, y)
      }

      y += 5.5

      // overflow name lines
      for (let li = 1; li < nameParts.length; li++) {
        checkPage(4)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        setColor(C.textMid)
        doc.text(nameParts[li], margin + 3, y)
        y += 4
      }
    }

    // meal subtotal row
    checkPage(8)
    hLine(y - 0.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    setColor(C.textMid)
    doc.text('Subtotal', margin + 3, y + 4)
    setColor(C.textDark)
    doc.text(`${Math.round(mCalories)} kcal`, margin + contentW * 0.62, y + 4)
    doc.text(`${Math.round(mProtein)}g`, margin + contentW * 0.73, y + 4)
    doc.text(`${Math.round(mCarbs)}g`, margin + contentW * 0.80, y + 4)
    doc.text(`${Math.round(mFats)}g`, margin + contentW * 0.87, y + 4)

    totalCalories += mCalories
    totalProtein += mProtein
    totalCarbs += mCarbs
    totalFats += mFats

    y += 10
  }

  // ─── TOTALS BOX ─────────────────────────────────────────────────────────────

  checkPage(30)

  // box bg
  filledRect(margin, y, contentW, 28, C.headerBg)
  // top accent line
  setFill(C.accent)
  doc.rect(margin, y, contentW, 1, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  setColor(C.accent)
  doc.text('RESUMEN DEL DÍA', margin + 4, y + 6)

  // 4 columns, well spaced
  const colW = contentW / 4
  const rowY = y + 18

  const rows: [string, number, number, [number, number, number]][] = [
    ['Kcal', Math.round(totalCalories), params.goals.calories, C.kcalColor],
    ['Proteína (g)', Math.round(totalProtein), params.goals.protein, C.proteinColor],
    ['Carbos (g)', Math.round(totalCarbs), params.goals.carbs, C.carbsColor],
    ['Grasas (g)', Math.round(totalFats), params.goals.fats, C.fatsColor],
  ]

  for (let i = 0; i < rows.length; i++) {
    const [label, consumed, goal, color] = rows[i]
    const x = margin + i * colW + 4

    // label color
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5)
    setColor(color)
    doc.text(label.toUpperCase(), x, y + 11)

    // consumed value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    setColor(C.white)
    doc.text(String(consumed), x, rowY)

    // goal value below
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(C.textLight)
    doc.text(`meta: ${goal}`, x, rowY + 5)
  }

  y += 32

  // ─── FOOTER ─────────────────────────────────────────────────────────────────

  const footerY = pageH - 8
  hLine(footerY - 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  setColor(C.textLight)
  doc.text(
    'Generado con EVA Fitness. Uso personal. No reemplaza valoración clínica, dietética ni médica.',
    margin,
    footerY
  )
  doc.text(new Date().toLocaleString('es-CL'), pageW - margin, footerY, { align: 'right' })

  const safeStem = params.fileStem.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'plan-nutricion'
  doc.save(`${safeStem}.pdf`)
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${months[m - 1]} ${y}`
}
