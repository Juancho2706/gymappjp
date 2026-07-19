#!/usr/bin/env node
/**
 * Reporte CEO del pipeline de clasificacion del catalogo (SPEC nutrition-portions
 * R8 paso 3, TASKS T4.3 — hallazgo PM4: la revision humana del tier medio es un
 * control de calidad real, no una formalidad).
 *
 * Toma el JSON del dry-run del driver (`classify-foods.mjs`, T4.2) y produce TRES
 * salidas en la ruta gitignoreada del driver (tmp/nutrition-portions/):
 *
 *   1. MD  (`report-*.md`)            — % clasificado total y por tier, distribucion
 *      por grupo (tabla), hasta N=15 muestras deterministas por grupo para los tiers
 *      alto y medio (foco: revision humana del medio), y la lista COMPLETA del tier
 *      bajo (quedan sin clasificar).
 *   2. JSON (`report-summary-*.json`) — el mismo modelo, para maquina (gates,
 *      re-dry-run delta=0, juicio del orquestador).
 *   3. HTML (`report-artifact-*.html`)— la plantilla `report-artifact-template.html`
 *      con los datos interpolados; ES el archivo que el orquestador publica como
 *      Artifact para el CEO en la fase de operacion.
 *
 * INTERPOLACION de la plantilla (mecanismo, documentado tambien en la plantilla):
 * la plantilla contiene EXACTAMENTE UNA VEZ el token `__EVA_PORTIONS_REPORT_DATA__`
 * dentro de su <script>; este script lo reemplaza por `JSON.stringify(model)` con
 * todo `<` escapado como secuencia unicode (asi el JSON jamas puede cerrar el <script> ni
 * inyectar HTML, y la pagina queda autocontenida sin requests externos). Si el
 * token no esta (o esta mas de una vez), se aborta: nunca un artifact a medias.
 *
 * CERO DB, cero red: entrada = archivo JSON del dry-run. Corre con node pelado:
 *   node scripts/nutrition-portions/report.mjs [--in <dataset.json>] [--out <dir>] [--samples N]
 * Default --in: tmp/nutrition-portions/classified-latest.json (lo emite el dry-run).
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// ---------------------------------------------------------------------------
// Constantes de dominio (display-only; la verdad viva es GROUP_REFS en
// heuristics.ts — nombres duplicados aca a proposito para que el reporte corra
// con node pelado, sin tsx. Si un grupo nuevo aparece en el dataset sin estar
// aca, igual se reporta con su code como nombre).
// ---------------------------------------------------------------------------

const GROUP_ORDER = ['C', 'P', 'F', 'V', 'LAC', 'ARL', 'SP', 'G', 'LEG']

const GROUP_NAMES = {
  C: 'Carbohidratos/Cereales',
  P: 'Proteinas (bajo grasa)',
  F: 'Frutas',
  V: 'Verduras',
  LAC: 'Lacteo',
  ARL: 'Alimento rico en lipidos',
  SP: 'Scoop proteina',
  G: 'Grasa de cocina',
  LEG: 'Legumbres',
}

/** Meta F1 (SPEC criterio 10): >=80% del catalogo en tier alto+medio. */
const META_GOAL_PCT = 80

const TEMPLATE_TOKEN = '__EVA_PORTIONS_REPORT_DATA__'
const DEFAULT_SAMPLES = 15

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function flagValue(name) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return undefined
  const value = process.argv[idx + 1]
  if (!value || value.startsWith('--')) return undefined
  return value
}

const IN_PATH = resolve(flagValue('--in') ?? resolve(__dirname, '../../tmp/nutrition-portions/classified-latest.json'))
const OUT_DIR = resolve(flagValue('--out') ?? resolve(__dirname, '../../tmp/nutrition-portions'))
const SAMPLE_SIZE = (() => {
  const raw = flagValue('--samples')
  if (raw === undefined) return DEFAULT_SAMPLES
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    console.error(`--samples invalido: '${raw}' (entero entre 1 y 100).`)
    process.exit(1)
  }
  return n
})()

// ---------------------------------------------------------------------------
// Modelo del reporte (funciones puras sobre el dataset del dry-run)
// ---------------------------------------------------------------------------

function round1(x) {
  return Math.round(x * 10) / 10
}

function pctOf(part, total) {
  return total > 0 ? round1((part / total) * 100) : 0
}

function signalsLabel(signals) {
  const s = signals ?? {}
  return `cat:${s.category ?? '—'} · kw:${s.keyword ?? '—'} · macro:${s.macro ?? '—'}`
}

/**
 * Muestra determinista: ordena por nombre (es) y toma hasta `n` filas espaciadas
 * uniformemente sobre el listado — representativa de punta a punta, sin RNG, y
 * estable entre corridas sobre el mismo dataset.
 */
