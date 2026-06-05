import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

// Export de PDF de progreso del alumno (coach) — reporte branded EVA, nunca vacío.

const DARK = '#07080C'
const CYAN = '#22D3EE'

function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function fmtDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export interface ProgressPdfCheckIn {
  date: string
  weight: number | null
  energy: number | null
  notes: string | null
  photo: string | null
}

export interface ProgressPdfInput {
  clientName: string
  coachName?: string | null
  trainingAge: string
  checkInsTotal: number
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
  sessionsYear: number
  checkIns: ProgressPdfCheckIn[]
  prs: { exerciseName: string; weightKg: number; reps: number; oneRm: number }[]
}

const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0F172A; background: #fff; }
.header { background: ${DARK}; padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; border-bottom: 4px solid ${CYAN}; }
.wordmark { font-size: 30px; font-weight: 900; letter-spacing: -1px; color: #fff; }
.wordmark .a { color: ${CYAN}; }
.h-right { text-align: right; }
.client { font-size: 15px; font-weight: 800; color: #fff; }
.h-meta { font-size: 10px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 3px; }
.wrap { padding: 24px 28px; }
.section-title { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; color: ${DARK}; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 2px solid ${DARK}; }
.kpi-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.kpi { border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 11px 14px; min-width: 110px; flex: 1; }
.kpi-val { font-size: 19px; font-weight: 900; letter-spacing: -0.3px; }
.kpi-label { font-size: 8px; color: #64748B; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 3px; }
.pos { color: #EF4444; } .neg { color: #10B981; } .accent { color: #0891B2; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748B; text-align: left; padding: 7px 8px; border-bottom: 2px solid ${DARK}; }
td { font-size: 11px; padding: 8px; border-bottom: 1px solid #EEF2F6; vertical-align: middle; }
.num { text-align: right; font-weight: 700; }
.photo { width: 52px; height: 64px; object-fit: cover; border-radius: 6px; border: 1px solid #E2E8F0; }
.no-photo { width: 52px; height: 64px; background: #F1F5F9; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94A3B8; }
.notes { max-width: 220px; font-size: 10px; color: #475569; }
.foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 9px; color: #94A3B8; text-align: center; letter-spacing: 0.08em; }
@page { margin: 0; size: A4 portrait; }
@media print { .wrap { padding: 16px 22px; } }
`

function kpi(val: string, label: string, cls = ''): string {
  return `<div class="kpi"><div class="kpi-val ${cls}">${esc(val)}</div><div class="kpi-label">${esc(label)}</div></div>`
}

export async function exportProgressPdf(input: ProgressPdfInput): Promise<void> {
  // Δ por check-in (vs el inmediatamente más antiguo). checkIns vienen más reciente primero.
  const ci = input.checkIns
  const checkInRows = ci.map((c, i) => {
    const older = ci[i + 1]
    const delta = c.weight != null && older?.weight != null ? Math.round((c.weight - older.weight) * 10) / 10 : null
    const dCls = delta == null ? '' : delta > 0.05 ? 'pos' : delta < -0.05 ? 'neg' : ''
    return `<tr>
      <td>${c.photo ? `<img class="photo" src="${esc(c.photo)}"/>` : '<div class="no-photo">Sin foto</div>'}</td>
      <td>${esc(fmtDate(c.date))}</td>
      <td class="num">${c.weight != null ? `${esc(c.weight)} kg` : '—'}</td>
      <td class="num">${c.energy != null ? `${esc(c.energy)}/10` : '—'}</td>
      <td class="num ${dCls}">${delta != null ? `${delta > 0 ? '+' : ''}${delta} kg` : '—'}</td>
      <td class="notes">${esc((c.notes ?? '').slice(0, 120))}</td>
    </tr>`
  }).join('')

  const composition = [
    input.initialWeight != null ? kpi(`${input.initialWeight} kg`, 'Peso inicial') : '',
    input.currentWeight != null ? kpi(`${input.currentWeight} kg`, 'Peso actual') : '',
    input.changeKg != null ? kpi(`${input.changeKg > 0 ? '+' : ''}${input.changeKg} kg`, 'Cambio total', input.changeKg > 0 ? 'pos' : 'neg') : '',
    input.ritmo30 != null ? kpi(`${input.ritmo30 > 0 ? '+' : ''}${input.ritmo30} kg`, 'Ritmo 30d', input.ritmo30 > 0 ? 'pos' : input.ritmo30 < 0 ? 'neg' : '') : '',
    input.projection4w != null ? kpi(`${input.projection4w} kg`, 'Proyección 4 sem') : '',
    input.bmi != null ? kpi(`${input.bmi.toFixed(1)}${input.bmiCategory ? ` · ${input.bmiCategory}` : ''}`, 'IMC') : '',
  ].filter(Boolean).join('')

  const activity = [
    kpi(String(input.sessionsYear), 'Entrenos (año)', 'accent'),
    kpi(String(input.sessions30d), 'Sesiones 30d'),
    kpi(String(input.checkInsTotal), 'Check-ins'),
    input.energy7d != null ? kpi(`${input.energy7d.toFixed(1)}/10`, 'Energía 7d') : '',
    kpi(`${input.nutritionWeekPct}%`, 'Adherencia 7d'),
    kpi(`${input.nutritionMonthPct}%`, 'Adherencia 30d'),
    kpi(`${input.nutritionStreak}d`, 'Racha nutrición', 'accent'),
  ].filter(Boolean).join('')

  const prRows = input.prs.slice(0, 10).map((p) =>
    `<tr><td>${esc(p.exerciseName)}</td><td class="num">${esc(p.weightKg)} kg × ${esc(p.reps)}</td><td class="num accent">${esc(p.oneRm)} kg</td></tr>`
  ).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Progreso ${esc(input.clientName)}</title><style>${STYLES}</style></head><body>
    <div class="header">
      <div class="wordmark">EV<span class="a">A</span></div>
      <div class="h-right">
        <div class="client">${esc(input.clientName)}</div>
        <div class="h-meta">Informe de progreso · ${esc(fmtDate(new Date().toISOString()))}${input.trainingAge ? ` · ${esc(input.trainingAge)}` : ''}</div>
      </div>
    </div>
    <div class="wrap">
      <div class="section-title">Actividad y nutrición</div>
      <div class="kpi-grid">${activity}</div>

      ${composition ? `<div class="section-title">Composición corporal</div><div class="kpi-grid">${composition}</div>` : ''}

      ${checkInRows ? `<div class="section-title">Historial de check-ins</div>
      <table><thead><tr><th>Foto</th><th>Fecha</th><th class="num">Peso</th><th class="num">Energía</th><th class="num">Δ Peso</th><th>Notas</th></tr></thead><tbody>${checkInRows}</tbody></table>` : ''}

      ${prRows ? `<div class="section-title">Récords de fuerza (1RM estimado)</div>
      <table><thead><tr><th>Ejercicio</th><th class="num">Mejor serie</th><th class="num">1RM</th></tr></thead><tbody>${prRows}</tbody></table>` : ''}

      <div class="foot">Generado con EVA · eva-app.cl</div>
    </div>
  </body></html>`

  const { uri } = await Print.printToFileAsync({ html })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Progreso ${input.clientName}` })
  }
}
