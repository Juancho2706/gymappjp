import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { getMuscleColor } from './muscle-colors'
import type { BuilderBlock, DayState } from './plan-builder/types'

// Export a PDF idéntico al PrintProgramDialog web (mismo HTML/CSS) vía expo-print + expo-sharing.

const DAYS_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const PRINT_STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 20px 28px; }
.doc-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; padding-bottom: 14px; border-bottom: 3px solid #111; }
.doc-title { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em; color: #111; }
.doc-meta { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 5px; }
.coach-badge { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #444; background: #f0f0f0; padding: 3px 8px; border-radius: 5px; }
.variant-header { display: flex; align-items: center; gap: 10px; margin: 18px 0 12px; }
.variant-title { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; color: #111; white-space: nowrap; }
.variant-line { flex: 1; height: 2px; background: #111; }
.day { border: 1.5px solid #e0e0e0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; break-inside: avoid; }
.day-header { background: #f7f7f7; padding: 10px 16px; border-bottom: 1.5px solid #e0e0e0; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.day-label { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25em; color: #888; }
.day-title { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: #111; }
.day-stats { font-size: 9px; color: #888; margin-left: auto; }
.blocks { padding: 0 16px; }
.block { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; break-inside: avoid; }
.block:last-child { border-bottom: none; }
.block-accent { width: 3px; border-radius: 2px; align-self: stretch; min-height: 32px; }
.block-num { font-size: 9px; font-weight: 900; color: #ccc; width: 18px; padding-top: 1px; }
.block-name { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #111; line-height: 1.25; }
.block-meta { font-size: 10px; color: #555; margin-top: 3px; font-weight: 500; }
.block-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.tag { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 2px 6px; border-radius: 3px; }
.tag-superset { background: #dbeafe; color: #1d4ed8; }
.tag-progression { background: #dcfce7; color: #15803d; }
.block-notes { font-size: 9px; color: #888; margin-top: 3px; font-style: italic; line-height: 1.4; }
.rest-day { padding: 14px 16px; text-align: center; color: #bbb; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; }
@page { margin: 14mm 16mm; size: A4 portrait; }
`

function blockHtml(b: BuilderBlock, idx: number): string {
  const color = getMuscleColor(b.muscle_group)
  const meta: string[] = []
  if (b.sets && b.reps) meta.push(`${b.sets} series × ${esc(b.reps)} reps`)
  if (b.target_weight_kg) meta.push(`${esc(b.target_weight_kg)} kg`)
  if (b.rest_time) meta.push(`Descanso: ${esc(b.rest_time)}`)
  if (b.rir != null && b.rir !== '' && b.rir !== '0') meta.push(`RIR ${esc(b.rir)}`)
  if (b.tempo) meta.push(`Tempo ${esc(b.tempo)}`)
  const tags: string[] = []
  if (b.superset_group) tags.push(`<span class="tag tag-superset">Superset ${esc(b.superset_group)}</span>`)
  if (b.progression_type) tags.push(`<span class="tag tag-progression">Progresión: +${b.progression_value ?? '?'}${b.progression_type === 'weight' ? ' kg/sem' : ' rep/ses'}</span>`)
  return `<div class="block">
    <div class="block-accent" style="background:${color}"></div>
    <div class="block-num">${String(idx + 1).padStart(2, '0')}</div>
    <div style="flex:1;min-width:0">
      <div class="block-name">${esc(b.exercise_name)}</div>
      ${meta.length ? `<div class="block-meta">${meta.join(' · ')}</div>` : ''}
      ${tags.length ? `<div class="block-tags">${tags.join('')}</div>` : ''}
      ${b.notes ? `<div class="block-notes">${esc(b.notes)}</div>` : ''}
    </div>
  </div>`
}

function daysHtml(days: DayState[]): string {
  const active = days.filter((d) => d.blocks.length > 0 || d.is_rest)
  return active.map((d) => {
    const sets = d.blocks.reduce((s, b) => s + (b.sets || 0), 0)
    const stats = d.is_rest ? 'Descanso' : `${d.blocks.length} ejercicio${d.blocks.length !== 1 ? 's' : ''} · ${sets} series`
    return `<div class="day">
      <div class="day-header">
        <span class="day-label">${esc(DAYS_NAMES[d.id] ?? d.name)}</span>
        ${d.title ? `<span class="day-title">${esc(d.title)}</span>` : ''}
        <span class="day-stats">${stats}</span>
      </div>
      <div class="blocks">
        ${d.is_rest ? '<div class="rest-day">Día de Descanso</div>' : d.blocks.map((b, i) => blockHtml(b, i)).join('')}
      </div>
    </div>`
  }).join('')
}

export async function exportProgramPdf(opts: {
  programName: string
  clientName?: string | null
  coachName?: string | null
  weeksToRepeat: number
  days: DayState[]
  daysB?: DayState[]
  isABMode?: boolean
}): Promise<void> {
  const metaLine = [
    opts.clientName ? `Cliente: ${esc(opts.clientName)}` : null,
    `${opts.weeksToRepeat} semana${opts.weeksToRepeat !== 1 ? 's' : ''}`,
    opts.isABMode ? 'Semanas A/B' : null,
  ].filter(Boolean).join(' · ')

  const body = opts.isABMode
    ? `<div class="variant-header"><span class="variant-title">Semana A</span><div class="variant-line"></div></div>${daysHtml(opts.days)}
       ${opts.daysB ? `<div class="variant-header"><span class="variant-title">Semana B</span><div class="variant-line"></div></div>${daysHtml(opts.daysB)}` : ''}`
    : daysHtml(opts.days)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(opts.programName)}</title><style>${PRINT_STYLES}</style></head><body>
    <div class="doc-header">
      <div>
        <div class="doc-title">${esc(opts.programName)}</div>
        <div class="doc-meta">${metaLine}</div>
      </div>
      ${opts.coachName ? `<span class="coach-badge">${esc(opts.coachName)}</span>` : ''}
    </div>
    ${body}
  </body></html>`

  const { uri } = await Print.printToFileAsync({ html })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: opts.programName })
  }
}
