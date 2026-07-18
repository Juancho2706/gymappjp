# SPEC — Chrome: busqueda global (CoachSearchPalette) `chrome-global-search`

PORT 1:1 Seccion 3 (COACH). Web = fuente de verdad. Cada afirmacion cita `archivo:lineas` del codigo real.

- **Web fuente:** `apps/web/src/components/coach/CoachGlobalSearch.tsx` (353 L)
- **Web servicio (datos/scope/href):** `apps/web/src/services/search/coach-search.service.ts` (252 L)
- **RN propio de esta unidad:** `apps/mobile/components/coach/CoachSearchPalette.tsx` (158 L) — UNICO archivo editable.
- **RN read-only (otras unidades):**
  - `apps/mobile/components/CommandPalette.tsx` (331 L) — primitiva DS que renderiza la UI (input/grupos/estados). Es de la ola E0 DS; esta unidad la CONSUME, no la posee. Toda correccion de UI cae en `cambiosShell`.
  - `apps/mobile/lib/coach-search.ts` (52 L) — data layer (fetch a `/api/mobile/coach/search`). Read-only.
  - `apps/mobile/components/coach/CoachDashboardSections.tsx:1809-1832` — trigger de entrada (icono lupa + `setSearchOpen`). Pertenece a `chrome-tabbar-layout` / dashboard-hero; read-only.

---

## 0. Contexto y punto de entrada

- **Web:** combobox APG editable montado en el topbar dentro de `<header hidden md:flex>` (desktop-only), `CoachGlobalSearch.tsx:27,69`. Recibe `inputRef` desde el topbar para preservar el atajo `/` (`CoachGlobalSearch.tsx:64-67`; el atajo mismo vive en `CoachTopBar`, no aqui — `CoachGlobalSearch.tsx:25`).
- **RN:** overlay full-screen CONTROLADO por el consumidor. El chrome monta `<CoachSearchPalette visible onClose />` (`CoachSearchPalette.tsx:21,43-49`). El trigger real es el icono lupa del dashboard header: `CoachDashboardSections.tsx:1810-1818` (`TouchableOpacity accessibilityLabel="Buscar" onPress={() => setSearchOpen(true)} testID="coach-global-search"`, icono `Search size={19} strokeWidth={2.1}`) y el mount en `:1832`.
- **Adaptacion idiomatica documentada:** web = dropdown inline bajo el input del topbar; touch = Modal full-screen con input propio + boton Cancelar (`CommandPalette.tsx:139-197`; racional en `CommandPalette.tsx:39-41`). No hay atajo `/` ni navegacion por flechas en touch (legitimo — sin teclado fisico).

---

## 1. Layout / jerarquia

### Web (`CoachGlobalSearch.tsx`)
- Root: `<div ref=rootRef relative mx-auto flex max-w-[460px] flex-1 items-center>` (`:199`).
- Icono lider absoluto izq (lupa o spinner): `<span pointer-events-none absolute left-3 z-[1] text-[var(--text-subtle)]>` (`:200-206`).
- Input combobox (`:207-227`).
- Boton limpiar (X) absoluto der, solo si hay query: `:228-242`.
- Dropdown absoluto `top-[calc(100%+8px)] z-50` (`:244-330`): o empty-state (`:248-256`) o `<ul role=listbox>` con grupos (`:258-327`).

### RN (`CommandPalette.tsx`, consumido por `CoachSearchPalette`)
- `<Modal fullScreen fade transparent={false} onRequestClose={onClose} statusBarTranslucent>` (`:140-147`).
- `<View flex-1 bg-surface-app paddingTop=insets.top>` (`:148`).
- Search row: `<View flex-row items-center border-b border-subtle bg-surface-app>` (`:150-197`): campo (`:154-191`) + boton **Cancelar** (`:192-196`, NO existe en web — adaptacion touch para cerrar el Modal).
  - Campo: `<View flex-1 flex-row items-center rounded-control border border-default bg-surface-sunken>` (`:155`, styles.field `:315` height 44 borderWidth 1.5).
  - Lead icon lupa/spinner (`:158-164`), TextInput (`:165-177`), boton limpiar X condicional (`:178-190`).
- Body dentro de `KeyboardAvoidingView` (`:199-245`): empty-state (`:203-211`), idle-hint (`:212-217`, NO existe en web), o `<ScrollView>` con grupos (`:218-244`).

