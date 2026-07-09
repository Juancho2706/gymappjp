import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import { signCheckinPhotos } from './api'
import type { CoachClientDetailData } from './coach-client-detail'

/**
 * E5-13 (spike D6) — DOSSIER del alumno como PDF nativo (expo-print) con layout OSCURO,
 * espejo del dossier web (jsPDF `client-dossier-pdf.ts`). Se porta la SALIDA visual (paleta +
 * secciones), no el mapper `buildClientDossier` de web: el dossier se arma desde el modelo
 * mobile `CoachClientDetailData` que la ficha ya carga. Ventaja de expo-print sobre jsPDF: es
 * HTML/CSS → fidelidad de layout ALTA (grids, barras, tipografía) sin dibujar a mano.
 *
 * @privacidad El dossier se comparte con el alumno ⇒ NO incluye pagos/billing (igual que web).
 * Fotos: el bucket `checkins` es privado ⇒ se firman server-side (`signCheckinPhotos`) y se
 * embeben como data:base64 (expo-print no siempre espera a que carguen `<img>` remotas).
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

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MAX_CHECKINS = 30
const MAX_PHOTOS = 6
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
function slugify(name: string): string {
  return (
    name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'alumno'
  )
}
function truncate(raw: string | null | undefined): string {
  if (!raw) return ''
  const s = String(raw).trim()
  return s.length > NOTES_MAX ? `${s.slice(0, NOTES_MAX - 1)}…` : s
}
function adherenceColor(pct: number | null): string {
  if (pct == null) return C.muted
  return pct >= 80 ? C.success : pct >= 50 ? C.warning : C.danger
}

export interface DossierScalars {
  statusLabel: string
  statusLevel: StatusLevel
  streak: number
  trainingAge: string
  lastActivityIso: string | null
  planCurrentWeek: number | null
}

// Firma las fotos frontales de los N check-ins más recientes y las baja a data:base64.
// Cada foto con su try/catch → null (una que falle no rompe el dossier).
async function embedCheckinPhotos(
  clientId: string,
  checkIns: CoachClientDetailData['checkIns']
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const withPhoto = checkIns.filter((c) => !!c.front_photo_url).slice(0, MAX_PHOTOS)
  if (withPhoto.length === 0) return out
  const refs = withPhoto.map((c) => c.front_photo_url as string)
  let signed: Record<string, string | null> = {}
  try {
    const res = await signCheckinPhotos(clientId, refs)
    signed = res.urls ?? {}
  } catch {
    return out
  }
  await Promise.all(
    withPhoto.map(async (c) => {
      const ref = c.front_photo_url as string
      const url = signed[ref]
      if (!url) return
      try {
        const target = `${FileSystem.cacheDirectory}dossier-${c.id}.jpg`
        const dl = await FileSystem.downloadAsync(url, target)
        const b64 = await FileSystem.readAsStringAsync(dl.uri, { encoding: FileSystem.EncodingType.Base64 })
        await FileSystem.deleteAsync(dl.uri, { idempotent: true }).catch(() => {})
        if (b64) out.set(c.id, `data:image/jpeg;base64,${b64}`)
      } catch {
        /* foto no disponible → placeholder */
      }
    })
  )
  return out
}

