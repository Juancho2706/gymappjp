import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

// Export de PDF de progreso del alumno (coach) — mismo espíritu que progress-print web.

function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function fmtDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export interface ProgressPdfInput {
  clientName: string
  coachName?: string | null
  trainingAge: string
  initialWeight: number | null
  currentWeight: number | null
  changeKg: number | null
  projection4w: number | null
  ritmo30: number | null
  bmi: number | null
  bmiCategory: string | null
  energy7d: number | null
  nutritionWeekPct: number
  nutritionMonthPct: number
  nutritionStreak: number
  sessions30d: number
  weightSeries: { date: string; weight: number }[]
  prs: { exerciseName: string; weightKg: number; reps: number; oneRm: number }[]
}

const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 20px 28px; }
.doc-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 22px; padding-bottom: 14px; border-bottom: 3px solid #111; }
.doc-title { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
.doc-meta { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.14em; margin-top: 5px; }
.coach-badge { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #444; background: #f0f0f0; padding: 3px 8px; border-radius: 5px; }
.section-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: #111; margin: 20px 0 10px; padding-bottom: 5px; border-bottom: 2px solid #111; }
.kpi-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.kpi { border: 1.5px solid #e0e0e0; border-radius: 8px; padding: 10px 12px; min-width: 120px; flex: 1; }
.kpi-val { font-size: 18px; font-weight: 900; letter-spacing: -0.02em; }
.kpi-label { font-size: 8px; color: #888; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 3px; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th { font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; color: #888; text-align: left; padding: 6px 8px; border-bottom: 1.5px solid #111; }
td { font-size: 11px; padding: 7px 8px; border-bottom: 1px solid #f0f0f0; }
.num { text-align: right; font-weight: 700; }
@page { margin: 14mm 16mm; size: A4 portrait; }
`

function kpi(val: string, label: string): string {
  return `<div class="kpi"><div class="kpi-val">${esc(val)}</div><div class="kpi-label">${esc(label)}</div></div>`
}

export async function exportProgressPdf(input: ProgressPdfInput): Promise<void> {
  const metaLine = [`Generado ${fmtDate(new Date().toISOString())}`, input.trainingAge ? `Antigüedad: ${input.trainingAge}` : null]
    .filter(Boolean).join(' · ')

  const composition = [
    input.initialWeight != null ? kpi(`${input.initialWeight} kg`, 'Peso inicial') : '',
    input.currentWeight != null ? kpi(`${input.currentWeight} kg`, 'Peso actual') : '',
    input.changeKg != null ? kpi(`${input.changeKg > 0 ? '+' : ''}${input.changeKg} kg`, 'Cambio total') : '',
    input.ritmo30 != null ? kpi(`${input.ritmo30 > 0 ? '+' : ''}${input.ritmo30} kg`, 'Ritmo 30d') : '',
    input.projection4w != null ? kpi(`${input.projection4w} kg`, 'Proyección 4 sem') : '',
    input.bmi != null ? kpi(`${input.bmi.toFixed(1)}${input.bmiCategory ? ` · ${input.bmiCategory}` : ''}`, 'IMC') : '',
  ].filter(Boolean).join('')

  const habits = [
    input.energy7d != null ? kpi(`${input.energy7d.toFixed(1)}/10`, 'Energía 7d') : '',
    kpi(`${input.nutritionWeekPct}%`, 'Adherencia 7d'),
    kpi(`${input.nutritionMonthPct}%`, 'Adherencia 30d'),
    kpi(`${input.nutritionStreak}d`, 'Racha nutrición'),
    kpi(`${input.sessions30d}`, 'Sesiones 30d'),
  ].filter(Boolean).join('')

  const weightRows = input.weightSeries.slice(-14).map((w) => `<tr><td>${esc(fmtDate(w.date))}</td><td class="num">${esc(w.weight)} kg</td></tr>`).join('')
  const prRows = input.prs.slice(0, 10).map((p) =>
    `<tr><td>${esc(p.exerciseName)}</td><td class="num">${esc(p.weightKg)} kg × ${esc(p.reps)}</td><td class="num">${esc(p.oneRm)} kg</td></tr>`
  ).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Progreso ${esc(input.clientName)}</title><style>${STYLES}</style></head><body>
    <div class="doc-header">
      <div>
        <div class="doc-title">Progreso · ${esc(input.clientName)}</div>
        <div class="doc-meta">${esc(metaLine)}</div>
      </div>
      ${input.coachName ? `<span class="coach-badge">${esc(input.coachName)}</span>` : ''}
    </div>

    <div class="section-title">Composición corporal</div>
    <div class="kpi-grid">${composition || '<div class="kpi-label">Sin datos de peso.</div>'}</div>

    <div class="section-title">Nutrición y actividad</div>
    <div class="kpi-grid">${habits}</div>

    ${weightRows ? `<div class="section-title">Historial de peso</div>
    <table><thead><tr><th>Fecha</th><th class="num">Peso</th></tr></thead><tbody>${weightRows}</tbody></table>` : ''}

    ${prRows ? `<div class="section-title">Récords de fuerza (1RM estimado)</div>
    <table><thead><tr><th>Ejercicio</th><th class="num">Mejor serie</th><th class="num">1RM</th></tr></thead><tbody>${prRows}</tbody></table>` : ''}
  </body></html>`

  const { uri } = await Print.printToFileAsync({ html })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Progreso ${input.clientName}` })
  }
}
