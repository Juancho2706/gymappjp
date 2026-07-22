# 4B-17 — Cableo del tablist del hub V2 (Alumnos / Alimentos / Curación)

Unidad NUEVA de integración (la numera el juez). No aporta pantalla nueva: **cablea** en un
solo tablist las tres superficies que ya existen por separado en RN — el roster del hub
(`index.tsx`, entregado por 4B-05), el catálogo (`foods.tsx`, entregado por 4B-06) y la
curación (`curation.tsx`, entregada por 4B-07 EN LA MISMA WAVE 4B.4) — para reflejar
funcionalmente el `NutritionHubTabs` web. Cierra la última frontera abierta que 4B-05 y
4B-06 dejaron explícita ("el cableado del tablist lo decide el juez al integrar").

## Archivos RN

- **EDITAR (dueño exclusivo)** `apps/mobile/app/coach/nutrition-v2/index.tsx`: montar el
  tablist persistente + conmutar el cuerpo activo entre roster / foods / curation.
- **EDITAR (extracción de cuerpo embebible)** `apps/mobile/app/coach/nutrition-v2/foods.tsx`:
  añadir una variante `embedded` (sin `SafeAreaView` propio ni `NutritionHeader onBack`) que
  `index.tsx` monta bajo la tab; la ruta standalone se conserva para deep-links.
- **CONSUMIR sin autorar** `apps/mobile/app/coach/nutrition-v2/curation.tsx` (4B-07): esta
  unidad importa su cuerpo embebible según el **contrato** de §Frontera; NO edita ese archivo.
- **NO tocar** `app/coach/(tabs)/nutricion.tsx` (swap 4B-04, ya montado): sigue renderizando
  `<CoachNutritionV2Screen />` inline; el tablist vive DENTRO de ese componente.

## Referencia web

`apps/web/src/app/coach/nutrition-v2/_components/NutritionHubTabs.tsx:8-14,22-23,26-66`
(tablist de 3 tabs con estado local) +
`apps/web/src/app/coach/nutrition-v2/page.tsx:86-104` (el shell `NutritionPageShell` con
título/desc + CTA `NewPlanPickerButton` envuelve al tablist; el roster llega como prop
server-rendered).

## Afirmaciones y deltas (verificados en código)

1. **Etiquetas y orden — VERBATIM y en paridad.** Web `NutritionHubTabs.tsx:10-14` define
   `TABS` en orden fijo `roster` "Alumnos" (`Users`), `foods` "Alimentos" (`Apple`),
   `curation` "Curación" (`ScanLine`); default `active = 'roster'` (`:23`). RN hoy: el hub es
   **roster puro sin tablist** (`index.tsx:314-518`, un único `FlashList`). **Delta:** crear el
   tablist con esas 3 etiquetas, ese orden y default "Alumnos". Iconos desde
   `lucide-react-native` (`Apple`, `ScanLine`; `Users` ya se importa en `index.tsx:13`).

2. **La persistencia es por ESTADO LOCAL, no por URL — corrección al enunciado.** Verificado:
   web usa `useState<TabKey>('roster')` (`NutritionHubTabs.tsx:22-23`); cambiar de tab NO toca
   la URL. Los únicos search-params del hub (`page.tsx:18-25`: `q`/`attn`/`sort`/`cursor*`) son
   filtros del **roster**, consumidos server-side, no el tab activo. **Delta:** el tablist RN
   usa `useState` local; **NO** introducir un `?tab=` ni `useLocalSearchParams` (sería una
   divergencia sin contraparte web; decisión 4). Fidelidad = estado efímero, se resetea a
   "Alumnos" al remontar (igual que web).

3. **Patrón de montaje = tabs INLINE que conmutan el cuerpo (espejo funcional web), NO
   `router.push` a rutas.** Web monta los 3 paneles como `role="tabpanel"` hermanos, cada uno
   renderizado sólo cuando activo (`NutritionHubTabs.tsx:57-65`: roster siempre listo, foods y
   curation montan su cliente sólo al activarse). RN: el hub V2 se renderiza **inline dentro del
   tab** (`(tabs)/nutricion.tsx:162` `<CoachNutritionV2Screen />`), y la cápsula del coach es un
   overlay flotante montado SÓLO bajo `(tabs)/_layout.tsx:41` (`tabBar={CoachMobileTabBar}`) cuyo
   tile activo deriva del **nombre de la tab** (`CoachMobileChrome.tsx:88,120,211`, `activeName`).
   `foods.tsx`/`curation.tsx` viven FUERA de `(tabs)` → un `router.push` a esas rutas
   **abandonaría la cápsula** (mismo razonamiento que el swap 4B-04 dio para el `replace`).
   **Delta/decisión:** conmutar el cuerpo INLINE (como el swap 4A-04 hizo con el hub), **sin
   navegar**, para conservar la cápsula y espejar que las 3 son secciones de UNA superficie. Hoy
   `foods.tsx` no está enlazada por ninguna ruta (grep sin resultados) — nace huérfana; este
   cableo es su primer punto de entrada.