---

## 2. Tokens / clases / tipografia (web) y su equivalente RN

| Elemento | Web (archivo:linea) | RN (archivo:linea) | Estado |
|---|---|---|---|
| Input alto/radio | `h-10 rounded-[var(--radius-md)]` `:226` | styles.field height 44, `rounded-control` `:155,315` | +4px alto (touch) |
| Input borde reposo | `border-[var(--border-subtle)] dark:border-[var(--border-default)]` (1px) `:226` | `border-default` borderWidth **1.5** `:155,315` | divergencia grosor + borde subtle en claro |
| Input fondo reposo | `bg-[var(--surface-sunken)]` `:226` | `bg-surface-sunken` `:155` | OK |
| Input **focus** | `focus:border-[var(--sport-500)] focus:bg-[var(--surface-card)] focus:shadow-[var(--ring-focus)]` `:226` | NINGUNO (campo autofocado siempre gris) `:155` | **P2 Ola0** (ver §7) |
| Input texto | `text-sm text-[var(--text-strong)]` `:226` | `text-strong` fontSize 15 `FONT.uiMedium` `:176,317` | +1px |
| Placeholder color | `placeholder:text-[var(--text-subtle)]` `:226` | `theme.mutedForeground` `:170` | ~OK |
| Icono lupa | `Search size={17}` text-subtle `:200-204` | `Search size={18} color=mutedForeground` `:162` | +1px |
| Spinner carga | `Loader2 size={17}` hereda `text-[var(--text-subtle)]` `:201-205` | `ActivityIndicator color={theme.primary}` `:159-161` | **P2 Ola0** (color marca vs subtle) |
| Boton X limpiar | `X size={14}` rounded-[6px] `hover:bg-surface-sunken` `:238-240` | `X size={15}` sin estado pressed `:188,318` | +1px, sin feedback pressed (**P2 Ola0**) |
| Heading de grupo | `text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-subtle)]` icono `size={12}` `:270-271` | `TYPE.eyebrow` (12px, tracking 0.12em) icono `size={12}` text-subtle `:230-233` | tamano/tracking divergen (**P2 Ola0**) |
| Fila radio | `rounded-[var(--radius-md)]` (14px) `:296` | styles.row `borderRadius: 12` `:325` | **P2 Ola0** literal fuera de token |
| Fila activa/hover | activa `bg-[var(--sport-100)]`; hover `hover:bg-[var(--surface-sunken)]` `:295-300` | pressed `theme.mutedForeground + '14'`; ripple `theme.border` `:266-267` | **P2 Ola0** valor con alfa a mano, no token sport |
| Titulo fila | `truncate text-[13.5px] font-semibold`; activa `text-[var(--sport-700)]` sino `text-[var(--text-strong)]` `:304-310` | `text-strong` fontSize 14.5 `FONT.uiSemibold` (nunca sport-700 en pressed) `:273,327` | +1px, sin tinte sport activo (**P2 Ola0**) |
| Highlight match | `<mark bg-transparent font-bold text-[var(--sport-700)]>` (700) `:56` | `text-sport-700` `FONT.uiExtra` (800) `:99` | **P2 Ola0** peso 800 vs 700 |
| Sublabel | `truncate text-[11.5px] text-[var(--text-muted)]` `:314-317` | `text-muted` `textStyle('2xs', FONT.ui)` (12px) `:276-280` | +0.5px |
| Empty state | `text-sm text-[var(--text-muted)]`; termino `font-bold text-[var(--text-strong)]` `:250-255` | `TYPE.body` (16px) text-muted; termino `FONT.uiBold` text-strong `:205-210` | +2px |
| Thumb catalogo | `h-8 w-8 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white dark:bg-[var(--surface-sunken)]` `:342` | styles.thumb 32x32 `borderRadius: 10` `border-subtle bg-surface-sunken` (ambos esquemas) `:300,328` | **P2 Ola0** radio 10 vs 14, sin bg-white claro |
| Icono fallback grupo | `size={15}` bg-surface-sunken text-subtle `:349-350` | `size={16} color=mutedForeground` bg-surface-sunken `:307` | +1px |

