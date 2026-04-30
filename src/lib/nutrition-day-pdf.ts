/**
 * Genera PDF en el navegador (sin enviar el plan al servidor).
 * @legal Contenido ya visible en la app; el archivo queda bajo control del usuario.
 */

export async function downloadNutritionDayPdf(lines: string[], fileStem: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 14
  const maxW = doc.internal.pageSize.getWidth() - margin * 2
  const pageH = doc.internal.pageSize.getHeight()
  let y = margin
  const lineGap = 1.35
  const baseSize = 10
  const lineHeightMm = baseSize * 0.45

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(baseSize)

  const safeStem = fileStem.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'plan-nutricion'

  for (const raw of lines) {
    const parts = doc.splitTextToSize(raw, maxW)
    const rows = Array.isArray(parts) ? parts : [String(parts)]
    for (const row of rows) {
      if (y + lineHeightMm * lineGap > pageH - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(row, margin, y)
      y += lineHeightMm * lineGap
    }
  }

  doc.save(`${safeStem}.pdf`)
}
