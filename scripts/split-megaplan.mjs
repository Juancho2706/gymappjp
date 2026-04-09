import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const megaPath = path.join(root, 'claudeplans', 'jaunty-fluttering-spark.md')
const mega = fs.readFileSync(megaPath, 'utf8').split(/\r?\n/)

function xr(a, b) {
  return mega.slice(a, b + 1).join('\n')
}

const docs = [
  {
    name: 'PLAN-A-dashboard-fundamentos-y-datos.md',
    head: `# PLAN A — Dashboard: fundamentos y datos

**Fuente (solo lectura, no modificar):** \`claudeplans/jaunty-fluttering-spark.md\`  
**Checklist §11 del maestro:** pasos **1–3** (\`date-utils.ts\`, \`animation-presets.ts\`, \`_data/dashboard.queries.ts\`).

Extracto literal del plan maestro.

---

`,
    parts: [
      [0, 100],
      [102, 271],
      [1033, 1076],
    ],
    between: ['\n\n---\n\n', '\n\n---\n\n## Extracto §4 — presets de animación\n\n'],
  },
  {
    name: 'PLAN-B-dashboard-shell-y-layout.md',
    head: `# PLAN B — Dashboard: shell y layout

**Fuente (solo lectura):** \`claudeplans/jaunty-fluttering-spark.md\`  
**Checklist §11:** paso **4** (\`DashboardShell.tsx\`). Pull-to-refresh (Plan F).

---

`,
    parts: [
      [274, 336],
      [396, 426],
      [1102, 1168],
      [1172, 1224],
    ],
    between: [
      '\n\n---\n\n### Extracto §3 — DashboardShell\n\n',
      '\n\n---\n\n',
      '\n\n---\n\n',
    ],
  },
  {
    name: 'PLAN-C-dashboard-header-calendario-checkin.md',
    head: `# PLAN C — Dashboard: header, calendario, check-in

**Fuente (solo lectura):** \`claudeplans/jaunty-fluttering-spark.md\`  
**Checklist §11:** pasos **5–7**.

---

`,
    parts: [
      [429, 575],
      [1078, 1097],
      [1234, 1253],
    ],
    between: [
      '\n\n---\n\n## Extracto §4 — tabla de animaciones (este sprint)\n\n',
      '\n\n---\n\n## Extracto §7 — skeletons\n\n',
    ],
  },
  {
    name: 'PLAN-D-dashboard-hero-compliance-quicklog.md',
    head: `# PLAN D — Dashboard: hero, compliance, quick log

**Fuente (solo lectura):** \`claudeplans/jaunty-fluttering-spark.md\`  
**Checklist §11:** pasos **8–11**.

---

`,
    parts: [
      [577, 758],
      [1083, 1096],
      [1255, 1263],
      [1344, 1370],
    ],
    between: [
      '\n\n---\n\n## Extracto §4 — tabla de animaciones\n\n',
      '\n\n---\n\n## Extracto §7 — HeroAndComplianceSkeleton\n\n',
      '\n\n---\n\n## Extracto §10 — Compliance score\n\n',
    ],
  },
  {
    name: 'PLAN-E-dashboard-nutricion-peso-prs.md',
    head: `# PLAN E — Dashboard: nutrición, peso, PRs

**Fuente (solo lectura):** \`claudeplans/jaunty-fluttering-spark.md\`  
**Checklist §11:** pasos **12–14**.

---

`,
    parts: [
      [760, 1016],
      [1089, 1095],
      [1264, 1297],
      [1326, 1340],
    ],
    between: [
      '\n\n---\n\n## Extracto §4 — tabla de animaciones\n\n',
      '\n\n---\n\n## Extracto §7 — skeletons\n\n',
      '\n\n---\n\n## Extracto §9 — Server actions\n\n',
    ],
  },
  {
    name: 'PLAN-F-dashboard-programa-historial-loading-page-qa.md',
    head: `# PLAN F — Dashboard: programa, historial, loading, page, QA

**Fuente (solo lectura):** \`claudeplans/jaunty-fluttering-spark.md\`  
**Checklist §11:** pasos **15–20**.

---

`,
    parts: [
      [902, 1031],
      [1094, 1097],
      [1034, 1076],
      [1227, 1323],
      [1326, 1340],
      [1373, 1395],
      [1398, 1435],
      [341, 393],
    ],
    between: [
      '\n\n---\n\n## Extracto §4 — animaciones\n\n',
      '\n\n---\n\n',
      '\n\n---\n\n',
      '\n\n---\n\n## Extracto §9 — acción opcional\n\n',
      '\n\n---\n\n## Extracto §11 — Checklist\n\n',
      '\n\n---\n\n## Extracto §12 — Verificación\n\n',
      '\n\n---\n\n### Extracto §3 — page.tsx\n\n',
    ],
  },
]

for (const d of docs) {
  let body = d.head
  for (let i = 0; i < d.parts.length; i++) {
    const [a, b] = d.parts[i]
    body += xr(a, b)
    if (i < d.between.length) body += d.between[i]
  }
  fs.writeFileSync(path.join(root, 'docs', d.name), body, 'utf8')
}

console.log('split-megaplan.mjs: OK')
