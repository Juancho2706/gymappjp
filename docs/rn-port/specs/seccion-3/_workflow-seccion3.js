export const meta = {
  name: 'seccion3-dashboard-coach',
  description: 'Port 1:1 Seccion 3 — dashboard del coach (dashboard, nav/busqueda, directorio, ficha): inventario → spec → port → verificacion adversarial (paridad + lente runtime) → docs',
  phases: [
    { title: 'Inventario', detail: 'mapa de unidades con briefs a disco', model: 'opus' },
    { title: 'Spec', detail: '1 spec con evidencia por unidad, a disco', model: 'opus' },
    { title: 'Port', detail: 'implementacion contra la spec', model: 'opus' },
    { title: 'Verify', detail: 'paridad adversarial + lente runtime (logica+cableado+frescura)', model: 'opus' },
    { title: 'Docs', detail: 'porting-status.md al dia', model: 'sonnet' },
  ],
}

const ROOT = 'D:/Proyectos/Antigravity/gymappjp/.claude/worktrees/rnmobiledenuevo'
const S3 = 'docs/rn-port/specs/seccion-3'

const CTX = `Trabajas en el monorepo gymappjp, worktree ${ROOT} (rama rnmobiledenuevo). PORT 1:1 Seccion 3: dashboard del COACH. Web = FUENTE DE VERDAD: apps/web/src/app/coach/dashboard/*, la nav del coach (sidebar/topbar/busqueda global, en apps/web/src/components/coach/*), el directorio apps/web/src/app/coach/clients/* y la ficha de cliente. Mobile = apps/mobile (arbol coach en app/coach/* y components/coach/*).
REGLAS DURAS:
1. PROHIBIDO especificar o portar de memoria: cada afirmacion cita archivo:linea del codigo real.
2. PROHIBIDO eliminar funcionalidad RN existente sin anotarlo. PROHIBIDO tocar archivos del arbol ALUMNO o del ejecutor (Secciones 1-2, en QA de device).
3. Tokens del theme; cero valores crudos nuevos; NO tocar global.css/tailwind.config.js.
4. NO commitear.
5. Copy VERBATIM del web (ya en latino neutro).
6. GOTCHAS DE CLASE institucionalizados (violarlos = FAIL directo del verificador):
   a. @gorhom/bottom-sheet NO soporta reanimated 4 (containerHeight -999 en el primer present; dynamicSizing mide 0): todo sheet CRITICO para el flujo debe usar el prop nativeModal de components/Sheet.tsx (patron Modal RN, ronda 7); sheets @gorhom existentes que tu unidad toque: migralos a nativeModal si su fallo bloquearia el flujo, o anota el riesgo.
   b. Widget/pantalla con fetch propio + tabs de expo-router (no se desmontan) = datos CONGELADOS: usa useFocusEffect (+ senal de recarga si el padre ya la tiene), nunca useEffect de un solo disparo.
   c. Fabric RN 45798: nunca estilos condicionales por focus en el wrapper de un TextInput.
   d. Claves de dia: SIEMPRE dia calendario Santiago via getSantiagoIsoYmdForUtcInstant (nunca prefijo UTC ni TZ del device).
   e. Notificaciones locales: identifier ESTABLE (nunca schedule sin identifier).
7. DISCIPLINA DE ARCHIVOS: cada unidad posee los archivos RN listados en su brief; cambios en archivos ajenos van a cambiosShell, NO se tocan.
8. Adaptaciones idiomaticas RN: SOLO si preservan lo que el usuario ve y puede hacer, documentadas — y las que cambien un GESTO o flujo (ej. tap-para-expandir vs abrir-teclado) NO se auto-sancionan: se anotan como PENDIENTE-DECISION-CEO en el resumen.
9. Resultado estructurado CORTO (limites estrictos); el detalle largo SIEMPRE a disco via Write.
GATE por unidad: npx tsc --noEmit en apps/mobile limpio.`