**Nota tokens:** RN usa utilidades NativeWind DS (`bg-surface-app`, `text-strong`, `border-subtle`, `text-sport-700`) + helpers `TYPE`/`FONT`/`textStyle` de `lib/typography.ts` (`CommandPalette.tsx:19`). Los unicos valores crudos ya existentes en RN son `borderRadius: 10/12`, `+ '14'` alfa y bump de +1px (todos flaggeados en Ola 0). **Esta unidad no debe introducir valores crudos nuevos.**

---

## 3. Claro / oscuro
- Web: `dark:border-[var(--border-default)]` en input (`:226`) y `dark:bg-[var(--surface-sunken)]` en thumb (`:342`) — unicos overrides dark explicitos; el resto resuelve por variables CSS.
- RN: utilidades DS resuelven light/dark en runtime via `useTheme()` (`CommandPalette.tsx:119`); marca white-label via rampa `sport`. Divergencia pendiente: thumb `bg-white` (claro) no replicado (§2, **P2 Ola0**).

---

## 4. Mapa de interacciones (lente de cableado verifica contra esta lista)

Tocables/handlers del componente web y su equivalente RN. `[W]`=web, `[R]`=RN.

1. **Trigger de apertura**
   - `[W]` foco/click en input → `onFocus={() => setOpen(true)}` (`:223`); atajo `/` enfoca (externo, `CoachTopBar`).
   - `[R]` icono lupa del header → `setSearchOpen(true)` (`CoachDashboardSections.tsx:1813`); Modal aparece (`CoachSearchPalette.tsx:146`, `CommandPalette.tsx:141`). Autofocus del input a 120ms (`CommandPalette.tsx:124-128`).

2. **Escribir en el input** (query controlada)
   - `[W]` `onChange` → `setQuery(value); setOpen(true)` (`:219-222`).
   - `[R]` `onChangeText={onQueryChange}` (`CommandPalette.tsx:168`) → `setQuery` (`CoachSearchPalette.tsx:149`). Debounce 250ms + AbortController (`CoachSearchPalette.tsx:68-102`).

3. **Boton limpiar (X)** — solo visible con texto
   - `[W]` `onClick` → `setQuery(''); setDebounced(''); setOpen(false); inputRef.focus()` (`:229-241`).
   - `[R]` `onPress` → `onQueryChange(''); inputRef.focus()` (`CommandPalette.tsx:179-183`). NO cierra el Modal (queda abierto en idle). Divergencia menor de gesto (web cierra dropdown, touch mantiene overlay) — **defendible, ver §9**.

4. **Boton Cancelar** (RN-only)
   - `[R]` `onPress={onClose}` → `setSearchOpen(false)` (`CommandPalette.tsx:192`, `CoachSearchPalette.tsx:147`). Sin equivalente web (web cierra por click-fuera / Escape).

5. **Seleccionar un resultado (fila)** — navegacion por grupo
   - `[W]` `onMouseDown` (preventDefault para no perder foco) → `navigateTo(hit)`: `setOpen(false); setQuery(''); setDebounced(''); inputRef.blur(); router.push(hit.href)` (`:289-294`, `:160-166`). `hit.href` es la ruta WEB canonica computada por el servicio (§6).
   - `[R]` `onPress` → `Row.onPress` → `CommandPalette.onSelect` → `handleSelect(item)` (`CommandPalette.tsx:265,237,135-137`; `CoachSearchPalette.tsx:122-142`): `onClose()` primero, luego `router.push` traducido por `kind`:
     - `client` → `/coach/cliente/${hit.id}` (`:127-128`). **Destino read-only (ficha-shell-hero)**.
     - `program` → `clientIdFromProgramHref(hit.href)` (`:38-41`) → `/coach/program-builder?clientId=${clientId}` o `/coach/builder` si plantilla (`:130-133`). **P1 Ola0: pierde `programId` y la plantilla concreta** (ver §5).
     - `exercise` → `/coach/ejercicios?q=${encodeURIComponent(hit.label)}` (`:135-136`). **P1 Ola0: destino no lee `?q=`** (ver §5).
     - `recipe` → `/coach/nutricion?tab=recipes` (`:138-139`).

6. **Cierre**
   - `[W]` click fuera (`mousedown` doc listener) → `setOpen(false)` (`:151-158`); Escape (`:169-177`): si abierto cierra, si cerrado limpia+blur.
   - `[R]` boton Cancelar (`#4`), back de Android/`onRequestClose` (`CommandPalette.tsx:145`), o tras seleccionar (`onClose` en `#5`).