4. **Shell persistente arriba del tablist (paridad de jerarquía).** Web: el header del shell
   (título "Centro de Nutrición" + desc + CTA "Nuevo plan" vía `NewPlanPickerButton`) está
   ARRIBA del tablist y **persiste en las 3 tabs** (`page.tsx:86-104`); los filtros del roster
   (búsqueda/attention/orden) viven DENTRO del panel roster. RN hoy mete TODO (header + CTA +
   métricas + búsqueda + attention + orden) en el `ListHeaderComponent` del `FlashList` del
   roster (`index.tsx:328-418`). **Delta:** reestructurar `index.tsx` para elevar
   `NutritionHeader` (título/desc + CTA "Nuevo plan" `openPicker` + `SyncOfflineState`,
   `index.tsx:330-346`) y el nuevo tablist a un contenedor persistente arriba; el cuerpo del
   roster (métricas `:347-354` + búsqueda `:355-368` + attention `:369-392` + orden `:393-416` +
   la lista + paginación) queda como el panel de la tab "Alumnos". Así "Nuevo plan" sigue visible
   en Alimentos/Curación (espejo web).

5. **Cuerpos embebibles sin doble chrome (reuso, sin duplicar lógica).** `foods.tsx` es hoy una
   pantalla standalone: `SafeAreaView edges={['top','bottom']}` (`:232`) + `NutritionHeader
   title="Alimentos" onBack={() => router.back()}` (`:234`). Montarla cruda bajo una tab
   duplicaría safe-area y mostraría una flecha "volver" que en web NO existe (la tab no tiene
   back; el back del shell va al dashboard). **Delta:** añadir a `foods.tsx` una prop `embedded`
   que, cuando `true`, omite su `SafeAreaView` y su `NutritionHeader onBack` (el shell del hub ya
   aporta safe-area y contexto), conservando el buscador+lista+ficha intactos. `index.tsx` monta
   `<CoachNutritionCatalogScreen embedded />` bajo la tab "Alimentos". **Prohibido** reimplementar
   el catálogo en `index.tsx` (regla no-duplicación); se reusa el componente de 4B-06.

6. **Contrato de curación (compilación paralela segura).** Ver §Frontera. La tab "Curación"
   monta el cuerpo embebible que 4B-07 debe exportar con firma acordada; el import se resuelve
   sólo tras el merge de 4B-07 (coordinación de orden), no con un guard de runtime — un `import`
   estático de un módulo inexistente rompe Metro aunque la tab esté oculta.

7. **Estilo del tablist (adaptación DS RN, sin crudos nuevos).** Web
   `NutritionHubTabs.tsx:28-54`: contenedor `rounded-control border border-border-default
   bg-surface-card p-1`, 3 botones `flex-1 min-h-11`, activo `bg-primary text-white`, inactivo
   `text-muted hover:bg-surface-sunken`, icono oculto bajo `sm` + label truncado. **Delta RN:**
   fila segmentada 3-en-1 con los MISMOS tokens (`bg-surface-card`/`border-border-default`,
   activo `bg-primary` + texto blanco, inactivo `text-text-muted`); sin `hover` (no aplica en
   RN) y sin breakpoint `sm:` — mostrar icono+label siempre (o el patrón compacto del kit),
   `accessibilityRole="tab"` + `accessibilityState={{ selected }}`, `min-h-11`. `aria-label` web
   "Secciones del centro de nutrición" → `accessibilityLabel` equivalente en el contenedor.
   White-label safe: nada hardcodeado salvo el blanco del texto activo (igual que web
   `text-white` y que el CTA "Nuevo plan" existente `index.tsx:342`).

8. **Sin RN-extras (decisión 4).** El tablist es 1:1 con web: 3 tabs, sin una 4ª ("Planes"/
   "Recetas" son de la V1 que muere, decisiones 1 y 3). No se introduce ninguna afordancia sin
   contraparte web. **Nada que retirar.**

## Frontera de archivos (propiedad y contrato)