const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: ${C.bg}; color: ${C.textStrong}; }
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
.num { text-align: right; font-weight: 700; }
.pos { color: ${C.warning}; } .neg { color: ${C.success}; } .accent { color: ${C.accent}; }
.vol-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.vol-label { font-size: 8.5px; color: ${C.textMid}; width: 78px; }
.vol-track { flex: 1; height: 7px; background: ${C.card}; border-radius: 4px; overflow: hidden; }
.vol-bar { height: 100%; background: ${C.accent}; border-radius: 4px; }
.vol-val { font-size: 8.5px; font-weight: 800; width: 62px; text-align: right; }
.goals { display: flex; gap: 8px; margin-top: 8px; }
.goal { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 9px; padding: 9px 10px; flex: 1; }
.goal-label { font-size: 6.5px; font-weight: 800; letter-spacing: 0.06em; }
.goal-val { font-size: 12px; font-weight: 900; margin-top: 5px; }
.photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.photo-cell { width: calc(33.333% - 6px); }
.photo { width: 100%; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid ${C.border}; }
.photo-none { width: 100%; height: 150px; border-radius: 8px; border: 1px solid ${C.border}; background: ${C.card}; display: flex; align-items: center; justify-content: center; font-size: 8px; color: ${C.muted}; }
.photo-date { font-size: 7.5px; color: ${C.muted}; text-align: center; margin-top: 4px; }
.foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid ${C.border}; font-size: 8px; color: ${C.muted}; text-align: center; letter-spacing: 0.06em; }
@page { margin: 0; size: A4 portrait; }
`

function kpiCard(label: string, val: string, sub: string, subColor: string): string {
  return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-val">${esc(val)}</div><div class="kpi-sub" style="color:${subColor}">${esc(sub)}</div></div>`
}

