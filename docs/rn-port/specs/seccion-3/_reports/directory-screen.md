# Reporte de ejecución — unidad `directory-screen`

Fecha: 2026-07-11 · Rama: rnmobiledenuevo · GATE `npx tsc --noEmit` (apps/mobile): **LIMPIO (exit 0)**

Archivos PROPIOS modificados (2, disjuntos):
- `apps/mobile/app/coach/(tabs)/clientes.tsx`
- `apps/mobile/components/coach/directory/directory-shared.ts`

Sin tocar ningún archivo READ-ONLY / de otra unidad / árbol alumno. Sin commit.

---

## Divergencias resueltas (port 1:1 contra web)

### D1 — FREEZE (gotcha 6b) · CRÍTICO · RESUELTO
`clientes.tsx`: reemplazado `useEffect(() => { load() }, [])` (single-shot) por `useFocusEffect`.
- Primer foco → `load()` (con loader de pantalla).
- Focos posteriores (volver de la ficha tras archivar/pausar/eliminar) → refresco en background: `getCoachDirectoryClients().then(setClients)` + `loadPulse()`, **sin** tocar `loading`/`refreshing` → retorno invisible pero fresco. Ref `isFirstFocus` distingue el primer foco (coincide con el mount) de los retornos.
- Import añadido: `useFocusEffect` de `expo-router`, `useRef` de react.
- Se conservan los `useEffect` de init one-shot (view/profile/dismissed) — correctos como están.

### D4 / D5 — estados vacíos (dos nodos distintos) · RESUELTO
`clientes.tsx` `emptyNode` ahora ramifica por `clients.length === 0`:
- **Roster cero** (espejo `ClientsDirectoryEmpty.tsx:12-45`): tile 72 `hexToRgba(primary,0.1)` + `Users 34`; título **"Suma tu primer alumno"** (displayBlack 22); sub verbatim **"Crea un alumno y recibirá su acceso, o importa tu cartera completa desde Excel/CSV."**; CTAs apiladas `Button variant="sport"` **"Crear alumno"** (`UserPlus`, → `setShowCreate`) + `Button variant="secondary"` **"Importar cartera"** (`FileUp`, → `setShowImport`).
- **Filtro/búsqueda vacío** (espejo `ClientsDirectoryClient.tsx:266-284`): card punteada `theme.muted` + `SearchX 24` en círculo 52 `theme.card`; título **"Sin resultados"** (displayBold 16); sub verbatim **"Ningún alumno coincide con estos filtros."**; `Button variant="primary" size="sm"` **"Limpiar filtros"** → `clearFilters`.
- Se eliminó el copy anterior RN ("Sin alumnos aún" / "Prueba ajustando los filtros o la búsqueda.").

### D6 — labels + orden del sort-sheet · RESUELTO
`directory-shared.ts` `SORT_OPTIONS`: labels y **orden** ahora 1:1 con `directory-types.ts:22-29`:
`Urgencia (default)` · `Nombre A→Z` · `Última actividad` (era "Última sesión") · `Adherencia ↓` (era "Adherencia") · `Peso: mayor cambio` · `Días programa` (era "Días plan restantes"). Los `value` internos del motor (`attention_score/name_asc/last_workout/adherence/weight_change/plan_days`) **no** se tocan; consumidores (`find`-by-value en `clientes.tsx:183`, `map` en `DirectoryOptionSheet`) son agnósticos al orden.

### D7 — chip de búsqueda + Limpiar global · RESUELTO
`clientes.tsx`: añadido chip `search` (`key:'search'`, label `“${search}”` con comillas curvas verbatim web `DirectoryActionBar.tsx:196`, `onClear→setSearch('')`). El botón "Limpiar" de la chip-row ahora llama `clearFilters` (resetea riesgo/programa + estado + búsqueda), espejo `clearAll` web (`:200-205`). Programa ya estaba cubierto por el chip `risk` (modelo RN combinado: riskFilter porta `with_program`/`no_program`/`expired_program`).

