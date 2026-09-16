import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import {
  adherenceTone,
  buildTodayTiles,
  dossierFileStem,
  slugifyClientName,
  type ClientDossierData,
  type DossierTile,
  type DossierTone,
} from '@eva/client-dossier'
import { signCheckinPhotos } from './api'
import { MAX_PHOTOS_PER_EXPORT, MAX_PHOTOS_PER_MONTH, selectDossierPhotoRefs } from './client-dossier-photos'
import type { CoachClientDetailData } from './coach-client-detail'

/**
 * E5-13 (spike D6) — DOSSIER del alumno como PDF nativo (expo-print) con layout OSCURO,
 * espejo del dossier web (jsPDF `client-dossier-pdf.ts`). Ventaja de expo-print sobre jsPDF: es
 * HTML/CSS → fidelidad de layout ALTA (grids, barras, tipografía) sin dibujar a mano.
 *
 * Tren «Dossier por meses» (R23): el cuerpo del informe se extrajo a `renderDossierHtml(model)`,
 * que pinta UN bloque `.report` desde un `ClientDossierData` de `@eva/client-dossier`. Con eso hay
 * DOS entradas y un solo render:
 *   - `exportClientDossierPdf`  → dossier «de hoy» (firma intacta, se arma el modelo desde
 *     `CoachClientDetailData`, que es lo que la ficha ya tiene cargado).
 *   - `exportClientMonthDossiersPdf` → N informes mensuales en UN PDF (salto de página entre
 *     bloques), con los modelos que arma `buildClientMonthDossier` en la pantalla.
 * Los 6 cuadros KPI se leen SIEMPRE de `model.tiles` (R14): rótulos, valores y umbrales de color
 * viven en el package, no duplicados acá y en jsPDF.
 *
 * @privacidad El dossier se comparte con el alumno ⇒ NO incluye pagos/billing (igual que web).
 * Fotos: el bucket `checkins` es privado ⇒ se firman server-side (`signCheckinPhotos`) y se
 * embeben como data:base64 (expo-print no siempre espera a que carguen `<img>` remotas). Antes de
 * embeber pasan por `ImageManipulator` a 700 px / calidad 0.6 (R20): una foto de cámara moderna son
 * ~4 MB en base64 y 18 de esas revientan el proceso de impresión en un teléfono modesto.
 */

type StatusLevel = 'ok' | 'attention' | 'urgent' | 'neutral'

const C = {
  bg: '#0B0F19',
  card: '#161D2E',
  border: '#2A3348',
  textStrong: '#F8FAFC',
  textMid: '#94A3B8',
  muted: '#64748B',
  accent: '#F97316',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
}

const STATUS_META: Record<StatusLevel, { label: string; color: string }> = {
  urgent: { label: 'Urgente', color: C.danger },
  attention: { label: 'Atención', color: C.warning },
  ok: { label: 'Al día', color: C.success },
  neutral: { label: 'Inactivo', color: C.muted },
}

/** Tono semántico del tile (package) → color de ESTA paleta. */
const TONE_COLOR: Record<DossierTone, string> = {
  accent: C.accent,
  success: C.success,
  warning: C.warning,
  danger: C.danger,
  muted: C.muted,
  mid: C.textMid,
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MAX_CHECKINS = 30
/** Fotos del dossier «de hoy» (comportamiento previo al tren). El modo mes usa el tope de R20. */
const MAX_PHOTOS_TODAY = 6
const MAX_PRS = 10
const MAX_VOL = 8
const MAX_PROGRAM_DAYS = 14
const NOTES_MAX = 200

function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  return Number.isFinite(d.getTime()) ? d : null
}
function fmtDate(iso: string | null | undefined): string {
  const d = parseDate(iso)
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—'
}
function fmtMonthYear(iso: string | null | undefined): string {
  const d = parseDate(iso)
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—'
}
/** «Período 1–31 jul 2026» (el período de un informe nunca cruza de mes). */
function fmtPeriodRange(fromIso: string, toIso: string): string {
  const from = parseDate(fromIso)
  const to = parseDate(toIso)
  if (!from || !to) return '—'
  // Mes en curso el día 1: «1 sep 2026», no «1–1 sep 2026».
  const days = from.getDate() === to.getDate() ? `${to.getDate()}` : `${from.getDate()}–${to.getDate()}`
  return `${days} ${MONTHS[to.getMonth()]} ${to.getFullYear()}`
}
function truncate(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw).trim()
  return s.length > NOTES_MAX ? `${s.slice(0, NOTES_MAX - 1)}…` : s
}
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