7. **Reset al cerrar** (RN)
   - `[R]` `useEffect([visible])`: al pasar `visible=false` aborta, limpia timer, `setQuery(''); setResults(empty); setStatus('idle')` (`CoachSearchPalette.tsx:59-66`). Evita resultados viejos parpadeando.

8. **Teclado — navegacion por flechas / Enter** (web-only)
   - `[W]` ↓/↑ mueven `activeIndex` sobre lista aplanada con wrap (`:178-187`); Enter navega al activo (`:188-193`); `scrollIntoView` manual del activo (`:144-148`).
   - `[R]` sin flechas (touch). `returnKeyType="search"` declarado pero **sin `onSubmitEditing`** (`CommandPalette.tsx:174`) → **P2 Ola0**: la tecla buscar no selecciona el primer resultado (ver §5/§9).

9. **Hover/activo de fila** (feedback)
   - `[W]` `onMouseEnter` → `setActiveIndex(item.flatIndex)` (`:286-288`); activa pinta `bg-sport-100` + titulo `sport-700` (`:295-310`).
   - `[R]` `android_ripple` + pressed gris `mutedForeground+'14'` (`CommandPalette.tsx:266-267`) — **P2 Ola0** (no usa token sport).

---

## 5. Hallazgos Ola 0 (grep `CoachGlobalSearch` en `docs/rn-port/ola0-hallazgos.json`)

Dos entradas auditadas (L~1812 primera pasada, L~9207 segunda; catalogo de componentes L~10079-10085). Divergencias vigentes contra el RN actual:

