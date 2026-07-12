# Unidad: chrome-global-search (key: `chrome-global-search`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = la BUSQUEDA GLOBAL del coach (paleta de comandos/alumnos), espejo mobile de `CoachGlobalSearch` web.

## Alcance exacto
- La paleta de busqueda: input, resultados (alumnos + acciones/rutas), navegacion, cierre — `apps/mobile/components/coach/CoachSearchPalette.tsx:1-158` (UNICO export/archivo).

## webFiles (verdad web, paths verificados)
- `apps/web/src/components/coach/CoachGlobalSearch.tsx` (353 L) — paleta ⌘K web: busca alumnos y rutas, resultados agrupados, navegacion por teclado (`_hooks/useArrowListNav.ts`).

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/CoachSearchPalette.tsx` (158 L)

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/CoachMobileChrome.tsx` → posee `chrome-tabbar-layout` (define el punto de entrada — icono/trigger de la paleta; solo coordinar via props, no editar aqui).
- La navegacion a la ficha (`/coach/cliente/[clientId]`) es de `ficha-shell-hero` (destino read-only; solo `router.push`).

## P0 / riesgos conocidos
- **Sheet/overlay:** verificar el mecanismo con que se presenta la paleta (Modal RN vs `@gorhom` vs `components/Sheet.tsx`). Si usa `@gorhom` con snapPoints fijos → bomba -999 (gotcha 6a); es un overlay CRITICO (si no abre, no hay busqueda) → preferir `nativeModal`/Modal RN. Grep el archivo para confirmar. (158 L, chico — mecanismo facil de auditar.)
- **Congelamiento (gotcha 6b):** si la paleta hace fetch propio del roster al abrir, usar carga on-open/`useFocusEffect`, no un `useEffect` de un disparo montado en un tab persistente. Si recibe el roster por props del chrome/shell = OK.
- **Fabric 45798 (gotcha 6c):** el `TextInput` de busqueda NO debe llevar estilos condicionales por focus en su wrapper. Verificar el input (borde de focus va en el propio TextInput, no en un View wrapper que cambie estilo por `isFocused`).
- **Copy VERBATIM:** placeholder y labels de secciones de resultado (ej. "Alumnos", "Ir a…") 1:1 con `CoachGlobalSearch.tsx`.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"CoachGlobalSearch"` (2 hits, L~10079) — diffs auditados de la paleta (estructura de resultados, estilos del input).

## Notas de datos (queries/RPC, claves de dia)
- Busqueda sobre el roster del coach (alumnos por nombre) + rutas estaticas de navegacion. Sin claves de dia. Fuente del roster: la misma capa que el directorio (`getCoachDirectoryClients` o el cache del chrome) — read-only; si necesita un fetch propio, fallback local fail-invisible (regla 8).