export interface DossierScalars {
  statusLabel: string
  statusLevel: StatusLevel
  streak: number
  trainingAge: string
  lastActivityIso: string | null
  planCurrentWeek: number | null
}

// ─── Fotos: firma por lote + resize + base64 ─────────────────────────────────

/**
 * Baja UNA foto firmada y la devuelve como `data:` ya redimensionada (R20).
 * `slot` solo nombra el archivo temporal (los refs traen `/`).
 */
async function fetchPhotoDataUri(url: string, slot: number): Promise<string | null> {
  const target = `${FileSystem.cacheDirectory}dossier-photo-${slot}.jpg`
  let downloadedUri: string | null = null
  let resizedUri: string | null = null
  try {
    const dl = await FileSystem.downloadAsync(url, target)
    downloadedUri = dl.uri
    const resized = await ImageManipulator.manipulateAsync(
      dl.uri,
      [{ resize: { width: 700 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    )
    resizedUri = resized.uri ?? null
    return resized.base64 ? `data:image/jpeg;base64,${resized.base64}` : null
  } catch {
    return null
  } finally {
    if (downloadedUri) await FileSystem.deleteAsync(downloadedUri, { idempotent: true }).catch(() => {})
    if (resizedUri && resizedUri !== downloadedUri) {
      await FileSystem.deleteAsync(resizedUri, { idempotent: true }).catch(() => {})
    }
  }
}

/**
 * Firma + baja + redimensiona las fotos de TODOS los informes de una exportación.
 *
 * El presupuesto (por informe y global) lo decide `selectDossierPhotoRefs`, que es el único lugar
 * donde vive esa regla. La firma va POR INFORME (lote de mes, R20): así ningún POST se acerca al
 * tope de refs de la ruta y un mes que falle no arrastra a los demás. Los meses se procesan en
 * serie (dentro de cada uno, en paralelo): 18 descargas + 18 decodificaciones simultáneas es
 * justamente el pico de memoria que el resize viene a evitar.
 *
 * Devuelve un mapa `ref sin firmar → data:image/jpeg;base64,…`.
 */
async function embedDossierPhotos(
  clientId: string,
  reports: ClientDossierData[],
  opts: { perReport: number; total: number }
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const perReport = selectDossierPhotoRefs(reports, { perReport: opts.perReport, total: opts.total })
  let slot = 0
  for (const refs of perReport) {
    if (refs.length === 0) continue
    let signed: Record<string, string | null> = {}
    try {
      const res = await signCheckinPhotos(clientId, refs)
      signed = res.urls ?? {}
    } catch {
      continue
    }
    const slots = refs.map(() => slot++)
    await Promise.all(
      refs.map(async (ref, i) => {
        const url = signed[ref]
        if (!url) return
        const dataUri = await fetchPhotoDataUri(url, slots[i]!)
        if (dataUri) out.set(ref, dataUri)
      })
    )
  }
  return out
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: ${C.bg}; color: ${C.textStrong}; }
/* Salto de página ENTRE informes (R23). Va como \`+\` en vez de \`page-break-after\` sobre todos
   menos el último para no dejar una página en blanco al final del PDF. */
.report + .report { page-break-before: always; break-before: page; }
.accent-bar { height: 5px; background: ${C.accent}; }
.wrap { padding: 22px 26px 40px; }
.eyebrow { font-size: 9px; font-weight: 800; letter-spacing: 0.18em; color: ${C.accent}; text-transform: uppercase; }
.topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.chip { border-radius: 6px; padding: 5px 9px; font-size: 9px; font-weight: 800; color: ${C.bg}; white-space: nowrap; }
.name { font-size: 27px; font-weight: 900; letter-spacing: -0.8px; margin-top: 8px; }
.contact { font-size: 10px; color: ${C.textMid}; margin-top: 6px; }
.meta { font-size: 9px; color: ${C.muted}; margin-top: 4px; }
.kpi-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.kpi { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 9px; padding: 11px 12px; width: calc(33.333% - 6px); }
.kpi-label { font-size: 7px; font-weight: 800; letter-spacing: 0.08em; color: ${C.muted}; text-transform: uppercase; }
.kpi-val { font-size: 19px; font-weight: 900; letter-spacing: -0.4px; margin-top: 6px; }
.kpi-sub { font-size: 8.5px; font-weight: 700; margin-top: 3px; }
.sec { margin-top: 24px; }
.sec-title { font-size: 10.5px; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; border-left: 3px solid ${C.accent}; padding-left: 8px; }
.sec-rule { height: 1px; background: ${C.border}; margin: 7px 0 10px; }
.empty { font-size: 9px; font-style: italic; color: ${C.muted}; }
.pname { font-size: 12px; font-weight: 800; }
.pmeta { font-size: 9px; color: ${C.textMid}; margin-top: 3px; }
.day-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid ${C.border}; }
.day-name { font-size: 9.5px; font-weight: 700; }
.day-count { font-size: 8.5px; color: ${C.muted}; }
.sub-title { font-size: 8.5px; font-weight: 800; letter-spacing: 0.08em; color: ${C.textMid}; text-transform: uppercase; margin: 10px 0 6px; }
table { width: 100%; border-collapse: collapse; }
th { font-size: 7px; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.muted}; text-align: left; padding: 4px 6px; border-bottom: 1px solid ${C.border}; }
td { font-size: 9px; padding: 5px 6px; border-bottom: 1px solid ${C.border}; vertical-align: top; }
tr:nth-child(even) td { background: ${C.card}; }
/* Nada de filas, barras ni fotos partidas por el salto de página (R23). */
tr, .vol-row, .photo-cell { page-break-inside: avoid; break-inside: avoid; }
.num { text-align: right; font-weight: 700; }
.pos { color: ${C.warning}; } .neg { color: ${C.success}; } .accent { color: ${C.accent}; }
.vol-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.vol-label { font-size: 8.5px; color: ${C.textMid}; width: 78px; }
/* \`display: block\` en la pista y la barra: inofensivo en WebKit (iOS), NECESARIO en Chromium
   (Android), donde un <span> inline ignora width/height y la barra sale en cero (R23). */
.vol-track { flex: 1; height: 7px; background: ${C.card}; border-radius: 4px; overflow: hidden; display: block; }
.vol-bar { height: 100%; background: ${C.accent}; border-radius: 4px; display: block; }
.vol-val { font-size: 8.5px; font-weight: 800; width: 62px; text-align: right; }
.goals { display: flex; gap: 8px; margin-top: 8px; }
.goal { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 9px; padding: 9px 10px; flex: 1; }
.goal-label { font-size: 6.5px; font-weight: 800; letter-spacing: 0.06em; }
.goal-val { font-size: 12px; font-weight: 900; margin-top: 5px; }
.photos-block { break-inside: avoid; page-break-inside: avoid; }
.photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.photo-cell { width: calc(33.333% - 6px); }
.photo { width: 100%; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid ${C.border}; }
.photo-none { width: 100%; height: 150px; border-radius: 8px; border: 1px solid ${C.border}; background: ${C.card}; display: flex; align-items: center; justify-content: center; font-size: 8px; color: ${C.muted}; }
.photo-date { font-size: 7.5px; color: ${C.muted}; text-align: center; margin-top: 4px; }
.foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid ${C.border}; font-size: 8px; color: ${C.muted}; text-align: center; letter-spacing: 0.06em; }
@page { margin: 0; size: A4 portrait; }
`

function kpiCard(tile: DossierTile): string {
  return `<div class="kpi"><div class="kpi-label">${esc(tile.label)}</div><div class="kpi-val">${esc(tile.value)}</div><div class="kpi-sub" style="color:${TONE_COLOR[tile.tone] ?? C.muted}">${esc(tile.sub)}</div></div>`
}

export interface RenderDossierHtmlOpts {
  /**
   * SOLO modo hoy: chip del encabezado (nivel de atención con su color). El score es del PRESENTE,
   * así que no viaja en `ClientDossierData` con la forma que usa RN (4 niveles + label del hero).
   * En modo mes el chip es el período y este opt se ignora (R14).
   */
  chip?: { label: string; color: string } | null
  /** SOLO modo hoy: «~2 años entrenando» del hero — no existe en `ClientDossierData`. */
  trainingAge?: string | null
}

/**
 * UN informe como bloque `<div class="report">…</div>` (R23). PURA: no toca red ni reloj.
 *
 * `photoMap` va de **ref sin firmar del check-in** (el `photoUrl` del modelo en RN) a un
 * `data:image/jpeg;base64,…` ya redimensionado. Un modelo web, cuyo `photoUrl` ya es una URL
 * resuelta, también funciona: se usa tal cual.
 *
 * Diferencia deliberada entre modos: el dossier de hoy conserva el placeholder «foto no
 * disponible» (comportamiento actual) y el informe mensual solo pinta las fotos que resolvieron
 * —con 24 meses y tope global de 18, los meses sin presupuesto quedarían como un muro de
 * placeholders.
 */
export function renderDossierHtml(
  model: ClientDossierData,
  photoMap: Map<string, string>,
  opts: RenderDossierHtmlOpts = {}
): string {
  const period = model.period ?? null
  const isMonth = !!period
  const tiles = model.tiles ?? buildTodayTiles(model)

  // ── Encabezado.
  const eyebrow = isMonth ? `Informe mensual del alumno · ${period!.index} de ${period!.total}` : 'Dossier del alumno'
  const chip = isMonth
    ? { label: period!.label, color: C.accent }
    : opts.chip ?? { label: STATUS_META.neutral.label, color: STATUS_META.neutral.color }

  const contactParts = [model.identity.email, model.identity.phone].filter(Boolean).map((s) => esc(s)).join('   ·   ')
  const metaLine = [
    `Cliente desde ${fmtMonthYear(model.identity.clientSinceIso)}`,
    model.identity.isActive === false ? 'Pausado' : 'Activo',
    isMonth
      ? `Período ${fmtPeriodRange(period!.fromIso, period!.toIso)}`
      : `Racha ${model.identity.streakDays} ${plural(model.identity.streakDays, 'día', 'días')}`,
    isMonth ? '' : opts.trainingAge ? `~${esc(opts.trainingAge)}` : '',
    `Generado ${fmtDate(model.generatedAtIso)}`,
  ].filter(Boolean).join('   ·   ')

  // ── Programa.
  const prog = model.program
  let programHtml = isMonth
    ? '<div class="empty">Sin programa ni entrenamientos registrados en el período.</div>'
    : '<div class="empty">Sin programa activo asignado.</div>'
  if (prog) {
    const days = prog.days.slice(0, MAX_PROGRAM_DAYS)
    const dayRows = days.length
      ? days.map((d) => {
          // Sin conteo cuando el día no trae ejercicios (modo mes con nombres de plan de los logs).
          const count = d.blockCount > 0
            ? `<span class="day-count">${d.blockCount} ${plural(d.blockCount, 'ejercicio', 'ejercicios')}</span>`
            : ''
          return `<div class="day-row"><span class="day-name">${esc(d.title || 'Día de entrenamiento')}</span>${count}</div>`
        }).join('')
      : '<div class="empty">El programa no tiene días con ejercicios cargados.</div>'
    const meta = prog.subtitle ? `<div class="pmeta">${esc(prog.subtitle)}</div>` : ''
    programHtml = `<div class="pname">${esc(prog.name || 'Programa activo')}</div>
      ${meta}
      <div style="margin-top:8px">${dayRows}</div>`
  }

  // ── Entrenamiento: récords (★ = supera el máximo previo, solo modo mes) + volumen por grupo.
  const prs = model.training.personalRecords.slice(0, MAX_PRS)
  const prRows = prs.length
    ? prs.map((r) => {
        const star = r.isNew ? ' <span class="accent">★</span>' : ''
        return `<tr><td>${esc(r.exerciseName)}${star}</td><td>${esc(r.muscleGroup || '—')}</td><td class="num accent">${esc(r.maxWeightKg)} kg</td><td class="num">${r.repsAtMax || '—'}</td></tr>`
      }).join('')
    : ''
  const prNote = prs.some((r) => r.isNew)
    ? '<div class="pmeta">★ nuevo récord: supera el máximo de los meses anteriores.</div>'
    : ''
  const prHtml = prRows
    ? `<table><thead><tr><th>Ejercicio</th><th>Grupo</th><th class="num">Máx</th><th class="num">Reps</th></tr></thead><tbody>${prRows}</tbody></table>${prNote}`
    : '<div class="empty">Sin récords de fuerza registrados.</div>'

  const vol = model.training.muscleVolume.filter((v) => v.volume > 0).slice(0, MAX_VOL)
  const maxVol = Math.max(1, ...vol.map((v) => v.volume))
  const volHtml = vol.length
    ? vol.map((v) => `<div class="vol-row"><span class="vol-label">${esc(v.muscleGroup)}</span><span class="vol-track"><span class="vol-bar" style="width:${Math.max(2, (v.volume / maxVol) * 100)}%"></span></span><span class="vol-val">${v.volume.toLocaleString('es-CL')} kg</span></div>`).join('')
    : isMonth
      ? '<div class="empty">Sin volumen de entrenamiento en el período.</div>'
      : '<div class="empty">Sin volumen de entrenamiento en los últimos 30 días.</div>'
  const volTitle = isMonth ? `Volumen por grupo (${esc(period!.label)})` : 'Volumen por grupo (30d)'

  // ── Nutrición.
  const np = model.nutrition
  let nutritionHtml = isMonth
    ? '<div class="empty">Sin plan de nutrición vigente en el período.</div>'
    : '<div class="empty">Sin plan de nutrición activo.</div>'
  if (np) {
    const goals = np.goals
    const hasGoals = goals.calories != null || goals.protein != null || goals.carbs != null || goals.fats != null
    const goal = (label: string, val: string, color: string) => `<div class="goal"><div class="goal-label" style="color:${color}">${label}</div><div class="goal-val">${esc(val)}</div></div>`
    // El informe mensual sin metas a mano (los snapshots son lazy, R9) no pinta 4 chips con «—».
    const goalsHtml = hasGoals || !isMonth
      ? `<div class="goals">
        ${goal('KCAL', goals.calories != null ? String(goals.calories) : '—', C.accent)}
        ${goal('PROTEÍNA', goals.protein != null ? `${goals.protein} g` : '—', C.success)}
        ${goal('CARBOS', goals.carbs != null ? `${goals.carbs} g` : '—', C.warning)}
        ${goal('GRASAS', goals.fats != null ? `${goals.fats} g` : '—', C.textMid)}
      </div>`
      : ''
    const meta = np.subtitle ? `<div class="pmeta">${esc(np.subtitle)}</div>` : ''
    nutritionHtml = `<div class="pname">${esc(np.planName || 'Plan nutricional')}</div>
      ${meta}
      ${goalsHtml}`
  }

  // ── Check-ins: tabla + fotos embebidas.
  const checkIns = model.checkIns
  const shown = checkIns.slice(0, MAX_CHECKINS)
  let ciHtml = isMonth
    ? '<div class="empty">Sin check-ins en el período.</div>'
    : '<div class="empty">Sin check-ins registrados.</div>'
  if (shown.length) {
    const rows = shown.map((c) => {
      const delta = c.weightDeltaKg
      const dCls = delta == null ? '' : delta > 0.05 ? 'pos' : delta < -0.05 ? 'neg' : ''
      const dTxt = delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
      return `<tr><td>${esc(fmtDate(c.dateIso))}</td><td class="num">${c.weightKg != null ? `${esc(c.weightKg)} kg` : '—'}</td><td class="num ${dCls}">${dTxt}</td><td class="num">${c.energyLevel != null ? `${esc(c.energyLevel)}/10` : '—'}</td><td>${esc(truncate(c.notes))}</td></tr>`
    }).join('')
    const total = Math.max(model.checkInsTotal, checkIns.length)
    const note = total > shown.length ? `<div class="pmeta" style="margin-top:6px">Mostrando los ${shown.length} más recientes de ${total} check-ins.</div>` : ''
    // El mapa manda; un `data:`/URL ya resuelta (modelo web) se usa tal cual.
    const resolve = (ref: string | null): string | null => {
      if (!ref) return null
      const mapped = photoMap.get(ref)
      if (mapped) return mapped
      return ref.startsWith('data:') || ref.startsWith('http') ? ref : null
    }
    const maxPhotos = isMonth ? MAX_PHOTOS_PER_MONTH : MAX_PHOTOS_TODAY
    const withPhoto = checkIns
      .filter((c) => !!c.photoUrl && (!isMonth || !!resolve(c.photoUrl)))
      .slice(0, maxPhotos)
    const photosHtml = withPhoto.length
      ? `<div class="photos-block"><div class="sub-title">Fotos de progreso</div><div class="photos">${withPhoto.map((c) => {
          const src = resolve(c.photoUrl)
          const img = src ? `<img class="photo" src="${src}"/>` : '<div class="photo-none">foto no disponible</div>'
          return `<div class="photo-cell">${img}<div class="photo-date">${esc(fmtDate(c.dateIso))}</div></div>`
        }).join('')}</div></div>`
      : ''
    ciHtml = `<table><thead><tr><th>Fecha</th><th class="num">Peso</th><th class="num">Var.</th><th class="num">Energía</th><th>Notas</th></tr></thead><tbody>${rows}</tbody></table>${note}${photosHtml}`
  }

  return `<div class="report">
    <div class="accent-bar"></div>
    <div class="wrap">
      <div class="topline">
        <div style="flex:1;min-width:0"><div class="eyebrow">${esc(eyebrow)}</div></div>
        <div class="chip" style="background:${chip.color}">${esc(chip.label.toUpperCase())}</div>
      </div>
      <div class="name">${esc(model.identity.fullName)}</div>
      ${contactParts ? `<div class="contact">${contactParts}</div>` : ''}
      <div class="meta">${metaLine}</div>

      <div class="kpi-grid">${tiles.map(kpiCard).join('')}</div>

      <div class="sec"><div class="sec-title">Programa</div><div class="sec-rule"></div>${programHtml}</div>

      <div class="sec"><div class="sec-title">Entrenamiento</div><div class="sec-rule"></div>
        <div class="sub-title">Récords personales</div>${prHtml}
        <div class="sub-title">${volTitle}</div>${volHtml}
      </div>

      <div class="sec"><div class="sec-title">Nutrición</div><div class="sec-rule"></div>${nutritionHtml}</div>

      <div class="sec"><div class="sec-title">Check-ins</div><div class="sec-rule"></div>${ciHtml}</div>

      <div class="foot">Generado con EVA · eva-app.cl · ${esc(fmtDate(model.generatedAtIso))}</div>
    </div>
  </div>`
}

/** Documento completo: cabecera + N bloques `.report` (el CSS mete el salto de página). */
function wrapDocument(title: string, reports: string[]): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title><style>${STYLES}</style></head><body>${reports.join('\n')}</body></html>`
}

