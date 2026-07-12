# Unidad: directory-sheets (key: `directory-sheets`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = los SHEETS del directorio: filtros (Estado·Riesgo·Programa), opcion unica (Ordenar/Estado) y acciones por alumno.

## Alcance exacto
- `apps/mobile/components/coach/directory/DirectoryFilterSheet.tsx` (165 L): sheet de filtros con 3 grupos (Estado·Riesgo·Programa), SheetCheckRow, footer "Ver resultados". Modal RN nativo (import `Modal` L1).
- `apps/mobile/components/coach/directory/DirectoryOptionSheet.tsx` (73 L): sheet de seleccion unica (Ordenar / Estado). Modal RN (L1).
- `apps/mobile/components/coach/directory/ClientActionsSheet.tsx` (118 L): acciones por alumno (editar, archivar, reset password, etc.). Modal RN (L1).

## webFiles (verdad web, paths verificados)
- `apps/web/src/app/coach/clients/DirectoryActionBar.tsx` (370 L, L266-339) — UN sheet de filtros con 3 grupos (Estado+Riesgo+Programa), SheetCheckRow check sport-600, footer "Ver resultados", titulo "Filtros".
- `apps/web/src/app/coach/clients/ClientActionsSheet.tsx` (399 L) — acciones por fila.
- Acciones sueltas: `ArchiveClientButton.tsx`, `DeleteClientButton.tsx`, `ResetPasswordButton.tsx`, `ToggleStatusButton.tsx`, `EditClientDataModal.tsx`.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/directory/DirectoryFilterSheet.tsx`
- `apps/mobile/components/coach/directory/DirectoryOptionSheet.tsx`
- `apps/mobile/components/coach/directory/ClientActionsSheet.tsx`

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/app/coach/(tabs)/clientes.tsx` → owner `directory-screen` (cablea estos sheets; el wiring de CUAL sheet se abre desde la action bar es de esa unidad; aqui solo el CONTENIDO/UI del sheet).
- `apps/mobile/components/coach/directory/DirRowCard.tsx` → owner `directory-row-cards` (su boton trailing invoca `ClientActionsSheet`; el trigger es de esa unidad, el sheet es de esta).
- `apps/mobile/components/coach/directory/directory-shared.ts` → owner `directory-screen` (`STATUS_OPTIONS`, `SORT_OPTIONS`, `RISK_LABELS`).

## P0 / riesgos conocidos (audit R5 §2.1)
- **Bomba -999 (gotcha 6a): N/A —** los 3 sheets usan `Modal` RN nativo (verificado: import `Modal` en L1 de cada archivo), NO `@gorhom`. Sin riesgo -999. Mantener el patron Modal RN.
- **§2.1 sheet de filtros (EST) — ALTO:** el problema no es el contenido (DirectoryFilterSheet YA tiene los 3 grupos), es que **clientes.tsx cablea `DirectoryOptionSheet` (solo Estado)** en vez de `DirectoryFilterSheet`. Verificar aqui que DirectoryFilterSheet este completo y correcto (3 grupos, check sport-600, footer "Ver resultados", titulo "Filtros"); el fix de wiring es de `directory-screen`. Coordinar. Si `DirectoryOptionSheet` queda sin uso tras el fix → anotar (no borrar sin registrar, regla 2).
- **ClientActionsSheet acciones (EST):** verificar que exponga las acciones del web (editar datos, archivar, activar/desactivar, reset password, eliminar) 1:1. R5 §2.2 marca que la fila RN no tiene el trigger de acciones — el sheet existe pero puede estar sub-cableado.
- Copy VERBATIM de labels de accion y de filtros ("Filtros", "Ver resultados", "Ordenar", nombres de estados/riesgos).

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"ClientActionsSheet"` (1 hit, L~10719), `"DirectoryFilterSheet"` / `"DirectoryOptionSheet"` (buscar).

## Notas de datos (queries/RPC, claves de dia)
- Opciones de filtro/orden: `STATUS_OPTIONS`/`SORT_OPTIONS`/`RISK_LABELS` (directory-shared.ts, read-only). Sin claves de dia (los sheets solo emiten seleccion; el filtrado lo hace `filterClients` en directory-screen).
- Acciones (archivar/reset/etc.) llaman server actions compartidas (espejo de `client-detail.actions`/acciones del roster). Fallback fail-invisible si el endpoint no responde (regla 8).