- **P1 — Navegacion Ejercicio pierde el filtro** (`ola0:1813-1818`): web `href=/coach/exercises?q=<name>` abre catalogo pre-filtrado; RN navega a `/coach/ejercicios?q=<label>` (`CoachSearchPalette.tsx:135-136`) pero `apps/mobile/app/coach/(tabs)/ejercicios.tsx` NUNCA lee `useLocalSearchParams` → el `?q=` se ignora, el usuario cae en catalogo SIN filtrar. FixHint: leer `useLocalSearchParams<{q?}>` e inicializar/sincronizar con `useFocusEffect`. **NOTA: `ejercicios.tsx` es de otra unidad → el fix real va a `cambiosShell`, no aqui.**
- **P1 — Navegacion Programa pierde `programId`/plantilla** (`ola0:9209-9214`): web `programHref` (`coach-search.service.ts:55-59`) abre SIEMPRE el programa concreto (`/coach/builder/{clientId}?programId={id}` o `/coach/workout-programs/builder?programId={id}`); RN `clientIdFromProgramHref` (`CoachSearchPalette.tsx:38-41`) extrae solo `clientId`, ignora `?programId=`, y la plantilla cae al tab generico `/coach/builder` sin identificar. FixHint: parsear tambien `programId` y pasarlo, sin borrar el fallback. **Editable en esta unidad (regex vive en `CoachSearchPalette.tsx`).**
- **P2 — Estado pressed sin tinte sport** (`ola0:1842-1846`, `9216-9221`): `CommandPalette.tsx:266-267` usa `mutedForeground+'14'` (valor crudo) + ripple `border`; titulo nunca vira a sport-700. Fix en `CommandPalette` (read-only → `cambiosShell`).
- **P2 — Thumb imagen fondo claro/radio** (`ola0:1849-1853`, `9244-9249`): `CommandPalette.tsx:300,328` `bg-surface-sunken` (no `bg-white` claro) + `borderRadius:10` (vs `--radius-md` 14). Fix en `CommandPalette` → `cambiosShell`.
- **P2 — Spinner color marca vs subtle** (`ola0:1856-1860`, `9236-9241`): `CommandPalette.tsx:159-161` `color={theme.primary}` vs web `text-subtle`. Fix en `CommandPalette` → `cambiosShell`.
- **P2 — Momento del spinner (loading antes del debounce)** (`ola0:1863-1867`, `9278-9283`): `CoachSearchPalette.tsx:81` hace `setStatus('loading')` sincrono en cada tecla, ANTES del `setTimeout(250)`; web lo pone dentro del efecto post-debounce (`CoachGlobalSearch.tsx:88-104`). **Editable en esta unidad.** El segundo auditor lo llama "defendible (feedback mas temprano) — decidir y documentar".
- **P2 — Peso del highlight 800 vs 700** (`ola0:1870-1874`, tipografia `9258-9262`): `CommandPalette.tsx:99` `FONT.uiExtra` (800) vs `font-bold` (700) web. `FONT.uiBold` existe (`typography.ts:32`). Fix en `CommandPalette` → `cambiosShell`.
- **P2 — Escala tipografica +1px** (`ola0:1877-1881`, `9258-9262`): rowTitle 14.5 vs 13.5, sublabel 12 vs 11.5, eyebrow 12/0.12em vs 11/0.06em, iconos +1px, empty 16 vs 14. Decidir densidad touch vs paridad. Fix en `CommandPalette` → `cambiosShell`.
- **P2 — Input sin estado focus** (`ola0:1884-1888`, `9230-9235`): `CommandPalette.tsx:155,315` siempre `border-default bg-surface-sunken` 1.5px; web enfocado = borde sport-500 + bg surface-card + ring. Como el campo esta siempre autofocado, deberia pintar el estado focus directo. Fix en `CommandPalette` → `cambiosShell`. **Cuidado gotcha 6c** (ver §8).
- **P2 — Boton limpiar sin feedback pressed** (`ola0:1891-1895`): `CommandPalette.tsx:179-189` sin estilo pressed. Fix en `CommandPalette` → `cambiosShell`.
- **P2 — Placeholder singular vs plural** (`ola0:1898-1902`, `9264-9269`): web `"Buscar alumno, programa, ejercicio…  (/)"` (`CoachGlobalSearch.tsx:225`); RN `"Buscar alumnos, programas, ejercicios…"` (`CoachSearchPalette.tsx:154`). Omitir `(/)` es correcto en touch; el cambio singular→plural es divergencia de copy. **Editable en esta unidad — unificar a copy web verbatim (regla 5).**
- **P2 — Enter/submit sin equivalente** (`ola0:9222-9228`): `returnKeyType="search"` sin `onSubmitEditing` (`CommandPalette.tsx:174`). FixHint: `onSubmitEditing` → `onSelect` del primer item aplanado. Fix en `CommandPalette` → `cambiosShell` (la primitiva no expone el handler hoy).
- **P2 — `accessibilityLabel` del TextInput ausente** (`ola0:9271-9276`): web `aria-label="Buscar alumno, programa, ejercicio o receta"` (`CoachGlobalSearch.tsx:215`); RN TextInput sin label (`CommandPalette.tsx:165-177`). Fix en `CommandPalette` → `cambiosShell`.

**Resumen de propiedad:** de los ~13 hallazgos, solo 3 son editables dentro de `CoachSearchPalette.tsx` (placeholder copy, timing del spinner, parseo de `programId`). Los restantes viven en `CommandPalette.tsx` / `ejercicios.tsx` (otras unidades) → van a `cambiosShell`.

---

## 5b. Hallazgos ronda 5
El brief NO cita tablas r5 para esta unidad (solo Ola 0, `chrome-global-search.md:24-25`). No aplica.

---

## 6. Queries / datos / scope (fuente web `coach-search.service.ts`)

- **Endpoint RN:** `GET /api/mobile/coach/search?q=<enc>` via `apiFetch` Bearer (`coach-search.ts:40-51`); puente que reutiliza `searchCoachWorkspace` del web (`coach-search.ts:5-9`). MIN chars = 2 (`coach-search.ts:30`, espejo de `MIN_QUERY_LENGTH` web `coach-search.service.ts:40`).
- **4 sub-busquedas en paralelo** (`Promise.all`, `coach-search.service.ts:243-248`), cap **5/grupo** (`DEFAULT_LIMIT_PER_GROUP` `:41`), patron `ilike %q%` (`:50-52`):
  - **clients** (`:66-94`): `select id, full_name` de `clients`, `ilike full_name`, `order full_name`, limit 5. Scope 3-vias: org (`coach_id + org_id`), team-pool (`org_id null + team_id`), standalone (`coach_id + org_id null + team_id null`) `:80-86`. Sin thumb (pinta iniciales client-side `:65,89-93`). `href=/coach/clients/{id}` `:92`.
  - **programs** (`:101-142`): `select id, name, client_id`, `order created_at desc`, limit 5. Scope idem + team-pool resuelve ids del pool via `or()` (`:118-130`). `sublabel` = `'Programa asignado'` (client_id) o `'Plantilla'` (`:139`). `href` = `programHref` (`:55-59`).
  - **exercises** (`:153-195`): `select id, name, muscle_group, thumbnail_url`, `buildExerciseSearchOr` (nombre/musculo/equipo/parte + sinonimos), scope system∪scope (`:163-170`), `deleted_at null`, limit 5. `sublabel = muscle_group` (`:191`). `href=/coach/exercises?q=<name>` (`:192`). **Thumb SOLO `thumbnail_url` (webp estatico), nunca gif crudo** (`:144-151,193`).
  - **recipes** (`:202-221`): `searchCoachRecipes` scope coach XOR team, limit 5. `href=/coach/nutrition-plans?tab=recipes` (fijo, sin detalle propio `:197-201,218`). Thumb `image_url` (`:219`).