### D8 — copy de chips riesgo/estado · RESUELTO
`directory-shared.ts`:
- `RISK_LABELS`: `urgent` "Riesgo"→**"Atención urgente"**; `review` "Atención"→**"En riesgo"**; `password_reset` "Cambio de contraseña"→**"Pendiente sync"** (verbatim `DirectoryActionBar.tsx:150-157`). Resto ya coincidía.
- `STATUS_OPTIONS`: `active` "Activos"→**"Activo"**; `paused` "Pausados"→**"Pausado"**; `pending_sync` "Cambio de contraseña pendiente"→**"Pendiente sync"** (verbatim `statusLabels` `:158-163`). `any`="Todos" nunca se muestra como chip (guard `!== 'any'`).
- Ambas constantes son consumidas SOLO por los chips en `clientes.tsx` (verificado por grep; `DirectoryFilterSheet`/`DirectoryOptionSheet` NO importan de directory-shared, hardcodean sus labels).

### D9 — conteo " archivados" · RESUELTO
`clientes.tsx` línea de conteo: anexa `' archivados'` cuando `statusFilter === 'archived'` (espejo `DirectoryActionBar.tsx:260`).

### D10 — badge "Filtrar" completo · RESUELTO
`clientes.tsx`: el badge y el highlight del botón Filtrar ahora usan `chips.length` (risk+status+search) y `filterActive = chips.length > 0`, espejo web `active={chips.length > 0}` / badge `{chips.length}` (`:222-228`). Se eliminaron `hasActiveFilters`/`activeFilterCount` parciales.

### D14 — placeholder search · RESUELTO
"Buscar alumno..." (3 puntos) → **"Buscar alumno…"** (ellipsis U+2026), verbatim `DirectoryActionBar.tsx:216`.

---

## PENDIENTE-DECISIÓN-CEO (regla 8 — NO auto-sancionadas, funcionalidad conservada)

- **D2** — segunda vista: RN `viewMode 'cards'` = grid `ClientCard` + parallax `StackCardItem` (`clientes.tsx:407-435,67-77`); web `view 'table'` = tabla densa 9-col `DirTableMobile`. Cambia patrón/gesto. **No tocado** (funcionalidad RN conservada).
- **D3** — gesto oculto en Ordenar: RN `onLongPress→toggle sortDir` (`clientes.tsx` BarButton Ordenar); web no tiene toggle manual. Cambia gesto. **No tocado / no removido** (regla 2: prohibido eliminar funcionalidad RN).

## Notas de idioma RN / motor compartido (NO re-skin — se dejan como están)

- **D11** — sin "Cargar más" (FlatList virtualiza todo `displayed`) vs web `visibleCount=48`. Idiomático RN, aceptable.
- **D12** — roster sin scoping por team (solo org/standalone en `shared/clients-directory:120-132`) vs web `activeTeamId`. Motor de datos compartido; fuera del alcance de la pantalla.
- **D13** — score de riesgo LOCAL (`clients-directory.ts`) vs `pulse.attentionScore` servidor en web. Motor de datos; fuera del alcance.

## Gotchas de clase

- **6a** N/A (sin sheets @gorhom en la pantalla; los sheets del directorio usan Modal RN nativo — otra unidad).
- **6b** REPARADO (D1, useFocusEffect).
- **6c** OK (search usa `Input` hardened, sin estilos condicionales por focus en el wrapper).
- **6d** OK/documentado (ventanas relativas por ms, consistente con web; Santiago aplica al árbol alumno, no al roster coach).
- **6e** N/A.

## Verificación de consumidores (antes de tocar APIs internas)

`grep` en apps/mobile: `RISK_LABELS`, `STATUS_OPTIONS`, `SORT_OPTIONS` consumidos únicamente por `clientes.tsx` (chips + sort-sheet). `DirectoryFilterSheet.tsx`/`DirectoryOptionSheet.tsx` NO importan de `directory-shared` → cambios de label/orden no los afectan. Cambios en `directory-shared.ts` seguros.

## GATE
`npx tsc --noEmit` (apps/mobile) → exit 0, sin errores.