/** Imprime, renombra al stem pedido y abre el share sheet nativo. */
async function printAndShare(html: string, stem: string, dialogTitle: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html })
  let shareUri = uri
  try {
    const target = `${FileSystem.cacheDirectory}${stem}.pdf`
    await FileSystem.moveAsync({ from: uri, to: target })
    shareUri = target
  } catch {
    /* si el rename falla, se comparte el archivo temporal igual */
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle })
  }
}

// ─── Dossier «de hoy» ────────────────────────────────────────────────────────

/**
 * Modelo del dossier de hoy desde lo que la ficha ya tiene cargado. No se usa
 * `buildClientDossier` de web: depende de servicios del server y de `programWeekVariant` (R13).
 */
function buildTodayModel(
  data: CoachClientDetailData,
  client: NonNullable<CoachClientDetailData['client']>,
  scalars: DossierScalars,
  generatedAtIso: string
): ClientDossierData {
  const cmp = data.compliance

  // Peso actual + Δ (último vs penúltimo check-in con peso), igual que antes del tren.
  const weightSeries = [...data.checkIns].filter((c) => c.weight != null).sort((a, b) => a.date.localeCompare(b.date))
  const currentWeight = weightSeries.length ? Number(weightSeries[weightSeries.length - 1]!.weight) : null
  const weightDelta = weightSeries.length >= 2
    ? Math.round((Number(weightSeries[weightSeries.length - 1]!.weight) - Number(weightSeries[weightSeries.length - 2]!.weight)) * 10) / 10
    : null

  const workoutsDone = cmp?.workoutsThisWeek ?? 0
  const workoutsTarget = Math.max(1, cmp?.workoutsTarget ?? 1)
  const adherenceWeeklyPct = Math.min(100, Math.round((workoutsDone / workoutsTarget) * 100))
  const checkInPct = Math.round(cmp?.checkInCompliancePercent ?? 0)

  // Programa: el subtítulo se compone acá (el render solo lo imprime), igual que el modo mes.
  const prog = data.activeProgram
  const program = prog
    ? {
        name: prog.name || 'Programa activo',
        currentWeek: scalars.planCurrentWeek ?? 0,
        totalWeeks: Math.max(1, prog.weeks_to_repeat || 1),
        daysRemaining: 0,
        days: (prog.workoutPlans ?? [])
          .filter((p) => (p.blocks?.length ?? 0) > 0)
          .slice(0, MAX_PROGRAM_DAYS)
          .map((p) => ({ title: p.title || 'Día de entrenamiento', dayOfWeek: p.day_of_week, blockCount: p.blocks.length })),
        subtitle: `Semana ${scalars.planCurrentWeek ?? '—'}/${Math.max(1, prog.weeks_to_repeat || 1)}`,
      }
    : null

  const np = data.activeNutrition
  const meals = data.nutritionMeals ?? []
  const hasDaySpecificMeals = meals.some((m) => m.day_of_week != null)
  const mealsNoun = plural(meals.length, 'comida', 'comidas')
  const nutrition = np
    ? {
        planName: np.name || 'Plan nutricional',
        goals: {
          calories: np.daily_calories,
          protein: np.protein_g,
          carbs: np.carbs_g,
          fats: np.fats_g,
        },
        mealsTotal: meals.length,
        hasDaySpecificMeals,
        dayTargets: [],
        weeklyInRangePct: null,
        weeklyInRangeDays: 0,
        weeklyTrackedDays: 0,
        subtitle: hasDaySpecificMeals
          ? `${meals.length} ${mealsNoun} en el plan (varía por día)`
          : `${meals.length} ${mealsNoun} por día`,
      }
    : null

  // Check-ins DESC con Δ encadenado (el render corta la tabla en MAX_CHECKINS y las fotos en 6).
  const checkInsDesc = [...data.checkIns].sort((a, b) => b.date.localeCompare(a.date))
  const checkIns = checkInsDesc.map((c, i) => {
    const older = checkInsDesc[i + 1]
    const delta = c.weight != null && older?.weight != null
      ? Math.round((Number(c.weight) - Number(older.weight)) * 10) / 10
      : null
    return {
      dateIso: c.date,
      weightKg: c.weight != null ? Number(c.weight) : null,
      weightDeltaKg: delta,
      energyLevel: c.energy_level,
      notes: truncate(c.notes) || null,
      // En RN `photoUrl` lleva el ref SIN firmar: `renderDossierHtml` lo resuelve contra el
      // `photoMap` de fotos ya bajadas y redimensionadas.
      photoUrl: c.front_photo_url,
    }
  })

  const model: ClientDossierData = {
    generatedAtIso,
    identity: {
      fullName: client.full_name,
      email: client.email,
      phone: client.phone,
      isActive: client.is_active !== false,
      clientSinceIso: client.subscription_start_date || client.created_at,
      streakDays: scalars.streak,
      lastActivityIso: scalars.lastActivityIso,
    },
    status: { attentionScore: 0, level: 'aldia' },
    metrics: {
      currentWeightKg: currentWeight,
      weightDeltaKg: weightDelta,
      workoutsDone,
      workoutsTarget,
      adherenceWeeklyPct,
      nutritionTodayKcal: null,
      nutritionTodayPct: null,
      nutritionWeeklyInRangePct: null,
      checkInCompliancePct: checkInPct,
      planCurrentWeek: scalars.planCurrentWeek ?? 0,
      planTotalWeeks: program?.totalWeeks ?? 1,
    },
    program,
    training: {
      personalRecords: data.personalRecords.slice(0, MAX_PRS).map((r) => ({
        exerciseName: r.exerciseName,
        muscleGroup: r.muscleGroup ?? '—',
        maxWeightKg: r.maxWeightKg,
        repsAtMax: r.repsAtMax ?? 0,
      })),
      muscleVolume: data.muscleVolume.filter((v) => v.volume > 0).slice(0, MAX_VOL),
    },
    nutrition,
    checkIns,
    checkInsTotal: data.checkIns.length,
  }

  // Los 6 cuadros salen del package (R14) con UNA excepción: el tile de nutrición de RN sigue
  // mostrando el promedio de 30 días de las tablas V1 («Nutrición 30d»), que es lo que la ficha
  // tiene cargado. La verdad es la web (V2, «Nutrición semana»); migrar RN a V2 es backlog
  // explícito del tren (R22), no se cambia acá para no alterar el dossier de hoy.
  const tiles = buildTodayTiles(model)
  const nutrition30 = data.nutritionMonthlyAvgPct
  tiles[4] = {
    label: 'Nutrición 30d',
    // Micro-fix: sin dato el cuadro imprimía literalmente «null%».
    value: nutrition30 == null ? '—' : `${nutrition30}%`,
    sub: 'adherencia',
    tone: adherenceTone(nutrition30),
  }
  model.tiles = tiles
  return model
}