- **Seguridad:** el `scope` SIEMPRE lo deriva el route handler de sesion/JWT, nunca del query string (`coach-search.service.ts:16-21`).
- **Claves de dia:** NINGUNA. La busqueda no usa fechas ni TZ (confirma brief `chrome-global-search.md:27`). Gotcha 6d N/A aqui.

---

## 7. Estados (vacio / carga / error / idle)

| Estado | Web | RN |
|---|---|---|
| idle (query < 2) | dropdown cerrado; `setResults(EMPTY); status=idle` (`:96-99`) | `status=idle`, muestra **idle-hint** `"Busca alumnos, programas, ejercicios o recetas de tu espacio."` (`CoachSearchPalette.tsx:155`, render `CommandPalette.tsx:212-217`) — **texto RN-only, no existe en web** |
| loading | spinner en input (Loader2) post-debounce (`:200-205`) | spinner ActivityIndicator (`CommandPalette.tsx:159-161`); `setStatus('loading')` sincrono pre-debounce (**P2 Ola0 timing §5**) |
| ready + hits | dropdown con grupos (`:258-327`) | ScrollView con grupos (`CommandPalette.tsx:218-244`) |
| ready + vacio | `"Sin resultados para «<debounced>»"` (`:248-256`) | `"Sin resultados para «<trimmed>»"` (`CommandPalette.tsx:203-211`) — **copy verbatim OK** |
| error | silencioso: `catch` → `EMPTY` + `status=ready` (`:111-117`) | silencioso: `catch` no-abort → `emptyCoachSearchResults() + status=ready` (`CoachSearchPalette.tsx:91-96`). AbortError ignorado (`:92`) |

**Copy verbatim (regla 5):** empty-state RN 1:1 con web. Labels de grupo RN `'Alumnos'/'Programas'/'Ejercicios'/'Recetas'` (`CoachSearchPalette.tsx:115-118`) = web `GROUP_META` (`CoachGlobalSearch.tsx:36-40`). **Placeholder difiere (P2 Ola0 §5) — debe unificarse a `"Buscar alumno, programa, ejercicio…"`.** `idleHint` es texto RN-only (adaptacion touch — el web nunca muestra pre-query porque el dropdown ni se abre).

---

## 8. Riesgos P0 / gotchas de clase (verificados en codigo)

- **6a — Sheet/overlay CRITICO:** ✅ CUMPLE. `CommandPalette` usa **`Modal` nativo de RN** (`CommandPalette.tsx:9,140-147`), NO `@gorhom/bottom-sheet`. Sin snapPoints, sin `containerHeight -999`, sin `dynamicSizing`. El overlay critico de busqueda esta a salvo del bug de reanimated 4. Sin accion.
- **6b — Congelamiento (fetch propio en tab persistente):** ✅ MITIGADO. La paleta NO monta un `useEffect` de un disparo en un tab persistente: el fetch corre en un `useEffect([query, visible])` gated por `visible` (`CoachSearchPalette.tsx:69-102`) y se resetea al cerrar (`:59-66`). Como el overlay se abre on-demand (Modal), cada apertura re-evalua. Sin fetch congelado. Sin accion.
- **6c — Fabric 45798 (estilo condicional por focus en wrapper de TextInput):** ⚠️ VIGILAR. Hoy el TextInput NO tiene estilo condicional por focus en su wrapper (`CommandPalette.tsx:154-177` — el `View.field` es estatico). El fix P2 "input sin estado focus" (§5) NO debe implementarse como estilo condicional en el `View` wrapper por `isFocused`; debe pintarse estatico (el campo esta siempre autofocado) o aplicarse al propio TextInput. **Si otra unidad toca `CommandPalette` para este fix, anotar el gotcha.**
- **6d — Claves de dia:** N/A (sin fechas, §6).
- **6e — Notificaciones locales:** N/A.