const UNITS_SCHEMA = {
  type: 'object',
  properties: {
    units: {
      type: 'array', maxItems: 14,
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', maxLength: 40 },
          titulo: { type: 'string', maxLength: 120 },
        },
        required: ['key', 'titulo'],
      },
    },
    resumen: { type: 'string', maxLength: 700 },
  },
  required: ['units', 'resumen'],
}

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['DONE', 'BLOCKED'] },
    specPath: { type: 'string', maxLength: 200 },
    resumen: { type: 'string', maxLength: 600 },
  },
  required: ['status', 'specPath', 'resumen'],
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['DONE', 'BLOCKED'] },
    resumen: { type: 'string', maxLength: 900 },
    cambiosShell: { type: 'string', maxLength: 400 },
  },
  required: ['status', 'resumen', 'cambiosShell'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    p0p1: { type: 'string', maxLength: 1200, description: 'hallazgos P0/P1 accionables con archivo:linea de ambos lados, o exactamente "ninguno"' },
    p2: { type: 'string', maxLength: 900, description: 'residuos P2 condensados, o "ninguno"' },
  },
  required: ['p0p1', 'p2'],
}

phase('Inventario')
const inv = await agent(`${CTX}
TAREA: INVENTARIO de la Seccion 3. Define 10-14 UNIDADES con propiedad DISJUNTA de archivos RN cubriendo: (1) dashboard del coach (apps/web/src/app/coach/dashboard — PulseHero, KPIs, agenda/atencion, widgets; RN: components/coach/CoachDashboardSections.tsx + app/coach/(tabs)/index o dashboard); (2) chrome/nav del coach (sidebar/topbar web → chrome mobile, busqueda global CoachGlobalSearch, workspace switcher, campana de novedades; RN: components/coach/* de nav + layout de tabs coach); (3) directorio de alumnos (apps/web/src/app/coach/clients — lista, filtros multi-grupo, DirRowCard, acciones; RN: app/coach/(tabs)/clientes.tsx + components/coach/directory/*); (4) ficha del cliente (web clients/[id] tabs; RN: app/coach/cliente/[clientId].tsx, 5 tabs).
INSUMOS PAGADOS que cada brief debe referenciar donde aplique: docs/rn-port/ola0-hallazgos.json (grep por CoachSidebar, CoachTopBar, CoachGlobalSearch, PulseHero, KPIs, Agenda, DirRowCard, ProfileOverviewB3 y afines) y las tablas de la revision coach de ronda 5 en docs/audits/rn-parity-qa/ (archivos r5-audit-*.md si existen — localizalos).
POR CADA UNIDAD escribe con Write un BRIEF en ${S3}/briefs/<key>.md con: titulo, alcance exacto, webFiles (paths reales verificados), rnFiles PROPIOS (disjuntos de otras unidades — verifica que existan), P0/riesgos conocidos (incluye si la unidad tiene sheets @gorhom con snapPoints fijos = bomba -999, y si tiene widgets con fetch propio = riesgo congelamiento), componentes a grepear en ola0-hallazgos.json, y notas de datos (queries/RPCs, claves de dia). Si un archivo compartido necesita duena (ej. CoachDashboardSections.tsx), asignalo a UNA unidad y anota en los briefs de las demas que es read-only.
En el RESULTADO devuelve SOLO la lista {key, titulo} + resumen corto — TODO el detalle va en los briefs (limite estricto del schema; no lo desbordes).`,
  { label: 'inventario', phase: 'Inventario', schema: UNITS_SCHEMA, model: 'opus', effort: 'high' })

if (!inv || !inv.units || inv.units.length === 0) { return { error: 'inventario vacio', inv } }
log(`Inventario: ${inv.units.length} unidades (briefs en ${S3}/briefs/)`)

const specPrompt = (u) => `${CTX}
TAREA: SPEC con evidencia de la unidad "${u.titulo}" (key: ${u.key}).
PRIMERO lee tu brief completo: ${S3}/briefs/${u.key}.md (define alcance, webFiles, rnFiles propios, riesgos e insumos).
Lee el codigo web LINEA POR LINEA y produce una spec donde CADA afirmacion cita archivo:lineas: layout/jerarquia, tokens/clases, tipografia, claro/oscuro, CADA elemento interactivo y su handler exacto (que abre, a donde navega, que toast, que sheet), estados (vacio/carga/error), validaciones, queries/datos (tablas, filtros, limites, claves de dia), animaciones, accesibilidad. Secciones obligatorias: "Hallazgos Ola 0" (grep segun brief), "Hallazgos ronda 5" (si el brief cita tablas r5), "Estado RN actual" (divergencias obvias con citas RN), y "Mapa de interacciones" (lista de TODOS los tocables web con su efecto — el lente de cableado verificara contra esta lista).
ESCRIBE la spec con Write en ${S3}/${u.key}.md y devuelve solo path + resumen corto.`