- **Propiedad de `index.tsx` en la wave 4B.4:** VERIFICADO en `RANKING.md:39-41` — las otras
  unidades de 4B.4 son 4B-07 (`curation.tsx`), 4B-09 (`[clientId].tsx`), 4B-11
  (`builder/[clientId].tsx`) y 4B-14 (`QuickEditMode.tsx`); **ninguna toca `index.tsx`**. El único
  editor previo de `index.tsx` fue 4B-05 (wave 4B.3, ya aterrizado en `8f8161cb`). Por tanto
  4B-17 es **dueño exclusivo de `index.tsx`** en su wave.
- **Propiedad de `foods.tsx`:** entregado por 4B-06 (wave 4B.3, cerrado); ninguna unidad de 4B.4
  lo toca → 4B-17 puede editarlo (extracción `embedded`) sin colisión.
- **Contrato con 4B-07 (`curation.tsx`), construidas en paralelo:** 4B-07 debe exportar un cuerpo
  embebible con firma estable que 4B-17 importa. Acordado aquí:
  - Ruta de módulo: `apps/mobile/app/coach/nutrition-v2/curation.tsx`.
  - Export nombrado del cuerpo (p.ej. `export function CurationQueueScreen({ embedded }: { embedded?: boolean })`)
    o la misma prop `embedded` sobre su default, **espejo exacto** de la solución elegida para
    `foods.tsx` (afirmación 5) — el juez fija UNA convención y la aplica a ambos.
  - `embedded={true}` ⇒ sin `SafeAreaView`/`onBack` propios; el hub aporta el chrome.
- **Estrategia parallel-safe = coordinación de merge (no guard de runtime):** el orden ya es
  natural (`RANKING.md:52` "4B-06 antes de 4B-07"; 4B-17 es puro cableo encima). El juez
  **secuencia el merge**: 4B-06 (hecho) → 4B-07 (cuerpo embebible) → 4B-17 (wiring de index).
  Ambos (4B-07 y 4B-17) se pueden CODIFICAR en paralelo contra este contrato; sólo el merge de
  4B-17 espera a que exista el export de curación, para que el `import` estático resuelva. Si el
  owner prefiriera aterrizar 4B-17 antes que 4B-07, la única alternativa que compila es dejar la
  tab "Curación" fuera del `TABS` (sin importar `curation.tsx`) y añadirla en un follow-up — se
  documenta como fallback, no como camino primario.

## Cierre (qué debe quedar)

- `index.tsx`: contenedor persistente con `NutritionHeader` (título/desc + CTA "Nuevo plan" +
  `SyncOfflineState`) y, debajo, el tablist DS de 3 segmentos (Alumnos/Alimentos/Curación, orden
  y copys verbatim, estado local, default "Alumnos"). Bajo el tablist, el cuerpo de la tab
  activa: "Alumnos" = el roster actual (métricas + búsqueda + attention + orden + `FlashList` +
  paginación, intactos); "Alimentos" = `<CoachNutritionCatalogScreen embedded />`; "Curación" =
  el cuerpo embebible de 4B-07. Los sheets globales (`HubSortSheet`, `NewPlanPickerSheet`) siguen
  montados a nivel del hub. Sin `?tab=` ni cambio de ruta al conmutar. Cápsula del coach y tile
  "Nutrición" conservados (no se mueven rutas → no aplica el gate de export Android).
- `foods.tsx`: prop `embedded` que suprime `SafeAreaView` + `NutritionHeader onBack`; ruta
  standalone intacta para deep-links.
- `curation.tsx` (4B-07): expone el cuerpo embebible según el contrato; **no** lo edita 4B-17.
- Tokens EVA DS, dark mode y white-label respetados (sin crudos nuevos; `useTheme`).

## Comprobación objetiva

Con flag `nutritionV2Coach` ON, tocar el tab "Nutrición" del coach aterriza en el Centro V2 con
la cápsula intacta y un tablist de 3 segmentos "Alumnos | Alimentos | Curación" (default
"Alumnos"), con el header "Centro de Nutrición" + CTA "Nuevo plan" persistente encima. Tocar
"Alimentos" muestra el buscador del catálogo (misma pantalla de 4B-06, sin doble header ni flecha
"volver") **sin navegar** (la cápsula y el tile "Nutrición" siguen resaltados, no hay push);
tocar "Curación" muestra la cola de scans (4B-07); "Alumnos" vuelve al roster con sus filtros. El
"Nuevo plan" sigue visible en las 3 tabs. Cambiar de tab NO altera la URL. Comparar contra web
móvil (tab bar del Centro V2): mismas 3 etiquetas, mismo orden, mismo default, misma jerarquía
header→tablist→cuerpo. Gates: `pnpm --filter @eva/mobile exec tsc --noEmit`, lint, `check:tokens`;
verificar el orden de merge (curación antes que el wiring) para que el import estático resuelva.
