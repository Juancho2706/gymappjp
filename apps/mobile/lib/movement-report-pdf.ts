import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { MOVEMENT_PATTERNS_V1 } from '@eva/calc'
import type { FinalAssessmentRow, MovementItemRow } from './movement-coach'
import { BAND_LABEL, DISCLAIMER, PATTERN_LABEL, fmtLong } from '../components/movement/MovementShared'

/**
 * Export del reporte de Evaluación de Movimiento como PDF nativo (expo-print +
 * expo-sharing) — espejo del print web `coach/movement/[clientId]/print`
 * (`MovementPrintReport.tsx`): tema claro fijo (independiente del dark mode),
 * marca del contexto en el header, compuesto /21, banda semáforo, flags de
 * dolor/asimetría, tabla de 7 patrones (lado débil en rojo, clearing positivo,
 * comentarios) y disclaimer SIEMPRE visible (AC5).
 *
 * Delta conocido vs web: el print web registra `pdf_generate` en la bitácora del
 * team (service `getMovementPrint`); este export local no escribe bitácora —
 * anotado en MOBILE_PARITY como divergencia aceptada hasta tener endpoint propio.
 */

// Colores del print web (MovementPrintReport.tsx:24-25) — fijos, sin white-label del scheme.
const BAND_HEX: Record<string, string> = { high: '#ef4444', moderate: '#f59e0b', low: '#10b981' }

function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function itemRow(item: MovementItemRow): string {
  const weakLeft =
    item.is_per_side && item.score_left != null && item.score_right != null && item.score_left < item.score_right
  const weakRight =
    item.is_per_side && item.score_left != null && item.score_right != null && item.score_right < item.score_left
  const weakStyle = 'font-weight:800;color:#dc2626'
  const left = item.is_per_side ? (item.score_left ?? '—') : '—'
  const right = item.is_per_side ? (item.score_right ?? '—') : (item.score_single ?? '—')
  return `
    <tr>
      <td class="pat">
        <p class="pat-name">${esc(PATTERN_LABEL[item.pattern] ?? item.pattern)}</p>
        ${item.clearing_positive === true ? '<p class="clearing">Test de despeje: positivo (dolor)</p>' : ''}
        ${item.comment ? `<p class="comment">${esc(item.comment)}</p>` : ''}
      </td>
      <td class="num" style="${weakLeft ? weakStyle : ''}">${esc(left)}</td>
      <td class="num" style="${weakRight ? weakStyle : ''}">${esc(right)}</td>
      <td class="num">${item.pain ? '✕' : ''}</td>
      <td class="num final">${esc(item.final_score)}</td>
    </tr>`
}

export async function exportMovementReportPdf(params: {
  clientName: string | null
  brandName: string
  brandColor?: string | null
  assessment: FinalAssessmentRow
}): Promise<void> {
  const { clientName, brandName, brandColor, assessment } = params

  // Mismo orden canónico que la web: MOVEMENT_PATTERNS_V1 manda, no el orden de DB.
  const ordered = MOVEMENT_PATTERNS_V1
    .map((def) => assessment.items.find((i) => i.pattern === def.slug))
    .filter((i): i is MovementItemRow => i != null)

  const band = assessment.risk_band
  const bandColor = band ? BAND_HEX[band] ?? '#646F7D' : '#646F7D'

  const html = `
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { margin: 14mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #fff; color: #171717; font-size: 13px; }
      .wrap { max-width: 720px; margin: 0 auto; }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid ${esc(brandColor || '#111')}; padding-bottom: 14px; }
      .brand { font-size: 13px; font-weight: 700; }
      h1 { font-size: 20px; font-weight: 800; margin-top: 2px; }
      .meta { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 16px; }
      .client { font-size: 17px; font-weight: 700; }
      .date { font-size: 11px; color: #737373; margin-top: 2px; }
      .comp-label { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #737373; text-align: right; }
      .comp { font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
      .comp small { font-size: 15px; color: #737373; font-weight: 600; }
      .pills { margin-top: 12px; }
      .pill { display: inline-block; border: 1.5px solid ${bandColor}; color: ${bandColor}; border-radius: 999px; padding: 3px 12px; font-size: 11px; font-weight: 700; margin-right: 8px; }
      .flag { display: inline-block; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 600; margin-right: 8px; }
      .flag.pain { background: #fee2e2; color: #b91c1c; }
      .flag.asym { background: #fef3c7; color: #b45309; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12.5px; }
      thead tr { border-bottom: 2px solid #171717; }
      th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; padding: 7px 6px; }
      th.c, td.num { text-align: center; }
      tbody tr { border-bottom: 1px solid #e5e5e5; }
      td { padding: 8px 6px; vertical-align: top; }
      td.num { font-variant-numeric: tabular-nums; }
      td.final { font-size: 15px; font-weight: 700; }
      .pat-name { font-weight: 500; }
      .clearing { font-size: 10px; font-weight: 600; color: #dc2626; margin-top: 2px; }
      .comment { font-size: 10.5px; color: #737373; margin-top: 2px; }
      .notes { margin-top: 16px; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; }
      .notes-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #737373; }
      .notes-body { margin-top: 4px; white-space: pre-wrap; font-size: 12.5px; }
      .disclaimer { margin-top: 24px; border-top: 1px solid #e5e5e5; padding-top: 12px; font-size: 10.5px; line-height: 1.55; color: #737373; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="head">
        <div>
          <p class="brand">${esc(brandName)}</p>
          <h1>Evaluación de movimiento</h1>
        </div>
      </div>
      <div class="meta">
        <div>
          <p class="client">${esc(clientName ?? '—')}</p>
          <p class="date">Evaluado el ${esc(fmtLong(assessment.assessed_at))}</p>
        </div>
        <div>
          <p class="comp-label">Puntaje compuesto</p>
          <p class="comp">${esc(assessment.composite_score ?? '—')}<small>/21</small></p>
        </div>
      </div>
      <div class="pills">
        <span class="pill">● ${esc(band ? BAND_LABEL[band] : '—')}</span>
        ${assessment.has_pain ? '<span class="flag pain">Dolor</span>' : ''}
        ${assessment.has_asymmetry ? '<span class="flag asym">Asimetría</span>' : ''}
      </div>
      <table>
        <thead>
          <tr>
            <th>Patrón</th>
            <th class="c">Izq</th>
            <th class="c">Der</th>
            <th class="c">Dolor</th>
            <th class="c">Final</th>
          </tr>
        </thead>
        <tbody>${ordered.map(itemRow).join('')}</tbody>
      </table>
      ${assessment.notes ? `
      <div class="notes">
        <p class="notes-label">Notas</p>
        <p class="notes-body">${esc(assessment.notes)}</p>
      </div>` : ''}
      <p class="disclaimer">${esc(DISCLAIMER)}</p>
    </div>
  </body>
  </html>`

  const { uri } = await Print.printToFileAsync({ html })
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Compartir no está disponible en este dispositivo.')
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Reporte de movimiento',
    UTI: 'com.adobe.pdf',
  })
}
