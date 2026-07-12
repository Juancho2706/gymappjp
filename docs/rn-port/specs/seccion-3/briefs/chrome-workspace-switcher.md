# Unidad: chrome-workspace-switcher (key: `chrome-workspace-switcher`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = el CONMUTADOR DE WORKSPACE (coach standalone ↔ org/team), espejo mobile del WorkspaceSwitch web.

## Alcance exacto
- El sheet de cambio de workspace: lista de workspaces disponibles, seleccion, cierre — `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx:1-80` (UNICO archivo; sheet L49 `snapPoints={['50%','80%']}`).

## webFiles (verdad web, paths verificados)
- `apps/web/src/app/coach/dashboard/_components/sheets/WorkspaceSwitchSheet.tsx` — sheet web de cambio de workspace.
- Referencia de trigger: `apps/web/src/components/coach/CoachTopBar.tsx` (291 L) monta el switch en desktop.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx` (80 L)

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/CoachDashboardSections.tsx` — lo importa (L87) y monta (L1833, `switcherOpen`). El punto de entrada (chip/boton que abre el switcher) vive en `MobileGreetingHeader`/header, propiedad de `dashboard-sections`. Aqui solo el sheet; coordinar via props `open`/`onClose`.

## P0 / riesgos conocidos
- **BOMBA -999 (gotcha 6a) — ALTO:** `WorkspaceSwitcherSheet.tsx:49` usa `snapPoints={['50%','80%']}`. Verificar si es `@gorhom/bottom-sheet` directo o `components/Sheet.tsx`. El cambio de workspace es **CRITICO para el flujo** (un coach org/team no puede operar si no puede cambiar de contexto). Si el primer present da `containerHeight -999` o mide 0 → **migrar a `nativeModal`** de `components/Sheet.tsx` (patron ronda 7). Prioridad de verificacion en device.
- **Congelamiento (gotcha 6b):** si el sheet hace fetch propio de la lista de workspaces al abrir, cargar on-open, no con `useEffect` de un disparo. Si recibe la lista por props = OK.
- Copy VERBATIM de los nombres de workspace y labels ("Personal", nombre de org/team) 1:1 con el web.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: buscar `"WorkspaceSwitch"` / `"Workspace"` y `"CoachTopBar"` (1 hit) para el diseño del trigger + sheet.

## Notas de datos (queries/RPC, claves de dia)
- Lista de workspaces: derivada del contexto del coach (`getCoachProfile` + membresias org/team, `lib/workspace`). Sin claves de dia. El cambio de workspace persiste (AsyncStorage / contexto) y redirige/recarga el arbol coach — logica compartida (read-only).
