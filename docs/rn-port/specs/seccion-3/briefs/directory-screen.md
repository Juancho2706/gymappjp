# Unidad: directory-screen (key: `directory-screen`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = la PANTALLA del directorio de alumnos: header/action-bar, FlatList (lista/grid), buscador, orden, wiring de filtros y FABs. El look de las FILAS/tarjetas, el resumen/WarRoom, los sheets y los modales de crear/importar viven en unidades hermanas.

## Alcance exacto
- `apps/mobile/app/coach/(tabs)/clientes.tsx` (640 L): imports L1-49; header animado (`useAnimatedScrollHandler`), action bar (`BarButton` L~463, `actionBar` L~510), FlatList de `DirRowCard`/`ClientCard`, buscador, orden, doble FAB (Nuevo alumno + Importar), wiring de `DirectoryFilterSheet`/`DirectoryOptionSheet`.
- Constantes compartidas del directorio: `apps/mobile/components/coach/directory/directory-shared.ts` (78 L; `DANGER/EMBER/INFO/WARNING`, `RISK_LABELS`, `SORT_OPTIONS`, `STATUS_OPTIONS`, `hexToRgba`, helpers `buildStats`/`filterClients`/`sortClients`/`getCoachDirectoryClients`/`getCoachDirectoryPulse`). **Owner = esta unidad**; las demas unidades del directorio la importan read-only.

## webFiles (verdad web, paths verificados)
- `apps/web/src/app/coach/clients/page.tsx` (65 L) — RSC.
- `apps/web/src/app/coach/clients/CoachClientsShell.tsx`, `ClientsDirectoryClient.tsx`, `CoachRosterMasterDetail.tsx` — orquestacion + master/detail.
- `apps/web/src/app/coach/clients/DirectoryActionBar.tsx` (370 L) — action bar (botones, buscador, conteo, orden).
- `apps/web/src/app/coach/clients/clientsDirectorySort.ts`, `directory-types.ts` — orden/tipos.
- Tabla/lista: `DirTableMobile.tsx`, `DesktopRosterTable.tsx`, `ClientsDirectoryTable.tsx`, `ClientsDirectoryEmpty.tsx`.
- Datos: `apps/web/src/app/coach/clients/_data/clients.queries.ts`.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/app/coach/(tabs)/clientes.tsx` (640 L)
- `apps/mobile/components/coach/directory/directory-shared.ts` (78 L)

## READ-ONLY (de otras unidades — NO tocar)
- `DirRowCard.tsx`, `ClientCard.tsx` → `directory-row-cards`.
- `DirectorySummary.tsx`, `DirectoryAlertBanner.tsx` → `directory-summary`.
- `DirectoryFilterSheet.tsx`, `DirectoryOptionSheet.tsx`, `ClientActionsSheet.tsx` → `directory-sheets`.
- `CreateClientModal.tsx`, `ImportClientsForm.tsx` → `directory-create-import`.
(clientes.tsx los importa y monta a todos; solo consumir/coordinar por props.)

## P0 / riesgos conocidos (audit R5 §2 `r5-audit-coach-core.md`)
- **§2.1 (EST):** boton de action bar activo — web = fill solido ink (`bg-text-strong text-surface-card`), RN = tint marca (`bg-primary/0.12`); iconos 18 vs 16; linea de conteo dice "N resultados" (+flecha direccion) vs web "N alumnos"; chip X sin `opacity-70`.
- **§2.1 sheet de filtros incompleto (EST):** clientes.tsx solo cablea `DirectoryOptionSheet` (SOLO Estado). El web tiene UN sheet con 3 grupos (Estado+Riesgo+Programa). **NOTA:** ya existe `DirectoryFilterSheet.tsx` (3 grupos) importado (L36) — verificar si esta cableado o muerto; el fix de wiring (usar el filter sheet completo) es de ESTA unidad, el contenido del sheet es de `directory-sheets`.
- **§2.4 doble-FAB (EST, PENDIENTE-DECISION-CEO):** RN tiene 2 FABs (pill "Nuevo alumno" L~412 + Importar `Upload` L~402); el web md<760 NO usa FABs (nuevo-alumno/importar son icon-buttons del header WarRoom). Es un cambio de GESTO/patron de chrome → **anotar como PENDIENTE-DECISION-CEO** (regla 8), no auto-sancionar.
- **Congelamiento (gotcha 6b) — ALTO:** clientes.tsx vive en un tab persistente y hace fetch propio (`getCoachDirectoryClients`/`getCoachDirectoryPulse`). Verificar que use `useFocusEffect` (o señal de recarga), no `useEffect` de un disparo → si no, el roster queda **CONGELADO** al volver de la ficha (ej. tras archivar un alumno). Reparacion probable central.
- **Fabric 45798 (gotcha 6c):** el buscador (`Input`/TextInput) — sin estilos condicionales por focus en el wrapper.
- No hay sheets @gorhom en clientes.tsx (los sheets del directorio usan Modal RN nativo, verificado); sin bomba -999 en la pantalla.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"DirRowCard"` (1, L~10711), `"ClientActionsSheet"` (1, L~10719) — contexto de la fila y sus acciones. `"DirectoryActionBar"`/`"WarRoom"` = 0 hits (usar R5 §2).

## Notas de datos (queries/RPC, claves de dia)
- `getCoachDirectoryClients()` → roster; `getCoachDirectoryPulse()` → metricas WarRoom; `buildStats`/`filterClients`/`sortClients` puros (directory-shared.ts). Espejo de `clients.queries.ts`.
- **Claves de dia (gotcha 6d):** "riesgo"/"sin actividad hoy"/adherencia semanal se computan sobre dia calendario **Santiago** (`getSantiagoIsoYmdForUtcInstant`), nunca TZ device. Verificar en `buildStats`.