/** Dossier «de hoy»: un informe con el estado actual del alumno. Firma intacta. */
export async function exportClientDossierPdf(
  clientId: string,
  data: CoachClientDetailData,
  scalars: DossierScalars
): Promise<void> {
  const client = data.client
  if (!client) return

  const model = buildTodayModel(data, client, scalars, new Date().toISOString())
  const photoMap = await embedDossierPhotos(clientId, [model], { perReport: MAX_PHOTOS_TODAY, total: MAX_PHOTOS_TODAY })
  const status = STATUS_META[scalars.statusLevel] ?? STATUS_META.neutral
  const html = wrapDocument(
    `Dossier ${client.full_name}`,
    [renderDossierHtml(model, photoMap, {
      chip: { label: scalars.statusLabel || status.label, color: status.color },
      trainingAge: scalars.trainingAge,
    })]
  )

  const stem = `${dossierFileStem(client.full_name)}-${new Date().toISOString().slice(0, 10)}`
  await printAndShare(html, stem, `Dossier ${client.full_name}`)
}

// ─── Informes mensuales ──────────────────────────────────────────────────────

/**
 * N informes mensuales en UN solo PDF (R21/R23): un bloque `.report` por mes, con salto de página
 * entre bloques. Los modelos los arma la pantalla con `buildClientMonthDossier` (mismo
 * `generatedAtIso` para toda la exportación, R15).
 *
 * `includePhotos = false` ⇒ NO se firma ninguna foto (cero llamadas a la ruta de firma).
 */
export async function exportClientMonthDossiersPdf(
  clientId: string,
  models: ClientDossierData[],
  opts: { includePhotos: boolean }
): Promise<void> {
  if (models.length === 0) return
  const photoMap = opts.includePhotos
    ? await embedDossierPhotos(clientId, models, { perReport: MAX_PHOTOS_PER_MONTH, total: MAX_PHOTOS_PER_EXPORT })
    : new Map<string, string>()

  const fullName = models[0]!.identity.fullName
  const monthKeys = models.map((m) => m.period?.monthKey ?? '').filter((k) => !!k)
  const html = wrapDocument(
    `Informe mensual ${fullName}`,
    models.map((m) => renderDossierHtml(m, photoMap))
  )
  const stem = dossierFileStem(fullName, monthKeys) || `dossier-${slugifyClientName(fullName)}`
  await printAndShare(html, stem, `Informe mensual ${fullName}`)
}