export function sampleEven(rows, n) {
  if (rows.length <= n) return rows.slice()
  const out = []
  const step = rows.length / n
  for (let i = 0; i < n; i += 1) out.push(rows[Math.floor(i * step)])
  return out
}

function byNameEs(a, b) {
  return String(a.name).localeCompare(String(b.name), 'es')
}

function toSampleRow(r) {
  return {
    foodId: r.foodId,
    name: r.name,
    category: r.category ?? null,
    grams: r.grams ?? null,
    label: r.label ?? null,
    signals: signalsLabel(r.signals),
    reason: r.reason ?? '',
  }
}

/** Valida la forma minima del dataset del dry-run; falla cerrado con error claro. */
function assertDataset(dataset, path) {
  if (!dataset || typeof dataset !== 'object' || !Array.isArray(dataset.rows)) {
    throw new Error(`Dataset invalido en ${path}: se esperaba { rows: [...] } del dry-run de classify-foods.`)
  }
  for (const r of dataset.rows.slice(0, 5)) {
    if (typeof r.foodId !== 'string' || typeof r.name !== 'string' || typeof r.tier !== 'string') {
      throw new Error(`Dataset invalido en ${path}: filas sin foodId/name/tier (¿es el JSON del dry-run?).`)
    }
  }
}

export function buildReportModel(dataset, { sampleSize = DEFAULT_SAMPLES, sourcePath = null, now = new Date() } = {}) {
  const rows = dataset.rows

  // Totales
  const byTier = { alto: 0, medio: 0, bajo: 0 }
  let classified = 0
  for (const r of rows) {
    byTier[r.tier] = (byTier[r.tier] ?? 0) + 1
    if (r.group !== null && r.group !== undefined) classified += 1
  }
  const total = rows.length
  const unclassified = total - classified
  const altoMedio = (byTier.alto ?? 0) + (byTier.medio ?? 0)
  const pctAltoMedio = pctOf(altoMedio, total)

  // Distribucion por grupo x tier (orden fijo de los 9 system; extras al final)
  const matrix = new Map()
  for (const r of rows) {
    if (r.group === null || r.group === undefined) continue
    const cell = matrix.get(r.group) ?? { alto: 0, medio: 0, bajo: 0 }
    cell[r.tier] = (cell[r.tier] ?? 0) + 1
    matrix.set(r.group, cell)
  }
  const extraCodes = Array.from(matrix.keys()).filter((c) => !GROUP_ORDER.includes(c)).sort()
  const groups = [...GROUP_ORDER, ...extraCodes].map((code) => {
    const cell = matrix.get(code) ?? { alto: 0, medio: 0, bajo: 0 }
    const groupTotal = cell.alto + cell.medio + cell.bajo
    return {
      code,
      name: GROUP_NAMES[code] ?? code,
      alto: cell.alto,
      medio: cell.medio,
      bajo: cell.bajo,
      total: groupTotal,
      pctOfClassified: pctOf(groupTotal, classified),
    }
  })

  // Muestras por grupo para tiers alto y medio (foco de revision: medio)
  function samplesForTier(tier) {
    const out = []
    for (const code of [...GROUP_ORDER, ...extraCodes]) {
      const tierRows = rows.filter((r) => r.group === code && r.tier === tier).sort(byNameEs)
      if (tierRows.length === 0) continue
      out.push({
        code,
        name: GROUP_NAMES[code] ?? code,
        total: tierRows.length,
        rows: sampleEven(tierRows, sampleSize).map(toSampleRow),
      })
    }
    return out
  }

  // Lista COMPLETA del tier bajo (con o sin grupo candidato): quedan sin clasificar
  const tierBajoRows = rows
    .filter((r) => r.tier === 'bajo')
    .sort((a, b) => {
      const ga = a.group ?? '~~'
      const gb = b.group ?? '~~'
      if (ga !== gb) return ga < gb ? -1 : 1
      return byNameEs(a, b)
    })
    .map((r) => ({
      foodId: r.foodId,
      name: r.name,
      category: r.category ?? null,
      group: r.group ?? null,
      signals: signalsLabel(r.signals),
      reason: r.reason ?? '',
    }))

  return {
    generatedAt: now.toISOString(),
    datasetGeneratedAt: dataset.generatedAt ?? null,
    datasetMode: dataset.mode ?? null,
    target: dataset.target ?? null,
    sourcePath,
    sampleSize,
    meta: { goalPct: META_GOAL_PCT, pctAltoMedio, met: pctAltoMedio >= META_GOAL_PCT },
    totals: {
      total,
      classified,
      unclassified,
      pctClassified: pctOf(classified, total),
      byTier: { alto: byTier.alto ?? 0, medio: byTier.medio ?? 0, bajo: byTier.bajo ?? 0 },
      pctByTier: {
        alto: pctOf(byTier.alto ?? 0, total),
        medio: pctOf(byTier.medio ?? 0, total),
        bajo: pctOf(byTier.bajo ?? 0, total),
      },
    },
    groups,
    samples: { alto: samplesForTier('alto'), medio: samplesForTier('medio') },
    tierBajo: { count: tierBajoRows.length, rows: tierBajoRows },
  }
}