const portPrompt = (u, spec) => `${CTX}
TAREA: PORT de la unidad "${u.titulo}" (key: ${u.key}) CONTRA LA SPEC ${spec.specPath} (leela completa; contexto: ${spec.resumen}). Tu brief con archivos propios: ${S3}/briefs/${u.key}.md — respeta esa propiedad ESTRICTA.
Implementa contra la spec, NO contra tu imaginacion: modifica el RN existente (no dupliques), verifica consumidores antes de cambiar APIs internas. Consume los hallazgos Ola 0/r5 listados en la spec. Aplica los gotchas de clase (sheets criticos → nativeModal; fetches → useFocusEffect; dias → Santiago). Estilo del codigo circundante.
GATE: npx tsc --noEmit (apps/mobile) limpio; reporta el resultado.`

const verifyParityPrompt = (u, spec, ronda) => `${CTX}
Eres verificador ADVERSARIAL de PARIDAD (ronda ${ronda}) de la unidad "${u.titulo}" (key: ${u.key}). NO implementaste el port.
Lee la spec ${spec.specPath} completa, el brief ${S3}/briefs/${u.key}.md (archivos propios) y el codigo RN actual. Compara ELEMENTO POR ELEMENTO: layout, tokens, tipografia, claro/oscuro, cada handler y su efecto, estados, datos, animaciones. Evidencia de AMBOS lados en cada hallazgo.
P0 = roto/faltante funcional; P1 = comportamiento o dato incorrecto vs web; P2 = delta menor/compromiso DS/adaptacion documentada. p0p1 SOLO accionables (o "ninguno"); P2 condensados en p2. Corre npx tsc --noEmit (apps/mobile): si falla es P0. Respeta los maxLength: condensa.`

const runtimePrompt = (u, ronda) => `${CTX}
Eres verificador ADVERSARIAL con LENTE RUNTIME (ronda ${ronda}) — NO de paridad pixel — de la unidad "${u.titulo}". Archivos propios: en ${S3}/briefs/${u.key}.md. Tres sub-lentes sobre el codigo RN de la unidad:
(A) LOGICA/ESTADO: stale closures, deps de effects, races optimista/reconciliacion, timers con cleanup que mata sin reprogramar, guardas anti doble-tap en TODOS los paths, early-returns que esconden UI de error, setState post-unmount, keys inestables, fetches sin guard last-writer.
(B) CABLEADO DE INTERACCIONES: toma el "Mapa de interacciones" de la spec ${S3}/${u.key}.md y traza CADA tocable hasta su efecto real en RN: onPress existe y llega? el estado que setea lo consume algo montado? el sheet que abre es @gorhom con snapPoints fijos (bomba -999 → debe ser nativeModal si es critico)? navegaciones a rutas que existen?
(C) FRESCURA: cada fetch propio de la unidad refetchea al recuperar focus (useFocusEffect/senal)? datos que otro flujo puede mutar (crear alumno, completar algo) se refrescan como web?
Simula secuencias concretas. Max 6 hallazgos accionables en p0p1 con archivo:linea y escenario (o "ninguno"); P2 en p2. NO reportes estilo. Condensa.`

const fixPrompt = (u, findings, lente) => `${CTX}
TAREA: FIX de hallazgos de verificacion adversarial (${lente}) en la unidad "${u.titulo}" (archivos propios en ${S3}/briefs/${u.key}.md).
HALLAZGOS:
${findings}
Arregla TODOS los P0/P1, minimo e in-place, fiel al web citado. GATE: npx tsc --noEmit (apps/mobile) limpio.`