export async function exportClientDossierPdf(
  clientId: string,
  data: CoachClientDetailData,
  scalars: DossierScalars
): Promise<void> {
  const client = data.client
  if (!client) return
  const cmp = data.compliance

  // ── Peso actual + Δ (último vs penúltimo check-in con peso).
  const weightSeries = [...data.checkIns].filter((c) => c.weight != null).sort((a, b) => a.date.localeCompare(b.date))
  const currentWeight = weightSeries.length ? Number(weightSeries[weightSeries.length - 1]!.weight) : null
  const weightDelta = weightSeries.length >= 2 ? Math.round((Number(weightSeries[weightSeries.length - 1]!.weight) - Number(weightSeries[weightSeries.length - 2]!.weight)) * 10) / 10 : null

  const workoutsDone = cmp?.workoutsThisWeek ?? 0
  const workoutsTarget = Math.max(1, cmp?.workoutsTarget ?? 1)
  const adherenceWeeklyPct = Math.min(100, Math.round((workoutsDone / workoutsTarget) * 100))
  const nutrition30 = data.nutritionMonthlyAvgPct
  const checkInPct = Math.round(cmp?.checkInCompliancePercent ?? 0)

  const status = STATUS_META[scalars.statusLevel] ?? STATUS_META.neutral
  let weightSub = 'sin cambio'
  let weightSubColor = C.muted
  if (weightDelta != null && Math.abs(weightDelta) > 0.05) {
    weightSub = `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg`
    weightSubColor = weightDelta > 0 ? C.warning : C.success
  }

  const kpis = [
    kpiCard('Peso', currentWeight != null ? `${currentWeight} kg` : '—', weightSub, weightSubColor),
    kpiCard('Adherencia semanal', `${adherenceWeeklyPct}%`, 'entrenamientos', adherenceColor(adherenceWeeklyPct)),
    kpiCard('Racha', String(scalars.streak), 'días seguidos', C.accent),
    kpiCard('Workouts semana', `${workoutsDone}/${workoutsTarget}`, 'esta semana', C.textMid),
    kpiCard('Nutrición 30d', `${nutrition30}%`, 'adherencia', adherenceColor(nutrition30)),
    kpiCard('Check-ins', `${checkInPct}%`, 'cumplimiento', adherenceColor(checkInPct)),
  ].join('')

  // ── Programa.
  const prog = data.activeProgram
  let programHtml = '<div class="empty">Sin programa activo asignado.</div>'
  if (prog) {
    const totalWeeks = Math.max(1, prog.weeks_to_repeat || 1)
    const days = (prog.workoutPlans ?? []).filter((p) => (p.blocks?.length ?? 0) > 0).slice(0, MAX_PROGRAM_DAYS)
    const dayRows = days.length
      ? days.map((d) => `<div class="day-row"><span class="day-name">${esc(d.title || 'Día de entrenamiento')}</span><span class="day-count">${d.blocks.length} ejercicio${d.blocks.length === 1 ? '' : 's'}</span></div>`).join('')
      : '<div class="empty">El programa no tiene días con ejercicios cargados.</div>'
    programHtml = `<div class="pname">${esc(prog.name || 'Programa activo')}</div>
      <div class="pmeta">Semana ${scalars.planCurrentWeek ?? '—'}/${totalWeeks}</div>
      <div style="margin-top:8px">${dayRows}</div>`
  }

  // ── Entrenamiento: PRs + volumen por grupo.
  const prs = data.personalRecords.slice(0, MAX_PRS)
  const prRows = prs.length
    ? prs.map((r) => `<tr><td>${esc(r.exerciseName)}</td><td>${esc(r.muscleGroup ?? '—')}</td><td class="num accent">${esc(r.maxWeightKg)} kg</td><td class="num">${r.repsAtMax ?? '—'}</td></tr>`).join('')
    : ''
  const prHtml = prRows
    ? `<table><thead><tr><th>Ejercicio</th><th>Grupo</th><th class="num">Máx</th><th class="num">Reps</th></tr></thead><tbody>${prRows}</tbody></table>`
    : '<div class="empty">Sin récords de fuerza registrados.</div>'

  const vol = data.muscleVolume.filter((v) => v.volume > 0).slice(0, MAX_VOL)
  const maxVol = Math.max(1, ...vol.map((v) => v.volume))
  const volHtml = vol.length
    ? vol.map((v) => `<div class="vol-row"><span class="vol-label">${esc(v.muscleGroup)}</span><span class="vol-track"><span class="vol-bar" style="width:${Math.max(2, (v.volume / maxVol) * 100)}%"></span></span><span class="vol-val">${v.volume.toLocaleString('es-CL')} kg</span></div>`).join('')
    : '<div class="empty">Sin volumen de entrenamiento en los últimos 30 días.</div>'

  // ── Nutrición.
  const np = data.activeNutrition
  let nutritionHtml = '<div class="empty">Sin plan de nutrición activo.</div>'
  if (np) {
    const meals = data.nutritionMeals ?? []
    const hasDaySpecific = meals.some((m) => m.day_of_week != null)
    const mealsNoun = `comida${meals.length === 1 ? '' : 's'}`
    const mealsLabel = hasDaySpecific ? `${meals.length} ${mealsNoun} en el plan (varía por día)` : `${meals.length} ${mealsNoun} por día`
    const goal = (label: string, val: string, color: string) => `<div class="goal"><div class="goal-label" style="color:${color}">${label}</div><div class="goal-val">${esc(val)}</div></div>`
    nutritionHtml = `<div class="pname">${esc(np.name || 'Plan nutricional')}</div>
      <div class="pmeta">${esc(mealsLabel)}</div>
      <div class="goals">
        ${goal('KCAL', np.daily_calories != null ? String(np.daily_calories) : '—', C.accent)}
        ${goal('PROTEÍNA', np.protein_g != null ? `${np.protein_g} g` : '—', C.success)}
        ${goal('CARBOS', np.carbs_g != null ? `${np.carbs_g} g` : '—', C.warning)}
        ${goal('GRASAS', np.fats_g != null ? `${np.fats_g} g` : '—', C.textMid)}
      </div>`
  }

  // ── Check-ins (tabla) + fotos (base64).
  const photoMap = await embedCheckinPhotos(clientId, data.checkIns)
  const checkInsDesc = [...data.checkIns].sort((a, b) => b.date.localeCompare(a.date))
  const shown = checkInsDesc.slice(0, MAX_CHECKINS)
  let ciHtml = '<div class="empty">Sin check-ins registrados.</div>'
  if (shown.length) {
    const rows = shown.map((c, i) => {
      const older = shown[i + 1]
      const delta = c.weight != null && older?.weight != null ? Math.round((Number(c.weight) - Number(older.weight)) * 10) / 10 : null
      const dCls = delta == null ? '' : delta > 0.05 ? 'pos' : delta < -0.05 ? 'neg' : ''
      const dTxt = delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
      return `<tr><td>${esc(fmtDate(c.date))}</td><td class="num">${c.weight != null ? `${esc(c.weight)} kg` : '—'}</td><td class="num ${dCls}">${dTxt}</td><td class="num">${c.energy_level != null ? `${esc(c.energy_level)}/10` : '—'}</td><td>${esc(truncate(c.notes))}</td></tr>`
    }).join('')
    const note = data.checkIns.length > shown.length ? `<div class="pmeta" style="margin-top:6px">Mostrando los ${shown.length} más recientes de ${data.checkIns.length} check-ins.</div>` : ''
    const withPhoto = checkInsDesc.filter((c) => !!c.front_photo_url).slice(0, MAX_PHOTOS)
    const photosHtml = withPhoto.length
      ? `<div class="sub-title">Fotos de progreso</div><div class="photos">${withPhoto.map((c) => {
          const src = photoMap.get(c.id)
          const img = src ? `<img class="photo" src="${src}"/>` : '<div class="photo-none">foto no disponible</div>'
          return `<div class="photo-cell">${img}<div class="photo-date">${esc(fmtDate(c.date))}</div></div>`
        }).join('')}</div>`
      : ''
    ciHtml = `<table><thead><tr><th>Fecha</th><th class="num">Peso</th><th class="num">Var.</th><th class="num">Energía</th><th>Notas</th></tr></thead><tbody>${rows}</tbody></table>${note}${photosHtml}`
  }

  const contactParts = [client.email, client.phone].filter(Boolean).map((s) => esc(s)).join('   ·   ')
  const metaLine = [
    `Cliente desde ${fmtMonthYear(client.subscription_start_date || client.created_at)}`,
    client.is_active === false ? 'Pausado' : 'Activo',
    `Racha ${scalars.streak} día${scalars.streak === 1 ? '' : 's'}`,
    scalars.trainingAge ? `~${esc(scalars.trainingAge)}` : '',
    `Generado ${fmtDate(new Date().toISOString())}`,
  ].filter(Boolean).join('   ·   ')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Dossier ${esc(client.full_name)}</title><style>${STYLES}</style></head><body>
    <div class="accent-bar"></div>
    <div class="wrap">
      <div class="topline">
        <div style="flex:1;min-width:0"><div class="eyebrow">Dossier del alumno</div></div>
        <div class="chip" style="background:${status.color}">${esc((scalars.statusLabel || status.label).toUpperCase())}</div>
      </div>
      <div class="name">${esc(client.full_name)}</div>
      ${contactParts ? `<div class="contact">${contactParts}</div>` : ''}
      <div class="meta">${metaLine}</div>

      <div class="kpi-grid">${kpis}</div>

      <div class="sec"><div class="sec-title">Programa</div><div class="sec-rule"></div>${programHtml}</div>

      <div class="sec"><div class="sec-title">Entrenamiento</div><div class="sec-rule"></div>
        <div class="sub-title">Récords personales</div>${prHtml}
        <div class="sub-title">Volumen por grupo (30d)</div>${volHtml}
      </div>

      <div class="sec"><div class="sec-title">Nutrición</div><div class="sec-rule"></div>${nutritionHtml}</div>

      <div class="sec"><div class="sec-title">Check-ins</div><div class="sec-rule"></div>${ciHtml}</div>

      <div class="foot">Generado con EVA · eva-app.cl · ${esc(fmtDate(new Date().toISOString()))}</div>
    </div>
  </body></html>`

  const { uri } = await Print.printToFileAsync({ html })
  // Renombra al stem del dossier (share sheet muestra el nombre del archivo).
  const stem = `dossier-${slugify(client.full_name)}-${new Date().toISOString().slice(0, 10)}`
  let shareUri = uri
  try {
    const target = `${FileSystem.cacheDirectory}${stem}.pdf`
    await FileSystem.moveAsync({ from: uri, to: target })
    shareUri = target
  } catch {
    /* si el rename falla, se comparte el archivo temporal igual */
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Dossier ${client.full_name}` })
  }
}