---

## 9. Estado RN actual — divergencias y PENDIENTE-DECISION-CEO

**Divergencias de gesto/flujo (regla 8 — NO auto-sancionadas):**
- **Overlay Modal full-screen vs dropdown inline** (`CommandPalette.tsx:140` vs `CoachGlobalSearch.tsx:244`): cambio de patron inherente a touch, ya establecido en la primitiva DS E0. Documentado, es la norma del port.
- **Boton limpiar (X) NO cierra el overlay en RN** vs web que cierra el dropdown (`CommandPalette.tsx:179-183` vs `CoachGlobalSearch.tsx:229-241`): en touch limpiar deja el overlay abierto en idle (razonable — el usuario quiere re-buscar). **PENDIENTE-DECISION-CEO menor** si se quiere paridad exacta.
- **Enter/submit no selecciona** (§5, `ola0:9222-9228`): en web Enter navega al primer resultado; en touch el `returnKeyType="search"` no hace nada. Cambio de gesto → **PENDIENTE-DECISION-CEO**: ¿cablear `onSubmitEditing`→primer item (paridad) o dejar solo tap? (requiere que `CommandPalette` exponga el handler — otra unidad).
- **Timing del spinner** (§5): feedback ~250ms mas temprano en RN. **PENDIENTE-DECISION-CEO** (segundo auditor lo llama defendible).

**Funcionalidad RN existente a PRESERVAR (no eliminar — regla 2):**
- Boton **Cancelar** (`CommandPalette.tsx:192-196`), **idle-hint** (`CoachSearchPalette.tsx:155`), reset-al-cerrar (`:59-66`), autofocus 120ms (`CommandPalette.tsx:124-128`), `keyboardShouldPersistTaps="handled"` + `keyboardDismissMode="on-drag"` (`CommandPalette.tsx:220-221`). Son adaptaciones touch legitimas.

**Divergencias P1 de navegacion (bugs reales, corregibles):**
- Ejercicio `?q=` ignorado por el destino (§5) — fix en `ejercicios.tsx` (cambiosShell).
- Programa pierde `programId`/plantilla (§5) — fix editable en `CoachSearchPalette.tsx:38-41,130-133`.

---

## 10. Accesibilidad
- Web: combobox APG completo — `role=combobox aria-autocomplete=list aria-expanded aria-controls aria-activedescendant aria-label` (`:210-215`); listbox `role=listbox aria-label` (`:261-262`); grupos `role=group aria-label` (`:269`); opciones `role=option aria-selected` (`:284-285`); X `aria-label="Limpiar"` (`:237`).
- RN: `accessibilityLabel` en trigger (`CoachDashboardSections.tsx:1812`), en X `"Limpiar"` (`CommandPalette.tsx:185`), en Cancelar `"Cerrar"` (`:192`), filas `accessibilityRole="button" accessibilityLabel={item.label}` (`Row` `:268-269`). **FALTA `accessibilityLabel` en el TextInput** (P2 Ola0 §5, fix en `CommandPalette`).

---

## 11. Veredicto de la unidad
La paleta RN ya esta cableada y estructuralmente 1:1 con web (mismo endpoint/scope/cap 5/estados/highlight/grupos verbatim). Los gotchas de clase 6a/6b/6c estan CUMPLIDOS/mitigados (Modal nativo, fetch gated por visible, sin estilo focus condicional en wrapper). El trabajo pendiente es de **pulido**: 3 fixes editables aqui (placeholder verbatim, timing spinner, parseo `programId`) y el resto de P2 de UI que viven en `CommandPalette.tsx`/`ejercicios.tsx` → **cambiosShell**. Dos gestos (Enter/submit, X-cierra-overlay) y el timing del spinner quedan como **PENDIENTE-DECISION-CEO**.