const results = await pipeline(
  inv.units,
  u => agent(specPrompt(u), { label: `spec:${u.key}`, phase: 'Spec', schema: SPEC_SCHEMA, model: 'opus', effort: 'high' })
        .then(s => ({ u, spec: s })),
  async (prev) => {
    if (!prev || prev.spec.status !== 'DONE') return prev
    const port = await agent(portPrompt(prev.u, prev.spec), { label: `port:${prev.u.key}`, phase: 'Port', schema: RESULT_SCHEMA, model: 'opus', effort: 'high' })
    return { ...prev, port }
  },
  async (prev) => {
    if (!prev || !prev.port || prev.port.status !== 'DONE') return prev
    const { u, spec } = prev
    let ronda = 1
    let parity = await agent(verifyParityPrompt(u, spec, ronda), { label: `verify:${u.key}:r${ronda}`, phase: 'Verify', schema: VERIFY_SCHEMA, model: 'opus', effort: 'high' })
    while (parity && parity.p0p1 !== 'ninguno' && ronda < 4) {
      await agent(fixPrompt(u, parity.p0p1, 'paridad'), { label: `fix:${u.key}:r${ronda}`, phase: 'Verify', schema: RESULT_SCHEMA, model: 'opus', effort: 'medium' })
      ronda++
      parity = await agent(verifyParityPrompt(u, spec, ronda), { label: `verify:${u.key}:r${ronda}`, phase: 'Verify', schema: VERIFY_SCHEMA, model: 'opus', effort: 'high' })
    }
    let rt = await agent(runtimePrompt(u, 1), { label: `runtime:${u.key}:r1`, phase: 'Verify', schema: VERIFY_SCHEMA, model: 'opus', effort: 'high' })
    if (rt && rt.p0p1 !== 'ninguno') {
      await agent(fixPrompt(u, rt.p0p1, 'runtime: logica+cableado+frescura'), { label: `fix-rt:${u.key}`, phase: 'Verify', schema: RESULT_SCHEMA, model: 'opus', effort: 'medium' })
      rt = await agent(runtimePrompt(u, 2), { label: `runtime:${u.key}:r2`, phase: 'Verify', schema: VERIFY_SCHEMA, model: 'opus', effort: 'high' })
    }
    return { key: u.key, titulo: u.titulo, spec: spec.specPath, port: prev.port.resumen, cambiosShell: prev.port.cambiosShell, rondasParidad: ronda, paridadFinal: parity ? parity.p0p1 : 'sin-verdict', p2: parity ? parity.p2 : '', runtimeFinal: rt ? rt.p0p1 : 'sin-verdict', runtimeP2: rt ? rt.p2 : '' }
  }
)

const done = results.filter(Boolean).filter(r => r.key)
log(`Unidades procesadas: ${done.length}/${inv.units.length}`)

phase('Docs')
const compact = done.map(r => ({ key: r.key, rondas: r.rondasParidad, p0p1: (r.paridadFinal || '').slice(0, 250), runtime: (r.runtimeFinal || '').slice(0, 250), shell: (r.cambiosShell || '').slice(0, 200) }))
const docs = await agent(`${CTX}
TAREA MECANICA: actualizar docs/porting-status.md con el resultado REAL de la Seccion 3 (dashboard del coach), ejecutada 2026-07-11 con el pipeline §2 + lente runtime (logica+cableado+frescura). Specs en ${S3}/.
Datos por unidad (JSON): ${JSON.stringify(compact)}
(1) Tabla "Orden de secciones": Seccion 3 a su estado real; Seccion 4 (Nutricion) pasa a "siguiente". (2) Nueva seccion "Resultado Seccion 3": metodologia, estado por unidad con P2 condensados, P0/P1 abiertos si los hay, cambiosShell pendientes. (3) "Donde retomar": Seccion 4 + QA visual humano de la Seccion 3 en device (build nativa nueva desde rnmobiledenuevo). (4) ANTES de escribir: spot-check de 2-3 claims contra HEAD; si algo no cuadra, escribe lo que el codigo diga y anotalo. Estilo/idioma del doc. NO toques otras secciones salvo la tabla. NO commitees.`,
  { label: 'docs:status', phase: 'Docs', schema: RESULT_SCHEMA, model: 'sonnet', effort: 'low' })

return { inventario: inv.resumen, unidades: done, docs: docs ? docs.resumen : 'sin-docs' }