// ---------------------------------------------------------------------------
// Salida MD
// ---------------------------------------------------------------------------

/** Celda segura de tabla MD: sin pipes ni saltos de linea crudos. */
function mdCell(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function fmtPctMd(x) {
  return `${String(x).replace('.', ',')} %`
}

export function renderMarkdown(model) {
  const L = []
  const t = model.totals
  L.push('# Clasificación del catálogo por grupo de intercambio — reporte CEO (T4.3)')
  L.push('')
  L.push(`- Dataset (dry-run): ${model.datasetGeneratedAt ?? '—'} · modo ${model.datasetMode ?? '—'} · destino ${model.target ?? '—'}`)
  L.push(`- Fuente: \`${model.sourcePath ?? '—'}\``)
  L.push(`- Reporte generado: ${model.generatedAt}`)
  L.push('- Cero escrituras: nada de esto está aplicado. `--apply` solo tras GO, post-conversión de los 6 planes exchanges, y nunca pisa clasificación manual.')
  L.push('')
  L.push('## Resumen')
  L.push('')
  L.push('| Métrica | Valor | % del total |')
  L.push('|---|---:|---:|')
  L.push(`| Foods totales | ${t.total} | 100 % |`)
  L.push(`| Con grupo candidato | ${t.classified} | ${fmtPctMd(t.pctClassified)} |`)
  L.push(`| Tier alto | ${t.byTier.alto} | ${fmtPctMd(t.pctByTier.alto)} |`)
  L.push(`| Tier medio | ${t.byTier.medio} | ${fmtPctMd(t.pctByTier.medio)} |`)
  L.push(`| Tier bajo (queda sin clasificar) | ${t.byTier.bajo} | ${fmtPctMd(t.pctByTier.bajo)} |`)
  L.push(`| Sin grupo candidato | ${t.unclassified} | ${fmtPctMd(pctOf(t.unclassified, t.total))} |`)
  L.push('')
  L.push(
    `**Meta F1 (criterio 10): ≥ ${model.meta.goalPct} % en tier alto+medio** → ` +
      `${fmtPctMd(model.meta.pctAltoMedio)} — ${model.meta.met ? 'CUMPLIDA ✅' : 'NO CUMPLIDA ❌'}`,
  )
  L.push('')
  L.push('## Distribución por grupo')
  L.push('')
  L.push('| Grupo | Nombre | Alto | Medio | Bajo | Total | % de clasificados |')
  L.push('|---|---|---:|---:|---:|---:|---:|')
  for (const g of model.groups) {
    L.push(
      `| ${g.code} | ${mdCell(g.name)} | ${g.alto} | ${g.medio} | ${g.bajo} | ${g.total} | ${g.total > 0 ? fmtPctMd(g.pctOfClassified) : '—'} |`,
    )
  }
  L.push(`| — | Sin grupo candidato | 0 | 0 | ${t.unclassified} | ${t.unclassified} | — |`)
  L.push('')

  function sampleSection(title, groups, note) {
    L.push(`## ${title}`)
    L.push('')
    if (note) {
      L.push(note)
      L.push('')
    }
    if (groups.length === 0) {
      L.push('_Sin filas en este tier._')
      L.push('')
      return
    }
    for (const g of groups) {
      L.push(`### ${g.code} — ${g.name} (${g.rows.length} muestras de ${g.total})`)
      L.push('')
      L.push('| Alimento | Categoría | Porción | Medida | Señales | Razón |')
      L.push('|---|---|---:|---|---|---|')
      for (const r of g.rows) {
        L.push(
          `| ${mdCell(r.name)} | ${mdCell(r.category)} | ${r.grams != null ? `${r.grams} g` : '—'} | ${mdCell(r.label)} | ${mdCell(r.signals)} | ${mdCell(r.reason)} |`,
        )
      }
      L.push('')
    }
  }

  sampleSection(
    `Revisión humana — tier medio (hasta ${model.sampleSize} muestras por grupo)`,
    model.samples.medio,
    'Muestras deterministas espaciadas sobre el listado ordenado por nombre. El tier medio SOLO entra al `--apply` si el GO lo incluye tras revisar esto (hallazgo PM4).',
  )
  sampleSection(`Muestras — tier alto (hasta ${model.sampleSize} por grupo)`, model.samples.alto, null)

  L.push(`## Tier bajo — lista completa (${model.tierBajo.count} foods, quedan sin clasificar)`)
  L.push('')
  L.push('El `--apply` nunca toca estas filas; se retoman en pasadas posteriores o a mano.')
  L.push('')
  if (model.tierBajo.count === 0) {
    L.push('_Vacía._')
  } else {
    L.push('| Alimento | Categoría | Grupo candidato | Señales | Razón |')
    L.push('|---|---|---|---|---|')
    for (const r of model.tierBajo.rows) {
      L.push(`| ${mdCell(r.name)} | ${mdCell(r.category)} | ${r.group ?? '—'} | ${mdCell(r.signals)} | ${mdCell(r.reason)} |`)
    }
  }
  L.push('')
  L.push('---')
  L.push('')
  L.push('**Siguiente paso (operación, TASKS Gate 4)**: revisión CEO de este reporte → GO explícito (con o sin tier medio) → `--apply` con respaldo previo → re-dry-run de verificación (delta = 0). Reversible con `--down`.')
  L.push('')
  return L.join('\n')
}

// ---------------------------------------------------------------------------
// Salida HTML (interpolacion de la plantilla)
// ---------------------------------------------------------------------------

export function renderArtifactHtml(template, model) {
  const first = template.indexOf(TEMPLATE_TOKEN)
  const last = template.lastIndexOf(TEMPLATE_TOKEN)
  if (first === -1) {
    throw new Error(`La plantilla no contiene el token ${TEMPLATE_TOKEN}; no se puede interpolar.`)
  }
  if (first !== last) {
    throw new Error(`La plantilla contiene el token ${TEMPLATE_TOKEN} mas de una vez; debe existir exactamente una.`)
  }
  // `<` escapado dentro de literales JSON: el payload jamas puede cerrar el
  // <script> (p.ej. un food llamado "</script>") ni inyectar HTML.
  const safeJson = JSON.stringify(model).replace(/</g, '\\u003c')
  return template.slice(0, first) + safeJson + template.slice(first + TEMPLATE_TOKEN.length)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function writeOut(name, content) {
  const path = resolve(OUT_DIR, name)
  writeFileSync(path, content, 'utf8')
  return path
}

function main() {
  let raw
  try {
    raw = readFileSync(IN_PATH, 'utf8')
  } catch {
    console.error(
      `No se pudo leer el dataset del dry-run: ${IN_PATH}\n` +
        'Corre primero el dry-run (node --import tsx scripts/nutrition-portions/classify-foods.mjs) o pasa --in <path>.',
    )
    process.exit(1)
  }
  const dataset = JSON.parse(raw)
  assertDataset(dataset, IN_PATH)

  const model = buildReportModel(dataset, { sampleSize: SAMPLE_SIZE, sourcePath: IN_PATH })
  const template = readFileSync(resolve(__dirname, 'report-artifact-template.html'), 'utf8')

  mkdirSync(OUT_DIR, { recursive: true })
  const s = stamp()
  const md = renderMarkdown(model)
  const json = JSON.stringify(model, null, 2)
  const html = renderArtifactHtml(template, model)

  const mdPath = writeOut(`report-${s}.md`, md)
  writeOut('report-latest.md', md)
  const jsonPath = writeOut(`report-summary-${s}.json`, json)
  writeOut('report-summary-latest.json', json)
  const htmlPath = writeOut(`report-artifact-${s}.html`, html)
  writeOut('report-artifact-latest.html', html)

  const t = model.totals
  console.log(`\nReporte T4.3 generado desde ${IN_PATH}`)
  console.log(`Foods: ${t.total} · con grupo: ${t.classified} (${t.pctClassified}%)`)
  console.log(`Tiers: alto=${t.byTier.alto} (${t.pctByTier.alto}%) · medio=${t.byTier.medio} (${t.pctByTier.medio}%) · bajo=${t.byTier.bajo} (${t.pctByTier.bajo}%)`)
  console.log(`Meta >=${model.meta.goalPct}% alto+medio: ${model.meta.pctAltoMedio}% -> ${model.meta.met ? 'CUMPLIDA' : 'NO CUMPLIDA'}`)
  console.log(`MD:       ${mdPath} (+ report-latest.md)`)
  console.log(`JSON:     ${jsonPath} (+ report-summary-latest.json)`)
  console.log(`Artifact: ${htmlPath} (+ report-artifact-latest.html)`)
}

main()
